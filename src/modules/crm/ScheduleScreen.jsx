// Schedule tab: the daily delivery board — invoices grouped by delivery date,
// workflow toggles inline, pending (undated) jobs at the bottom.
import React, { useState, useMemo, useEffect, useRef } from "react";
import { NAVY, GOLD, RED, prettyDate, prettyDateTime, addDays } from "../../lib/core.js";
import {
  RUN_NOS, TIME_SLOTS, DRIVERS, vanOptions,
  invoiceTotals, gbp, isPaid, scheduleStatus, STRIPE_COLOURS, daysSinceRaised, isCollectionJob, invoiceLoadKg, collectionProgress,
  PREP_FLAGS, FOLLOWUP_FLAGS, today,
  isVoidInvoice, applyInvoiceStockDeduction,
} from "../../lib/crmCore.js";
import { Icon, Chip, Tg, sect, lbl, card, abtn, inp, btn, goldBtn, RiskChip, WebStatusChip } from "./ui.jsx";

const RANGE_OPTS = [
  ["upcoming", "Upcoming + last 7 days"],
  ["all", "Everything"],
  ["week", "This week"],
  ["today", "Today"],
];

const dayLabel = (d) => {
  const x = new Date(d + "T00:00:00");
  if (isNaN(x.getTime())) return d;
  return x.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
};

const COLLECTION_BLUE = "#185FA5";
// the board's columns: stripe · customer · driver · run · drop · van · weight · date+time · prep · follow-up · days
const dsCols = (prep) => "4px 46px minmax(220px, 1fr) 82px 120px 88px 84px 60px 104px 58px 196px " + (prep ? "162px 162px " : "") + "66px 42px";
const DROP_NOS = Array.from({ length: 20 }, (_, n) => String(n + 1));
const rowBox = { display: "grid", gap: 10, alignItems: "center", background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, padding: "8px 12px 8px 0", marginBottom: 6, overflow: "hidden" };
const pill = { fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: NAVY, border: "1px solid #c9d0db", borderRadius: 999, background: "#fff", padding: "3px 16px 3px 8px", height: 28, boxSizing: "border-box", cursor: "pointer", maxWidth: "100%" };
// WhatsApp / email the customer a delivery update
const UK_PHONE = (v) => { let d = String(v || "").replace(/\D/g, ""); if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("0")) d = "44" + d.slice(1); return d.length >= 10 ? d : ""; };
const deliveryText = (i, c) => {
  const first = String((c && (c.contact || c.name)) || "").trim().split(/\s+/)[0];
  const when = i.deliveryDate ? new Date(i.deliveryDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "";
  const slot = i.deliveryTime ? (/^(AM|PM)$/.test(i.deliveryTime) ? " (" + i.deliveryTime + ")" : i.deliveryTime === "TBC" ? "" : " at around " + i.deliveryTime) : "";
  return (first ? "Hi " + first : "Hi") + ", it's Deck Kingdom. " +
    (isCollectionJob(i) ? "Your order is ready to collect" + (when ? " from " + when : "") + " at Whitelands Road, Ashton-under-Lyne, OL6 6UG — please call before you come." : when ? "Your delivery is booked for " + when + slot + "." : "We're arranging your delivery date and will be in touch shortly.") +
    " Any questions, just reply or call 0161 399 1837.";
};
const NotifyButtons = ({ i, c }) => {
  const phone = c && (UK_PHONE(c.mobile) || (/^447/.test(UK_PHONE(c.landline)) ? UK_PHONE(c.landline) : ""));
  const email = c && String(c.email || "").includes("@") ? c.email.trim() : "";
  const text = deliveryText(i, c);
  const b = (bg) => ({ width: 26, height: 26, borderRadius: 8, border: "none", background: bg, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, textDecoration: "none" });
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {phone ? <a href={"whatsapp://send?phone=" + phone + "&text=" + encodeURIComponent(text)} title={"WhatsApp the delivery update to " + c.mobile} style={b("#25D36622")}><Icon name="wa" stroke="#128C7E" size={14} /></a>
        : <span title="No mobile number" style={{ ...b("#f0f2f6"), cursor: "default", opacity: 0.5 }}><Icon name="wa" stroke="#aab3c2" size={14} /></span>}
      {email ? <a href={"https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(email) + "&su=" + encodeURIComponent(isCollectionJob(i) ? "Your Deck Kingdom order is ready" : "Your Deck Kingdom delivery") + "&body=" + encodeURIComponent(text.replace(", it's Deck Kingdom. ", ",\n\n") + "\n\nKind regards,\nDeck Kingdom")}
          target="_blank" rel="noopener noreferrer" title={"Email the delivery update to " + email} style={b("#185FA51a")}><Icon name="mail" stroke="#185FA5" size={13} /></a>
        : <span title="No email address" style={{ ...b("#f0f2f6"), cursor: "default", opacity: 0.5 }}><Icon name="mail" stroke="#aab3c2" size={13} /></span>}
    </div>
  );
};

// an editable pill: a small rounded drop-down; the list shows 10 at a time and scrolls
const PillSelect = ({ value, options, placeholder, onChange, tone, labelOf = (o) => o }) => {
  const [box, setBox] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!box) return;
    const shut = (e) => { if (!(e.target.closest && e.target.closest("[data-pill-list]")) && !(ref.current && ref.current.contains(e.target))) setBox(null); };
    const gone = () => setBox(null);
    document.addEventListener("mousedown", shut);
    window.addEventListener("scroll", gone, true);
    return () => { document.removeEventListener("mousedown", shut); window.removeEventListener("scroll", gone, true); };
  }, [box]);
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <>
      <button ref={ref} type="button" title={placeholder}
        onClick={() => { if (box) return setBox(null); const r = ref.current.getBoundingClientRect(); setBox({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 120) }); }}
        style={{ ...pill, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, color: value ? tone || NAVY : "#5a6a85", background: value ? "#fff" : "#f3f5f9", borderColor: box ? NAVY : "#c9d0db" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value ? labelOf(value) : placeholder}</span>
        <span style={{ fontSize: 9, color: "#5a6a85" }}>▾</span>
      </button>
      {box && (
        <div data-pill-list style={{ position: "fixed", left: Math.min(box.left, window.innerWidth - box.width - 8), top: Math.min(box.top, window.innerHeight - 10 * 30 - 20), width: box.width, zIndex: 80,
          maxHeight: 10 * 30 + 8, overflowY: "auto", background: "#fff", border: "1px solid #d5d9e0", borderRadius: 12, boxShadow: "0 10px 30px rgba(11,31,63,.2)", padding: 4 }}>
          {[["", "—"], ...all.map((o) => [o, labelOf(o)])].map(([v, l]) => (
            <button key={v || "none"} type="button" onClick={() => { onChange(v); setBox(null); }}
              style={{ display: "block", width: "100%", height: 30, textAlign: "left", padding: "0 10px", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: v === value ? 800 : 600,
                background: v === value ? "#eef1f6" : "transparent", color: v ? NAVY : "#8593a8" }}>{l}</button>
          ))}
        </div>
      )}
    </>
  );
};
// days since the order came in: grey under 3, amber from 3, red from 5 (finished jobs stay grey)
const SLA_STYLES = { ok: { background: "#eef1f6", color: "#5a6a85" }, warn: { background: "#E8912D", color: "#fff" }, late: { background: RED, color: "#fff" } };
const slaLevel = (days, done) => (done || days === null ? "ok" : days >= 5 ? "late" : days >= 3 ? "warn" : "ok");
const SlaChip = ({ days, done }) => (
  <span title={days === null ? "" : days + " day" + (days === 1 ? "" : "s") + " since the order came in" + (done ? "" : " — amber from 3 days, red from 5")}
    style={{ display: "inline-block", fontSize: 11.5, fontWeight: 800, padding: "1px 8px", borderRadius: 999, whiteSpace: "nowrap", ...SLA_STYLES[slaLevel(days, done)] }}>
    {days === null ? "—" : days + "d"}
  </span>
);

export default function ScheduleScreen({ crm, updateCrm, openInvoice, openCollection, me }) {
  const [search, setSearch] = useState("");
  const [range, setRange] = useState("upcoming");
  const [van, setVan] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const todayRef = useRef(null);
  const [pop, setPop] = useState(null); // { id, rect }: the job whose details are open
  const [dragId, setDragId] = useState(null); // pending job being dragged onto a day
  const [overDate, setOverDate] = useState(null);
  const [overRow, setOverRow] = useState(null);
  const [overPending, setOverPending] = useState(false);
  const [showPrep, setShowPrep] = useState(() => { try { return localStorage.getItem("dk-ds-prep") === "1"; } catch { return false; } });
  const endDrag = () => { setDragId(null); setOverDate(null); setOverRow(null); setOverPending(false); };
  const complete = (id, on) => updateCrm((c) => {
    const t = c.invoices.find((x) => x.id === id);
    if (t) { t.deliveryCompleted = on; applyInvoiceStockDeduction(t, c, on, me); }
    return c;
  });
  // dropped onto another job: same day, driver and run, slotted in just before it; drops renumbered
  const dropBefore = (target) => {
    const id = dragId;
    endDrag();
    if (!id || id === target.id) return;
    updateCrm((c) => {
      const d = c.invoices.find((x) => x.id === id);
      if (!d) return c;
      d.deliveryDate = target.deliveryDate; d.driver = target.driver || ""; d.runNo = target.runNo || "";
      if (!d.jobType || d.jobType === "Pending") d.jobType = "Delivery";
      const same = c.invoices
        .filter((x) => x.id !== d.id && !isVoidInvoice(x) && x.deliveryDate === target.deliveryDate && (x.driver || "") === (target.driver || "") && (x.runNo || "") === (target.runNo || ""))
        .sort((a, b) => (Number(a.dropNo) || 999) - (Number(b.dropNo) || 999));
      const at = same.findIndex((x) => x.id === target.id);
      same.splice(at < 0 ? same.length : at, 0, d);
      same.forEach((x, k) => (x.dropNo = String(k + 1)));
      return c;
    });
  };
  // dropped on the Pending card: no date again
  const unschedule = () => {
    const id = dragId;
    endDrag();
    if (!id) return;
    updateCrm((c) => { const t = c.invoices.find((x) => x.id === id); if (t) { t.deliveryDate = ""; t.dropNo = ""; } return c; });
  };
  const dropOn = (d) => {
    const id = dragId;
    endDrag();
    if (!id) return;
    updateCrm((c) => {
      const t = c.invoices.find((x) => x.id === id);
      if (t) { t.deliveryDate = d; if (!t.jobType || t.jobType === "Pending") t.jobType = "Delivery"; }
      return c;
    });
  };
  // open on today (or the next day with work booked)
  useEffect(() => {
    const el = todayRef.current;
    if (el) el.scrollIntoView({ block: "start" });
  }, []);

  const custById = useMemo(() => {
    const m = {};
    crm.customers.forEach((c) => (m[c.id] = c));
    return m;
  }, [crm.customers]);
  const siteById = useMemo(() => {
    const m = {};
    crm.sites.forEach((s) => (m[s.id] = s));
    return m;
  }, [crm.sites]);

  const setFlag = (invId, k) =>
    updateCrm((c) => {
      const t = c.invoices.find((i) => i.id === invId);
      if (t) t.flags[k] = !t.flags[k];
      return c;
    });

  const vans = useMemo(() => {
    const s = new Set();
    crm.invoices.forEach((i) => i.van && s.add(i.van));
    (crm.collections || []).forEach((c) => c.van && s.add(c.van));
    return [...s].sort();
  }, [crm.invoices, crm.collections]);

  const tod = today();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const q = search.trim().toLowerCase();
  const visible = crm.invoices.filter((i) => {
    if (isVoidInvoice(i)) return false; // refunded / cancelled on the website
    if (hideDone && i.deliveryCompleted) return false;
    if (van && i.van !== van) return false;
    if (q) {
      const c = custById[i.customerId];
      const s = siteById[i.siteId];
      const hay = [String(i.invNo || ""), c && c.name, c && c.postcode, s && s.postcode, s && s.name, i.van].map((v) => String(v || "").toLowerCase());
      if (!hay.some((v) => v.includes(q))) return false;
    }
    if (!i.deliveryDate) return true; // pending section always shows
    if (range === "all") return true;
    if (range === "today") return i.deliveryDate === tod;
    if (range === "week") return i.deliveryDate >= tod && i.deliveryDate <= weekEnd;
    return i.deliveryDate >= weekAgo; // upcoming + last 7 days
  });

  // collections ride the same board: a van picking up from a UK supplier is a run too
  const visibleColls = (crm.collections || []).filter((c) => {
    if (hideDone) { const pr = collectionProgress(c); if (pr.total > 0 && pr.pending === 0) return false; }
    if (van && c.van !== van) return false;
    if (q && ![("col-" + (c.collectionNo || "")), c.supplier, c.postcode, c.van].some((v) => String(v || "").toLowerCase().includes(q))) return false;
    if (!c.collectDate) return true;
    if (range === "all") return true;
    if (range === "today") return c.collectDate === tod;
    if (range === "week") return c.collectDate >= tod && c.collectDate <= weekEnd;
    return c.collectDate >= weekAgo;
  });

  const entries = [
    ...visible.map((i) => ({ kind: "inv", date: i.deliveryDate, time: i.deliveryTime || "", obj: i })),
    ...visibleColls.map((c) => ({ kind: "col", date: c.collectDate, time: c.collectTime || "", obj: c })),
  ];
  const dated = entries.filter((e) => e.date).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const pending = entries.filter((e) => !e.date).sort((a, b) => ((a.obj.date || "")).localeCompare(b.obj.date || ""));

  const groups = [];
  dated.forEach((e) => {
    const g = groups[groups.length - 1];
    if (g && g.date === e.date) g.rows.push(e);
    else groups.push({ date: e.date, rows: [e] });
  });
  // the next 7 days always show, even when empty, so pending jobs can be dropped onto them
  if (range !== "today" && !q) {
    for (let n = 0; n < 7; n++) {
      const d = addDays(tod, n);
      if (!groups.some((g) => g.date === d)) groups.push({ date: d, rows: [] });
    }
    groups.sort((a, b) => a.date.localeCompare(b.date));
  }
  // within a day: driver → run → drop → time; collections after
  const numOr = (v, big) => (v === "" || v === undefined || v === null || isNaN(Number(v)) ? big : Number(v));
  // sort key: named drivers A–Z, then jobs with no driver yet, then supplier collections
  // run number first (every driver's run 1, then run 2 …), then driver, then drop
  const runKey = (e) => (e.kind === "inv" ? "0|" + String(numOr(e.obj.runNo, 99)).padStart(2, "0") + "|" + (e.obj.driver ? "0" + e.obj.driver : "1") : "2|collections");
  groups.forEach((g) =>
    g.rows.sort((a, b) =>
      runKey(a).localeCompare(runKey(b)) ||
      (a.kind === "inv" && b.kind === "inv" ? numOr(a.obj.dropNo, 999) - numOr(b.obj.dropNo, 999) : 0) ||
      (a.time || "").localeCompare(b.time || "")));

  const setInv = (invId, fn) =>
    updateCrm((c) => {
      const t = c.invoices.find((x) => x.id === invId);
      if (t) fn(t);
      return c;
    });
  const setColl = (cid, fn) =>
    updateCrm((c) => {
      const t = (c.collections || []).find((x) => x.id === cid);
      if (t) fn(t);
      return c;
    });

  // one job on the board: name · postcode · source, then editable pills
  const Row = ({ i }) => {
    const [hover, setHover] = useState(false);
    const c = custById[i.customerId];
    const s = siteById[i.siteId];
    const status = scheduleStatus(i);
    const days = daysSinceRaised(i);
    const kg = invoiceLoadKg(i, crm);
    const stamp = [
      i.created || i.date ? "Raised " + prettyDate(i.created || i.date) + (i.raisedBy ? " by " + i.raisedBy.split("@")[0] : "") : "",
      i.updatedAt ? "Updated " + prettyDateTime(i.updatedAt) + (i.modifiedBy ? " by " + i.modifiedBy.split("@")[0] : "") : "",
    ].filter(Boolean);
    const done = !!i.deliveryCompleted;
    return (
      <div style={{ ...rowBox, gridTemplateColumns: dsCols(showPrep), background: done ? "#e9f6ee" : "#fff", borderColor: done ? "#bfe3ca" : overRow === i.id ? GOLD : "#e6e9ef",
          boxShadow: overRow === i.id ? "0 -3px 0 " + GOLD : "none", opacity: dragId === i.id ? 0.45 : 1 }}
        onDragOver={(ev) => { if (dragId && dragId !== i.id) { ev.preventDefault(); ev.stopPropagation(); if (overRow !== i.id) setOverRow(i.id); } }}
        onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget)) setOverRow((r) => (r === i.id ? null : r)); }}
        onDrop={(ev) => { ev.preventDefault(); ev.stopPropagation(); dropBefore(i); }}>
        <div style={{ width: 4, alignSelf: "stretch", borderRadius: "12px 0 0 12px", margin: "-8px 0", background: done ? "#3FA55C" : STRIPE_COLOURS[status] }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span draggable title="Drag to move — onto another job, another day, or back to Pending"
            onDragStart={(ev) => { ev.dataTransfer.setData("text/plain", i.id); ev.dataTransfer.effectAllowed = "move"; setDragId(i.id); }}
            onDragEnd={endDrag}
            style={{ cursor: "grab", color: "#aab3c2", fontSize: 14, lineHeight: 1, padding: "4px 1px", userSelect: "none" }}>⋮⋮</span>
          <button type="button" title={done ? "Completed — click to undo" : "Mark the delivery complete"} onClick={() => complete(i.id, !done)}
            style={{ width: 18, height: 18, borderRadius: 999, border: "2px solid " + (done ? "#3FA55C" : "#b8c0cc"), background: "#fff", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            {done && <span style={{ width: 9, height: 9, borderRadius: 999, background: "#3FA55C" }} />}
          </button>
        </div>
        <div style={{ minWidth: 0, position: "relative" }} onMouseEnter={(ev) => setHover(ev.currentTarget.getBoundingClientRect())} onMouseLeave={() => setHover(false)}>
          <div style={{ display: "flex", gap: 7, alignItems: "center", minWidth: 0 }}>
            <button className="dk-title-link" onClick={(e) => { setHover(false); setPop({ id: i.id, rect: e.currentTarget.getBoundingClientRect() }); }}
              style={{ fontWeight: 700, fontSize: 13.5, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
              {c ? c.name || "Unnamed" : "No customer"}
            </button>
            <RiskChip inv={i} /><WebStatusChip inv={i} />
          </div>
          {hover && stamp.length > 0 && pop?.id !== i.id && (
            <div style={{ position: "fixed", left: hover.left, top: hover.bottom + 4, zIndex: 60, background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, padding: "6px 10px", boxShadow: "0 8px 24px rgba(11,31,63,.2)", whiteSpace: "nowrap", fontSize: 11.5, fontWeight: 600, color: NAVY, lineHeight: 1.6, pointerEvents: "none" }}>
              {stamp.map((l) => <div key={l}>{l}</div>)}
            </div>
          )}
        </div>
        <span style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 700, whiteSpace: "nowrap" }}>{(s && s.postcode) || (c && c.postcode) || "—"}</span>
        <span style={{ minWidth: 0, overflow: "hidden" }}>{c && c.source ? <Chip style={{ fontSize: 10.5, padding: "1px 8px", whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{c.source}</Chip> : <span style={{ color: "#aab3c2" }}>—</span>}</span>
        <PillSelect value={i.driver || ""} options={DRIVERS} placeholder="Driver" onChange={(v) => setInv(i.id, (t) => (t.driver = v))} />
        <PillSelect value={i.runNo || ""} options={RUN_NOS} placeholder="Run" labelOf={(o) => "Run " + o} onChange={(v) => setInv(i.id, (t) => (t.runNo = v))} />
        <PillSelect value={i.dropNo || ""} options={DROP_NOS} placeholder="#" onChange={(v) => setInv(i.id, (t) => (t.dropNo = v))} />
        <PillSelect value={i.van || ""} options={vanOptions(crm)} placeholder="Van" onChange={(v) => setInv(i.id, (t) => (t.van = v))} />
        <div style={{ textAlign: "right", fontSize: 12.5, fontWeight: 700 }}>{kg === null ? "—" : kg.toLocaleString("en-GB", { maximumFractionDigits: 0 }) + " kg"}</div>
        <div style={{ display: "flex", gap: 4 }}>
          <input type="date" value={i.deliveryDate || ""} onChange={(e) => setInv(i.id, (t) => (t.deliveryDate = e.target.value))} style={{ ...pill, width: 116, flex: "none", padding: "3px 8px" }} />
          <PillSelect value={i.deliveryTime || ""} options={TIME_SLOTS} placeholder="Time" onChange={(v) => setInv(i.id, (t) => (t.deliveryTime = v))} />
        </div>
        {showPrep && (
          <div style={{ display: "flex", gap: 3 }}>
            {PREP_FLAGS.map(([k, label, icon]) => (
              <Tg key={k} on={i.flags[k]} na={k === "courier" && isCollectionJob(i) && !i.flags[k]} title={label} icon={icon} onClick={() => setFlag(i.id, k)} />
            ))}
          </div>
        )}
        {showPrep && (
          <div style={{ display: "flex", gap: 3 }}>
            {FOLLOWUP_FLAGS.map(([k, label, icon]) => (
              <Tg key={k} on={i.flags[k]} title={label} icon={icon} onClick={() => setFlag(i.id, k)} />
            ))}
          </div>
        )}
        <NotifyButtons i={i} c={c} />
        <div style={{ textAlign: "right" }}><SlaChip days={days} done={i.deliveryCompleted} /></div>
      </div>
    );
  };

  const CollRow = ({ c }) => {
    const pr = collectionProgress(c);
    const done = pr.total > 0 && pr.pending === 0;
    const items = (c.items || []).reduce((t, it) => t + (Number(it.qty) || 0), 0);
    return (
      <div style={{ ...rowBox, gridTemplateColumns: dsCols(showPrep), background: c.collected ? "#e9f6ee" : "#fff", borderColor: c.collected ? "#bfe3ca" : "#e6e9ef" }}>
        <div style={{ width: 4, alignSelf: "stretch", borderRadius: "12px 0 0 12px", margin: "-8px 0", background: c.collected ? "#3FA55C" : COLLECTION_BLUE }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <button type="button" title={c.collected ? "Collected — click to undo" : "Mark as collected"} onClick={() => setColl(c.id, (t) => (t.collected = !t.collected))}
            style={{ width: 18, height: 18, borderRadius: 999, border: "2px solid " + (c.collected ? "#3FA55C" : "#b8c0cc"), background: "#fff", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            {c.collected && <span style={{ width: 9, height: 9, borderRadius: 999, background: "#3FA55C" }} />}
          </button>
        </div>
        <div style={{ display: "flex", gap: 7, alignItems: "center", minWidth: 0 }}>
          <button className="dk-title-link" onClick={() => openCollection && openCollection(c.id)}
            style={{ fontWeight: 700, fontSize: 13.5, color: COLLECTION_BLUE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Collection — {c.supplier || "supplier"}
          </button>
        </div>
        <span style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 700, whiteSpace: "nowrap" }}>{c.postcode || "—"}</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: COLLECTION_BLUE }}>COL-{c.collectionNo || "—"}</span>
        <span />
        <span style={{ fontSize: 12, fontWeight: 700, color: COLLECTION_BLUE }}>Pick up</span>
        <span />
        <PillSelect value={c.van || ""} options={vanOptions(crm)} placeholder="Van" onChange={(v) => setColl(c.id, (t) => (t.van = v))} />
        <div style={{ textAlign: "right", fontSize: 12.5, fontWeight: 700 }}>{items ? items + " pcs" : "—"}</div>
        <div style={{ display: "flex", gap: 4 }}>
          <input type="date" value={c.collectDate || ""} onChange={(e) => setColl(c.id, (t) => (t.collectDate = e.target.value))} style={{ ...pill, width: 118, padding: "3px 8px" }} />
          <PillSelect value={c.collectTime || ""} options={TIME_SLOTS} placeholder="Time" onChange={(v) => setColl(c.id, (t) => (t.collectTime = v))} />
        </div>
        <div style={{ gridColumn: showPrep ? "span 3" : "span 1", fontSize: 12, fontWeight: 700 }}>
          {done ? <Chip tone="green">Processed</Chip> : pr.done > 0 ? <Chip tone="gold">{pr.done}/{pr.total} processed</Chip> : c.collected ? <span style={{ color: "#28713e" }}>Collected</span> : null}
        </div>
        <span />
      </div>
    );
  };

  // column titles under each day
  const ColHeads = () => (
    <div style={{ display: "grid", gridTemplateColumns: dsCols(showPrep), gap: 10, alignItems: "center", padding: "0 12px 4px 0" }}>
      {["", "Done", "Customer", "Postcode", "Source", "Driver", "Run", "Drop", "Van", "Weight", "Date · time", ...(showPrep ? ["Prep", "Follow-up"] : []), "Update", "Days"].map((h, k, all) => (
        <span key={k} style={{ fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", whiteSpace: "nowrap", textAlign: h === "Weight" || h === "Days" ? "right" : "left" }}>{h}</span>
      ))}
    </div>
  );

  const PendingRow = ({ e }) => {
    const [hover, setHover] = useState(false);
    if (e.kind === "col") {
      const c = e.obj;
      return (
        <button className="dk-title-link" onClick={() => openCollection && openCollection(c.id)}
          style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 8px", width: "100%", padding: "8px 0", borderBottom: "1px solid #f0f2f6", textAlign: "left" }}>
          <b style={{ fontSize: 13, color: COLLECTION_BLUE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.supplier || "Supplier"} · collection</b>
          <span />
          <span style={{ fontSize: 11.5, color: "#5a6a85", fontWeight: 600 }}>{c.postcode || "—"} · COL-{c.collectionNo || "—"}</span>
        </button>
      );
    }
    const i = e.obj;
    const c = custById[i.customerId];
    const st = siteById[i.siteId];
    const days = daysSinceRaised(i);

    const kg = invoiceLoadKg(i, crm);
    const extra = [
      "Invoice #" + (i.invNo || "—") + " · " + gbp(invoiceTotals(i).total) + (isPaid(i) ? " · paid" : i.paymentType === "COD" ? " · COD" : " · awaiting payment"),
      st && st.name ? "Site: " + [st.name, st.town].filter(Boolean).join(", ") : c ? "Invoice address" + (c.town ? ", " + c.town : "") : "",
      i.van ? "Van: " + i.van : "",
      kg !== null ? "Load ≈ " + kg.toLocaleString("en-GB", { maximumFractionDigits: 0 }) + " kg" : "",
      "Prep " + PREP_FLAGS.filter(([k]) => i.flags[k]).length + "/" + PREP_FLAGS.length,
      c && c.source ? "Source: " + c.source : "",
      i.raisedBy ? "Raised by " + i.raisedBy.split("@")[0] + (i.date ? " on " + prettyDate(i.date) : "") : i.date ? "Ordered " + prettyDate(i.date) : "",
      i.jobNotes ? "Notes: " + String(i.jobNotes).slice(0, 80) : "",
    ].filter(Boolean);
    return (
      <div style={{ position: "relative" }} onMouseEnter={(ev) => setHover(ev.currentTarget.getBoundingClientRect())} onMouseLeave={() => setHover(false)}>
        <button className="dk-title-link" draggable title="Drag onto a day to book it, or click to set a date"
          onDragStart={(ev) => { ev.dataTransfer.setData("text/plain", i.id); ev.dataTransfer.effectAllowed = "move"; setDragId(i.id); setHover(false); }}
          onDragEnd={() => { setDragId(null); setOverDate(null); }}
          onClick={(ev) => { setHover(false); setPop({ id: i.id, rect: ev.currentTarget.getBoundingClientRect(), side: "left" }); }}
          style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 8px", width: "100%", padding: "8px 0", borderBottom: "1px solid #f0f2f6", textAlign: "left", alignItems: "center" }}>
          <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
            <b style={{ fontSize: 13, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c ? c.name || "Unnamed" : "No customer"}</b>
            <RiskChip inv={i} /><WebStatusChip inv={i} />
          </span>
          <SlaChip days={days} />
          <span style={{ fontSize: 11.5, color: "#5a6a85", fontWeight: 600 }}>
            {(st && st.postcode) || (c && c.postcode) || "—"} · <span style={{ color: isCollectionJob(i) ? "#9a7408" : "#5a6a85" }}>{i.jobType || "—"}</span>
          </span>
          <span />
        </button>
        {hover && (
          <div style={{ position: "fixed", left: Math.max(8, hover.left - 290), top: Math.min(hover.top, window.innerHeight - 200), zIndex: 60, width: 270, pointerEvents: "none", background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, padding: "8px 12px", boxShadow: "0 8px 24px rgba(11,31,63,.2)", fontSize: 12, fontWeight: 600, lineHeight: 1.6, color: NAVY }}>
            {extra.map((l, k) => <div key={k}>{l}</div>)}
          </div>
        )}
      </div>
    );
  };

  const GroupHead = ({ label, meta, red }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, background: red ? RED : NAVY, color: "#fff", borderRadius: 12, padding: "10px 16px", margin: "18px 0 8px", flexWrap: "wrap" }}>
      <b style={{ color: red ? "#fff" : GOLD, fontSize: 15 }}>{label}</b>
      <span style={{ fontSize: 12.5, color: red ? "#ffd8dd" : "#cfd6e4", fontWeight: 600 }}>{meta}</span>
    </div>
  );

  const groupMeta = (rows) => {
    const invs = rows.filter((e) => e.kind === "inv").map((e) => e.obj);
    const cols = rows.filter((e) => e.kind === "col");
    const kg = invs.reduce((t, i) => t + (invoiceLoadKg(i, crm) || 0), 0);
    const vansUsed = [...new Set(rows.map((e) => e.obj.van).filter(Boolean))];
    return (
      invs.length + (invs.length === 1 ? " job" : " jobs") +
      (cols.length ? " · " + cols.length + (cols.length === 1 ? " collection" : " collections") : "") +
      (kg ? " · " + kg.toLocaleString("en-GB") + " kg loading" : "") +
      (vansUsed.length ? " · " + vansUsed.join(" + ") : "")
    );
  };

  return (
    <div style={{ padding: "16px 20px" }}>
      {/* filters */}
      <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px", marginBottom: 10 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 300 }}>
          <span style={{ position: "absolute", left: 11, top: 10 }}><Icon name="search" /></span>
          <input style={{ ...inp, paddingLeft: 34 }} placeholder="Search customer, postcode, inv #…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select style={{ ...inp, width: "auto" }} value={range} onChange={(e) => setRange(e.target.value)}>
          {RANGE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select style={{ ...inp, width: "auto" }} value={van} onChange={(e) => setVan(e.target.value)}>
          <option value="">All vans</option>
          {vans.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <label style={{ fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide completed
        </label>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setShowPrep((v) => { try { localStorage.setItem("dk-ds-prep", v ? "0" : "1"); } catch {} return !v; })}
          style={{ ...btn, padding: "6px 11px", fontSize: 12.5 }}>{showPrep ? "▾ Hide" : "▸ Show"} prep &amp; follow-up</button>
      </div>

      {/* legend */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", fontSize: 12, fontWeight: 600, color: "#5a6a85", margin: "0 0 4px 4px" }}>
        {[["Ready to go", STRIPE_COLOURS.green], ["Prep outstanding", STRIPE_COLOURS.amber], ["Customer collection", STRIPE_COLOURS.gold], ["Supplier collection", COLLECTION_BLUE], ["No date set", STRIPE_COLOURS.red]].map(([l, k]) => (
          <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: k, display: "inline-block" }} />{l}
          </span>
        ))}
        <span style={{ marginLeft: 10 }}>Prep: booked · courier · parts ordered · parts ready · payment link</span>
        <span>Follow-up: review asked · review in · photos · social · sample</span>
      </div>

      <div className="dk-sched-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 14, alignItems: "start" }}>
      <div style={{ minWidth: 0 }}>
      {groups.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: "36px 10px", color: "#5a6a85", fontWeight: 600, marginTop: 14 }}>
          Nothing booked{q || van || hideDone ? " for these filters" : " yet"} — set a delivery date on a job and it appears here.
        </div>
      )}

      {groups.map((g, gi) => (
        <div key={g.date} ref={g.date >= tod && (gi === 0 || groups[gi - 1].date < tod) ? todayRef : undefined}
          onDragOver={(ev) => { if (dragId) { ev.preventDefault(); if (overDate !== g.date) setOverDate(g.date); } }}
          onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget)) setOverDate((d) => (d === g.date ? null : d)); }}
          onDrop={(ev) => { ev.preventDefault(); dropOn(g.date); }}
          style={{ scrollMarginTop: 70, borderRadius: 14, outline: overDate === g.date ? "2px dashed " + GOLD : "none", outlineOffset: 4, background: overDate === g.date ? "#fff8e6" : "transparent" }}>
          <GroupHead label={dayLabel(g.date)} meta={g.rows.length ? groupMeta(g.rows) : "nothing booked"} />
          {g.rows.length === 0 ? (
            <div style={{ border: "1.5px dashed #d5d9e0", borderRadius: 12, padding: "10px 14px", fontSize: 12.5, fontWeight: 600, color: "#8593a8" }}>
              {dragId ? "Drop here to book it for " + dayLabel(g.date) : "Nothing booked — drag a pending job here"}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: showPrep ? 1560 : 1240 }}>
                <ColHeads />
                {g.rows.map((e, k) => {
                  const key = runKey(e), prevKey = k ? runKey(g.rows[k - 1]) : null;
                  const sameRun = g.rows.filter((x) => runKey(x) === key);
                  const runKg = e.kind === "inv" ? sameRun.reduce((t, x) => t + (invoiceLoadKg(x.obj, crm) || 0), 0) : 0;
                  const head = key !== prevKey && g.rows.some((x) => runKey(x) !== key) ? (
                    <div style={{ display: "grid", gridTemplateColumns: dsCols(showPrep), gap: 10, alignItems: "center", padding: "0 12px 0 0", margin: k ? "12px 0 4px" : "2px 0 4px",
                      background: "#eef1f6", borderRadius: 8, minHeight: 28 }}>
                      <span />
                      <span style={{ gridColumn: "span 8", fontSize: 12, fontWeight: 800, color: NAVY, paddingLeft: 2 }}>
                        {e.kind === "col" ? "Supplier collections" : (e.obj.runNo ? "Run " + e.obj.runNo : "No run yet") + " · " + (e.obj.driver || "no driver yet")}
                        <span style={{ fontWeight: 600, color: "#5a6a85", marginLeft: 8 }}>
                          {sameRun.length} {e.kind === "col" ? "pick-up" + (sameRun.length === 1 ? "" : "s") : "drop" + (sameRun.length === 1 ? "" : "s")}
                        </span>
                      </span>
                      <span style={{ textAlign: "right", fontSize: 12.5, fontWeight: 800, color: NAVY, whiteSpace: "nowrap" }} title="Total weight on this run">
                        {e.kind === "inv" ? (runKg ? Math.round(runKg).toLocaleString("en-GB") + " kg" : "—") : ""}
                      </span>
                    </div>
                  ) : null;
                  return (
                    <React.Fragment key={e.kind + e.obj.id}>
                      {head}
                      {e.kind === "col" ? <CollRow c={e.obj} /> : <Row i={e.obj} />}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ))}

      </div>

      {/* pending: always in view on the right */}
      <div style={{ ...card, marginBottom: 0, position: "sticky", top: 70, maxHeight: "calc(100vh - 90px)", overflowY: "auto", padding: "12px 16px",
          outline: overPending ? "2px dashed " + GOLD : "none", outlineOffset: 3, background: overPending ? "#fff8e6" : "#fff" }}
        onDragOver={(ev) => { const it = dragId && crm.invoices.find((x) => x.id === dragId); if (it && it.deliveryDate) { ev.preventDefault(); setOverPending(true); } }}
        onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget)) setOverPending(false); }}
        onDrop={(ev) => { ev.preventDefault(); unschedule(); }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <p style={{ ...sect, margin: 0, color: pending.length ? RED : "#8593a8" }}>Pending — no date</p>
          <span style={{ flex: 1 }} />
          <b style={{ fontSize: 15, color: pending.length ? RED : "#aab3c2" }}>{pending.length}</b>
        </div>
        <div style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, marginBottom: 4 }}>Oldest first · days since the order came in</div>
        {pending.length === 0 ? (
          <div style={{ fontSize: 13, color: "#8593a8", fontWeight: 600, padding: "6px 0" }}>Everything's booked in.</div>
        ) : pending.map((e) => <PendingRow key={e.kind + e.obj.id} e={e} />)}
      </div>
      </div>
      <div style={{ height: 30 }} />
      {pop && (() => {
        const i = crm.invoices.find((x) => x.id === pop.id);
        if (!i) return null;
        const c = custById[i.customerId];
        const s = siteById[i.siteId];
        const t = invoiceTotals(i);
        const addr = s ? [s.name !== s.address ? s.name : "", s.address, s.town, s.postcode] : c ? [c.address, c.town, c.postcode] : [];
        const contact = [(s && s.contact) || (c && c.contact), (s && (s.mobile || s.landline)) || (c && (c.mobile || c.landline))].filter(Boolean).join(" · ");
        const top = Math.min(pop.rect.bottom + 6, window.innerHeight - 420);
        return (
          <>
            <div onMouseDown={() => setPop(null)} style={{ position: "fixed", inset: 0, zIndex: 70 }} />
            <div style={{ position: "fixed", left: pop.side === "left" ? Math.max(10, pop.rect.left - 430) : Math.min(pop.rect.left, window.innerWidth - 440), top: Math.max(10, pop.side === "left" ? Math.min(pop.rect.top, window.innerHeight - 440) : top), zIndex: 71, width: 420, maxHeight: 440, overflowY: "auto",
              background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, boxShadow: "0 14px 40px rgba(11,31,63,.28)", padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <b style={{ fontSize: 15, color: NAVY }}>{c ? c.name || "Unnamed" : "No customer"}</b>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#185FA5" }}>#{i.invNo || "—"}</span>
                <span style={{ flex: 1 }} />
                <button style={{ ...abtn, border: "none" }} title="Close" onClick={() => setPop(null)}><Icon name="x" /></button>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", background: i.deliveryDate ? "#f7f9fc" : "#fff8e6", border: "1px solid " + (i.deliveryDate ? "#e6e9ef" : "#f4d78f"), borderRadius: 10, padding: "6px 10px", marginBottom: 10 }}>
                <span style={{ ...lbl, marginBottom: 0 }}>{isCollectionJob(i) ? "Collection date" : "Delivery date"}</span>
                <input type="date" value={i.deliveryDate || ""} style={{ ...pill, width: 130, padding: "3px 8px" }}
                  onChange={(e) => { const v = e.target.value; setInv(i.id, (t) => { t.deliveryDate = v; if (v && (!t.jobType || t.jobType === "Pending")) t.jobType = "Delivery"; }); }} />
                <span style={{ flex: 1 }} />
                {!i.deliveryDate && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#a05f10" }}>not booked</span>}
              </div>
              <span style={lbl}>{s ? "Deliver to (site)" : isCollectionJob(i) ? "Customer collects" : "Deliver to (invoice address)"}</span>
              <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, lineHeight: 1.5, marginBottom: 4 }}>
                {addr.filter(Boolean).map((l, k) => <div key={k}>{l}</div>)}
                {contact && <div style={{ color: "#5a6a85" }}>{contact}</div>}
              </div>
              <span style={{ ...lbl, marginTop: 8 }}>Lines</span>
              {(i.lines || []).length === 0 ? <div style={{ fontSize: 12.5, color: "#8593a8" }}>No lines</div> : (i.lines || []).map((l) => (
                <div key={l.id} style={{ display: "flex", gap: 8, fontSize: 12.5, fontWeight: 600, padding: "2px 0", color: NAVY }}>
                  <b style={{ width: 34, textAlign: "right", flex: "none" }}>{l.qty}×</b>
                  <span style={{ flex: 1 }}>{l.description}{l.colour ? " · " + l.colour : ""}</span>
                  <span style={{ color: "#5a6a85" }}>{gbp((Number(l.qty) || 0) * (Number(l.price) || 0))}</span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid #f0f2f6", marginTop: 6, paddingTop: 6, fontSize: 12.5, fontWeight: 700, color: NAVY, display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 10px" }}>
                {Number(i.deliveryCharge) ? <><span style={{ color: "#5a6a85" }}>Delivery</span><span>{gbp(Number(i.deliveryCharge))}</span></> : null}
                <span>Total</span><span>{gbp(t.total)}</span>
                <span style={{ color: isPaid(i) ? "#28713e" : "#a05f10" }}>{isPaid(i) ? "Paid" + (i.paymentType ? " · " + i.paymentType : "") : i.paymentType === "COD" ? "Cash on delivery" : "Awaiting payment"}</span><span />
              </div>
              {i.jobNotes && <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: "#6b5305", background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "6px 10px" }}>{i.jobNotes}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button style={goldBtn} onClick={() => { setPop(null); openInvoice(i.id); }}><Icon name="doc" stroke={NAVY} />Open job</button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
