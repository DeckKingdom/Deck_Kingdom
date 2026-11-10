// Ticking tasks off from the phone app, without saving the whole CRM: writes task_log rows directly.
// (Local preview keeps them in the in-browser CRM copy.)
import { storageMode } from "./storage.js";
import { getSupabase } from "./supabaseClient.js";
import { crmStorage } from "./crmStorage.js";
import { normaliseCrm, setTaskDone } from "../lib/crmCore.js";
import { uid } from "../lib/core.js";

// perUser: daily items are ticked per person; a scheduled occurrence once by anyone
export async function tickTask({ taskId, period, who, done, perUser }) {
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    if (done) {
      const { error } = await sb.from("task_log").upsert({ id: uid(), task_id: taskId, period, done_by: who || "", done_at: new Date().toISOString(), position: 0 });
      if (error) throw error;
      return;
    }
    let q = sb.from("task_log").delete().eq("task_id", taskId).eq("period", period);
    if (perUser) q = q.ilike("done_by", who || "");
    const { error } = await q;
    if (error) throw error;
    return;
  }
  const r = await crmStorage.get("dk-crm");
  const c = normaliseCrm(r && r.value ? JSON.parse(r.value) : {});
  setTaskDone(c, taskId, period, who, done);
  await crmStorage.set("dk-crm", JSON.stringify(c));
}
