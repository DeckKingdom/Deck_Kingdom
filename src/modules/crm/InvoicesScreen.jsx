// Invoices tab: searchable list -> invoice entry screen per the approved
// mockup. Prices are entered inc VAT; VAT is backed out of the total.
import { useState, useMemo } from "react";
import { NAVY, GOLD, RED, uid, prettyDate, prettyDateTime, addMonths, addDays } from "../../lib/core.js";
import {
  recordOrigin, blankInvoice, blankLine, nextNumber, invoiceTotals, gbp, isPaid,
  JOB_TYPES, PAYMENT_TYPES, PREP_FLAGS, FOLLOWUP_FLAGS, today, TIME_SLOTS, vanOptions,
  skuIndex, invoiceCost, buildPicks, pickLandedCost, jobCost, blankPick, invoiceLoadKg, applyInvoiceStockDeduction,
  TRADE_COUNTER, TRADE_COUNTER_LABEL, quoteRef, sampleRef, isSaleInvoice, riskOf, staffName, isVoidInvoice, userInitials,
} from "../../lib/crmCore.js";
import { ListHero, HeroStat, HeroAdd, SearchBox, RiskChip, WebStatusChip, Soon } from "./ui.jsx";
import { Icon, Chip, Tg, Modal, selectAllProps, SuggestInput, sect, lbl, card, abtn, inp, btn, goldBtn } from "./ui.jsx";
import { printInvoice, printJobSheet, printLoadingBill } from "./printDocs.js";
import { readableFor } from "./LinesEditor.jsx";
import LinesEditor from "./LinesEditor.jsx";
import StockCheck from "./StockCheck.jsx";

const docBtn = { ...btn, padding: "6px 11px", fontSize: 12.5 };
const navyBtn = { ...btn, background: "transparent", border: "1px solid #3a4f78", color: "#fff" };
const numInp = { ...inp, textAlign: "right" };

const NoteBox = ({ children }) => (
  <div style={{ marginTop: 7, background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "7px 11px", fontSize: 12.5, fontWeight: 600, display: "flex", gap: 7, alignItems: "flex-start", color: "#6b5305" }}>
    <span style={{ marginTop: 2 }}><Icon name="note" size={13} stroke="#9a7408" /></span>
    <span>{children}</span>
  </div>
);

export default function InvoicesScreen({ crm, updateCrm, askConfirm, selId, setSelId, goCustomer, openQuote, openSample, openCollection, me, planner, updatePlanner, filter, setFilter }) {
  const [search, setSearch] = useState("");
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
        {(() => {
          // headline numbers (inc VAT), same sums as the Home reports
          const tod = today();
          const monthKey = tod.slice(0, 7);
          const lastKey = addMonths(tod.slice(0, 8) + "01", -1).slice(0, 7);
          const dom = Number(tod.slice(8, 10));
          const live = crm.invoices.filter((i) => !isVoidInvoice(i)); // refunded / cancelled on the website don't count
          const inMonth = (key, upto) => live.filter((i) => (i.date || "").slice(0, 7) === key && (!upto || Number((i.date || "").slice(8, 10)) <= upto));
          const sum = (l) => l.reduce((t, i) => t + invoiceTotals(i).total, 0);
          const thisM = inMonth(monthKey), salesNow = sum(thisM), salesLast = sum(inMonth(lastKey, dom));
          const awaiting = live.filter((i) => !isPaid(i));
          const owed = sum(awaiting);
          const weekEnd = addDays(tod, 6);
          const today_ = live.filter((i) => i.deliveryDate === tod && !i.deliveryCompleted).length;
          const week = live.filter((i) => i.deliveryDate >= tod && i.deliveryDate <= weekEnd && !i.deliveryCompleted).length;
          const toBook = live.filter((i) => !i.deliveryDate && !i.deliveryCompleted).length;
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
              action={<HeroAdd title="New invoice" onClick={newInvoice} />}>
              <HeroStat label="Sales this month" value={gbp(salesNow)}
                sub={salesLast ? (salesNow >= salesLast ? "▲ " : "▼ ") + gbp(Math.abs(salesNow - salesLast)) + " vs last month to date" : "inc VAT"} />
              <HeroStat label="Awaiting payment" value={gbp(owed)} tone={awaiting.length ? "#f6c48a" : undefined}
                sub={awaiting.length + " invoice" + (awaiting.length === 1 ? "" : "s") + (awaiting.length ? " · click to list" : "")}
                onClick={awaiting.length ? () => setFilter({ outstanding: true }) : undefined} />
              <HeroStat label="Deliveries" value={today_ + " today"} tone={toBook ? "#f2a6b1" : undefined} sub={week + " this week · " + toBook + " to book in"} />
              <HeroStat label="Orders this month" value={sales.length.toLocaleString("en-GB")} sub={sales.length ? gbp(sum(sales) / sales.length) + " average order" : "none yet"} />
            </ListHero>
          );
        })()}

        {filter && (
          <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "9px 14px", borderColor: "#ecc4cb", background: "#C8102E08" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#8a0b20", letterSpacing: 0.4, textTransform: "uppercase" }}>Filtered:</span>
            {filterCust && <Chip tone="red">{filterCust.name || "Customer"}</Chip>}
            {filter.outstanding && <Chip tone="red">Outstanding only</Chip>}
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {matches.length} invoice{matches.length === 1 ? "" : "s"} · {gbp(filteredTotal)}{filter.outstanding ? " outstanding" : ""}
            </span>
            <span style={{ flex: 1 }} />
            <button style={{ ...btn, padding: "5px 11px", fontSize: 12.5 }} onClick={() => setFilter(null)}>
              <Icon name="x" size={12} />Clear filter
            </button>
          </div>
        )}

        <div style={card}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
            <SearchBox value={search} onChange={setSearch} placeholder="Search inv #, customer, order ref…" />
          </div>
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
      <input style={{ ...inp, ...style }} value={inv[k] === null ? "" : inv[k]} {...props} {...selectAllProps}
        onChange={(e) => setInv((x) => (x[k] = e.target.value))} />
    </div>
  );

  const estCost = invoiceCost(inv, crm);

  return (
    <div style={{ maxWidth: 1140, margin: "0 auto", padding: "18px 22px" }}>
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
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <button style={btn} onClick={() => setSelId(null)}><Icon name="back" stroke={NAVY} />All invoices</button>
            {arrow(prev, true)}
            {arrow(next, false)}
            {at >= 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#8593a8" }}>{(at + 1).toLocaleString("en-GB")} of {order.length.toLocaleString("en-GB")}</span>}
          </div>
        );
      })()}

      {notice && (
        <div style={{ ...card, borderColor: GOLD, background: "#fff8e6", display: "flex", gap: 10, alignItems: "center", fontWeight: 600, fontSize: 13 }}>
          <span style={{ flex: 1 }}>{notice}</span>
          <button style={abtn} onClick={() => setNotice("")}><Icon name="x" /></button>
        </div>
      )}

      {/* header band */}
      <div style={{ background: "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", borderRadius: 12, padding: "16px 22px", color: "#fff", marginBottom: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
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
        <button title="Delete this invoice" onClick={() => removeInvoice(inv)}
          style={{ width: 28, height: 28, borderRadius: 8, border: "1px dashed #3a4f78", background: "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flex: "none" }}>
          <Icon name="bin" stroke="#8fa0c0" size={13} />
        </button>
      </div>

      {/* refunded / cancelled on the website */}
      {inv.webStatus && (() => {
        const part = inv.webStatus === "partial refund";
        const refundLines = (inv.lines || []).filter((l) => String(l.id || "").startsWith("web-r-") || /^Website refund/.test(l.description || ""));
        const refundSum = refundLines.reduce((t, l) => t + Math.abs(Number(l.price) || 0) * (Number(l.qty) || 1), 0);
        return (
          <div style={{ ...card, borderColor: part ? "#f4d78f" : "#c9d0db", background: part ? "#fff8e6" : "#f3f5f8", display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
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
          <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "9px 14px", fontSize: 12.5, fontWeight: 600, color: "#5a6a85" }}>
            <Icon name="warn" stroke="#8593a8" size={14} />
            <span><b style={{ color: NAVY }}>{r.label}</b> — checked by {r.checked}{r.note ? " · " + r.note : ""}</span>
            <span style={{ flex: 1 }} />
            <button style={{ ...btn, padding: "4px 10px", fontSize: 12 }} onClick={() => setInv((t) => (t.riskChecked = ""))}>Re-open</button>
            <button style={{ ...btn, padding: "4px 10px", fontSize: 12 }} onClick={() => setInv((t) => { t.riskFlag = ""; t.riskNote = ""; t.riskChecked = ""; })}>Remove flag</button>
          </div>
        );
        return (
          <div style={{ ...card, borderColor: "#C8102E", background: "#C8102E0d", display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
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
        <div style={{ ...card, marginBottom: 0 }}>
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
              <button style={abtn} title="Open account" onClick={() => goCustomer(cust.id)}><Icon name="user" /></button>
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

        <div style={{ ...card, marginBottom: 0 }}>
          <p style={sect}>Deliver to</p>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <Icon name="pin" size={17} stroke={GOLD} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <select style={{ ...inp, fontWeight: 700 }} value={inv.siteId} disabled={!cust}
                onChange={(e) => setInv((x) => (x.siteId = e.target.value))}>
                <option value="">{cust ? "Invoice address — " + [cust.address, cust.postcode].filter(Boolean).join(", ") : "Pick the customer first"}</option>
                <option value={TRADE_COUNTER}>{TRADE_COUNTER_LABEL} — collected from the warehouse</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {"Site #" + (s.siteNo || "—") + " — " + [s.name || s.address, s.postcode].filter(Boolean).join(", ")}
                  </option>
                ))}
              </select>
              {site && site.notes && <NoteBox>{site.notes}</NoteBox>}
            </div>
          </div>
        </div>
      </div>

      {/* prep & follow-up ticks */}
      <div style={{ ...card, padding: "10px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setFollowOpen((o) => !o)}
            style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 260, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <span style={{ ...sect, margin: 0 }}>Prep &amp; follow-up</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#5a6a85" }}>
              prep {PREP_FLAGS.filter(([k]) => inv.flags[k]).length}/{PREP_FLAGS.length} · follow-up {FOLLOWUP_FLAGS.filter(([k]) => inv.flags[k]).length}/{FOLLOWUP_FLAGS.length}
            </span>
            <span style={{ color: "#8593a8", fontSize: 12 }}>{followOpen ? "▾" : "▸"}</span>
          </button>
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
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexWrap: "wrap" }}>
            <input type="checkbox" checked={inv.deliveryCompleted}
              onChange={(e) => setInv((x, c) => { x.deliveryCompleted = e.target.checked; applyInvoiceStockDeduction(x, c, e.target.checked, me); })} />
            Delivery completed
            {inv.stockDeducted && <Chip tone="green" style={{ marginLeft: 4, fontSize: 10, padding: "1px 7px" }}>stock out</Chip>}
          </label>
        </div>
        {followOpen && (
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
            <span style={{ ...lbl, marginBottom: 0, marginRight: 4 }}>Prep</span>
            {PREP_FLAGS.map(([k, label, icon]) => (
              <Tg key={k} on={inv.flags[k]} title={label} icon={icon} onClick={() => setInv((x) => (x.flags[k] = !x.flags[k]))} />
            ))}
            <span style={{ ...lbl, marginBottom: 0, margin: "0 4px 0 18px" }}>Follow-up</span>
            {FOLLOWUP_FLAGS.map(([k, label, icon]) => (
              <Tg key={k} on={inv.flags[k]} title={label} icon={icon} onClick={() => setInv((x) => (x.flags[k] = !x.flags[k]))} />
            ))}
          </div>
        )}
      </div>

      {/* job & delivery */}
      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 12 }}>
          <div style={{ gridColumn: "span 2" }}>
            <span style={lbl}>Job type</span>
            <select style={inp} value={inv.jobType} onChange={(e) => setInv((x) => (x.jobType = e.target.value))}>
              {inv.jobType && !JOB_TYPES.includes(inv.jobType) && <option value={inv.jobType}>{inv.jobType}</option>}
              {JOB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <span style={{ ...lbl, display: "flex", alignItems: "center", gap: 6 }}>Delivery date <Soon label="" icon="warn" note={"Changing the delivery date or time here doesn't yet warn that the customer was already told. Planned: the same 'Customer already notified — change and re-notify?' check the Delivery Schedule has. Until then the schedule shows the job amber so it gets re-sent."} style={{ padding: "0 5px", borderWidth: 1 }} /></span>
            <input style={inp} type="date" value={inv.deliveryDate || ""} {...selectAllProps} onChange={(e) => setInv((x) => (x.deliveryDate = e.target.value))} />
          </div>
          <div>
            <span style={lbl}>Time</span>
            <select style={inp} value={inv.deliveryTime} onChange={(e) => setInv((x) => (x.deliveryTime = e.target.value))}>
              <option value="">—</option>
              {inv.deliveryTime && !TIME_SLOTS.includes(inv.deliveryTime) && <option value={inv.deliveryTime}>{inv.deliveryTime}</option>}
              {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {field("Order ref / PO", "orderRef")}
          {field("Payment date", "paymentDate", { type: "date" })}
          <div>
            <span style={lbl}>Payment type</span>
            <select style={inp} value={inv.paymentType || ""} onChange={(e) => setInv((x) => (x.paymentType = e.target.value))}>
              <option value="">—</option>
              {inv.paymentType && !PAYMENT_TYPES.includes(inv.paymentType) && <option value={inv.paymentType}>{inv.paymentType}</option>}
              {PAYMENT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* lines + totals */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <p style={{ ...sect, margin: 0 }}>Lines</p>
        </div>
        <LinesEditor doc={inv} edit={setInv} crm={crm} toolbar={<>
          <button style={docBtn} onClick={() => tryPrint("invoice")}><Icon name="doc" stroke={NAVY} size={13} />Invoice PDF</button>
          <button style={docBtn} onClick={() => tryPrint("job")}><Icon name="truck" stroke={NAVY} size={13} />Job sheet</button>
          <button style={docBtn} onClick={() => tryPrint("loading")}><Icon name="box" stroke={NAVY} size={13} />Packing slip</button>
        </>} />


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
                <p style={{ ...sect, margin: 0 }}>Loading &amp; job cost</p>
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
                    shipment or batch each SKU was loaded from, and the real landed cost flows into the job cost.
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
                          {["SKU", "Description", "Qty", "Stock from (batch)", "Landed £/pc", "Line £", "Picked", ""].map((h, i) => (
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
                                <input style={{ ...numInp, padding: "4px 7px" }} inputMode="decimal" value={p.qty} onChange={(e) => setPick(p.id, "qty", e.target.value)} />
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
                              <td style={{ padding: "6px 6px", borderBottom: "1px solid #eef0f4", textAlign: "right", whiteSpace: "nowrap" }}>
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
                              </td>
                              <td style={{ padding: "6px 6px", borderBottom: "1px solid #eef0f4", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                                {lc.perPc === null ? "—" : ((Number(p.qty) || 0) * lc.perPc).toFixed(2)}
                              </td>
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
                  <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginTop: 10, fontSize: 12.5, fontWeight: 700 }}>
                    <span>Actual job cost: <span style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 8, padding: "3px 9px" }}>{gbp(jc.total)}</span></span>
                    <span style={{ color: t.net > 0 && jc.costed > 0 ? (t.net - jc.total > 0 ? "#28713e" : RED) : "#8593a8" }}>
                      Margin: {t.net > 0 && jc.costed > 0 ? gbp(t.net - jc.total) + " (" + (((t.net - jc.total) / t.net) * 100).toFixed(0) + "% of net)" : "—"}
                    </span>
                    <span style={{ color: "#8593a8", fontWeight: 600 }}>
                      {jc.landedLines} of {jc.of} lines at batch landed cost{jc.costed < jc.of ? " · " + (jc.of - jc.costed) + " uncosted" : ""}
                    </span>
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
                <input style={{ width: 46, textAlign: "right", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "3px 6px", border: "1px solid #3a4f78", borderRadius: 8, background: "#ffffff12", color: "#fff" }}
                  inputMode="decimal" placeholder="0" title="Set on the customer account; editable per invoice"
                  value={inv.discountPct === null ? "" : inv.discountPct}
                  onChange={(e) => setInv((x) => (x.discountPct = e.target.value))} />
                <span style={{ fontSize: 11.5 }}>%</span>
              </span>
              <b style={{ color: t.discount > 0 ? "#f2a6b1" : "#aeb9cf" }}>{t.discount > 0 ? "−" + gbp(t.discount) : "—"}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #ffffff1c", fontSize: 13.5 }}>
              <span style={{ color: "#aeb9cf", fontWeight: 600 }}>Delivery charge</span>
              <input style={{ width: 92, textAlign: "right", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, padding: "5px 8px", border: "1px solid #3a4f78", borderRadius: 8, background: "#ffffff12", color: "#fff" }}
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
            {estCost.matched > 0 && (
              <div style={{ fontSize: 11, color: "#8fa0c0", fontWeight: 600, textAlign: "right", paddingTop: 7 }}>
                Est. cost {gbp(estCost.cost)} · margin {t.net > 0 ? (((t.net - estCost.cost) / t.net) * 100).toFixed(0) + "%" : "—"}
                {estCost.matched < estCost.of ? " (" + estCost.matched + " of " + estCost.of + " lines costed)" : ""}
              </div>
            )}
          </div>
          </div>
        </div>
        <StockCheck inv={inv} crm={crm} planner={planner} updatePlanner={updatePlanner} updateCrm={updateCrm} me={me} openCollection={openCollection}
          onRaised={(names) => setNotice((names.length > 1 ? "Collection notes raised with " : "Collection note raised with ") + names.join(" and ") + " — linked to this job and added to its pick list. It's on the Collections screen ready to book a van.")} />
      </div>
    </div>
  );
}
