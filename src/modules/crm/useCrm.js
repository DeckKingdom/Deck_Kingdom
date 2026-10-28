// CRM data lifecycle: lazy load on first CRM tab visit, debounced autosave,
// dirty flag so a failed load can never overwrite good data with seed state.
import { useState, useEffect, useRef } from "react";
import { crmStorage } from "../../data/crmStorage.js";
import { emptyCrm, normaliseCrm } from "../../lib/crmCore.js";

export function useCrm(enabled) {
  const [crm, setCrm] = useState(null);
  const [crmError, setCrmError] = useState(false);
  const [crmSave, setCrmSave] = useState("");
  const loaded = useRef(false);
  const loading = useRef(false);
  const dirty = useRef(false);
  const timer = useRef(null);

  const loadCrm = async () => {
    if (loading.current) return;
    loading.current = true;
    setCrmError(false);
    let d = null;
    try {
      const r = await crmStorage.get("dk-crm");
      if (r && r.value) d = JSON.parse(r.value);
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

  useEffect(() => {
    if (!loaded.current || !crm || !dirty.current) return;
    setCrmSave("Saving…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await crmStorage.set("dk-crm", JSON.stringify(crm));
        setCrmSave("Saved");
      } catch (e) {
        setCrmSave("Save failed — will retry on next change");
      }
    }, 600);
  }, [crm]);

  const updateCrm = (fn) => {
    dirty.current = true;
    setCrm((d) => fn(JSON.parse(JSON.stringify(d))));
  };

  // Used by restore: replace everything and mark dirty so it persists.
  const replaceCrm = (d) => {
    dirty.current = true;
    loaded.current = true;
    setCrm(normaliseCrm(d));
  };

  return { crm, updateCrm, replaceCrm, crmError, loadCrm, crmSave };
}
