// Stock: valuation report (cost / standard sale / trade sale -10%), per-SKU
// quantities, posting arrived shipments into stock, and the movements ledger.
import React, { useState, useMemo } from "react";
import { NAVY, GOLD, RED, prettyDate, prettyDateTime, money } from "../../lib/core.js";
import {
  stockValuation, allocatedBySku, matchShipmentToStock, blankMovement, gbp, TRADE_DISCOUNT, today, weightedCost, batchBreakdown,
  GRADES, gradeOf, moveStockGrade, customerReturn, explodeInvoiceLines, baseSku,
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
  const [grade, setGrade] = useState(""); // "" all, "good", or a grade key
  const [moving, setMoving] = useState(null); // stock row being moved between grades
  const [returning, setReturning] = useState(false);

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
    if (grade === "good" && p.grade) return false;
    if (grade && grade !== "good" && p.grade !== grade) return false;
    if (q && ![p.sku, p.family, p.name, p.colour, p.category].some((v) => String(v || "").toLowerCase().includes(q))) return false;
    return true;
  });

  const moves = [...(crm.movements || [])].sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 60);

  const Card = ({ label, value, sub, tone, profit }) => (
    <div style={{ flex: "1 1 160px", background: "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", borderRadius: 12, padding: "14px 18px", color: "#fff", minWidth: 150, display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#aeb9cf", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 700, color: tone || GOLD, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, fontWeight: 600, color: "#8fa0c0", marginTop: 2 }}>{sub}</div>}
      {profit && (
        <div style={{ marginTop: "auto", paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, borderTop: "1px solid #ffffff22", paddingTop: 7 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#aeb9cf", letterSpacing: 0.5, textTransform: "uppercase" }}>Profit ex VAT</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: profit.gbp < 0 ? "#ff8a9b" : "#7fd99a" }}>{gbp(profit.gbp)}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: profit.gbp < 0 ? "#ff8a9b" : "#7fd99a" }}>{profit.pct === null ? "" : Math.round(profit.pct) + "%"}</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "18px 22px" }}>
      {/* valuation */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <Card label="Units in stock" value={val.units.toLocaleString("en-GB")} tone="#fff" />
        <Card label="Stock value at cost" value={gbp(val.costValue)} sub={"purchased / landed" + (val.unpricedUnits ? " · " + val.unpricedUnits.toLocaleString("en-GB") + " units lack a cost or price, left out of profit" : "")} />
        <Card label="Sale value — standard" value={gbp(val.saleValue)} sub="at list prices inc VAT" profit={val.standardProfit} />
        <Card label={"Sale value — trade (−" + TRADE_DISCOUNT * 100 + "%)"} value={gbp(val.tradeValue)} sub="standard less 10%" profit={val.tradeProfit} />
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
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {[{ key: "", label: "All" }, { key: "good", label: "Good" }, ...GRADES].map((g) => {
            const units = mps.filter((p) => (g.key === "" ? true : g.key === "good" ? !p.grade : p.grade === g.key)).reduce((t, p) => t + (Number(p.stock) || 0), 0);
            const on = grade === g.key;
            return (
              <button key={g.key || "all"} onClick={() => setGrade(g.key)} title={g.hint || ""}
                style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 999, cursor: "pointer", border: "1px solid " + (on ? NAVY : "#d5d9e0"), background: on ? NAVY : "#fff", color: on ? "#fff" : "#5a6a85" }}>
                {g.label + (g.key ? " · " + units.toLocaleString("en-GB") : "")}
              </button>
            );
          })}
        </div>
        <button style={{ ...btn, fontSize: 12.5 }} onClick={() => setReturning(true)} title="A customer has brought goods back">
          <Icon name="refresh" />Customer return
        </button>
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
            <div className="dk-bleed" style={{ overflowX: "auto" }}>
              <table className="dk-t" style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
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
                      <td style={td}><Chip tone={m.kind === "shipment" ? "gold" : m.kind === "collection" ? "green" : m.kind === "write-off" ? "red" : m.kind === "return" ? "blue" : "grey"} style={{ fontSize: 10, padding: "1px 7px" }}>{m.kind || "—"}</Chip></td>
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
        <div className="dk-bleed" style={{ overflowX: "auto" }}>
          <table className="dk-t" style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
            <thead>
              <tr>
                {["SKU", "Product", "Colour", "Stock", "Alloc", "Free", "Cost £/pc", "Cost value £", "Sale £/pc", "Sale value £", "Trade £/pc", "Trade value £", ""].map((h, i) => (
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
                      {p.sku || "—"} {low && <Chip tone="red" style={{ fontSize: 9.5, padding: "1px 6px" }}>LOW</Chip>}
                      {gradeOf(p) && <Chip tone={gradeOf(p).tone} style={{ fontSize: 9.5, padding: "1px 6px", marginLeft: 4 }}>{gradeOf(p).label.toUpperCase()}</Chip>}
                      {p.family && p.family.includes("/") && p.family !== p.sku && <div style={{ fontSize: 11, fontWeight: 600, color: "#8593a8", paddingLeft: 16 }}>{p.family}</div>}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{p.name}</td>
                    <td style={td}>{p.colour || "—"}</td>
                    <td style={{ ...td, ...num }}>{stock.toLocaleString("en-GB")}</td>
                    <td style={{ ...td, ...num, color: alloc ? "#a05f10" : "#aab3c2" }}>{alloc || "—"}</td>
                    <td style={{ ...td, ...num, color: free < 0 ? RED : undefined }}>{free.toLocaleString("en-GB")}</td>
                    <td style={{ ...td, ...num }}>{cost === null ? "—" : cost.toFixed(2)}</td>
                    <td style={{ ...td, ...num }}>{cost === null ? "—" : money(stock * cost)}</td>
                    <td style={{ ...td, ...num }}>
                      {p.grade ? (
                        <input type="number" step="0.01" title="This grade's own selling price inc VAT"
                          style={{ ...inp, width: 78, padding: "3px 6px", textAlign: "right", fontSize: 12.5, fontWeight: 700 }}
                          value={p.priceIncVat === null ? "" : p.priceIncVat}
                          onChange={(e) => updateCrm((c) => { const t = c.masterProducts.find((x) => x.id === p.id); if (t) t.priceIncVat = e.target.value === "" ? "" : Number(e.target.value); return c; })} />
                      ) : price === null ? "—" : price.toFixed(2)}
                    </td>
                    <td style={{ ...td, ...num }}>{price === null ? "—" : money(stock * price)}</td>
                    <td style={{ ...td, ...num, color: "#5a6a85" }}>{price === null ? "—" : (price * (1 - TRADE_DISCOUNT)).toFixed(2)}</td>
                    <td style={{ ...td, ...num, color: "#5a6a85" }}>{price === null ? "—" : money(stock * price * (1 - TRADE_DISCOUNT))}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <button style={{ ...abtn, fontSize: 11.5, padding: "3px 9px", whiteSpace: "nowrap" }} disabled={stock <= 0} title="Move some into Returned / Damaged / Clearance, back to good stock, or write off"
                        onClick={() => setMoving(p)}>Move…</button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={13} style={{ padding: "4px 10px 12px 30px", borderBottom: "1px solid #f0f2f6", background: "#f8f9fb" }}>
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
                <tr><td colSpan={13} style={{ ...td, textAlign: "center", color: "#8593a8", padding: 24 }}>Nothing in stock for these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: "#5a6a85", fontWeight: 600, marginTop: 10, marginBottom: 0 }}>
          Sale values come from each product's sale £/pc on the Products screen (inc VAT); trade = standard −10%.
          Stock moves by posting shipments/collections or editing the stock column here — every change is in the Activity log.
        </p>
      </div>

      {moving && <MoveModal row={moving} onClose={() => setMoving(null)}
        onMove={(args) => { updateCrm((c) => { moveStockGrade(c, { ...args, rowId: moving.id, actor: me || "" }); return c; }); setMoving(null); }} />}
      {returning && <ReturnModal crm={crm} onClose={() => setReturning(false)}
        onReturn={(args) => { updateCrm((c) => { customerReturn(c, { ...args, actor: me || "" }); return c; }); setReturning(false); }} />}

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
                  <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #e6e9ef", borderRadius: 8, marginTop: 12 }}>
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

const radio = (on) => (
  <span style={{ width: 15, height: 15, flex: "none", borderRadius: "50%", border: "2px solid " + (on ? NAVY : "#b8c0cc"), display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
    {on && <span style={{ width: 7, height: 7, borderRadius: "50%", background: NAVY }} />}
  </span>
);
const RadioRow = ({ on, onClick, label, hint, tone }) => (
  <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, cursor: "pointer", border: "1px solid " + (on ? NAVY : "#e6e9ef"), background: on ? "#eef1f6" : "#fff" }}>
    {radio(on)}
    <span style={{ fontWeight: 700, fontSize: 13, color: tone || NAVY }}>{label}</span>
    {hint && <span style={{ fontSize: 11.5, fontWeight: 600, color: "#8593a8" }}>{hint}</span>}
  </div>
);

// Move some of a stock row into a grade, back to good stock, or write it off
function MoveModal({ row, onClose, onMove }) {
  const stock = Number(row.stock) || 0;
  const cur = gradeOf(row);
  const options = [
    ...(row.grade ? [{ key: "", label: "Good stock", hint: "Checked and fine to sell at full price" }] : []),
    ...GRADES.filter((g) => g.key !== row.grade).map((g) => ({ ...g, tone: undefined })),
    { key: "writeoff", label: "Write off", hint: "Scrapped — out of stock, cost goes to the loss", tone: RED },
  ];
  const [to, setTo] = useState(options[0].key);
  const [qty, setQty] = useState(stock > 0 ? 1 : 0);
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState("");
  const q = Number(qty) || 0;
  const bad = q <= 0 || q > stock;
  return (
    <Modal title={"Move stock — " + row.name + (row.colour ? " · " + row.colour : "")} onClose={onClose} width={560}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5a6a85", marginBottom: 10 }}>
        {row.sku}{cur ? " · " + cur.label : " · good stock"} · {stock.toLocaleString("en-GB")} on hand
        {row.costGbp !== "" && row.costGbp !== null ? " · cost £" + Number(row.costGbp).toFixed(2) + "/pc" : ""}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10, alignItems: "end", marginBottom: 12 }}>
        <div>
          <span style={lbl}>How many</span>
          <input type="number" min="1" max={stock} style={{ ...inp, textAlign: "right", borderColor: bad ? RED : "#d5d9e0" }} value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div>
          <span style={lbl}>Why (optional)</span>
          <input style={inp} value={reason} placeholder="e.g. forklift damage, wrong colour returned, old batch" onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
      <span style={lbl}>Move to</span>
      <div style={{ display: "grid", gap: 6 }}>
        {options.map((o) => <RadioRow key={o.key || "good"} on={to === o.key} onClick={() => setTo(o.key)} label={o.label} hint={o.hint} tone={o.tone} />)}
      </div>
      {to && to !== "writeoff" && (
        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ width: 130 }}>
            <span style={lbl}>Sell at £ inc VAT</span>
            <input type="number" step="0.01" style={{ ...inp, textAlign: "right" }} value={price} placeholder="keep" onChange={(e) => setPrice(e.target.value)} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#8593a8", paddingBottom: 9 }}>
            {GRADES.find((g) => g.key === to).label} stock is its own line (SKU …-{GRADES.find((g) => g.key === to).suffix}) with its own price — pick it on an invoice like any product.
          </span>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button style={btn} onClick={onClose}>Cancel</button>
        <button style={{ ...goldBtn, opacity: bad ? 0.5 : 1, ...(to === "writeoff" ? { background: RED, color: "#fff", borderColor: RED } : {}) }} disabled={bad}
          onClick={() => onMove({ qty: q, to, reason: reason.trim(), priceIncVat: price })}>
          {to === "writeoff" ? "Write off " + q : "Move " + q}
        </button>
      </div>
    </Modal>
  );
}

// A customer brings something back: pick the job, the item and where it goes
function ReturnModal({ crm, onClose, onReturn }) {
  const [q, setQ] = useState("");
  const [invId, setInvId] = useState("");
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState(1);
  const [to, setTo] = useState("returned");
  const [reason, setReason] = useState("");
  const custName = (id) => ((crm.customers || []).find((c) => c.id === id) || {}).name || "";
  const ql = q.trim().toLowerCase().replace(/^#/, "");
  const invs = (crm.invoices || [])
    .filter((i) => !ql || String(i.invNo || "").includes(ql) || custName(i.customerId).toLowerCase().includes(ql))
    .slice(0, 8);
  const inv = (crm.invoices || []).find((i) => i.id === invId);
  // everything that went out on the job, kits as their parts, same SKU added together
  const items = (() => {
    if (!inv) return [];
    const m = new Map();
    explodeInvoiceLines(inv, crm).filter((r) => r.kind !== "kit" && r.sku && Number(r.qty) > 0).forEach((r) => {
      const k = r.sku.toLowerCase();
      if (m.has(k)) m.get(k).qty += Number(r.qty);
      else m.set(k, { ...r, qty: Number(r.qty) });
    });
    return [...m.values()];
  })();
  const item = items.find((r) => r.sku === sku);
  const known = (crm.masterProducts || []).some((m) => String(m.sku || "").toLowerCase() === baseSku(sku).toLowerCase());
  const n = Number(qty) || 0;
  const ok = inv && item && known && n > 0 && n <= Number(item.qty);
  return (
    <Modal title="Customer return" onClose={onClose} width={600}>
      {!inv ? (
        <>
          <span style={lbl}>Which job? (invoice number or customer)</span>
          <input autoFocus style={inp} value={q} placeholder="e.g. 4400 or Hartley" onChange={(e) => setQ(e.target.value)} />
          <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
            {invs.map((i) => (
              <div key={i.id} onClick={() => setInvId(i.id)} style={{ padding: "8px 10px", border: "1px solid #e6e9ef", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                <b>{"#" + (i.invNo || "—")}</b>{" · " + (custName(i.customerId) || "—") + (i.date ? " · " + prettyDate(i.date) : "")}
              </div>
            ))}
            {!invs.length && <div style={{ fontSize: 12.5, color: "#8593a8", fontWeight: 600 }}>No jobs match.</div>}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13, fontWeight: 700 }}>
            {"Job #" + (inv.invNo || "—") + " · " + (custName(inv.customerId) || "—")}
            <button style={{ ...abtn, fontSize: 11.5, padding: "2px 8px" }} onClick={() => { setInvId(""); setSku(""); }}>Change</button>
          </div>
          <span style={lbl}>What's coming back</span>
          <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {items.map((r) => <RadioRow key={r.sku} on={sku === r.sku} onClick={() => { setSku(r.sku); setQty(Math.min(Number(qty) || 1, Number(r.qty))); }}
              label={r.sku} hint={r.description + (r.colour ? " · " + r.colour : "") + " · " + r.qty + " on the job"} />)}
            {!items.length && <div style={{ fontSize: 12.5, color: "#8593a8", fontWeight: 600 }}>No stock items on this job.</div>}
          </div>
          {item && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10, alignItems: "end", margin: "12px 0" }}>
                <div>
                  <span style={lbl}>How many</span>
                  <input type="number" min="1" max={item.qty} style={{ ...inp, textAlign: "right" }} value={qty} onChange={(e) => setQty(e.target.value)} />
                </div>
                <div>
                  <span style={lbl}>Why (optional)</span>
                  <input style={inp} value={reason} placeholder="e.g. over-ordered, wrong colour, damaged in transit" onChange={(e) => setReason(e.target.value)} />
                </div>
              </div>
              <span style={lbl}>Put it into</span>
              <div style={{ display: "grid", gap: 6 }}>
                <RadioRow on={to === "returned"} onClick={() => setTo("returned")} label="Returned" hint="Check it over later" />
                <RadioRow on={to === ""} onClick={() => setTo("")} label="Good stock" hint="Unopened, fine to resell" />
                <RadioRow on={to === "damaged"} onClick={() => setTo("damaged")} label="Damaged" hint="Came back marked or broken" />
              </div>
              {!known && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: RED }}>That code isn't a stock product, so it can't go back into stock.</div>}
            </>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button style={btn} onClick={onClose}>Cancel</button>
            <button style={{ ...goldBtn, opacity: ok ? 1 : 0.5 }} disabled={!ok} onClick={() => onReturn({ invId, sku: baseSku(sku), qty: n, to, reason: reason.trim() })}>
              {"Take " + n + " back"}
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, margin: "10px 0 0" }}>
            Stock comes back at the cost the job carried. Refunds and credit notes are done on the invoice as usual.
          </p>
        </>
      )}
    </Modal>
  );
}
