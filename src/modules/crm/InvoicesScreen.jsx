// Invoices tab: searchable list -> invoice entry screen per the approved
// mockup. Prices are entered inc VAT; VAT is backed out of the total.
import { useState, useMemo } from "react";
import { CustomerPeek } from "./Peeks.jsx";
import { NAVY, GOLD, RED, uid, prettyDate, prettyDateTime, addMonths, addDays, daysBetween } from "../../lib/core.js";
import {
  recordOrigin, blankInvoice, blankLine, nextNumber, blankSite, DRIVERS, invoiceTotals, gbp, isPaid,
  JOB_TYPES, PAYMENT_TYPES, PREP_FLAGS, FOLLOWUP_FLAGS, today, TIME_SLOTS, vanOptions,
  skuIndex, invoiceCost, buildPicks, pickLandedCost, jobCost, blankPick, invoiceLoadKg, applyInvoiceStockDeduction, releaseInvoiceLinks,
  TRADE_COUNTER, isCollectionJob, TRADE_COUNTER_LABEL, quoteRef, sampleRef, isSaleInvoice, riskOf, staffName, isVoidInvoice, onSchedule, userInitials,
} from "../../lib/crmCore.js";
import { ListHero, HeroStat, HeroAdd, SearchBox, RiskChip, WebStatusChip, Soon, DateInput, CalendarPop, usePhone, PrintButton, bandBtn, BandDelete } from "./ui.jsx";
import { Icon, Chip, Tg, Modal, selectAllProps, SuggestInput, sect, lbl, card, abtn, inp, btn, goldBtn } from "./ui.jsx";
import { printInvoice, printJobSheet, printLoadingBill, printJobDocs } from "./printDocs.js";
import { readableFor } from "./LinesEditor.jsx";
import LinesEditor from "./LinesEditor.jsx";
import StockCheck from "./StockCheck.jsx";
import { DeliverAddrCheck, useAddressGuard } from "./AddressGuard.jsx";
import { tidyPostcode } from "../../lib/addressCheck.js";

const docBtn = { ...btn, padding: "6px 11px", fontSize: 12.5 };
const navyBtn = { ...btn, background: "transparent", border: "1px solid #3a4f78", color: "#fff" };
const numInp = { ...inp, textAlign: "right" };

const NoteBox = ({ children }) => (
  <div style={{ marginTop: 7, background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "7px 11px", fontSize: 12.5, fontWeight: 600, display: "flex", gap: 7, alignItems: "flex-start", color: "#6b5305" }}>
    <span style={{ marginTop: 2 }}><Icon name="note" size={13} stroke="#9a7408" /></span>
    <span>{children}</span>
  </div>
);

// the sales summary's date range: [from, to] plus the period before it to compare against
export const SALES_RANGES = [
  ["month", "This month"], ["lastMonth", "Last month"], ["7", "Last 7 days"], ["30", "Last 30 days"],
  ["quarter", "This quarter"], ["lastQuarter", "Last quarter"], ["year", "This year"], ["lastYear", "Last year"], ["custom", "Custom range…"],
];
export const salesRange = (key, custom, tod) => {
  const y = Number(tod.slice(0, 4)), m = Number(tod.slice(5, 7)), mStart = tod.slice(0, 8) + "01";
  const qStart = y + "-" + String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0") + "-01";
  const toDate = (start, upto) => addDays(start, daysBetween(upto[0], upto[1])); // same number of days in
  let from, to, pFrom, pTo, vs;
  if (key === "lastMonth") { from = addMonths(mStart, -1); to = addDays(mStart, -1); pFrom = addMonths(mStart, -2); pTo = addDays(from, -1); vs = "the month before"; }
  else if (key === "7" || key === "30") { const n = Number(key); from = addDays(tod, -(n - 1)); to = tod; pFrom = addDays(from, -n); pTo = addDays(from, -1); vs = "the " + n + " days before"; }
  else if (key === "quarter") { from = qStart; to = tod; pFrom = addMonths(qStart, -3); pTo = toDate(pFrom, [from, to]); vs = "last quarter to date"; }
  else if (key === "lastQuarter") { from = addMonths(qStart, -3); to = addDays(qStart, -1); pFrom = addMonths(qStart, -6); pTo = addDays(from, -1); vs = "the quarter before"; }
  else if (key === "year") { from = y + "-01-01"; to = tod; pFrom = (y - 1) + "-01-01"; pTo = (y - 1) + tod.slice(4); vs = "last year to date"; }
  else if (key === "lastYear") { from = (y - 1) + "-01-01"; to = (y - 1) + "-12-31"; pFrom = (y - 2) + "-01-01"; pTo = (y - 2) + "-12-31"; vs = "the year before"; }
  else if (key === "custom" && custom && custom.from && custom.to && custom.from <= custom.to) {
    from = custom.from; to = custom.to; const n = daysBetween(from, to) + 1; pFrom = addDays(from, -n); pTo = addDays(from, -1); vs = "the " + n + " days before";
  } else { from = mStart; to = tod; pFrom = addMonths(mStart, -1); pTo = toDate(pFrom, [from, to]); vs = "last month to date"; }
  return { from, to, pFrom, pTo, vs };
};
const loadRange = () => { try { return JSON.parse(localStorage.getItem("dk-sales-range") || "null") || { key: "month" }; } catch (e) { return { key: "month" }; } };

export default function InvoicesScreen({ headerH = 0, openProduct, money = true, newFollowUp, crm, updateCrm, askConfirm, selId, setSelId, goCustomer, openQuote, openSample, openCollection, me, planner, updatePlanner, filter, setFilter }) {
  const [search, setSearch] = useState("");
  const phone = usePhone();
  const [peekCust, setPeekCust] = useState(null); // account peeked from the invoice editor
  const [range, setRangeState] = useState(loadRange); // the sales summary's period (remembered on this computer)
  const setRange = (r) => { setRangeState(r); try { localStorage.setItem("dk-sales-range", JSON.stringify(r)); } catch (e) { /* not kept */ } };
  const stick = (top, z) => (phone ? {} : { position: "sticky", top: headerH + top, zIndex: z });
  const [custQuery, setCustQuery] = useState("");
  const [notice, setNotice] = useState("");

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

  const inv = crm.invoices.find((i) => i.id === selId) || null;
  const bySkuAll = useMemo(() => skuIndex(crm), [crm.masterProducts]);

  const [stampOpen, setStampOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [siteNew, setSiteNew] = useState(null); // draft for the "+ new site" pop-over
  const addrGuard = useAddressGuard();
  const setInv = (fn) =>
    updateCrm((c) => {
      const t = c.invoices.find((i) => i.id === inv.id);
      if (t) fn(t, c);
      return c;
    });

  const newInvoice = () => {
    const n = blankInvoice("", "");
    n.invNo = nextNumber(crm.invoices, "invNo", crm.numbering.invoice);
    n.raisedBy = me || "";
    updateCrm((c) => {
      c.invoices.unshift(n);
      c.numbering.invoice = (Number(n.invNo) || 0) + 1;
      return c;
    });
    setCustQuery("");
    setSelId(n.id);
  };

  const removeInvoice = (i) =>
    askConfirm({
      message: "Delete invoice #" + (i.invNo || "—") + "? This can't be undone." + (i.quoteId ? " The quote it came from will reopen as Accepted." : ""),
      confirmLabel: "Delete",
      danger: true,
      action: () => {
        updateCrm((c) => {
          releaseInvoiceLinks(c, c.invoices.find((x) => x.id === i.id));
          c.invoices = c.invoices.filter((x) => x.id !== i.id);
          return c;
        });
        setSelId(null);
      },
    });

  const tryPrint = (kind) => {
    const cust = custById[inv.customerId];
    const site = siteById[inv.siteId];
    const ok =
      kind === "invoice" ? printInvoice(inv, cust, site)
      : kind === "loading" ? printLoadingBill(inv, cust, site, crm, planner)
      : printJobSheet(inv, cust, site);
    if (!ok) setNotice("Printing is blocked in the design preview — it works on the live site (ops.deckkingdom.co.uk).");
  };

  // ===== list view =====
  const q = search.trim().toLowerCase();
  const sorted = [...crm.invoices].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (Number(b.invNo) || 0) - (Number(a.invNo) || 0));
  const prefiltered = sorted.filter((i) => {
    if (filter && filter.customerId && i.customerId !== filter.customerId) return false;
    if (filter && filter.outstanding && isPaid(i)) return false;
    return true;
  });
  const matches = q
    ? prefiltered.filter((i) => {
        const c = custById[i.customerId];
        return [String(i.invNo || ""), i.orderRef, c && c.name, c && c.postcode, i.deliveryDate].some((v) => String(v || "").toLowerCase().includes(q));
      })
    : prefiltered;
  const filterCust = filter && filter.customerId ? custById[filter.customerId] : null;
  const filteredTotal = filter ? matches.reduce((t, i) => t + invoiceTotals(i).total, 0) : 0;
  const shown = matches.slice(0, 50);

  if (!inv)
    return (
      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "18px 22px" }}>
        <div style={{ ...stick(0, 15), background: "#f3f5f8", margin: "-18px -6px 0", padding: "18px 6px 2px" }}>
        {(() => {
          // headline numbers (inc VAT), same sums as the Home reports
          const tod = today();
          const rg = salesRange(range.key, range, tod);
          const live = crm.invoices.filter((i) => !isVoidInvoice(i)); // refunded / cancelled on the website don't count
          const between = (a, b) => live.filter((i) => (i.date || "") >= a && (i.date || "") <= b);
          const sum = (l) => l.reduce((t, i) => t + invoiceTotals(i).total, 0);
          const thisM = between(rg.from, rg.to), salesNow = sum(thisM), salesLast = sum(between(rg.pFrom, rg.pTo));
          const rangeName = range.key === "custom" ? prettyDate(rg.from) + " – " + prettyDate(rg.to) : (SALES_RANGES.find(([k]) => k === range.key) || SALES_RANGES[0])[1];
          const dark = { fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.22)", borderRadius: 9, padding: "7px 10px" };
          const rangePick = (
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <select value={range.key} onChange={(e) => setRange({ ...range, key: e.target.value, from: range.from || addDays(tod, -29), to: range.to || tod })} style={{ ...dark, cursor: "pointer" }}
                title="The period the sales and order figures cover">
                {SALES_RANGES.map(([k, l]) => <option key={k} value={k} style={{ color: NAVY }}>{l}</option>)}
              </select>
              {range.key === "custom" && (
                <>
                  <DateInput value={range.from || ""} onChange={(e) => setRange({ ...range, from: e.target.value })} title="From" style={{ ...dark, width: 128 }} />
                  <span style={{ color: "#aeb9cf", fontWeight: 700 }}>to</span>
                  <DateInput value={range.to || ""} onChange={(e) => setRange({ ...range, to: e.target.value })} title="To" style={{ ...dark, width: 128 }} />
                </>
              )}
              <HeroAdd title="New invoice" onClick={newInvoice} />
            </span>
          );
          const awaiting = live.filter((i) => !isPaid(i));
          const owed = sum(awaiting);
          const weekEnd = addDays(tod, 6);
          const sched = live.filter((i) => onSchedule(i, crm)); // delivery counts: not off-schedule customers
          const today_ = sched.filter((i) => i.deliveryDate === tod && !i.deliveryCompleted).length;
          const week = sched.filter((i) => i.deliveryDate >= tod && i.deliveryDate <= weekEnd && !i.deliveryCompleted).length;
          const toBook = sched.filter((i) => !i.deliveryDate && !i.deliveryCompleted).length;
          const sales = thisM.filter(isSaleInvoice);
          const feeds = [["FileMaker feed", crm.fmBridge, 30], ["Website feed", crm.wooBridge, 24 * 60]].filter(([, fd]) => fd && fd.at);
          return (
            <ListHero title="Invoices"
              sub={<span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {crm.invoices.length.toLocaleString("en-GB")} invoice{crm.invoices.length === 1 ? "" : "s"} · newest first
                {feeds.map(([label, fd, staleAfter]) => {
                  const mins = Math.round((Date.now() - new Date(fd.at).getTime()) / 60000);
                  const stale = mins > staleAfter;
                  return (
                    <span key={label} title={"Last " + label.toLowerCase() + " update: " + new Date(fd.at).toLocaleString("en-GB") + ". Reload to see the newest."}
                      style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: stale ? "#E8912D33" : "#3FA55C33", color: stale ? "#f6c48a" : "#9fdcb0" }}>
                      {label + " · " + (mins < 1 ? "just now" : mins < 90 ? mins + " min ago" : mins < 2880 ? Math.round(mins / 60) + " h ago" : Math.round(mins / 1440) + " days ago")}
                    </span>
                  );
                })}
              </span>}
              action={rangePick}>
              {money && <HeroStat label={"Sales · " + rangeName} value={gbp(salesNow)}
                sub={salesLast ? (salesNow >= salesLast ? "▲ " : "▼ ") + gbp(Math.abs(salesNow - salesLast)) + " vs " + rg.vs : "inc VAT"} />}
              <HeroStat label="Awaiting payment" value={money ? gbp(owed) : awaiting.length.toLocaleString("en-GB")} tone={awaiting.length ? "#f6c48a" : undefined}
                sub={awaiting.length + " invoice" + (awaiting.length === 1 ? "" : "s") + (awaiting.length ? " · click to list" : "")}
                onClick={awaiting.length ? () => setFilter({ outstanding: true }) : undefined} />
              <HeroStat label="Deliveries" value={today_ + " today"} tone={toBook ? "#f2a6b1" : undefined} sub={week + " this week · " + toBook + " to book in"} />
              <HeroStat label={"Orders · " + rangeName} value={sales.length.toLocaleString("en-GB")} sub={!money ? rangeName.toLowerCase() : sales.length ? gbp(sum(sales) / sales.length) + " average order" : "none yet"} />
            </ListHero>
          );
        })()}

        {filter && (
          <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "9px 14px", borderColor: "#ecc4cb", background: "#C8102E08" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#8a0b20", letterSpacing: 0.4, textTransform: "uppercase" }}>Filtered:</span>
            {filterCust && <Chip tone="red">{filterCust.name || "Customer"}</Chip>}
            {filter.outstanding && <Chip tone="red">Outstanding only</Chip>}
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {matches.length} invoice{matches.length === 1 ? "" : "s"}{money ? " · " + gbp(filteredTotal) : ""}{filter.outstanding ? " outstanding" : ""}
            </span>
            <span style={{ flex: 1 }} />
            <button style={{ ...btn, padding: "5px 11px", fontSize: 12.5 }} onClick={() => setFilter(null)}>
              <Icon name="x" size={12} />Clear filter
            </button>
          </div>
        )}

        <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px", marginBottom: 10 }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Search inv #, customer, order ref…" />
        </div>
        </div>

        <div style={card}>
          {crm.invoices.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 10px", color: "#5a6a85", fontWeight: 600 }}>No invoices yet.</div>
          ) : (
            <>
              <div className="dk-bleed" style={{ overflowX: "auto" }}>
                <table className="dk-t" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 780 }}>
                  <thead>
                    <tr>
                      {["Inv #", "Date", "Customer", "Job", "Delivery", "Total £", "Payment", ""].map((h, i) => (
                        <th key={i} style={{ textAlign: i === 5 ? "right" : "left", fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((i) => {
                      const c = custById[i.customerId];
                      const t = invoiceTotals(i);
                      return (
                        <tr key={i.id} onClick={() => setSelId(i.id)} style={{ cursor: "pointer" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f8fb")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", fontWeight: 700, color: "#185FA5", whiteSpace: "nowrap" }}>
                            {i.invNo || (String(i.id).startsWith("web-i-") ? <span title="Website order — FileMaker gives it its invoice number">{i.orderRef}</span> : "—")}
                            {String(i.id).startsWith("fm-i-") && <span title="Came across from FileMaker" style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, padding: "1px 5px", borderRadius: 8, background: "#eef1f6", color: "#5a6a85", letterSpacing: 0.3 }}>FM</span>}
                            {String(i.id).startsWith("web-i-") && <span title="Came in from the website" style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, padding: "1px 5px", borderRadius: 8, background: "#fdf3dc", color: "#8a5a00", letterSpacing: 0.3 }}>WEB</span>}
                          </td>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", whiteSpace: "nowrap" }}>{prettyDate(i.date)}</td>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", fontWeight: 700 }}>{c ? c.name : <span style={{ color: RED }}>No customer</span>}<RiskChip inv={i} style={{ marginLeft: 8 }} /><WebStatusChip inv={i} style={{ marginLeft: 8 }} /></td>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>{i.jobType}</td>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>
                            {isVoidInvoice(i) ? <span style={{ color: "#aab3c2" }}>—</span> : i.deliveryCompleted ? <Chip tone="green">Done</Chip> : i.deliveryDate ? <Chip tone="gold">{prettyDate(i.deliveryDate).slice(0, 6)}</Chip> : <Chip tone="red">Not booked</Chip>}
                          </td>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", textAlign: "right", fontWeight: 700 }}>{t.total.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>
                            {isVoidInvoice(i) ? <Chip>{i.webStatus === "refunded" ? "Refunded" : "Cancelled"}</Chip>
                              : <Chip tone={isPaid(i) ? "green" : "amber"}>{isPaid(i) ? "Paid" : "Awaiting"}{i.paymentType ? " · " + i.paymentType : ""}</Chip>}
                          </td>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", textAlign: "right" }}>
                            <button style={abtn} title="Open" onClick={(e) => { e.stopPropagation(); setSelId(i.id); }}><Icon name="pen" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {matches.length > shown.length && (
                <div style={{ fontSize: 12, color: "#8593a8", fontWeight: 600, marginTop: 10 }}>
                  Showing {shown.length} of {matches.length.toLocaleString("en-GB")} — keep typing to narrow it down.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );

  // ===== entry view =====
  // picking a driver here puts the job on the end of that driver's run for the day (as the schedule does)
  const setDriver = (v) => setInv((x, c) => {
    x.driver = v;
    if (!v || !x.deliveryDate || isCollectionJob(x) || x.runNo) return;
    const others = [
      ...c.invoices.filter((y) => y.id !== x.id && !isVoidInvoice(y) && !isCollectionJob(y) && y.deliveryDate === x.deliveryDate),
      ...(c.collections || []).filter((y) => y.collectDate === x.deliveryDate),
    ].filter((y) => y.driver === v);
    const run = others.reduce((m, y) => Math.max(m, Number(y.runNo) || 0), 0) || 1;
    x.runNo = String(run);
    x.dropNo = String(others.filter((y) => Number(y.runNo) === run).reduce((m, y) => Math.max(m, Number(y.dropNo) || 0), 0) + 1);
  });
  const saveNewSite = () => {
    const d = { ...siteNew, postcode: tidyPostcode(siteNew.postcode) || siteNew.postcode };
    if (!(d.address || d.name || "").trim()) return;
    const { _edit, ...clean } = d;
    const commit = () => {
      setInv((x, c) => {
        if (_edit) {
          const t = c.sites.find((y) => y.id === clean.id);
          if (t) Object.assign(t, clean);
        } else {
          c.sites.push(clean);
          c.numbering.site = (Number(clean.siteNo) || 0) + 1;
        }
        x.siteId = clean.id;
      });
      setSiteNew(null);
    };
    const was = _edit ? crm.sites.find((y) => y.id === clean.id) : null;
    const moved = !was || [was.address, was.town, was.postcode].join("|") !== [clean.address, clean.town, clean.postcode].join("|");
    if (moved && (clean.address || clean.postcode)) addrGuard.guard(clean, commit); else commit();
  };
  const cust = custById[inv.customerId];
  const sites = crm.sites.filter((s) => s.customerId === inv.customerId);
  const site = siteById[inv.siteId];
  const t = invoiceTotals(inv);

  const custMatches = custQuery.trim()
    ? crm.customers.filter((c) =>
        [c.name, c.postcode, c.town, c.mobile, String(c.accountNo || "")].some((v) => String(v || "").toLowerCase().includes(custQuery.trim().toLowerCase()))).slice(0, 8)
    : [];

  const field = (label, k, props = {}, style = {}) => (
    <div>
      <span style={lbl}>{label}</span>
      {props.type === "date"
        ? <DateInput style={{ ...inp, ...style }} value={inv[k] || ""} onChange={(e) => setInv((x) => (x[k] = e.target.value))} />
        : <input style={{ ...inp, ...style }} value={inv[k] === null ? "" : inv[k]} {...props} {...selectAllProps}
          onChange={(e) => setInv((x) => (x[k] = e.target.value))} />}
    </div>
  );

  const estCost = invoiceCost(inv, crm);
  // finished jobs: every card on the record turns green
  const cardX = inv.deliveryCompleted ? { ...card, background: "#e9f6ee", border: "1px solid #a9dbb8" } : card;

  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "18px 22px" }}>
      <datalist id="dk-paytypes">{PAYMENT_TYPES.map((s) => <option key={s} value={s} />)}</datalist>

      {(() => {
        // step through the list in its order (newest first; the current search / filter applied)
        const order = matches.some((x) => x.id === inv.id) ? matches : sorted;
        const at = order.findIndex((x) => x.id === inv.id);
        const prev = at > 0 ? order[at - 1] : null, next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
        const arrow = (x, up) => (
          <button style={{ ...abtn, width: 36, height: 36, opacity: x ? 1 : 0.4, cursor: x ? "pointer" : "default" }} disabled={!x} onClick={() => x && setSelId(x.id)}
            title={x ? (up ? "Previous: #" : "Next: #") + (x.invNo || "—") : up ? "First invoice" : "Last invoice"}>
            <span style={{ display: "inline-flex", transform: up ? "rotate(90deg)" : "rotate(-90deg)" }}><Icon name="back" stroke={NAVY} /></span>
          </button>
        );
        return (
          <div style={{ display: "flex", gap: 8, alignItems: "center", ...stick(0, 16), background: "#f3f5f8", margin: "-18px -6px 0", padding: "18px 6px 10px" }}>
            <button style={btn} onClick={() => setSelId(null)}><Icon name="back" stroke={NAVY} />All invoices</button>
            {arrow(prev, true)}
            {arrow(next, false)}
            {at >= 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#8593a8" }}>{(at + 1).toLocaleString("en-GB")} of {order.length.toLocaleString("en-GB")}</span>}
          </div>
        );
      })()}

      {notice && (
        <div style={{ ...cardX, borderColor: GOLD, background: "#fff8e6", display: "flex", gap: 10, alignItems: "center", fontWeight: 600, fontSize: 13 }}>
          <span style={{ flex: 1 }}>{notice}</span>
          <button style={abtn} onClick={() => setNotice("")}><Icon name="x" /></button>
        </div>
      )}

      {/* header band */}
      <div style={{ background: inv.deliveryCompleted ? "linear-gradient(135deg,#1f6b3a 0%,#2f8a4c 100%)" : "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", borderRadius: 12, padding: "16px 22px", color: "#fff", marginBottom: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", ...stick(64, 15), boxShadow: phone ? undefined : "0 0 0 8px #f3f5f8, 0 10px 14px -10px rgba(11,31,63,.35)" }}>
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ position: "relative", display: "inline-block" }} onMouseEnter={() => setStampOpen(true)} onMouseLeave={() => setStampOpen(false)}>
              <h2 style={{ margin: 0, fontSize: 19, cursor: "default" }}>
                Invoice #{inv.invNo || "—"}
                <span style={{ color: "#aeb9cf", fontWeight: 600, fontSize: 14, marginLeft: 12 }}>{prettyDate(inv.date)}</span>
              </h2>
              {stampOpen && (
                <span style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", zIndex: 20, background: "#fff", color: NAVY, border: "1px solid #e6e9ef", borderRadius: 12, padding: "8px 12px", boxShadow: "0 8px 24px rgba(0,0,0,.28)", whiteSpace: "nowrap", fontSize: 12, fontWeight: 600, lineHeight: 1.6 }}>
                  <span style={{ display: "block" }}>Raised {prettyDate(inv.created)}{inv.raisedBy ? " by " + inv.raisedBy.split("@")[0] : ""}
                    {recordOrigin(inv).key === "filemaker" ? " · came across from FileMaker" : recordOrigin(inv).key === "website" ? " · came in from the website" : ""}</span>
                  {inv.updatedAt && <span style={{ display: "block" }}>{"Updated " + prettyDateTime(inv.updatedAt) + (inv.modifiedBy ? " by " + inv.modifiedBy.split("@")[0] + " (" + userInitials(crm, inv.modifiedBy) + ")" : "")}</span>}
                </span>
              )}
            </span>
            {(() => {
              const fromQuote = inv.quoteId ? (crm.quotes || []).find((q) => q.id === inv.quoteId) : null;
              return fromQuote ? (
                <button onClick={() => openQuote && openQuote(fromQuote.id)} title="Open the quote this invoice came from"
                  style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "#F4B73E33", border: "1px solid " + GOLD, color: GOLD, cursor: "pointer" }}>
                  {"From quote " + quoteRef(fromQuote)}
                </button>
              ) : null;
            })()}
            {(crm.samples || []).filter((x) => x.convertedInvoiceId === inv.id).map((x) => (
              <button key={x.id} onClick={() => openSample && openSample(x.id)} title="This order is credited to a sample request"
                style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "#3FA55C33", border: "1px solid #3FA55C", color: "#8fe0a6", cursor: "pointer" }}>
                {"From sample " + sampleRef(x)}
              </button>
            ))}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <PrintButton options={[
          { key: "invoice", label: "Invoice", dot: "#d5d9e0", run: () => tryPrint("invoice") },
          { key: "delivery", label: "Delivery note", dot: "#6cc28a", run: () => tryPrint("job") },
          { key: "loading", label: "Loading note", dot: "#f2c55c", run: () => tryPrint("loading") },
        ]} allLabel="Print all three" onAll={() => {
          const ok = printJobDocs([inv], ["loading", "delivery", "invoice"], { custOf: (x) => custById[x.customerId], siteOf: (x) => siteById[x.siteId], crm, planner, title: "Job " + (inv.invNo || "") });
          if (!ok) setNotice("Printing is blocked here — allow pop-ups for ops.deckkingdom.co.uk and try again.");
        }} />
        {newFollowUp && (
          <button style={bandBtn} title="Something missing or broken? Create a follow-up job to post or deliver it" onClick={() => newFollowUp(inv.id)}>
            <Icon name="wrench" stroke="#fff" size={14} />Follow-up job
          </button>
        )}
        <BandDelete title="Delete this invoice" onClick={() => removeInvoice(inv)} />
      </div>

      {/* refunded / cancelled on the website */}
      {inv.webStatus && (() => {
        const part = inv.webStatus === "partial refund";
        const refundLines = (inv.lines || []).filter((l) => String(l.id || "").startsWith("web-r-") || /^Website refund/.test(l.description || ""));
        const refundSum = refundLines.reduce((t, l) => t + Math.abs(Number(l.price) || 0) * (Number(l.qty) || 1), 0);
        return (
          <div style={{ ...cardX, borderColor: part ? "#f4d78f" : "#c9d0db", background: part ? "#fff8e6" : "#f3f5f8", display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: part ? "#E8912D" : "#5a6a85", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <Icon name="warn" stroke="#fff" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <b style={{ fontSize: 14.5, color: part ? "#8a5a00" : NAVY }}>
                {part ? "Part refunded on the website — " + gbp(refundSum) : inv.webStatus === "refunded" ? "Refunded on the website" : "Cancelled on the website"}
              </b>
              <div style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600, marginTop: 2 }}>
                {part
                  ? "The refund is on the invoice as a minus line. Check whether anything needs taking off the delivery."
                  : "This job is off the delivery schedule and out of the sales figures." + (inv.deliveryCompleted ? " It was already marked delivered — check whether goods need collecting." : "")}
              </div>
            </div>
            {!part && inv.stockDeducted && (
              <button style={goldBtn} title="The stock for this job was taken off — put it back now the order is refunded"
                onClick={() => setInv((t, c) => applyInvoiceStockDeduction(t, c, false, me))}>
                <Icon name="box" stroke={NAVY} />Put stock back
              </button>
            )}
          </div>
        );
      })()}

      {/* payment risk */}
      {(() => {
        const r = riskOf(inv);
        if (!r) return null;
        const who = (me || "").split("@")[0];
        if (!r.open) return (
          <div style={{ ...cardX, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "9px 14px", fontSize: 12.5, fontWeight: 600, color: "#5a6a85" }}>
            <Icon name="warn" stroke="#8593a8" size={14} />
            <span><b style={{ color: NAVY }}>{r.label}</b> — checked by {r.checked}{r.note ? " · " + r.note : ""}</span>
            <span style={{ flex: 1 }} />
            <button style={{ ...btn, padding: "4px 10px", fontSize: 12 }} onClick={() => setInv((t) => (t.riskChecked = ""))}>Re-open</button>
            <button style={{ ...btn, padding: "4px 10px", fontSize: 12 }} onClick={() => setInv((t) => { t.riskFlag = ""; t.riskNote = ""; t.riskChecked = ""; })}>Remove flag</button>
          </div>
        );
        return (
          <div style={{ ...cardX, borderColor: "#C8102E", background: "#C8102E0d", display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#C8102E", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <Icon name="warn" stroke="#fff" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <b style={{ fontSize: 14.5, color: "#9b1c2e" }}>{r.label} — check before dispatch</b>
              <div style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600, marginTop: 2 }}>
                {r.level === "manual" ? "Flagged by hand." : "From the payment on the website (Stripe)."} Call the customer and confirm the order and delivery address before it goes out.
              </div>
              <input style={{ ...inp, marginTop: 8, fontSize: 13 }} placeholder={r.level === "manual" ? "Why is it flagged? (e.g. delivery address differs, new card, unusual order)" : "Notes"}
                value={inv.riskNote || ""} onChange={(e) => setInv((t) => (t.riskNote = e.target.value))} />
            </div>
            <div style={{ display: "flex", gap: 6, flexDirection: "column" }}>
              <button style={{ ...goldBtn, background: "#3FA55C", borderColor: "#3FA55C", color: "#fff" }}
                onClick={() => setInv((t) => (t.riskChecked = (staffName(crm, me) || who || "staff") + " · " + prettyDate(today())))}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Checked — OK to send
              </button>
              {r.level === "manual" && <button style={{ ...btn, fontSize: 12.5 }} onClick={() => setInv((t) => { t.riskFlag = ""; t.riskNote = ""; })}>Remove flag</button>}
            </div>
          </div>
        );
      })()}

      {/* customer + site */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 14 }}>
        <div style={{ ...cardX, marginBottom: 0 }}>
          <p style={sect}>Customer</p>
          {cust ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: GOLD, color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, flex: "none" }}>
                {(cust.name || "?").trim().charAt(0).toUpperCase() || "?"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
<b style={{ fontSize: 15 }}>{cust.name}</b>
                <div style={{ fontSize: 12, color: "#5a6a85", fontWeight: 600, marginTop: 2 }}>
                  {[cust.mobile || cust.landline, cust.contactMethod ? "prefers " + cust.contactMethod : "", cust.source, cust.trader ? "Trade" : "", Number(cust.discountPct) > 0 ? "−" + Number(cust.discountPct) + "%" : ""].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button style={abtn} title="Peek at the account" onClick={() => setPeekCust(cust.id)}><Icon name="user" /></button>
              <button style={abtn} title="Change customer" onClick={() => { setInv((x) => { x.customerId = ""; x.siteId = ""; }); setCustQuery(""); }}><Icon name="x" /></button>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <input style={inp} autoFocus placeholder="Type to find the customer — name, postcode, account #…" value={custQuery} onChange={(e) => setCustQuery(e.target.value)} />
              {custMatches.length > 0 && (
                <div style={{ border: "1px solid #e6e9ef", borderRadius: 8, marginTop: 6, overflow: "hidden" }}>
                  {custMatches.map((c) => (
                    <button key={c.id} onClick={() => { setInv((x) => { x.customerId = c.id; const fs = crm.sites.find((s) => s.customerId === c.id); x.siteId = fs ? fs.id : ""; if (x.discountPct === "" || x.discountPct === null) x.discountPct = c.discountPct || ""; }); setCustQuery(""); }}
                      style={{ display: "block", width: "100%", textAlign: "left", background: "#fff", border: "none", borderBottom: "1px solid #f0f2f6", padding: "9px 12px", fontFamily: "inherit", fontSize: 13.5, cursor: "pointer" }}>
                      <b>{c.name || "Unnamed"}</b> <span style={{ color: "#5a6a85", fontWeight: 600 }}>#{c.accountNo || "—"} · {[c.town, c.postcode].filter(Boolean).join(" ")}</span>
                    </button>
                  ))}
                </div>
              )}
              {custQuery.trim() && custMatches.length === 0 && (
                <div style={{ fontSize: 12.5, color: "#8593a8", fontWeight: 600, marginTop: 8 }}>No match — add them on the Customers tab first.</div>
              )}
            </div>
          )}
        </div>

        <div style={{ ...cardX, marginBottom: 0 }}>
          <p style={sect}>Deliver to</p>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <Icon name="pin" size={17} stroke={GOLD} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select style={{ ...inp, fontWeight: 700, flex: 1, minWidth: 0 }} value={inv.siteId} disabled={!cust}
                onChange={(e) => setInv((x) => (x.siteId = e.target.value))}>
                <option value="">{cust ? "Invoice address — " + [cust.address, cust.postcode].filter(Boolean).join(", ") : "Pick the customer first"}</option>
                <option value={TRADE_COUNTER}>{TRADE_COUNTER_LABEL} — collected from the warehouse</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {"Site #" + (s.siteNo || "—") + " — " + [s.name || s.address, s.postcode].filter(Boolean).join(", ")}
                  </option>
                ))}
              </select>
              <button style={{ ...abtn, width: 36, height: 36, flex: "none", opacity: site ? 1 : 0.4 }} disabled={!site} title={site ? "Edit this site's details" : "Pick a site to edit it"}
                onClick={() => setSiteNew({ ...site, _edit: true })}>
                <Icon name="pen" size={13} />
              </button>
              <button style={{ ...abtn, width: 36, height: 36, flex: "none", opacity: cust ? 1 : 0.4 }} disabled={!cust} title="Add a new delivery site for this customer"
                onClick={() => setSiteNew({ ...blankSite(cust.id), siteNo: nextNumber(crm.sites, "siteNo", crm.numbering.site) })}>
                <Icon name="plus" />
              </button>
              </div>
              {cust && inv.siteId !== TRADE_COUNTER && !isCollectionJob(inv) && (() => { const a = site || cust; return <DeliverAddrCheck address={a.address} town={a.town} postcode={a.postcode} />; })()}
              {site && site.notes && <NoteBox>{site.notes}</NoteBox>}
            </div>
          </div>
        </div>
      </div>

      {siteNew && cust && (
        <Modal title={<span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>{siteNew._edit ? "Edit site" : "New site for " + (cust.name || "customer")} <Chip style={{ fontSize: 13 }}>Site #{siteNew.siteNo || "—"}</Chip></span>} onClose={() => setSiteNew(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            {[["name", "Site name", { gridColumn: "1 / -1" }], ["address", "Address"], ["town", "Town"], ["postcode", "Post code"], ["contact", "Contact name"], ["mobile", "Mobile"], ["landline", "Landline"]].map(([k, l, st]) => (
              <div key={k} style={st}>
                <span style={lbl}>{l}</span>
                <input style={inp} value={siteNew[k] || ""} autoFocus={k === "name"} onChange={(e) => setSiteNew({ ...siteNew, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <span style={lbl}>Notes for booking in &amp; locating this site</span>
            <textarea style={{ ...inp, resize: "vertical" }} rows={3} value={siteNew.notes || ""} onChange={(e) => setSiteNew({ ...siteNew, notes: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={btn} onClick={() => setSiteNew({ ...siteNew, address: cust.address || "", town: cust.town || "", postcode: cust.postcode || "", contact: siteNew.contact || cust.contact || "", mobile: siteNew.mobile || cust.mobile || "", landline: siteNew.landline || cust.landline || "" })}>Copy from account</button>
            <span style={{ flex: 1 }} />
            <button style={btn} onClick={() => setSiteNew(null)}>Cancel</button>
            <button className="dk-save" style={{ ...goldBtn, opacity: (siteNew.address || siteNew.name || "").trim() ? 1 : 0.5 }} onClick={saveNewSite}>{addrGuard.busy ? "Checking address…" : siteNew._edit ? "Save" : "Save & use for this job"}</button>
          </div>
        </Modal>
      )}
      {addrGuard.modal}

      {/* job & delivery */}
      <div style={cardX}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 12 }}>
          <div style={{ gridColumn: "span 1" }}>
            <span style={lbl}>Job type</span>
            <select style={inp} value={inv.jobType} onChange={(e) => setInv((x) => (x.jobType = e.target.value))}>
              {inv.jobType && !JOB_TYPES.includes(inv.jobType) && <option value={inv.jobType}>{inv.jobType}</option>}
              {JOB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <span style={{ ...lbl, display: "flex", alignItems: "center", gap: 6 }}>Delivery date <Soon label="" icon="warn" note={"Changing the delivery date or time here doesn't yet warn that the customer was already told. Planned: the same 'Customer already notified — change and re-notify?' check the Delivery Schedule has. Until then the schedule shows the job amber so it gets re-sent."} style={{ padding: "0 5px", borderWidth: 1 }} /></span>
            <DateInput style={inp} value={inv.deliveryDate || ""} {...selectAllProps} onChange={(e) => setInv((x) => (x.deliveryDate = e.target.value))} />
          </div>
          <div>
            <span style={lbl}>Time</span>
            <select style={inp} value={inv.deliveryTime} onChange={(e) => setInv((x) => (x.deliveryTime = e.target.value))}>
              <option value="">—</option>
              {inv.deliveryTime && !TIME_SLOTS.includes(inv.deliveryTime) && <option value={inv.deliveryTime}>{inv.deliveryTime}</option>}
              {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <span style={lbl}>Driver</span>
            <select style={inp} value={inv.driver || ""} onChange={(e) => setDriver(e.target.value)}>
              <option value="">—</option>
              {inv.driver && !DRIVERS.includes(inv.driver) && <option value={inv.driver}>{inv.driver}</option>}
              {DRIVERS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <span style={lbl}>Payment type</span>
            <select style={inp} value={inv.paymentType || ""} onChange={(e) => setInv((x) => (x.paymentType = e.target.value))}>
              <option value="">—</option>
              {inv.paymentType && !PAYMENT_TYPES.includes(inv.paymentType) && <option value={inv.paymentType}>{inv.paymentType}</option>}
              {PAYMENT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {field("Payment date", "paymentDate", { type: "date" })}
          {field("Order ref / PO", "orderRef")}
        </div>
      </div>

      {/* lines + totals */}
      <div style={cardX}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
          <p style={{ ...sect, margin: 0 }}>Lines</p>
          <span style={{ flex: 1 }} />
          <label title="Flag this job as high risk — it gets a red warning until someone checks it"
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", color: inv.riskFlag && !inv.riskChecked ? "#9b1c2e" : NAVY }}>
            <input type="checkbox" checked={!!inv.riskFlag && !inv.riskChecked}
              onChange={(e) => setInv((t) => {
                if (e.target.checked) { t.riskFlag = t.riskFlag || "manual"; t.riskChecked = ""; }
                else if (t.riskFlag === "manual") { t.riskFlag = ""; t.riskNote = ""; }
                else t.riskChecked = (staffName(crm, me) || (me || "").split("@")[0] || "staff") + " · " + prettyDate(today()); // website flag: unticking = checked
              })} />
            Flag risk
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexWrap: "wrap", color: inv.deliveryCompleted ? "#28713e" : NAVY, marginRight: 10 }}>
            <input type="checkbox" checked={inv.deliveryCompleted}
              onChange={(e) => setInv((x, c) => { x.deliveryCompleted = e.target.checked; applyInvoiceStockDeduction(x, c, e.target.checked, me); })} />
            Delivery completed
            {inv.stockDeducted && <Chip tone="green" style={{ marginLeft: 4, fontSize: 10, padding: "1px 7px" }}>stock out</Chip>}
          </label>
        </div>
        <LinesEditor doc={inv} edit={setInv} crm={crm} onOpenProduct={openProduct} />


        {(() => {
          const shipments = (planner && planner.shipments) || [];
          const jc = jobCost(inv, crm, planner);
          const setPick = (pid, k, v) =>
            setInv((x) => {
              const p = x.picks.find((y) => y.id === pid);
              if (p) p[k] = v;
            });
          return (
            <div style={{ background: "#f8f9fb", border: "1px solid #e6e9ef", borderRadius: 12, padding: "12px 14px", marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <p style={{ ...sect, margin: 0 }}>Loading</p>
                <span style={{ flex: 1 }} />
                {inv.picks && inv.picks.length > 0 && (
                  <button
                    style={{ ...btn, padding: "6px 11px", fontSize: 12.5 }}
                    onClick={() =>
                      askConfirm({
                        message: "Rebuild the pick list from the invoice lines? Batch references on stock lines will be cleared — parts coming on collections stay.",
                        confirmLabel: "Rebuild",
                        danger: true,
                        action: () => setInv((x) => (x.picks = buildPicks(x, crm))),
                      })
                    }
                  >
                    Rebuild from lines
                  </button>
                )}
              </div>
              {!inv.picks || inv.picks.length === 0 ? (
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                  <span style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600, flex: 1, minWidth: 220 }}>
                    Build the pick list from the lines (kits pull their parts through). The warehouse then records which
                    shipment or batch each SKU was loaded from{money ? ", and the real landed cost flows into the job cost" : ""}.
                  </span>
                  <button style={goldBtn} onClick={() => setInv((x) => (x.picks = buildPicks(x, crm)))}>
                    <Icon name="box" stroke={NAVY} />Build pick list
                  </button>
                </div>
              ) : (
                <>
                  <div className="dk-bleed" style={{ overflowX: "auto", marginTop: 8 }}>
                    <table className="dk-t" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 760 }}>
                      <thead>
                        <tr>
                          {["SKU", "Description", "Qty", "Stock from (batch)", "Landed £/pc", "Line £", "Picked", ""].map((h, i) => (!money && (i === 4 || i === 5)) ? null : (
                            <th key={i} style={{ textAlign: i >= 2 && i <= 5 && i !== 3 ? "right" : "left", fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "7px 6px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {inv.picks.map((p) => {
                          const lc = pickLandedCost(p, crm, planner);
                          return (
                            <tr key={p.id}>
                              <td style={{ padding: "6px 6px", borderBottom: "1px solid #eef0f4", fontWeight: 700, whiteSpace: "nowrap" }}>{p.sku || "—"}{readableFor(bySkuAll, p.sku) && <div style={{ fontSize: 11, color: "#5a6a85" }}>{readableFor(bySkuAll, p.sku)}</div>}</td>
                              <td style={{ padding: "6px 6px", borderBottom: "1px solid #eef0f4" }}>{p.description}{p.colour ? " · " + p.colour : ""}</td>
                              <td style={{ padding: "6px 6px", borderBottom: "1px solid #eef0f4", width: 64 }}>
                                <input {...selectAllProps} style={{ ...numInp, padding: "4px 7px" }} inputMode="decimal" value={p.qty} onChange={(e) => setPick(p.id, "qty", e.target.value)} />
                              </td>
                              <td style={{ padding: "6px 6px", borderBottom: "1px solid #eef0f4", minWidth: 190 }}>
                                <div style={{ display: "flex", gap: 5 }}>
                                  <select style={{ ...inp, padding: "4px 7px", fontSize: 12.5 }} value={p.shipmentId} onChange={(e) => setPick(p.id, "shipmentId", e.target.value)}>
                                    <option value="">— batch —</option>
                                    {shipments.map((s) => (
                                      <option key={s.id} value={s.id}>{s.name + (s.invoiceNo ? " · " + s.invoiceNo : "")}</option>
                                    ))}
                                  </select>
                                  <input style={{ ...inp, padding: "4px 7px", fontSize: 12.5, width: 76 }} placeholder="or ref" title="Free-text batch ref for stock that didn't come from an import shipment" value={p.batchRef} onChange={(e) => setPick(p.id, "batchRef", e.target.value)} />
                                </div>
                              </td>
                              {money && <td style={{ padding: "6px 6px", borderBottom: "1px solid #eef0f4", textAlign: "right", whiteSpace: "nowrap" }}>
                                {lc.perPc === null ? (
                                  <Chip tone="red" style={{ fontSize: 10, padding: "1px 7px" }}>no cost</Chip>
                                ) : (
                                  <>
                                    <b>{lc.perPc.toFixed(2)}</b>{" "}
                                    <Chip tone={lc.source === "landed" ? "gold" : "grey"} style={{ fontSize: 10, padding: "1px 7px" }}
                                      title={lc.source === "landed" ? "Real landed cost from the chosen shipment" : p.shipmentId ? "SKU not linked to an import product — using master cost" : "Master list cost — pick a batch for the landed figure"}>
                                      {lc.source === "landed" ? "landed" : "master"}
                                    </Chip>
                                  </>
                                )}
                              </td>}
                              {money && <td style={{ padding: "6px 6px", borderBottom: "1px solid #eef0f4", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                                {lc.perPc === null ? "—" : ((Number(p.qty) || 0) * lc.perPc).toFixed(2)}
                              </td>}
                              <td style={{ padding: "6px 6px", borderBottom: "1px solid #eef0f4", textAlign: "center", width: 48 }}>
                                <input type="checkbox" checked={p.picked} onChange={(e) => setPick(p.id, "picked", e.target.checked)} />
                              </td>
                              <td style={{ padding: "6px 2px", borderBottom: "1px solid #eef0f4", whiteSpace: "nowrap", textAlign: "right", width: 62 }}>
                                <button style={{ ...abtn, width: 26, height: 26 }} title="Split this line across two batches"
                                  onClick={() => setInv((x) => {
                                    const i = x.picks.findIndex((y) => y.id === p.id);
                                    if (i >= 0) x.picks.splice(i + 1, 0, { ...x.picks[i], ...blankPick(), sku: x.picks[i].sku, description: x.picks[i].description, colour: x.picks[i].colour, qty: "" });
                                  })}>
                                  <Icon name="plus" size={12} />
                                </button>{" "}
                                <button style={{ ...abtn, width: 26, height: 26 }} title="Remove"
                                  onClick={() => setInv((x) => (x.picks = x.picks.filter((y) => y.id !== p.id)))}>
                                  <Icon name="x" size={12} stroke={RED} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                </>
              )}
            </div>
          );
        })()}

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginTop: 16 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <span style={lbl}>Job notes</span>
            <textarea style={{ ...inp, resize: "vertical" }} rows={4} placeholder="Anything the driver or warehouse should know…"
              value={inv.jobNotes} onChange={(e) => setInv((x) => (x.jobNotes = e.target.value))} />
          </div>
          <div style={{ minWidth: 280 }}>
          {(() => {
            const lk = invoiceLoadKg(inv, crm);
            return (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8f9fb", border: "1px solid #e6e9ef", borderRadius: 12, padding: "8px 16px", marginBottom: 8, fontSize: 13 }}
                title="Summed from the master-product weights of the lines (kits as their parts)">
                <span style={{ color: "#5a6a85", fontWeight: 600 }}>Load</span>
                <b>{lk === null ? "—" : "≈ " + lk.toLocaleString("en-GB", { maximumFractionDigits: 0 }) + " kg"}</b>
              </div>
            );
          })()}
          <div style={{ background: NAVY, borderRadius: 12, padding: "6px 18px 12px", color: "#fff" }}>
            {[["Goods (inc VAT)", gbp(t.goods)]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #ffffff1c", fontSize: 13.5 }}>
                <span style={{ color: "#aeb9cf", fontWeight: 600 }}>{k}</span><b>{v}</b>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #ffffff1c", fontSize: 13.5 }}>
              <span style={{ color: "#aeb9cf", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                Discount
                <input {...selectAllProps} style={{ width: 46, textAlign: "right", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "3px 6px", border: "1px solid #3a4f78", borderRadius: 8, background: "#ffffff12", color: "#fff" }}
                  inputMode="decimal" placeholder="0" title="Set on the customer account; editable per invoice"
                  value={inv.discountPct === null ? "" : inv.discountPct}
                  onChange={(e) => setInv((x) => (x.discountPct = e.target.value))} />
                <span style={{ fontSize: 11.5 }}>%</span>
              </span>
              <b style={{ color: t.discount > 0 ? "#f2a6b1" : "#aeb9cf" }}>{t.discount > 0 ? "−" + gbp(t.discount) : "—"}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #ffffff1c", fontSize: 13.5 }}>
              <span style={{ color: "#aeb9cf", fontWeight: 600 }}>Delivery charge</span>
              <input {...selectAllProps} style={{ width: 92, textAlign: "right", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, padding: "5px 8px", border: "1px solid #3a4f78", borderRadius: 8, background: "#ffffff12", color: "#fff" }}
                inputMode="decimal" value={inv.deliveryCharge} placeholder="0.00"
                onChange={(e) => setInv((x) => (x.deliveryCharge = e.target.value))} />
            </div>
            {[["of which VAT (" + (Number(inv.vatRate) || 20) + "%)", gbp(t.vat)], ["Net", gbp(t.net)]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #ffffff1c", fontSize: 13.5 }}>
                <span style={{ color: "#aeb9cf", fontWeight: 600 }}>{k}</span><b>{v}</b>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12 }}>
              <span style={{ fontWeight: 700, letterSpacing: 0.5 }}>TOTAL</span>
              <span style={{ fontSize: 20, fontWeight: 700, background: GOLD, color: NAVY, borderRadius: 8, padding: "4px 14px" }}>{gbp(t.total)}</span>
            </div>

          </div>
          </div>
        </div>
        <StockCheck money={money} inv={inv} crm={crm} planner={planner} updatePlanner={updatePlanner} updateCrm={updateCrm} me={me} openCollection={openCollection}
          onRaised={(names) => setNotice((names.length > 1 ? "Collection notes raised with " : "Collection note raised with ") + names.join(" and ") + " — linked to this job and added to its pick list." + (inv.deliveryDate ? " It's on the delivery schedule as the stop before this job." : " This job has no delivery date yet, so give the note a date on the Collections screen."))} />
      </div>
      {money && <JobTotals inv={inv} crm={crm} planner={planner} />}
      {peekCust && (
        <CustomerPeek crm={crm} custId={peekCust} onClose={() => setPeekCust(null)}
          onOpenFull={(id) => { setPeekCust(null); goCustomer(id); }}
          onInvoice={(id) => { setPeekCust(null); setSelId(id); }} />
      )}
    </div>
  );
}

// ===== job totals: what the customer pays, what it cost us, what's left =====
function JobTotals({ inv, crm, planner }) {
  const t = invoiceTotals(inv);
  const rate = isFinite(Number(inv.vatRate)) ? Number(inv.vatRate) : 20;
  const exVat = (n) => n / (1 + rate / 100);
  const bySku = skuIndex(crm);
  // cost: the pick list's batch / landed costs once there is one, otherwise the products' own costs
  const fromPicks = (inv.picks || []).length > 0;
  const rows = fromPicks
    ? inv.picks.map((p) => { const c = pickLandedCost(p, crm, planner); return { id: p.id, desc: p.description || p.sku, colour: p.colour, qty: Number(p.qty) || 0, unit: c.perPc, source: c.source }; })
    : (inv.lines || []).filter((l) => l.description || l.code).map((l) => {
        const mp = bySku[String(l.code || "").trim().toLowerCase()];
        const unit = mp && mp.costGbp !== "" && mp.costGbp !== null && mp.costGbp !== undefined ? Number(mp.costGbp) : null;
        return { id: l.id, desc: l.description || l.code, colour: l.colour, qty: Number(l.qty) || 0, unit, source: unit === null ? "none" : "product" };
      });
  const cost = rows.reduce((a, r) => a + (r.unit === null ? 0 : r.qty * r.unit), 0);
  const uncosted = rows.filter((r) => r.unit === null).length;
  const goodsNet = exVat(t.goods - t.discount), delNet = exVat(t.delivery);
  const goodsMargin = goodsNet - cost, margin = t.net - cost;
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 + "%" : "—");
  const good = margin >= 0;
  const SRC = { batch: ["batch", "gold"], landed: ["landed", "gold"], master: ["stock", "grey"], product: ["product", "grey"], none: ["no cost", "red"] };
  const box = { background: "#f8f9fb", border: "1px solid #e6e9ef", borderRadius: 12, padding: "12px 14px" };
  const row = (k, v, o = {}) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", fontSize: 13, borderTop: o.rule ? "1px solid #e1e5ec" : "none", marginTop: o.rule ? 4 : 0, paddingTop: o.rule ? 8 : 5 }}>
      <span style={{ color: o.strong ? NAVY : "#5a6a85", fontWeight: o.strong ? 800 : 600 }}>{k}</span>
      <span style={{ fontWeight: o.strong ? 800 : 700, color: o.tone || NAVY, whiteSpace: "nowrap" }}>{v}</span>
    </div>
  );
  // where the money goes: cost · margin · VAT, as shares of the total
  const parts = t.total > 0 ? [["Cost", Math.max(0, cost), "#8593a8"], ["Margin", Math.max(0, margin), good ? "#3FA55C" : RED], ["VAT", t.vat, "#c9d0db"]] : [];
  const partSum = parts.reduce((a, p) => a + p[1], 0) || 1;
  return (
    <div style={{ ...card, marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <p style={{ ...sect, margin: 0 }}>Job totals</p>
        <Chip tone={fromPicks ? "gold" : "grey"} style={{ fontSize: 10.5 }}>{fromPicks ? "costs from the pick list" : "costs estimated from the products"}</Chip>
        {uncosted > 0 && <Chip tone="red" style={{ fontSize: 10.5 }}>{uncosted} line{uncosted === 1 ? "" : "s"} with no cost</Chip>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        <div style={box}>
          <div style={{ ...lbl, marginBottom: 6 }}>Customer pays</div>
          {row("Goods", gbp(t.goods))}
          {t.discount > 0 && row("Discount " + t.discountPct + "%", "−" + gbp(t.discount), { tone: RED })}
          {row("Delivery", t.delivery ? gbp(t.delivery) : "—")}
          {row("Total inc VAT", gbp(t.total), { strong: true, rule: true })}
          {row("VAT " + rate + "%", gbp(t.vat))}
          {row("Net (ex VAT)", gbp(t.net), { strong: true })}
        </div>
        <div style={box}>
          <div style={{ ...lbl, marginBottom: 6 }}>What it cost us (ex VAT)</div>
          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            {rows.length === 0 ? <div style={{ fontSize: 13, color: "#8593a8", fontWeight: 600, padding: "5px 0" }}>No lines yet</div> : rows.map((r) => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0 10px", padding: "5px 0", fontSize: 12.5, borderBottom: "1px solid #eef0f4" }}>
                <span style={{ fontWeight: 700, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.desc}>{r.desc}{r.colour ? <span style={{ color: "#8593a8" }}> · {r.colour}</span> : null}</span>
                <b style={{ whiteSpace: "nowrap" }}>{r.unit === null ? "—" : gbp(r.qty * r.unit)}</b>
                <span style={{ color: "#8593a8", fontWeight: 600, fontSize: 11.5 }}>
                  {r.qty} × {r.unit === null ? "no cost" : gbp(r.unit)} <Chip tone={SRC[r.source][1]} style={{ fontSize: 9.5, padding: "0 6px", marginLeft: 4 }}>{SRC[r.source][0]}</Chip>
                </span>
                <span />
              </div>
            ))}
          </div>
          {row("Goods cost", gbp(cost), { strong: true, rule: true })}
        </div>
        <div style={{ ...box, background: good ? "#eef8f1" : "#C8102E0d", borderColor: good ? "#bfe3ca" : "#ecc4cb" }}>
          <div style={{ ...lbl, marginBottom: 6 }}>Margin</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: good ? "#28713e" : RED, lineHeight: 1.1 }}>{gbp(margin)}</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#5a6a85", marginBottom: 8 }}>{pct(margin, t.net)} of net · markup {pct(margin, cost)}</div>
          {row("On the goods", gbp(goodsMargin) + " · " + pct(goodsMargin, goodsNet), { tone: goodsMargin >= 0 ? "#28713e" : RED })}
          {row("Delivery income", delNet ? gbp(delNet) : "—")}
          {parts.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: "#e6e9ef" }}>
                {parts.map(([k, v, c]) => <span key={k} title={k + " " + gbp(v)} style={{ width: (v / partSum) * 100 + "%", background: c }} />)}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11.5, fontWeight: 700, color: "#5a6a85", flexWrap: "wrap" }}>
                {parts.map(([k, v, c]) => <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: c }} />{k} {Math.round((v / partSum) * 100)}%</span>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
