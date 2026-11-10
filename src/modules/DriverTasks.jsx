// "My tasks" on the phone app: today's daily list, scheduled jobs that are due, and projects -
// the same tasks the office sets in Tasks, ticked off here.
import { useState } from "react";
import { NAVY, GOLD, RED, prettyDate } from "../lib/core.js";
import { today, dailyTasksFor, isDailyDone, dueScheduledFor, projectsFor, setTaskDone } from "../lib/crmCore.js";
import { tickTask } from "../data/taskTicks.js";

// outstanding: due scheduled jobs + today's daily items not yet ticked (for the tab's count)
export const tasksOutstanding = (crm, who) => {
  if (!crm || !who) return 0;
  const d = today();
  return dueScheduledFor(crm, who, d).length + dailyTasksFor(crm, who, d).filter((t) => !isDailyDone(crm, t, d, who)).length;
};

export default function DriverTasks({ crm, who, setCrm, full }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  if (!crm) return null;
  if (!who) return full ? <div style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 16, padding: 16, color: "#5a6a85", fontWeight: 600 }}>This login isn't linked to anyone's tasks.</div> : null;
  const d = today();
  const daily = dailyTasksFor(crm, who, d);
  const due = dueScheduledFor(crm, who, d);
  const projects = projectsFor(crm, who).slice(0, 6);
  if (!daily.length && !due.length && !projects.length) return full ? <div style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 16, padding: "22px 16px", textAlign: "center", color: "#5a6a85", fontWeight: 700 }}>✓ Nothing on your list today</div> : null;
  const doneDaily = daily.filter((t) => isDailyDone(crm, t, d, who)).length;

  const tick = async (t, period, done, perUser) => {
    setBusy(t.id); setErr("");
    // show it straight away, undo if the save fails
    const apply = (on) => setCrm((c) => { const x = { ...c, taskLog: [...(c.taskLog || [])] }; setTaskDone(x, t.id, period, who, on); return x; });
    apply(done);
    try { await tickTask({ taskId: t.id, period, who, done, perUser }); } catch (e) { apply(!done); setErr("Couldn't save that tick — check your signal and try again."); }
    setBusy("");
  };
  const row = (key, on, title, sub, onClick, tone) => (
    <button key={key} type="button" disabled={busy === key} onClick={onClick}
      style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", border: "none", borderTop: "1px solid #f0f2f6", background: "none", padding: "11px 0", fontFamily: "inherit", color: NAVY, textAlign: "left", cursor: "pointer", opacity: busy === key ? 0.5 : 1 }}>
      <span style={{ width: 26, height: 26, flex: "none", borderRadius: 8, border: "2px solid " + (on ? "#3FA55C" : "#c4cbd6"), background: on ? "#3FA55C" : "#fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>{on ? "✓" : ""}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700, fontSize: 15, textDecoration: on ? "line-through" : "none", color: on ? "#8593a8" : NAVY }}>{title}</span>
        {sub && <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: tone || "#8593a8" }}>{sub}</span>}
      </span>
    </button>
  );
  const head = (t, n) => <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: "#8593a8", margin: "12px 0 2px" }}>{t}{n ? " · " + n : ""}</div>;
  return (
    <div style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 16, padding: "12px 14px", marginTop: full ? 0 : 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ flex: 1, fontSize: 17, color: NAVY }}>My tasks</b>
        {daily.length > 0 && <span style={{ fontSize: 12.5, fontWeight: 800, color: doneDaily === daily.length ? "#28713e" : "#8a5a00" }}>{doneDaily}/{daily.length} done today</span>}
      </div>
      {err && <div style={{ marginTop: 6, color: RED, fontWeight: 700, fontSize: 13 }}>{err}</div>}
      {due.length > 0 && <>{head("Due")}{due.map(({ task: t, occ, overdueDays }) => row(t.id, false, t.title, overdueDays > 0 ? "Due " + prettyDate(occ.date) + " · " + overdueDays + " day" + (overdueDays === 1 ? "" : "s") + " late" : "Due today", () => tick(t, occ.date, true, false), overdueDays > 0 ? RED : "#8a5a00"))}</>}
      {daily.length > 0 && <>{head("Today")}{daily.map((t) => { const on = isDailyDone(crm, t, d, who); return row(t.id, on, t.title, t.notes || "", () => tick(t, d, !on, true)); })}</>}
      {projects.length > 0 && <>{head("Projects")}{projects.map((t) => (
        <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "center", borderTop: "1px solid #f0f2f6", padding: "10px 0" }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, flex: "none", background: t.priority === "High" ? RED : t.priority === "Low" ? "#c4cbd6" : GOLD }} />
          <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14.5, color: NAVY }}>{t.title}
            <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#8593a8" }}>{t.status}{t.dueDate ? " · by " + prettyDate(t.dueDate) : ""}</span>
          </span>
        </div>
      ))}</>}
    </div>
  );
}
