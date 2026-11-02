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
import { printJobDocs, DOC_KINDS } from "./printDocs.js";
import { JOB_TYPES, skuIndex, PAYMENT_TYPES } from "../../lib/crmCore.js";
import { Icon, Chip, Tg, sect, lbl, card, abtn, inp, btn, goldBtn, RiskChip, WebStatusChip, Soon } from "./ui.jsx";

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
const short16 = (t) => (String(t).length > 16 ? String(t).slice(0, 15).trimEnd() + "…" : String(t));
// stripe · done · customer · postcode · source · job type · driver · run · drop · van · weight · date+time · [prep · follow-up] · update · days
const dsCols = (prep) => "4px 50px 150px 70px 100px 116px 80px 72px 46px 80px 60px minmax(134px, 1fr) " + (prep ? "162px 162px " : "") + "98px 42px";
const DROP_NOS = Array.from({ length: 20 }, (_, n) => String(n + 1));
const rowBox = { display: "grid", gap: 7, alignItems: "center", background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, padding: "8px 12px 8px 0", marginBottom: 6, overflow: "hidden" };
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
const NotifyButtons = ({ i, c, onSent = () => {} }) => {
  const phone = phoneOf(c);
  const email = emailOf(c);
  const text = deliveryText(i, c);
  const b = (bg) => ({ width: 26, height: 26, borderRadius: 8, border: "none", background: bg, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, textDecoration: "none" });
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {phone ? <a href={"whatsapp://send?phone=" + phone + "&text=" + encodeURIComponent(text)} onClick={() => onSent("wa")} title={"WhatsApp the delivery update to " + c.mobile} style={b("#25D36622")}><Icon name="wa" stroke="#128C7E" size={14} /></a>
        : <span title="No mobile number" style={{ ...b("#f0f2f6"), cursor: "default", opacity: 0.5 }}><Icon name="wa" stroke="#aab3c2" size={14} /></span>}
      {email ? <a href={gmailLink(i, c, email)} onClick={() => onSent("email")}
          target="_blank" rel="noopener noreferrer" title={"Email the delivery update to " + email} style={b("#185FA51a")}><Icon name="mail" stroke="#185FA5" size={13} /></a>
        : <span title="No email address" style={{ ...b("#f0f2f6"), cursor: "default", opacity: 0.5 }}><Icon name="mail" stroke="#aab3c2" size={13} /></span>}
    </div>
  );
};

const gmailLink = (i, c, email) => "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(email) +
  "&su=" + encodeURIComponent(isCollectionJob(i) ? "Your Deck Kingdom order is ready" : "Your Deck Kingdom delivery") +
  "&body=" + encodeURIComponent(deliveryText(i, c).replace(", it's Deck Kingdom. ", ",\n\n") + "\n\nKind regards,\nDeck Kingdom");
const phoneOf = (c) => c && (UK_PHONE(c.mobile) || (/^447/.test(UK_PHONE(c.landline)) ? UK_PHONE(c.landline) : ""));
const emailOf = (c) => (c && String(c.email || "").includes("@") ? c.email.trim() : "");
// who's been told what: { jobs: { invId: { date, time, at, by, via[] } }, days: { date: { at, by } } }
const notifyBook = (crm) => ({ jobs: {}, days: {}, ...((crm && crm.dsNotify) || {}) });
// told about the date/time it has now?
const notifyState = (i, crm) => {
  const n = notifyBook(crm).jobs[i.id];
  if (!n) return { state: "none" };
  return { state: n.date === (i.deliveryDate || "") && n.time === (i.deliveryTime || "") ? "ok" : "changed", n };
};
const shortStamp = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); };
const linesKg = (l, i, crm) => invoiceLoadKg({ ...i, lines: [l], weightKg: "" }, crm);

// print / save as PDF: pick loading ticket, delivery ticket, invoice — or all three
const PrintMenu = ({ onPick, label, dark, title = "Print or save as PDF" }) => {
  const [box, setBox] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!box) return;
    const shut = (e) => { if (!(e.target.closest && e.target.closest("[data-print-menu]")) && !(ref.current && ref.current.contains(e.target))) setBox(null); };
    const gone = () => setBox(null);
    document.addEventListener("mousedown", shut);
    window.addEventListener("scroll", gone, true);
    return () => { document.removeEventListener("mousedown", shut); window.removeEventListener("scroll", gone, true); };
  }, [box]);
  const pick = (kinds) => { setBox(null); onPick(kinds); };
  return (
    <>
      <button ref={ref} type="button" title={title}
        onClick={(e) => { e.stopPropagation(); if (box) return setBox(null); const r = ref.current.getBoundingClientRect(); setBox({ left: r.right - 210, top: r.bottom + 4, up: r.bottom > window.innerHeight - 190 ? r.top : 0 }); }}
        style={label
          ? { display: "inline-flex", alignItems: "center", gap: 6, border: dark ? "1px solid #3a4d6e" : "1px solid #d5d9e0", background: dark ? "transparent" : "#fff", color: dark ? "#fff" : NAVY, borderRadius: 8, padding: "5px 10px", fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }
          : { width: 26, height: 26, borderRadius: 8, border: "none", background: "#eef1f6", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flex: "none" }}>
        <Icon name="print" stroke={dark ? "#fff" : NAVY} size={label ? 13 : 14} />{label}{label && <span style={{ fontSize: 9, opacity: 0.8 }}>▾</span>}
      </button>
      {box && (
        <div data-print-menu style={{ position: "fixed", left: Math.max(8, box.left), ...(box.up ? { bottom: window.innerHeight - box.up + 4 } : { top: box.top }), width: 210, zIndex: 85,
          background: "#fff", border: "1px solid #d5d9e0", borderRadius: 12, boxShadow: "0 10px 30px rgba(11,31,63,.2)", padding: 4 }}>
          {[...DOC_KINDS.map(([k, l]) => [[k], l]), [DOC_KINDS.map(([k]) => k), "All three"]].map(([kinds, l], n) => (
            <button key={l} type="button" onClick={() => pick(kinds)}
              style={{ display: "block", width: "100%", height: 32, textAlign: "left", padding: "0 10px", border: "none", borderTop: n === 3 ? "1px solid #eef1f6" : "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: n === 3 ? 800 : 600, background: "transparent", color: NAVY }}>{l}</button>
          ))}
          <div style={{ fontSize: 10.5, color: "#8593a8", fontWeight: 600, padding: "4px 10px 6px" }}>Opens the print window — choose "Save as PDF" there for a file.</div>
        </div>
      )}
    </>
  );
};

// date pill showing just the day ("21st"); click opens the calendar
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
const DayPill = ({ value, onChange }) => {
  const ref = useRef(null);
  const d = value ? new Date(value + "T00:00:00") : null;
  const ok = d && !isNaN(d.getTime());
  return (
    <span style={{ position: "relative", flex: "none" }}>
      <button type="button" title={ok ? d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " — click to change" : "Set a date"}
        onClick={() => { const el = ref.current; if (!el) return; try { el.showPicker(); } catch { el.focus(); el.click(); } }}
        style={{ ...pill, width: 50, padding: "3px 6px", textAlign: "center", color: ok ? NAVY : "#5a6a85", background: ok ? "#fff" : "#f3f5f9" }}>
        {ok ? ordinal(d.getDate()) : "Date"}
      </button>
      <input ref={ref} type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} tabIndex={-1}
        style={{ position: "absolute", left: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: "none", border: 0, padding: 0 }} />
    </span>
  );
};

// raised / updated line under a pop-over title
const Stamp = ({ lines }) => {
  const l = lines.filter(Boolean);
  return l.length ? <div style={{ fontSize: 11.5, fontWeight: 600, color: "#8593a8", margin: "-2px 0 10px" }}>{l.join(" · ")}</div> : null;
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

export default function ScheduleScreen({ crm, updateCrm, openInvoice, openCollection, me, planner }) {
  const [printMsg, setPrintMsg] = useState("");
  const printJobs = (jobs, kinds, title) => {
    const list = jobs.filter((x) => x && !isVoidInvoice(x));
    if (!list.length) return;
    const ok = printJobDocs(list, kinds, { custOf: (x) => custById[x.customerId], siteOf: (x) => siteById[x.siteId], crm, planner, title });
    setPrintMsg(ok ? "" : "Printing is blocked here — allow pop-ups for ops.deckkingdom.co.uk and try again.");
  };
  const [search, setSearch] = useState("");
  const [range, setRange] = useState("upcoming");
  const [van, setVan] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const todayRef = useRef(null);
  const [pop, setPop] = useState(null); // { id, rect }: the job whose details are open
  // hovering a pending job opens its details ("peek"); moving into the pop-over keeps it open; clicking pins it
  const peekT = useRef({});
  const peekCancel = () => { clearTimeout(peekT.current.open); clearTimeout(peekT.current.close); };
  const peekOpen = (p) => { peekCancel(); peekT.current.open = setTimeout(() => setPop((cur) => (cur && !cur.peek ? cur : { ...p, peek: true })), 220); };
  const peekClose = () => { clearTimeout(peekT.current.open); clearTimeout(peekT.current.close); peekT.current.close = setTimeout(() => setPop((cur) => (cur && cur.peek ? null : cur)), 250); };
  // Picking a driver fills in the run and the next drop: a driver's first pick of the day is run 1;
  // picking them again straight away keeps that run; picking them again after someone else was picked starts their next run.
  const lastPick = useRef({}); // date -> driver last picked
  const pickDriver = (kind, obj, v) => {
    const date = kind === "col" ? obj.collectDate : obj.deliveryDate;
    const set = (fn) => (kind === "col" ? setColl(obj.id, fn) : setInv(obj.id, fn));
    if (!v || !date || (kind === "inv" && isCollectionJob(obj))) return set((t) => (t.driver = v));
    const others = [
      ...crm.invoices.filter((x) => x.id !== obj.id && !isVoidInvoice(x) && !isCollectionJob(x) && x.deliveryDate === date),
      ...(crm.collections || []).filter((x) => x.id !== obj.id && x.collectDate === date),
    ].filter((x) => x.driver === v);
    const maxRun = others.reduce((m, x) => Math.max(m, Number(x.runNo) || 0), 0);
    const last = lastPick.current[date];
    const run = !maxRun ? 1 : last === undefined || last === v ? maxRun : maxRun + 1;
    lastPick.current[date] = v;
    const drop = others.filter((x) => Number(x.runNo) === run).reduce((m, x) => Math.max(m, Number(x.dropNo) || 0), 0) + 1;
    set((t) => { t.driver = v; t.runNo = String(run); t.dropNo = String(drop); });
  };
  const [resetAsk, setResetAsk] = useState(null); // date whose runs are about to be cleared
  // Reset day: open jobs and pick-ups lose driver / run / drop / van, then get numbered in postcode order
  const resetDay = (date) => updateCrm((c) => {
    const pc = (x, kind) => {
      if (kind === "col") return String(x.postcode || "");
      const st = (c.sites || []).find((y) => y.id === x.siteId), cu = (c.customers || []).find((y) => y.id === x.customerId);
      return String((st && st.postcode) || (cu && cu.postcode) || "");
    };
    const list = [
      ...c.invoices.filter((x) => !isVoidInvoice(x) && x.deliveryDate === date && !x.deliveryCompleted).map((o) => ({ o, p: pc(o, "inv") })),
      ...(c.collections || []).filter((x) => x.collectDate === date && !x.collected).map((o) => ({ o, p: pc(o, "col") })),
    ];
    list.forEach(({ o }) => { o.driver = ""; o.runNo = ""; o.van = ""; o.dropNo = ""; });
    return c;
  });
  const [notify, setNotify] = useState(null); // { date } a day's confirm sheet, or { ids } re-notify one job
  const [ask, setAsk] = useState(null); // { id, n, apply }: change a job the customer's already been told about?
  const meName = String(me || "").split("@")[0] || "someone";
  // record that a customer was told about the date/time their job has right now
  const markSent = (ids, via) => updateCrm((c) => {
    const book = notifyBook(c);
    const cut = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const jobs = {};
    Object.entries(book.jobs).forEach(([k, v]) => { if (v && (v.date || "") >= cut) jobs[k] = v; });
    ids.forEach((id) => {
      const t = c.invoices.find((x) => x.id === id);
      if (!t) return;
      const was = jobs[id];
      const same = was && was.date === (t.deliveryDate || "") && was.time === (t.deliveryTime || "");
      jobs[id] = { date: t.deliveryDate || "", time: t.deliveryTime || "", at: new Date().toISOString(), by: meName, via: [...new Set([...(same ? was.via || [] : []), ...via])] };
    });
    const days = {};
    Object.entries(book.days).forEach(([k, v]) => { if (k >= cut) days[k] = v; });
    c.dsNotify = { jobs, days };
    return c;
  });
  const confirmDay = (date) => updateCrm((c) => { const book = notifyBook(c); c.dsNotify = { ...book, days: { ...book.days, [date]: { at: new Date().toISOString(), by: meName } } }; return c; });
  // changing the date or time of a job the customer has already been told about asks first, then offers a fresh message
  const guard = (id, apply) => {
    const i = crm.invoices.find((x) => x.id === id);
    const ns = i ? notifyState(i, crm) : { state: "none" };
    if (ns.state !== "ok") return apply();
    setAsk({ id, n: ns.n, apply });
  };
  const [dragId, setDragId] = useState(null); // pending job being dragged onto a day
  const [overDate, setOverDate] = useState(null);
  const [overRow, setOverRow] = useState(null);
  const [overPending, setOverPending] = useState(false);
  const [showPrep, setShowPrep] = useState(() => { try { return localStorage.getItem("dk-ds-prep") === "1"; } catch { return false; } });
  const isColDrag = (id) => String(id || "").startsWith("col:");
  const moveColl = (id, date) => setColl(id.slice(4), (t) => { t.collectDate = date; if (!date) t.dropNo = ""; });
  const collKg = (col) => { const by = skuIndex(crm); let kg = 0, any = false; (col.items || []).forEach((it) => { const mp = by[String(it.sku || "").trim().toLowerCase()]; const w = mp && Number(mp.weightKg); if (w) { kg += w * (Number(it.qty) || 0); any = true; } }); return any ? kg : null; };
  const endDrag = () => { setDragId(null); setOverDate(null); setOverRow(null); setOverPending(false); };
  const complete = (id, on) => updateCrm((c) => {
    const t = c.invoices.find((x) => x.id === id);
    if (t) { t.deliveryCompleted = on; applyInvoiceStockDeduction(t, c, on, me); }
    return c;
  });
  // dropped onto another job: same day, driver and run, slotted in just before it; drops renumbered
  // dropped onto another row (job or collection): same day, driver and run, slotted in just before it; stops renumbered
  const dropBefore = (target, targetKind = "inv") => {
    const id = dragId;
    endDrag();
    const tKey = (targetKind === "col" ? "col:" : "") + target.id;
    if (!id || id === tKey) return;
    const date = targetKind === "col" ? target.collectDate : target.deliveryDate;
    const go = () => updateCrm((c) => {
      const moving = isColDrag(id) ? (c.collections || []).find((x) => x.id === id.slice(4)) : c.invoices.find((x) => x.id === id);
      if (!moving) return c;
      if (isColDrag(id)) moving.collectDate = date || "";
      else { moving.deliveryDate = date || ""; if (!moving.jobType || moving.jobType === "Pending") moving.jobType = "Delivery"; }
      moving.driver = target.driver || ""; moving.runNo = target.runNo || "";
      const sameRun = (x) => (x.driver || "") === (target.driver || "") && (x.runNo || "") === (target.runNo || "");
      const stops = [
        ...c.invoices.filter((x) => !isVoidInvoice(x) && x.deliveryDate === date && sameRun(x)).map((x) => ({ k: x.id, o: x })),
        ...(c.collections || []).filter((x) => x.collectDate === date && sameRun(x) && (x.runNo || x.driver)).map((x) => ({ k: "col:" + x.id, o: x })),
      ].filter((x) => x.k !== id).sort((p, q) => (Number(p.o.dropNo) || 999) - (Number(q.o.dropNo) || 999));
      const at = stops.findIndex((x) => x.k === tKey);
      stops.splice(at < 0 ? stops.length : at, 0, { k: id, o: moving });
      stops.forEach((x, n) => (x.o.dropNo = String(n + 1)));
      return c;
    });
    if (isColDrag(id)) return go();
    const was = crm.invoices.find((x) => x.id === id);
    if (was && was.deliveryDate === date) go(); else guard(id, go);
  };
  // dropped on the Pending card: no date again
  const unschedule = () => {
    const id = dragId;
    endDrag();
    if (!id) return;
    if (isColDrag(id)) return moveColl(id, "");
    guard(id, () => updateCrm((c) => { const t = c.invoices.find((x) => x.id === id); if (t) { t.deliveryDate = ""; t.dropNo = ""; } return c; }));
  };
  const dropOn = (d) => {
    const id = dragId;
    endDrag();
    if (!id) return;
    if (isColDrag(id)) return moveColl(id, d);
    const was = crm.invoices.find((x) => x.id === id);
    if (was && was.deliveryDate === d) return;
    guard(id, () => updateCrm((c) => {
      const t = c.invoices.find((x) => x.id === id);
      if (t) { t.deliveryDate = d; if (!t.jobType || t.jobType === "Pending") t.jobType = "Delivery"; }
      return c;
    }));
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
  // a supplier collection with a run or driver sits inside that run; without one it waits under "Supplier collections"
  // customers collecting from the warehouse go last, in their own group
  const runKey = (e) => (e.kind === "inv" && isCollectionJob(e.obj) ? "3|customer" : e.kind === "col" && !e.obj.runNo && !e.obj.driver ? "2|collections" : "0|" + String(numOr(e.obj.runNo, 99)).padStart(2, "0") + "|" + (e.obj.driver ? "0" + e.obj.driver : "1"));
  // postcode order for jobs without a drop number (e.g. after Reset day); no postcode goes last
  const pcKey = (e) => {
    const p = e.kind === "col" ? e.obj.postcode : ((siteById[e.obj.siteId] || {}).postcode || (custById[e.obj.customerId] || {}).postcode);
    return p ? String(p).toUpperCase().replace(/[^A-Z0-9]/g, "") : "~";
  };
  groups.forEach((g) =>
    g.rows.sort((a, b) =>
      runKey(a).localeCompare(runKey(b)) ||
      numOr(a.obj.dropNo, 999) - numOr(b.obj.dropNo, 999) ||
      pcKey(a).localeCompare(pcKey(b), "en", { numeric: true }) ||
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
        onDrop={(ev) => { ev.preventDefault(); ev.stopPropagation(); dropBefore(i, "inv"); }}>
        <div style={{ width: 4, alignSelf: "stretch", borderRadius: "12px 0 0 12px", margin: "-8px 0", background: done ? "#3FA55C" : STRIPE_COLOURS[status] }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span draggable title="Drag to move — onto another job, another day, or back to Pending"
            onDragStart={(ev) => { ev.dataTransfer.setData("text/plain", i.id); ev.dataTransfer.effectAllowed = "move"; setDragId(i.id); }}
            onDragEnd={endDrag}
            style={{ cursor: "grab", color: "#aab3c2", fontSize: 14, lineHeight: 1, padding: "4px 1px", userSelect: "none" }}>⋮⋮</span>
          <button type="button" title={done ? "Completed — click to undo" : "Mark the delivery complete"} onClick={() => complete(i.id, !done)}
            style={{ width: 18, height: 18, borderRadius: 999, border: "2px solid " + (done ? "#3FA55C" : "#b8c0cc"), background: "#fff", padding: 0, boxSizing: "border-box", lineHeight: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            {done && <span style={{ width: 8, height: 8, borderRadius: 999, background: "#3FA55C", flex: "none" }} />}
          </button>
        </div>
        <div style={{ minWidth: 0, position: "relative" }}
          onMouseEnter={(ev) => peekOpen({ id: i.id, rect: ev.currentTarget.getBoundingClientRect() })} onMouseLeave={peekClose}>
          <div style={{ display: "flex", gap: 7, alignItems: "center", minWidth: 0 }}>
            <button className="dk-title-link" onClick={(e) => { peekCancel(); setPop({ id: i.id, rect: e.currentTarget.parentNode.parentNode.getBoundingClientRect() }); }}
              title={c ? c.name : ""} style={{ fontWeight: 700, fontSize: 13.5, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
              {short16(c ? c.name || "Unnamed" : "No customer")}
            </button>
            <RiskChip inv={i} /><WebStatusChip inv={i} />
          </div>
        </div>
        <span style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 700, whiteSpace: "nowrap" }}>{(s && s.postcode) || (c && c.postcode) || "—"}</span>
        <span style={{ minWidth: 0, overflow: "hidden" }}>{c && c.source ? <Chip style={{ fontSize: 10.5, padding: "1px 8px", whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{c.source}</Chip> : <span style={{ color: "#aab3c2" }}>—</span>}</span>
        <PillSelect value={i.jobType || ""} options={JOB_TYPES} placeholder="Job type" tone={isCollectionJob(i) ? "#9a7408" : NAVY} onChange={(v) => setInv(i.id, (t) => (t.jobType = v))} />
        {isCollectionJob(i) ? (
          // customer collects from the warehouse: no driver, run, drop or van
          <span style={{ gridColumn: "span 4", fontSize: 12, fontWeight: 700, color: "#9a7408", paddingLeft: 8 }}>Collecting from the warehouse</span>
        ) : <>
          <PillSelect value={i.driver || ""} options={DRIVERS} placeholder="Driver" onChange={(v) => pickDriver("inv", i, v)} />
          <PillSelect value={i.runNo || ""} options={RUN_NOS} placeholder="Run" labelOf={(o) => "Run " + o} onChange={(v) => setInv(i.id, (t) => (t.runNo = v))} />
          <PillSelect value={i.dropNo || ""} options={DROP_NOS} placeholder="#" onChange={(v) => setInv(i.id, (t) => (t.dropNo = v))} />
          <PillSelect value={i.van || ""} options={vanOptions(crm)} placeholder="Van" onChange={(v) => setInv(i.id, (t) => (t.van = v))} />
        </>}
        <div style={{ textAlign: "center", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>{kg === null ? "—" : kg.toLocaleString("en-GB", { maximumFractionDigits: 0 }) + " kg"}</div>
        <div style={{ display: "flex", gap: 4, width: 134 }}>
          <DayPill value={i.deliveryDate} onChange={(v) => guard(i.id, () => setInv(i.id, (t) => (t.deliveryDate = v)))} />
          <PillSelect value={i.deliveryTime || ""} options={TIME_SLOTS} placeholder="Time" onChange={(v) => guard(i.id, () => setInv(i.id, (t) => (t.deliveryTime = v)))} />
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
        {(() => {
          const ns = notifyState(i, crm);
          return (
            <div style={{ position: "relative", display: "inline-flex" }}>
              <span style={{ display: "inline-flex", gap: 5 }}>
                <NotifyButtons i={i} c={c} onSent={(via) => markSent([i.id], [via])} />
                <PrintMenu onPick={(k) => printJobs([i], k, "#" + (i.invNo || "") + " paperwork")} />
              </span>
              {ns.state !== "none" && (
                <span title={ns.state === "ok" ? "Customer told " + shortStamp(ns.n.at) + " by " + ns.n.by + " (" + (ns.n.via || []).map((v) => (v === "wa" ? "WhatsApp" : "email")).join(" + ") + ")" : "Changed since the customer was told — send them a new update"}
                  style={{ position: "absolute", right: 27, top: -4, width: 9, height: 9, borderRadius: 999, border: "1.5px solid #fff", background: ns.state === "ok" ? "#3FA55C" : "#E8912D" }} />
              )}
            </div>
          );
        })()}
        <div style={{ textAlign: "right" }}><SlaChip days={days} done={i.deliveryCompleted} /></div>
      </div>
    );
  };

  const CollRow = ({ c }) => {
    const [hover, setHover] = useState(false);
    const pr = collectionProgress(c);
    const done = pr.total > 0 && pr.pending === 0;
    const items = (c.items || []).reduce((t, it) => t + (Number(it.qty) || 0), 0);
    const kg = collKg(c);
    const me_ = "col:" + c.id;
    const stamp = [c.date ? "Raised " + prettyDate(c.date) + (c.raisedBy ? " by " + String(c.raisedBy).split("@")[0] : "") : "", items ? items + " item" + (items === 1 ? "" : "s") + " to collect" : ""].filter(Boolean);
    return (
      <div style={{ ...rowBox, gridTemplateColumns: dsCols(showPrep), background: c.collected ? "#e9f6ee" : "#fff", borderColor: c.collected ? "#bfe3ca" : overRow === me_ ? GOLD : "#e6e9ef",
          boxShadow: overRow === me_ ? "0 -3px 0 " + GOLD : "none", opacity: dragId === me_ ? 0.45 : 1 }}
        onDragOver={(ev) => { if (dragId && dragId !== me_) { ev.preventDefault(); ev.stopPropagation(); if (overRow !== me_) setOverRow(me_); } }}
        onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget)) setOverRow((r) => (r === me_ ? null : r)); }}
        onDrop={(ev) => { ev.preventDefault(); ev.stopPropagation(); if (c.runNo || c.driver) dropBefore(c, "col"); else dropOn(c.collectDate); }}>
        <div style={{ width: 4, alignSelf: "stretch", borderRadius: "12px 0 0 12px", margin: "-8px 0", background: c.collected ? "#3FA55C" : COLLECTION_BLUE }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span draggable title="Drag to move — onto a job in a run, another day, or back to Pending"
            onDragStart={(ev) => { ev.dataTransfer.setData("text/plain", me_); ev.dataTransfer.effectAllowed = "move"; setDragId(me_); }}
            onDragEnd={endDrag}
            style={{ cursor: "grab", color: "#aab3c2", fontSize: 14, lineHeight: 1, padding: "4px 1px", userSelect: "none" }}>⋮⋮</span>
          <button type="button" title={c.collected ? "Collected — click to undo" : "Mark as collected"} onClick={() => setColl(c.id, (t) => (t.collected = !t.collected))}
            style={{ width: 18, height: 18, borderRadius: 999, border: "2px solid " + (c.collected ? "#3FA55C" : "#b8c0cc"), background: "#fff", padding: 0, boxSizing: "border-box", lineHeight: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            {c.collected && <span style={{ width: 8, height: 8, borderRadius: 999, background: "#3FA55C", flex: "none" }} />}
          </button>
        </div>
        <div style={{ minWidth: 0, position: "relative" }}
          onMouseEnter={(ev) => peekOpen({ id: c.id, kind: "col", rect: ev.currentTarget.getBoundingClientRect() })} onMouseLeave={peekClose}>
          <button className="dk-title-link" onClick={(e) => { peekCancel(); setPop({ id: c.id, kind: "col", rect: e.currentTarget.parentNode.getBoundingClientRect() }); }}
            title={c.supplier || ""} style={{ fontWeight: 700, fontSize: 13.5, color: COLLECTION_BLUE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
            {short16(c.supplier || "Supplier")}
          </button>
        </div>
        <span style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 700, whiteSpace: "nowrap" }}>{c.postcode || "—"}</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: COLLECTION_BLUE }}>COL-{c.collectionNo || "—"}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLLECTION_BLUE, paddingLeft: 8 }}>Supplier pick-up</span>
        <PillSelect value={c.driver || ""} options={DRIVERS} placeholder="Driver" onChange={(v) => pickDriver("col", c, v)} />
        <PillSelect value={c.runNo || ""} options={RUN_NOS} placeholder="Run" labelOf={(o) => "Run " + o} onChange={(v) => setColl(c.id, (t) => (t.runNo = v))} />
        <PillSelect value={c.dropNo || ""} options={DROP_NOS} placeholder="#" onChange={(v) => setColl(c.id, (t) => (t.dropNo = v))} />
        <PillSelect value={c.van || ""} options={vanOptions(crm)} placeholder="Van" onChange={(v) => setColl(c.id, (t) => (t.van = v))} />
        <div style={{ textAlign: "center", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }} title={items + " pcs"}>{kg !== null ? Math.round(kg).toLocaleString("en-GB") + " kg" : items ? items + " pcs" : "—"}</div>
        <div style={{ display: "flex", gap: 4, width: 134 }}>
          <DayPill value={c.collectDate} onChange={(v) => setColl(c.id, (t) => (t.collectDate = v))} />
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
    if (e.kind === "col") {
      const c = e.obj;
      return (
        <div style={{ position: "relative" }}
          onMouseEnter={(ev) => peekOpen({ id: c.id, kind: "col", rect: ev.currentTarget.getBoundingClientRect(), side: "left" })}
          onMouseLeave={peekClose}>
          <button className="dk-title-link" draggable title="Drag onto a day or into a run, or click to keep the details open"
            onClick={(ev) => { peekCancel(); setPop({ id: c.id, kind: "col", rect: ev.currentTarget.parentNode.getBoundingClientRect(), side: "left" }); }}
            onDragStart={(ev) => { ev.dataTransfer.setData("text/plain", "col:" + c.id); ev.dataTransfer.effectAllowed = "move"; setDragId("col:" + c.id); peekCancel(); setPop(null); }}
            onDragEnd={endDrag}
            style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 8px", width: "100%", padding: "8px 0", borderBottom: "1px solid #f0f2f6", textAlign: "left" }}>
            <b style={{ fontSize: 13, color: COLLECTION_BLUE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.supplier || "Supplier"} · collection</b>
            <span />
            <span style={{ fontSize: 11.5, color: "#5a6a85", fontWeight: 600 }}>{c.postcode || "—"} · COL-{c.collectionNo || "—"}</span>
          </button>
        </div>
      );
    }
    const i = e.obj;
    const c = custById[i.customerId];
    const st = siteById[i.siteId];
    const days = daysSinceRaised(i);


    return (
      <div style={{ position: "relative" }}
        onMouseEnter={(ev) => peekOpen({ id: i.id, rect: ev.currentTarget.getBoundingClientRect(), side: "left" })}
        onMouseLeave={peekClose}>
        <button className="dk-title-link" draggable title="Drag onto a day to book it, or click to keep the details open"
          onDragStart={(ev) => { ev.dataTransfer.setData("text/plain", i.id); ev.dataTransfer.effectAllowed = "move"; setDragId(i.id); peekCancel(); setPop(null); }}
          onDragEnd={() => { setDragId(null); setOverDate(null); }}
          onClick={(ev) => { peekCancel(); setPop({ id: i.id, rect: ev.currentTarget.parentNode.getBoundingClientRect(), side: "left" }); }}
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
      </div>
    );
  };

  // day bar button: Confirm schedule → Confirmed ✓ → "n to update" when something moved after confirming
  const ConfirmBtn = ({ date, rows }) => {
    const jobs = rows.filter((e) => e.kind === "inv" && !e.obj.deliveryCompleted).map((e) => e.obj);
    if (!jobs.length || date < tod) return null;
    const day = notifyBook(crm).days[date];
    const todo = jobs.filter((i) => notifyState(i, crm).state !== "ok").length;
    const look = !day ? { bg: GOLD, fg: NAVY, t: "Confirm schedule" }
      : todo ? { bg: "#E8912D", fg: "#fff", t: todo + " to update" }
      : { bg: "#3FA55C", fg: "#fff", t: "✓ Confirmed" };
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button type="button" onClick={() => setNotify({ date })}
        title={day ? "Confirmed " + shortStamp(day.at) + " by " + day.by + (todo ? " — " + todo + " customer" + (todo === 1 ? "" : "s") + " not told about the current date/time" : " — everyone's been told") : "Tell every customer on this day their delivery date and time"}
        style={{ border: "none", borderRadius: 8, background: look.bg, color: look.fg, fontFamily: "inherit", fontWeight: 800, fontSize: 12, padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
        {look.t}
      </button>
      {day && <Soon label="" icon="lock" note={'Once a day is confirmed, lock its jobs so only managers can change date, time, driver, run or drop. Everyone else sees them read-only. Needs staff roles (manager / staff) adding to logins first.'} style={{ padding: "3px 6px", background: "transparent", borderColor: "#5a6a85" }} />}
      </span>
    );
  };

  const GroupHead = ({ label, meta, red, action, right, after }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, background: red ? RED : NAVY, color: "#fff", borderRadius: 12, padding: action ? "0 16px 0 8px" : "0 16px", minHeight: 42, margin: "18px 0 8px", flexWrap: "wrap" }}>
      {action}
      <b style={{ color: red ? "#fff" : GOLD, fontSize: 15 }}>{label}</b>
      <span style={{ fontSize: 12.5, color: red ? "#ffd8dd" : "#cfd6e4", fontWeight: 600 }}>{meta}</span>
      {after}
      {right && <span style={{ marginLeft: "auto" }}>{right}</span>}
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

      {printMsg && (
        <div onClick={() => setPrintMsg("")} style={{ background: "#fdecef", border: "1px solid #ecc4cb", borderRadius: 12, padding: "10px 14px", marginTop: 12, fontSize: 13, fontWeight: 700, color: RED, cursor: "pointer" }}>{printMsg}</div>
      )}
      {(crm.schemaMissing || []).length > 0 && (
        <div style={{ background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 12, padding: "10px 14px", marginTop: 12, fontSize: 13, fontWeight: 600, color: "#6b5305", display: "flex", gap: 8, alignItems: "center" }}>
          <Icon name="warn" stroke="#a05f10" size={15} />
          <span>
            {crm.schemaMissing.includes("run_no") && crm.schemaMissing.includes("drop_no") ? "Driver, run and drop numbers" : crm.schemaMissing.includes("run_no") ? "Run numbers" : crm.schemaMissing.includes("drop_no") ? "Driver and drop numbers" : "Collections' driver, run and stop numbers"} aren't being saved yet — the database is missing a column.
            Run <b>{[crm.schemaMissing.includes("drop_no") && "delivery-runs.sql", crm.schemaMissing.includes("run_no") && "job-type-runs.sql", crm.schemaMissing.includes("coll_run") && "collection-runs.sql"].filter(Boolean).join(" then ")}</b> in Supabase (SQL Editor → New query → paste → Run), then refresh.
          </span>
        </div>
      )}

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
          <GroupHead label={dayLabel(g.date)} meta={g.rows.length ? groupMeta(g.rows) : "nothing booked"}
            after={g.date >= tod && g.rows.some((x) => !(x.kind === "inv" ? x.obj.deliveryCompleted : x.obj.collected)) ? (
              <button type="button" onClick={() => setResetAsk(g.date)} title="Clear driver, run, drop and van on this day's open jobs and line them up by postcode"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #3a4d6e", background: "transparent", color: "#fff", borderRadius: 8, padding: "5px 10px", fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                <Icon name="refresh" stroke="#fff" size={13} />Reset day
              </button>
            ) : null}
            right={g.rows.length ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <ConfirmBtn date={g.date} rows={g.rows} />
                {g.rows.some((x) => x.kind === "inv") && <PrintMenu dark label="Print day" title="Print or save every run's paperwork for this day"
                  onPick={(kk) => printJobs(g.rows.filter((x) => x.kind === "inv").map((x) => x.obj), kk, dayLabel(g.date))} />}
              </span>
            ) : null} />
          {g.rows.length === 0 ? (
            <div style={{ border: "1.5px dashed #d5d9e0", borderRadius: 12, padding: "10px 14px", fontSize: 12.5, fontWeight: 600, color: "#8593a8" }}>
              {dragId ? "Drop here to book it for " + dayLabel(g.date) : "Nothing booked — drag a pending job here"}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: showPrep ? 1545 : 1205 }}>
                {g.rows.map((e, k) => {
                  const key = runKey(e), prevKey = k ? runKey(g.rows[k - 1]) : null;
                  const sameRun = g.rows.filter((x) => runKey(x) === key);
                  const loose = key === "2|collections"; // collections not in a run yet
                  const custGroup = key === "3|customer"; // customers collecting from the warehouse
                  const nDrops = sameRun.filter((x) => x.kind === "inv").length, nPicks = sameRun.length - nDrops;
                  const runKg = sameRun.reduce((t, x) => t + ((x.kind === "inv" ? invoiceLoadKg(x.obj, crm) : collKg(x.obj)) || 0), 0);
                  const head = key !== prevKey ? (
                    <div title={!loose ? "" : "Supplier pick-ups not in a run yet — give them a driver and run, or drag one onto a job"}
                      style={{ display: "grid", gridTemplateColumns: dsCols(showPrep), gap: 7, margin: k ? "12px 0 6px" : "4px 0 6px", background: "#eef1f6", border: "1px solid #dde2ea", borderRadius: 12,
                        padding: "0 12px 0 0", minHeight: 36, boxSizing: "border-box", overflow: "hidden", alignItems: "stretch", fontSize: 12, color: NAVY, whiteSpace: "nowrap" }}>
                      <span style={{ gridColumn: "1 / span 9", display: "flex", alignItems: "stretch" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#dce2ec", padding: "0 14px" }}>
                          <b>{custGroup ? "Customer collections" : loose ? "Supplier collections" : (e.obj.runNo ? "Run " + e.obj.runNo : "No run yet") + " · " + (e.obj.driver || "no driver yet")}</b>
                          <span style={{ fontWeight: 600, color: "#5a6a85" }}>
                            {custGroup ? nDrops + " collecting from the warehouse" : [nDrops ? nDrops + " drop" + (nDrops === 1 ? "" : "s") : "", nPicks ? nPicks + " pick-up" + (nPicks === 1 ? "" : "s") : ""].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </span>
                      {loose ? <span style={{ gridColumn: "10 / -1" }} /> : <>
                        <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", fontWeight: 700, color: "#5a6a85" }}>{custGroup ? "Total weight" : "Run weight"}</span>
                        <span title="Run weight — deliveries going out plus pick-ups coming back"
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>
                          {runKg ? Math.round(runKg).toLocaleString("en-GB") + " kg" : "—"}
                        </span>
                        <span style={{ gridColumn: "12 / -1", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                          <PrintMenu title="Print or save this run's paperwork" onPick={(kk) => printJobs(sameRun.filter((x) => x.kind === "inv").map((x) => x.obj), kk, dayLabel(g.date) + " · " + (custGroup ? "Customer collections" : (e.obj.runNo ? "Run " + e.obj.runNo : "No run") + (e.obj.driver ? " · " + e.obj.driver : "")))} />
                        </span>
                      </>}
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
        onDragOver={(ev) => {
          const it = dragId && (isColDrag(dragId) ? (crm.collections || []).find((x) => "col:" + x.id === dragId) : crm.invoices.find((x) => x.id === dragId));
          if (it && (it.deliveryDate || it.collectDate)) { ev.preventDefault(); setOverPending(true); } }}
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
      {resetAsk && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setResetAsk(null); }} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(11,31,63,.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", width: 460, maxWidth: "100%", boxShadow: "0 20px 50px rgba(11,31,63,.35)" }}>
            <b style={{ fontSize: 16, color: NAVY }}>Reset {dayLabel(resetAsk)}?</b>
            <p style={{ fontSize: 13.5, color: "#3c4a62", fontWeight: 600, lineHeight: 1.5, margin: "8px 0 14px" }}>
              Every open job and pick-up on this day loses its driver, run, drop number and van, and the jobs line up in postcode order so you can plan the runs from scratch.
              Completed jobs aren't touched, and dates and times stay as they are.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btn} onClick={() => setResetAsk(null)}>Cancel</button>
              <button style={goldBtn} onClick={() => { const d = resetAsk; setResetAsk(null); resetDay(d); }}>Reset day</button>
            </div>
          </div>
        </div>
      )}

      {ask && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setAsk(null); }} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(11,31,63,.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", width: 440, maxWidth: "100%", boxShadow: "0 20px 50px rgba(11,31,63,.35)" }}>
            <b style={{ fontSize: 16, color: NAVY }}>Customer already notified</b>
            <p style={{ fontSize: 13.5, color: "#3c4a62", fontWeight: 600, lineHeight: 1.5, margin: "8px 0 14px" }}>
              {(() => { const i = crm.invoices.find((x) => x.id === ask.id); const c = i && custById[i.customerId]; return (c ? c.name : "This customer"); })()} was told{" "}
              {ask.n.date ? new Date(ask.n.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "no date"}{ask.n.time ? " (" + ask.n.time + ")" : ""}{" "}
              by {(ask.n.via || []).map((v) => (v === "wa" ? "WhatsApp" : "email")).join(" + ") || "message"} on {shortStamp(ask.n.at)}{ask.n.by && ask.n.by !== "someone" ? " (" + ask.n.by + ")" : ""}.
              Do you want to change it? You'll then send them a new message.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btn} onClick={() => setAsk(null)}>Keep it</button>
              <button style={goldBtn} onClick={() => { const { id, apply } = ask; setAsk(null); apply(); setNotify({ ids: [id] }); }}>Change &amp; re-notify</button>
            </div>
          </div>
        </div>
      )}

      {notify && (() => {
        const ids = notify.ids || groups.filter((g) => g.date === notify.date).flatMap((g) => g.rows).filter((e) => e.kind === "inv" && !e.obj.deliveryCompleted).map((e) => e.obj.id);
        const jobs = ids.map((id) => crm.invoices.find((x) => x.id === id)).filter(Boolean);
        const day = notify.date ? notifyBook(crm).days[notify.date] : null;
        const states = jobs.map((i) => notifyState(i, crm));
        const left = states.filter((x) => x.state !== "ok").length;
        const close = () => setNotify(null);
        // one click: WhatsApp desktop app + a Gmail compose tab
        const both = (i, c) => {
          const ph = phoneOf(c), em = emailOf(c), via = [];
          if (em) { window.open(gmailLink(i, c, em), "_blank", "noopener"); via.push("email"); }
          if (ph) { const a = document.createElement("a"); a.href = "whatsapp://send?phone=" + ph + "&text=" + encodeURIComponent(deliveryText(i, c)); a.click(); via.push("wa"); }
          if (via.length) markSent([i.id], via);
        };
        return (
          <div onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(11,31,63,.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "#fff", borderRadius: 12, width: 760, maxWidth: "100%", maxHeight: "calc(100vh - 40px)", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(11,31,63,.35)" }}>
              <div style={{ background: NAVY, borderRadius: "12px 12px 0 0", padding: "12px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                <b style={{ color: GOLD, fontSize: 15 }}>{notify.date ? "Confirm schedule · " + dayLabel(notify.date) : "Send a new delivery update"}</b>
                <span style={{ flex: 1 }} />
                <button style={{ ...abtn, border: "none", background: "transparent" }} title="Close" onClick={close}><Icon name="x" stroke="#fff" /></button>
              </div>
              <div style={{ padding: "12px 18px", fontSize: 12.5, fontWeight: 600, color: "#5a6a85", lineHeight: 1.5 }}>
                {notify.date
                  ? (day ? "Confirmed " + shortStamp(day.at) + " by " + day.by + ". " : "") + "Send each customer their delivery date and time — Send both opens WhatsApp and a Gmail draft. Green = told about what's booked now; amber = changed since."
                  : "The date or time changed — send the customer their new booking."}
              </div>
              <div style={{ overflowY: "auto", padding: "0 18px" }}>
                {jobs.length === 0 && <div style={{ padding: "16px 0", color: "#8593a8", fontWeight: 600 }}>No open jobs on this day.</div>}
                {jobs.map((i, k) => {
                  const c = custById[i.customerId], ns = states[k];
                  const ph = phoneOf(c), em = emailOf(c);
                  return (
                    <div key={i.id} style={{ display: "grid", gridTemplateColumns: "12px minmax(0,1fr) 150px 160px auto", gap: 12, alignItems: "center", padding: "9px 0", borderBottom: "1px solid #f0f2f6" }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: ns.state === "ok" ? "#3FA55C" : ns.state === "changed" ? "#E8912D" : "#d5d9e0" }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: NAVY, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c ? c.name : "No customer"}</div>
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: "#8593a8" }}>
                          {(i.runNo ? "Run " + i.runNo : "No run") + (i.driver ? " · " + i.driver : "") + (i.dropNo ? " · drop " + i.dropNo : "")}
                        </div>
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: NAVY }}>
                        {i.deliveryDate ? new Date(i.deliveryDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "No date"}
                        <span style={{ color: i.deliveryTime ? NAVY : "#a05f10", marginLeft: 6 }}>{i.deliveryTime || "no time"}</span>
                      </div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: ns.state === "ok" ? "#28713e" : ns.state === "changed" ? "#a05f10" : "#8593a8" }}>
                        {ns.state === "none" ? "Not told yet" : (ns.state === "ok" ? "Told " : "Changed · told ") + shortStamp(ns.n.at) + " · " + (ns.n.via || []).map((v) => (v === "wa" ? "WA" : "email")).join("+")}
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <NotifyButtons i={i} c={c} onSent={(via) => markSent([i.id], [via])} />
                        <button type="button" disabled={!ph && !em} onClick={() => both(i, c)}
                          style={{ ...btn, padding: "5px 10px", fontSize: 12, opacity: !ph && !em ? 0.5 : 1, whiteSpace: "nowrap" }}>{ns.state === "ok" ? "Send again" : "Send both"}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px 0", borderTop: "1px solid #e6e9ef", flexWrap: "wrap" }}>
                <Soon label="Send all automatically" icon="refresh" note={'Send every customer on the day their WhatsApp and email in one click, in the background — no tabs or chats to press send in. Needs a WhatsApp Business API provider (e.g. Twilio or 360dialog, approved message templates) and an email sending service (e.g. Resend or your Krystal SMTP), wired in through a Supabase function.'} />
                {notify.date && <Soon label="Lock day" icon="lock" note={'Once a day is confirmed, lock its jobs so only managers can change date, time, driver, run or drop. Everyone else sees them read-only. Needs staff roles (manager / staff) adding to logins first.'} />}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px 12px", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: left ? "#a05f10" : "#28713e" }}>{left ? left + " still to tell" : "Everyone's been told"}</span>
                <span style={{ flex: 1 }} />
                {notify.date && jobs.some((i) => !i.deliveryTime) && <span style={{ fontSize: 11.5, fontWeight: 600, color: "#a05f10" }}>Some jobs have no time slot yet</span>}
                <button style={btn} onClick={close}>Close</button>
                {notify.date && <button style={goldBtn} onClick={() => { confirmDay(notify.date); close(); }}>{day ? "Confirm again" : "Confirm schedule"}</button>}
              </div>
            </div>
          </div>
        );
      })()}

      {pop && pop.kind === "col" && (() => {
        const col = (crm.collections || []).find((x) => x.id === pop.id);
        if (!col) return null;
        const PW = 580, PH = Math.min(window.innerHeight - 20, 640);
        const top = Math.min(pop.rect.bottom + 6, window.innerHeight - PH - 10);
        const by = skuIndex(crm);
        const kgAll = collKg(col);
        const items = (col.items || []).reduce((t, it) => t + (Number(it.qty) || 0), 0);
        return (
          <>
            {!pop.peek && <div onMouseDown={() => setPop(null)} style={{ position: "fixed", inset: 0, zIndex: 70 }} />}
            <div onMouseEnter={() => pop.peek && clearTimeout(peekT.current.close)} onMouseLeave={() => pop.peek && peekClose()}
              onMouseDown={() => { if (pop.peek) { peekCancel(); setPop({ ...pop, peek: false }); } }}
              style={{ position: "fixed", left: pop.side === "left" ? Math.max(10, pop.rect.left - PW - 24) : Math.min(pop.rect.left, window.innerWidth - PW - 20), top: Math.max(10, pop.side === "left" ? Math.min(pop.rect.top - 60, window.innerHeight - PH - 10) : top), zIndex: 71, width: PW, maxHeight: PH, overflowY: "auto",
              background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, boxShadow: "0 14px 40px rgba(11,31,63,.28)", padding: "14px 18px", boxSizing: "border-box" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <b style={{ fontSize: 15, color: COLLECTION_BLUE }}>{col.supplier || "Supplier"}</b>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#185FA5" }}>COL-{col.collectionNo || "—"}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "#8593a8" }}>supplier pick-up</span>
              </div>
              <Stamp lines={[col.date ? "Raised " + prettyDate(col.date) + (col.raisedBy ? " by " + String(col.raisedBy).split("@")[0] : "") : ""]} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", background: col.collectDate ? "#f7f9fc" : "#fff8e6", border: "1px solid " + (col.collectDate ? "#e6e9ef" : "#f4d78f"), borderRadius: 10, padding: "6px 10px", marginBottom: 10 }}>
                <span style={{ ...lbl, marginBottom: 0 }}>Collection date</span>
                <input type="date" value={col.collectDate || ""} style={{ ...pill, width: 130, padding: "3px 8px" }} onChange={(e) => { const v = e.target.value; setColl(col.id, (t) => (t.collectDate = v)); }} />
                <span style={{ flex: 1 }} />
                {!col.collectDate && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#a05f10" }}>not booked</span>}
              </div>
              <span style={lbl}>Collect from</span>
              <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, lineHeight: 1.5, marginBottom: 4 }}>
                {[col.address, col.town, col.postcode].filter(Boolean).map((l, k) => <div key={k}>{l}</div>)}
                {(col.contact || col.phone) && <div style={{ color: "#5a6a85" }}>{[col.contact, col.phone].filter(Boolean).join(" · ")}</div>}
                {(col.driver || col.runNo || col.van) && <div style={{ color: "#5a6a85" }}>{[col.runNo ? "Run " + col.runNo : "", col.driver, col.dropNo ? "stop " + col.dropNo : "", col.van].filter(Boolean).join(" · ")}</div>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 130px", gap: "0 10px", marginTop: 12, paddingBottom: 4, borderBottom: "1px solid #e6e9ef" }}>
                {["Qty", "Item", "Colour"].map((h) => <span key={h} style={{ ...lbl, marginBottom: 0 }}>{h}</span>)}
              </div>
              {(col.items || []).length === 0 ? <div style={{ fontSize: 12.5, color: "#8593a8", padding: "6px 0" }}>No items listed</div> : (col.items || []).map((it) => {
                return (
                  <div key={it.id} style={{ display: "grid", gridTemplateColumns: "44px 1fr 130px", gap: "0 10px", fontSize: 12.5, fontWeight: 600, padding: "5px 0", color: NAVY, borderBottom: "1px solid #f3f5f9", alignItems: "baseline" }}>
                    <b>{it.qty}×</b>
                    <span style={{ minWidth: 0 }}>{it.description || it.sku || "—"}{it.sku && it.description ? <span style={{ color: "#8593a8" }}>{" · " + it.sku}</span> : null}</span>
                    <span style={{ color: "#5a6a85" }}>{it.colour || "—"}</span>
                  </div>
                );
              })}
              <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: NAVY, display: "grid", gridTemplateColumns: "1fr auto", gap: "3px 10px" }}>
                <span>Items</span><span>{items} pcs</span>
                <span style={{ color: col.collected ? "#28713e" : "#a05f10" }}>{col.collected ? "Collected" : "Not collected yet"}</span><span />
              </div>
              {col.notes && <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: "#6b5305", background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "6px 10px" }}>{col.notes}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button style={goldBtn} onClick={() => { setPop(null); openCollection && openCollection(col.id); }}><Icon name="box" stroke={NAVY} />Open collection</button>
              </div>
            </div>
          </>
        );
      })()}

      {pop && pop.kind !== "col" && (() => {
        const i = crm.invoices.find((x) => x.id === pop.id);
        if (!i) return null;
        const c = custById[i.customerId];
        const s = siteById[i.siteId];
        const t = invoiceTotals(i);
        const addr = s ? [s.name !== s.address ? s.name : "", s.address, s.town, s.postcode] : c ? [c.address, c.town, c.postcode] : [];
        const contact = [(s && s.contact) || (c && c.contact), (s && (s.mobile || s.landline)) || (c && (c.mobile || c.landline))].filter(Boolean).join(" · ");
        const PW = 580, PH = Math.min(window.innerHeight - 20, 680);
        const top = Math.min(pop.rect.bottom + 6, window.innerHeight - PH - 10);
        const kgAll = invoiceLoadKg(i, crm);
        return (
          <>
            {!pop.peek && <div onMouseDown={() => setPop(null)} style={{ position: "fixed", inset: 0, zIndex: 70 }} />}
            <div onMouseEnter={() => pop.peek && clearTimeout(peekT.current.close)} onMouseLeave={() => pop.peek && peekClose()}
              onMouseDown={() => { if (pop.peek) { peekCancel(); setPop({ ...pop, peek: false }); } }}
              style={{ position: "fixed", left: pop.side === "left" ? Math.max(10, pop.rect.left - PW - 24) : Math.min(pop.rect.left, window.innerWidth - PW - 20), top: Math.max(10, pop.side === "left" ? Math.min(pop.rect.top - 60, window.innerHeight - PH - 10) : top), zIndex: 71, width: PW, maxHeight: PH, overflowY: "auto",
              background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, boxShadow: "0 14px 40px rgba(11,31,63,.28)", padding: "14px 18px", boxSizing: "border-box" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <b style={{ fontSize: 15, color: NAVY }}>{c ? c.name || "Unnamed" : "No customer"}</b>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#185FA5" }}>#{i.invNo || "—"}</span>
              </div>
              <Stamp lines={[
                i.created || i.date ? "Raised " + prettyDate(i.created || i.date) + (i.raisedBy ? " by " + i.raisedBy.split("@")[0] : "") : "",
                i.updatedAt ? "Updated " + prettyDateTime(i.updatedAt) + (i.modifiedBy ? " by " + i.modifiedBy.split("@")[0] : "") : "",
              ]} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", background: i.deliveryDate ? "#f7f9fc" : "#fff8e6", border: "1px solid " + (i.deliveryDate ? "#e6e9ef" : "#f4d78f"), borderRadius: 10, padding: "6px 10px", marginBottom: 10 }}>
                <span style={{ ...lbl, marginBottom: 0, whiteSpace: "nowrap" }}>{isCollectionJob(i) ? "Collection date" : "Delivery date"}</span>
                <input type="date" value={i.deliveryDate || ""} style={{ ...pill, width: 130, padding: "3px 8px" }}
                  onChange={(e) => { const v = e.target.value; guard(i.id, () => setInv(i.id, (t) => { t.deliveryDate = v; if (v && (!t.jobType || t.jobType === "Pending")) t.jobType = "Delivery"; })); }} />
                <span style={{ ...lbl, marginBottom: 0, marginLeft: 10 }}>Payment</span>
                <span style={{ width: 104, flex: "none" }}>
                  <PillSelect value={i.paymentType || ""} options={PAYMENT_TYPES} placeholder="Type" tone={isPaid(i) ? "#28713e" : NAVY} onChange={(v) => setInv(i.id, (t) => (t.paymentType = v))} />
                </span>
                <input type="date" value={i.paymentDate || ""} title="Date paid — leave blank while it's still owed" style={{ ...pill, width: 130, padding: "3px 8px", color: i.paymentDate ? "#28713e" : "#5a6a85", background: i.paymentDate ? "#eef8f1" : "#f3f5f9" }}
                  onChange={(e) => { const v = e.target.value; setInv(i.id, (t) => (t.paymentDate = v)); }} />
                <span style={{ flex: 1 }} />
                {!i.deliveryDate && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#a05f10" }}>not booked</span>}
              </div>
              <span style={lbl}>{s ? "Deliver to (site)" : isCollectionJob(i) ? "Customer collects" : "Deliver to (invoice address)"}</span>
              <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, lineHeight: 1.5, marginBottom: 4 }}>
                {addr.filter(Boolean).map((l, k) => <div key={k}>{l}</div>)}
                {contact && <div style={{ color: "#5a6a85" }}>{contact}</div>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 120px 76px", gap: "0 10px", marginTop: 12, paddingBottom: 4, borderBottom: "1px solid #e6e9ef" }}>
                {["Qty", "Product", "Colour", "Price"].map((h, k) => <span key={h} style={{ ...lbl, marginBottom: 0, textAlign: k === 3 ? "right" : "left" }}>{h}</span>)}
              </div>
              {(i.lines || []).length === 0 ? <div style={{ fontSize: 12.5, color: "#8593a8", padding: "6px 0" }}>No lines</div> : (i.lines || []).map((l) => {
                return (
                  <div key={l.id} style={{ display: "grid", gridTemplateColumns: "44px 1fr 120px 76px", gap: "0 10px", fontSize: 12.5, fontWeight: 600, padding: "5px 0", color: NAVY, borderBottom: "1px solid #f3f5f9", alignItems: "baseline" }}>
                    <b>{l.qty}×</b>
                    <span style={{ minWidth: 0 }}>{l.description || l.sku || "—"}</span>
                    <span style={{ color: "#5a6a85" }}>{l.colour || "—"}</span>
                    <span style={{ textAlign: "right", color: "#5a6a85" }}>{gbp((Number(l.qty) || 0) * (Number(l.price) || 0))}</span>
                  </div>
                );
              })}
              <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: NAVY, display: "grid", gridTemplateColumns: "1fr auto", gap: "3px 10px" }}>
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
