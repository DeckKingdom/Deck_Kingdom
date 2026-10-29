// Line entry shared by invoices and quotes: SKU type-ahead fills description,
// colour and price from the products list; qty is a 1-100 dropdown (double-
// click to type any amount). `edit(fn)` mutates the record that owns `lines`.
import { useState, useMemo } from "react";
import { RED, NAVY } from "../../lib/core.js";
import { blankLine, skuIndex, codeSource, PRODUCT_SOURCES } from "../../lib/crmCore.js";
import { Icon, SuggestInput, selectAllProps, inp, btn, abtn } from "./ui.jsx";

const numInp = { ...inp, textAlign: "right" };
const td = { padding: "6px 6px", borderBottom: "1px solid #f0f2f6" };

export default function LinesEditor({ doc, edit, crm, readOnly }) {
  const [freeQty, setFreeQty] = useState(new Set()); // lines typing a qty directly (double-clicked)
  const [src, setSrc] = useState(""); // offer only one source's codes (DK, TG …)

  const allSkuOpts = useMemo(
    () =>
      (crm.masterProducts || [])
        .filter((p) => p.active !== false && p.sku)
        .map((p) => ({
          value: p.sku,
          label: p.sku + " — " + p.name + (p.colour ? " · " + p.colour : "") + (p.priceIncVat !== "" && p.priceIncVat !== null ? " · £" + Number(p.priceIncVat).toFixed(2) : ""),
        })),
    [crm.masterProducts]
  );
  const sources = useMemo(() => {
    const n = {};
    allSkuOpts.forEach((o) => { const k = codeSource(o.value); if (PRODUCT_SOURCES[k]) n[k] = (n[k] || 0) + 1; });
    return Object.keys(PRODUCT_SOURCES).filter((k) => n[k]);
  }, [allSkuOpts]);
  const skuOpts = src ? allSkuOpts.filter((o) => codeSource(o.value) === src) : allSkuOpts;
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
            <button key={k || "all"} onClick={() => setSrc(k)} title={k ? PRODUCT_SOURCES[k] : "Any source"}
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
                    <td style={{ ...td, fontWeight: 700, padding: "9px 6px" }}>{l.code || "—"}</td>
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
                      <SuggestInput value={l.code} options={skuOpts} inputStyle={{ fontWeight: 700, fontSize: 12.5 }} onChange={(v) => setLine(l.id, "code", v)} />
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
                      <input style={inp} value={l.colour} {...selectAllProps} onChange={(e) => setLine(l.id, "colour", e.target.value)} />
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
