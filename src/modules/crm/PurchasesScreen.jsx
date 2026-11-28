// Purchases: the FileMaker "Purchases" layout. List with filters, totals and an
// Excel export (for the accountant / VAT return) -> entry screen per PO.
// Sub total is entered ex VAT; VAT is worked out from the rate unless typed over.
import { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import { NAVY, GOLD, RED, prettyDate, prettyDateTime, addMonths } from "../../lib/core.js";
import {
  blankSupplier, newPurchaseFor, purchaseTotals, purchaseIsPaid, poRef, gbp, today, supplierById,
  purchasePayments, purchasePaidAmount, purchaseBalance, purchasePartPaid, settlePurchasePayments,
  PURCHASE_CATEGORIES, PAYMENT_METHODS, VAT_RATES, vanOptions, staffList, staffName,
} from "../../lib/crmCore.js";
import { purchasesAvailable } from "../../data/crmStorage.js";
import { COST_CENTRES, COST_CENTRE_LIST, assignCostCentre } from "../../lib/costCentres.js";
import { RecurringMark } from "./CommitmentsCard.jsx";
import { Icon, Chip, SuggestInput, selectAllProps, sect, lbl, card, abtn, inp, btn, goldBtn, DateInput, CalendarPop, RecordNav, BandDelete, HoverStamp, ListHero, HeroStat, HeroAdd, SearchBox, FilterPills } from "./ui.jsx";
import { LockGuard } from "./Peeks.jsx";
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
  const [cc, setCc] = useState(""); // cost centre, or "Centre|Sub"
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

  // entries pick their own cost centre from the supplier rules; a hand-set one is left alone
  useEffect(() => {
    if (!p || p.costCentre || !p.supplierId) return;
    const s = (crm.suppliers || []).find((x) => x.id === p.supplierId);
    if (!s) return;
    const a = assignCostCentre(s.name, p.invDetail, p.category);
    setP((x) => { if (!x.costCentre) { x.costCentre = a.costCentre; x.costSub = a.costSub; } });
  }, [p && p.id, p && p.supplierId]); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (cc && (cc.includes("|") ? (x.costCentre || "") + "|" + (x.costSub || "") !== cc : (x.costCentre || "") !== cc)) return false;
        const d = pDate(x);
        if (when === "Unpaid" && purchaseIsPaid(x)) return false;
        if (when === "This month" && d.slice(0, 7) !== month) return false;
        if (when === "Last month" && d.slice(0, 7) !== lastMonth) return false;
        if (when === "This year" && d.slice(0, 4) !== tod.slice(0, 4)) return false;
        if (!q) return true;
        const s = supById[x.supplierId];
        return [String(x.poNo || ""), x.invNo, x.invDetail, s && s.name, x.category, x.purchasedBy].some((v) => String(v || "").toLowerCase().includes(q));
      });
    // the summary bar follows the filters: period, search, category, cost centre, supplier
    const tot = rows.reduce((a, x) => { const t = purchaseTotals(x); a.sub += t.sub; a.vat += t.vat; a.total += t.total; return a; }, { sub: 0, vat: 0, total: 0 });
    const unpaid = rows.filter((x) => !purchaseIsPaid(x));
    const unpaidTotal = unpaid.reduce((a, x) => a + purchaseBalance(x), 0);
    const filtered = !!(q || cat || cc || filterSup);
    const scope = (when === "All" ? "All time" : when) + (filtered ? " · filtered" : "");
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
      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "18px 22px" }}>
        {!ready && <PurchasesSchemaNotice />}
        {notice && (
          <div style={{ ...card, borderColor: GOLD, background: "#fff8e6", display: "flex", gap: 10, alignItems: "center", fontWeight: 600, fontSize: 13 }}>
            <span style={{ flex: 1 }}>{notice}</span>
            <button style={abtn} onClick={() => setNotice("")}><Icon name="x" /></button>
          </div>
        )}

        <ListHero title="Purchases" sub={purchases.length.toLocaleString("en-GB") + " purchase" + (purchases.length === 1 ? "" : "s") + " · newest first"}
          action={<HeroAdd title="New purchase" onClick={create} disabled={!ready} />}>
          <HeroStat label={"Spent · " + scope} value={gbp(tot.total)} sub={rows.length.toLocaleString("en-GB") + " purchase" + (rows.length === 1 ? "" : "s") + " · inc VAT · " + gbp(tot.sub) + " net"} />
          <HeroStat label={"VAT · " + scope} value={gbp(tot.vat)} sub="on these purchase invoices" />
          <HeroStat label={"Unpaid · " + scope} value={gbp(unpaidTotal)} tone={unpaid.length ? "#f6c48a" : undefined} sub={unpaid.length + " invoice" + (unpaid.length === 1 ? "" : "s") + (unpaid.length && when !== "Unpaid" ? " · click to list" : "")} onClick={unpaid.length && when !== "Unpaid" ? () => setWhen("Unpaid") : undefined} />
        </ListHero>

        <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px" }}>
          <SearchBox value={search} onChange={setSearch} placeholder="PO, inv #, supplier, detail…" width={280} />
          <FilterPills options={FILTERS} value={when} onPick={setWhen} />
          <select style={{ ...inp, width: "auto", fontSize: 13, fontWeight: 700 }} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select style={{ ...inp, width: "auto", fontSize: 13, fontWeight: 700 }} value={cc} onChange={(e) => setCc(e.target.value)}>
            <option value="">All cost centres</option>
            {COST_CENTRE_LIST.map((c) => [
              <option key={c} value={c}>{c}</option>,
              ...(COST_CENTRES[c] || []).map((sub) => <option key={c + "|" + sub} value={c + "|" + sub}>{"\u00a0\u00a0\u00a0" + sub}</option>),
            ])}
          </select>
          <span style={{ flex: 1 }} />
          <button style={btn} onClick={exportXlsx} disabled={!rows.length} title="Download the rows shown as an Excel file"><Icon name="doc" />Export</button>
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
              <div className="dk-bleed" style={{ overflowX: "auto" }}>
                <table className="dk-t" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
                  <thead><tr>{["PO#", "Inv date", "Supplier", "Inv #", "Detail", "Cost centre", "Sub £", "VAT £", "Total £", "Paid", ""].map((h, i) => <th key={i} style={{ ...th, textAlign: i >= 6 && i <= 8 ? "right" : "left" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {shown.map((x) => {
                      const s = supById[x.supplierId];
                      const t = purchaseTotals(x);
                      return (
                        <tr key={x.id} onClick={() => setSelId(x.id)} style={{ cursor: "pointer" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f8fb")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                          <td style={{ ...tdc, fontWeight: 700, color: "#185FA5" }}>{x.poNo || "—"}</td>
                          <td style={{ ...tdc, whiteSpace: "nowrap" }}>{x.invDate ? prettyDate(x.invDate) : <span style={{ color: "#aab3c2" }}>—</span>}</td>
                          <td style={{ ...tdc, fontWeight: 700 }}>{s ? (goSupplier ? <button type="button" className="dk-title-link" title="Open the supplier" onClick={(e) => { e.stopPropagation(); goSupplier(s.id); }} style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{s.name}</button> : s.name) : <span style={{ color: RED }}>No supplier</span>}</td>
                          <td style={tdc}>{x.invNo || "—"}</td>
                          <td style={{ ...tdc, color: "#5a6a85", fontWeight: 600, maxWidth: 230, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{(x.invDetail || "").split("\n").filter(Boolean).join(" · ") || "—"}</td>
                          <td style={tdc} title={x.costCentre ? x.costCentre + (x.costSub ? " · " + x.costSub : "") : x.category || ""}>
                            {x.costCentre ? <>{x.costCentre}{x.costSub ? <span style={{ color: "#8593a8", fontWeight: 600 }}> · {x.costSub}</span> : null}</> : x.category || "—"}
                          </td>
                          <td style={{ ...tdc, textAlign: "right" }}>{money(t.sub)}</td>
                          <td style={{ ...tdc, textAlign: "right", color: "#5a6a85" }}>{money(t.vat)}</td>
                          <td style={{ ...tdc, textAlign: "right", fontWeight: 700 }}>{money(t.total)}</td>
                          <td style={tdc}><Chip tone={purchaseIsPaid(x) ? "green" : "amber"} title={purchasePartPaid(x) ? gbp(purchasePaidAmount(x)) + " paid, " + gbp(purchaseBalance(x)) + " left" : undefined}>{purchaseIsPaid(x) ? "Paid" : purchasePartPaid(x) ? "Part paid" : "Unpaid"}</Chip></td>
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
        if (!x.costCentre) { const a = assignCostCentre(s.name, x.invDetail, x.category); x.costCentre = a.costCentre; x.costSub = a.costSub; }
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
    props.type === "date"
      ? <DateInput style={{ ...inp, ...style }} value={p[k] || ""} onChange={(e) => setP((x) => (x[k] = e.target.value))} />
      : <input style={{ ...inp, ...style }} value={p[k] === null ? "" : p[k]} {...selectAllProps} {...props} onChange={(e) => setP((x) => (x[k] = e.target.value))} />
  );

  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "18px 22px" }}>
    <LockGuard k={"pur:" + p.id} crm={crm}>
      <datalist id="dk-pcats2">{categories.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="dk-pmethods2">{methods.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="dk-people">{people.map((x) => <option key={x} value={x} />)}</datalist>
      <RecordNav backLabel="All purchases" onBack={() => setSelId(null)} onGo={setSelId} noun="purchase" label={(x) => "PO-" + (x.poNo || "—") + ((supById[x.supplierId] || {}).name ? " · " + supById[x.supplierId].name : "")}
        order={[...purchases].sort((a, b) => pDate(b).localeCompare(pDate(a)) || (Number(b.poNo) || 0) - (Number(a.poNo) || 0))} cur={p.id} />
      {!ready && <PurchasesSchemaNotice />}

      <div style={{ background: "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", borderRadius: 12, padding: "16px 22px", color: "#fff", marginBottom: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <HoverStamp lines={["Created " + (p.createdAt ? prettyDateTime(p.createdAt) : "—") + (p.createdBy ? " by " + staffName(crm, p.createdBy) : ""), p.updatedAt ? "Modified " + prettyDateTime(p.updatedAt) + (p.modifiedBy ? " by " + staffName(crm, p.modifiedBy) : "") : ""]}>
              <h2 style={{ margin: 0, fontSize: 19, cursor: "default" }}>{"PO# " + (p.poNo || "—")}</h2>
            </HoverStamp>
            <Chip tone={purchaseIsPaid(p) ? "green" : "amber"} style={purchaseIsPaid(p) ? { background: "#3FA55C", color: "#fff", border: "none" } : undefined}>
              {purchaseIsPaid(p) ? "Paid " + prettyDate(p.datePaid) : purchasePartPaid(p) ? "Part paid · " + gbp(purchaseBalance(p)) + " left" : "Unpaid"}
            </Chip>
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={navyBtn} onClick={create} disabled={!ready}><Icon name="plus" stroke="#fff" />New purchase</button>
          <BandDelete title="Delete this purchase" onClick={remove} />
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <L>Cost centre</L>
                <select style={inp} value={p.costCentre || ""} onChange={(e) => setP((x) => { x.costCentre = e.target.value; x.costSub = (COST_CENTRES[e.target.value] || [""])[0] || ""; })}>
                  <option value="">— auto —</option>
                  {COST_CENTRE_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <L>Sub</L>
                <select style={inp} value={p.costSub || ""} onChange={(e) => setP((x) => (x.costSub = e.target.value))} disabled={!p.costCentre}>
                  <option value="">—</option>
                  {(COST_CENTRES[p.costCentre] || []).map((s2) => <option key={s2} value={s2}>{s2}</option>)}
                  {p.costSub && !(COST_CENTRES[p.costCentre] || []).includes(p.costSub) && <option value={p.costSub}>{p.costSub}</option>}
                </select>
              </div>
            </div>
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <p style={{ ...sect, margin: 0 }}>Payment</p>
          {purchasePayments(p).length > 0 && (
            <Chip tone={purchaseIsPaid(p) ? "green" : "amber"}>
              {gbp(purchasePaidAmount(p))} paid of {gbp(t.total)}{purchaseIsPaid(p) ? "" : " · " + gbp(purchaseBalance(p)) + " to pay"}
            </Chip>
          )}
        </div>
        {purchasePayments(p).length === 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "end", marginTop: 10 }}>
            <div><L>Date paid</L>{text("datePaid", { type: "date" })}</div>
            <div><L>Method of payment</L>{text("paymentMethod", { list: "dk-pmethods2" })}</div>
            {!p.datePaid && (
              <button style={{ ...goldBtn, justifyContent: "center" }} onClick={() => setP((x) => (x.datePaid = today()))}><Icon name="pound" stroke={NAVY} />Paid today</button>
            )}
            {!p.datePaid && (
              <button style={{ ...btn, justifyContent: "center" }} title="Paying this in instalments? Record each payment and the balance tracks itself."
                onClick={() => setP((x) => { x.payments = [{ id: "pp-" + Date.now().toString(36), date: today(), amount: "", method: x.paymentMethod || "", ref: "" }]; })}>
                <Icon name="plus" size={14} />Part payment
              </button>
            )}
            <RecurringMark supplierName={sup ? sup.name : ""} purchase={p} amount={t.total} />
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>{["Date", "Amount £", "Method", "Reference", ""].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 1 ? "right" : "left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {purchasePayments(p).map((pay, i) => {
                  const setPay = (k, v) => setP((x) => { x.payments = purchasePayments(x).map((y, j) => (j === i ? { ...y, [k]: v } : y)); settlePurchasePayments(x); });
                  return (
                    <tr key={pay.id || i}>
                      <td style={tdc}><DateInput style={{ ...inp, width: 150 }} value={pay.date || ""} onChange={(e) => setPay("date", e.target.value)} /></td>
                      <td style={{ ...tdc, textAlign: "right" }}><input style={{ ...inp, width: 110, textAlign: "right" }} type="number" step="0.01" value={pay.amount} {...selectAllProps} onChange={(e) => setPay("amount", e.target.value === "" ? "" : Number(e.target.value))} /></td>
                      <td style={tdc}><input style={{ ...inp, width: 150 }} list="dk-pmethods2" value={pay.method || ""} {...selectAllProps} onChange={(e) => setPay("method", e.target.value)} /></td>
                      <td style={tdc}><input style={{ ...inp, width: "100%" }} placeholder="bank ref / note" value={pay.ref || ""} {...selectAllProps} onChange={(e) => setPay("ref", e.target.value)} /></td>
                      <td style={{ ...tdc, textAlign: "right" }}><button style={abtn} title="Remove this payment"
                        onClick={() => setP((x) => { x.payments = purchasePayments(x).filter((_, j) => j !== i); if (!x.payments.length) x.datePaid = ""; else settlePurchasePayments(x); })}><Icon name="x" stroke={RED} size={13} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {!purchaseIsPaid(p) && (
                <button style={btn} onClick={() => setP((x) => { x.payments = [...purchasePayments(x), { id: "pp-" + Date.now().toString(36), date: today(), amount: "", method: x.paymentMethod || "", ref: "" }]; })}>
                  <Icon name="plus" size={14} />Add payment
                </button>
              )}
              {!purchaseIsPaid(p) && (
                <button style={goldBtn} title="Record the rest as paid today"
                  onClick={() => setP((x) => { x.payments = [...purchasePayments(x), { id: "pp-" + Date.now().toString(36), date: today(), amount: purchaseBalance(x), method: x.paymentMethod || "", ref: "" }]; settlePurchasePayments(x); })}>
                  <Icon name="pound" stroke={NAVY} />Pay the balance {gbp(purchaseBalance(p))}
                </button>
              )}
              <RecurringMark supplierName={sup ? sup.name : ""} purchase={p} amount={t.total} />
            </div>
          </div>
        )}
      </div>

      {supDraft && (
        <SupplierModal crm={crm} updateCrm={updateCrm} me={me} draft={supDraft} onClose={() => setSupDraft(null)}
          onSaved={(s) => { setP((x) => { x.supplierId = s.id; if (!x.category && s.category) x.category = s.category; if (!x.paymentMethod && s.paymentMethod) x.paymentMethod = s.paymentMethod; }); setSupQuery(""); }} />
      )}
    </LockGuard>
    </div>
  );
}
