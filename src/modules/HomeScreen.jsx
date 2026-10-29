// Home: the person's own task list (today's to-dos, scheduled rota tasks due,
// spare-time projects) beside a reports panel of the business at a glance.
import { useState } from "react";
import { NAVY, GOLD, RED, addMonths, addDays, prettyDate, STATUS_COLOURS } from "../lib/core.js";
import {
  invoiceTotals, gbp, isPaid, today, stockValuation, blankTask,
  dailyTasksFor, isDailyDone, dueScheduledFor, projectsFor, setTaskDone, scheduledOccurrence, nextScheduled,
  occurrenceAssignees, staffName, staffList, describeSchedule, PROJECT_STATUSES,
  quoteTotals, quoteStatus, quoteIsOpen, sampleStats, sampleStatus,
} from "../lib/crmCore.js";
import { tasksAvailable } from "../data/crmStorage.js";
import { Icon, Chip, card, sect, lbl, inp, btn, goldBtn } from "./crm/ui.jsx";
import { TaskModal, TasksSchemaNotice, PRIORITY_TONES, STATUS_TONES } from "./crm/TasksScreen.jsx";

const Check = ({ on, onClick, title }) => (
  <button onClick={onClick} title={title}
    style={{ width: 24, height: 24, borderRadius: 7, flex: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
      border: "2px solid " + (on ? "#3FA55C" : "#c9d0db"), background: on ? "#3FA55C" : "#fff" }}>
    {on && <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
  </button>
);

const Report = ({ label, value, sub, tone, onClick }) => (
  <button onClick={onClick}
    style={{ textAlign: "left", background: "#fff", border: "1px solid #e6e9ef", borderRadius: 11, padding: "11px 14px", cursor: onClick ? "pointer" : "default", fontFamily: "inherit", width: "100%" }}
    onMouseEnter={(e) => onClick && (e.currentTarget.style.borderColor = GOLD)}
    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e6e9ef")}>
    <span style={{ ...lbl, marginBottom: 2 }}>{label}</span>
    <b style={{ fontSize: 19, color: tone || NAVY, display: "block" }}>{value}</b>
    {sub && <div style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, marginTop: 1 }}>{sub}</div>}
  </button>
);

const rowStyle = { display: "flex", gap: 11, alignItems: "flex-start", padding: "9px 0", borderBottom: "1px solid #f0f2f6" };

export default function HomeScreen({ data, crm, updateCrm, me, askConfirm, setTab, addShipment, newInvoice }) {
  const tod = today();
  const [viewAs, setViewAs] = useState(me || "");
  const [draft, setDraft] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const ready = tasksAvailable();
  const who = viewAs; // "" = everyone's view (preview / unassigned)

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  const firstName = me ? staffName(crm || {}, me).split(" ")[0] : "";

  // ===== reports =====
  const invs = crm ? crm.invoices : [];
  const monthKey = tod.slice(0, 7);
  const lastMonthKey = addMonths(tod.slice(0, 8) + "01", -1).slice(0, 7);
  const dayOfMonth = Number(tod.slice(8, 10));
  const salesIn = (key, uptoDay) => invs.filter((i) => (i.date || "").slice(0, 7) === key && (!uptoDay || Number((i.date || "").slice(8, 10)) <= uptoDay)).reduce((t, i) => t + invoiceTotals(i).total, 0);
  const salesThisMonth = salesIn(monthKey);
  const salesLastToDate = salesIn(lastMonthKey, dayOfMonth);
  const awaiting = invs.filter((i) => !isPaid(i));
  const owed = awaiting.reduce((t, i) => t + invoiceTotals(i).total, 0);
  const todays = invs.filter((i) => i.deliveryDate === tod && !i.deliveryCompleted).length;
  const weekEnd = addDays(tod, 6);
  const thisWeek = invs.filter((i) => i.deliveryDate >= tod && i.deliveryDate <= weekEnd && !i.deliveryCompleted).length;
  const toBook = invs.filter((i) => !i.deliveryDate && !i.deliveryCompleted).length;
  const quotes = crm ? crm.quotes || [] : [];
  const openQuotes = quotes.filter((q) => quoteIsOpen(q, crm));
  const acceptedWaiting = quotes.filter((q) => quoteStatus(q, crm) === "Accepted").length;
  const samples = crm ? crm.samples || [] : [];
  const s90 = sampleStats(samples.filter((x) => (x.date || "") >= addDays(tod, -90)), crm || {});
  const toSend = samples.filter((x) => sampleStatus(x, crm) === "To send").length;
  const stockVal = crm ? stockValuation(crm) : null;
  const live = data.shipments.filter((s) => s.status !== "Paid");
  const inbound = data.shipments
    .filter((s) => ["Confirmed", "In production", "Shipped"].includes(s.status) && s.orderDate)
    .map((s) => ({ s, eta: addMonths(s.orderDate, 3) }))
    .sort((a, b) => a.eta.localeCompare(b.eta));

  // ===== tasks =====
  const daily = crm ? dailyTasksFor(crm, who, tod) : [];
  const dueSched = crm ? dueScheduledFor(crm, who, tod) : [];
  const projects = crm ? projectsFor(crm, who, showDone) : [];
  const comingUp = crm
    ? (crm.tasks || [])
        .filter((t) => t.kind === "scheduled" && t.active !== false)
        .map((t) => ({ t, o: nextScheduled(t, tod) }))
        .filter(({ t, o }) => o && o.date <= addDays(tod, 7) && (!who || !occurrenceAssignees(t, o).length || occurrenceAssignees(t, o).some((a) => a.toLowerCase() === who.toLowerCase())))
        .sort((a, b) => a.o.date.localeCompare(b.o.date))
    : [];
  const dailyDone = daily.filter((t) => isDailyDone(crm, t, tod, who)).length;
  const totalToday = daily.length + dueSched.length;
  const doneToday = dailyDone;
  const staff = crm ? staffList(crm, me) : [];

  const tick = (taskId, period, done) =>
    updateCrm((c) => {
      setTaskDone(c, taskId, period, who || me, done);
      return c;
    });
  const setStatus = (id, status) =>
    updateCrm((c) => {
      const t = (c.tasks || []).find((x) => x.id === id);
      if (t) t.status = status;
      return c;
    });

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 22px" }}>
      {/* hero */}
      <div style={{ background: "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", borderRadius: 14, padding: "18px 22px", color: "#fff", marginBottom: 16, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ minWidth: 200 }}>
          <h2 style={{ margin: 0, fontSize: 21 }}>{greeting}{firstName ? " " + firstName : ""}</h2>
          <div style={{ fontSize: 13, color: "#aeb9cf", fontWeight: 600, marginTop: 4 }}>
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            {crm && totalToday ? " · " + (totalToday - doneToday) + " of " + totalToday + " to do today" : ""}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={newInvoice} style={{ ...goldBtn }}><Icon name="plus" stroke={NAVY} />New invoice</button>
          <button onClick={addShipment} style={{ ...btn, background: "transparent", border: "1px solid #3a4f78", color: "#fff" }}><Icon name="plus" stroke="#fff" />New shipment</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, alignItems: "start" }}>
        {/* ===== tasks column ===== */}
        <div>
          {crm && !ready && <TasksSchemaNotice />}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <p style={{ ...sect, margin: 0 }}>Today</p>
              {totalToday > 0 && (
                <div style={{ flex: 1, minWidth: 80, height: 7, background: "#eef0f4", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ width: (daily.length ? (dailyDone / totalToday) * 100 : 0) + "%", height: "100%", background: "#3FA55C" }} />
                </div>
              )}
              <span style={{ flex: totalToday ? "none" : 1 }} />
              {crm && (
                <select style={{ ...inp, width: "auto", padding: "4px 8px", fontSize: 12.5, fontWeight: 700 }} value={viewAs} onChange={(e) => setViewAs(e.target.value)} title="Whose tasks">
                  {!me && <option value="">Everyone</option>}
                  {staff.map((s) => <option key={s.email} value={s.email}>{s.email.toLowerCase() === (me || "").toLowerCase() ? "My tasks" : staffName(crm, s.email)}</option>)}
                  {me && <option value="">Everyone</option>}
                </select>
              )}
            </div>
            {!crm ? (
              <div style={{ color: "#8593a8", fontWeight: 600, fontSize: 13 }}>Loading…</div>
            ) : totalToday === 0 ? (
              <div style={{ color: "#8593a8", fontWeight: 600, fontSize: 13, padding: "6px 0" }}>Nothing on the list for today.</div>
            ) : (
              <>
                {dueSched.map(({ task: t, occ, overdueDays }) => (
                  <div key={t.id} style={rowStyle}>
                    <Check on={false} title="Mark done" onClick={() => tick(t.id, occ.date, true)} />
                    <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setDraft(t)}>
                      <b style={{ fontSize: 14 }}>{t.title}</b>
                      <div style={{ fontSize: 12, fontWeight: 600, color: overdueDays > 0 ? RED : "#a05f10", marginTop: 1 }}>
                        {describeSchedule(t)} · {overdueDays > 0 ? "due " + prettyDate(occ.date) + " (" + overdueDays + " day" + (overdueDays > 1 ? "s" : "") + " late)" : "due today"}
                        {!who && occurrenceAssignees(t, occ).length ? " · " + occurrenceAssignees(t, occ).map((a) => staffName(crm, a)).join(", ") : ""}
                      </div>
                    </div>
                    <Chip tone="amber" style={{ fontSize: 10.5 }}>{t.rotate && (t.assignees || []).length > 1 ? "rota" : "scheduled"}</Chip>
                  </div>
                ))}
                {daily.map((t) => {
                  const done = isDailyDone(crm, t, tod, who);
                  return (
                    <div key={t.id} style={rowStyle}>
                      <Check on={done} title={done ? "Untick" : "Done"} onClick={() => tick(t.id, tod, !done)} />
                      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setDraft(t)}>
                        <b style={{ fontSize: 14, color: done ? "#8593a8" : NAVY, textDecoration: done ? "line-through" : "none" }}>{t.title}</b>
                        {t.notes && !done && <div style={{ fontSize: 12, color: "#8593a8", fontWeight: 600, marginTop: 1 }}>{t.notes}</div>}
                      </div>
                      {t.repeat === "once" && <Chip style={{ fontSize: 10.5 }}>today</Chip>}
                    </div>
                  );
                })}
              </>
            )}
            {comingUp.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <span style={lbl}>Coming up this week</span>
                {comingUp.slice(0, 5).map(({ t, o }) => (
                  <div key={t.id} style={{ display: "flex", gap: 8, fontSize: 12.5, fontWeight: 600, color: "#5a6a85", padding: "3px 0" }}>
                    <span style={{ color: NAVY, fontWeight: 700, minWidth: 74 }}>{new Date(o.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>
                    <span>{t.title}{occurrenceAssignees(t, o).length === 1 ? " · " + staffName(crm, occurrenceAssignees(t, o)[0]) : ""}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button style={{ ...btn, padding: "6px 11px", fontSize: 12.5, opacity: ready ? 1 : 0.5 }} disabled={!crm || !ready}
                onClick={() => setDraft({ ...blankTask("daily"), repeat: "once", assignees: who ? [who] : [] })}>
                <Icon name="plus" stroke={NAVY} />Add a to-do for today
              </button>
              <span style={{ flex: 1 }} />
              <button style={{ ...btn, padding: "6px 11px", fontSize: 12.5 }} disabled={!crm} onClick={() => setTab("tasks")}>
                <Icon name="gear" />Manage all tasks
              </button>
            </div>
          </div>

          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <p style={{ ...sect, margin: 0 }}>Projects</p>
              <span style={{ flex: 1 }} />
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: "#8593a8" }}>
                <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />Show done
              </label>
              <button style={{ ...btn, padding: "5px 10px", fontSize: 12.5, opacity: ready ? 1 : 0.5 }} disabled={!crm || !ready}
                onClick={() => setDraft({ ...blankTask("project"), assignees: who ? [who] : [] })}>
                <Icon name="plus" stroke={NAVY} />New
              </button>
            </div>
            {!crm ? null : projects.length === 0 ? (
              <div style={{ color: "#8593a8", fontWeight: 600, fontSize: 13, padding: "6px 0" }}>No projects on the go — add one for spare-time jobs.</div>
            ) : (
              projects.map((t) => (
                <div key={t.id} style={{ ...rowStyle, alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setDraft(t)}>
                    <b style={{ fontSize: 14, textDecoration: t.status === "Done" ? "line-through" : "none", color: t.status === "Done" ? "#8593a8" : NAVY }}>{t.title}</b>
                    <div style={{ fontSize: 12, color: "#8593a8", fontWeight: 600, marginTop: 1 }}>
                      {[!who ? (t.assignees || []).map((a) => staffName(crm, a)).join(", ") || "Anyone" : "", t.dueDate ? "by " + prettyDate(t.dueDate) : ""].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <Chip tone={PRIORITY_TONES[t.priority]} style={{ fontSize: 10.5 }}>{t.priority}</Chip>
                  <select value={t.status} onChange={(e) => setStatus(t.id, e.target.value)}
                    style={{ ...inp, width: "auto", padding: "4px 7px", fontSize: 12.5, fontWeight: 700, borderColor: t.status === "In progress" ? "#f0d0a8" : t.status === "Done" ? "#bfe3ca" : "#d5d9e0" }}>
                    {PROJECT_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ===== reports column ===== */}
        <div>
          <div style={card}>
            <p style={sect}>Reports</p>
            {!crm ? (
              <div style={{ color: "#8593a8", fontWeight: 600, fontSize: 13 }}>Loading…</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                <Report label="Sales this month" value={gbp(salesThisMonth)}
                  sub={salesLastToDate ? (salesThisMonth >= salesLastToDate ? "▲ " : "▼ ") + gbp(Math.abs(salesThisMonth - salesLastToDate)) + " vs last month to date" : "inc VAT"}
                  tone={salesLastToDate && salesThisMonth < salesLastToDate ? RED : NAVY} onClick={() => setTab("invoices")} />
                <Report label="Awaiting payment" value={gbp(owed)} sub={awaiting.length + " invoice" + (awaiting.length === 1 ? "" : "s")} tone={awaiting.length ? "#a05f10" : NAVY} onClick={() => setTab("invoices")} />
                <Report label="Deliveries" value={todays + " today"} sub={thisWeek + " this week · " + toBook + " to book in"} tone={toBook ? RED : NAVY} onClick={() => setTab("schedule")} />
                <Report label="Open quotes" value={gbp(openQuotes.reduce((t, q) => t + quoteTotals(q).total, 0))} sub={openQuotes.length + " open" + (acceptedWaiting ? " · " + acceptedWaiting + " to invoice" : "")} onClick={() => setTab("quotes")} />
                <Report label="Samples · 90 days" value={s90.rate === null ? "—" : Math.round(s90.rate * 100) + "% convert"} sub={s90.requests + " requests" + (toSend ? " · " + toSend + " to send" : "")} tone={toSend ? RED : NAVY} onClick={() => setTab("samples")} />
                <Report label="Stock at cost" value={stockVal ? gbp(stockVal.costValue) : "—"} sub={stockVal ? stockVal.units.toLocaleString("en-GB") + " units" : ""} onClick={() => setTab("stock")} />
              </div>
            )}
          </div>

          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
              <p style={{ ...sect, margin: 0 }}>Imports</p>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#5a6a85" }}>{live.length} live</span>
            </div>
            {inbound.length === 0 ? (
              <div style={{ color: "#8593a8", fontWeight: 600, fontSize: 13 }}>Nothing inbound.</div>
            ) : (
              inbound.slice(0, 4).map(({ s, eta }) => (
                <button key={s.id} onClick={() => setTab("overview")}
                  style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, fontWeight: 600, padding: "6px 0", width: "100%", background: "none", border: "none", borderBottom: "1px solid #f0f2f6", cursor: "pointer", fontFamily: "inherit", color: NAVY, textAlign: "left" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: STATUS_COLOURS[s.status] || GOLD, flex: "none" }} />
                  <span style={{ fontWeight: 700 }}>{s.name}</span>
                  <span style={{ color: "#5a6a85" }}>{s.status}</span>
                  <span style={{ marginLeft: "auto", color: "#5a6a85" }}>~ {prettyDate(eta)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {draft && crm && <TaskModal crm={crm} updateCrm={updateCrm} me={me} draft={draft} askConfirm={askConfirm} onClose={() => setDraft(null)} />}
      <div style={{ height: 30 }} />
    </div>
  );
}
