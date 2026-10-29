// Stock: valuation report (cost / standard sale / trade sale -10%), per-SKU
// quantities, posting arrived shipments into stock, and the movements ledger.
import React, { useState, useMemo } from "react";
import { NAVY, GOLD, RED, prettyDate, prettyDateTime, money } from "../../lib/core.js";
import {
  stockValuation, allocatedBySku, matchShipmentToStock, blankMovement, gbp, TRADE_DISCOUNT, today, weightedCost, batchBreakdown,
} from "../../lib/crmCore.js";
import { Icon, Chip, Modal, sect, lbl, card, abtn, inp, btn, goldBtn } from "./ui.jsx";

const td = { padding: "7px 7px", borderBottom: "1px solid #f0f2f6", fontSize: 12.5 };
const num = { textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" };

export default function StockScreen({ crm, updateCrm, planner, updatePlanner, askConfirm, me }) {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [postPanel, setPostPanel] = useState(false);
  const [postShipId, setPostShipId] = useState("");
  const [updateCosts, setUpdateCosts] = useState(true);
  const [showMoves, setShowMoves] = useState(false);
  const [openSkus, setOpenSkus] = useState(() => new Set());

  const mps = crm.masterProducts || [];
  const val = useMemo(() => stockValuation(crm), [crm.masterProducts]);
  const allocated = useMemo(() => allocatedBySku(crm), [crm.invoices, crm.masterProducts]);
  const categories = useMemo(() => [...new Set(mps.map((p) => p.category).filter(Boolean))].sort(), [mps]);

  const shipments = (planner && planner.shipments) || [];
  const postable = shipments.filter((s) => !s.postedToStock && (s.lines || []).length);
  const postShip = shipments.find((s) => s.id === postShipId);
  const match = postShip ? matchShipmentToStock(postShip, crm) : null;

  const doPost = () => {
    if (!postShip || !match || !match.matched.length) return;
    const ref = postShip.name;
    updateCrm((c) => {
      match.matched.forEach(({ mp, qty, landed }) => {
        const t = c.masterProducts.find((x) => x.id === mp.id);
        if (!t) return;
        const oldStock = t.stock === "" || t.stock === null ? 0 : Number(t.stock);
        if (updateCosts && landed !== null) t.costGbp = weightedCost(oldStock, t.costGbp, qty, Math.round(landed * 10000) / 10000);
        t.stock = oldStock + qty;
        c.movements.push({ ...blankMovement(), sku: t.sku, mpId: t.id, qty, unitCost: landed === null ? "" : Math.round(landed * 10000) / 10000, kind: "shipment", ref, actor: me || "" });
      });
      return c;
    });
    updatePlanner((d) => {
      const s = d.shipments.find((x) => x.id === postShip.id);
      if (s) s.postedToStock = today();
      return d;
    });
    setPostPanel(false);
    setPostShipId("");
  };

  const q = search.trim().toLowerCase();
  const rows = mps.filter((p) => {
    const stock = p.stock === "" || p.stock === null ? 0 : Number(p.stock);
    if (inStockOnly && stock === 0) return false;
    if (cat && p.category !== cat) return false;
    if (q && ![p.sku, p.name, p.colour, p.category].some((v) => String(v || "").toLowerCase().includes(q))) return false;
    return true;
  });

  const moves = [...(crm.movements || [])].sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 60);

  const Card = ({ label, value, sub, tone }) => (
    <div style={{ flex: "1 1 160px", background: "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", borderRadius: 12, padding: "14px 18px", color: "#fff", minWidth: 150 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#aeb9cf", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 700, color: tone || GOLD, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, fontWeight: 600, color: "#8fa0c0", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "18px 22px" }}>
      {/* valuation */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <Card label="Units in stock" value={val.units.toLocaleString("en-GB")} tone="#fff" />
        <Card label="Stock value at cost" value={gbp(val.costValue)} sub="purchased / landed" />
        <Card label="Sale value — standard" value={gbp(val.saleValue)} sub="at list prices inc VAT" />
        <Card label={"Sale value — trade (−" + TRADE_DISCOUNT * 100 + "%)"} value={gbp(val.tradeValue)} sub="standard less 10%" />
      </div>

      {/* actions / filters */}
      <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 170, maxWidth: 300 }}>
          <span style={{ position: "absolute", left: 11, top: 10 }}><Icon name="search" /></span>
          <input style={{ ...inp, paddingLeft: 34 }} placeholder="Search SKU, name, colour…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select style={{ ...inp, width: "auto" }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} /> In stock only
        </label>
        <button style={{ ...btn, fontSize: 12.5 }} onClick={() => setShowMoves(!showMoves)}>
          <Icon name="clock" />{showMoves ? "Hide movements" : "Movements"}
        </button>
        <span style={{ flex: 1 }} />
        <button style={goldBtn} onClick={() => { setPostShipId(postable[0] ? postable[0].id : ""); setPostPanel(true); }}>
          <Icon name="ship" stroke={NAVY} />Post shipment to stock
        </button>
      </div>

      {/* movements ledger */}
      {showMoves && (
        <div style={card}>
          <p style={sect}>Stock movements — latest {moves.length}</p>
          {moves.length === 0 ? (
            <div style={{ fontSize: 13, color: "#8593a8", fontWeight: 600 }}>No movements yet — post a shipment or a collection into stock.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                <thead><tr>{["When", "SKU", "Qty", "Unit £", "Type", "Reference", "By"].map((h, i) => (
                  <th key={i} style={{ textAlign: i === 2 || i === 3 ? "right" : "left", fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "7px 7px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {moves.map((m) => (
                    <tr key={m.id}>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{prettyDateTime(m.at)}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{m.sku}</td>
                      <td style={{ ...td, ...num, color: m.qty >= 0 ? "#28713e" : RED }}>{m.qty >= 0 ? "+" + m.qty : m.qty}</td>
                      <td style={{ ...td, ...num }}>{m.unitCost === "" || m.unitCost === null ? "—" : Number(m.unitCost).toFixed(2)}</td>
                      <td style={td}><Chip tone={m.kind === "shipment" ? "gold" : m.kind === "collection" ? "green" : "grey"} style={{ fontSize: 10, padding: "1px 7px" }}>{m.kind || "—"}</Chip></td>
                      <td style={{ ...td, fontWeight: 600 }}>{m.ref}</td>
                      <td style={{ ...td, color: "#5a6a85" }}>{(m.actor || "").split("@")[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* stock table */}
      <div style={card}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
            <thead>
              <tr>
                {["SKU", "Product", "Colour", "Stock", "Alloc", "Free", "Cost £/pc", "Cost value £", "Sale £/pc", "Sale value £", "Trade £/pc", "Trade value £"].map((h, i) => (
                  <th key={i} style={{ textAlign: i >= 3 ? "right" : "left", fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "7px 7px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const stock = p.stock === "" || p.stock === null ? 0 : Number(p.stock);
                const alloc = allocated[(p.sku || "").trim().toLowerCase()] || 0;
                const free = stock - alloc;
                const cost = p.costGbp === "" || p.costGbp === null ? null : Number(p.costGbp);
                const price = p.priceIncVat === "" || p.priceIncVat === null ? null : Number(p.priceIncVat);
                const low = p.stockAlert !== "" && p.stockAlert !== null && stock <= Number(p.stockAlert);
                const isOpen = openSkus.has(p.id);
                const batches = isOpen ? batchBreakdown(p.sku, crm, planner) : null;
                return (
                  <React.Fragment key={p.id}>
                  <tr>
                    <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>
                      <button onClick={() => setOpenSkus((o) => { const x = new Set(o); x.has(p.id) ? x.delete(p.id) : x.add(p.id); return x; })}
                        title="Batch breakdown — what's left from which shipment"
                        style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 10, color: "#5a6a85", padding: "0 6px 0 0" }}>
                        {isOpen ? "▼" : "▶"}
                      </button>
                      {p.sku || "—"} {low && <Chip tone="red" style={{ fontSize: 9.5, padding: "1px 6px" }}>LOW</Chip>}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{p.name}</td>
                    <td style={td}>{p.colour || "—"}</td>
                    <td style={{ ...td, ...num }}>{stock.toLocaleString("en-GB")}</td>
                    <td style={{ ...td, ...num, color: alloc ? "#a05f10" : "#aab3c2" }}>{alloc || "—"}</td>
                    <td style={{ ...td, ...num, color: free < 0 ? RED : undefined }}>{free.toLocaleString("en-GB")}</td>
                    <td style={{ ...td, ...num }}>{cost === null ? "—" : cost.toFixed(2)}</td>
                    <td style={{ ...td, ...num }}>{cost === null ? "—" : money(stock * cost)}</td>
                    <td style={{ ...td, ...num }}>{price === null ? "—" : price.toFixed(2)}</td>
                    <td style={{ ...td, ...num }}>{price === null ? "—" : money(stock * price)}</td>
                    <td style={{ ...td, ...num, color: "#5a6a85" }}>{price === null ? "—" : (price * (1 - TRADE_DISCOUNT)).toFixed(2)}</td>
                    <td style={{ ...td, ...num, color: "#5a6a85" }}>{price === null ? "—" : money(stock * price * (1 - TRADE_DISCOUNT))}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={12} style={{ padding: "4px 10px 12px 30px", borderBottom: "1px solid #f0f2f6", background: "#f8f9fb" }}>
                        {batches.length === 0 ? (
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#8593a8" }}>
                            No batches recorded — stock was set by hand. Batches appear when shipments or collections are posted in.
                          </span>
                        ) : (
                          <>
                            <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 520 }}>
                              <thead><tr>{["Batch", "Received", "£/pc", "In", "Picked", "Left", "Value left £"].map((h, i) => (
                                <th key={i} style={{ textAlign: i >= 2 ? "right" : "left", fontSize: 10, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "4px 10px 4px 0" }}>{h}</th>
                              ))}</tr></thead>
                              <tbody>
                                {batches.map((b, i) => (
                                  <tr key={i}>
                                    <td style={{ padding: "3px 14px 3px 0", fontWeight: 700 }}>{b.ref}</td>
                                    <td style={{ padding: "3px 14px 3px 0" }}>{b.date || "—"}</td>
                                    <td style={{ padding: "3px 10px 3px 0", textAlign: "right", fontWeight: 700 }}>{b.unitCost === "" ? "—" : Number(b.unitCost).toFixed(2)}</td>
                                    <td style={{ padding: "3px 10px 3px 0", textAlign: "right" }}>{b.qtyIn.toLocaleString("en-GB")}</td>
                                    <td style={{ padding: "3px 10px 3px 0", textAlign: "right", color: b.picked ? "#a05f10" : "#aab3c2" }}>{b.picked || "—"}</td>
                                    <td style={{ padding: "3px 10px 3px 0", textAlign: "right", fontWeight: 700, color: b.left < 0 ? RED : "#28713e" }}>{b.left.toLocaleString("en-GB")}</td>
                                    <td style={{ padding: "3px 0 3px 0", textAlign: "right", fontWeight: 700 }}>{b.unitCost === "" ? "—" : (b.left * Number(b.unitCost)).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {(() => {
                              const sumLeft = batches.reduce((t, b) => t + b.left, 0);
                              return sumLeft !== stock ? (
                                <div style={{ fontSize: 11, fontWeight: 600, color: "#8593a8", marginTop: 5 }}>
                                  Batches account for {sumLeft.toLocaleString("en-GB")} of {stock.toLocaleString("en-GB")} on hand — the rest is manual adjustments or pre-batch stock.
                                </div>
                              ) : null;
                            })()}
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={12} style={{ ...td, textAlign: "center", color: "#8593a8", padding: 24 }}>Nothing in stock for these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: "#5a6a85", fontWeight: 600, marginTop: 10, marginBottom: 0 }}>
          Sale values come from each product's sale £/pc on the Products screen (inc VAT); trade = standard −10%.
          Stock moves by posting shipments/collections or editing the stock column here — every change is in the Activity log.
        </p>
      </div>

      {/* post shipment modal */}
      {postPanel && (
        <Modal title="Post a shipment into stock" onClose={() => setPostPanel(false)} width={640}>
          {postable.length === 0 && !postShip ? (
            <p style={{ fontSize: 13.5, fontWeight: 600, color: "#5a6a85" }}>
              Nothing to post — every shipment with lines has already been posted. (A shipment can only be posted once.)
            </p>
          ) : (
            <>
              <span style={lbl}>Shipment (checked in and ready)</span>
              <select style={inp} value={postShipId} onChange={(e) => setPostShipId(e.target.value)}>
                <option value="">Pick a shipment…</option>
                {postable.map((s) => (
                  <option key={s.id} value={s.id}>{s.name + " · " + s.status + (s.arrivedDate ? " · arrived " + prettyDate(s.arrivedDate) : "")}</option>
                ))}
              </select>
              {match && (
                <>
                  <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #e6e9ef", borderRadius: 9, marginTop: 12 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                      <thead><tr>{["SKU", "Product", "Qty in", "Landed £/pc"].map((h, i) => (
                        <th key={i} style={{ textAlign: i >= 2 ? "right" : "left", fontSize: 10.5, fontWeight: 700, color: "#8593a8", padding: "7px 9px", borderBottom: "2px solid #e6e9ef", position: "sticky", top: 0, background: "#fff" }}>{h}</th>
                      ))}</tr></thead>
                      <tbody>
                        {match.matched.map(({ mp, qty, landed }, i) => (
                          <tr key={i}>
                            <td style={{ ...td, fontWeight: 700 }}>{mp.sku}</td>
                            <td style={td}>{mp.name}{mp.colour ? " · " + mp.colour : ""}</td>
                            <td style={{ ...td, ...num, color: "#28713e" }}>+{qty.toLocaleString("en-GB")}</td>
                            <td style={{ ...td, ...num }}>{landed === null ? "—" : landed.toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {match.unmatched.length > 0 && (
                    <div style={{ marginTop: 10, background: "#C8102E10", border: "1px solid #ecc4cb", borderRadius: 8, padding: "8px 11px", fontSize: 12.5, fontWeight: 600, color: RED }}>
                      Not matched to a master SKU (won't be posted): {match.unmatched.map((u) => ((planner.products || []).find((p) => p.id === u.line.productId) || {}).name + (u.line.colour ? " " + u.line.colour : "")).filter(Boolean).join(", ") || "some lines"}.
                      Add that product/colour on the Products screen and post again later — or adjust stock by hand.
                    </div>
                  )}
                  <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, margin: "12px 0" }}>
                    <input type="checkbox" checked={updateCosts} onChange={(e) => setUpdateCosts(e.target.checked)} />
                    Update each SKU's cost £/pc (weighted average of stock on hand + this batch)
                  </label>
                </>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button style={btn} onClick={() => setPostPanel(false)}>Cancel</button>
                <button style={{ ...goldBtn, opacity: match && match.matched.length ? 1 : 0.5 }} onClick={doPost} disabled={!match || !match.matched.length}>
                  Post {match ? match.matched.reduce((t, m) => t + m.qty, 0).toLocaleString("en-GB") : ""} pcs to stock
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
