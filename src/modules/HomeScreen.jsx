// Home: the person's own task list (today's to-dos, scheduled rota tasks due,
// spare-time projects) beside a reports panel of the business at a glance.
import { useState } from "react";
import { NAVY, GOLD, RED, addMonths, addDays, prettyDate, STATUS_COLOURS } from "../lib/core.js";
import {
  invoiceTotals, gbp, isPaid, today, stockValuation, blankTask,
  dailyTasksFor, isDailyDone, dueScheduledFor, projectsFor, setTaskDone, scheduledOccurrence, nextScheduled,
  occurrenceAssignees, staffName, staffList, describeSchedule, PROJECT_STATUSES,
  quoteTotals, quoteStatus, quoteIsOpen, sampleStats, sampleStatus, isVoidInvoice, onSchedule,
} from "../lib/crmCore.js";
import { tasksAvailable } from "../data/crmStorage.js";
import { Icon, Chip, card, sect, lbl, inp, btn, goldBtn, RiskChip } from "./crm/ui.jsx";
import WebsiteCard from "./WebsiteCard.jsx";
import ReviewsCard from "./ReviewsCard.jsx";
import { samplesIn, SAMPLE_GROUPS, printAllToSend, emailFollowUpGroup } from "./crm/sampleActions.js";
import { analyticsReady } from "../data/analytics.js";
import { TaskModal, TasksSchemaNotice, PRIORITY_TONES, STATUS_TONES } from "./crm/TasksScreen.jsx";

const Check = ({ on, onClick, title }) => (
  <button onClick={onClick} title={title}
    style={{ width: 24, height: 24, borderRadius: 8, flex: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
      border: "2px solid " + (on ? "#3FA55C" : "#c9d0db"), background: on ? "#3FA55C" : "#fff" }}>
    {on && <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
  </button>
);

const Report = ({ label, value, sub, tone, onClick }) => (
  <button onClick={onClick}
    style={{ textAlign: "left", background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, padding: "11px 14px", cursor: onClick ? "pointer" : "default", fontFamily: "inherit", width: "100%" }}
    onMouseEnter={(e) => onClick && (e.currentTarget.style.borderColor = GOLD)}
    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e6e9ef")}>
    <span style={{ ...lbl, marginBottom: 2 }}>{label}</span>
    <b style={{ fontSize: 19, color: tone || NAVY, display: "block" }}>{value}</b>
    {sub && <div style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, marginTop: 1 }}>{sub}</div>}
  </button>
);

const rowStyle = { display: "flex", gap: 11, alignItems: "flex-start", padding: "9px 0", borderBottom: "1px solid #f0f2f6" };

export default function HomeScreen({ data, crm, updateCrm, me, askConfirm, setTab, addShipment, newInvoice, openInvoice, openCollection, openShipment, money = true, canTab = () => true }) {
  const tod = today();
  const [viewAs, setViewAs] = useState(me || "");
  const [draft, setDraft] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [homeNotice, setHomeNotice] = useState("");
  const ready = tasksAvailable();
  const who = viewAs; // "" = everyone's view (preview / unassigned)

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  const firstName = me ? staffName(crm || {}, me).split(" ")[0] : "";

  // ===== reports =====
  const invs = crm ? crm.invoices.filter((i) => !isVoidInvoice(i)) : []; // refunded / cancelled on the website don't count
  const monthKey = tod.slice(0, 7);
  const lastMonthKey = addMonths(tod.slice(0, 8) + "01", -1).slice(0, 7);
  const dayOfMonth = Number(tod.slice(8, 10));
  const salesIn = (key, uptoDay) => invs.filter((i) => (i.date || "").slice(0, 7) === key && (!uptoDay || Number((i.date || "").slice(8, 10)) <= uptoDay)).reduce((t, i) => t + invoiceTotals(i).total, 0);
  const salesThisMonth = salesIn(monthKey);
  const salesLastToDate = salesIn(lastMonthKey, dayOfMonth);
  const awaiting = invs.filter((i) => !isPaid(i));
  const owed = awaiting.reduce((t, i) => t + invoiceTotals(i).total, 0);
  const schedInvs = invs.filter((i) => onSchedule(i, crm)); // delivery counts leave out off-schedule customers
  const todays = schedInvs.filter((i) => i.deliveryDate === tod && !i.deliveryCompleted).length;
  const weekEnd = addDays(tod, 6);
  const thisWeek = schedInvs.filter((i) => i.deliveryDate >= tod && i.deliveryDate <= weekEnd && !i.deliveryCompleted).length;
  const toBook = schedInvs.filter((i) => !i.deliveryDate && !i.deliveryCompleted).length;
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
    .map((s) => ({ s, eta: s.etaDate || addMonths(s.orderDate, 3) }))
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
      <div style={{ background: "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", borderRadius: 12, padding: "18px 22px", color: "#fff", marginBottom: 16, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ minWidth: 200 }}>
          <h2 style={{ margin: 0, fontSize: 21 }}>{greeting}{firstName ? " " + firstName : ""}</h2>
          <div style={{ fontSize: 13, color: "#aeb9cf", fontWeight: 600, marginTop: 4 }}>
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            {crm && totalToday ? " · " + (totalToday - doneToday) + " of " + totalToday + " to do today" : ""}
          </div>
        </div>
      </div>

      {crm && !ready && <TasksSchemaNotice />}
      {/* row 1: money | website · row 2: deliveries (3/4) | samples (1/4) · row 3: coming in · row 4: reviews & photos · row 5: today | projects */}
      <div className="dk-home-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, alignItems: "stretch" }}>
          <div className="dk-home-cell" style={{ gridColumn: "span 2", minWidth: 0 }}>
            <div style={{ ...card, marginBottom: 0, height: "100%", boxSizing: "border-box" }}>
              <p style={sect}>{money ? "Financial overview" : "Overview"}</p>
              {!crm ? (
                <div style={{ color: "#8593a8", fontWeight: 600, fontSize: 13 }}>Loading…</div>
              ) : (
                !money ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                  {/* office / warehouse: counts only, no money */}
                  <Report label="Customers" value={(crm.customers || []).length.toLocaleString("en-GB")} sub="accounts" onClick={() => setTab("customers")} />
                  <Report label="Orders this month" value={invs.filter((i) => (i.date || "").slice(0, 7) === monthKey).length.toLocaleString("en-GB")}
                    sub={invs.filter((i) => (i.date || "").slice(0, 7) === lastMonthKey && Number((i.date || "").slice(8, 10)) <= dayOfMonth).length + " by this day last month"} onClick={() => setTab("invoices")} />
                  <Report label="Awaiting payment" value={awaiting.length + " invoice" + (awaiting.length === 1 ? "" : "s")} tone={awaiting.length ? "#a05f10" : NAVY} onClick={() => setTab("invoices")} />
                  <Report label="Deliveries" value={todays + " today"} sub={thisWeek + " this week · " + toBook + " to book"} onClick={() => setTab("schedule")} />
                  <Report label="Open quotes" value={openQuotes.length + " open"} sub={acceptedWaiting ? acceptedWaiting + " to invoice" : ""} onClick={() => setTab("quotes")} />
                  <Report label="Samples" value={toSend + " to send"} sub={s90.requests + " requests · 90 days" + (s90.rate === null ? "" : " · " + Math.round(s90.rate * 100) + "% convert")} onClick={() => setTab("samples")} />
                </div>
                ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                  <Report label="Sales this month" value={gbp(salesThisMonth)}
                    sub={salesLastToDate ? (salesThisMonth >= salesLastToDate ? "▲ " : "▼ ") + gbp(Math.abs(salesThisMonth - salesLastToDate)) + " vs last month to date" : "inc VAT"}
                    tone={salesLastToDate && salesThisMonth < salesLastToDate ? RED : NAVY} onClick={() => setTab("invoices")} />
                  <Report label="Awaiting payment" value={gbp(owed)} sub={awaiting.length + " invoice" + (awaiting.length === 1 ? "" : "s")} tone={awaiting.length ? "#a05f10" : NAVY} onClick={() => setTab("invoices")} />
                  <Report label="Open quotes" value={gbp(openQuotes.reduce((t, q) => t + quoteTotals(q).total, 0))} sub={openQuotes.length + " open" + (acceptedWaiting ? " · " + acceptedWaiting + " to invoice" : "")} onClick={() => setTab("quotes")} />
                  <Report label="Stock at cost" value={stockVal ? gbp(stockVal.costValue) : "—"} sub={stockVal ? stockVal.units.toLocaleString("en-GB") + " units" : ""} onClick={() => setTab("stock")} />
                  <Report label="Samples · 90 days" value={s90.rate === null ? "—" : Math.round(s90.rate * 100) + "% convert"} sub={s90.requests + " requests"} onClick={() => setTab("samples")} />
                  <Report label="Imports" value={live.length + " live"} sub={inbound.length ? inbound[0].s.name + " ~ " + prettyDate(inbound[0].eta) : "nothing inbound"} onClick={() => setTab("overview")} />
                </div>
                )
              )}
            </div>
          </div>
          <div className="dk-home-cell" style={{ gridColumn: "span 2", minWidth: 0 }}>
            {analyticsReady ? <WebsiteCard money={money} /> : (
              <div style={{ ...card, marginBottom: 0 }}><p style={sect}>Website</p><div style={{ color: "#8593a8", fontWeight: 600, fontSize: 13 }}>Website stats show here on the live site.</div></div>
            )}
          </div>
          <div className="dk-home-cell" style={{ gridColumn: "span 3", minWidth: 0 }}>
            {crm && (() => {
              // today + the next 3 days: drops, what to load for the next day, and supplier collections
              const days = [0, 1, 2, 3].map((n) => addDays(tod, n));
              const open = (crm.invoices || []).filter((i) => !i.deliveryCompleted && !isVoidInvoice(i) && onSchedule(i, crm));
              const dropsOn = (d) => open.filter((i) => i.deliveryDate === d);
              const custName = (id) => { const c = (crm.customers || []).find((x) => x.id === id); return c ? c.name || "Unnamed" : "No customer"; };
              const postcodeOf = (i) => { const st = (crm.sites || []).find((x) => x.id === i.siteId); const c = (crm.customers || []).find((x) => x.id === i.customerId); return (st && st.postcode) || (c && c.postcode) || ""; };
              const vansFor = (list) => {
                const by = {};
                list.forEach((i) => { const v = i.van || "No van yet"; by[v] = (by[v] || 0) + 1; });
                return Object.entries(by).sort(([a], [b]) => a.localeCompare(b));
              };
              const tomorrowInvIds = (d) => new Set(dropsOn(addDays(d, 1)).map((i) => i.id));
              const collectionsFor = (d) => (crm.collections || []).filter((c) => !c.collected && (
                c.collectDate === d || (c.assignedInvoiceId && tomorrowInvIds(d).has(c.assignedInvoiceId)) ||
                (c.items || []).some((it) => it.assignedInvoiceId && tomorrowInvIds(d).has(it.assignedInvoiceId))));
              const sub = { fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", margin: "10px 0 4px" };
              return (
                <div style={{ ...card, marginBottom: 0, height: "100%", boxSizing: "border-box" }}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                    <p style={{ ...sect, margin: 0 }}>Deliveries · next 4 days</p>
                    <span style={{ flex: 1 }} />
                    {toBook > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: RED, marginRight: 10 }}>{toBook} to book in</span>}
                    <button onClick={() => setTab("schedule")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#185FA5", padding: 0 }}>Delivery schedule ▸</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                    {days.map((d, n) => {
                      const drops = dropsOn(d);
                      const load = vansFor(dropsOn(addDays(d, 1)));
                      const colls = collectionsFor(d);
                      const dayName = n === 0 ? "Today" : n === 1 ? "Tomorrow" : new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long" });
                      return (
                        <div key={d} style={{ border: "1px solid " + (n === 0 ? GOLD : "#e6e9ef"), background: n === 0 ? "#fff8e6" : "#fff", borderRadius: 12, padding: "10px 12px", minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                            <b style={{ fontSize: 14, color: NAVY }}>{dayName}</b>
                            <span style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600 }}>{new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                            <span style={{ flex: 1 }} />
                            <b style={{ fontSize: 18, color: drops.length ? NAVY : "#aab3c2" }}>{drops.length}</b>
                          </div>
                          <div style={sub}>Drops</div>
                          {drops.length === 0 ? <div style={{ fontSize: 12, color: "#aab3c2", fontWeight: 600 }}>None</div> : drops.slice(0, 5).map((i) => (
                            <button key={i.id} onClick={() => openInvoice && openInvoice(i.id)} className="dk-title-link" title={"Open job #" + (i.invNo || "—")}
                              style={{ display: "flex", gap: 6, alignItems: "center", width: "100%", fontSize: 12.5, fontWeight: 700, color: NAVY, padding: "2px 0" }}>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{custName(i.customerId)}</span>
                              <RiskChip inv={i} />
                              <span style={{ color: "#8593a8", fontWeight: 600, fontSize: 11.5, whiteSpace: "nowrap" }}>{postcodeOf(i)}</span>
                            </button>
                          ))}
                          {drops.length > 5 && <div style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600 }}>+ {drops.length - 5} more</div>}
                          <div style={sub}>Load for {n === 0 ? "tomorrow" : "next day"}</div>
                          {load.length === 0 ? <div style={{ fontSize: 12, color: "#aab3c2", fontWeight: 600 }}>Nothing to load</div> : load.map(([v, k]) => (
                            <div key={v} style={{ display: "flex", gap: 6, fontSize: 12.5, fontWeight: 600, color: v === "No van yet" ? RED : NAVY, padding: "1px 0" }}>
                              <Icon name="truck" size={13} stroke={v === "No van yet" ? RED : "#5a6a85"} /><span style={{ flex: 1 }}>{v}</span><b>{k} drop{k === 1 ? "" : "s"}</b>
                            </div>
                          ))}
                          <div style={sub}>Collections</div>
                          {colls.length === 0 ? <div style={{ fontSize: 12, color: "#aab3c2", fontWeight: 600 }}>None due</div> : colls.map((c) => (
                            <button key={c.id} onClick={() => (openCollection ? openCollection(c.id) : setTab("collections"))} className="dk-title-link" title="Open the collection"
                              style={{ display: "flex", gap: 6, width: "100%", fontSize: 12.5, fontWeight: 600, color: NAVY, padding: "1px 0" }}>
                              <Icon name="box" size={13} stroke="#5a6a85" />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{c.supplier || "Supplier"}</span>
                              <span style={{ color: "#8593a8", fontSize: 11.5 }}>COL-{c.collectionNo || "—"}</span>
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="dk-home-cell" style={{ gridColumn: "span 1", gridRow: "span 2", minWidth: 0 }}>
            {crm && (() => {
              const rows = [
                ["To send", samplesIn(crm, SAMPLE_GROUPS.send).length, "Print all", "doc", () => printAllToSend(crm, updateCrm, askConfirm, setHomeNotice)],
                ["Follow-up due", samplesIn(crm, SAMPLE_GROUPS.first).length, "Email all", "mail", () => emailFollowUpGroup(crm, updateCrm, askConfirm, "first", setHomeNotice)],
                ["2nd follow-up (discount code)", samplesIn(crm, SAMPLE_GROUPS.second).length, "Email all", "mail", () => emailFollowUpGroup(crm, updateCrm, askConfirm, "second", setHomeNotice)],
              ];
              return (
                <div style={{ ...card, marginBottom: 0, height: "100%", boxSizing: "border-box" }}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                    <p style={{ ...sect, margin: 0 }}>Samples</p>
                    <span style={{ flex: 1 }} />
                    <button onClick={() => setTab("samples")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#185FA5", padding: 0 }}>Open samples ▸</button>
                  </div>
                  {homeNotice && <div style={{ fontSize: 12.5, fontWeight: 600, color: "#6b5305", background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "6px 10px", marginBottom: 6 }}>{homeNotice}</div>}
                  {rows.map(([label, n, act, icon, run]) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid #f0f2f6", fontSize: 13, fontWeight: 600 }}>
                      <b style={{ minWidth: 26, textAlign: "center", fontSize: 15, color: n ? (label === "To send" ? RED : "#a05f10") : "#aab3c2" }}>{n}</b>
                      <span style={{ flex: 1, color: n ? NAVY : "#8593a8" }}>{label}</span>
                      {n > 0 && (
                        <button onClick={run} style={{ ...goldBtn, padding: "5px 10px", fontSize: 12 }}><Icon name={icon} stroke={NAVY} size={13} />{act}</button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          <div className="dk-home-cell" style={{ gridColumn: "span 3", minWidth: 0 }}>
            {crm && (() => {
              // stock coming in over the next 7 days: import containers (expected date, or an estimate) and supplier collections
              const end = addDays(tod, 6);
              const dayLabel = (d) => d === tod ? "Today" : d === addDays(tod, 1) ? "Tomorrow" : new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
              const ships = data.shipments
                .filter((x) => !x.arrivedDate && x.status !== "Planning" && x.status !== "Paid")
                .map((x) => ({ kind: "ship", id: x.id, date: x.etaDate || (x.orderDate ? addMonths(x.orderDate, 3) : ""), est: !x.etaDate, title: x.name || "Shipment", sub: [x.supplier, x.status].filter(Boolean).join(" · ") }))
                .filter((x) => x.date && x.date <= end);
              const colls = (crm.collections || [])
                .filter((c) => !c.collected && c.collectDate && c.collectDate <= end)
                .map((c) => ({ kind: "coll", id: c.id, date: c.collectDate, est: false, title: c.supplier || "Supplier collection",
                  sub: ["COL-" + (c.collectionNo || "—"), (c.items || []).length ? (c.items || []).length + " item" + ((c.items || []).length === 1 ? "" : "s") : "", c.van].filter(Boolean).join(" · ") }));
              const rows = [...ships, ...colls].sort((a, b) => a.date.localeCompare(b.date));
              const late = rows.filter((r) => r.date < tod).length;
              return (
                <div style={{ ...card, marginBottom: 0, height: "100%", boxSizing: "border-box" }}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 10 }}>
                    <p style={{ ...sect, margin: 0 }}>Coming in · next 7 days</p>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#5a6a85" }}>{ships.length} container{ships.length === 1 ? "" : "s"} · {colls.length} collection{colls.length === 1 ? "" : "s"}</span>
                    {late > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: RED }}>{late} overdue</span>}
                    <span style={{ flex: 1 }} />
                    {canTab("overview") && <button onClick={() => setTab("overview")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#185FA5", padding: 0 }}>Imports ▸</button>}
                    <button onClick={() => setTab("collections")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#185FA5", padding: 0 }}>Collections ▸</button>
                  </div>
                  {rows.length === 0 ? (
                    <div style={{ color: "#8593a8", fontWeight: 600, fontSize: 13, padding: "4px 0" }}>Nothing due in this week.</div>
                  ) : rows.map((r) => (
                    <button key={r.kind + r.id} className="dk-title-link" disabled={r.kind === "ship" && !canTab("shipments")}
                      title={r.kind === "ship" ? (canTab("shipments") ? "Open the shipment" : undefined) : "Open the collection"}
                      onClick={() => (r.kind === "coll" ? (openCollection ? openCollection(r.id) : setTab("collections")) : canTab("shipments") && (openShipment ? openShipment(r.id) : setTab("overview")))}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "7px 0", borderBottom: "1px solid #f0f2f6", fontSize: 13, fontWeight: 700, color: NAVY }}>
                      <span style={{ width: 92, flex: "none", fontSize: 12.5, color: r.date < tod ? RED : r.date === tod ? "#a05f10" : "#5a6a85" }}>{r.date < tod ? "Late · " + prettyDate(r.date).slice(0, 6) : dayLabel(r.date)}</span>
                      <Icon name={r.kind === "ship" ? "ship" : "box"} size={14} stroke="#5a6a85" />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{r.title}</span>
                      <span style={{ flex: 1, color: "#8593a8", fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{r.sub}</span>
                      {r.est && <span title="No expected date on this shipment yet — estimated at 3 months from the order date. Add it under Imports → the shipment → Expected in." style={{ fontSize: 10.5, fontWeight: 800, color: "#8a5a00", background: "#fdf3dc", borderRadius: 999, padding: "1px 7px" }}>est.</span>}
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
          <div className="dk-home-cell" style={{ gridColumn: "span 4", minWidth: 0 }}>
            {crm && <ReviewsCard crm={crm} updateCrm={updateCrm} openInvoice={openInvoice} />}
          </div>
          <div className="dk-home-cell" style={{ gridColumn: "span 2", minWidth: 0 }}>
            <div style={{ ...card, marginBottom: 0, height: "100%", boxSizing: "border-box" }}>
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
          </div>
          <div className="dk-home-cell" style={{ gridColumn: "span 2", minWidth: 0 }}>
            <div style={{ ...card, marginBottom: 0, height: "100%", boxSizing: "border-box" }}>
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
      </div>

      {draft && crm && <TaskModal crm={crm} updateCrm={updateCrm} me={me} draft={draft} askConfirm={askConfirm} onClose={() => setDraft(null)} />}
      <div style={{ height: 30 }} />
    </div>
  );
}
