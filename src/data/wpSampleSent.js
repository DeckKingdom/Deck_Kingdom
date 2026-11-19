// Ops → website write-back for sample requests. Samples that came in from the
// /sample-request/ form carry ids like web-s-r123, where 123 is the row on the
// WordPress Sample Requests page. When one of those gets marked dispatched in
// ops, we tell WordPress to mark the same request "Sent" (via the
// wp-sample-sent edge function, which holds the shared secret). Best-effort:
// if the website can't be reached, ops carries on and just logs it.
import { getSupabase } from "./supabaseClient.js";

const SR = /^web-s-r(\d+)$/;

// map of website-form samples -> dispatched yes/no, for spotting transitions
export const wpSampleStates = (samples) => {
  const m = new Map();
  (samples || []).forEach((s) => {
    const hit = SR.exec(String(s.id || ""));
    if (hit) m.set(Number(hit[1]), !!String(s.dispatchedDate || "").trim());
  });
  return m;
};

export async function notifyWpSamplesSent(srIds) {
  const ids = (srIds || []).filter(Boolean);
  if (!ids.length) return;
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.functions.invoke("wp-sample-sent", { body: { ids } });
    if (error) throw error;
    try { console.log("[dk-wp] website sample requests marked sent:", ids.join(", "), data); } catch (e) { /* */ }
  } catch (e) {
    try { console.warn("[dk-wp] couldn't mark sample request(s) " + ids.join(", ") + " sent on the website: " + ((e && e.message) || e)); } catch (e2) { /* */ }
  }
}
