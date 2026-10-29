// Line entry shared by invoices and quotes: SKU type-ahead fills description,
// colour and price from the products list; qty is a 1-100 dropdown (double-
// click to type any amount). `edit(fn)` mutates the record that owns `lines`.
import { useState, useMemo, useRef, useEffect } from "react";
import { RED, NAVY } from "../../lib/core.js";
import { blankLine, skuIndex, PRODUCT_SOURCES, skuSource, skuLists, skuOptionLabel, colourSeg } from "../../lib/crmCore.js";
import { Icon, SuggestInput, selectAllProps, inp, btn, abtn } from "./ui.jsx";

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
    label: skuOptionLabel(p) + (price ? " · " + price : ""),
    src,
    cells: [
      { text: readable || p.sku, style: { fontWeight: 800 } },
      { text: readable ? p.sku : "", style: { fontSize: 11.5, color: "#8593a8", fontWeight: 600, letterSpacing: 0.3 } },
      { text: p.name, style: { fontWeight: 600 } },
      { text: p.colour || "", style: { color: "#5a6a85", fontWeight: 600 } },
      { text: price, style: { textAlign: "right" } },
      { text: src, style: { fontSize: 10.5, fontWeight: 800, color: "#a86b12", textAlign: "center" } },
    ],
  };
};
const td = { padding: "6px 6px", borderBottom: "1px solid #f0f2f6" };

export default function LinesEditor({ doc, edit, crm, readOnly }) {
  const [freeQty, setFreeQty] = useState(new Set()); // lines typing a qty directly (double-clicked)
  const [src, setSrc] = useState(""); // offer only one source's codes (DK, TG …)

  const allSkuOpts = useMemo(
    () =>
      (crm.masterProducts || [])
        .filter((p) => p.active !== false && p.sku)
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

  const lineTotal = (l) => ((Number(l.qty) || 0) * (Number(l.price) || 0)).toLocaleString("en-GB", { minimumFractionDigits: 2 });

  return (
    <>
      {!readOnly && sources.length > 1 && (
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", marginRight: 4 }}>Stock from</span>
          {["", ...sources].map((k) => (
            <button key={k || "all"} onClick={() => setSrc(k)} title={k ? PRODUCT_SOURCES[k] || k : "Any source"}
              style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, cursor: "pointer", border: "1px solid " + (src === k ? NAVY : "#d5d9e0"), background: src === k ? NAVY : "#fff", color: src === k ? "#fff" : "#5a6a85" }}>
              {k || "All"}
            </button>
          ))}
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
          <thead>
            <tr>
              {["Code", "Qty", "Description", "Colour", "Price £ inc VAT", "Line £", ""].map((h, i) => (
                <th key={i} style={{ textAlign: i === 4 || i === 5 ? "right" : "left", fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 6px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {readOnly
              ? doc.lines.map((l) => (
                  <tr key={l.id}>
                    <td style={{ ...td, fontWeight: 700, padding: "9px 6px" }}>{l.code || "—"}{readableFor(bySku, l.code) && <div style={{ fontSize: 11, color: "#5a6a85" }}>{readableFor(bySku, l.code)}</div>}</td>
                    <td style={td}>{l.qty}</td>
                    <td style={td}>{l.description}</td>
                    <td style={td}>{l.colour}</td>
                    <td style={{ ...td, textAlign: "right" }}>{(Number(l.price) || 0).toFixed(2)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{lineTotal(l)}</td>
                    <td style={td} />
                  </tr>
                ))
              : doc.lines.map((l) => (
                  <tr key={l.id}>
                    <td style={{ ...td, width: 130 }}>
                      <SuggestInput value={l.code} options={skuOpts} listWidth={SKU_LIST_W} cols={SKU_COLS} inputStyle={{ fontWeight: 700, fontSize: 12.5 }} onChange={(v) => setLine(l.id, "code", v)} />
                      {readableFor(bySku, l.code) && <div style={{ fontSize: 11, fontWeight: 700, color: "#5a6a85", marginTop: 3, letterSpacing: 0.2 }}>{readableFor(bySku, l.code)}</div>}
                    </td>
                    <td style={{ ...td, width: 74 }}>
                      {Number(l.qty) > 100 || freeQty.has(l.id) ? (
                        <div style={{ position: "relative" }}>
                          <input style={{ ...numInp, paddingRight: 20 }} inputMode="decimal" autoFocus={freeQty.has(l.id)} value={l.qty} {...selectAllProps}
                            onChange={(e) => setLine(l.id, "qty", e.target.value)}
                            onBlur={(e) => {
                              const n = Number(e.target.value);
                              if (Number.isInteger(n) && n >= 1 && n <= 100)
                                setFreeQty((f) => { const x = new Set(f); x.delete(l.id); return x; });
                            }} />
                          <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#5a6a85", fontSize: 10 }}>▾</span>
                        </div>
                      ) : (
                        <select style={inp} title="Double-click to type a quantity" value={l.qty === "" || l.qty === null ? "" : String(l.qty)}
                          onDoubleClick={() => setFreeQty((f) => new Set(f).add(l.id))}
                          onChange={(e) => setLine(l.id, "qty", e.target.value === "" ? "" : Number(e.target.value))}>
                          <option value="">—</option>
                          {l.qty !== "" && l.qty !== null && !(Number.isInteger(Number(l.qty)) && Number(l.qty) >= 1 && Number(l.qty) <= 100) && (
                            <option value={String(l.qty)}>{String(l.qty)}</option>
                          )}
                          {Array.from({ length: 100 }, (_, i) => String(i + 1)).map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      )}
                    </td>
                    <td style={{ ...td, minWidth: 200 }}>
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
function ColourSelect({ line, crm, bySku, onPick }) {
  const [box, setBox] = useState(null); // where to draw the pop-out (it sits outside the scrolling table)
  const btnRef = useRef(null), popRef = useRef(null);
  useEffect(() => {
    if (!box) return;
    const off = (e) => !(btnRef.current && btnRef.current.contains(e.target)) && !(popRef.current && popRef.current.contains(e.target)) && setBox(null);
    const shut = () => setBox(null);
    document.addEventListener("mousedown", off);
    window.addEventListener("scroll", shut, true);
    return () => { document.removeEventListener("mousedown", off); window.removeEventListener("scroll", shut, true); };
  }, [box]);
  const mp = bySku[String(line.code || "").trim().toLowerCase()];
  const siblings = mp && mp.importProductId
    ? (crm.masterProducts || []).filter((m) => m.importProductId === mp.importProductId && m.active !== false && (m.colour || "").trim())
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
  };
  return (
    <>
      <button ref={btnRef} type="button" onClick={() => (box ? setBox(null) : open())}
        style={{ ...inp, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, borderColor: box ? NAVY : !line.colour && siblings.length > 1 ? "#E8912D" : "#d5d9e0" }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: line.colour ? undefined : "#8593a8" }}>{line.colour || "Colour"}</span>
        <span style={{ color: "#5a6a85", fontSize: 10 }}>▾</span>
      </button>
      {box && (
        <div ref={popRef} style={{ position: "fixed", zIndex: 1000, left: box.left, top: box.top, bottom: box.bottom, width: box.width, background: "#fff", border: "1px solid #d5d9e0", borderRadius: 10, boxShadow: "0 10px 30px rgba(11,31,63,.18)", padding: 8 }}>
          {siblings.length > 0 && <div style={{ fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "2px 6px 6px" }}>Colours for this product</div>}
          <div style={{ display: "grid", gridTemplateColumns: siblings.length ? "1fr" : "1fr 1fr", gap: "2px 8px", maxHeight: 280, overflowY: "auto" }}>
            {opts.map((o) => {
              const on = isOn(o);
              return (
                <label key={o.label + o.sku} onClick={() => { onPick(o.label, o.sku); setBox(null); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: on ? 700 : 500, color: on ? NAVY : "#3a4a63", background: on ? "#eef1f6" : "transparent" }}>
                  <span style={{ width: 15, height: 15, flex: "none", borderRadius: "50%", border: "2px solid " + (on ? NAVY : "#b8c0cc"), display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    {on && <span style={{ width: 7, height: 7, borderRadius: "50%", background: NAVY }} />}
                  </span>
                  {o.label}
                </label>
              );
            })}
          </div>
          {line.colour && (
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
