// Invoices tab: searchable list -> invoice entry screen per the approved
// mockup. Prices are entered inc VAT; VAT is backed out of the total.
import { useState, useMemo } from "react";
import { NAVY, GOLD, RED, uid, prettyDate, prettyDateTime } from "../../lib/core.js";
import {
  blankInvoice, blankLine, nextNumber, invoiceTotals, gbp, isPaid,
  JOB_TYPES, PAYMENT_TYPES, VANS, PREP_FLAGS, FOLLOWUP_FLAGS, today,
  skuIndex, invoiceCost, buildPicks, pickLandedCost, jobCost, blankPick,
  TRADE_COUNTER, TRADE_COUNTER_LABEL,
} from "../../lib/crmCore.js";
import { Icon, Chip, Tg, Modal, selectAllProps, sect, lbl, card, abtn, inp, btn, goldBtn } from "./ui.jsx";
import { printInvoice, printJobSheet, printLoadingBill } from "./printDocs.js";

const navyBtn = { ...btn, background: "transparent", border: "1px solid #3a4f78", color: "#fff" };
const numInp = { ...inp, textAlign: "right" };

const NoteBox = ({ children }) => (
  <div style={{ marginTop: 7, background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "7px 11px", fontSize: 12.5, fontWeight: 600, display: "flex", gap: 7, alignItems: "flex-start", color: "#6b5305" }}>
    <span style={{ marginTop: 2 }}><Icon name="note" size={13} stroke="#9a7408" /></span>
    <span>{children}</span>
  </div>
);

export default function InvoicesScreen({ crm, updateCrm, askConfirm, selId, setSelId, goCustomer, me, planner, filter, setFilter }) {
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
      message: "Delete invoice #" + (i.invNo || "—") + "? This can't be undone.",
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
        <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 360 }}>
            <span style={{ position: "absolute", left: 11, top: 10 }}><Icon name="search" /></span>
            <input style={{ ...inp, paddingLeft: 34 }} placeholder="Search inv #, customer, order ref…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span style={{ fontSize: 12, color: "#5a6a85", fontWeight: 700 }}>{crm.invoices.length.toLocaleString("en-GB")} invoices</span>
          <span style={{ flex: 1 }} />
          <button style={goldBtn} onClick={newInvoice}><Icon name="plus" stroke={NAVY} />New invoice</button>
        </div>

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
          {crm.invoices.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 10px", color: "#5a6a85", fontWeight: 600 }}>No invoices yet.</div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 780 }}>
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
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", fontWeight: 700, color: "#185FA5" }}>{i.invNo || "—"}</td>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", whiteSpace: "nowrap" }}>{prettyDate(i.date)}</td>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", fontWeight: 700 }}>{c ? c.name : <span style={{ color: RED }}>No customer</span>}</td>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>{i.jobType}</td>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>
                            {i.deliveryCompleted ? <Chip tone="green">Done</Chip> : i.deliveryDate ? <Chip tone="gold">{prettyDate(i.deliveryDate).slice(0, 6)}</Chip> : <Chip tone="red">Not booked</Chip>}
                          </td>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", textAlign: "right", fontWeight: 700 }}>{t.total.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>
                            <Chip tone={isPaid(i) ? "green" : "amber"}>{isPaid(i) ? "Paid" : "Awaiting"}{i.paymentType ? " · " + i.paymentType : ""}</Chip>
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

  const bySku = skuIndex(crm);

  const setLine = (lid, k, v) =>
    setInv((x) => {
      const l = x.lines.find((y) => y.id === lid);
      if (!l) return;
      l[k] = v;
      // picking a known SKU fills the line in from the master list
      if (k === "code") {
        const mp = bySku[String(v || "").trim().toLowerCase()];
        if (mp) {
          l.description = mp.name;
          if (mp.colour) l.colour = mp.colour;
          if (mp.priceIncVat !== "" && mp.priceIncVat !== null) l.price = Number(mp.priceIncVat);
        }
      }
    });

  const estCost = invoiceCost(inv, crm);

  return (
    <div style={{ maxWidth: 1140, margin: "0 auto", padding: "18px 22px" }}>
      <datalist id="dk-skus">
        {(crm.masterProducts || []).filter((p) => p.active !== false && p.sku).map((p) => (
          <option key={p.id} value={p.sku}>{p.name + (p.colour ? " · " + p.colour : "")}</option>
        ))}
      </datalist>
      <datalist id="dk-jobtypes">{JOB_TYPES.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="dk-paytypes">{PAYMENT_TYPES.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="dk-vans">{VANS.map((s) => <option key={s} value={s} />)}</datalist>

      <button style={{ ...btn, marginBottom: 12 }} onClick={() => setSelId(null)}><Icon name="back" stroke={NAVY} />All invoices</button>

      {notice && (
        <div style={{ ...card, borderColor: GOLD, background: "#fff8e6", display: "flex", gap: 10, alignItems: "center", fontWeight: 600, fontSize: 13 }}>
          <span style={{ flex: 1 }}>{notice}</span>
          <button style={abtn} onClick={() => setNotice("")}><Icon name="x" /></button>
        </div>
      )}

      {/* header band */}
      <div style={{ background: "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", borderRadius: 14, padding: "16px 22px", color: "#fff", marginBottom: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 19 }}>Invoice&nbsp;
              <input style={{ ...inp, display: "inline-block", width: 86, fontWeight: 700, background: "#ffffff12", border: "1px solid #3a4f78", color: "#fff" }} inputMode="numeric"
                value={inv.invNo === null ? "" : inv.invNo} onChange={(e) => setInv((x) => (x.invNo = e.target.value.replace(/[^0-9]/g, "")))} />
            </h2>
            {inv.deliveryCompleted && isPaid(inv) ? <Chip tone="green" style={{ background: "#3FA55C", color: "#fff", border: "none" }}>Delivered · Paid</Chip>
              : isPaid(inv) ? <Chip tone="green">Paid</Chip>
              : inv.deliveryDate ? <Chip tone="gold">Booked</Chip>
              : <Chip tone="red">Not booked</Chip>}
          </div>
          <div style={{ fontSize: 12.5, color: "#aeb9cf", fontWeight: 600, marginTop: 5 }}>
            Raised {prettyDate(inv.created)}{inv.raisedBy ? " by " + inv.raisedBy.split("@")[0] : ""}
            {inv.updatedAt ? " · Updated " + prettyDateTime(inv.updatedAt) + (inv.modifiedBy ? " by " + inv.modifiedBy.split("@")[0] : "") : ""}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={navyBtn} onClick={() => tryPrint("invoice")}><Icon name="doc" stroke="#fff" />Invoice PDF</button>
          <button style={navyBtn} onClick={() => tryPrint("job")}><Icon name="truck" stroke="#fff" />Job sheet</button>
          <button style={navyBtn} onClick={() => tryPrint("loading")}><Icon name="box" stroke="#fff" />Loading bill</button>
          <button style={{ ...navyBtn, border: "1px dashed #3a4f78", color: "#8fa0c0" }} onClick={() => removeInvoice(inv)}><Icon name="bin" stroke="#8fa0c0" />Delete</button>
        </div>
      </div>

      {/* customer + site */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 14 }}>
        <div style={{ ...card, marginBottom: 0 }}>
          <p style={sect}>Customer</p>
          {cust ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: GOLD, color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, flex: "none" }}>
                {(cust.name || "?").trim().charAt(0).toUpperCase() || "?"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 15 }}>{cust.name}</b> <Chip>#{cust.accountNo || "—"}</Chip>
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
                <div style={{ border: "1px solid #e6e9ef", borderRadius: 9, marginTop: 6, overflow: "hidden" }}>
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
            <div style={{ width: 40, height: 40, borderRadius: 10, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
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

      {/* job & delivery */}
      <div style={card}>
        <p style={sect}>Job &amp; delivery</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 12, marginBottom: 12 }}>
          {field("Invoice date", "date", { type: "date" })}
          <div>
            <span style={lbl}>Job type</span>
            <input style={inp} list="dk-jobtypes" value={inv.jobType} onChange={(e) => setInv((x) => (x.jobType = e.target.value))} />
          </div>
          {field("Delivery date", "deliveryDate", { type: "date" })}
          {field("Time", "deliveryTime", { placeholder: "e.g. 9:30" })}
          <div>
            <span style={lbl}>Van / courier</span>
            <input style={inp} list="dk-vans" value={inv.van} onChange={(e) => setInv((x) => (x.van = e.target.value))} />
          </div>
          {field("Order ref / PO", "orderRef")}
          <div>
            <span style={lbl}>Payment type</span>
            <input style={inp} list="dk-paytypes" value={inv.paymentType} onChange={(e) => setInv((x) => (x.paymentType = e.target.value))} />
          </div>
          {field("Payment date", "paymentDate", { type: "date" })}
          {field("Load kg", "weightKg", { inputMode: "decimal" }, { textAlign: "right" })}
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ ...lbl, marginBottom: 0, marginRight: 4 }}>Prep</span>
          {PREP_FLAGS.map(([k, label, icon]) => (
            <Tg key={k} on={inv.flags[k]} title={label} icon={icon} onClick={() => setInv((x) => (x.flags[k] = !x.flags[k]))} />
          ))}
          <span style={{ ...lbl, marginBottom: 0, margin: "0 4px 0 14px" }}>Follow-up</span>
          {FOLLOWUP_FLAGS.map(([k, label, icon]) => (
            <Tg key={k} on={inv.flags[k]} title={label} icon={icon} onClick={() => setInv((x) => (x.flags[k] = !x.flags[k]))} />
          ))}
          <span style={{ flex: 1 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700 }}>
            <input type="checkbox" checked={inv.deliveryCompleted} onChange={(e) => setInv((x) => (x.deliveryCompleted = e.target.checked))} />
            Delivery completed
          </label>
        </div>
      </div>

      {/* lines + totals */}
      <div style={card}>
        <p style={sect}>Lines</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
            <thead>
              <tr>
                {["Code", "Description", "Colour", "Qty", "Price £ inc VAT", "Line £", ""].map((h, i) => (
                  <th key={i} style={{ textAlign: i >= 3 && i <= 5 ? "right" : "left", fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 6px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id}>
                  <td style={{ padding: "6px 6px", borderBottom: "1px solid #f0f2f6", width: 120 }}>
                    <input style={{ ...inp, fontWeight: 700, fontSize: 12.5 }} list="dk-skus" value={l.code} {...selectAllProps} onChange={(e) => setLine(l.id, "code", e.target.value)} />
                  </td>
                  <td style={{ padding: "6px 6px", borderBottom: "1px solid #f0f2f6", minWidth: 200 }}>
                    <input style={inp} value={l.description} {...selectAllProps} onChange={(e) => setLine(l.id, "description", e.target.value)} />
                  </td>
                  <td style={{ padding: "6px 6px", borderBottom: "1px solid #f0f2f6", width: 130 }}>
                    <input style={inp} value={l.colour} {...selectAllProps} onChange={(e) => setLine(l.id, "colour", e.target.value)} />
                  </td>
                  <td style={{ padding: "6px 6px", borderBottom: "1px solid #f0f2f6", width: 70 }}>
                    <input style={numInp} inputMode="decimal" value={l.qty} {...selectAllProps} onChange={(e) => setLine(l.id, "qty", e.target.value)} />
                  </td>
                  <td style={{ padding: "6px 6px", borderBottom: "1px solid #f0f2f6", width: 100 }}>
                    <input style={numInp} inputMode="decimal" value={l.price} {...selectAllProps} onChange={(e) => setLine(l.id, "price", e.target.value)} />
                  </td>
                  <td style={{ padding: "6px 6px", borderBottom: "1px solid #f0f2f6", textAlign: "right", fontWeight: 700, width: 90, whiteSpace: "nowrap" }}>
                    {((Number(l.qty) || 0) * (Number(l.price) || 0)).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "6px 2px", borderBottom: "1px solid #f0f2f6", width: 34, textAlign: "right" }}>
                    <button style={{ ...abtn, border: "none", color: RED }} title="Remove line"
                      onClick={() => setInv((x) => (x.lines = x.lines.filter((y) => y.id !== l.id)))}>
                      <Icon name="x" stroke={RED} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button style={{ ...btn, width: "100%", justifyContent: "center", borderStyle: "dashed", color: "#5a6a85", marginTop: 8 }}
          onClick={() => setInv((x) => x.lines.push(blankLine()))}>
          <Icon name="plus" />Add line
        </button>

        {(() => {
          const shipments = (planner && planner.shipments) || [];
          const jc = jobCost(inv, crm, planner);
          const setPick = (pid, k, v) =>
            setInv((x) => {
              const p = x.picks.find((y) => y.id === pid);
              if (p) p[k] = v;
            });
          return (
            <div style={{ background: "#f8f9fb", border: "1px solid #e6e9ef", borderRadius: 10, padding: "12px 14px", marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <p style={{ ...sect, margin: 0 }}>Loading &amp; job cost</p>
                <span style={{ flex: 1 }} />
                {inv.picks && inv.picks.length > 0 && (
                  <button
                    style={{ ...btn, padding: "6px 11px", fontSize: 12.5 }}
                    onClick={() =>
                      askConfirm({
                        message: "Rebuild the pick list from the invoice lines? Batch references entered so far will be cleared.",
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
                  <div style={{ overflowX: "auto", marginTop: 8 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 760 }}>
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
                              <td style={{ padding: "6px 6px", borderBottom: "1px solid #eef0f4", fontWeight: 700, whiteSpace: "nowrap" }}>{p.sku || "—"}</td>
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
                    <span>Actual job cost: <span style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 7, padding: "3px 9px" }}>{gbp(jc.total)}</span></span>
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
          <div style={{ background: NAVY, borderRadius: 12, padding: "6px 18px 12px", color: "#fff", minWidth: 280 }}>
            {[["Goods (inc VAT)", gbp(t.goods)]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #ffffff1c", fontSize: 13.5 }}>
                <span style={{ color: "#aeb9cf", fontWeight: 600 }}>{k}</span><b>{v}</b>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #ffffff1c", fontSize: 13.5 }}>
              <span style={{ color: "#aeb9cf", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                Discount
                <input style={{ width: 46, textAlign: "right", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "3px 6px", border: "1px solid #3a4f78", borderRadius: 6, background: "#ffffff12", color: "#fff" }}
                  inputMode="decimal" placeholder="0" title="Set on the customer account; editable per invoice"
                  value={inv.discountPct === null ? "" : inv.discountPct}
                  onChange={(e) => setInv((x) => (x.discountPct = e.target.value))} />
                <span style={{ fontSize: 11.5 }}>%</span>
              </span>
              <b style={{ color: t.discount > 0 ? "#f2a6b1" : "#aeb9cf" }}>{t.discount > 0 ? "−" + gbp(t.discount) : "—"}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #ffffff1c", fontSize: 13.5 }}>
              <span style={{ color: "#aeb9cf", fontWeight: 600 }}>Delivery charge</span>
              <input style={{ width: 92, textAlign: "right", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, padding: "5px 8px", border: "1px solid #3a4f78", borderRadius: 7, background: "#ffffff12", color: "#fff" }}
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
              <span style={{ fontSize: 20, fontWeight: 700, background: GOLD, color: NAVY, borderRadius: 9, padding: "4px 14px" }}>{gbp(t.total)}</span>
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
  );
}
