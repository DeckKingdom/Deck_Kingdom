// Google Analytics numbers for the Home screen, via the "ga-stats" edge function.
import { getSupabase } from "./supabaseClient.js";
import { storageMode } from "./storage.js";

export const analyticsReady = storageMode === "supabase";

export async function fetchGaStats() {
  const sb = await getSupabase();
  const { data, error } = await sb.functions.invoke("ga-stats", { body: {} });
  if (error) {
    let j = null;
    try { j = await error.context.json(); } catch { /* not json */ }
    if (j && j.error) throw new Error(j.error);
    throw new Error(/Failed to send a request|404|not found/i.test(String(error.message))
      ? "The ga-stats function isn't deployed in Supabase yet." : String(error.message || error));
  }
  if (data && data.setup) { const e = new Error(data.error); e.setup = true; throw e; }
  return data;
}
