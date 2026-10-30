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

const CUSTOMER_FIELDS = ["name", "address", "town", "postcode", "contact", "landline", "mobile", "email", "source", "contactMethod", "created", "createdBy", "modifiedBy"];
const SITE_FIELDS = ["name", "address", "town", "postcode", "contact", "landline", "mobile", "email", "notes"];
const INV_TEXT = ["date", "orderRef", "jobType", "van", "deliveryDate", "deliveryTime", "paymentType", "paymentDate", "jobNotes", "raisedBy", "created", "siteId", "stockDeducted"];
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

// Quotes live in their own tables (016_quotes.sql). Until that SQL has been
// run they're simply absent: the rest of the CRM loads and saves as before.
let quotesReady = false;
export const quotesSchemaReady = () => quotesReady;

const QUOTE_TEXT = ["customerId", "siteId", "date", "validUntil", "status", "sentDate", "notes", "internalNotes", "raisedBy", "created", "convertedInvoiceId", "convertedAt"];

const quoteToRow = (q, i) => {
  const row = {
    id: q.id,
    quote_no: intOrNull(q.quoteNo),
    delivery_charge: num(q.deliveryCharge),
    discount_pct: num(q.discountPct),
    vat_rate: isFinite(Number(q.vatRate)) ? Number(q.vatRate) : 20,
    position: i,
  };
  QUOTE_TEXT.forEach((k) => (row[snake(k)] = str(q[k])));
  return row;
};

const quoteLineToRow = (l, quoteId, i) => ({
  id: l.id, quote_id: quoteId, code: str(l.code), description: str(l.description), colour: str(l.colour),
  qty: Number(l.qty) || 0, price: Number(l.price) || 0, position: i,
});

// Sample requests (017_samples.sql): same tolerance as quotes.
let samplesReady = false;
export const samplesSchemaReady = () => samplesReady;

const SAMPLE_TEXT = ["customerId", "date", "source", "dispatchMethod", "dispatchedDate", "trackingRef", "followUpDate", "followedUpDate", "project", "notes", "outcome", "lostReason", "convertedInvoiceId", "convertedAt", "raisedBy", "created"];

const sampleToRow = (x, i) => {
  const row = { id: x.id, sample_no: intOrNull(x.sampleNo), followed_up: x.followedUp === true, link_manual: x.linkManual === true, position: i };
  SAMPLE_TEXT.forEach((k) => (row[snake(k)] = str(x[k])));
  return row;
};

const sampleItemToRow = (it, sampleId, i) => ({
  id: it.id, sample_id: sampleId, description: str(it.description), colour: str(it.colour),
  size: str(it.size) || "Free", qty: Number(it.qty) || 0, position: i,
});

// Tasks (018_tasks.sql): same tolerance. The tick log is loaded for the last
// TASK_LOG_DAYS only; older rows stay in the database untouched.
let tasksReady = false;
export const tasksSchemaReady = () => tasksReady;
const TASK_LOG_DAYS = 120;
const TASK_TEXT = ["kind", "title", "notes", "repeat", "onDate", "frequency", "startDate", "status", "priority", "dueDate", "created", "createdBy"];

const taskToRow = (t, i) => {
  const row = {
    id: t.id, assignees: (t.assignees || []).map((a) => String(a).trim()).filter(Boolean).join(","),
    rotate: t.rotate === true, active: t.active !== false,
    weekday: Math.max(0, Math.min(6, Math.round(Number(t.weekday) || 0))),
    month_day: Math.max(1, Math.min(31, Math.round(Number(t.monthDay) || 1))),
    position: i,
  };
  TASK_TEXT.forEach((k) => (row[snake(k)] = str(t[k])));
  return row;
};
const taskLogToRow = (l, i) => ({ id: l.id, task_id: str(l.taskId), period: str(l.period), done_by: str(l.doneBy), done_at: str(l.doneAt), position: i });

// Suppliers + purchases (019_purchases.sql): same tolerance; collections only
// send supplier_id once that column exists.
let purchasesReady = false;
export const purchasesSchemaReady = () => purchasesReady;
const SUPPLIER_TEXT = ["name", "accountNo", "contact", "phone", "email", "address", "town", "postcode", "website", "category", "paymentMethod", "notes", "created", "createdBy"];
const PURCHASE_TEXT = ["supplierId", "invNo", "invDate", "invDetail", "purchasedBy", "category", "vehicle", "datePaid", "paymentMethod", "createdBy"];

const supplierToRow = (x, i) => {
  const row = { id: x.id, active: x.active !== false, position: i };
  SUPPLIER_TEXT.forEach((k) => (row[snake(k)] = str(x[k])));
  return row;
};
const purchaseToRow = (p, i) => {
  const row = {
    id: p.id, po_no: intOrNull(p.poNo), created_at_text: str(p.createdAt), physical_receipt: p.physicalReceipt === true,
    sub_total: num(p.subTotal), vat_rate: isFinite(Number(p.vatRate)) && p.vatRate !== "" ? Number(p.vatRate) : 20, vat_amount: num(p.vatAmount),
    position: i,
  };
  PURCHASE_TEXT.forEach((k) => (row[snake(k)] = str(p[k])));
  return row;
};

const snake = (k) => k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());

const customerToRow = (c, i) => {
  const row = { id: c.id, account_no: intOrNull(c.accountNo), trader: c.trader === true, discount_pct: num(c.discountPct), position: i };
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
    discount_pct: num(inv.discountPct),
    weight_kg: num(inv.weightKg),
    vat_rate: isFinite(Number(inv.vatRate)) ? Number(inv.vatRate) : 20,
    vat_inclusive: inv.vatInclusive !== false,
    position: i,
  };
  INV_TEXT.forEach((k) => (row[snake(k)] = str(inv[k])));
  const f = inv.flags || {};
  Object.entries(FLAG_COLS).forEach(([k, col]) => (row[col] = f[k] === true));
  if (quotesReady) row.quote_id = str(inv.quoteId);
  return row;
};

const MP_NUM = { priceIncVat: "price_inc_vat", costGbp: "cost_gbp", weightKg: "weight_kg", stock: "stock", stockAlert: "stock_alert" };
const MP_TEXT = ["sku", "name", "colour", "family", "category", "unit", "notes", "importProductId"];

let gradeReady = false; // master_products.grade (migration 023)
const mpToRow = (p, i) => {
  const row = { id: p.id, is_kit: p.isKit === true, active: p.active !== false, position: i };
  if (gradeReady) row.grade = str(p.grade);
  MP_TEXT.forEach((k) => (row[snake(k)] = str(p[k])));
  Object.entries(MP_NUM).forEach(([k, col]) => (row[col] = num(p[k])));
  return row;
};

const compToRow = (c, kitId, i) => ({
  id: c.id, kit_id: kitId, component_id: str(c.componentId), qty: Number(c.qty) || 0, position: i,
});

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

const pickToRow = (p, invoiceId, i) => ({
  id: p.id,
  invoice_id: invoiceId,
  sku: str(p.sku),
  description: str(p.description),
  colour: str(p.colour),
  qty: Number(p.qty) || 0,
  shipment_id: str(p.shipmentId),
  batch_ref: str(p.batchRef),
  unit_cost: num(p.unitCost),
  picked: p.picked === true,
  position: i,
});

const COLL_TEXT = ["supplier", "address", "town", "postcode", "contact", "phone", "date", "collectDate", "collectTime", "van", "postedAt", "assignedInvoiceId", "notes", "raisedBy"];

const collToRow = (c, i) => {
  const row = { id: c.id, collection_no: intOrNull(c.collectionNo), collected: c.collected === true, position: i };
  COLL_TEXT.forEach((k) => (row[snake(k)] = str(c[k])));
  if (purchasesReady) row.supplier_id = str(c.supplierId);
  return row;
};

const collItemToRow = (it, collectionId, i) => ({
  id: it.id, collection_id: collectionId, sku: str(it.sku), description: str(it.description),
  colour: str(it.colour), qty: Number(it.qty) || 0, unit_cost: num(it.unitCost),
  assigned_invoice_id: str(it.assignedInvoiceId), posted_at: str(it.postedAt), position: i,
});

const VAN_TEXT = ["name", "reg", "makeModel", "insurer", "policyNo", "insuranceRenewal", "motDue", "taxDue", "serviceDue", "notes"];
const CHECK_BOOLS = { tyres: "tyres", lights: "lights", oil: "oil", coolant: "coolant", brakes: "brakes", bodywork: "bodywork", loadArea: "load_area" };

const vanToRow = (v, i) => {
  const row = { id: v.id, active: v.active !== false, position: i };
  VAN_TEXT.forEach((k) => (row[snake(k)] = str(v[k])));
  return row;
};

const checkToRow = (c, vanId, i) => {
  const row = { id: c.id, van_id: vanId, date: str(c.date), by_who: str(c.by), mileage: num(c.mileage), defects: str(c.defects), position: i };
  Object.entries(CHECK_BOOLS).forEach(([k, col]) => (row[col] = c[k] !== false));
  return row;
};

const moveToRow = (m, i) => ({
  id: m.id, at: m.at || new Date().toISOString(), master_product_id: str(m.mpId), sku: str(m.sku),
  qty: Number(m.qty) || 0, unit_cost: num(m.unitCost), kind: str(m.kind), ref: str(m.ref), actor: str(m.actor), position: i,
});

function rowsFromData(d) {
  const customers = new Map();
  const sites = new Map();
  const invoices = new Map();
  const items = new Map();
  const mps = new Map();
  const comps = new Map();
  (d.customers || []).forEach((c, i) => customers.set(c.id, customerToRow(c, i)));
  (d.sites || []).forEach((s, i) => sites.set(s.id, siteToRow(s, i)));
  const picks = new Map();
  (d.invoices || []).forEach((inv, i) => {
    invoices.set(inv.id, invToRow(inv, i));
    (inv.lines || []).forEach((l, j) => items.set(l.id, lineToRow(l, inv.id, j)));
    (inv.picks || []).forEach((p, j) => picks.set(p.id, pickToRow(p, inv.id, j)));
  });
  (d.masterProducts || []).forEach((p, i) => {
    mps.set(p.id, mpToRow(p, i));
    (p.components || []).forEach((c, j) => comps.set(c.id, compToRow(c, p.id, j)));
  });
  const colls = new Map();
  const collItems = new Map();
  (d.collections || []).forEach((c, i) => {
    colls.set(c.id, collToRow(c, i));
    (c.items || []).forEach((it, j) => collItems.set(it.id, collItemToRow(it, c.id, j)));
  });
  const moves = new Map();
  (d.movements || []).forEach((m, i) => moves.set(m.id, moveToRow(m, i)));
  const vans = new Map();
  const checks = new Map();
  (d.vans || []).forEach((v, i) => {
    vans.set(v.id, vanToRow(v, i));
    (v.checks || []).forEach((c, j) => checks.set(c.id, checkToRow(c, v.id, j)));
  });
  const quotes = new Map();
  const quoteItems = new Map();
  if (quotesReady)
    (d.quotes || []).forEach((q, i) => {
      quotes.set(q.id, quoteToRow(q, i));
      (q.lines || []).forEach((l, j) => quoteItems.set(l.id, quoteLineToRow(l, q.id, j)));
    });
  const samples = new Map();
  const sampleItems = new Map();
  if (samplesReady)
    (d.samples || []).forEach((x, i) => {
      samples.set(x.id, sampleToRow(x, i));
      (x.items || []).forEach((it, j) => sampleItems.set(it.id, sampleItemToRow(it, x.id, j)));
    });
  const tasks = new Map();
  const taskLog = new Map();
  if (tasksReady) {
    (d.tasks || []).forEach((t, i) => tasks.set(t.id, taskToRow(t, i)));
    (d.taskLog || []).forEach((l, i) => taskLog.set(l.id, taskLogToRow(l, i)));
  }
  const suppliers = new Map();
  const purchases = new Map();
  if (purchasesReady) {
    (d.suppliers || []).forEach((x, i) => suppliers.set(x.id, supplierToRow(x, i)));
    (d.purchases || []).forEach((p, i) => purchases.set(p.id, purchaseToRow(p, i)));
  }
  return { customers, sites, invoices, items, picks, mps, comps, colls, collItems, moves, vans, checks, quotes, quoteItems, samples, sampleItems, tasks, taskLog, suppliers, purchases };
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
let settingsSnapshot = {};

async function loadAll() {
  const sb = await getSupabase();
  const [cs, ss, is_, ls, ps_, mps_, comps_, colls_, collItems_, moves_, vans_, vanChecks_, settings, quoteData, sampleData, taskData, staffRows, purchData] = await Promise.all([
    fetchAll(sb, "customers"),
    fetchAll(sb, "customer_sites"),
    fetchAll(sb, "invoices"),
    fetchAll(sb, "invoice_items"),
    fetchAll(sb, "invoice_picks"),
    fetchAll(sb, "master_products"),
    fetchAll(sb, "product_components"),
    fetchAll(sb, "collections"),
    fetchAll(sb, "collection_items"),
    fetchAll(sb, "stock_movements"),
    fetchAll(sb, "vans"),
    fetchAll(sb, "van_checks"),
    (async () => {
      // crm_settings has no position/id ordering columns — plain select
      const { data, error } = await sb.from("crm_settings").select("*");
      if (error) throw new Error(error.message);
      return data;
    })(),
    (async () => {
      // tolerant: a missing quotes table (SQL not run yet) must not stop the CRM loading
      try {
        const [q, qi] = await Promise.all([fetchAll(sb, "quotes"), fetchAll(sb, "quote_items")]);
        return { q, qi };
      } catch (e) {
        return null;
      }
    })(),
    (async () => {
      try {
        const [sm, si] = await Promise.all([fetchAll(sb, "samples"), fetchAll(sb, "sample_items")]);
        return { sm, si };
      } catch (e) {
        return null;
      }
    })(),
    (async () => {
      try {
        const since = new Date(Date.now() - TASK_LOG_DAYS * 86400000).toISOString().slice(0, 10);
        const [tk, lg] = await Promise.all([
          fetchAll(sb, "tasks"),
          (async () => {
            const out = [];
            for (let from = 0; ; from += 1000) {
              const { data, error } = await sb.from("task_log").select("*").gte("period", since).order("id").range(from, from + 999);
              if (error) throw new Error(error.message);
              out.push(...data);
              if (data.length < 1000) break;
            }
            return out;
          })(),
        ]);
        return { tk, lg };
      } catch (e) {
        return null;
      }
    })(),
    (async () => {
      // staff logins, for assigning tasks (read-only here)
      try {
        const { data, error } = await sb.from("profiles").select("email, full_name, role");
        return error ? [] : data || [];
      } catch (e) {
        return [];
      }
    })(),
    (async () => {
      try {
        const [sp, pu] = await Promise.all([fetchAll(sb, "suppliers"), fetchAll(sb, "purchases")]);
        return { sp, pu };
      } catch (e) {
        return null;
      }
    })(),
  ]);
  purchasesReady = purchData !== null;
  tasksReady = taskData !== null;
  samplesReady = sampleData !== null;
  quotesReady = quoteData !== null;

  const settingRow = (key) => settings.find((r) => r.key === key);
  const numbering = (settingRow("numbering") || {}).value || { account: 1, site: 1, invoice: 1 };
  const reminders = (settingRow("reminders") || {}).value || {};
  const skuListsRow = settingRow("skuLists");

  const customers = cs.map((r) => {
    const c = { id: r.id, accountNo: r.account_no, trader: r.trader === true, discountPct: nv(r.discount_pct), updatedAt: r.updated_at || "" };
    CUSTOMER_FIELDS.forEach((k) => (c[k] = nv(r[snake(k)])));
    return c;
  });
  const sites = ss.map((r) => {
    const s = {
      id: r.id, customerId: r.customer_id, siteNo: r.site_no,
      createdBy: nv(r.created_by), modifiedBy: nv(r.modified_by), updatedAt: r.updated_at || "",
    };
    SITE_FIELDS.forEach((k) => (s[k] = nv(r[k])));
    return s;
  });
  const picksByInv = {};
  ps_.forEach((r) => {
    (picksByInv[r.invoice_id] = picksByInv[r.invoice_id] || []).push({
      id: r.id, sku: r.sku, description: r.description, colour: r.colour,
      qty: nv(r.qty) === "" ? "" : Number(r.qty),
      shipmentId: nv(r.shipment_id), batchRef: nv(r.batch_ref), unitCost: nv(r.unit_cost), picked: r.picked === true,
    });
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
      discountPct: nv(r.discount_pct),
      weightKg: nv(r.weight_kg),
      vatRate: Number(r.vat_rate),
      vatInclusive: r.vat_inclusive !== false,
      createdBy: nv(r.created_by),
      modifiedBy: nv(r.modified_by),
      updatedAt: r.updated_at || "",
      flags: {},
      lines: linesByInv[r.id] || [],
      picks: picksByInv[r.id] || [],
    };
    INV_TEXT.forEach((k) => (inv[k] = nv(r[snake(k)])));
    inv.quoteId = nv(r.quote_id);
    Object.entries(FLAG_COLS).forEach(([k, col]) => (inv.flags[k] = r[col] === true));
    return inv;
  });

  const compsByKit = {};
  comps_.forEach((r) => {
    (compsByKit[r.kit_id] = compsByKit[r.kit_id] || []).push({ id: r.id, componentId: r.component_id, qty: Number(r.qty) });
  });
  gradeReady = mps_.length ? Object.prototype.hasOwnProperty.call(mps_[0], "grade") : gradeReady;
  const masterProducts = mps_.map((r) => {
    const p = {
      id: r.id, isKit: r.is_kit === true, active: r.active !== false,
      createdBy: nv(r.created_by), modifiedBy: nv(r.modified_by), updatedAt: r.updated_at || "",
      components: compsByKit[r.id] || [],
    };
    MP_TEXT.forEach((k) => (p[k] = nv(r[snake(k)])));
    Object.entries(MP_NUM).forEach(([k, col]) => (p[k] = nv(r[col])));
    // grade column (migration 023); until it's run the SKU suffix -R / -D / -C says it
    p.grade = nv(r.grade) || ({ r: "returned", d: "damaged", c: "clearance" }[(String(p.sku || "").match(/-([rdc])$/i) || [])[1]?.toLowerCase()] || "");
    return p;
  });

  const itemsByColl = {};
  collItems_.forEach((r) => {
    (itemsByColl[r.collection_id] = itemsByColl[r.collection_id] || []).push({
      id: r.id, sku: nv(r.sku), description: nv(r.description), colour: nv(r.colour),
      qty: nv(r.qty) === "" ? "" : Number(r.qty), unitCost: nv(r.unit_cost),
      assignedInvoiceId: nv(r.assigned_invoice_id), postedAt: nv(r.posted_at),
    });
  });
  const collections = colls_.map((r) => {
    const c = { id: r.id, collectionNo: r.collection_no, collected: r.collected === true, items: itemsByColl[r.id] || [] };
    COLL_TEXT.forEach((k) => (c[k] = nv(r[snake(k)])));
    c.supplierId = nv(r.supplier_id);
    return c;
  });
  const movements = moves_.map((r) => ({
    id: r.id, at: r.at || "", mpId: nv(r.master_product_id), sku: nv(r.sku),
    qty: Number(r.qty) || 0, unitCost: nv(r.unit_cost), kind: nv(r.kind), ref: nv(r.ref), actor: nv(r.actor),
  }));

  const checksByVan = {};
  vanChecks_.forEach((r) => {
    const c = { id: r.id, date: nv(r.date), by: nv(r.by_who), mileage: nv(r.mileage), defects: nv(r.defects) };
    Object.entries(CHECK_BOOLS).forEach(([k, col]) => (c[k] = r[col] !== false));
    (checksByVan[r.van_id] = checksByVan[r.van_id] || []).push(c);
  });
  const vans = vans_.map((r) => {
    const v = { id: r.id, active: r.active !== false, updatedAt: r.updated_at || "", modifiedBy: nv(r.modified_by), checks: checksByVan[r.id] || [] };
    VAN_TEXT.forEach((k) => (v[k] = nv(r[snake(k)])));
    return v;
  });

  const linesByQuote = {};
  ((quoteData && quoteData.qi) || []).forEach((r) => {
    (linesByQuote[r.quote_id] = linesByQuote[r.quote_id] || []).push({
      id: r.id, code: nv(r.code), description: nv(r.description), colour: nv(r.colour),
      qty: nv(r.qty) === "" ? "" : Number(r.qty), price: nv(r.price) === "" ? "" : Number(r.price),
    });
  });
  const quotes = ((quoteData && quoteData.q) || []).map((r) => {
    const q = {
      id: r.id, quoteNo: r.quote_no, deliveryCharge: nv(r.delivery_charge), discountPct: nv(r.discount_pct),
      vatRate: Number(r.vat_rate), createdBy: nv(r.created_by), modifiedBy: nv(r.modified_by), updatedAt: r.updated_at || "",
      lines: linesByQuote[r.id] || [],
    };
    QUOTE_TEXT.forEach((k) => (q[k] = nv(r[snake(k)])));
    return q;
  });

  const itemsBySample = {};
  ((sampleData && sampleData.si) || []).forEach((r) => {
    (itemsBySample[r.sample_id] = itemsBySample[r.sample_id] || []).push({
      id: r.id, description: nv(r.description), colour: nv(r.colour), size: nv(r.size) || "Free", qty: nv(r.qty) === "" ? "" : Number(r.qty),
    });
  });
  const samples = ((sampleData && sampleData.sm) || []).map((r) => {
    const x = {
      id: r.id, sampleNo: r.sample_no, followedUp: r.followed_up === true, linkManual: r.link_manual === true,
      createdBy: nv(r.created_by), modifiedBy: nv(r.modified_by), updatedAt: r.updated_at || "",
      items: itemsBySample[r.id] || [],
    };
    SAMPLE_TEXT.forEach((k) => (x[k] = nv(r[snake(k)])));
    return x;
  });

  const tasks = ((taskData && taskData.tk) || []).map((r) => {
    const t = {
      id: r.id, assignees: String(r.assignees || "").split(",").map((x) => x.trim()).filter(Boolean),
      rotate: r.rotate === true, active: r.active !== false, weekday: Number(r.weekday) || 0, monthDay: Number(r.month_day) || 1,
      modifiedBy: nv(r.modified_by), updatedAt: r.updated_at || "",
    };
    TASK_TEXT.forEach((k) => (t[k] = nv(r[snake(k)])));
    return t;
  });
  const taskLog = ((taskData && taskData.lg) || []).map((r) => ({ id: r.id, taskId: r.task_id, period: nv(r.period), doneBy: nv(r.done_by), doneAt: nv(r.done_at) }));
  const staff = (staffRows || []).filter((r) => r.email).map((r) => ({ email: r.email, name: nv(r.full_name), role: nv(r.role) }));

  const suppliers = ((purchData && purchData.sp) || []).map((r) => {
    const x = { id: r.id, active: r.active !== false, modifiedBy: nv(r.modified_by), updatedAt: r.updated_at || "" };
    SUPPLIER_TEXT.forEach((k) => (x[k] = nv(r[snake(k)])));
    return x;
  });
  const purchases = ((purchData && purchData.pu) || []).map((r) => {
    const p = {
      id: r.id, poNo: r.po_no, createdAt: nv(r.created_at_text), physicalReceipt: r.physical_receipt === true,
      subTotal: nv(r.sub_total), vatRate: Number(r.vat_rate), vatAmount: nv(r.vat_amount),
      modifiedBy: nv(r.modified_by), updatedAt: r.updated_at || "",
    };
    PURCHASE_TEXT.forEach((k) => (p[k] = nv(r[snake(k)])));
    return p;
  });

  const data = { customers, sites, invoices, masterProducts, collections, movements, vans, numbering, reminders, quotes, samples, tasks, taskLog, staff, suppliers, purchases };
  if (skuListsRow && skuListsRow.value) data.skuLists = skuListsRow.value;
  snapshot = rowsFromData(data);
  settingsSnapshot = { numbering: JSON.stringify(numbering), reminders: JSON.stringify(reminders), skuLists: skuListsRow ? JSON.stringify(skuListsRow.value) : undefined };

  if (!customers.length && !sites.length && !invoices.length && !masterProducts.length && !collections.length && !vans.length && !quotes.length && !samples.length && !tasks.length && !suppliers.length && !purchases.length && !settings.length) return null;
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
  const prev = snapshot || rowsFromData({});
  const dc = diff(prev.customers, next.customers);
  const ds = diff(prev.sites, next.sites);
  const di = diff(prev.invoices, next.invoices);
  const dl = diff(prev.items, next.items);
  const dp = diff(prev.picks || new Map(), next.picks);
  const dm = diff(prev.mps, next.mps);
  const dk = diff(prev.comps, next.comps);
  const dco = diff(prev.colls || new Map(), next.colls);
  const dci = diff(prev.collItems || new Map(), next.collItems);
  const dmv = diff(prev.moves || new Map(), next.moves);
  const dv = diff(prev.vans || new Map(), next.vans);
  const dvc = diff(prev.checks || new Map(), next.checks);
  const dq = diff(prev.quotes || new Map(), next.quotes);
  const dqi = diff(prev.quoteItems || new Map(), next.quoteItems);
  const dsm = diff(prev.samples || new Map(), next.samples);
  const dsi = diff(prev.sampleItems || new Map(), next.sampleItems);
  const dtk = diff(prev.tasks || new Map(), next.tasks);
  const dtl = diff(prev.taskLog || new Map(), next.taskLog);
  const dsp = diff(prev.suppliers || new Map(), next.suppliers);
  const dpu = diff(prev.purchases || new Map(), next.purchases);

  const run = async (q) => {
    const { error } = await q;
    if (error) throw new Error(error.message);
  };

  // children first on delete, parents first on upsert
  if (dl.deletes.length) await run(sb.from("invoice_items").delete().in("id", dl.deletes));
  if (dp.deletes.length) await run(sb.from("invoice_picks").delete().in("id", dp.deletes));
  if (di.deletes.length) await run(sb.from("invoices").delete().in("id", di.deletes));
  if (ds.deletes.length) await run(sb.from("customer_sites").delete().in("id", ds.deletes));
  if (dc.deletes.length) await run(sb.from("customers").delete().in("id", dc.deletes));
  if (dk.deletes.length) await run(sb.from("product_components").delete().in("id", dk.deletes));
  if (dm.deletes.length) await run(sb.from("master_products").delete().in("id", dm.deletes));
  if (dc.upserts.length) await run(sb.from("customers").upsert(dc.upserts));
  if (ds.upserts.length) await run(sb.from("customer_sites").upsert(ds.upserts));
  if (di.upserts.length) await run(sb.from("invoices").upsert(di.upserts));
  if (dl.upserts.length) await run(sb.from("invoice_items").upsert(dl.upserts));
  if (dp.upserts.length) await run(sb.from("invoice_picks").upsert(dp.upserts));
  if (dci.deletes.length) await run(sb.from("collection_items").delete().in("id", dci.deletes));
  if (dco.deletes.length) await run(sb.from("collections").delete().in("id", dco.deletes));
  if (dmv.deletes.length) await run(sb.from("stock_movements").delete().in("id", dmv.deletes));
  if (dm.upserts.length) await run(sb.from("master_products").upsert(dm.upserts));
  if (dk.upserts.length) await run(sb.from("product_components").upsert(dk.upserts));
  if (dco.upserts.length) await run(sb.from("collections").upsert(dco.upserts));
  if (dci.upserts.length) await run(sb.from("collection_items").upsert(dci.upserts));
  if (dmv.upserts.length) await run(sb.from("stock_movements").upsert(dmv.upserts));
  if (dvc.deletes.length) await run(sb.from("van_checks").delete().in("id", dvc.deletes));
  if (dv.deletes.length) await run(sb.from("vans").delete().in("id", dv.deletes));
  if (dv.upserts.length) await run(sb.from("vans").upsert(dv.upserts));
  if (dvc.upserts.length) await run(sb.from("van_checks").upsert(dvc.upserts));
  if (quotesReady) {
    if (dqi.deletes.length) await run(sb.from("quote_items").delete().in("id", dqi.deletes));
    if (dq.deletes.length) await run(sb.from("quotes").delete().in("id", dq.deletes));
    if (dq.upserts.length) await run(sb.from("quotes").upsert(dq.upserts));
    if (dqi.upserts.length) await run(sb.from("quote_items").upsert(dqi.upserts));
  }
  if (samplesReady) {
    if (dsi.deletes.length) await run(sb.from("sample_items").delete().in("id", dsi.deletes));
    if (dsm.deletes.length) await run(sb.from("samples").delete().in("id", dsm.deletes));
    if (dsm.upserts.length) await run(sb.from("samples").upsert(dsm.upserts));
    if (dsi.upserts.length) await run(sb.from("sample_items").upsert(dsi.upserts));
  }
  if (purchasesReady) {
    if (dpu.deletes.length) await run(sb.from("purchases").delete().in("id", dpu.deletes));
    if (dsp.deletes.length) await run(sb.from("suppliers").delete().in("id", dsp.deletes));
    if (dsp.upserts.length) await run(sb.from("suppliers").upsert(dsp.upserts));
    if (dpu.upserts.length) await run(sb.from("purchases").upsert(dpu.upserts));
  }
  if (tasksReady) {
    if (dtl.deletes.length) await run(sb.from("task_log").delete().in("id", dtl.deletes));
    if (dtk.deletes.length) await run(sb.from("tasks").delete().in("id", dtk.deletes));
    if (dtk.upserts.length) await run(sb.from("tasks").upsert(dtk.upserts));
    if (dtl.upserts.length) await run(sb.from("task_log").upsert(dtl.upserts));
  }

  const settingsToSave = {
    numbering: d.numbering || { account: 1, site: 1, invoice: 1 },
    reminders: d.reminders || {},
  };
  if (d.skuLists) settingsToSave.skuLists = d.skuLists; // only once someone has edited the SKU lists
  for (const [key, value] of Object.entries(settingsToSave)) {
    const j = JSON.stringify(value);
    if (j !== settingsSnapshot[key]) {
      await run(sb.from("crm_settings").upsert({ key, value }));
      settingsSnapshot[key] = j;
    }
  }

  snapshot = next;
}

// ===== audit log (read-only; the database triggers write it) =====
export async function fetchAuditLog(limit = 200, beforeId = null) {
  const sb = await getSupabase();
  let q = sb.from("audit_log").select("*").order("id", { ascending: false }).limit(limit);
  if (beforeId) q = q.lt("id", beforeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
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

export const gradesSchemaReady = () => gradeReady;
