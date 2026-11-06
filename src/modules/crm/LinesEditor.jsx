// Line entry shared by invoices and quotes: SKU type-ahead fills description,
// colour and price from the products list; qty is a 1-100 dropdown (double-
// click to type any amount). `edit(fn)` mutates the record that owns `lines`.
import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { RED, NAVY } from "../../lib/core.js";
import { blankLine, skuIndex, PRODUCT_SOURCES, skuSource, skuLists, skuOptionLabel, colourSeg, gradeOf, isGrassRoll, sqmOf, sizeLabel,
  stockCheck, explodeInvoiceLines, partKey, isColPick, batchBreakdown, batchKeyForPick, buildPicks } from "../../lib/crmCore.js";
import { Icon, SuggestInput, selectAllProps, inp, btn, abtn, Chip } from "./ui.jsx";

const numInp = { ...inp, textAlign: "right" };

// SKU picker: a wide list with the familiar readable code first (DK/4.8/DECK/AWH)
export const SKU_COLS = "215px 100px minmax(220px,1fr) 120px 70px 30px";
export const SKU_LIST_W = 920;
export const readableFor = (bySku, code) => {
  const p = bySku[String(code || "").trim().toLowerCase()];
  return p && p.family && p.family.includes("/") && p.family !== p.sku ? p.family : "";
};
export const skuOption = (p, crm) => {
  const src = skuSource(p, skuLists(crm));
  const price = p.priceIncVat !== "" && p.priceIncVat !== null && p.priceIncVat !== undefined ? "£" + Number(p.priceIncVat).toFixed(2) : "";
  const readable = p.family && p.family.includes("/") && p.family !== p.sku ? p.family : "";
  return {
    value: p.sku,
    label: (readable ? readable + " · " : "") + skuOptionLabel(p) + (gradeOf(p) ? " · " + gradeOf(p).label : "") + (price ? " · " + price : ""),
    src,
    cells: [
      { text: readable || p.sku, style: { fontWeight: 800 } },
      { text: readable ? p.sku : "", style: { fontSize: 11.5, color: "#8593a8", fontWeight: 600, letterSpacing: 0.3 } },
      { text: (gradeOf(p) ? gradeOf(p).label.toUpperCase() + " · " + (Number(p.stock) || 0) + " left · " : "") + p.name, style: { fontWeight: 600, color: gradeOf(p) ? "#a05f10" : undefined } },
      { text: p.colour || "", style: { color: "#5a6a85", fontWeight: 600 } },
      { text: price, style: { textAlign: "right" } },
      { text: src, style: { fontSize: 10.5, fontWeight: 800, color: "#a86b12", textAlign: "center" } },
    ],
  };
};
const td = { padding: "6px 6px", borderBottom: "1px solid #f0f2f6" };

// grass rolls: length x width (m) under the description; filling both sets the qty to the m2
const sizeBox = { ...inp, width: 58, padding: "4px 6px", fontSize: 12.5, textAlign: "right" };
// ===== shared line cells (jobs, quotes, the schedule pop-over and collection notes all use these) =====
// Product code: type-ahead showing the readable code; a pick stores the SKU. Pencil opens the product.
export function CodeCell({ code, bySku, options, onCode, onOpenProduct, readOnly }) {
  const [draft, setDraft] = useState(undefined);
  const known = !code || !!bySku[String(code).trim().toLowerCase()];
  const mp = bySku[String(code || "").trim().toLowerCase()];
  const ok = mp && mp.importProductId;
  if (readOnly) return <b style={{ fontSize: 12.5 }}>{readableFor(bySku, code) || code || "—"}</b>;
  return (
    <>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SuggestInput options={options} listWidth={SKU_LIST_W} cols={SKU_COLS}
            value={draft !== undefined ? draft : readableFor(bySku, code) || code || ""}
            title={!known ? "Not a product code — pick it from the list so stock, cost and suppliers can be found" : undefined}
            inputStyle={{ fontWeight: 700, fontSize: 12.5, ...(!known ? { borderColor: "#E8912D", background: "#fff8e6" } : {}) }}
            onChange={(v) => {
              // a pick from the list (or a typed readable code) stores the SKU; anything else is kept as typed
              const t = String(v || "").trim().toLowerCase();
              const hit = bySku[t] ? bySku[t] : t ? Object.values(bySku).find((p) => p && p.family && p.family.toLowerCase() === t) : null;
              if (hit) { setDraft(undefined); onCode(hit.sku); } else { setDraft(v); onCode(v); }
            }} />
        </div>
        {onOpenProduct && (
          <button type="button" className="no-print" disabled={!ok}
            title={ok ? "Edit this product (name, colours, price, cost, weight…)" : "Not a product in the list — nothing to edit"}
            onClick={(e) => ok && onOpenProduct(mp.importProductId, e.currentTarget.getBoundingClientRect())}
            style={{ width: 24, height: 24, flex: "none", border: "none", background: "none", borderRadius: 6, padding: 0, cursor: ok ? "pointer" : "default", display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: ok ? 1 : 0.25 }}>
            <Icon name="pen" stroke="#185FA5" size={13} />
          </button>
        )}
      </div>
      {!known && <div style={{ fontSize: 10.5, fontWeight: 700, color: "#a05f10", marginTop: 3 }}>not a product code</div>}
    </>
  );
}

// Qty: a 1–100 drop-down; double-click (or anything over 100) to type any amount
export function QtyCell({ value, onChange, readOnly }) {
  const [free, setFree] = useState(false);
  if (readOnly) return <b>{value === "" || value === null ? "—" : value}</b>;
  const n = Number(value);
  if (n > 100 || free || (value !== "" && value !== null && !Number.isInteger(n))) {
    return (
      <div style={{ position: "relative" }}>
        <input style={{ ...numInp, paddingRight: 20 }} inputMode="decimal" autoFocus={free} value={value} {...selectAllProps}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => { const m = Number(e.target.value); if (Number.isInteger(m) && m >= 1 && m <= 100) setFree(false); }} />
        <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#5a6a85", fontSize: 10 }}>▾</span>
      </div>
    );
  }
  return (
    <select style={inp} title="Double-click to type a quantity" value={value === "" || value === null || value === undefined ? "" : String(value)}
      onDoubleClick={() => setFree(true)}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}>
      <option value="">—</option>
      {Array.from({ length: 100 }, (_, i) => String(i + 1)).map((k) => <option key={k} value={k}>{k}</option>)}
    </select>
  );
}

export function SizeRow({ line, onSize, inline, compact }) {
  const m2 = sqmOf(line.lenM, line.widM);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: inline ? 0 : 5, fontSize: 12, fontWeight: 700, color: "#5a6a85", flexWrap: inline ? "nowrap" : "wrap", whiteSpace: "nowrap", flex: "none" }}
      title="Roll size: length × width in metres — the qty becomes the square metres">
      {!compact && <span>L</span>}
      <input style={sizeBox} inputMode="decimal" placeholder="0.00" value={line.lenM ?? ""} {...selectAllProps} onChange={(e) => onSize("lenM", e.target.value)} />
      <span>{compact ? "×" : "m ×"}</span>
      {!compact && <span>W</span>}
      <input style={sizeBox} inputMode="decimal" placeholder="0.00" value={line.widM ?? ""} {...selectAllProps} onChange={(e) => onSize("widM", e.target.value)} />
      {!compact && <span>m</span>}
      {!compact && <span style={{ color: m2 ? NAVY : "#aab3c2" }}>= {m2 ? m2.toLocaleString("en-GB", { maximumFractionDigits: 2 }) + " m²" : "— m²"}</span>}
    </div>
  );
}
// set length or width on a line; with both filled the qty is the area
export const applySize = (line, k, v) => {
  line[k] = v === "" ? "" : v;
  const m2 = sqmOf(line.lenM, line.widM);
  if (m2) line.qty = m2;
};

// onOpenProduct(productId, rect): optional — a button by each code opens that product's record to edit
// fulfilment: optional { planner } — adds a second row under each line showing how it's being
// fulfilled: stock / short / coming on a collection, and the batch + picked tick for each pick
export default function LinesEditor({ doc, edit, crm, readOnly, toolbar, onOpenProduct, fulfilment }) {
  const [codeDraft, setCodeDraft] = useState({}); // what's being typed in a code box (shown instead of the readable code)
  const [freeQty, setFreeQty] = useState(new Set()); // lines typing a qty directly (double-clicked)
  const [src, setSrc] = useState(""); // offer only one source's codes (DK, TG …)

  const allSkuOpts = useMemo(
    () =>
      (crm.masterProducts || [])
        .filter((p) => p.active !== false && p.sku && !(p.grade && !(Number(p.stock) > 0))) // graded stock only while there's some
        .map((p) => skuOption(p, crm)),
    [crm.masterProducts, crm.skuLists]
  );
  const sources = useMemo(() => {
    const n = {};
    allSkuOpts.forEach((o) => { if (o.src) n[o.src] = (n[o.src] || 0) + 1; });
    return skuLists(crm).supplier.map((x) => x.key).filter((k) => n[k]);
  }, [allSkuOpts]);
  const skuOpts = src ? allSkuOpts.filter((o) => o.src === src) : allSkuOpts;
  const bySku = skuIndex(crm);
  // grass rolls get length x width (m) before the qty; the column only shows when a line needs it
  const needsSize = (l) => isGrassRoll(bySku[String(l.code || "").trim().toLowerCase()]) || !!sizeLabel(l);
  const sized = (doc.lines || []).some(needsSize);

  const setLine = (lid, k, v) =>
    edit((x) => {
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

  // ===== fulfilment row (second row under each line) =====
  const checks = useMemo(() => {
    if (!fulfilment) return {};
    const m = {};
    stockCheck(doc, crm).forEach((r) => (m[r.key] = r));
    return m;
  }, [fulfilment, doc, crm]);
  const ncols = 7 + (sized ? 1 : 0);
  const setPick = (pid, fn) => edit((x) => { const p = (x.picks || []).find((y) => y.id === pid); if (p) fn(p); });
  const fulfilRow = (l) => {
    if (!l.code && !l.description) return null;
    const planner = fulfilment.planner;
    const ships = (planner && planner.shipments) || [];
    const parts = explodeInvoiceLines({ lines: [l] }, crm).filter((r) => r.kind !== "kit");
    const picks = doc.picks || [];
    const done = !!doc.deliveryCompleted;
    return (
      <tr>
        <td colSpan={ncols} style={{ padding: "0 6px 8px", borderBottom: "1px solid #eef0f4" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, background: "#f8f9fb", border: "1px solid #eef1f6", borderRadius: 8, padding: "5px 9px" }}>
            {parts.map((pt, n) => {
              const key = partKey(pt.sku);
              const chk = checks[key];
              const mine = picks.filter((p) => partKey(p.sku) === key);
              const status = done ? <Chip tone="green" style={{ fontSize: 10.5, padding: "1px 8px" }}>delivered</Chip>
                : !chk || !bySku[String(pt.sku || "").trim().toLowerCase()] ? <Chip style={{ fontSize: 10.5, padding: "1px 8px" }} title="Pick the code from the list so stock can be checked">not a stock item</Chip>
                : chk.short > 0 ? <Chip tone="red" style={{ fontSize: 10.5, padding: "1px 8px" }} title={chk.free + " free in stock, " + chk.fromStock + " needed from stock"}>{chk.short} short</Chip>
                : chk.fromStock > 0 ? <Chip tone="green" style={{ fontSize: 10.5, padding: "1px 8px" }} title={chk.stock + " in stock · " + chk.free + " free after other jobs"}>in stock · {chk.free} free</Chip>
                : <Chip tone="blue" style={{ fontSize: 10.5, padding: "1px 8px" }}>on a collection</Chip>;
              return (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11.5, fontWeight: 600, color: "#5a6a85" }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", minWidth: 62 }}>{parts.length > 1 || pt.kind === "part" ? "Part" : "Fulfil"}</span>
                  {(parts.length > 1 || pt.kind === "part") && <b style={{ color: NAVY }} title={pt.description}>{pt.sku} ×{pt.qty}</b>}
                  {status}
                  {mine.length === 0 && !done && (
                    picks.length === 0 && !readOnly
                      ? <button type="button" onClick={() => edit((x) => (x.picks = buildPicks(x, crm)))} style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, color: "#185FA5", background: "none", border: "none", padding: 0, cursor: "pointer" }} title="Build the job's pick list so the warehouse can record batches">+ pick list</button>
                      : <span style={{ color: "#8593a8" }}>not on the pick list</span>
                  )}
                  {mine.map((p) => {
                    if (isColPick(p)) return (
                      <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <Chip tone="blue" style={{ fontSize: 10.5, padding: "1px 8px" }} title="Coming on (or collected by) this collection note">{String(p.batchRef).toUpperCase()} ×{p.qty}</Chip>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 3, cursor: "pointer" }} title="Picked and loaded">
                          <input type="checkbox" checked={!!p.picked} disabled={readOnly} onChange={(e) => setPick(p.id, (y) => (y.picked = e.target.checked))} />picked
                        </label>
                      </span>
                    );
                    const cur = batchKeyForPick(p, planner);
                    const bb = batchBreakdown(p.sku, crm, planner);
                    return (
                      <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        {mine.length > 1 && <b style={{ color: NAVY }}>×{p.qty}</b>}
                        <select value={cur} disabled={readOnly} title="Which batch this stock is coming from"
                          onChange={(e) => setPick(p.id, (y) => { const v = e.target.value; const sh = ships.find((x) => x.name === v); y.shipmentId = sh ? sh.id : ""; y.batchRef = sh ? "" : v; })}
                          style={{ ...inp, width: "auto", maxWidth: 230, padding: "2px 6px", fontSize: 11.5, borderColor: cur ? "#d5d9e0" : "#E8B13A", background: cur ? "#fff" : "#fff8e6" }}>
                          <option value="">— batch —</option>
                          {bb.filter((b) => b.left > 0 || b.ref === cur).map((b) => (
                            <option key={b.ref} value={b.ref}>{b.ref === "manual" ? "Stock (no batch)" : b.ref}{" · " + b.left + " left"}</option>
                          ))}
                          {cur && !bb.some((b) => b.ref === cur) && <option value={cur}>{cur}</option>}
                        </select>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 3, cursor: "pointer" }} title="Picked and loaded">
                          <input type="checkbox" checked={!!p.picked} disabled={readOnly} onChange={(e) => setPick(p.id, (y) => (y.picked = e.target.checked))} />picked
                        </label>
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </td>
      </tr>
    );
  };

  const lineTotal = (l) => ((Number(l.qty) || 0) * (Number(l.price) || 0)).toLocaleString("en-GB", { minimumFractionDigits: 2 });

  return (
    <>
      {/* every product is always offered (no "stock from" filter) */}
      {!readOnly && toolbar && (
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          <span style={{ flex: 1 }} /><span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>{toolbar}</span>
        </div>
      )}
      <div className="dk-bleed" style={{ overflowX: "auto" }}>
        <table className="dk-t" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
          <thead>
            <tr>
              {["Code", ...(sized ? ["Length × width (m)"] : []), "Qty", "Description", "Colour", "Price £ inc VAT", "Line £", ""].map((h, i, all) => (
                <th key={i} style={{ textAlign: h.startsWith("Price") || h === "Line £" ? "right" : "left", fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 6px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {readOnly
              ? doc.lines.map((l) => (
                  <tr key={l.id}>
                    <td style={{ ...td, fontWeight: 700, padding: "9px 6px" }}>{readableFor(bySku, l.code) || l.code || "—"}</td>
                    {sized && <td style={{ ...td, fontWeight: 700, color: "#5a6a85", whiteSpace: "nowrap" }}>{sizeLabel(l) || ""}</td>}
                    <td style={td}>{l.qty}</td>
                    <td style={td}>{l.description}</td>
                    <td style={td}>{l.colour}</td>
                    <td style={{ ...td, textAlign: "right" }}>{(Number(l.price) || 0).toFixed(2)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{lineTotal(l)}</td>
                    <td style={td} />
                  </tr>
                ))
              : doc.lines.map((l) => (
                  <Fragment key={l.id}>
                  <tr style={fulfilment ? { boxShadow: "inset 0 -1px 0 transparent" } : undefined}>
                    <td style={{ ...td, width: onOpenProduct ? 218 : 190 }}>
                      <CodeCell code={l.code} bySku={bySku} options={skuOpts} onOpenProduct={onOpenProduct} onCode={(v) => setLine(l.id, "code", v)} />
                    </td>
                    {sized && (
                      <td style={{ ...td, width: 150, whiteSpace: "nowrap" }}>
                        {needsSize(l) ? <SizeRow inline compact line={l} onSize={(k, v) => edit((x) => { const y = x.lines.find((z) => z.id === l.id); if (y) applySize(y, k, v); })} /> : null}
                      </td>
                    )}
                    <td style={{ ...td, width: 74 }}>
                      <QtyCell value={l.qty} onChange={(v) => setLine(l.id, "qty", v)} />
                    </td>
                    <td style={{ ...td, minWidth: 200 }}>
                      {/* grass rolls: length x width sit in line, to the right of the description */}
                      <input style={inp} value={l.description} {...selectAllProps} onChange={(e) => setLine(l.id, "description", e.target.value)} />
                    </td>
                    <td style={{ ...td, width: 130 }}>
                      <ColourSelect line={l} crm={crm} bySku={bySku} onPick={(colour, sku) => edit((x) => {
                        const y = x.lines.find((z) => z.id === l.id);
                        if (!y) return;
                        y.colour = colour;
                        if (sku) y.code = sku; // each colour has its own SKU, so the code follows the colour
                      })} />
                    </td>
                    <td style={{ ...td, width: 100 }}>
                      <input style={numInp} inputMode="decimal" value={l.price} {...selectAllProps} onChange={(e) => setLine(l.id, "price", e.target.value)} />
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, width: 90, whiteSpace: "nowrap" }}>{lineTotal(l)}</td>
                    <td style={{ ...td, padding: "6px 2px", width: 34, textAlign: "right" }}>
                      <button style={{ ...abtn, border: "none", color: RED }} title="Remove line"
                        onClick={() => edit((x) => (x.lines = x.lines.filter((y) => y.id !== l.id)))}>
                        <Icon name="x" stroke={RED} />
                      </button>
                    </td>
                  </tr>
                  {fulfilment && fulfilRow(l)}
                  </Fragment>
                ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <button style={{ ...btn, width: "100%", justifyContent: "center", borderStyle: "dashed", color: "#5a6a85", marginTop: 8 }}
          onClick={() => edit((x) => x.lines.push(blankLine()))}>
          <Icon name="plus" />Add line
        </button>
      )}
    </>
  );
}

// Colour for a line: a radio list in a pop-out. When the line's SKU is a known
// product it offers just that product's colours (and swaps the SKU to match);
// otherwise every colour on the colour list.
// onPickMany (samples): tick several colours; the first stays on this line, the caller adds a line per extra one
export function ColourSelect({ line, crm, bySku, onPick, onPickMany }) {
  const [box, setBox] = useState(null);
  const [ticked, setTicked] = useState([]);
  const tickRef = useRef({ list: [], dirty: false }); // where to draw the pop-out (it sits outside the scrolling table)
  const btnRef = useRef(null), popRef = useRef(null);
  useEffect(() => {
    if (!box) return;
    // clicking away keeps what was ticked (multi) rather than losing it
    const off = (e) => {
      if ((btnRef.current && btnRef.current.contains(e.target)) || (popRef.current && popRef.current.contains(e.target))) return;
      if (onPickMany && tickRef.current.dirty) onPickMany(tickRef.current.list);
      setBox(null);
    };
    const shut = () => setBox(null);
    document.addEventListener("mousedown", off);
    window.addEventListener("scroll", shut, true);
    return () => { document.removeEventListener("mousedown", off); window.removeEventListener("scroll", shut, true); };
  }, [box]);
  const mp = bySku[String(line.code || "").trim().toLowerCase()];
  const siblings = mp && mp.importProductId
    ? (crm.masterProducts || []).filter((m) => m.importProductId === mp.importProductId && m.active !== false && (m.colour || "").trim() && (m.grade || "") === (mp.grade || ""))
    : [];
  const lists = skuLists(crm);
  const opts = siblings.length
    ? siblings.map((m) => ({ label: m.colour, sku: m.sku }))
    : (lists.colour || []).filter((x) => x.code !== "00").map((x) => ({ label: x.label, sku: "" }));
  const curSeg = colourSeg(lists, line.colour);
  const isOn = (o) => String(o.label).toLowerCase() === String(line.colour || "").toLowerCase() || (!siblings.length && curSeg && colourSeg(lists, o.label) === curSeg);
  const open = () => {
    const r = btnRef.current.getBoundingClientRect();
    const w = siblings.length ? Math.max(r.width, 180) : 300;
    const below = window.innerHeight - r.bottom > 300;
    setBox({ left: Math.min(r.left, window.innerWidth - w - 8), top: below ? r.bottom + 4 : undefined, bottom: below ? undefined : window.innerHeight - r.top + 4, width: w });
    setTicked(line.colour ? [line.colour] : []);
    tickRef.current = { list: line.colour ? [line.colour] : [], dirty: false };
  };
  const multi = !!onPickMany;
  const setT = (list) => { tickRef.current = { list, dirty: true }; setTicked(list); };
  const tick = (label) => setT(ticked.some((x) => x.toLowerCase() === label.toLowerCase()) ? ticked.filter((x) => x.toLowerCase() !== label.toLowerCase()) : [...ticked, label]);
  const done = () => { onPickMany(ticked); tickRef.current.dirty = false; setBox(null); };
  return (
    <>
      <button ref={btnRef} type="button" onClick={() => (box ? setBox(null) : open())}
        style={{ ...inp, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, borderColor: box ? NAVY : !line.colour && siblings.length > 1 ? "#E8912D" : "#d5d9e0" }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: line.colour ? undefined : "#8593a8" }}>{line.colour || "Colour"}</span>
        <span style={{ color: "#5a6a85", fontSize: 10 }}>▾</span>
      </button>
      {box && (
        <div ref={popRef} style={{ position: "fixed", zIndex: 1000, left: box.left, top: box.top, bottom: box.bottom, width: box.width, background: "#fff", border: "1px solid #d5d9e0", borderRadius: 12, boxShadow: "0 10px 30px rgba(11,31,63,.18)", padding: 8 }}>
          {siblings.length > 0 && <div style={{ fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "2px 6px 6px" }}>Colours for this product</div>}
          <div style={{ display: "grid", gridTemplateColumns: siblings.length ? "1fr" : "1fr 1fr", gap: "2px 8px", maxHeight: 280, overflowY: "auto" }}>
            {opts.map((o) => {
              const on = multi ? ticked.some((x) => x.toLowerCase() === String(o.label).toLowerCase()) : isOn(o);
              return (
                <label key={o.label + o.sku} onClick={() => { if (multi) tick(o.label); else { onPick(o.label, o.sku); setBox(null); } }}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: on ? 700 : 500, color: on ? NAVY : "#3a4a63", background: on ? "#eef1f6" : "transparent" }}>
                  <span style={{ width: 15, height: 15, flex: "none", borderRadius: "50%", border: "2px solid " + (on ? NAVY : "#b8c0cc"), display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    {on && <span style={{ width: 7, height: 7, borderRadius: "50%", background: NAVY }} />}
                  </span>
                  {o.label}
                </label>
              );
            })}
          </div>
          {multi && (
            <div style={{ borderTop: "1px solid #eef0f4", marginTop: 6, paddingTop: 7, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "#8593a8", flex: 1 }}>
                {ticked.length > 1 ? ticked.length + " colours — a line each" : "Tick one or more"}
              </span>
              {ticked.length > 0 && <button type="button" onClick={() => setT([])} style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#8593a8", padding: "2px 4px" }}>Clear</button>}
              <button type="button" onClick={done} style={{ border: "none", borderRadius: 8, background: NAVY, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "5px 12px" }}>Done</button>
            </div>
          )}
          {!multi && line.colour && (
            <div style={{ borderTop: "1px solid #eef0f4", marginTop: 6, paddingTop: 6 }}>
              <button type="button" onClick={() => { onPick("", ""); setBox(null); }}
                style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#8593a8", padding: "2px 6px" }}>No colour</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
