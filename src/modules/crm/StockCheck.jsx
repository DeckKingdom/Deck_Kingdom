// Stock check on an invoice: every part the job needs (kits broken down),
// what's coming on collections for it, what's free in stock and what's short.
// "Collect the shortfall" raises the collection notes in one go: the right
// supplier SKUs, linked to the job, on its pick list at the price paid.
import { useState } from "react";
import { NAVY, GOLD, RED } from "../../lib/core.js";
import { stockCheck, partSuppliers, raiseShortfallCollections, supplierKey, skuLists, segLabel, gbp } from "../../lib/crmCore.js";
import { Icon, Chip, Modal, card, inp, btn, goldBtn } from "./ui.jsx";

const th = { textAlign: "left", fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "6px 6px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" };
const td = { padding: "6px 6px", borderBottom: "1px solid #eef0f4", fontSize: 12.5 };
const num = { ...td, textAlign: "right", whiteSpace: "nowrap" };

export default function StockCheck({ inv, crm, planner, updatePlanner, updateCrm, me, onRaised, openCollection }) {
  const [choices, setChoices] = useState(null); // modal state
  const rows = stockCheck(inv, crm);
  if (!rows.length) return null;
  const lists = skuLists(crm);
  const supplierOf = (row) => {
    const p = ((planner && planner.products) || []).find((x) => x.id === row.importProductId);
    if (p && (p.supplier || "").trim()) return p.supplier.trim();
    const hit = lists.supplier.find((x) => x.code === String(row.sku || "").slice(0, 2));
    return hit ? hit.label : "";
  };
  const short = rows.filter((r) => r.short > 0);
  const colRefs = [...new Set((inv.picks || []).filter((p) => /^COL-/i.test(p.batchRef || "")).map((p) => p.batchRef))];
  const collByRef = Object.fromEntries((crm.collections || []).map((c) => ["COL-" + c.collectionNo, c]));

  // only suppliers we actually buy products from (named on a product, or in the SKU supplier list)
  const productSuppliers = [
    ...((planner && planner.products) || []).map((p) => supplierKey(p.supplier)),
    ...lists.supplier.map((x) => supplierKey(String(x.label || "").replace(/\(.*\)/, ""))),
  ].filter((k) => k.length > 2);
  const isProductSupplier = (name) => {
    const k = supplierKey(name);
    if (!k || k.startsWith("deckkingdom")) return false; // not ourselves
    return productSuppliers.some((p) => p === k || k.startsWith(p) || p.startsWith(k));
  };
  const suppliers = [...(crm.suppliers || [])]
    .filter((x) => x.name && x.active !== false && isProductSupplier(x.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const openModal = () =>
    setChoices(
      short.map((r) => {
        const alts = partSuppliers(crm, planner, r.sku, r.description, r.colour)
          .map((x) => ({ ...x, supplier: supplierOf(x.row), cost: x.row.costGbp === "" || x.row.costGbp === null || x.row.costGbp === undefined ? null : Number(x.row.costGbp) }))
          .sort((a, b) => (a.cost === null) - (b.cost === null) || (a.cost || 0) - (b.cost || 0));
        return { part: r, alts, pick: alts.length ? alts[0].row.id : "", qty: r.short, cost: "" };
      })
    );

  const confirm = () => {
    const picked = choices
      .filter((c) => c.pick && Number(c.qty) > 0)
      .map((c) => {
        if (c.pick.startsWith("sup:")) {
          // no catalogue version from anyone else: collect the same item from any supplier
          const sup = suppliers.find((x) => "sup:" + x.id === c.pick);
          const row = { id: "free:" + c.part.key, sku: c.part.sku, name: c.part.description, colour: c.part.colour || "", costGbp: c.cost === "" ? "" : Number(c.cost) };
          return { row, qty: Number(c.qty), supplierName: sup ? sup.name : "" };
        }
        const a = c.alts.find((x) => x.row.id === c.pick);
        return { row: a.row, qty: Number(c.qty), supplierName: a.supplier, productId: a.productId, addColour: a.addColour };
      });
    if (!picked.length) return setChoices(null);
    // a supplier whose version didn't list this colour yet gets it added (its stock row follows)
    const adds = picked.filter((x) => x.addColour && x.productId);
    if (adds.length && updatePlanner)
      updatePlanner((d) => {
        adds.forEach((x) => {
          const q = (d.products || []).find((p) => p.id === x.productId);
          if (q && !(q.colours || []).some((c) => c.toLowerCase() === x.addColour.toLowerCase())) q.colours = [...(q.colours || []), x.addColour];
        });
        return d;
      });
    updateCrm((c) => {
      raiseShortfallCollections(c, inv.id, picked, me);
      return c;
    });
    setChoices(null);
    if (onRaised) onRaised([...new Set(picked.map((x) => x.supplierName || "the supplier"))]);
  };

  return (
    <div style={{ background: "#fff", border: "1px solid " + (short.length ? "#ecc4cb" : "#e6e9ef"), borderRadius: 12, padding: "10px 14px", marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <p style={{ fontSize: 11.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.6, textTransform: "uppercase", margin: 0 }}>Stock check</p>
        {inv.deliveryCompleted ? <Chip tone="green">Delivered</Chip>
          : short.length ? <Chip tone="red">{short.length + " part" + (short.length > 1 ? "s" : "") + " short"}</Chip>
          : <Chip tone="green">All parts available</Chip>}
        {colRefs.map((ref) => (
          <button key={ref} onClick={() => collByRef[ref] && openCollection && openCollection(collByRef[ref].id)}
            style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 999, border: "1px solid #bfe3ca", background: "#3FA55C14", color: "#28713e", cursor: "pointer" }}>
            {ref + (collByRef[ref] ? " · " + collByRef[ref].supplier + (collByRef[ref].collected ? " · collected" : "") : "")}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {short.length > 0 && (
          <button style={{ ...goldBtn, padding: "6px 12px", fontSize: 12.5 }} onClick={openModal}>
            <Icon name="truck" stroke={NAVY} />Collect the shortfall
          </button>
        )}
      </div>
      <div className="dk-bleed" style={{ overflowX: "auto" }}>
        <table className="dk-t" style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
          <thead><tr>
            <th style={th}>Part</th><th style={{ ...th, textAlign: "right" }}>Needed</th><th style={{ ...th, textAlign: "right" }}>On collection</th>
            <th style={{ ...th, textAlign: "right" }}>Free in stock</th><th style={{ ...th, textAlign: "right" }}>Short</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td style={td}>
                  <b>{r.row && r.row.family && r.row.family.includes("/") ? r.row.family : r.sku}</b>
                  <span style={{ color: "#5a6a85", fontWeight: 600 }}>{" " + (r.description || "") + (r.colour ? " · " + r.colour : "")}</span>
                </td>
                <td style={num}><b>{r.need}</b></td>
                <td style={{ ...num, color: r.covered ? "#28713e" : "#aab3c2", fontWeight: r.covered ? 700 : 400 }}>{r.covered || "—"}</td>
                <td style={num}>{r.free}</td>
                <td style={{ ...num, fontWeight: 700, color: r.short ? RED : "#aab3c2" }}>{r.short || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {choices && (
        <Modal title="Collect the shortfall" onClose={() => setChoices(null)} width={680}>
          <p style={{ fontSize: 13, color: "#5a6a85", fontWeight: 600, marginTop: 0 }}>
            Pick who to collect each part from — the cheapest is chosen for you. One collection note is raised per supplier, linked to job #{inv.invNo || "—"}.
          </p>
          {choices.map((c, i) => (
            <div key={c.part.key} style={{ display: "grid", gridTemplateColumns: "minmax(200px,1.3fr) minmax(220px,1.6fr) 80px", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f2f6" }}>
              <div style={{ fontSize: 13 }}>
                <b>{c.part.description || c.part.sku}</b>{c.part.colour ? " · " + c.part.colour : ""}
                <div style={{ fontSize: 11.5, color: RED, fontWeight: 700 }}>{c.part.short} short</div>
              </div>
              {c.alts.length ? (
                <select style={{ ...inp, fontSize: 13 }} value={c.pick} onChange={(e) => setChoices((x) => x.map((y, j) => (j === i ? { ...y, pick: e.target.value } : y)))}>
                  {c.alts.map((a) => (
                    <option key={a.row.id} value={a.row.id}>{(a.supplier || "Supplier") + " — " + (a.cost === null ? "no cost set" : gbp(a.cost) + " each") + (a.addColour ? " · adds " + a.addColour + " to their version" : " · " + a.row.sku)}</option>
                  ))}
                  <option value="">Don't collect this one</option>
                </select>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 76px", gap: 6 }}>
                  <select style={{ ...inp, fontSize: 13, borderColor: c.pick ? "#d5d9e0" : "#E8912D" }} value={c.pick}
                    title="No other supplier's version is on Products — pick who you're collecting it from"
                    onChange={(e) => setChoices((x) => x.map((y, j) => (j === i ? { ...y, pick: e.target.value } : y)))}>
                    <option value="">{suppliers.length ? "Collect from… (no other version on Products)" : "No product suppliers set up"}</option>
                    {suppliers.map((sp) => <option key={sp.id} value={"sup:" + sp.id}>{sp.name}</option>)}
                  </select>
                  <input type="number" min="0" step="0.01" placeholder="£ each" style={{ ...inp, textAlign: "right" }} value={c.cost}
                    onChange={(e) => setChoices((x) => x.map((y, j) => (j === i ? { ...y, cost: e.target.value } : y)))} />
                </div>
              )}
              <input type="number" min="0" style={{ ...inp, textAlign: "right" }} value={c.qty}
                onChange={(e) => setChoices((x) => x.map((y, j) => (j === i ? { ...y, qty: e.target.value } : y)))} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <button style={btn} onClick={() => setChoices(null)}>Cancel</button>
            <button style={goldBtn} disabled={!choices.some((c) => c.pick && Number(c.qty) > 0)} onClick={confirm}>
              <Icon name="truck" stroke={NAVY} />Raise collection note{new Set(choices.filter((c) => c.pick).map((c) => c.pick.startsWith("sup:") ? c.pick : (c.alts.find((a) => a.row.id === c.pick) || {}).supplier)).size > 1 ? "s" : ""}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
