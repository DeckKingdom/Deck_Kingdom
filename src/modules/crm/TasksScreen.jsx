// Tasks: the editor (shared with Home) and the manager screen listing every
// task across the team — daily lists, spare-time projects and the scheduled rota.
import { useState } from "react";
import { NAVY, GOLD, RED, prettyDate } from "../../lib/core.js";
import {
  blankTask, today, TASK_KINDS, TASK_REPEATS, TASK_FREQS, WEEKDAYS, PROJECT_STATUSES, PRIORITIES,
  scheduledOccurrence, nextScheduled, occurrenceAssignees, describeSchedule, staffName, staffList, isOccurrenceDone,
} from "../../lib/crmCore.js";
import { tasksAvailable } from "../../data/crmStorage.js";
import { Icon, Chip, Modal, sect, lbl, card, abtn, inp, btn, goldBtn } from "./ui.jsx";

const th = { fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap", textAlign: "left" };
const tdc = { padding: "9px 8px", borderBottom: "1px solid #f0f2f6", verticalAlign: "top" };
export const PRIORITY_TONES = { Low: "grey", Normal: "gold", High: "red" };
export const STATUS_TONES = { "To do": "grey", "In progress": "amber", Done: "green" };

export const TasksSchemaNotice = () => (
  <div style={{ ...card, borderColor: GOLD, background: "#fff8e6", fontSize: 13.5, fontWeight: 600, color: "#6b5305" }}>
    <b style={{ display: "block", fontSize: 14.5, color: NAVY, marginBottom: 4 }}>Tasks need one more database step</b>
    Run <code>018_tasks.sql</code> in Supabase (SQL Editor → New query → paste → Run), then refresh. Until then tasks can't be saved.
  </div>
);

export const assigneeLabel = (crm, t) => {
  const list = t.assignees || [];
  if (!list.length) return "Everyone";
  const names = list.map((a) => staffName(crm, a));
  return t.kind === "scheduled" && t.rotate && list.length > 1 ? "Rota: " + names.join(" → ") : names.join(", ");
};

// The next few occurrences (for the rota preview)
const upcoming = (t, n) => {
  const out = [];
  let from = addDaysLocal(today(), -1);
  for (let i = 0; i < n; i++) {
    const o = nextScheduled(t, from);
    if (!o) break;
    out.push(o);
    from = o.date;
  }
  return out;
};
const addDaysLocal = (d, n) => {
  const x = new Date(d + "T00:00:00");
  x.setDate(x.getDate() + n);
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
};

// ===== the editor (new or existing task) =====
export function TaskModal({ crm, updateCrm, me, draft, onClose, askConfirm }) {
  const [t, setT] = useState(() => JSON.parse(JSON.stringify(draft)));
  const [extra, setExtra] = useState("");
  const isNew = !(crm.tasks || []).some((x) => x.id === t.id);
  const staff = staffList(crm, me);
  const set = (k, v) => setT((x) => ({ ...x, [k]: v }));
  const toggleAssignee = (email) =>
    setT((x) => {
      const has = x.assignees.some((a) => a.toLowerCase() === email.toLowerCase());
      return { ...x, assignees: has ? x.assignees.filter((a) => a.toLowerCase() !== email.toLowerCase()) : [...x.assignees, email] };
    });
  const moveAssignee = (i, dir) =>
    setT((x) => {
      const a = [...x.assignees];
      const j = i + dir;
      if (j < 0 || j >= a.length) return x;
      [a[i], a[j]] = [a[j], a[i]];
      return { ...x, assignees: a };
    });

  const save = () => {
    if (!t.title.trim()) return;
    const clean = { ...t, title: t.title.trim() };
    updateCrm((c) => {
      c.tasks = c.tasks || [];
      const i = c.tasks.findIndex((x) => x.id === clean.id);
      if (i >= 0) c.tasks[i] = { ...c.tasks[i], ...clean };
      else c.tasks.unshift({ ...clean, createdBy: me || "" });
      return c;
    });
    onClose();
  };
  const remove = () =>
    askConfirm({
      message: "Delete \"" + (t.title || "this task") + "\" and its tick history?",
      confirmLabel: "Delete",
      danger: true,
      action: () => {
        updateCrm((c) => {
          c.tasks = (c.tasks || []).filter((x) => x.id !== t.id);
          c.taskLog = (c.taskLog || []).filter((l) => l.taskId !== t.id);
          return c;
        });
        onClose();
      },
    });

  const kindLabel = (TASK_KINDS.find(([k]) => k === t.kind) || [])[1] || "Task";
  const preview = t.kind === "scheduled" ? upcoming(t, 4) : [];

  return (
    <Modal title={(isNew ? "New task" : "Edit task") + " · " + kindLabel} onClose={onClose} width={600}>
      {isNew && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {TASK_KINDS.map(([k, label]) => (
            <button key={k} onClick={() => set("kind", k)}
              style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 700, padding: "7px 13px", borderRadius: 999, cursor: "pointer", border: "1px solid " + (t.kind === k ? NAVY : "#d5d9e0"), background: t.kind === k ? NAVY : "#fff", color: t.kind === k ? "#fff" : "#5a6a85" }}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600, marginBottom: 10 }}>
        {t.kind === "daily" ? "Shows on each person's Home as a tick list, fresh every day."
          : t.kind === "project" ? "A small job to pick up in spare time — shows on their Home until it's marked Done."
          : "Pops up for whoever's turn it is on the day, and stays on their Home until ticked."}
      </div>

      <div style={{ marginBottom: 10 }}>
        <span style={lbl}>Task</span>
        <input style={inp} autoFocus value={t.title} placeholder={t.kind === "daily" ? "e.g. Check the website order inbox" : t.kind === "project" ? "e.g. Photograph the new fencing range" : "e.g. Tidy and sweep the warehouse"}
          onChange={(e) => set("title", e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
      </div>

      {t.kind === "daily" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <span style={lbl}>Repeats</span>
            <select style={inp} value={t.repeat} onChange={(e) => set("repeat", e.target.value)}>
              {TASK_REPEATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {t.repeat === "once" && (
            <div>
              <span style={lbl}>On</span>
              <input style={inp} type="date" value={t.onDate} onChange={(e) => set("onDate", e.target.value)} />
            </div>
          )}
        </div>
      )}

      {t.kind === "project" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <span style={lbl}>Priority</span>
            <select style={inp} value={t.priority} onChange={(e) => set("priority", e.target.value)}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
          </div>
          <div>
            <span style={lbl}>Status</span>
            <select style={inp} value={t.status} onChange={(e) => set("status", e.target.value)}>{PROJECT_STATUSES.map((p) => <option key={p}>{p}</option>)}</select>
          </div>
          <div>
            <span style={lbl}>Aim to finish by</span>
            <input style={inp} type="date" value={t.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
          </div>
        </div>
      )}

      {t.kind === "scheduled" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <span style={lbl}>How often</span>
            <select style={inp} value={t.frequency} onChange={(e) => set("frequency", e.target.value)}>
              {TASK_FREQS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {t.frequency === "monthly" ? (
            <div>
              <span style={lbl}>Day of the month</span>
              <select style={inp} value={t.monthDay} onChange={(e) => set("monthDay", Number(e.target.value))}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}{n > 28 ? " (or last day)" : ""}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <span style={lbl}>On</span>
              <select style={inp} value={t.weekday} onChange={(e) => set("weekday", Number(e.target.value))}>
                {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
          )}
          <div>
            <span style={lbl}>Starting from</span>
            <input style={inp} type="date" value={t.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </div>
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <span style={lbl}>Who {t.kind === "scheduled" && t.rotate ? "(in rota order)" : ""}</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => set("assignees", [])}
            style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "6px 11px", borderRadius: 999, cursor: "pointer", border: "1px solid " + (!t.assignees.length ? NAVY : "#d5d9e0"), background: !t.assignees.length ? NAVY : "#fff", color: !t.assignees.length ? "#fff" : "#5a6a85" }}>
            Everyone
          </button>
          {staff.map((s) => {
            const on = t.assignees.some((a) => a.toLowerCase() === s.email.toLowerCase());
            return (
              <button key={s.email} onClick={() => toggleAssignee(s.email)} title={s.email}
                style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "6px 11px", borderRadius: 999, cursor: "pointer", border: "1px solid " + (on ? GOLD : "#d5d9e0"), background: on ? GOLD : "#fff", color: NAVY }}>
                {staffName(crm, s.email)}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
          <input style={{ ...inp, fontSize: 13 }} placeholder="Someone else? Their login email" value={extra} onChange={(e) => setExtra(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && extra.includes("@")) { toggleAssignee(extra.trim().toLowerCase()); setExtra(""); } }} />
          <button style={btn} disabled={!extra.includes("@")} onClick={() => { toggleAssignee(extra.trim().toLowerCase()); setExtra(""); }}>Add</button>
        </div>
      </div>

      {t.kind === "scheduled" && t.assignees.length > 1 && (
        <div style={{ background: "#f8f9fb", border: "1px solid #e6e9ef", borderRadius: 12, padding: "10px 12px", marginBottom: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700 }}>
            <input type="checkbox" checked={t.rotate} onChange={(e) => set("rotate", e.target.checked)} />
            Take turns (rota) — otherwise it goes to all of them
          </label>
          {t.rotate && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {t.assignees.map((a, i) => (
                <span key={a} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#fff", border: "1px solid #e6e9ef", borderRadius: 999, padding: "3px 6px 3px 10px", fontSize: 12.5, fontWeight: 700 }}>
                  {i + 1}. {staffName(crm, a)}
                  <button style={{ border: "none", background: "none", cursor: "pointer", padding: 2, color: "#5a6a85" }} title="Earlier" onClick={() => moveAssignee(i, -1)}>‹</button>
                  <button style={{ border: "none", background: "none", cursor: "pointer", padding: 2, color: "#5a6a85" }} title="Later" onClick={() => moveAssignee(i, 1)}>›</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {preview.length > 0 && (
        <div style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600, marginBottom: 10 }}>
          Next: {preview.map((o) => prettyDate(o.date) + (occurrenceAssignees(t, o).length === 1 ? " (" + staffName(crm, occurrenceAssignees(t, o)[0]) + ")" : "")).join(" · ")}
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <span style={lbl}>Notes</span>
        <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={t.notes} placeholder="How to do it, where things are…" onChange={(e) => set("notes", e.target.value)} />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
        {!isNew && <button style={{ ...btn, color: RED, borderColor: "#ecc4cb" }} onClick={remove}><Icon name="bin" stroke={RED} />Delete</button>}
        {!isNew && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#5a6a85" }}>
            <input type="checkbox" checked={t.active === false} onChange={(e) => set("active", !e.target.checked)} />Paused
          </label>
        )}
        <span style={{ flex: 1 }} />
        <button style={btn} onClick={onClose}>Cancel</button>
        <button style={{ ...goldBtn, opacity: t.title.trim() ? 1 : 0.5 }} disabled={!t.title.trim()} onClick={save}>Save</button>
      </div>
    </Modal>
  );
}

// ===== manager screen =====
export default function TasksScreen({ crm, updateCrm, askConfirm, me, goHome }) {
  const [kind, setKind] = useState("daily");
  const [who, setWho] = useState("");
  const [draft, setDraft] = useState(null);
  const ready = tasksAvailable();
  const staff = staffList(crm, me);

  const list = (crm.tasks || [])
    .filter((t) => t.kind === kind)
    .filter((t) => !who || !(t.assignees || []).length || t.assignees.some((a) => a.toLowerCase() === who.toLowerCase()))
    .sort((a, b) => (a.active === false) - (b.active === false) || (a.title || "").localeCompare(b.title || ""));

  return (
    <div style={{ maxWidth: 1140, margin: "0 auto", padding: "18px 22px" }}>
      <button style={{ ...btn, marginBottom: 12 }} onClick={goHome}><Icon name="back" stroke={NAVY} />Home</button>
      {!ready && <TasksSchemaNotice />}

      <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px" }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {TASK_KINDS.map(([k, label]) => {
            const n = (crm.tasks || []).filter((t) => t.kind === k && t.active !== false).length;
            return (
              <button key={k} onClick={() => setKind(k)}
                style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 700, padding: "7px 13px", borderRadius: 999, cursor: "pointer", border: "1px solid " + (kind === k ? NAVY : "#d5d9e0"), background: kind === k ? NAVY : "#fff", color: kind === k ? "#fff" : "#5a6a85" }}>
                {label}{n ? " · " + n : ""}
              </button>
            );
          })}
        </div>
        <select style={{ ...inp, width: "auto", fontSize: 13, fontWeight: 700 }} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">All staff</option>
          {staff.map((s) => <option key={s.email} value={s.email}>{staffName(crm, s.email)}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <button style={{ ...goldBtn, opacity: ready ? 1 : 0.5 }} disabled={!ready} onClick={() => setDraft({ ...blankTask(kind), assignees: who ? [who] : [] })}>
          <Icon name="plus" stroke={NAVY} />New task
        </button>
      </div>

      <div style={card}>
        {list.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 10px", color: "#5a6a85", fontWeight: 600 }}>
            No {kind === "daily" ? "daily list items" : kind === "project" ? "projects" : "scheduled tasks"} yet.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
              <thead>
                <tr>
                  {["Task", "Who", kind === "daily" ? "Repeats" : kind === "project" ? "Status" : "When", kind === "scheduled" ? "Next / now" : kind === "project" ? "Finish by" : "", ""].map((h, i) => <th key={i} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {list.map((t) => {
                  const occ = kind === "scheduled" ? scheduledOccurrence(t, today()) : null;
                  const due = occ && !isOccurrenceDone(crm, t, occ);
                  const nxt = kind === "scheduled" ? nextScheduled(t, today()) : null;
                  return (
                    <tr key={t.id} style={{ opacity: t.active === false ? 0.5 : 1, cursor: "pointer" }} onClick={() => setDraft(t)}>
                      <td style={tdc}>
                        <b>{t.title}</b>
                        {t.active === false && <Chip style={{ marginLeft: 6, fontSize: 10, padding: "1px 7px" }}>paused</Chip>}
                        {t.notes && <div style={{ fontSize: 12, color: "#8593a8", fontWeight: 600, marginTop: 2 }}>{t.notes.slice(0, 90)}{t.notes.length > 90 ? "…" : ""}</div>}
                      </td>
                      <td style={{ ...tdc, fontWeight: 600 }}>{assigneeLabel(crm, t)}</td>
                      <td style={tdc}>
                        {kind === "daily" ? (t.repeat === "once" ? "Once · " + prettyDate(t.onDate) : (TASK_REPEATS.find(([v]) => v === t.repeat) || [])[1])
                          : kind === "project" ? <><Chip tone={STATUS_TONES[t.status]}>{t.status}</Chip> <Chip tone={PRIORITY_TONES[t.priority]}>{t.priority}</Chip></>
                          : describeSchedule(t)}
                      </td>
                      <td style={{ ...tdc, whiteSpace: "nowrap" }}>
                        {kind === "scheduled" ? (
                          due ? (
                            <Chip tone="red">{"Due " + prettyDate(occ.date) + (occurrenceAssignees(t, occ).length === 1 ? " · " + staffName(crm, occurrenceAssignees(t, occ)[0]) : "")}</Chip>
                          ) : nxt ? (
                            <span style={{ fontWeight: 600, color: "#5a6a85" }}>{prettyDate(nxt.date) + (occurrenceAssignees(t, nxt).length === 1 ? " · " + staffName(crm, occurrenceAssignees(t, nxt)[0]) : "")}</span>
                          ) : "—"
                        ) : kind === "project" ? (t.dueDate ? <span style={{ fontWeight: 600, color: t.dueDate < today() && t.status !== "Done" ? RED : "#5a6a85" }}>{prettyDate(t.dueDate)}</span> : "—") : ""}
                      </td>
                      <td style={{ ...tdc, textAlign: "right" }}>
                        <button style={abtn} title="Edit" onClick={(e) => { e.stopPropagation(); setDraft(t); }}><Icon name="pen" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p style={{ fontSize: 12, color: "#8593a8", fontWeight: 600 }}>
        Staff names come from the login list (Supabase → profiles → full_name); without a name the first part of the email is used.
      </p>

      {draft && <TaskModal crm={crm} updateCrm={updateCrm} me={me} draft={draft} askConfirm={askConfirm} onClose={() => setDraft(null)} />}
    </div>
  );
}
