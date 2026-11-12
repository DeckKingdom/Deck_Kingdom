// "My tasks" on the phone app: today's daily list, scheduled jobs that are due, and projects -
// the same tasks the office sets in Tasks, ticked off here.
import { useState } from "react";
import { uid } from "../lib/core.js";
import { NAVY, GOLD, RED, prettyDate } from "../lib/core.js";
import { today, dailyTasksFor, isDailyDone, dueScheduledFor, projectsFor, setTaskDone, blankTask, staffName } from "../lib/crmCore.js";
import { tickTask, addTask, setProjectStatus } from "../data/taskTicks.js";

// outstanding: due scheduled jobs + today's daily items not yet ticked (for the tab's count)
export const tasksOutstanding = (crm, who) => {
  if (!crm || !who) return 0;
  const d = today();
  return dueScheduledFor(crm, who, d).length + dailyTasksFor(crm, who, d).filter((t) => !isDailyDone(crm, t, d, who)).length + projectsFor(crm, who).length;
};

export default function DriverTasks({ crm, who, setCrm, full, canAdd }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const addBtn = canAdd && who ? (
    <button type="button" onClick={() => setAdding(true)} style={{ width: "100%", marginBottom: 12, border: "1.5px dashed " + GOLD, background: "#fff8e6", color: NAVY, borderRadius: 14, padding: 13, fontFamily: "inherit", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>+ New task</button>
  ) : null;
  const sheet = adding ? <NewTask crm={crm} who={who} onClose={() => setAdding(false)} onSaved={(t) => { setCrm((c) => ({ ...c, tasks: [...(c.tasks || []), t] })); setAdding(false); }} /> : null;
  if (!crm) return full ? <div style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 16, padding: "22px 16px", textAlign: "center", color: "#5a6a85", fontWeight: 700 }}>Loading your tasks…</div> : null;
  if (!who) return full ? <div style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 16, padding: 16, color: "#5a6a85", fontWeight: 600 }}>This device isn't linked to anyone's tasks — in ops, open Users &amp; access and set the <b>Driver name</b> on your login so it matches the name this phone uses.</div> : null;
  const d = today();
  const daily = dailyTasksFor(crm, who, d);
  const due = dueScheduledFor(crm, who, d);
  const projects = projectsFor(crm, who);
  if (!daily.length && !due.length && !projects.length) return full ? <>{addBtn}{sheet}<div style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 16, padding: "22px 16px", textAlign: "center", color: "#5a6a85", fontWeight: 700 }}>✓ Nothing on your list today</div></> : null;
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
  const doneProject = async (t) => {
    const next = t.status === "Done" ? "To do" : "Done";
    setBusy(t.id); setErr("");
    const apply = (st) => setCrm((c) => ({ ...c, tasks: (c.tasks || []).map((x) => (x.id === t.id ? { ...x, status: st } : x)) }));
    apply(next);
    try { await setProjectStatus(t.id, next); } catch (e) { apply(t.status); setErr("Couldn't save that — check your signal and try again."); }
    setBusy("");
  };
  const others = (t) => (t.assignees || []).filter((a) => a.toLowerCase() !== String(who).toLowerCase()).map((a) => staffName(crm, a));
  return (
    <>{addBtn}{sheet}
    <div style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 16, padding: "12px 14px", marginTop: full ? 0 : 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ flex: 1, fontSize: 17, color: NAVY }}>My tasks</b>
        {daily.length > 0 && <span style={{ fontSize: 12.5, fontWeight: 800, color: doneDaily === daily.length ? "#28713e" : "#8a5a00" }}>{doneDaily}/{daily.length} done today</span>}
      </div>
      {err && <div style={{ marginTop: 6, color: RED, fontWeight: 700, fontSize: 13 }}>{err}</div>}
      {due.length > 0 && <>{head("Due")}{due.map(({ task: t, occ, overdueDays }) => row(t.id, false, (t.priority === "High" ? "❗ " : "") + t.title, (overdueDays > 0 ? "Due " + prettyDate(occ.date) + " · " + overdueDays + " day" + (overdueDays === 1 ? "" : "s") + " late" : "Due today") + (t.priority === "High" ? " · high priority" : ""), () => tick(t, occ.date, true, false), overdueDays > 0 || t.priority === "High" ? RED : "#8a5a00"))}</>}
      {daily.length > 0 && <>{head("Today")}{daily.map((t) => { const on = isDailyDone(crm, t, d, who); const w = others(t); return row(t.id, on, (t.priority === "High" && !on ? "❗ " : "") + t.title, [t.priority === "High" ? "high priority" : t.priority === "Low" ? "low priority" : "", w.length ? "with " + w.join(", ") : "", t.notes || ""].filter(Boolean).join(" · "), () => tick(t, d, !on, true), t.priority === "High" && !on ? RED : undefined); })}</>}
      {projects.length > 0 && <>{head("Jobs")}{projects.map((t) => { const w = others(t); return row(t.id, t.status === "Done", (t.priority === "High" ? "❗ " : "") + t.title, [t.status !== "To do" ? t.status : "", t.dueDate ? "by " + prettyDate(t.dueDate) : "", w.length ? "with " + w.join(", ") : "", t.priority === "High" ? "high priority" : ""].filter(Boolean).join(" · "), () => doneProject(t), t.priority === "High" ? RED : undefined); })}</>}
    </div>
    </>
  );
}

// first names left off the "who's doing it" list on the phone
const NOT_ON_PHONE_TASKS = ["martin"];

// ===== a new task from the phone: just me, or a joint task with others =====
function NewTask({ crm, who, onClose, onSaved }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [when, setWhen] = useState("today"); // today | daily | job
  const [due, setDue] = useState("");
  const [people, setPeople] = useState([String(who).toLowerCase()]);
  const [priority, setPriority] = useState("Normal");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const lc = (x) => String(x || "").toLowerCase();
  // people who can't be given tasks from the phone
  const hidden = (s) => NOT_ON_PHONE_TASKS.includes(lc(String(s.name || "").split(" ")[0])) || NOT_ON_PHONE_TASKS.includes(lc(s.driverName));
  const staff = [...new Map([{ email: who }, ...((crm.staff || []).filter((s) => s.email && s.role !== "none" && !hidden(s)))].map((s) => [lc(s.email), s])).values()];
  const toggle = (e) => setPeople((l) => (l.includes(e) ? (l.length > 1 ? l.filter((x) => x !== e) : l) : [...l, e]));
  const ok = title.trim().length > 1 && people.length > 0;
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr("");
    const t = { ...blankTask(when === "job" ? "project" : "daily"), id: uid(), title: title.trim(), notes: notes.trim(), assignees: people,
      repeat: when === "daily" ? "workdays" : "once", onDate: today(), dueDate: when === "job" ? due : "", createdBy: who, created: today(), priority };
    try { await addTask(t); onSaved(t); } catch (e) { setErr("Couldn't save it — " + ((e && e.message) || e)); }
    setBusy(false);
  };
  const field = { width: "100%", boxSizing: "border-box", border: "1px solid #d5d9e0", borderRadius: 10, padding: "12px", fontFamily: "inherit", fontSize: 16, color: NAVY };
  const lbl = { display: "block", fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: "#8593a8", margin: "14px 0 6px" };
  const pill = (on) => ({ border: "1px solid " + (on ? NAVY : "#d5d9e0"), background: on ? NAVY : "#fff", color: on ? "#fff" : NAVY, borderRadius: 99, padding: "9px 14px", fontFamily: "inherit", fontWeight: 800, fontSize: 14, cursor: "pointer" });
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(11,31,63,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", borderRadius: "18px 18px 0 0", padding: "18px 16px 24px", boxSizing: "border-box", fontFamily: "Quicksand, sans-serif", color: NAVY }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>New task</div>
        <span style={lbl}>What needs doing?</span>
        <input autoFocus style={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Re-stack the cladding bay" />
        <span style={lbl}>Notes (optional)</span>
        <textarea style={{ ...field, minHeight: 60, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <span style={lbl}>When</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[["today", "Today"], ["daily", "Every working day"], ["job", "A job (no set day)"]].map(([k, l]) => <button key={k} type="button" onClick={() => setWhen(k)} style={pill(when === k)}>{l}</button>)}
        </div>
        <span style={lbl}>Priority</span>
        <div style={{ display: "flex", gap: 6 }}>
          {["Low", "Normal", "High"].map((p) => { const on = priority === p, col = p === "High" ? RED : p === "Low" ? "#8593a8" : "#a07a10"; return <button key={p} type="button" onClick={() => setPriority(p)} style={{ ...pill(on), flex: 1, background: on ? col : "#fff", borderColor: on ? col : "#d5d9e0" }}>{p}</button>; })}
        </div>
        {when === "job" && <><span style={lbl}>Done by (optional)</span><input type="date" style={field} value={due} onChange={(e) => setDue(e.target.value)} /></>}
        <span style={lbl}>Who's doing it? <span style={{ textTransform: "none", fontWeight: 600 }}>— pick more than one for a joint task</span></span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {staff.map((s) => { const e = lc(s.email); const on = people.includes(e); return <button key={e} type="button" onClick={() => toggle(e)} style={pill(on)}>{on ? "✓ " : ""}{e === lc(who) ? "Me" : staffName(crm, s.email)}</button>; })}
        </div>
        {err && <div style={{ marginTop: 10, color: RED, fontWeight: 700 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, border: "1px solid #d5d9e0", background: "#fff", borderRadius: 12, padding: 14, fontFamily: "inherit", fontWeight: 800, color: NAVY, cursor: "pointer" }}>Cancel</button>
          <button type="button" disabled={!ok || busy} onClick={save} style={{ flex: 2, border: "none", background: ok ? GOLD : "#e6e9ef", color: NAVY, borderRadius: 12, padding: 14, fontFamily: "inherit", fontWeight: 800, fontSize: 16, cursor: ok ? "pointer" : "default" }}>{busy ? "Saving…" : "Add task"}</button>
        </div>
      </div>
    </div>
  );
}
