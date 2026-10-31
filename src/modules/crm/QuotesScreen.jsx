// Quotes tab: searchable list with pipeline figures -> quote entry screen.
// A quote mirrors an invoice (same lines, inc-VAT prices, discount, delivery)
// on its own Q-number sequence; "Convert to invoice" raises the sale.
import { useState } from "react";
import { NAVY, GOLD, RED, uid, prettyDate, prettyDateTime, addDays } from "../../lib/core.js";
import {
  blankQuote, nextNumber, quoteTotals, gbp, today, quoteRef, quoteStatus, quoteInvoice, quoteIsOpen,
  QUOTE_STATUSES, QUOTE_TONES, QUOTE_VALID_DAYS, convertQuoteToInvoice, duplicateQuote, invoiceCost,
  TRADE_COUNTER, TRADE_COUNTER_LABEL,
} from "../../lib/crmCore.js";
import { quotesAvailable } from "../../data/crmStorage.js";
import { Icon, Chip, selectAllProps, sect, lbl, card, abtn, inp, btn, goldBtn } from "./ui.jsx";
import { printQuote } from "./printDocs.js";
import LinesEditor from "./LinesEditor.jsx";

const navyBtn = { ...btn, background: "transparent", border: "1px solid #3a4f78", color: "#fff" };
const th = { fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" };
const tdc = { padding: "9px 8px", borderBottom: "1px solid #f0f2f6" };

const NoteBox = ({ children }) => (
  <div style={{ marginTop: 7, background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "7px 11px", fontSize: 12.5, fontWeight: 600, display: "flex", gap: 7, alignItems: "flex-start", color: "#6b5305" }}>
    <span style={{ marginTop: 2 }}><Icon name="note" size={13} stroke="#9a7408" /></span>
    <span>{children}</span>
  </div>
);

const SchemaNotice = () => (
  <div style={{ ...card, borderColor: GOLD, background: "#fff8e6", fontSize: 13.5, fontWeight: 600, color: "#6b5305" }}>
    <b style={{ display: "block", fontSize: 14.5, color: NAVY, marginBottom: 4 }}>Quotes need one more database step</b>
    Run <code>016_quotes.sql</code> in Supabase (SQL Editor → New query → paste → Run), then refresh this page.
    Until then quotes can't be saved — everything else carries on as normal.
  </div>
);

const FILTERS = ["Open", "Accepted", "Converted", "Declined", "Expired", "All"];

export default function QuotesScreen({ crm, updateCrm, askConfirm, selId, setSelId, goCustomer, openInvoice, me, filter, setFilter }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Open");
  const [custQuery, setCustQuery] = useState("");
  const [notice, setNotice] = useState("");
  const ready = quotesAvailable();
  const quotes = crm.quotes || [];

  const custById = {};
  crm.customers.forEach((c) => (custById[c.id] = c));
  const siteById = {};
  crm.sites.forEach((s) => (siteById[s.id] = s));

  const q = quotes.find((x) => x.id === selId) || null;

  const setQuote = (fn) =>
    updateCrm((c) => {
      const t = c.quotes.find((x) => x.id === q.id);
      if (t) fn(t, c);
      return c;
    });

  const newQuote = () => {
    if (!ready) return;
    const n = blankQuote(filter && filter.customerId ? filter.customerId : "", "");
    n.quoteNo = nextNumber(quotes, "quoteNo", crm.numbering.quote);
    n.raisedBy = me || "";
    const cust = n.customerId && custById[n.customerId];
    if (cust && cust.discountPct !== "" && cust.discountPct !== null) n.discountPct = cust.discountPct;
    updateCrm((c) => {
      c.quotes.unshift(n);
      c.numbering.quote = (Number(n.quoteNo) || 0) + 1;
      return c;
    });
    setCustQuery("");
    setSelId(n.id);
  };

  // ===== list view =====
  if (!q) {
    const decided = { won: 0, lost: 0 };
    let openCount = 0;
    let openValue = 0;
    let acceptedWaiting = 0;
    quotes.forEach((x) => {
      const st = quoteStatus(x, crm);
      if (st === "Converted") decided.won++;
      if (st === "Declined" || st === "Expired") decided.lost++;
      if (st === "Accepted") acceptedWaiting++;
      if (quoteIsOpen(x, crm)) {
        openCount++;
        openValue += quoteTotals(x).total;
      }
    });
    const winRate = decided.won + decided.lost ? Math.round((decided.won / (decided.won + decided.lost)) * 100) : null;

    const s = search.trim().toLowerCase();
    const filterCust = filter && filter.customerId ? custById[filter.customerId] : null;
    const matches = [...quotes]
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (Number(b.quoteNo) || 0) - (Number(a.quoteNo) || 0))
      .filter((x) => {
        if (filterCust && x.customerId !== filterCust.id) return false;
        const st = quoteStatus(x, crm);
        if (statusFilter === "Open" && !quoteIsOpen(x, crm)) return false;
        if (statusFilter !== "Open" && statusFilter !== "All" && st !== statusFilter) return false;
        if (!s) return true;
        const c = custById[x.customerId];
        return [quoteRef(x), String(x.quoteNo || ""), c && c.name, c && c.postcode].some((v) => String(v || "").toLowerCase().includes(s));
      });
    const shown = matches.slice(0, 50);

    return (
      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "18px 22px" }}>
        {!ready && <SchemaNotice />}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 14 }}>
          {[
            ["Open quotes", openCount.toLocaleString("en-GB"), "Draft, sent or accepted"],
            ["Open value", gbp(openValue), "inc VAT"],
            ["Accepted — not invoiced", acceptedWaiting.toLocaleString("en-GB"), acceptedWaiting ? "ready to convert" : "all converted"],
            ["Win rate", winRate === null ? "—" : winRate + "%", decided.won + " won · " + decided.lost + " lost"],
          ].map(([k, v, sub]) => (
            <div key={k} style={{ ...card, marginBottom: 0, padding: "12px 16px" }}>
              <span style={lbl}>{k}</span>
              <b style={{ fontSize: 20, color: NAVY }}>{v}</b>
              <div style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>

        <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
            <span style={{ position: "absolute", left: 11, top: 10 }}><Icon name="search" /></span>
            <input style={{ ...inp, paddingLeft: 34 }} placeholder="Search quote #, customer, postcode…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setStatusFilter(f)}
                style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "6px 11px", borderRadius: 999, cursor: "pointer", border: "1px solid " + (statusFilter === f ? NAVY : "#d5d9e0"), background: statusFilter === f ? NAVY : "#fff", color: statusFilter === f ? "#fff" : "#5a6a85" }}>
                {f}
              </button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          <button style={{ ...goldBtn, opacity: ready ? 1 : 0.5 }} disabled={!ready} onClick={newQuote}><Icon name="plus" stroke={NAVY} />New quote</button>
        </div>

        {filterCust && (
          <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "9px 14px", borderColor: "#f4d78f", background: "#fff8e6" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#6b5305", letterSpacing: 0.4, textTransform: "uppercase" }}>Customer:</span>
            <Chip tone="gold">{filterCust.name || "Customer"}</Chip>
            <span style={{ flex: 1 }} />
            <button style={{ ...btn, padding: "5px 11px", fontSize: 12.5 }} onClick={() => setFilter(null)}><Icon name="x" size={12} />Show all customers</button>
          </div>
        )}

        <div style={card}>
          {matches.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 10px", color: "#5a6a85", fontWeight: 600 }}>
              {quotes.length === 0 ? "No quotes yet." : "No " + (statusFilter === "All" ? "" : statusFilter.toLowerCase() + " ") + "quotes match."}
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 780 }}>
                  <thead>
                    <tr>
                      {["Quote", "Date", "Customer", "Valid until", "Total £", "Status", "Invoice", ""].map((h, i) => (
                        <th key={i} style={{ ...th, textAlign: i === 4 ? "right" : "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((x) => {
                      const c = custById[x.customerId];
                      const st = quoteStatus(x, crm);
                      const inv = quoteInvoice(x, crm);
                      return (
                        <tr key={x.id} onClick={() => setSelId(x.id)} style={{ cursor: "pointer" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f8fb")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                          <td style={{ ...tdc, fontWeight: 700, color: "#185FA5", whiteSpace: "nowrap" }}>{quoteRef(x)}</td>
                          <td style={{ ...tdc, whiteSpace: "nowrap" }}>{prettyDate(x.date)}</td>
                          <td style={{ ...tdc, fontWeight: 700 }}>{c ? c.name : <span style={{ color: RED }}>No customer</span>}</td>
                          <td style={{ ...tdc, whiteSpace: "nowrap", color: st === "Expired" ? RED : undefined, fontWeight: st === "Expired" ? 700 : 400 }}>{x.validUntil ? prettyDate(x.validUntil) : "—"}</td>
                          <td style={{ ...tdc, textAlign: "right", fontWeight: 700 }}>{quoteTotals(x).total.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                          <td style={tdc}><Chip tone={QUOTE_TONES[st]}>{st}</Chip></td>
                          <td style={tdc}>
                            {inv ? (
                              <button onClick={(e) => { e.stopPropagation(); openInvoice(inv.id); }}
                                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, color: "#185FA5", fontSize: 13, padding: 0 }}>
                                #{inv.invNo || "—"}
                              </button>
                            ) : <span style={{ color: "#aab3c2" }}>—</span>}
                          </td>
                          <td style={{ ...tdc, textAlign: "right" }}>
                            <button style={abtn} title="Open" onClick={(e) => { e.stopPropagation(); setSelId(x.id); }}><Icon name="pen" /></button>
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
  }

  // ===== entry view =====
  const cust = custById[q.customerId];
  const sites = crm.sites.filter((s) => s.customerId === q.customerId);
  const site = siteById[q.siteId];
  const t = quoteTotals(q);
  const st = quoteStatus(q, crm);
  const inv = quoteInvoice(q, crm);
  const locked = Boolean(inv);
  const estCost = invoiceCost(q, crm);

  const custMatches = custQuery.trim()
    ? crm.customers
        .filter((c) => [c.name, c.postcode, c.town, c.mobile, String(c.accountNo || "")].some((v) => String(v || "").toLowerCase().includes(custQuery.trim().toLowerCase())))
        .slice(0, 8)
    : [];

  const tryPrint = () => {
    if (!printQuote(q, cust, site)) setNotice("Printing is blocked in the design preview — it works on the live site (ops.deckkingdom.co.uk).");
  };

  const convert = () => {
    if (!cust) return setNotice("Pick the customer before converting this quote to an invoice.");
    if (!q.lines.length) return setNotice("Add at least one line before converting this quote to an invoice.");
    const nextInv = nextNumber(crm.invoices, "invNo", crm.numbering.invoice);
    askConfirm({
      message: "Convert " + quoteRef(q) + " into invoice #" + nextInv + " for " + cust.name + " (" + gbp(t.total) + ")? Lines, prices, discount and delivery charge copy across; the quote is marked Accepted and locked.",
      confirmLabel: "Convert to invoice",
      action: () => {
        const newId = uid();
        updateCrm((c) => {
          convertQuoteToInvoice(c, q.id, me, newId);
          return c;
        });
        openInvoice(newId);
      },
    });
  };

  const duplicate = () => {
    const newId = uid();
    updateCrm((c) => {
      duplicateQuote(c, q.id, me, newId);
      return c;
    });
    setSelId(newId);
  };

  const remove = () =>
    askConfirm({
      message: "Delete quote " + quoteRef(q) + "? This can't be undone." + (inv ? " Invoice #" + (inv.invNo || "—") + " stays as it is." : ""),
      confirmLabel: "Delete",
      danger: true,
      action: () => {
        updateCrm((c) => {
          c.quotes = c.quotes.filter((x) => x.id !== q.id);
          c.invoices.forEach((i) => { if (i.quoteId === q.id) i.quoteId = ""; });
          return c;
        });
        setSelId(null);
      },
    });

  const darkInp = { width: 92, textAlign: "right", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, padding: "5px 8px", border: "1px solid #3a4f78", borderRadius: 8, background: "#ffffff12", color: "#fff" };

  return (
    <div style={{ maxWidth: 1140, margin: "0 auto", padding: "18px 22px" }}>
      <button style={{ ...btn, marginBottom: 12 }} onClick={() => setSelId(null)}><Icon name="back" stroke={NAVY} />All quotes</button>
      {!ready && <SchemaNotice />}

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
            <h2 style={{ margin: 0, fontSize: 19 }}>
              Quote {quoteRef(q)}
              <span style={{ color: "#aeb9cf", fontWeight: 600, fontSize: 14, marginLeft: 12 }}>{prettyDate(q.date)}</span>
            </h2>
            <Chip tone={QUOTE_TONES[st]} style={st === "Converted" ? { background: "#3FA55C", color: "#fff", border: "none" } : st === "Draft" || st === "Expired" ? { background: "#ffffff18", color: "#cfd6e4", border: "1px solid #ffffff2e" } : undefined}>{st}</Chip>
          </div>
          <div style={{ fontSize: 12.5, color: "#aeb9cf", fontWeight: 600, marginTop: 5 }}>
            Raised {prettyDate(q.created)}{q.raisedBy ? " by " + q.raisedBy.split("@")[0] : ""}
            {q.updatedAt ? " · Updated " + prettyDateTime(q.updatedAt) + (q.modifiedBy ? " by " + q.modifiedBy.split("@")[0] : "") : ""}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={navyBtn} onClick={tryPrint}><Icon name="doc" stroke="#fff" />Quote PDF</button>
          <button style={navyBtn} onClick={duplicate} title="Copy into a new draft quote — for a revised price or option"><Icon name="layers" stroke="#fff" />Duplicate</button>
          <button style={{ ...navyBtn, border: "1px dashed #3a4f78", color: "#8fa0c0" }} onClick={remove}><Icon name="bin" stroke="#8fa0c0" />Delete</button>
          {inv ? (
            <button style={goldBtn} onClick={() => openInvoice(inv.id)}><Icon name="doc" stroke={NAVY} />Open invoice #{inv.invNo || "—"}</button>
          ) : (
            <button style={{ ...goldBtn, opacity: st === "Declined" ? 0.6 : 1 }} onClick={convert} title="Raise the sale: creates an invoice with these lines">
              <Icon name="pound" stroke={NAVY} />Convert to invoice
            </button>
          )}
        </div>
      </div>

      {locked && (
        <div style={{ ...card, borderColor: "#bfe3ca", background: "#3FA55C14", display: "flex", gap: 10, alignItems: "center", fontWeight: 600, fontSize: 13, color: "#28713e" }}>
          <Icon name="lock" stroke="#28713e" />
          <span style={{ flex: 1 }}>
            Converted to invoice #{inv.invNo || "—"}{q.convertedAt ? " on " + prettyDate(q.convertedAt) : ""}. The quote is locked as a record of what was offered — make any changes on the invoice.
          </span>
        </div>
      )}

      {/* status & validity */}
      <div style={card}>
        <p style={sect}>Status &amp; validity</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, alignItems: "end" }}>
          <div>
            <span style={lbl}>Status</span>
            <select style={inp} value={locked ? "Accepted" : q.status} disabled={locked}
              onChange={(e) => setQuote((x) => {
                x.status = e.target.value;
                if (x.status === "Sent" && !x.sentDate) x.sentDate = today();
              })}>
              {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <span style={lbl}>Quote date</span>
            <input style={inp} type="date" value={q.date} disabled={locked} onChange={(e) => setQuote((x) => (x.date = e.target.value))} />
          </div>
          <div>
            <span style={lbl}>Valid until</span>
            <input style={{ ...inp, borderColor: st === "Expired" ? RED : "#d5d9e0" }} type="date" value={q.validUntil} disabled={locked} onChange={(e) => setQuote((x) => (x.validUntil = e.target.value))} />
          </div>
          <div>
            <span style={lbl}>Sent to customer</span>
            <input style={inp} type="date" value={q.sentDate} disabled={locked} onChange={(e) => setQuote((x) => (x.sentDate = e.target.value))} />
          </div>
          {st === "Expired" && (
            <button style={{ ...btn, justifyContent: "center" }} onClick={() => setQuote((x) => (x.validUntil = addDays(today(), QUOTE_VALID_DAYS)))}>
              <Icon name="clock" />Extend {QUOTE_VALID_DAYS} days
            </button>
          )}
        </div>
      </div>

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
                  {[cust.mobile || cust.landline, cust.email, cust.contactMethod ? "prefers " + cust.contactMethod : "", cust.trader ? "Trade" : "", Number(cust.discountPct) > 0 ? "−" + Number(cust.discountPct) + "%" : ""].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button style={abtn} title="Open account" onClick={() => goCustomer(cust.id)}><Icon name="user" /></button>
              {!locked && (
                <button style={abtn} title="Change customer" onClick={() => { setQuote((x) => { x.customerId = ""; x.siteId = ""; }); setCustQuery(""); }}><Icon name="x" /></button>
              )}
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <input style={inp} autoFocus placeholder="Type to find the customer — name, postcode, account #…" value={custQuery} onChange={(e) => setCustQuery(e.target.value)} />
              {custMatches.length > 0 && (
                <div style={{ border: "1px solid #e6e9ef", borderRadius: 8, marginTop: 6, overflow: "hidden" }}>
                  {custMatches.map((c) => (
                    <button key={c.id}
                      onClick={() => {
                        setQuote((x) => {
                          x.customerId = c.id;
                          const fs = crm.sites.find((s) => s.customerId === c.id);
                          x.siteId = fs ? fs.id : "";
                          if (x.discountPct === "" || x.discountPct === null) x.discountPct = c.discountPct || "";
                        });
                        setCustQuery("");
                      }}
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
              <select style={{ ...inp, fontWeight: 700 }} value={q.siteId} disabled={!cust || locked} onChange={(e) => setQuote((x) => (x.siteId = e.target.value))}>
                <option value="">{cust ? "Invoice address — " + [cust.address, cust.postcode].filter(Boolean).join(", ") : "Pick the customer first"}</option>
                <option value={TRADE_COUNTER}>{TRADE_COUNTER_LABEL} — collected from the warehouse</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{"Site #" + (s.siteNo || "—") + " — " + [s.name || s.address, s.postcode].filter(Boolean).join(", ")}</option>
                ))}
              </select>
              {site && site.notes && <NoteBox>{site.notes}</NoteBox>}
            </div>
          </div>
        </div>
      </div>

      {/* lines + totals */}
      <div style={card}>
        <p style={sect}>Lines</p>
        <LinesEditor doc={q} edit={setQuote} crm={crm} readOnly={locked} />

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginTop: 16 }}>
          <div style={{ flex: 1, minWidth: 240, display: "grid", gap: 12 }}>
            <div>
              <span style={lbl}>Notes for the customer (printed on the quote)</span>
              <textarea style={{ ...inp, resize: "vertical" }} rows={3} disabled={locked} placeholder="e.g. Includes fixings and trims for a 4m x 3m deck. Delivery within 5 working days of order."
                value={q.notes} {...selectAllProps} onChange={(e) => setQuote((x) => (x.notes = e.target.value))} />
            </div>
            <div>
              <span style={lbl}>Internal notes (office only)</span>
              <textarea style={{ ...inp, resize: "vertical", background: "#fbfcfd" }} rows={2} placeholder="Chased by phone, competitor price, follow-up plans…"
                value={q.internalNotes} onChange={(e) => setQuote((x) => (x.internalNotes = e.target.value))} />
            </div>
          </div>
          <div style={{ minWidth: 280 }}>
            <div style={{ background: NAVY, borderRadius: 12, padding: "6px 18px 12px", color: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #ffffff1c", fontSize: 13.5 }}>
                <span style={{ color: "#aeb9cf", fontWeight: 600 }}>Goods (inc VAT)</span><b>{gbp(t.goods)}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #ffffff1c", fontSize: 13.5 }}>
                <span style={{ color: "#aeb9cf", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  Discount
                  <input style={{ ...darkInp, width: 46, fontSize: 12.5, padding: "3px 6px", borderRadius: 8 }} inputMode="decimal" placeholder="0" disabled={locked}
                    title="Taken from the customer account; editable per quote"
                    value={q.discountPct === null ? "" : q.discountPct} onChange={(e) => setQuote((x) => (x.discountPct = e.target.value))} />
                  <span style={{ fontSize: 11.5 }}>%</span>
                </span>
                <b style={{ color: t.discount > 0 ? "#f2a6b1" : "#aeb9cf" }}>{t.discount > 0 ? "−" + gbp(t.discount) : "—"}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #ffffff1c", fontSize: 13.5 }}>
                <span style={{ color: "#aeb9cf", fontWeight: 600 }}>Delivery charge</span>
                <input style={darkInp} inputMode="decimal" value={q.deliveryCharge} placeholder="0.00" disabled={locked} onChange={(e) => setQuote((x) => (x.deliveryCharge = e.target.value))} />
              </div>
              {[["of which VAT (" + (Number(q.vatRate) || 20) + "%)", gbp(t.vat)], ["Net", gbp(t.net)]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #ffffff1c", fontSize: 13.5 }}>
                  <span style={{ color: "#aeb9cf", fontWeight: 600 }}>{k}</span><b>{v}</b>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12 }}>
                <span style={{ fontWeight: 700, letterSpacing: 0.5 }}>QUOTE TOTAL</span>
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
      </div>
    </div>
  );
}
