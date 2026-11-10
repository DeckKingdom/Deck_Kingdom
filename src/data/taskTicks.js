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
      const { error } = await sb.from("task_log").insert({ id: uid(), task_id: taskId, period, done_by: who || "", done_at: new Date().toISOString(), position: 0 });
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

// a new task from the phone (one person or several - joint tasks show on each person's list)
export async function addTask(t) {
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const row = {
      id: t.id, kind: t.kind, title: t.title, notes: t.notes || "", repeat: t.repeat || "workdays", on_date: t.onDate || "",
      frequency: t.frequency || "weekly", start_date: t.startDate || "", status: t.status || "To do", priority: t.priority || "Normal",
      due_date: t.dueDate || "", created: t.created || "", created_by: t.createdBy || "",
      assignees: (t.assignees || []).join(","), rotate: false, active: true, weekday: 0, month_day: 1, position: 0,
    };
    const { error } = await sb.from("tasks").insert(row);
    if (error) throw error;
    return;
  }
  const r = await crmStorage.get("dk-crm");
  const c = normaliseCrm(r && r.value ? JSON.parse(r.value) : {});
  c.tasks.push(t);
  await crmStorage.set("dk-crm", JSON.stringify(c));
}

// a job (project) marked done / not done from the phone
export async function setProjectStatus(id, status) {
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { error } = await sb.from("tasks").update({ status }).eq("id", id);
    if (error) throw error;
    return;
  }
  const r = await crmStorage.get("dk-crm");
  const c = normaliseCrm(r && r.value ? JSON.parse(r.value) : {});
  c.tasks.forEach((x) => { if (x.id === id) x.status = status; });
  await crmStorage.set("dk-crm", JSON.stringify(c));
}
