// Emulates the blob storage interface over proper relational tables.
// get() assembles products/shipments/lines into the app's JSON shape;
// set() diffs against the last snapshot and upserts/deletes only changed rows.
import { getSupabase } from "./supabaseClient.js";

const SHIP_FIELDS = {
  name: "name", status: "status", supplier: "supplier", created: "created",
  orderDate: "order_date", depositDate: "deposit_date", arrivedDate: "arrived_date",
  balancePaidDate: "balance_paid_date", invoiceNo: "invoice_no", postedToStock: "posted_to_stock",
  surchargeOn: "surcharge_on", dutyOn: "duty_on",
  dutyGbp: "duty_gbp", shippingGbp: "shipping_gbp",
  depositUsd: "deposit_usd", depositFx: "deposit_fx",
  balanceUsd: "balance_usd", balanceFx: "balance_fx",
  valueUsd: "value_usd", fxRate: "fx_rate",
};
const NUM_SHIP = new Set(["dutyGbp", "shippingGbp", "depositUsd", "depositFx", "balanceUsd", "balanceFx", "valueUsd", "fxRate"]);
const BOOL_SHIP = new Set(["surchargeOn", "dutyOn"]);

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
const str = (v) => (v === null || v === undefined ? "" : String(v));
const nv = (v) => (v === null || v === undefined ? "" : v);

let snapshot = null;
// code / cost_gbp arrive with 020_product_codes.sql; until then they're left out of saves
let productCodesReady = true;
export const productCodesSchemaReady = () => productCodesReady;

const productToRow = (p, i) => ({
  id: p.id, name: str(p.name), colours: p.colours || [], qty: Number(p.qty) || 0,
  cost: Number(p.cost) || 0, weight: Number(p.weight) || 0, cbm: Number(p.cbm) || 0,
  sale_price: num(p.salePrice),
  supplier: str(p.supplier), category: str(p.category), position: i,
  ...(productCodesReady ? { code: str(p.code).trim().toUpperCase(), cost_gbp: num(p.costGbp) } : {}),
});

const shipToRow = (s, i) => {
  const row = { id: s.id, position: i };
  for (const [key, col] of Object.entries(SHIP_FIELDS)) {
    row[col] = NUM_SHIP.has(key) ? num(s[key]) : BOOL_SHIP.has(key) ? s[key] !== false : str(s[key]);
  }
  return row;
};

const lineToRow = (l, shipmentId, i) => ({
  id: l.id, shipment_id: shipmentId, product_id: str(l.productId), colour: str(l.colour),
  pallets: Number(l.pallets) || 0, qty: Number(l.qty) || 0,
  cost: Number(l.cost) || 0, weight: Number(l.weight) || 0, position: i,
});

function rowsFromData(d) {
  const products = new Map();
  const shipments = new Map();
  const lines = new Map();
  (d.products || []).forEach((p, i) => products.set(p.id, productToRow(p, i)));
  (d.shipments || []).forEach((s, i) => {
    shipments.set(s.id, shipToRow(s, i));
    (s.lines || []).forEach((l, j) => lines.set(l.id, lineToRow(l, s.id, j)));
  });
  return { products, shipments, lines };
}

async function loadAll() {
  const sb = await getSupabase();
  const [p, s, l] = await Promise.all([
    sb.from("products").select("*").order("position"),
    sb.from("shipments").select("*").order("position"),
    sb.from("shipment_lines").select("*").order("position"),
  ]);
  for (const r of [p, s, l]) if (r.error) throw new Error(r.error.message);
  if (p.data.length) productCodesReady = Object.prototype.hasOwnProperty.call(p.data[0], "code");

  if (p.data.length === 0 && s.data.length === 0) {
    snapshot = { products: new Map(), shipments: new Map(), lines: new Map() };
    return null;
  }

  const products = p.data.map((r) => ({
    id: r.id, name: r.name, colours: r.colours || [], qty: Number(r.qty), cost: Number(r.cost),
    weight: Number(r.weight), cbm: Number(r.cbm), supplier: r.supplier, category: r.category,
    salePrice: nv(r.sale_price), code: nv(r.code), costGbp: nv(r.cost_gbp),
  }));
  const linesByShip = {};
  l.data.forEach((r) => {
    (linesByShip[r.shipment_id] = linesByShip[r.shipment_id] || []).push({
      id: r.id, productId: r.product_id, colour: r.colour, pallets: Number(r.pallets),
      qty: Number(r.qty), cost: Number(r.cost), weight: Number(r.weight),
    });
  });
  const shipments = s.data.map((r) => ({
    id: r.id, name: r.name, status: r.status, supplier: r.supplier, created: r.created,
    orderDate: r.order_date, depositDate: r.deposit_date, arrivedDate: r.arrived_date,
    balancePaidDate: r.balance_paid_date, invoiceNo: r.invoice_no,
    surchargeOn: r.surcharge_on, dutyOn: r.duty_on, postedToStock: nv(r.posted_to_stock),
    dutyGbp: nv(r.duty_gbp), shippingGbp: nv(r.shipping_gbp),
    depositUsd: nv(r.deposit_usd), depositFx: nv(r.deposit_fx),
    balanceUsd: nv(r.balance_usd), balanceFx: nv(r.balance_fx),
    valueUsd: nv(r.value_usd), fxRate: nv(r.fx_rate),
    modifiedBy: nv(r.modified_by), updatedAt: r.updated_at || "",
    lines: linesByShip[r.id] || [],
  }));

  const data = { products, shipments };
  snapshot = rowsFromData(data);
  return data;
}

function diff(oldMap, newMap) {
  const upserts = [];
  const deletes = [];
  for (const [id, row] of newMap) {
    const prev = oldMap.get(id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(row)) upserts.push(row);
  }
  for (const id of oldMap.keys()) if (!newMap.has(id)) deletes.push(id);
  return { upserts, deletes };
}

async function saveAll(d) {
  const sb = await getSupabase();
  const next = rowsFromData(d);
  const prev = snapshot || { products: new Map(), shipments: new Map(), lines: new Map() };
  const dp = diff(prev.products, next.products);
  const ds = diff(prev.shipments, next.shipments);
  const dl = diff(prev.lines, next.lines);

  const run = async (q) => {
    const { error } = await q;
    if (error) throw new Error(error.message);
  };

  if (dl.deletes.length) await run(sb.from("shipment_lines").delete().in("id", dl.deletes));
  if (ds.deletes.length) await run(sb.from("shipments").delete().in("id", ds.deletes));
  if (dp.deletes.length) await run(sb.from("products").delete().in("id", dp.deletes));
  if (dp.upserts.length) await run(sb.from("products").upsert(dp.upserts));
  if (ds.upserts.length) await run(sb.from("shipments").upsert(ds.upserts));
  if (dl.upserts.length) await run(sb.from("shipment_lines").upsert(dl.upserts));

  snapshot = next;
}

export const supabaseStorage = {
  async get(key) {
    if (key !== "dk-import-planner") return null; // PIN etc: real logins replace these
    const d = await loadAll();
    return d === null ? null : { key, value: JSON.stringify(d) };
  },
  async set(key, value) {
    if (key !== "dk-import-planner") return { key, value };
    await saveAll(JSON.parse(value));
    return { key, value };
  },
};
