// Purchases: the FileMaker "Purchases" layout. List with filters, totals and an
// Excel export (for the accountant / VAT return) -> entry screen per PO.
// Sub total is entered ex VAT; VAT is worked out from the rate unless typed over.
import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { NAVY, GOLD, RED, prettyDate, prettyDateTime, addMonths } from "../../lib/core.js";
import {
  blankSupplier, newPurchaseFor, purchaseTotals, purchaseIsPaid, poRef, gbp, today, supplierById,
  PURCHASE_CATEGORIES, PAYMENT_METHODS, VAT_RATES, vanOptions, staffList, staffName,
} from "../../lib/crmCore.js";
import { purchasesAvailable } from "../../data/crmStorage.js";
import { Icon, Chip, SuggestInput, selectAllProps, sect, lbl, card, abtn, inp, btn, goldBtn } from "./ui.jsx";
import { SupplierModal, PurchasesSchemaNotice } from "./SuppliersScreen.jsx";

const th = { fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap", textAlign: "left" };
const tdc = { padding: "9px 8px", borderBottom: "1px solid #f0f2f6" };
const money = (n) => (Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pDate = (p) => p.invDate || (p.createdAt || "").slice(0, 10);
const FILTERS = ["Unpaid", "This month", "Last month", "This year", "All"];

export default function PurchasesScreen({ crm, updateCrm, askConfirm, selId, setSelId, me, goSupplier, filter, setFilter }) {
  const [search, setSearch] = useState("");
  const [when, setWhen] = useState("This month");
  const [cat, setCat] = useState("");
  const [notice, setNotice] = useState("");
  const [supQuery, setSupQuery] = useState("");
  const [supDraft, setSupDraft] = useState(null);
  const ready = purchasesAvailable();
  const purchases = crm.purchases || [];
  const supById = useMemo(() => supplierById(crm), [crm.suppliers]);

  const categories = useMemo(() => [...new Set([...PURCHASE_CATEGORIES, ...purchases.map((p) => p.category).filter(Boolean)])], [purchases]);
  const methods = useMemo(() => [...new Set([...PAYMENT_METHODS, ...purchases.map((p) => p.paymentMethod).filter(Boolean)])], [purchases]);
  const people = useMemo(() => [...new Set([...staffList(crm, me).map((s) => staffName(crm, s.email)), ...purchases.map((p) => p.purchasedBy).filter(Boolean)])], [crm.staff, purchases]);

  const p = purchases.find((x) => x.id === selId) || null;
  const setP = (fn) =>
    updateCrm((c) => {
      const t = c.purchases.find((x) => x.id === p.id);
      if (t) fn(t, c);
      return c;
    });

  const create = () => {
    if (!ready) return;
    let id = null;
    const newId = Math.random().toString(36).slice(2, 10);
    updateCrm((c) => {
      newPurchaseFor(c, filter && filter.supplierId ? filter.supplierId : "", me, newId);
      return c;
    });
    id = newId;
    setSupQuery("");
    setSelId(id);
  };

  // ===== list =====
  if (!p) {
    const tod = today();
    const month = tod.slice(0, 7);
    const lastMonth = addMonths(month + "-01", -1).slice(0, 7);
    const filterSup = filter && filter.supplierId ? supById[filter.supplierId] : null;
    const q = search.trim().toLowerCase();
    const rows = [...purchases]
      .sort((a, b) => pDate(b).localeCompare(pDate(a)) || (Number(b.poNo) || 0) - (Number(a.poNo) || 0))
      .filter((x) => {
        if (filterSup && x.supplierId !== filterSup.id) return false;
        if (cat && x.category !== cat) return false;
        const d = pDate(x);
        if (when === "Unpaid" && purchaseIsPaid(x)) return false;
        if (when === "This month" && d.slice(0, 7) !== month) return false;
        if (when === "Last month" && d.slice(0, 7) !== lastMonth) return false;
        if (when === "This year" && d.slice(0, 4) !== tod.slice(0, 4)) return false;
        if (!q) return true;
        const s = supById[x.supplierId];
        return [String(x.poNo || ""), x.invNo, x.invDetail, s && s.name, x.category, x.purchasedBy].some((v) => String(v || "").toLowerCase().includes(q));
      });
    const tot = rows.reduce((a, x) => { const t = purchaseTotals(x); a.sub += t.sub; a.vat += t.vat; a.total += t.total; return a; }, { sub: 0, vat: 0, total: 0 });
    const unpaid = purchases.filter((x) => !purchaseIsPaid(x));
    const unpaidTotal = unpaid.reduce((a, x) => a + purchaseTotals(x).total, 0);
    const monthRows = purchases.filter((x) => pDate(x).slice(0, 7) === month);
    const monthTot = monthRows.reduce((a, x) => { const t = purchaseTotals(x); a.total += t.total; a.vat += t.vat; return a; }, { total: 0, vat: 0 });
    const shown = rows.slice(0, 80);

    const exportXlsx = () => {
      const aoa = [["PO#", "Created", "Created by", "Supplier", "Account#", "Supplier postcode", "Physical receipt", "INV#", "INV date", "INV detail", "Purchased by", "Category", "Vehicle", "Sub total", "VAT rate %", "VAT", "Total", "Date paid", "Method of payment"]];
      rows.forEach((x) => {
        const s = supById[x.supplierId] || {};
        const t = purchaseTotals(x);
        aoa.push([x.poNo || "", (x.createdAt || "").slice(0, 10), x.createdBy, s.name || "", s.accountNo || "", s.postcode || "", x.physicalReceipt ? "Yes" : "No", x.invNo, x.invDate, x.invDetail, x.purchasedBy, x.category, x.vehicle, t.sub, t.rate, t.vat, t.total, x.datePaid, x.paymentMethod]);
      });
      try {
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws["!cols"] = [8, 11, 14, 24, 10, 11, 9, 12, 11, 40, 12, 16, 10, 11, 8, 10, 11, 11, 16].map((wch) => ({ wch }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Purchases");
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const url = URL.createObjectURL(new Blob([out], { type: "application/octet-stream" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = "purchases-" + (when === "All" ? "all" : when.toLowerCase().replace(/ /g, "-")) + "-" + tod + ".xlsx";
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        setNotice("The download was blocked here — it works on the live site.");
      }
    };

    return (
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 22px" }}>
        {!ready && <PurchasesSchemaNotice />}
        {notice && <div style={{ ...card, borderColor: GOLD, background: "#fff8e6", fontWeight: 600, fontSize: 13 }}>{notice}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 14 }}>
          {[
            ["Spent this month", gbp(monthTot.total), monthRows.length + " purchase" + (monthRows.length === 1 ? "" : "s") + " · inc VAT", null],
            ["VAT this month", gbp(monthTot.vat), "on purchase invoices", null],
            ["Unpaid", gbp(unpaidTotal), unpaid.length + " invoice" + (unpaid.length === 1 ? "" : "s"), unpaid.length ? "#a05f10" : null],
          ].map(([k, v, sub, tone]) => (
            <div key={k} style={{ ...card, marginBottom: 0, padding: "12px 16px" }}>
              <span style={lbl}>{k}</span>
              <b style={{ fontSize: 20, color: tone || NAVY }}>{v}</b>
              <div style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>

        <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 280 }}>
            <span style={{ position: "absolute", left: 11, top: 10 }}><Icon name="search" /></span>
            <input style={{ ...inp, paddingLeft: 34 }} placeholder="PO, inv #, supplier, detail…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setWhen(f)}
                style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "6px 11px", borderRadius: 999, cursor: "pointer", border: "1px solid " + (when === f ? NAVY : "#d5d9e0"), background: when === f ? NAVY : "#fff", color: when === f ? "#fff" : "#5a6a85" }}>
                {f}
              </button>
            ))}
          </div>
          <select style={{ ...inp, width: "auto", fontSize: 13, fontWeight: 700 }} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span style={{ flex: 1 }} />
          <button style={btn} onClick={exportXlsx} disabled={!rows.length} title="Download the rows shown as an Excel file"><Icon name="doc" />Export</button>
          <button style={{ ...goldBtn, opacity: ready ? 1 : 0.5 }} disabled={!ready} onClick={create}><Icon name="plus" stroke={NAVY} />New purchase</button>
        </div>

        {filterSup && (
          <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", padding: "9px 14px", borderColor: "#f4d78f", background: "#fff8e6" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#6b5305", textTransform: "uppercase", letterSpacing: 0.4 }}>Supplier:</span>
            <Chip tone="gold">{filterSup.name}</Chip>
            <span style={{ flex: 1 }} />
            <button style={{ ...btn, padding: "5px 11px", fontSize: 12.5 }} onClick={() => setFilter(null)}><Icon name="x" size={12} />All suppliers</button>
          </div>
        )}

        <div style={card}>
          {rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 10px", color: "#5a6a85", fontWeight: 600 }}>
              {purchases.length ? "No purchases match." : "No purchases yet."}
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
                  <thead><tr>{["PO#", "Inv date", "Supplier", "Inv #", "Detail", "Category", "Sub £", "VAT £", "Total £", "Paid", ""].map((h, i) => <th key={i} style={{ ...th, textAlign: i >= 6 && i <= 8 ? "right" : "left" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {shown.map((x) => {
                      const s = supById[x.supplierId];
                      const t = purchaseTotals(x);
                      return (
                        <tr key={x.id} onClick={() => setSelId(x.id)} style={{ cursor: "pointer" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f8fb")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                          <td style={{ ...tdc, fontWeight: 700, color: "#185FA5" }}>{x.poNo || "—"}</td>
                          <td style={{ ...tdc, whiteSpace: "nowrap" }}>{x.invDate ? prettyDate(x.invDate) : <span style={{ color: "#aab3c2" }}>—</span>}</td>
                          <td style={{ ...tdc, fontWeight: 700 }}>{s ? s.name : <span style={{ color: RED }}>No supplier</span>}</td>
                          <td style={tdc}>{x.invNo || "—"}</td>
                          <td style={{ ...tdc, color: "#5a6a85", fontWeight: 600, maxWidth: 230, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{(x.invDetail || "").split("\n").filter(Boolean).join(" · ") || "—"}</td>
                          <td style={tdc}>{x.category || "—"}</td>
                          <td style={{ ...tdc, textAlign: "right" }}>{money(t.sub)}</td>
                          <td style={{ ...tdc, textAlign: "right", color: "#5a6a85" }}>{money(t.vat)}</td>
                          <td style={{ ...tdc, textAlign: "right", fontWeight: 700 }}>{money(t.total)}</td>
                          <td style={tdc}><Chip tone={purchaseIsPaid(x) ? "green" : "amber"}>{purchaseIsPaid(x) ? "Paid" : "Unpaid"}</Chip></td>
                          <td style={{ ...tdc, textAlign: "right" }}><button style={abtn} title="Open" onClick={(e) => { e.stopPropagation(); setSelId(x.id); }}><Icon name="pen" /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={6} style={{ padding: "10px 8px", fontSize: 12, fontWeight: 700, color: "#5a6a85" }}>{rows.length} purchase{rows.length === 1 ? "" : "s"}{shown.length < rows.length ? " (showing " + shown.length + ")" : ""}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700 }}>{money(tot.sub)}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700, color: "#5a6a85" }}>{money(tot.vat)}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700 }}>{money(tot.total)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ===== entry =====
  const sup = supById[p.supplierId];
  const t = purchaseTotals(p);
  const supOpts = (crm.suppliers || []).filter((s) => s.active !== false).map((s) => ({ value: s.name, label: s.name + (s.town ? " · " + s.town : "") }));
  const navyBtn = { ...btn, background: "transparent", border: "1px solid #3a4f78", color: "#fff" };

  const pickSupplier = (name) => {
    setSupQuery(name);
    const s = (crm.suppliers || []).find((x) => x.name === name);
    if (s)
      setP((x) => {
        x.supplierId = s.id;
        if (!x.category && s.category) x.category = s.category;
        if (!x.paymentMethod && s.paymentMethod) x.paymentMethod = s.paymentMethod;
      });
  };

  const remove = () =>
    askConfirm({
      message: "Delete " + poRef(p) + (sup ? " from " + sup.name : "") + "? This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
      action: () => {
        updateCrm((c) => {
          c.purchases = c.purchases.filter((x) => x.id !== p.id);
          return c;
        });
        setSelId(null);
      },
    });

  const L = ({ children }) => <span style={{ ...lbl, marginBottom: 4 }}>{children}</span>;
  const text = (k, props = {}, style = {}) => (
    <input style={{ ...inp, ...style }} value={p[k] === null ? "" : p[k]} {...selectAllProps} {...props} onChange={(e) => setP((x) => (x[k] = e.target.value))} />
  );

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "18px 22px" }}>
      <datalist id="dk-pcats2">{categories.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="dk-pmethods2">{methods.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="dk-people">{people.map((x) => <option key={x} value={x} />)}</datalist>
      <button style={{ ...btn, marginBottom: 12 }} onClick={() => setSelId(null)}><Icon name="back" stroke={NAVY} />All purchases</button>
      {!ready && <PurchasesSchemaNotice />}

      <div style={{ background: "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", borderRadius: 12, padding: "16px 22px", color: "#fff", marginBottom: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 19 }}>{"PO# " + (p.poNo || "—")}</h2>
            <Chip tone={purchaseIsPaid(p) ? "green" : "amber"} style={purchaseIsPaid(p) ? { background: "#3FA55C", color: "#fff", border: "none" } : undefined}>
              {purchaseIsPaid(p) ? "Paid " + prettyDate(p.datePaid) : "Unpaid"}
            </Chip>
          </div>
          <div style={{ fontSize: 12.5, color: "#aeb9cf", fontWeight: 600, marginTop: 5 }}>
            Created {p.createdAt ? prettyDateTime(p.createdAt) : "—"}{p.createdBy ? " by " + staffName(crm, p.createdBy) : ""}
            {p.updatedAt ? " · Modified " + prettyDateTime(p.updatedAt) + (p.modifiedBy ? " by " + staffName(crm, p.modifiedBy) : "") : ""}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={navyBtn} onClick={create} disabled={!ready}><Icon name="plus" stroke="#fff" />Create new entry</button>
          <button style={{ ...navyBtn, border: "1px dashed #3a4f78", color: "#8fa0c0" }} onClick={remove}><Icon name="bin" stroke="#8fa0c0" />Delete</button>
        </div>
      </div>

      {/* supplier */}
      <div style={card}>
        <p style={sect}>Supplier</p>
        {sup ? (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <Icon name="box" size={18} stroke={GOLD} />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <b style={{ fontSize: 15.5 }}>{sup.name}</b>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 12, rowGap: 3, fontSize: 13, marginTop: 6 }}>
                <span style={{ ...lbl, marginBottom: 0 }}>Account#</span><b>{sup.accountNo || <span style={{ color: "#aab3c2" }}>—</span>}</b>
                <span style={{ ...lbl, marginBottom: 0 }}>Address</span><b>{[sup.address, sup.town].filter(Boolean).join(", ") || <span style={{ color: "#aab3c2" }}>—</span>}</b>
                <span style={{ ...lbl, marginBottom: 0 }}>Postcode</span><b>{sup.postcode || <span style={{ color: "#aab3c2" }}>—</span>}</b>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={abtn} title="Edit supplier details" onClick={() => setSupDraft({ ...sup })}><Icon name="pen" /></button>
              <button style={abtn} title="Open supplier" onClick={() => goSupplier(sup.id)}><Icon name="user" /></button>
              <button style={abtn} title="Change supplier" onClick={() => { setP((x) => (x.supplierId = "")); setSupQuery(""); }}><Icon name="x" /></button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <SuggestInput value={supQuery} options={supOpts} onChange={pickSupplier} placeholder="Start typing the supplier…" autoFocus />
              {supQuery.trim() && !(crm.suppliers || []).some((x) => x.name === supQuery) && (
                <div style={{ fontSize: 12.5, color: "#8593a8", fontWeight: 600, marginTop: 6 }}>Not on the list yet — use <b>New supplier</b> to add them.</div>
              )}
            </div>
            <button style={btn} disabled={!ready} onClick={() => setSupDraft({ ...blankSupplier(), name: supQuery.trim() })}><Icon name="plus" stroke={NAVY} />New supplier</button>
          </div>
        )}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
          <input type="checkbox" checked={p.physicalReceipt} onChange={(e) => setP((x) => (x.physicalReceipt = e.target.checked))} />
          Physical receipt held
        </label>
      </div>

      {/* invoice */}
      <div style={card}>
        <p style={sect}>Invoice</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><L>INV#</L>{text("invNo")}</div>
          <div><L>INV date</L>{text("invDate", { type: "date" })}</div>
        </div>
        <L>INV detail</L>
        <textarea style={{ ...inp, resize: "vertical" }} rows={4} value={p.invDetail} placeholder={"e.g. 4 x U channel\n66 x Fence panel grey"} onChange={(e) => setP((x) => (x.invDetail = e.target.value))} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 14 }}>
        {/* purchase details */}
        <div style={{ ...card, marginBottom: 0 }}>
          <p style={sect}>Purchase</p>
          <div style={{ display: "grid", gap: 12 }}>
            <div><L>Purchased by</L>{text("purchasedBy", { list: "dk-people" })}</div>
            <div><L>Assign to category</L>{text("category", { list: "dk-pcats2" })}</div>
            <div>
              <L>Vehicle</L>
              <select style={inp} value={p.vehicle} onChange={(e) => setP((x) => (x.vehicle = e.target.value))}>
                <option value="">—</option>
                {p.vehicle && !vanOptions(crm).includes(p.vehicle) && <option value={p.vehicle}>{p.vehicle}</option>}
                {vanOptions(crm).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* money */}
        <div style={{ ...card, marginBottom: 0, background: NAVY, borderColor: NAVY, color: "#fff" }}>
          <p style={{ ...sect, color: "#aeb9cf" }}>Totals</p>
          {(() => {
            const dark = { ...inp, background: "#ffffff12", border: "1px solid #3a4f78", color: "#fff", textAlign: "right", fontWeight: 700 };
            const row = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid #ffffff1c" };
            return (
              <>
                <div style={row}>
                  <span style={{ color: "#aeb9cf", fontWeight: 600 }}>Sub total (ex VAT)</span>
                  <input style={{ ...dark, width: 130 }} inputMode="decimal" placeholder="0.00" value={p.subTotal} {...selectAllProps} onChange={(e) => setP((x) => (x.subTotal = e.target.value))} />
                </div>
                <div style={row}>
                  <span style={{ color: "#aeb9cf", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 7 }}>
                    VAT
                    <select style={{ ...dark, width: 74, padding: "4px 6px", textAlign: "left" }} value={String(t.rate)} onChange={(e) => setP((x) => { x.vatRate = Number(e.target.value); x.vatAmount = ""; })}>
                      {VAT_RATES.concat(VAT_RATES.includes(t.rate) ? [] : [t.rate]).map((r) => <option key={r} value={r} style={{ color: NAVY }}>{r}%</option>)}
                    </select>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {t.manualVat && (
                      <button title="Back to the worked-out VAT" onClick={() => setP((x) => (x.vatAmount = ""))}
                        style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 8, border: "1px solid #3a4f78", background: "transparent", color: GOLD, cursor: "pointer" }}>auto</button>
                    )}
                    <input style={{ ...dark, width: 110 }} inputMode="decimal" title="Worked out from the rate — type over it for mixed-rate invoices"
                      value={t.manualVat ? p.vatAmount : t.vat ? t.vat.toFixed(2) : ""} placeholder="0.00" {...selectAllProps}
                      onChange={(e) => setP((x) => (x.vatAmount = e.target.value))} />
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12 }}>
                  <span style={{ fontWeight: 700, letterSpacing: 0.5 }}>TOTAL</span>
                  <span style={{ fontSize: 20, fontWeight: 700, background: GOLD, color: NAVY, borderRadius: 8, padding: "4px 14px" }}>{gbp(t.total)}</span>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* payment */}
      <div style={card}>
        <p style={sect}>Payment</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "end" }}>
          <div><L>Date paid</L>{text("datePaid", { type: "date" })}</div>
          <div><L>Method of payment</L>{text("paymentMethod", { list: "dk-pmethods2" })}</div>
          {!p.datePaid && (
            <button style={{ ...goldBtn, justifyContent: "center" }} onClick={() => setP((x) => (x.datePaid = today()))}><Icon name="pound" stroke={NAVY} />Paid today</button>
          )}
        </div>
      </div>

      {supDraft && (
        <SupplierModal crm={crm} updateCrm={updateCrm} me={me} draft={supDraft} onClose={() => setSupDraft(null)}
          onSaved={(s) => { setP((x) => { x.supplierId = s.id; if (!x.category && s.category) x.category = s.category; if (!x.paymentMethod && s.paymentMethod) x.paymentMethod = s.paymentMethod; }); setSupQuery(""); }} />
      )}
    </div>
  );
}
