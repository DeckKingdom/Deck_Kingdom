// CRM data lifecycle: lazy load on first CRM tab visit, debounced autosave,
// dirty flag so a failed load can never overwrite good data with seed state.
// Live refresh: every few seconds a tiny check asks whether anyone else (FileMaker, the website,
// another member of staff) has changed something; if so, and nobody here is mid-edit, the data
// is quietly reloaded so the screens show it without a page refresh.
import { useState, useEffect, useRef } from "react";
import { crmStorage, latestChange, storageMode } from "../../data/crmStorage.js";
import { getSupabase } from "../../data/supabaseClient.js";
import { getSessionEmail } from "../../data/auth.js";
import { readCrmCache, writeCrmCache } from "../../data/crmCache.js";
import { emptyCrm, normaliseCrm, carryRidingCollections } from "../../lib/crmCore.js";

// Instant open (paint the device's cached copy while the live load runs) is
// built and tested but OFF for now — Jon wants to see raw server speed first.
// Flip to true to turn it back on everywhere.
export const INSTANT_OPEN = false;

const CHECK_MS = 4_000; // how often to look for changes made elsewhere
const QUIET_MS = 5_000; // wait this long after the last edit here before reloading

export function useCrm(enabled) {
  const [crm, setCrm] = useState(null);
  const [crmError, setCrmError] = useState(false);
  const [crmSave, setCrmSave] = useState("");
  const [saveError, setSaveError] = useState(""); // why the last save failed (shown as a red banner)
  const retry = useRef(null);
  const [saveNotice, setSaveNotice] = useState(""); // e.g. a job number the database had to change
  const noticeT = useRef(null);
  const [lastLive, setLastLive] = useState(null); // when changes from elsewhere were last pulled in
  const loaded = useRef(false);
  const loading = useRef(false);
  const dirty = useRef(false);
  const pending = useRef(false); // an edit here that hasn't saved yet
  const saving = useRef(false);
  const lastEdit = useRef(0);
  const seen = useRef(0); // newest change from elsewhere already loaded
  const timer = useRef(null);
  // instant open: null = undecided, true = showing the device's cached copy
  // (read-only), false = live data has landed
  const [crmStale, setCrmStale] = useState(false);
  const stale = useRef(null);
  const rawRef = useRef(""); // the last fetched JSON, kept to refresh the device cache cheaply

  const commitRef = useRef(null);
  const fetchCrm = async () => {
    const r = await crmStorage.get("dk-crm");
    commitRef.current = r && r.commit ? r.commit : null;
    if (r && r.value) rawRef.current = r.value;
    return r && r.value ? JSON.parse(r.value) : null;
  };
  // the data just fetched is now what's on screen: make it the baseline for the next save
  const adopt = () => { if (commitRef.current) commitRef.current(); commitRef.current = null; };

  // Background fill after a quick first paint: fetch the full book and swap it
  // in the moment nothing here is unsaved — if the user got editing straight
  // away, just try again shortly. Keeps retrying until the full data lands.
  const fillT = useRef(null);
  const scheduleFill = (ms = 200) => {
    if (fillT.current) clearTimeout(fillT.current);
    fillT.current = setTimeout(async () => {
      if (pending.current || saving.current || loading.current) return scheduleFill(2_000);
      loading.current = true;
      const editsAtStart = lastEdit.current;
      try {
        const d = await fetchCrm(); // the whole book this time
        if (d && !pending.current && !saving.current && lastEdit.current === editsAtStart) {
          adopt();
          setCrm(normaliseCrm(d));
          if (INSTANT_OPEN && storageMode === "supabase") writeCrmCache(rawRef.current); // the device cache gets the full book too
        } else {
          scheduleFill(2_000); // they started editing mid-fetch — this copy may be stale
        }
      } catch (e) {
        scheduleFill(5_000);
      } finally {
        loading.current = false;
      }
    }, ms);
  };
  useEffect(() => () => { if (fillT.current) clearTimeout(fillT.current); }, []);

  const loadCrm = async () => {
    if (loading.current) return;
    loading.current = true;
    setCrmError(false);
    // instant paint: whatever this device loaded last time goes on screen at
    // once (read-only — updateCrm ignores edits while it shows) while the live
    // load runs. The guard on stale.current means a slow cache read can never
    // overwrite live data that beat it here.
    if (INSTANT_OPEN && storageMode === "supabase" && !loaded.current) {
      readCrmCache().then((c) => {
        if (c && c.value && !loaded.current && stale.current === null) {
          stale.current = true;
          setCrmStale(true);
          setCrm(normaliseCrm(JSON.parse(c.value)));
        }
      }).catch(() => {});
    }
    let d = null, partial = false;
    try {
      seen.current = await latestChange(getSessionEmail()).catch(() => seen.current);
      // quick first paint: the hot slice of the data in one round trip (supabase
      // only; falls back to the full load if the quick path isn't available)
      if (storageMode === "supabase") {
        const q = await crmStorage.get("dk-crm-quick").catch(() => null);
        if (q && q.value) {
          d = JSON.parse(q.value);
          commitRef.current = q.commit || null;
          partial = !!q.partial;
          rawRef.current = q.value;
        }
      }
      if (!d) d = await fetchCrm();
    } catch (e) {
      const msg = String(e && e.message ? e.message : e).toLowerCase();
      const isEmpty = msg.includes("not found") || msg.includes("no such") || msg.includes("404");
      if (!isEmpty) {
        setCrmError(true);
        loading.current = false;
        return;
      }
    }
    stale.current = false; // live data from here on: cached copy stands down, edits allowed
    setCrmStale(false);
    adopt();
    setCrm(normaliseCrm(d || emptyCrm()));
    loaded.current = true;
    loading.current = false;
    if (INSTANT_OPEN && storageMode === "supabase") writeCrmCache(rawRef.current); // next open paints instantly
    if (partial) scheduleFill(); // pull the rest of the history in behind the paint
  };

  useEffect(() => {
    if (enabled && !loaded.current) loadCrm();
  }, [enabled]);

  // live refresh
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const check = async () => {
      if (stop || !loaded.current || loading.current || document.hidden) return;
      let id = 0;
      try { id = await latestChange(getSessionEmail()); } catch (e) { return; }
      if (!id || id <= seen.current) return;
      // Something changed elsewhere: reload once nothing here is unsaved or mid-edit.
      // (A cursor merely parked in a field must NOT block this — it used to, which is
      // why other people's new jobs and run changes took ages to appear, or never did.)
      if (pending.current || saving.current || Date.now() - lastEdit.current < QUIET_MS) return;
      loading.current = true;
      try {
        const d = await fetchCrm();
        if (!stop && d && !pending.current && !saving.current) {
          seen.current = id;
          adopt();
          setCrm(normaliseCrm(d));
          setLastLive(new Date());
          if (INSTANT_OPEN && storageMode === "supabase") writeCrmCache(rawRef.current); // keep the instant-open copy current
        }
      } catch (e) {
        /* try again next time */
      } finally {
        loading.current = false;
      }
    };
    const t = setInterval(check, CHECK_MS); // fallback poll, in case the push channel drops
    const vis = () => { if (!document.hidden) check(); };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("focus", vis);

    // PUSH: the database tells every open screen the instant anyone commits a
    // change (every change writes an audit row, and that table is published
    // over Realtime by migration 060). A save writes several rows at once, so
    // the reload is debounced a touch to run once per burst.
    let ch = null, burst = null;
    if (storageMode === "supabase") {
      (async () => {
        try {
          const sb = await getSupabase();
          ch = sb
            .channel("dk-live-changes")
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_log" }, (payload) => {
              const r = (payload && payload.new) || {};
              if (r.actor && r.actor === (getSessionEmail() || "")) return; // our own save echoing back
              if (r.record_id === "fmBridgeLast" || r.record_id === "wooBridgeLast") return; // bridge heartbeats
              if (burst) clearTimeout(burst);
              burst = setTimeout(check, 250);
            })
            .subscribe();
        } catch (e) { /* no realtime (060 not run, or offline): the poll still covers it */ }
      })();
    }
    return () => {
      stop = true; clearInterval(t); if (burst) clearTimeout(burst);
      document.removeEventListener("visibilitychange", vis); window.removeEventListener("focus", vis);
      try { if (ch) ch.unsubscribe(); } catch (e) { /* already gone */ }
    };
  }, [enabled]);

  // someone else got that job number first: the database gave this job the next free one - show it here
  const applyRenumbered = (list) => {
    if (!list || !list.length) return;
    setCrm((d) => {
      if (!d) return d;
      const n = { ...d, invoices: d.invoices.map((i) => { const r = list.find((x) => x.id === i.id); return r ? { ...i, invNo: r.to } : i; }) };
      const top = Math.max(...list.map((r) => r.to));
      n.numbering = { ...(d.numbering || {}), invoice: Math.max(Number((d.numbering || {}).invoice) || 1, top + 1) };
      return n;
    });
    setSaveNotice(list.map((r) => "Job #" + r.from + " was just taken by someone else, so this job is now #" + r.to + ".").join(" "));
    if (noticeT.current) clearTimeout(noticeT.current);
    noticeT.current = setTimeout(() => setSaveNotice(""), 20_000);
  };

  // account numbers the database gave out / changed: just show them
  const applyAccountNos = (list) => {
    if (!list || !list.length) return;
    setCrm((d) => (d ? { ...d, customers: d.customers.map((c) => { const r = list.find((x) => x.id === c.id); return r ? { ...c, accountNo: r.to } : c; }) } : d));
  };

  useEffect(() => {
    if (!loaded.current || !crm || !dirty.current || !pending.current) return;
    setCrmSave("Saving…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      saving.current = true;
      pending.current = false;
      try {
        const res = await crmStorage.set("dk-crm", JSON.stringify(crm));
        applyRenumbered(res && res.renumbered);
        applyAccountNos(res && res.accountNos);
        setCrmSave("Saved");
        setSaveError("");
      } catch (e) {
        pending.current = true;
        applyRenumbered(e && e.renumbered);
        applyAccountNos(e && e.accountNos);
        const msg = String((e && e.message) || e || "unknown error");
        setCrmSave(e && e.partial ? "Partly saved" : "Save failed");
        setSaveError(msg);
        // keep trying on its own - don't wait for the next edit
        if (retry.current) clearTimeout(retry.current);
        retry.current = setTimeout(() => setCrm((d) => (d ? { ...d } : d)), 15_000);
      } finally {
        saving.current = false;
      }
    }, 600);
  }, [crm]);

  // never lose unsaved work to a refresh / closed tab without a warning
  useEffect(() => {
    const warn = (e) => {
      if (pending.current || saving.current) { e.preventDefault(); e.returnValue = ""; return ""; }
      return undefined;
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const updateCrm = (fn) => {
    if (stale.current) return; // looking at the cached copy: edits wait the few seconds until live data lands
    dirty.current = true;
    pending.current = true;
    lastEdit.current = Date.now();
    setCrm((d) => {
      // structuredClone is several times faster than a JSON round-trip, and this
      // clone runs on every single edit — with years of records it's the
      // difference between typing feeling instant and typing feeling sticky
      const next = fn(typeof structuredClone === "function" ? structuredClone(d) : JSON.parse(JSON.stringify(d)));
      carryRidingCollections(d, next); // collection notes follow their job round the schedule
      return next;
    });
  };

  // Used by restore: replace everything and mark dirty so it persists.
  const replaceCrm = (d) => {
    dirty.current = true;
    pending.current = true;
    loaded.current = true;
    lastEdit.current = Date.now();
    stale.current = false;
    setCrmStale(false);
    setCrm(normaliseCrm(d));
  };

  return { crm, updateCrm, replaceCrm, crmError, loadCrm, crmSave, saveError, saveNotice, lastLive, crmStale };
}
