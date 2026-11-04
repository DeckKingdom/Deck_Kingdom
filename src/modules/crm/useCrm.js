// CRM data lifecycle: lazy load on first CRM tab visit, debounced autosave,
// dirty flag so a failed load can never overwrite good data with seed state.
// Live refresh: every few seconds a tiny check asks whether anyone else (FileMaker, the website,
// another member of staff) has changed something; if so, and nobody here is mid-edit, the data
// is quietly reloaded so the screens show it without a page refresh.
import { useState, useEffect, useRef } from "react";
import { crmStorage, latestChange } from "../../data/crmStorage.js";
import { getSessionEmail } from "../../data/auth.js";
import { emptyCrm, normaliseCrm } from "../../lib/crmCore.js";

const CHECK_MS = 10_000; // how often to look for changes made elsewhere
const QUIET_MS = 8_000; // wait this long after the last edit here before reloading

export function useCrm(enabled) {
  const [crm, setCrm] = useState(null);
  const [crmError, setCrmError] = useState(false);
  const [crmSave, setCrmSave] = useState("");
  const [lastLive, setLastLive] = useState(null); // when changes from elsewhere were last pulled in
  const loaded = useRef(false);
  const loading = useRef(false);
  const dirty = useRef(false);
  const pending = useRef(false); // an edit here that hasn't saved yet
  const saving = useRef(false);
  const lastEdit = useRef(0);
  const seen = useRef(0); // newest change from elsewhere already loaded
  const timer = useRef(null);

  const fetchCrm = async () => {
    const r = await crmStorage.get("dk-crm");
    return r && r.value ? JSON.parse(r.value) : null;
  };

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

  useEffect(() => {
    if (!loaded.current || !crm || !dirty.current || !pending.current) return;
    setCrmSave("Saving…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      saving.current = true;
      pending.current = false;
      try {
        await crmStorage.set("dk-crm", JSON.stringify(crm));
        setCrmSave("Saved");
      } catch (e) {
        pending.current = true;
        setCrmSave("Save failed — will retry on next change");
      } finally {
        saving.current = false;
      }
    }, 600);
  }, [crm]);

  const updateCrm = (fn) => {
    dirty.current = true;
    pending.current = true;
    lastEdit.current = Date.now();
    setCrm((d) => fn(JSON.parse(JSON.stringify(d))));
  };

  // Used by restore: replace everything and mark dirty so it persists.
  const replaceCrm = (d) => {
    dirty.current = true;
    pending.current = true;
    loaded.current = true;
    lastEdit.current = Date.now();
    setCrm(normaliseCrm(d));
  };

  return { crm, updateCrm, replaceCrm, crmError, loadCrm, crmSave, lastLive };
}
