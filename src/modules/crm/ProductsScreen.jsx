// Products: the catalogue, shown as master products (same length, category,
// sub-category and product) that open up to each supplier's version — with
// its code, prices, colours and the 12-digit SKU + stock for every colour.
// The two-digit lists behind the SKUs are edited from "SKU lists".
import React, { useState, useMemo } from "react";
import { NAVY, GOLD, RED, uid } from "../../lib/core.js";
import {
  kitWeight,
  skuLists, productSkuBase, masterKey, productsInList, colourSeg, numericSku, segLabel, cleanCode, codeSource,
  DEFAULT_SKU_LISTS, gbp, kitPartsFor,
} from "../../lib/crmCore.js";
import { Icon, Chip, Modal, lbl, card, inp, btn, goldBtn, abtn } from "./ui.jsx";

const sel = { ...inp, padding: "5px 6px", fontSize: 12.5 };
const numI = { ...inp, textAlign: "right", padding: "5px 7px", fontSize: 13 };
const sm = { ...inp, padding: "5px 7px", fontSize: 13 };
const SKU_PREVIEW = 5; // SKU chips shown before "+n more"
const segOpt = (x) => x.code + " · " + (x.key ? x.key + " — " : "") + x.label;

export default function ProductsScreen({ planner, update, crm, updateCrm, removeProduct, headerH = 0 }) {
  const lists = skuLists(crm);
  const [q, setQ] = useState("");
  const [src, setSrc] = useState("");
  const [open, setOpen] = useState(new Set());
  const [listsOpen, setListsOpen] = useState(false);
  const products = planner.products || [];

  const setP = (pid, field, value) =>
    update((d) => {
      const p = d.products.find((x) => x.id === pid);
      if (!p) return d;
      if (field === "colours") p.colours = String(value).split(",").map((c) => c.trim()).filter(Boolean);
      else if (["qty", "cost", "weight", "cbm", "salePrice", "costGbp"].includes(field)) p[field] = value === "" ? "" : Number(value);
      else if (field === "code") p.code = cleanCode(value);
      else p[field] = value;
      // changing category or sub-category clears a product pick that no longer fits
      if ((field === "segCat" || field === "segSub") && p.segProd && !productsInList(lists, p.segCat, p.segSub).some((x) => x.code === p.segProd)) p.segProd = "";
      if (field === "segCat" && !p.category) p.category = segLabel(lists.category, value);
      return d;
    });

  const rowsByProduct = useMemo(() => {
    const m = {};
    (crm.masterProducts || []).forEach((r) => (m[r.importProductId] = m[r.importProductId] || []).push(r));
    return m;
  }, [crm.masterProducts]);

  const supKey = (p) => segLabel(lists.supplier.map((x) => ({ code: x.code, label: x.key })), p.segSup) || codeSource(p.code) || "";

  // ===== group into master products =====
  const ql = q.trim().toLowerCase();
  const groups = useMemo(() => {
    const g = new Map();
    products.forEach((p) => {
      const k = masterKey(p) || "p:" + p.id;
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(p);
    });
    return [...g.entries()].map(([key, items]) => {
      const names = {};
      items.forEach((p) => (names[p.name] = (names[p.name] || 0) + 1));
      const name = Object.entries(names).sort((a, b) => b[1] - a[1])[0][0];
      const p0 = items[0];
      return { key, items, name, complete: !key.startsWith("p:"), p0 };
    });
  }, [products]);
  const shown = groups
    .filter((g) => !src || g.items.some((p) => supKey(p) === src))
    .filter((g) => !ql || g.items.some((p) => [p.code, p.name, p.supplier, (p.colours || []).join(" "), productSkuBase(p)].some((v) => String(v || "").toLowerCase().includes(ql))))
    .sort((a, b) =>
      (a.complete ? 1 : 0) - (b.complete ? 1 : 0) ||
      (a.p0.segCat || "99").localeCompare(b.p0.segCat || "99") || (a.p0.segSub || "99").localeCompare(b.p0.segSub || "99") ||
      (a.p0.segProd || "99").localeCompare(b.p0.segProd || "99") || (a.p0.segLen || "99").localeCompare(b.p0.segLen || "99") ||
      a.name.localeCompare(b.name)
    );
  const incomplete = groups.filter((g) => !g.complete).length;
  const srcCounts = {};
  products.forEach((p) => { const k = supKey(p); if (k) srcCounts[k] = (srcCounts[k] || 0) + 1; });

  const [shownBits, setShownBits] = useState(new Set()); // "groupKey|fields" / "groupKey|skus" shown
  const toggleBit = (k) => setShownBits((o) => { const x = new Set(o); x.has(k) ? x.delete(k) : x.add(k); return x; });
  const toggle = (k) => setOpen((o) => { const x = new Set(o); x.has(k) ? x.delete(k) : x.add(k); return x; });
  const addProduct = () => {
    const id = uid();
    const sup = src ? lists.supplier.find((x) => x.key === src) : null;
    update((d) => {
      d.products.unshift({ id, code: src ? src + "/" : "", name: "", colours: [], qty: 0, cost: 0, weight: 0, cbm: 0, supplier: "", category: "", salePrice: "", costGbp: "", segSup: sup ? sup.code : "", segLen: "", segCat: "", segSub: "", segProd: "" });
      return d;
    });
    setOpen((o) => new Set(o).add("p:" + id));
  };
  // picking a supplier code also gives the version its readable prefix (TG/…) and "bought from"
  const applySupplier = (p, code) => {
    const sup = lists.supplier.find((x) => x.code === code);
    if (!sup) return;
    p.segSup = code;
    const parts = cleanCode(p.code || "").split("/").filter(Boolean);
    if (sup.key && parts.length) { parts[0] = sup.key; p.code = cleanCode(parts.join("/")); }
    else if (sup.key && !parts.length) p.code = sup.key + "/";
    if (!p.isKit && sup.key !== "DK" && (!p.supplier || lists.supplier.some((x) => x.code !== code && supplierName(x) === p.supplier))) p.supplier = supplierName(sup);
  };
  const setSupplier = (pid, code) =>
    update((d) => {
      const p = d.products.find((x) => x.id === pid);
      if (p) applySupplier(p, code);
      return d;
    });
  const addVersion = (g, code) => {
    const id = uid();
    const p0 = g.p0;
    update((d) => {
      const i = d.products.findIndex((x) => x.id === g.items[g.items.length - 1].id);
      const v = { id, code: p0.code || "", name: g.name, colours: [...(p0.colours || [])], qty: 0, cost: 0, weight: 0, cbm: 0, supplier: "", category: p0.category || "", salePrice: p0.salePrice || "", costGbp: "", segSup: "", segLen: p0.segLen, segCat: p0.segCat, segSub: p0.segSub, segProd: p0.segProd };
      applySupplier(v, code);
      d.products.splice(i + 1, 0, v);
      return d;
    });
  };
  // length / category / sub-category / product belong to the master product: set once, every version follows
  const setGroup = (g, field, value) => {
    update((d) => {
      g.items.forEach((it) => {
        const p = d.products.find((x) => x.id === it.id);
        if (!p) return;
        p[field] = value;
        if ((field === "segCat" || field === "segSub") && p.segProd && !productsInList(lists, p.segCat, p.segSub).some((x) => x.code === p.segProd)) p.segProd = "";
        if (field === "segCat" && !p.category) p.category = segLabel(lists.category, value);
      });
      return d;
    });
    const next = masterKey({ ...g.p0, [field]: value });
    if (next) setOpen((o) => new Set(o).add(next)); // stay open under its new key
  };

  const th = { textAlign: "left", fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap", background: "#fff", position: "sticky", top: 0, zIndex: 2 };
  const td = { padding: "9px 8px", borderBottom: "1px solid #f0f2f6", verticalAlign: "middle" };

  return (
    <div style={{ padding: "18px 22px", maxWidth: 1500, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10, position: "sticky", top: headerH, zIndex: 16, background: "#f3f5f8", padding: "8px 0" }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Products</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, SKU, colour…" style={{ ...inp, width: 240, maxWidth: "100%" }} />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {["", ...lists.supplier.map((x) => x.key).filter((k) => srcCounts[k])].map((k) => (
            <button key={k || "all"} onClick={() => setSrc(k)}
              style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "6px 11px", borderRadius: 999, cursor: "pointer", border: "1px solid " + (src === k ? NAVY : "#d5d9e0"), background: src === k ? NAVY : "#fff", color: src === k ? "#fff" : "#5a6a85" }}>
              {k || "All"}{k ? " · " + srcCounts[k] : " · " + products.length}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <button style={btn} onClick={() => setListsOpen(true)} title="The two-digit lists the SKUs are built from"><Icon name="gear" />SKU lists</button>
        <button style={goldBtn} onClick={addProduct}><Icon name="plus" stroke={NAVY} />New product</button>
      </div>

      {incomplete > 0 && (
        <div style={{ ...card, borderColor: "#f0d0a8", background: "#fff8e6", padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#6b5305" }}>
          {incomplete} product{incomplete === 1 ? "" : "s"} still need their SKU fields (supplier, length, category, sub-category, product) — they're listed first. Their stock keeps its readable code until then.
        </div>
      )}

      <div style={{ ...card, padding: "0 6px 6px", overflow: "auto", maxHeight: "max(360px, calc(100vh - " + (headerH + 170) + "px))" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000, fontSize: 13 }}>
          <thead>
            <tr>
              {["Master product", "Category", "Length", "Suppliers", "Colours", "Stock", "Retail £", "SKUs"].map((h, i) => (
                <th key={h} style={{ ...th, textAlign: i >= 4 ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((g) => {
              const isOpen = open.has(g.key);
              const skuRows = g.items.flatMap((p) => rowsByProduct[p.id] || []);
              const stock = skuRows.reduce((t, r) => t + (Number(r.stock) || 0), 0);
              const prices = g.items.map((p) => Number(p.salePrice)).filter((n) => n > 0);
              const colours = new Set(g.items.flatMap((p) => (p.colours || []).map((c) => c.toLowerCase())));
              const p0 = g.p0;
              return (
                <React.Fragment key={g.key}>
                  <tr onClick={() => toggle(g.key)} style={{ cursor: "pointer", background: isOpen ? "#f3f6fb" : g.complete ? undefined : "#fff8e6" }}>
                    <td style={{ ...td, fontWeight: 700 }}>
                      <span style={{ fontSize: 10, color: "#5a6a85", marginRight: 8 }}>{isOpen ? "▼" : "▶"}</span>
                      {g.name || <span style={{ color: "#aab3c2" }}>New product</span>}
                      <label onClick={(e) => e.stopPropagation()} title="A kit is sold as one line but loaded and taken out of stock as its parts"
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, marginLeft: 10, fontSize: 11, fontWeight: 700, padding: "1px 8px 1px 5px", borderRadius: 999, cursor: "pointer", verticalAlign: "middle",
                          border: "1px solid " + (g.items.some((p) => p.isKit) ? "#e9c46a" : "#dde2ea"), background: g.items.some((p) => p.isKit) ? "#fdf3dc" : "#fff", color: g.items.some((p) => p.isKit) ? "#8a5a00" : "#8593a8" }}>
                        <input type="checkbox" style={{ margin: 0, width: 13, height: 13 }} checked={g.items.some((p) => p.isKit === true)} onChange={(e) => setGroup(g, "isKit", e.target.checked)} />
                        KIT
                      </label>
                      {!g.complete && <Chip tone="amber" style={{ marginLeft: 8, fontSize: 10, padding: "1px 7px" }}>SKU fields needed</Chip>}
                    </td>
                    <td style={{ ...td, color: "#5a6a85", fontWeight: 600 }}>{[segLabel(lists.category, p0.segCat), segLabel(lists.sub, p0.segSub)].filter((x) => x && x !== "N/a").join(" › ") || "—"}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{segLabel(lists.length, p0.segLen) || "—"}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {g.items.map((p) => (
                          <Chip key={p.id} tone={supKey(p) === "DK" ? "gold" : "grey"} style={{ fontSize: 10.5, padding: "1px 8px" }}>{supKey(p) || "?"}</Chip>
                        ))}
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>{colours.size || "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: stock ? NAVY : "#aab3c2" }}>{stock ? stock.toLocaleString("en-GB") : "—"}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {prices.length ? (Math.min(...prices) === Math.max(...prices) ? Math.min(...prices).toFixed(2) : Math.min(...prices).toFixed(2) + "–" + Math.max(...prices).toFixed(2)) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right", color: "#5a6a85" }}>{skuRows.length || "—"}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={8} style={{ padding: "8px 10px 14px 26px", background: "#f8f9fb", borderBottom: "1px solid #e6e9ef" }}>
                        {g.complete && (
                          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                            {[["fields", "SKU fields"], ["skus", "SKUs"]].map(([k, label]) => {
                              const on = shownBits.has(g.key + "|" + k);
                              return (
                                <button key={k} type="button" onClick={() => toggleBit(g.key + "|" + k)}
                                  style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 999, cursor: "pointer", border: "1px solid " + (on ? NAVY : "#d5d9e0"), background: on ? NAVY : "#fff", color: on ? "#fff" : "#5a6a85" }}>
                                  {(on ? "Hide " : "Show ") + label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {g.complete && shownBits.has(g.key + "|fields") && <MasterBar g={g} lists={lists} setGroup={setGroup} />}
                        {g.items.map((p) => (
                          <Version key={p.id} p={p} lists={lists} rows={(rowsByProduct[p.id] || []).filter((r) => r.active !== false)} rowsByProduct={rowsByProduct} products={products} setP={setP} removeProduct={removeProduct} supKey={supKey(p)}
                            shared={g.complete} showSkus={!g.complete || shownBits.has(g.key + "|skus")} setSupplier={setSupplier} usedSup={g.items.filter((x) => x.id !== p.id).map((x) => x.segSup)} />
                        ))}
                        {g.complete && (
                          <RadioPick
                            options={lists.supplier.map((x) => ({ value: x.code, label: x.code + " · " + x.key + " — " + x.label, disabled: g.items.some((it) => it.segSup === x.code), note: g.items.some((it) => it.segSup === x.code) ? "added" : "" }))}
                            onPick={(code) => addVersion(g, code)} width={340}
                            button={(openIt) => (
                              <button style={{ ...btn, padding: "6px 12px", fontSize: 12.5, borderStyle: "dashed" }} onClick={openIt}>
                                <Icon name="plus" stroke={NAVY} />Add another supplier's version
                              </button>
                            )} />
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {!shown.length && (
              <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "#8593a8", padding: 24 }}>No products match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12.5, color: "#5a6a85" }}>
        A <b>master product</b> is everything with the same length, category, sub-category and product — open it to see each supplier's version.
        Every version + colour is a stock row with a 12-digit <b>SKU</b> (supplier · length · category · sub-category · product · colour) and its readable code beside it.
        Change a field and the SKU is rebuilt; stock, history and existing invoices move with it.
      </p>

      <datalist id="dk-suppliers">
        {[...new Set([...products.map((x) => (x.supplier || "").trim()), ...(crm.suppliers || []).filter((x) => x.active !== false).map((x) => x.name)].filter(Boolean))].sort().map((x) => <option key={x} value={x} />)}
      </datalist>
      {listsOpen && <ListsEditor lists={lists} custom={Boolean(crm.skuLists)} onClose={() => setListsOpen(false)}
        onSave={(l) => { updateCrm((c) => { c.skuLists = l; return c; }); setListsOpen(false); }} />}
    </div>
  );
}

// a kit's cost is its parts: each part's stock cost (average over its colours), else its UK cost
function kitCostFromParts(p, products, rowsByProduct) {
  let total = 0, any = false;
  for (const k of p.kit || []) {
    const part = products.find((x) => x.id === k.productId);
    if (!part) continue;
    const costs = (rowsByProduct[part.id] || []).map((r) => r.costGbp).filter((v) => v !== "" && v !== null && v !== undefined && !isNaN(Number(v))).map(Number);
    const each = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : part.costGbp !== "" && part.costGbp != null ? Number(part.costGbp) : null;
    if (each === null) continue;
    total += each * (Number(k.qty) || 0); any = true;
  }
  return any ? total : null;
}

// the name a supplier code stands for, as "bought from" ("Tuda Grass", not "Easy Composite (Chinese Lee)")
const supplierName = (x) => String((x && x.label) || "").replace(/\s*\(.*\)\s*/, "").trim();

// one-pick radio list in a pop-out; `button(open)` draws whatever opens it
function RadioPick({ value, options, onPick, button, width = 300 }) {
  const [box, setBox] = useState(null); // fixed to the screen so the scrolling table can't clip it
  const ref = React.useRef(null), pop = React.useRef(null);
  React.useEffect(() => {
    if (!box) return;
    const off = (e) => !(ref.current && ref.current.contains(e.target)) && !(pop.current && pop.current.contains(e.target)) && setBox(null);
    const shut = (e) => !(pop.current && pop.current.contains(e.target)) && setBox(null);
    document.addEventListener("mousedown", off);
    window.addEventListener("scroll", shut, true);
    return () => { document.removeEventListener("mousedown", off); window.removeEventListener("scroll", shut, true); };
  }, [box]);
  const toggle = () => {
    if (box) return setBox(null);
    const r = ref.current.getBoundingClientRect();
    const h = Math.min(options.length * 33 + 14, 320);
    const below = window.innerHeight - r.bottom > h + 8 || r.top < h + 8;
    setBox({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: below ? r.bottom + 4 : r.top - h - 4, h });
  };
  return (
    <div ref={ref} style={{ display: "inline-block", width: "100%" }}>
      {button(toggle)}
      {box && (
        <div ref={pop} style={{ position: "fixed", zIndex: 1000, left: box.left, top: box.top, width, maxHeight: box.h, overflowY: "auto", background: "#fff", border: "1px solid #d5d9e0", borderRadius: 10, boxShadow: "0 10px 30px rgba(11,31,63,.18)", padding: 6 }}>
          {options.map((o) => {
            const on = o.value === value;
            return (
              <div key={o.value} onClick={() => { if (o.disabled && !on) return; onPick(o.value); setBox(null); }}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 6, fontSize: 13, cursor: o.disabled && !on ? "default" : "pointer",
                  fontWeight: on ? 700 : 500, color: o.disabled && !on ? "#aab3c2" : on ? NAVY : "#3a4a63", background: on ? "#eef1f6" : "transparent" }}>
                <span style={{ width: 15, height: 15, flex: "none", borderRadius: "50%", border: "2px solid " + (on ? NAVY : o.disabled ? "#dde2ea" : "#b8c0cc"), display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  {on && <span style={{ width: 7, height: 7, borderRadius: "50%", background: NAVY }} />}
                </span>
                <span style={{ flex: 1 }}>{o.label}</span>
                {o.note && !on && <span style={{ fontSize: 11, fontWeight: 600 }}>{o.note}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// length · category · sub-category · product, set once for the master product
function MasterBar({ g, lists, setGroup }) {
  const p = g.p0;
  const prodList = productsInList(lists, p.segCat, p.segSub);
  const pick = (field, list, label, disabled) => (
    <div style={{ minWidth: 0 }}>
      <span style={{ ...lbl, fontSize: 10 }}>{label}</span>
      <select style={sel} value={p[field] || ""} disabled={disabled} onChange={(e) => setGroup(g, field, e.target.value)}>
        <option value="">—</option>
        {p[field] && !list.some((x) => x.code === p[field]) && <option value={p[field]}>{p[field]} (not in list)</option>}
        {list.map((x) => <option key={x.code} value={x.code}>{segOpt(x)}</option>)}
      </select>
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 140px 160px minmax(200px,1fr) auto", gap: 8, alignItems: "end", padding: "4px 2px 12px" }}>
      {pick("segLen", lists.length, "Length")}
      {pick("segCat", lists.category, "Category")}
      {pick("segSub", lists.sub, "Sub-category")}
      {pick("segProd", prodList, "Product", !p.segCat || !p.segSub)}
      <span style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, paddingBottom: 7 }}>
        {"Applies to all " + g.items.length + " supplier version" + (g.items.length === 1 ? "" : "s") + " below"}
      </span>
    </div>
  );
}

// ===== colours: chosen ones as chips, add more from the colour list =====
function ColourPicker({ p, lists, unknown, onChange }) {
  const cur = p.colours || [];
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const off = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  // colours match the list by number, so "Black" ticks "Black/Charcoal" through its aliases
  const segOf = (c) => colourSeg(lists, c);
  const has = new Set(cur.map(segOf).filter(Boolean));
  // chosen colours sit at the top when the panel opens, the rest in list order
  const [order, setOrder] = useState([]);
  React.useEffect(() => { if (open) setOrder(cur.map(segOf).filter(Boolean)); }, [open]);
  const all = (lists.colour || []).filter((x) => x.code !== "00");
  const opts = [...all.filter((x) => order.includes(x.code)), ...all.filter((x) => !order.includes(x.code))];
  const toggle = (x) => onChange(has.has(x.code) ? cur.filter((c) => segOf(c) !== x.code) : [...cur, x.label]);
  const dropUnknown = (c) => onChange(cur.filter((y) => y !== c));
  const dot = (on) => (
    <span style={{ width: 15, height: 15, flex: "none", borderRadius: "50%", border: "2px solid " + (on ? NAVY : "#b8c0cc"), display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {on && <span style={{ width: 7, height: 7, borderRadius: "50%", background: NAVY }} />}
    </span>
  );
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ ...sm, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, borderColor: unknown.length ? RED : open ? NAVY : "#d5d9e0" }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: cur.length ? 700 : 400, color: cur.length ? NAVY : "#8593a8" }}>
          {cur.length ? cur.join(", ") : "No colour — one stock row"}
        </span>
        <span style={{ color: "#5a6a85", fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", zIndex: 30, top: "calc(100% + 4px)", left: 0, width: 300, background: "#fff", border: "1px solid #d5d9e0", borderRadius: 10, boxShadow: "0 10px 30px rgba(11,31,63,.18)", padding: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 8px", maxHeight: 260, overflowY: "auto" }}>
            {opts.map((x) => {
              const on = has.has(x.code);
              return (
                <label key={x.code} onClick={() => toggle(x)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: on ? 700 : 500, color: on ? NAVY : "#3a4a63", background: on ? "#eef1f6" : "transparent" }}>
                  {dot(on)}{x.label}
                </label>
              );
            })}
            {unknown.map((c) => (
              <label key={"u" + c} onClick={() => dropUnknown(c)} title="Not in the colour list — add it under SKU lists"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: RED, background: "#fdecef" }}>
                {dot(true)}{c}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: "1px solid #eef0f4" }}>
            <button type="button" onClick={() => onChange([])} style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#8593a8" }}>Clear</button>
            <button type="button" onClick={() => setOpen(false)} style={{ ...goldBtn, padding: "5px 14px", fontSize: 12.5 }}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== one supplier's version of a master product =====
function Version({ p, lists, rows, rowsByProduct, products, setP, removeProduct, supKey, shared, showSkus = true, setSupplier, usedSup = [] }) {
  const base = productSkuBase(p);
  const prodList = productsInList(lists, p.segCat, p.segSub);
  const isImport = supKey === "DK" || (!supKey && (!p.code || codeSource(p.code) === "DK"));
  const segSelect = (field, list, label, disabled) => (
    <div style={{ minWidth: 0 }}>
      <span style={{ ...lbl, fontSize: 10 }}>{label}</span>
      <select style={{ ...sel, borderColor: p[field] ? "#d5d9e0" : "#E8912D" }} value={p[field] || ""} disabled={disabled}
        onChange={(e) => setP(p.id, field, e.target.value)}>
        <option value="">—</option>
        {p[field] && !list.some((x) => x.code === p[field]) && <option value={p[field]}>{p[field]} (not in list)</option>}
        {list.map((x) => <option key={x.code} value={x.code}>{segOpt(x)}</option>)}
      </select>
    </div>
  );
  const [costsOpen, setCostsOpen] = useState(false);
  const [skusOpen, setSkusOpen] = useState(false);
  const money = (v) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
  const kitCost = p.isKit ? kitCostFromParts(p, products, rowsByProduct) : null;
  const costs = rows.map((r) => money(r.costGbp)).filter((v) => v !== null && v > 0);
  const stockCost = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null;
  const unitCost = p.isKit ? kitCost : isImport ? stockCost : money(p.costGbp);
  const retailEx = money(p.salePrice) ? money(p.salePrice) / 1.2 : null;
  const margin = unitCost !== null && retailEx ? "£" + (retailEx - unitCost).toFixed(2) + " · " + Math.round(((retailEx - unitCost) / retailEx) * 100) + "%" : "—";
  const costSummary = p.isKit ? (kitCost === null ? "Parts —" : "Parts £" + kitCost.toFixed(2))
    : isImport ? (money(p.cost) ? "$" + Number(p.cost).toFixed(2) + " import" : "Import costs")
    : money(p.costGbp) !== null ? "£" + Number(p.costGbp).toFixed(2) + " cost" : "Add cost";
  const ro = (label, value, title) => (
    <div title={title} style={{ width: 110 }}>
      <span style={{ ...lbl, fontSize: 10 }}>{label}</span>
      <input style={{ ...numI, background: "#eef1f6", color: "#3a4a63", fontWeight: 700 }} disabled value={value} />
    </div>
  );
  const num = (label, field) => (
    <div style={{ width: 96 }}>
      <span style={{ ...lbl, fontSize: 10 }}>{label}</span>
      <input type="number" style={numI} value={p[field] === undefined || p[field] === null ? "" : p[field]} onChange={(e) => setP(p.id, field, e.target.value)} />
    </div>
  );
  const unknownColours = (p.colours || []).filter((c) => colourSeg(lists, c) === null);
  const sameCode = (() => {
    const seen = {}, out = [];
    (p.colours || []).forEach((c) => { const k = colourSeg(lists, c); if (k && k !== "00") { if (seen[k]) out.push(seen[k] + " & " + c); else seen[k] = c; } });
    return out;
  })();
  return (
    <div style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "110px 150px minmax(220px,2fr) 160px minmax(180px,1.4fr) 130px 90px 34px", gap: 8, alignItems: "end" }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ ...lbl, fontSize: 10 }}>Supplier code</span>
          <RadioPick value={p.segSup} width={340}
            options={lists.supplier.map((x) => ({ value: x.code, label: x.code + " · " + x.key + " — " + x.label, disabled: usedSup.includes(x.code), note: usedSup.includes(x.code) ? "has a version" : "" }))}
            onPick={(code) => setSupplier(p.id, code)}
            button={(openIt) => {
              const cur = lists.supplier.find((x) => x.code === p.segSup);
              return (
                <button type="button" onClick={openIt} style={{ ...sel, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, borderColor: p.segSup ? "#d5d9e0" : "#E8912D", fontWeight: 700, color: cur ? NAVY : "#8593a8" }}>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cur ? cur.code + " · " + cur.key : "Pick…"}</span>
                  <span style={{ color: "#5a6a85", fontSize: 10 }}>▾</span>
                </button>
              );
            }} />
        </div>
        <div>
          <span style={{ ...lbl, fontSize: 10 }}>Readable code</span>
          <input key={"c" + p.id + (p.code || "")} defaultValue={p.code || ""} style={{ ...sm, fontWeight: 700, textTransform: "uppercase" }} placeholder="TG/3.6/DECK"
            onBlur={(e) => cleanCode(e.target.value) !== cleanCode(p.code) && setP(p.id, "code", e.target.value)} />
        </div>
        <div>
          <span style={{ ...lbl, fontSize: 10 }}>Description</span>
          <input style={sm} value={p.name} placeholder="Product, spec, size" onChange={(e) => setP(p.id, "name", e.target.value)} />
        </div>
        <div>
          <span style={{ ...lbl, fontSize: 10 }}>Bought from</span>
          {p.isKit
            ? <input style={{ ...sm, background: "#f4f6f9", color: "#8593a8" }} value="Made up from parts" disabled title="Kits aren't bought — their parts are" />
            : <input style={sm} value={p.supplier || ""} list="dk-suppliers" onChange={(e) => setP(p.id, "supplier", e.target.value)} />}
        </div>
        <div>
          <span style={{ ...lbl, fontSize: 10 }}>Colours</span>
          <ColourPicker p={p} lists={lists} unknown={unknownColours} onChange={(cols) => setP(p.id, "colours", cols.join(", "))} />
        </div>
        <div>
          <span style={{ ...lbl, fontSize: 10 }}>Costs</span>
          <button type="button" onClick={() => setCostsOpen((o) => !o)}
            style={{ ...sm, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontWeight: 700, color: NAVY, borderColor: costsOpen ? NAVY : "#d5d9e0", background: costsOpen ? "#eef1f6" : "#fff" }}>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{costSummary}</span>
            <span style={{ color: "#5a6a85", fontSize: 10 }}>{costsOpen ? "▴" : "▾"}</span>
          </button>
        </div>
        <div>
          <span style={{ ...lbl, fontSize: 10 }}>Retail £ inc</span>
          <input type="number" style={numI} value={p.salePrice === undefined || p.salePrice === null ? "" : p.salePrice} onChange={(e) => setP(p.id, "salePrice", e.target.value)} />
        </div>
        <button style={{ ...abtn, color: RED, border: "none" }} title="Remove this version" onClick={() => removeProduct(p.id)}><Icon name="x" stroke={RED} /></button>
      </div>

      {!shared && (
        <div style={{ display: "grid", gridTemplateColumns: "110px 130px 150px minmax(200px,1fr)", gap: 8, alignItems: "end", marginTop: 8 }}>
          {segSelect("segLen", lists.length, "Length")}
          {segSelect("segCat", lists.category, "Category")}
          {segSelect("segSub", lists.sub, "Sub-category")}
          {segSelect("segProd", prodList, "Product", !p.segCat || !p.segSub)}
        </div>
      )}

      {costsOpen && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginTop: 8, padding: "10px 12px", background: "#f6f8fb", border: "1px solid #e6e9ef", borderRadius: 8 }}>
          {p.isKit ? (
            <>
              {ro("Parts cost £", kitCost === null ? "—" : kitCost.toFixed(2), "Worked out from the parts' costs")}
              {ro("Kit weight kg", (() => { const w = kitWeight(p, products); return w ? String(w) : "—"; })(), "Parts' kg / pc × qty — used on the loading bill")}
            </>
          ) : isImport ? (
            <>
              {num("Import $ / pc", "cost")}
              {num("Qty / plt", "qty")}
              {num("kg / pc", "weight")}
              {num("m³ / plt", "cbm")}
              {ro("Landed £ / pc", stockCost === null ? "—" : stockCost.toFixed(2), "From the shipments this stock came in on")}
            </>
          ) : (
            <>
              {num("UK cost £", "costGbp")}
              {num("kg / pc", "weight")}
            </>
          )}
          {ro("Margin", margin, "Retail ex VAT less cost")}
          <span style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, paddingBottom: 7 }}>
            {p.isKit ? "A kit costs what its parts cost." : isImport ? "Imported — cost comes from the shipment's landed cost, not a UK price." : "Bought in the UK at this price."}
          </span>
        </div>
      )}

      {(showSkus || sameCode.length > 0 || unknownColours.length > 0) && (
      <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: skusOpen ? "wrap" : "nowrap", overflow: skusOpen ? undefined : "hidden", alignItems: "center" }}>
        {showSkus && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", marginRight: 4, whiteSpace: "nowrap" }}>
          SKUs {base ? <span style={{ color: NAVY, letterSpacing: 1 }}>{base.replace(/(\d\d)(?=\d)/g, "$1 ")} ··</span> : <span style={{ color: "#a05f10" }}>— fill in the orange fields</span>}
        </span>}
        {showSkus && (skusOpen ? rows : rows.slice(0, SKU_PREVIEW)).map((r) => (
          <span key={r.id} title={(r.family || "") + " · cost £" + (r.costGbp === "" || r.costGbp === null ? "—" : Number(r.costGbp).toFixed(2))}
            style={{ display: "inline-flex", gap: 6, alignItems: "center", border: "1px solid " + (/^\d{12}$/.test(r.sku) ? "#d5d9e0" : "#f0d0a8"), background: /^\d{12}$/.test(r.sku) ? "#fff" : "#fff8e6", borderRadius: 8, padding: "3px 8px", fontSize: 12 }}>
            <b style={{ letterSpacing: 0.5 }}>{r.sku}</b>
            <span style={{ color: "#5a6a85", fontWeight: 600 }}>{r.colour || "no colour"}</span>
            <span style={{ fontWeight: 700, color: Number(r.stock) ? "#28713e" : "#aab3c2" }}>{Number(r.stock) ? Number(r.stock).toLocaleString("en-GB") : "0"}</span>
          </span>
        ))}
        {showSkus && rows.length > SKU_PREVIEW && (
          <button type="button" onClick={() => setSkusOpen((o) => !o)}
            style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: NAVY, background: "#eef1f6", border: "1px solid #d5d9e0", borderRadius: 8, padding: "3px 10px", cursor: "pointer" }}>
            {skusOpen ? "Show less ▴" : "+" + (rows.length - SKU_PREVIEW) + " more ▾"}
          </button>
        )}
        {sameCode.length > 0 && (
          <Chip tone="red" style={{ fontSize: 11 }}>{sameCode.join(", ") + " share a colour number — keep one, or split them in SKU lists"}</Chip>
        )}
        {unknownColours.length > 0 && (
          <Chip tone="red" style={{ fontSize: 11 }}>{unknownColours.join(", ") + " not in the colour list — add it under SKU lists"}</Chip>
        )}
        <span style={{ flex: 1 }} />
      </div>
      )}
      {p.isKit && <KitEditor p={p} products={products} rowsByProduct={rowsByProduct} lists={lists} setP={setP} />}
    </div>
  );
}

// ===== kit recipe: parts + qty + colour, resolved to SKUs for every kit colour =====
function KitEditor({ p, products, rowsByProduct, lists, setP }) {
  const lines = p.kit || [];
  const setLines = (fn) => setP(p.id, "kit", fn(JSON.parse(JSON.stringify(lines))));
  const choices = products
    .filter((x) => x.id !== p.id && !x.isKit)
    .sort((a, b) => cleanCode(a.code).localeCompare(cleanCode(b.code)) || (a.name || "").localeCompare(b.name || ""));
  const byId = Object.fromEntries(products.map((x) => [x.id, x]));
  const kitColours = (p.colours || []).length ? p.colours : [""];
  return (
    <div style={{ marginTop: 10, borderTop: "1px dashed #d5d9e0", paddingTop: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>
        Kit parts — what goes on the loading bill for one kit
      </div>
      {lines.length === 0 && <div style={{ fontSize: 12.5, color: "#a05f10", fontWeight: 600, marginBottom: 6 }}>No parts yet — add what's in one kit.</div>}
      {lines.map((l, i) => {
        const part = byId[l.productId];
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(260px,3fr) 80px minmax(150px,1fr) 30px", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <select style={{ ...sel, borderColor: part ? "#d5d9e0" : RED }} value={l.productId}
              onChange={(e) => setLines((x) => { x[i].productId = e.target.value; x[i].colour = ""; return x; })}>
              <option value="">— choose a part —</option>
              {!part && l.productId && <option value={l.productId}>(removed product)</option>}
              {choices.map((x) => <option key={x.id} value={x.id}>{(x.code || "no code") + " — " + (x.name || "unnamed")}</option>)}
            </select>
            <input type="number" min="0" step="1" style={numI} value={l.qty} title="How many in one kit"
              onChange={(e) => setLines((x) => { x[i].qty = e.target.value === "" ? "" : Number(e.target.value); return x; })} />
            <select style={sel} value={l.colour || ""} onChange={(e) => setLines((x) => { x[i].colour = e.target.value; return x; })}
              title="Same as the kit, or always one colour (e.g. galvanised inserts)">
              <option value="">Same colour as the kit</option>
              {((part && part.colours) || []).map((c) => <option key={c} value={c}>Always {c}</option>)}
            </select>
            <button style={{ ...abtn, border: "none", width: 26, height: 26 }} title="Remove part" onClick={() => setLines((x) => x.filter((_, j) => j !== i))}>
              <Icon name="x" size={12} stroke={RED} />
            </button>
          </div>
        );
      })}
      <button style={{ ...btn, padding: "5px 11px", fontSize: 12.5, borderStyle: "dashed" }} onClick={() => setLines((x) => [...x, { productId: "", qty: 1, colour: "" }])}>
        <Icon name="plus" />Add part
      </button>
      {lines.some((l) => l.productId) && (
        <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
          {kitColours.map((kc) => {
            const parts = kitPartsFor(p, kc, rowsByProduct, lists).filter((x) => x.line.productId);
            return (
              <div key={kc || "none"} style={{ fontSize: 12, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <b style={{ minWidth: 92, color: NAVY }}>{kc ? kc + " kit" : "Each kit"}</b>
                {parts.map((x) => x.row ? (
                  <span key={x.i} style={{ border: "1px solid #d5d9e0", borderRadius: 7, padding: "2px 7px", background: "#fff" }}>
                    {(Number(x.line.qty) || 0) + " × "}<b>{x.row.sku}</b>{x.row.colour ? " " + x.row.colour : ""}
                  </span>
                ) : (
                  <span key={x.i} style={{ border: "1px solid " + RED, borderRadius: 7, padding: "2px 7px", color: RED, fontWeight: 700 }}>
                    {(byId[x.line.productId] ? byId[x.line.productId].code || byId[x.line.productId].name : "part") + " has no " + (x.line.colour || kc || "") + " — add the colour to that part"}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===== the two-digit lists =====
function ListsEditor({ lists, custom, onClose, onSave }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(lists)));
  const [tab, setTab] = useState("supplier");
  const [pc, setPc] = useState("01");
  const [ps, setPs] = useState("01");
  const TABS = [["supplier", "Supplier"], ["length", "Length"], ["category", "Category"], ["sub", "Sub-category"], ["product", "Product"], ["colour", "Colour"]];
  const isProd = tab === "product";
  const rows = isProd ? draft.product[pc + "-" + ps] || [] : draft[tab];
  const setRows = (fn) =>
    setDraft((d) => {
      const x = JSON.parse(JSON.stringify(d));
      if (isProd) x.product[pc + "-" + ps] = fn(x.product[pc + "-" + ps] || []);
      else x[tab] = fn(x[tab]);
      return x;
    });
  const dupes = (() => {
    const seen = {}, out = new Set();
    rows.forEach((r) => { if (seen[r.code]) out.add(r.code); seen[r.code] = 1; });
    return out;
  })();
  const nextCode = () => {
    const nums = rows.map((r) => Number(r.code)).filter((n) => isFinite(n));
    return String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, "0");
  };
  const allDupes = () => {
    const check = (l) => { const s = new Set(); return l.some((r) => (s.has(r.code) ? true : (s.add(r.code), false))); };
    return ["supplier", "length", "category", "sub", "colour"].some((k) => check(draft[k])) || Object.values(draft.product).some(check);
  };
  return (
    <Modal title="SKU lists" onClose={onClose} width={640}>
      <p style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600, marginTop: 0 }}>
        Two digits each. Add to the end of a list freely. Changing a number that's in use renumbers those SKUs — their stock and history move with them.
      </p>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "6px 11px", borderRadius: 999, cursor: "pointer", border: "1px solid " + (tab === k ? NAVY : "#d5d9e0"), background: tab === k ? NAVY : "#fff", color: tab === k ? "#fff" : "#5a6a85" }}>{l}</button>
        ))}
      </div>
      {isProd && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <select style={sel} value={pc} onChange={(e) => setPc(e.target.value)}>{draft.category.map((x) => <option key={x.code} value={x.code}>{x.code + " · " + x.label}</option>)}</select>
          <select style={sel} value={ps} onChange={(e) => setPs(e.target.value)}>{draft.sub.map((x) => <option key={x.code} value={x.code}>{x.code + " · " + x.label}</option>)}</select>
        </div>
      )}
      <div style={{ maxHeight: "48vh", overflowY: "auto", border: "1px solid #e6e9ef", borderRadius: 9 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <th style={{ textAlign: "left", fontSize: 10.5, color: "#8593a8", padding: "6px 8px", width: 70 }}>No.</th>
            {(tab === "supplier" || tab === "length") && <th style={{ textAlign: "left", fontSize: 10.5, color: "#8593a8", padding: "6px 8px", width: 100 }}>{tab === "supplier" ? "Code" : "In codes"}</th>}
            <th style={{ textAlign: "left", fontSize: 10.5, color: "#8593a8", padding: "6px 8px" }}>Name</th>
            {tab === "colour" && <th style={{ textAlign: "left", fontSize: 10.5, color: "#8593a8", padding: "6px 8px" }}>Also matches (comma separated)</th>}
            <th style={{ width: 30 }} />
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: "1px solid #f0f2f6" }}>
                <td style={{ padding: "4px 8px" }}>
                  <input style={{ ...sm, width: 52, fontWeight: 700, borderColor: dupes.has(r.code) || !/^\d{2}$/.test(r.code) ? RED : "#d5d9e0" }} value={r.code} maxLength={2}
                    onChange={(e) => setRows((l) => { l[i].code = e.target.value.replace(/\D/g, ""); return l; })} />
                </td>
                {(tab === "supplier" || tab === "length") && (
                  <td style={{ padding: "4px 8px" }}>
                    <input style={sm} value={r.key || ""} onChange={(e) => setRows((l) => { l[i].key = e.target.value.toUpperCase(); return l; })} />
                  </td>
                )}
                <td style={{ padding: "4px 8px" }}>
                  <input style={sm} value={r.label} onChange={(e) => setRows((l) => { l[i].label = e.target.value; return l; })} />
                </td>
                {tab === "colour" && (
                  <td style={{ padding: "4px 8px" }}>
                    <input style={sm} value={(r.aliases || []).join(", ")}
                      onChange={(e) => setRows((l) => { l[i].aliases = e.target.value.split(",").map((x) => x.trim()).filter(Boolean); return l; })} />
                  </td>
                )}
                <td style={{ padding: "4px 4px" }}>
                  <button style={{ ...abtn, border: "none", width: 24, height: 24 }} title="Remove" onClick={() => setRows((l) => l.filter((_, j) => j !== i))}><Icon name="x" size={12} stroke={RED} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button style={{ ...btn, marginTop: 8, borderStyle: "dashed", fontSize: 12.5 }} onClick={() => setRows((l) => [...l, { code: nextCode(), label: "", ...(tab === "colour" ? { aliases: [] } : {}), ...(tab === "supplier" || tab === "length" ? { key: "" } : {}) }])}>
        <Icon name="plus" />Add
      </button>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
        {custom && (
          <button style={{ ...btn, border: "none", color: "#8593a8", fontSize: 12.5 }} onClick={() => setDraft(JSON.parse(JSON.stringify(DEFAULT_SKU_LISTS)))}>Reset to the starting lists</button>
        )}
        <span style={{ flex: 1 }} />
        {allDupes() && <span style={{ fontSize: 12, fontWeight: 700, color: RED }}>Each number can only be used once per list</span>}
        <button style={btn} onClick={onClose}>Cancel</button>
        <button style={{ ...goldBtn, opacity: allDupes() ? 0.5 : 1 }} disabled={allDupes()} onClick={() => onSave(draft)}>Save lists</button>
      </div>
    </Modal>
  );
}
