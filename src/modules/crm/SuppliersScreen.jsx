// Suppliers: one record per supplier, feeding Purchases and Collections.
// List -> supplier view (details, spend, purchase history, collections).
import { useState, useEffect } from "react";
import { NAVY, GOLD, RED, prettyDate } from "../../lib/core.js";
import {
  blankSupplier, supplierStats, purchaseTotals, purchaseIsPaid, poRef, gbp, findSupplierByName,
  PURCHASE_CATEGORIES, PAYMENT_METHODS, FIELD_FORMATS, nextSupplierAccount,
} from "../../lib/crmCore.js";
import { purchasesAvailable } from "../../data/crmStorage.js";
import { Icon, Chip, Modal, sect, lbl, card, abtn, inp, btn, goldBtn } from "./ui.jsx";

const th = { fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap", textAlign: "left" };
const tdc = { padding: "9px 8px", borderBottom: "1px solid #f0f2f6" };

export const PurchasesSchemaNotice = () => (
  <div style={{ ...card, borderColor: GOLD, background: "#fff8e6", fontSize: 13.5, fontWeight: 600, color: "#6b5305" }}>
    <b style={{ display: "block", fontSize: 14.5, color: NAVY, marginBottom: 4 }}>Purchases &amp; suppliers need one more database step</b>
    Run <code>019_purchases.sql</code> in Supabase (SQL Editor → New query → paste → Run), then refresh. Until then they can't be saved.
  </div>
);

// New / edit supplier. onSaved(supplier) lets other screens link the result.
export function SupplierModal({ crm, updateCrm, me, draft, onClose, onSaved }) {
  const isNew = !(crm.suppliers || []).some((x) => x.id === draft.id);
  // new suppliers get the next account # (editable)
  const [s, setS] = useState(() => ({ ...draft, accountNo: draft.accountNo || (isNew ? nextSupplierAccount(crm) : "") }));
  const dupe = isNew && s.name.trim() ? findSupplierByName(crm, s.name) : null;
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const fmt = (k) => FIELD_FORMATS[k] && setS((x) => ({ ...x, [k]: FIELD_FORMATS[k](x[k]) }));
  const save = () => {
    if (!s.name.trim()) return;
    const clean = { ...s, name: s.name.trim() };
    updateCrm((c) => {
      c.suppliers = c.suppliers || [];
      const i = c.suppliers.findIndex((x) => x.id === clean.id);
      if (i >= 0) c.suppliers[i] = { ...c.suppliers[i], ...clean };
      else {
        c.suppliers.push({ ...clean, createdBy: me || "" });
        const n = Number(clean.accountNo);
        if (isFinite(n) && n >= (Number(c.numbering.supplier) || 1)) c.numbering.supplier = n + 1;
      }
      return c;
    });
    if (onSaved) onSaved(clean);
    onClose();
  };
  const f = (k, label, span = 1, props = {}) => (
    <div style={{ gridColumn: "span " + span }}>
      <span style={lbl}>{label}</span>
      <input style={inp} value={s[k] || ""} {...props} onChange={(e) => set(k, e.target.value)} onBlur={() => fmt(k)} />
    </div>
  );
  return (
    <Modal title={isNew ? "New supplier" : "Edit supplier"} onClose={onClose} width={600}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {f("name", "Supplier name", 2, { autoFocus: true })}
        {f("accountNo", "Account #")}
        {f("address", "Address", 2)}
        {f("town", "Town")}
        {f("postcode", "Postcode")}
        {f("contact", "Contact")}
        {f("phone", "Phone")}
        {f("email", "Email", 2)}
        {f("website", "Website")}
        <div>
          <span style={lbl}>Usual category</span>
          <input style={inp} list="dk-pcats" value={s.category} onChange={(e) => set("category", e.target.value)} />
        </div>
        <div>
          <span style={lbl}>Usually paid by</span>
          <input style={inp} list="dk-pmethods" value={s.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} />
        </div>
        <div style={{ gridColumn: "span 3" }}>
          <span style={lbl}>Notes</span>
          <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={s.notes} placeholder="Opening hours, collection instructions, rep's name…" onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>
      <datalist id="dk-pcats">{PURCHASE_CATEGORIES.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="dk-pmethods">{PAYMENT_METHODS.map((x) => <option key={x} value={x} />)}</datalist>
      {dupe && (
        <div style={{ marginTop: 10, background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "7px 11px", fontSize: 12.5, fontWeight: 600, color: "#6b5305" }}>
          “{dupe.name}” is already on the list — check it isn't the same supplier.
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
        {!isNew && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#5a6a85" }}>
            <input type="checkbox" checked={s.active === false} onChange={(e) => set("active", !e.target.checked)} />No longer used
          </label>
        )}
        <span style={{ flex: 1 }} />
        <button style={btn} onClick={onClose}>Cancel</button>
        <button style={{ ...goldBtn, opacity: s.name.trim() ? 1 : 0.5 }} disabled={!s.name.trim()} onClick={save}>Save</button>
      </div>
    </Modal>
  );
}

export default function SuppliersScreen({ crm, updateCrm, askConfirm, selId, setSelId, me, openPurchase, newPurchase, openCollection, newSignal, onNewHandled }) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(null);
  const ready = purchasesAvailable();
  const suppliers = crm.suppliers || [];

  useEffect(() => {
    if (!newSignal) return;
    if (ready) setDraft(blankSupplier());
    if (onNewHandled) onNewHandled();
  }, [newSignal]);

  const sel = suppliers.find((x) => x.id === selId) || null;

  const remove = (sup) => {
    const st = supplierStats(crm, sup.id);
    if (st.count) return askConfirm({ message: sup.name + " has " + st.count + " purchase(s), so it can't be deleted — tick “No longer used” instead.", okOnly: true });
    askConfirm({
      message: "Delete supplier " + sup.name + "?" + (st.collections ? " Its " + st.collections + " collection(s) keep their address details." : ""),
      confirmLabel: "Delete",
      danger: true,
      action: () => {
        updateCrm((c) => {
          c.suppliers = c.suppliers.filter((x) => x.id !== sup.id);
          (c.collections || []).forEach((x) => { if (x.supplierId === sup.id) x.supplierId = ""; });
          return c;
        });
        setSelId(null);
      },
    });
  };

  const modal = draft && <SupplierModal crm={crm} updateCrm={updateCrm} me={me} draft={draft} onClose={() => setDraft(null)} />;

  // ===== list =====
  if (!sel) {
    const q = search.trim().toLowerCase();
    const rows = suppliers
      .map((x) => ({ x, st: supplierStats(crm, x.id) }))
      .filter(({ x }) => !q || [x.name, x.accountNo, x.town, x.postcode, x.contact, x.category].some((v) => String(v || "").toLowerCase().includes(q)))
      .sort((a, b) => (a.x.active === false) - (b.x.active === false) || b.st.spend - a.st.spend || (a.x.name || "").localeCompare(b.x.name || ""));
    return (
      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "18px 22px" }}>
        {!ready && <PurchasesSchemaNotice />}
        <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 340 }}>
            <span style={{ position: "absolute", left: 11, top: 10 }}><Icon name="search" /></span>
            <input style={{ ...inp, paddingLeft: 34 }} placeholder="Search name, account #, town…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span style={{ fontSize: 12, color: "#5a6a85", fontWeight: 700 }}>{suppliers.length} suppliers</span>
          <span style={{ flex: 1 }} />
          <button style={{ ...goldBtn, opacity: ready ? 1 : 0.5 }} disabled={!ready} onClick={() => setDraft(blankSupplier())}><Icon name="plus" stroke={NAVY} />New supplier</button>
        </div>
        <div style={card}>
          {rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 10px", color: "#5a6a85", fontWeight: 600 }}>{suppliers.length ? "No suppliers match." : "No suppliers yet."}</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
                <thead><tr>{["Supplier", "Account #", "Town", "Category", "Purchases", "Spend £", "Unpaid £", ""].map((h, i) => <th key={i} style={{ ...th, textAlign: i >= 4 && i <= 6 ? "right" : "left" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map(({ x, st }) => (
                    <tr key={x.id} onClick={() => setSelId(x.id)} style={{ cursor: "pointer", opacity: x.active === false ? 0.5 : 1 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f8fb")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <td style={{ ...tdc, fontWeight: 700 }}>{x.name}{x.active === false && <Chip style={{ marginLeft: 6, fontSize: 10, padding: "1px 7px" }}>not used</Chip>}</td>
                      <td style={tdc}>{x.accountNo || "—"}</td>
                      <td style={tdc}>{[x.town, x.postcode].filter(Boolean).join(" ") || "—"}</td>
                      <td style={tdc}>{x.category || "—"}</td>
                      <td style={{ ...tdc, textAlign: "right" }}>{st.count || "—"}</td>
                      <td style={{ ...tdc, textAlign: "right", fontWeight: 700 }}>{st.spend ? st.spend.toLocaleString("en-GB", { minimumFractionDigits: 2 }) : "—"}</td>
                      <td style={{ ...tdc, textAlign: "right", fontWeight: 700, color: st.unpaid ? "#a05f10" : "#aab3c2" }}>{st.unpaid ? st.unpaid.toLocaleString("en-GB", { minimumFractionDigits: 2 }) : "—"}</td>
                      <td style={{ ...tdc, textAlign: "right" }}><button style={abtn} title="Open" onClick={(e) => { e.stopPropagation(); setSelId(x.id); }}><Icon name="pen" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {modal}
      </div>
    );
  }

  // ===== supplier view =====
  const st = supplierStats(crm, sel.id);
  const purchases = (crm.purchases || []).filter((p) => p.supplierId === sel.id).sort((a, b) => (b.invDate || b.createdAt || "").localeCompare(a.invDate || a.createdAt || ""));
  const colls = (crm.collections || []).filter((c) => c.supplierId === sel.id).sort((a, b) => (b.collectDate || b.date || "").localeCompare(a.collectDate || a.date || ""));
  const navyBtn = { ...btn, background: "transparent", border: "1px solid #3a4f78", color: "#fff" };
  const Row = ({ label, value }) => (
    <div style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "1px solid #f0f2f6", fontSize: 13.5 }}>
      <span style={{ ...lbl, marginBottom: 0, width: 120, flex: "none", paddingTop: 2 }}>{label}</span>
      <b style={{ color: value ? NAVY : "#aab3c2", overflowWrap: "anywhere" }}>{value || "—"}</b>
    </div>
  );

  return (
    <div style={{ maxWidth: 1140, margin: "0 auto", padding: "18px 22px" }}>
      <button style={{ ...btn, marginBottom: 12 }} onClick={() => setSelId(null)}><Icon name="back" stroke={NAVY} />All suppliers</button>
      {!ready && <PurchasesSchemaNotice />}
      <div style={{ background: "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", borderRadius: 12, padding: "18px 22px", color: "#fff", marginBottom: 14, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ minWidth: 180 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{sel.name}</h2>
          <div style={{ display: "flex", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
            {sel.accountNo && <Chip tone="navy">{"Account #" + sel.accountNo}</Chip>}
            {sel.category && <Chip tone="navy">{sel.category}</Chip>}
            {sel.active === false && <Chip tone="navy">No longer used</Chip>}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", background: "#ffffff14", border: "1px solid #ffffff22", borderRadius: 12, overflow: "hidden", flexWrap: "wrap" }}>
          {[[st.count, "Purchases"], [gbp(st.spend), "Total spend"], [st.last ? prettyDate(st.last) : "—", "Last invoice"], [gbp(st.unpaid), "Unpaid"]].map(([v, l], i) => (
            <div key={l} style={{ padding: "10px 18px", textAlign: "center", borderLeft: i ? "1px solid #ffffff22" : "none" }}>
              <b style={{ display: "block", fontSize: 16, color: l === "Unpaid" && st.unpaid ? "#f2a6b1" : GOLD }}>{v}</b>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "#aeb9cf", letterSpacing: 0.5, textTransform: "uppercase" }}>{l}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexBasis: "100%", flexWrap: "wrap" }}>
          <button style={navyBtn} onClick={() => setDraft({ ...sel })}><Icon name="pen" stroke="#fff" />Edit supplier</button>
          <button style={{ ...navyBtn, borderColor: GOLD, color: GOLD, opacity: ready ? 1 : 0.5 }} disabled={!ready} onClick={() => newPurchase(sel.id)}><Icon name="plus" stroke={GOLD} />New purchase</button>
          <span style={{ flex: 1 }} />
          <button style={{ ...navyBtn, border: "1px dashed #3a4f78", color: "#8fa0c0" }} onClick={() => remove(sel)}><Icon name="bin" stroke="#8fa0c0" />Delete</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 14 }}>
        <div style={{ ...card, marginBottom: 0 }}>
          <p style={sect}>Details</p>
          <Row label="Address" value={[sel.address, sel.town, sel.postcode].filter(Boolean).join(", ")} />
          <Row label="Contact" value={sel.contact} />
          <Row label="Phone" value={sel.phone} />
          <Row label="Email" value={sel.email} />
          <Row label="Website" value={sel.website} />
          <Row label="Usually paid by" value={sel.paymentMethod} />
          {sel.notes && <div style={{ marginTop: 8, background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "7px 11px", fontSize: 12.5, fontWeight: 600, color: "#6b5305" }}>{sel.notes}</div>}
        </div>
        <div style={{ ...card, marginBottom: 0 }}>
          <p style={sect}>Collections ({colls.length})</p>
          {colls.length === 0 ? (
            <div style={{ fontSize: 13, color: "#8593a8", fontWeight: 600 }}>No collections from this supplier yet.</div>
          ) : (
            colls.slice(0, 12).map((c) => (
              <button key={c.id} onClick={() => openCollection(c.id)}
                style={{ display: "flex", gap: 10, width: "100%", padding: "8px 0", background: "none", border: "none", borderBottom: "1px solid #f0f2f6", cursor: "pointer", fontFamily: "inherit", fontSize: 13, textAlign: "left", color: NAVY }}>
                <b style={{ color: "#185FA5" }}>COL-{c.collectionNo || "—"}</b>
                <span style={{ color: "#5a6a85", fontWeight: 600 }}>{prettyDate(c.collectDate || c.date)}</span>
                <span style={{ marginLeft: "auto" }}><Chip tone={c.collected ? "green" : "amber"}>{c.collected ? "Collected" : "To collect"}</Chip></span>
              </button>
            ))
          )}
        </div>
      </div>

      <div style={card}>
        <p style={sect}>Purchases ({purchases.length})</p>
        {purchases.length === 0 ? (
          <div style={{ fontSize: 13, color: "#8593a8", fontWeight: 600 }}>No purchases yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 680 }}>
              <thead><tr>{["PO", "Inv date", "Inv #", "Detail", "Total £", "Paid", ""].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 4 ? "right" : "left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => openPurchase(p.id)}>
                    <td style={{ ...tdc, fontWeight: 700, color: "#185FA5", whiteSpace: "nowrap" }}>{p.poNo || "—"}</td>
                    <td style={{ ...tdc, whiteSpace: "nowrap" }}>{p.invDate ? prettyDate(p.invDate) : "—"}</td>
                    <td style={tdc}>{p.invNo || "—"}</td>
                    <td style={{ ...tdc, color: "#5a6a85", fontWeight: 600 }}>{(p.invDetail || "").split("\n")[0] || "—"}</td>
                    <td style={{ ...tdc, textAlign: "right", fontWeight: 700 }}>{purchaseTotals(p).total.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                    <td style={tdc}><Chip tone={purchaseIsPaid(p) ? "green" : "amber"}>{purchaseIsPaid(p) ? "Paid " + prettyDate(p.datePaid).slice(0, 6) : "Unpaid"}</Chip></td>
                    <td style={{ ...tdc, textAlign: "right" }}><button style={abtn} title="Open" onClick={(e) => { e.stopPropagation(); openPurchase(p.id); }}><Icon name="pen" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {modal}
    </div>
  );
}
