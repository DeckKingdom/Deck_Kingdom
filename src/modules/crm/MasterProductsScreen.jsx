// Master products: every sellable product and variation with its own SKU —
// prices, costs, weights, stock, and kit bill-of-materials for loading bills.
import { useState, useMemo } from "react";
import { NAVY, GOLD, RED, uid } from "../../lib/core.js";
import { blankMasterProduct, blankComponent, allocatedBySku, gbp } from "../../lib/crmCore.js";
import { Icon, Chip, Modal, sect, lbl, card, abtn, inp, btn, goldBtn } from "./ui.jsx";

const numCell = { textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" };
const td = { padding: "8px 7px", borderBottom: "1px solid #f0f2f6", fontSize: 13 };

const marginPct = (p) => {
  const price = Number(p.priceIncVat);
  const cost = Number(p.costGbp);
  if (!isFinite(price) || price <= 0 || p.priceIncVat === "" || p.costGbp === "" || !isFinite(cost)) return null;
  const net = price / 1.2;
  return ((net - cost) / net) * 100;
};

export default function MasterProductsScreen({ crm, updateCrm, askConfirm }) {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [draft, setDraft] = useState(null);

  const mps = crm.masterProducts || [];
  const byId = useMemo(() => Object.fromEntries(mps.map((p) => [p.id, p])), [mps]);
  const allocated = useMemo(() => allocatedBySku(crm), [crm.invoices, crm.masterProducts]);
  const categories = useMemo(() => [...new Set(mps.map((p) => p.category).filter(Boolean))].sort(), [mps]);

  const usedAsComponent = (id) => mps.some((p) => (p.components || []).some((c) => c.componentId === id));
  const skuClash = (d) => d.sku.trim() && mps.some((p) => p.id !== d.id && (p.sku || "").trim().toLowerCase() === d.sku.trim().toLowerCase());

  const stockInfo = (p) => {
    const stock = p.stock === "" || p.stock === null ? null : Number(p.stock);
    const alloc = allocated[(p.sku || "").trim().toLowerCase()] || 0;
    const free = stock === null ? null : stock - alloc;
    const low = stock !== null && p.stockAlert !== "" && p.stockAlert !== null && stock <= Number(p.stockAlert);
    return { stock, alloc, free, low };
  };

  const q = search.trim().toLowerCase();
  const filtered = mps.filter((p) => {
    if (cat && p.category !== cat) return false;
    if (lowOnly && !stockInfo(p).low) return false;
    if (q && ![p.sku, p.name, p.colour, p.family, p.category].some((v) => String(v || "").toLowerCase().includes(q))) return false;
    return true;
  });

  const save = () => {
    const d = draft;
    if (!d.sku.trim() && !d.name.trim()) return;
    updateCrm((c) => {
      c.masterProducts = c.masterProducts || [];
      const t = c.masterProducts.find((x) => x.id === d.id);
      const { _new, ...clean } = d;
      if (t) Object.assign(t, clean);
      else c.masterProducts.push(clean);
      return c;
    });
    setDraft(null);
  };

  const duplicate = (p) =>
    setDraft({
      ...JSON.parse(JSON.stringify(p)),
      id: uid(),
      sku: "",
      colour: "",
      stock: "",
      components: (p.components || []).map((c) => ({ ...c, id: uid() })),
      _new: true,
    });

  const remove = (p) => {
    if (usedAsComponent(p.id)) {
      askConfirm({ message: '"' + (p.sku || p.name) + '" is part of a kit, so it can\'t be deleted. Remove it from the kit first.', okOnly: true });
      return;
    }
    askConfirm({
      message: 'Delete "' + (p.sku || p.name) + '"? Invoice lines that used this SKU keep their text.',
      confirmLabel: "Delete",
      danger: true,
      action: () =>
        updateCrm((c) => {
          c.masterProducts = c.masterProducts.filter((x) => x.id !== p.id);
          return c;
        }),
    });
  };

  const setStock = (id, v) =>
    updateCrm((c) => {
      const t = c.masterProducts.find((x) => x.id === id);
      if (t) t.stock = v === "" ? "" : Number(v);
      return c;
    });

  const field = (k, label, props = {}, style = {}) => (
    <div>
      <span style={lbl}>{label}</span>
      <input style={{ ...inp, ...style }} value={draft[k] === null ? "" : draft[k]} {...props}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
    </div>
  );

  const nonKitOptions = mps.filter((p) => !p.isKit && p.id !== (draft && draft.id)).sort((a, b) => (a.sku || "").localeCompare(b.sku || ""));

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "18px 22px" }}>
      <datalist id="dk-mp-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>

      <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 320 }}>
          <span style={{ position: "absolute", left: 11, top: 10 }}><Icon name="search" /></span>
          <input style={{ ...inp, paddingLeft: 34 }} placeholder="Search SKU, name, colour, family…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select style={{ ...inp, width: "auto" }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only
        </label>
        <span style={{ fontSize: 12, color: "#5a6a85", fontWeight: 700 }}>{mps.length.toLocaleString("en-GB")} SKUs</span>
        <span style={{ flex: 1 }} />
        <button style={goldBtn} onClick={() => setDraft({ ...blankMasterProduct(), _new: true })}><Icon name="plus" stroke={NAVY} />New product</button>
      </div>

      <div style={card}>
        {mps.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 10px", color: "#5a6a85", fontWeight: 600 }}>
            No master products yet. Every product and variation gets its own SKU here — prices, costs, weights,
            stock and kit contents all hang off this list.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
              <thead>
                <tr>
                  {["SKU", "Product", "Colour", "Category", "Price £ inc", "Cost £", "Margin", "Wt kg", "Stock", "Allocated", "Free", ""].map((h, i) => (
                    <th key={i} style={{ textAlign: i >= 4 && i <= 10 ? "right" : "left", fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 7px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const si = stockInfo(p);
                  const m = marginPct(p);
                  return (
                    <tr key={p.id} style={{ opacity: p.active === false ? 0.45 : 1 }}>
                      <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {p.sku || "—"}{" "}
                        {p.isKit && <Chip tone="gold" style={{ fontSize: 10, padding: "1px 7px" }}>KIT</Chip>}
                      </td>
                      <td style={{ ...td, fontWeight: 600, minWidth: 180 }}>
                        {p.name}
                        {p.family && <span style={{ color: "#8593a8", fontWeight: 600 }}> · {p.family}</span>}
                      </td>
                      <td style={td}>{p.colour || "—"}</td>
                      <td style={td}>{p.category || "—"}</td>
                      <td style={{ ...td, ...numCell }}>{p.priceIncVat === "" || p.priceIncVat === null ? "—" : Number(p.priceIncVat).toFixed(2)}</td>
                      <td style={{ ...td, ...numCell }}>{p.costGbp === "" || p.costGbp === null ? "—" : Number(p.costGbp).toFixed(2)}</td>
                      <td style={{ ...td, ...numCell, color: m === null ? "#aab3c2" : m < 20 ? RED : "#28713e" }}>{m === null ? "—" : m.toFixed(0) + "%"}</td>
                      <td style={{ ...td, ...numCell }}>{p.weightKg === "" || p.weightKg === null ? "—" : Number(p.weightKg)}</td>
                      <td style={{ ...td, textAlign: "right", width: 76 }}>
                        <input
                          style={{ ...inp, width: 70, textAlign: "right", fontWeight: 700, padding: "4px 7px", borderColor: si.low ? RED : "#d5d9e0", background: si.low ? "#C8102E10" : "#fff" }}
                          inputMode="decimal"
                          value={p.stock === null ? "" : p.stock}
                          onChange={(e) => setStock(p.id, e.target.value)}
                          title={si.low ? "At or below the low-stock alert (" + p.stockAlert + ")" : "On hand"}
                        />
                      </td>
                      <td style={{ ...td, ...numCell, color: si.alloc ? "#a05f10" : "#aab3c2" }}>{si.alloc || "—"}</td>
                      <td style={{ ...td, ...numCell, color: si.free !== null && si.free < 0 ? RED : NAVY }}>{si.free === null ? "—" : si.free}</td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        <button style={abtn} title="Edit" onClick={() => setDraft(JSON.parse(JSON.stringify(p)))}><Icon name="pen" /></button>{" "}
                        <button style={abtn} title="Duplicate as a new variation" onClick={() => duplicate(p)}><Icon name="plus" /></button>{" "}
                        <button style={abtn} title="Delete" onClick={() => remove(p)}><Icon name="bin" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {mps.length > 0 && (
          <p style={{ fontSize: 12, color: "#5a6a85", fontWeight: 600, marginTop: 10, marginBottom: 0 }}>
            Allocated = on invoices not yet delivered (kits counted as their parts) · Free = stock − allocated ·
            Margin is ex-VAT: (price ÷ 1.2 − cost) ÷ (price ÷ 1.2)
          </p>
        )}
      </div>

      {/* ===== edit modal ===== */}
      {draft && (
        <Modal title={draft._new ? "New product" : "Edit " + (draft.sku || draft.name)} onClose={() => setDraft(null)} width={640}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            {field("sku", "SKU (unique)")}
            {field("name", "Product name")}
            {field("colour", "Colour / variation")}
            {field("family", "Family (groups variations)")}
            <div>
              <span style={lbl}>Category</span>
              <input style={inp} list="dk-mp-cats" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
            </div>
            {field("unit", "Unit")}
            {field("priceIncVat", "Price £ inc VAT", { inputMode: "decimal" }, { textAlign: "right" })}
            {field("costGbp", "Cost £ (landed)", { inputMode: "decimal" }, { textAlign: "right" })}
            {field("weightKg", "Weight kg / unit", { inputMode: "decimal" }, { textAlign: "right" })}
            {field("stock", "Stock on hand", { inputMode: "decimal" }, { textAlign: "right" })}
            {field("stockAlert", "Low-stock alert at", { inputMode: "decimal" }, { textAlign: "right" })}
          </div>
          {skuClash(draft) && (
            <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: RED }}>That SKU is already in use — each SKU must be unique.</div>
          )}
          <div style={{ display: "flex", gap: 18, alignItems: "center", margin: "14px 0 6px", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700 }}>
              <input type="checkbox" checked={draft.isKit} onChange={(e) => setDraft({ ...draft, isKit: e.target.checked })} />
              This is a kit (made up of other SKUs)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700 }}>
              <input type="checkbox" checked={draft.active !== false} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Active
            </label>
          </div>

          {draft.isKit && (
            <div style={{ background: "#f8f9fb", border: "1px solid #e6e9ef", borderRadius: 10, padding: "10px 13px", marginTop: 8 }}>
              <p style={{ ...sect, marginBottom: 8 }}>Kit contents — what gets loaded per kit</p>
              {(draft.components || []).map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <select style={{ ...inp, flex: 1 }} value={c.componentId}
                    onChange={(e) => setDraft({ ...draft, components: draft.components.map((x) => (x.id === c.id ? { ...x, componentId: e.target.value } : x)) })}>
                    <option value="">Pick a SKU…</option>
                    {nonKitOptions.map((p) => (
                      <option key={p.id} value={p.id}>{(p.sku || "?") + " — " + p.name + (p.colour ? " · " + p.colour : "")}</option>
                    ))}
                  </select>
                  <input style={{ ...inp, width: 70, textAlign: "right" }} inputMode="decimal" title="Qty per kit" value={c.qty}
                    onChange={(e) => setDraft({ ...draft, components: draft.components.map((x) => (x.id === c.id ? { ...x, qty: e.target.value === "" ? "" : Number(e.target.value) } : x)) })} />
                  <button style={abtn} title="Remove" onClick={() => setDraft({ ...draft, components: draft.components.filter((x) => x.id !== c.id) })}>
                    <Icon name="x" stroke={RED} />
                  </button>
                </div>
              ))}
              <button style={{ ...btn, borderStyle: "dashed", color: "#5a6a85", width: "100%", justifyContent: "center", padding: "7px 0" }}
                onClick={() => setDraft({ ...draft, components: [...(draft.components || []), blankComponent()] })}>
                <Icon name="plus" />Add part
              </button>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <span style={lbl}>Notes</span>
            <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <button style={btn} onClick={() => setDraft(null)}>Cancel</button>
            <button style={{ ...goldBtn, opacity: draft.sku.trim() || draft.name.trim() ? 1 : 0.5 }} onClick={save}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
