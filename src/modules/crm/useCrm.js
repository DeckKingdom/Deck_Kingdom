// CRM data lifecycle: lazy load on first CRM tab visit, debounced autosave,
// dirty flag so a failed load can never overwrite good data with seed state.
// Live refresh: every few seconds a tiny check asks whether anyone else (FileMaker, the website,
// another member of staff) has changed something; if so, and nobody here is mid-edit, the data
// is quietly reloaded so the screens show it without a page refresh.
import { useState, useEffect, useRef } from "react";
import { crmStorage, latestChange } from "../../data/crmStorage.js";
import { getSessionEmail } from "../../data/auth.js";
import { emptyCrm, normaliseCrm, carryRidingCollections } from "../../lib/crmCore.js";

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

  const commitRef = useRef(null);
  const fetchCrm = async () => {
    const r = await crmStorage.get("dk-crm");
    commitRef.current = r && r.commit ? r.commit : null;
    return r && r.value ? JSON.parse(r.value) : null;
  };
  // the data just fetched is now what's on screen: make it the baseline for the next save
  const adopt = () => { if (commitRef.current) commitRef.current(); commitRef.current = null; };

  const loadCrm = async () => {
    if (loading.current) return;
    loading.current = true;
    setCrmError(false);
    let d = null;
    try {
      seen.current = await latestChange(getSessionEmail()).catch(() => seen.current);
      d = await fetchCrm();
    } catch (e) {
      const msg = String(e && e.message ? e.message : e).toLowerCase();
      const isEmpty = msg.includes("not found") || msg.includes("no such") || msg.includes("404");
      if (!isEmpty) {
        setCrmError(true);
        loading.current = false;
        return;
      }
    }
    adopt();
    setCrm(normaliseCrm(d || emptyCrm()));
    loaded.current = true;
    loading.current = false;
  };

  useEffect(() => {
    if (enabled && !loaded.current) loadCrm();
  }, [enabled]);

  // live refresh
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const busyTyping = () => {
      const el = document.activeElement;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    };
    const check = async () => {
      if (stop || !loaded.current || loading.current || document.hidden) return;
      let id = 0;
      try { id = await latestChange(getSessionEmail()); } catch (e) { return; }
      if (!id || id <= seen.current) return;
      // something changed elsewhere: reload once nothing here is unsaved or being typed
      if (pending.current || saving.current || Date.now() - lastEdit.current < QUIET_MS || busyTyping()) return;
      loading.current = true;
      try {
        const d = await fetchCrm();
        if (!stop && d && !pending.current && !saving.current) {
          seen.current = id;
          adopt();
          setCrm(normaliseCrm(d));
          setLastLive(new Date());
        }
      } catch (e) {
        /* try again next time */
      } finally {
        loading.current = false;
      }
    };
    const t = setInterval(check, CHECK_MS);
    const vis = () => { if (!document.hidden) check(); };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("focus", vis);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", vis); window.removeEventListener("focus", vis); };
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
    dirty.current = true;
    pending.current = true;
    lastEdit.current = Date.now();
    setCrm((d) => {
      const next = fn(JSON.parse(JSON.stringify(d)));
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
    setCrm(normaliseCrm(d));
  };

  return { crm, updateCrm, replaceCrm, crmError, loadCrm, crmSave, saveError, saveNotice, lastLive };
}
