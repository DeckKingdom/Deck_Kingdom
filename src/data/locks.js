// Soft, self-expiring record locks — "being edited by …".
// The editor's browser claims a row and refreshes it every 20 seconds; everyone
// else sees that record view-only until it's released. A lock goes stale after
// 45 seconds without a heartbeat, so a closed laptop or crashed tab can never
// hold a job hostage. Locks fail OPEN: if the table is missing (migration 059
// not run) or the network hiccups, editing just works like before.
import { getSupabase } from "./supabaseClient.js";
import { storageMode } from "./storage.js";
import { getSessionEmail } from "./auth.js";

const STALE_MS = 45_000;
let ready = true; // flips off quietly if the record_locks table isn't there yet

export async function claimLock(key) {
  if (storageMode !== "supabase" || !ready || !key) return { ok: true, holder: "" };
  try {
    const sb = await getSupabase();
    const me = getSessionEmail() || "";
    const { data, error } = await sb.from("record_locks").select("actor,at").eq("id", key).limit(1);
    if (error) {
      if (/record_locks/i.test(String(error.message))) ready = false;
      return { ok: true, holder: "" };
    }
    const r = data && data[0];
    if (r && r.actor && r.actor !== me && Date.now() - new Date(r.at).getTime() < STALE_MS) {
      return { ok: false, holder: r.actor };
    }
    await sb.from("record_locks").upsert({ id: key, actor: me, at: new Date().toISOString() });
    return { ok: true, holder: me };
  } catch (e) {
    return { ok: true, holder: "" };
  }
}

export async function releaseLock(key) {
  if (storageMode !== "supabase" || !ready || !key) return;
  try {
    const sb = await getSupabase();
    const me = getSessionEmail() || "";
    await sb.from("record_locks").delete().eq("id", key).eq("actor", me);
  } catch (e) {
    /* the 45-second stale rule cleans up after us */
  }
}
