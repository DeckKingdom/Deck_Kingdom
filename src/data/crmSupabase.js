// CRM relational adapter: emulates the blob interface over customers /
// customer_sites / invoices / invoice_items / crm_settings.
// get() assembles everything into the app's JSON shape; set() diffs against
// the last snapshot and upserts/deletes only changed rows.
// Reads are paginated (Supabase caps a select at 1000 rows and the customer
// book is ~3,600 records once history is imported).
import { getSupabase } from "./supabaseClient.js";

const str = (v) => (v === null || v === undefined ? "" : String(v));
const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
const nv = (v) => (v === null || v === undefined ? "" : v);
const intOrNull = (v) => {
  const n = Number(v);
  return isFinite(n) && v !== "" && v !== null && v !== undefined ? Math.round(n) : null;
};

const CUSTOMER_FIELDS = ["name", "address", "town", "postcode", "contact", "landline", "mobile", "email", "source", "created", "createdBy", "modifiedBy"];
const SITE_FIELDS = ["name", "address", "town", "postcode", "contact", "landline", "mobile", "email", "notes"];
const INV_TEXT = ["date", "orderRef", "jobType", "van", "deliveryDate", "deliveryTime", "paymentType", "paymentDate", "jobNotes", "raisedBy", "created", "siteId"];
const FLAG_COLS = {
  booked: "f_booked",
  courier: "f_courier",
  partsOrdered: "f_parts_ordered",
  partsReady: "f_parts_ready",
  paymentLink: "f_payment_link",
  reviewRequested: "f_review_requested",
  reviewReceived: "f_review_received",
  photosRequested: "f_photos_requested",
  socialPosted: "f_social_posted",
  sampleFollowed: "f_sample_followed",
};

const snake = (k) => k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());

const customerToRow = (c, i) => {
  const row = { id: c.id, account_no: intOrNull(c.accountNo), trader: c.trader === true, position: i };
  CUSTOMER_FIELDS.forEach((k) => (row[snake(k)] = str(c[k])));
  return row;
};

const siteToRow = (s, i) => {
  const row = { id: s.id, customer_id: str(s.customerId), site_no: intOrNull(s.siteNo), position: i };
  SITE_FIELDS.forEach((k) => (row[k] = str(s[k])));
  return row;
};

const invToRow = (inv, i) => {
  const row = {
    id: inv.id,
    inv_no: intOrNull(inv.invNo),
    customer_id: str(inv.customerId),
    delivery_completed: inv.deliveryCompleted === true,
    delivery_charge: num(inv.deliveryCharge),
    weight_kg: num(inv.weightKg),
    vat_rate: isFinite(Number(inv.vatRate)) ? Number(inv.vatRate) : 20,
    vat_inclusive: inv.vatInclusive !== false,
    position: i,
  };
  INV_TEXT.forEach((k) => (row[snake(k)] = str(inv[k])));
  const f = inv.flags || {};
  Object.entries(FLAG_COLS).forEach(([k, col]) => (row[col] = f[k] === true));
  return row;
};

const lineToRow = (l, invoiceId, i) => ({
  id: l.id,
  invoice_id: invoiceId,
  code: str(l.code),
  description: str(l.description),
  colour: str(l.colour),
  qty: Number(l.qty) || 0,
  price: Number(l.price) || 0,
  position: i,
});

function rowsFromData(d) {
  const customers = new Map();
  const sites = new Map();
  const invoices = new Map();
  const items = new Map();
  (d.customers || []).forEach((c, i) => customers.set(c.id, customerToRow(c, i)));
  (d.sites || []).forEach((s, i) => sites.set(s.id, siteToRow(s, i)));
  (d.invoices || []).forEach((inv, i) => {
    invoices.set(inv.id, invToRow(inv, i));
    (inv.lines || []).forEach((l, j) => items.set(l.id, lineToRow(l, inv.id, j)));
  });
  return { customers, sites, invoices, items };
}

async function fetchAll(sb, table) {
  const out = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from(table).select("*").order("position").order("id").range(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < page) break;
  }
  return out;
}

let snapshot = null;
let numberingSnapshot = null;

async function loadAll() {
  const sb = await getSupabase();
  const [cs, ss, is_, ls, settings] = await Promise.all([
    fetchAll(sb, "customers"),
    fetchAll(sb, "customer_sites"),
    fetchAll(sb, "invoices"),
    fetchAll(sb, "invoice_items"),
    sb.from("crm_settings").select("*").eq("key", "numbering").maybeSingle(),
  ]);
  if (settings.error) throw new Error(settings.error.message);

  const numbering = (settings.data && settings.data.value) || { account: 1, site: 1, invoice: 1 };

  const customers = cs.map((r) => {
    const c = { id: r.id, accountNo: r.account_no, trader: r.trader === true };
    CUSTOMER_FIELDS.forEach((k) => (c[k] = nv(r[snake(k)])));
    return c;
  });
  const sites = ss.map((r) => {
    const s = { id: r.id, customerId: r.customer_id, siteNo: r.site_no };
    SITE_FIELDS.forEach((k) => (s[k] = nv(r[k])));
    return s;
  });
  const linesByInv = {};
  ls.forEach((r) => {
    (linesByInv[r.invoice_id] = linesByInv[r.invoice_id] || []).push({
      id: r.id, code: r.code, description: r.description, colour: r.colour,
      qty: nv(r.qty) === "" ? "" : Number(r.qty), price: nv(r.price) === "" ? "" : Number(r.price),
    });
  });
  const invoices = is_.map((r) => {
    const inv = {
      id: r.id,
      invNo: r.inv_no,
      customerId: r.customer_id,
      deliveryCompleted: r.delivery_completed === true,
      deliveryCharge: nv(r.delivery_charge),
      weightKg: nv(r.weight_kg),
      vatRate: Number(r.vat_rate),
      vatInclusive: r.vat_inclusive !== false,
      flags: {},
      lines: linesByInv[r.id] || [],
    };
    INV_TEXT.forEach((k) => (inv[k] = nv(r[snake(k)])));
    Object.entries(FLAG_COLS).forEach(([k, col]) => (inv.flags[k] = r[col] === true));
    return inv;
  });

  const data = { customers, sites, invoices, numbering };
  snapshot = rowsFromData(data);
  numberingSnapshot = JSON.stringify(numbering);

  if (!customers.length && !sites.length && !invoices.length && !settings.data) return null;
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
  const prev = snapshot || { customers: new Map(), sites: new Map(), invoices: new Map(), items: new Map() };
  const dc = diff(prev.customers, next.customers);
  const ds = diff(prev.sites, next.sites);
  const di = diff(prev.invoices, next.invoices);
  const dl = diff(prev.items, next.items);

  const run = async (q) => {
    const { error } = await q;
    if (error) throw new Error(error.message);
  };

  // children first on delete, parents first on upsert
  if (dl.deletes.length) await run(sb.from("invoice_items").delete().in("id", dl.deletes));
  if (di.deletes.length) await run(sb.from("invoices").delete().in("id", di.deletes));
  if (ds.deletes.length) await run(sb.from("customer_sites").delete().in("id", ds.deletes));
  if (dc.deletes.length) await run(sb.from("customers").delete().in("id", dc.deletes));
  if (dc.upserts.length) await run(sb.from("customers").upsert(dc.upserts));
  if (ds.upserts.length) await run(sb.from("customer_sites").upsert(ds.upserts));
  if (di.upserts.length) await run(sb.from("invoices").upsert(di.upserts));
  if (dl.upserts.length) await run(sb.from("invoice_items").upsert(dl.upserts));

  const numbering = d.numbering || { account: 1, site: 1, invoice: 1 };
  if (JSON.stringify(numbering) !== numberingSnapshot) {
    await run(sb.from("crm_settings").upsert({ key: "numbering", value: numbering }));
    numberingSnapshot = JSON.stringify(numbering);
  }

  snapshot = next;
}

export const crmSupabaseStorage = {
  async get(key) {
    if (key !== "dk-crm") return null;
    const d = await loadAll();
    return d === null ? null : { key, value: JSON.stringify(d) };
  },
  async set(key, value) {
    if (key !== "dk-crm") return { key, value };
    await saveAll(JSON.parse(value));
    return { key, value };
  },
};
