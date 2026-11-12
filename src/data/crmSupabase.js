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

// length x width on a line (039_line_sizes.sql) - only written once the columns exist
let sizeReady = false;
const sizeCols = (l) => (sizeReady ? { len_m: num(l.lenM), width_m: num(l.widM) } : {});
const sizeOf = (r) => ({ lenM: nv(r.len_m), widM: nv(r.width_m) });

const quoteLineToRow = (l, quoteId, i) => ({
  id: l.id, quote_id: quoteId, code: str(l.code), description: str(l.description), colour: str(l.colour),
  qty: Number(l.qty) || 0, price: Number(l.price) || 0, position: i, ...sizeCols(l),
});

// Sample requests (017_samples.sql): same tolerance as quotes.
let samplesReady = false;
let sample2Ready = false; // samples.followed_up2_date (migration 029)
export const samplesSchemaReady = () => samplesReady;
export const samples2SchemaReady = () => sample2Ready;

const SAMPLE_TEXT = ["customerId", "date", "source", "dispatchMethod", "dispatchedDate", "trackingRef", "followUpDate", "followedUpDate", "project", "notes", "outcome", "lostReason", "convertedInvoiceId", "convertedAt", "raisedBy", "created"];

const sampleToRow = (x, i) => {
  const row = { id: x.id, sample_no: intOrNull(x.sampleNo), followed_up: x.followedUp === true, link_manual: x.linkManual === true, position: i };
  SAMPLE_TEXT.forEach((k) => (row[snake(k)] = str(x[k])));
  if (sample2Ready) row.followed_up2_date = str(x.followedUp2Date);
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
  if (riskReady) { row.risk_flag = str(inv.riskFlag); row.risk_note = str(inv.riskNote); row.risk_checked = str(inv.riskChecked); }
  if (webStatusReady) row.web_status = str(inv.webStatus);
  if (runReady) { row.driver = str(inv.driver); row.drop_no = str(inv.dropNo); }
  if (runNoReady) row.run_no = str(inv.runNo);
  if (reviewDatesReady) { row.review_asked_at = str(inv.reviewAskedAt); row.review_nudged_at = str(inv.reviewNudgedAt); }
  if (servedReady) { row.served_by = str(inv.servedBy); row.source = str(inv.source); }
  return row;
};

const MP_NUM = { priceIncVat: "price_inc_vat", costGbp: "cost_gbp", weightKg: "weight_kg", stock: "stock", stockAlert: "stock_alert" };
const MP_TEXT = ["sku", "name", "colour", "family", "category", "unit", "notes", "importProductId"];

let gradeReady = false; // master_products.grade (migration 023)
let riskReady = false;  // invoices.risk_flag / risk_note / risk_checked (migration 030)
let webStatusReady = false; // invoices.web_status (migration 032)
let runReady = false; // invoices.driver / drop_no (migration 033)
let runNoReady = false; // invoices.run_no (migration 034)
let reviewDatesReady = false; // invoices.review_asked_at / review_nudged_at (migration 053)
let servedReady = false; // invoices.served_by / source (migration 056)
export const reviewDatesSchemaReady = () => reviewDatesReady;
let collRunReady = false; // collections.driver / run_no / drop_no (migration 035)
let collMailReady = false; // collections.emailed_at (migration 042)
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
  ...sizeCols(l),
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
  if (collRunReady) { row.driver = str(c.driver); row.run_no = str(c.runNo); row.drop_no = str(c.dropNo); }
  if (collMailReady) row.emailed_at = str(c.emailedAt);
  return row;
};

const collItemToRow = (it, collectionId, i) => ({
  id: it.id, collection_id: collectionId, sku: str(it.sku), description: str(it.description),
  colour: str(it.colour), qty: Number(it.qty) || 0, unit_cost: num(it.unitCost),
  assigned_invoice_id: str(it.assignedInvoiceId), posted_at: str(it.postedAt), position: i, ...sizeCols(it),
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
  // first page tells us the total, the rest come down in parallel — a big
  // table used to mean a chain of round trips, one after the other
  const page = 1000;
  // paginate on the primary key (indexed, cheap) — sorting by position on big
  // tables was timing out on busy nights; the order screens expect is applied here instead
  const first = await sb.from(table).select("*", { count: "exact" }).order("id").range(0, page - 1);
  if (first.error) throw new Error(first.error.message);
  const out = first.data || [];
  const total = first.count == null ? out.length : first.count;
  if (total > page) {
    const jobs = [];
    for (let from = page; from < total; from += page) jobs.push(sb.from(table).select("*").order("id").range(from, from + page - 1));
    const rest = await Promise.all(jobs);
    for (const r of rest) {
      if (r.error) throw new Error(r.error.message);
      out.push(...r.data);
    }
  }
  out.sort((a, b) => ((Number(a.position) || 0) - (Number(b.position) || 0)) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  return out;
}

let snapshot = null;
let settingsSnapshot = {};

async function loadAll(quick = false) {
  const t0 = performance.now();
  const timings = [];
  const T = (label, p) => {
    const s = performance.now();
    return Promise.resolve(p).then((r) => {
      timings.push({ what: label, ms: Math.round(performance.now() - s), rows: Array.isArray(r) ? r.length : (r && Array.isArray(r.invoices) ? r.invoices.length + "+" + r.items.length : "") });
      return r;
    });
  };
  const sb = await getSupabase();
  timings.push({ what: "client ready", ms: Math.round(performance.now() - t0), rows: "" });
  // quick first paint: one round trip brings the hot slice of the invoice book
  // (open, unpaid, last 90 days) with its lines and picks; stock movements and
  // the task log wait for the background fill that follows straight after.
  let hot = null;
  const hotP = !quick ? Promise.resolve(null) : T("hot slice (rpc)", sb.rpc("crm_hot_invoices", { p_days: 90 }).then((r) => {
    if (!r.error && r.data && Array.isArray(r.data.invoices)) return r.data;
    timings.push({ what: "QUICK PATH OFF — run 061", ms: 0, rows: String((r.error && r.error.message) || "") });
    return null;
  }).catch((e) => { timings.push({ what: "QUICK PATH OFF — run 061", ms: 0, rows: String(e && e.message) }); return null; }));
  hotP.then((h) => { hot = h; });
  const [cs, ss, is_, ls, ps_, mps_, comps_, colls_, collItems_, moves_, vans_, vanChecks_, settings, quoteData, sampleData, taskData, staffRows, purchData] = await Promise.all([
    T("customers", fetchAll(sb, "customers")),
    T("sites", fetchAll(sb, "customer_sites")),
    hotP.then((h) => (h ? h.invoices : T("invoices (full)", fetchAll(sb, "invoices")))),
    hotP.then((h) => (h ? h.items : T("invoice lines (full)", fetchAll(sb, "invoice_items")))),
    hotP.then((h) => (h ? h.picks : T("picks (full)", fetchAll(sb, "invoice_picks")))),
    T("products", fetchAll(sb, "master_products")),
    T("components", fetchAll(sb, "product_components")),
    T("collections", fetchAll(sb, "collections")),
    T("collection items", fetchAll(sb, "collection_items")),
    hotP.then((h) => (h ? [] : T("stock movements", fetchAll(sb, "stock_movements")))),
    T("vans", fetchAll(sb, "vans")),
    T("van checks", fetchAll(sb, "van_checks")),
    (async () => {
      // crm_settings has no position/id ordering columns — plain select
      const { data, error } = await sb.from("crm_settings").select("*");
      if (error) throw new Error(error.message);
      return data;
    })(),
    (async () => {
      // tolerant: a missing quotes table (SQL not run yet) must not stop the CRM loading
      try {
        const [q, qi] = await Promise.all([T("quotes", fetchAll(sb, "quotes")), T("quote items", fetchAll(sb, "quote_items"))]);
        return { q, qi };
      } catch (e) {
        return null;
      }
    })(),
    (async () => {
      try {
        const [sm, si] = await Promise.all([T("samples", fetchAll(sb, "samples")), T("sample items", fetchAll(sb, "sample_items"))]);
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
            if (await hotP) return []; // quick pass: the fill brings the log
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
        let { data, error } = await sb.from("profiles").select("email, full_name, role, driver_name");
        if (error) ({ data, error } = await sb.from("profiles").select("email, full_name, role"));
        return error ? [] : data || [];
      } catch (e) {
        return [];
      }
    })(),
    (async () => {
      try {
        const [sp, pu] = await Promise.all([T("suppliers", fetchAll(sb, "suppliers")), T("purchases", fetchAll(sb, "purchases"))]);
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
  const sampleEmailsRow = settingRow("sampleEmails");
  const reviewSettingsRow = settingRow("reviewSettings");
  const dsNotifyRow = settingRow("dsNotify");
  const dsRunOrderRow = settingRow("dsRunOrder");
  const driverPhonesRow = settingRow("driverPhones");
  const fleetCostsRow = settingRow("fleetCosts");
  sample2Ready = !!(sampleData && sampleData.sm && sampleData.sm.length && Object.prototype.hasOwnProperty.call(sampleData.sm[0], "followed_up2_date"));

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
  sizeReady = ls.length ? Object.prototype.hasOwnProperty.call(ls[0], "len_m") : collItems_.length ? Object.prototype.hasOwnProperty.call(collItems_[0], "len_m") : sizeReady;
  ls.forEach((r) => {
    (linesByInv[r.invoice_id] = linesByInv[r.invoice_id] || []).push({
      id: r.id, code: r.code, description: r.description, colour: r.colour,
      qty: nv(r.qty) === "" ? "" : Number(r.qty), price: nv(r.price) === "" ? "" : Number(r.price), ...sizeOf(r),
    });
  });
  // which optional invoice columns exist — decided before reading rows so the mapping below can use them
  riskReady = is_.length ? Object.prototype.hasOwnProperty.call(is_[0], "risk_flag") : riskReady;
  webStatusReady = is_.length ? Object.prototype.hasOwnProperty.call(is_[0], "web_status") : webStatusReady;
  runReady = is_.length ? Object.prototype.hasOwnProperty.call(is_[0], "drop_no") : runReady;
  runNoReady = is_.length ? Object.prototype.hasOwnProperty.call(is_[0], "run_no") : runNoReady;
  reviewDatesReady = is_.length ? Object.prototype.hasOwnProperty.call(is_[0], "review_asked_at") : reviewDatesReady;
  servedReady = is_.length ? Object.prototype.hasOwnProperty.call(is_[0], "served_by") : servedReady;
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
    inv.webStatus = nv(r.web_status);
    inv.driver = nv(r.driver); inv.dropNo = nv(r.drop_no); inv.runNo = nv(r.run_no);
    inv.reviewAskedAt = nv(r.review_asked_at); inv.reviewNudgedAt = nv(r.review_nudged_at);
    inv.servedBy = nv(r.served_by); inv.source = nv(r.source);
    // old "Delivery Run 2" job types: job type Delivery, run 2 (once the run column exists)
    { const m = runNoReady && /^\s*Delivery Run\s*(\d+)\s*$/i.exec(inv.jobType || ""); if (m) { inv.jobType = "Delivery"; if (!inv.runNo) inv.runNo = m[1]; } }
    inv.riskFlag = nv(r.risk_flag); inv.riskNote = nv(r.risk_note); inv.riskChecked = nv(r.risk_checked);
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
      assignedInvoiceId: nv(r.assigned_invoice_id), postedAt: nv(r.posted_at), ...sizeOf(r),
    });
  });
  collRunReady = colls_.length ? Object.prototype.hasOwnProperty.call(colls_[0], "run_no") : collRunReady;
  collMailReady = colls_.length ? Object.prototype.hasOwnProperty.call(colls_[0], "emailed_at") : collMailReady;
  const collections = colls_.map((r) => {
    const c = { id: r.id, collectionNo: r.collection_no, collected: r.collected === true, items: itemsByColl[r.id] || [] };
    COLL_TEXT.forEach((k) => (c[k] = nv(r[snake(k)])));
    c.supplierId = nv(r.supplier_id);
    c.driver = nv(r.driver); c.runNo = nv(r.run_no); c.dropNo = nv(r.drop_no);
    c.emailedAt = nv(r.emailed_at);
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
      qty: nv(r.qty) === "" ? "" : Number(r.qty), price: nv(r.price) === "" ? "" : Number(r.price), ...sizeOf(r),
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
    x.followedUp2Date = nv(r.followed_up2_date);
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
  const staff = (staffRows || []).filter((r) => r.email).map((r) => ({ email: r.email, name: nv(r.full_name), role: nv(r.role), driverName: nv(r.driver_name) }));

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
  if (sampleEmailsRow && sampleEmailsRow.value) data.sampleEmails = sampleEmailsRow.value;
  if (reviewSettingsRow && reviewSettingsRow.value) data.reviewSettings = reviewSettingsRow.value;
  if (dsNotifyRow && dsNotifyRow.value) data.dsNotify = dsNotifyRow.value;
  if (dsRunOrderRow && dsRunOrderRow.value) data.dsRunOrder = dsRunOrderRow.value;
  if (driverPhonesRow && driverPhonesRow.value) data.driverPhones = driverPhonesRow.value;
  if (fleetCostsRow && fleetCostsRow.value) data.fleetCosts = fleetCostsRow.value;
  // columns the screens need that the database doesn't have yet (an SQL file still to run)
  data.schemaMissing = [...(is_.length && !runNoReady ? ["run_no"] : []), ...(is_.length && !runReady ? ["drop_no"] : []), ...(colls_.length && !collRunReady ? ["coll_run"] : [])];
  const fmRow = settingRow("fmBridgeLast"); // FileMaker feed status (written by fm_sync, read-only here)
  if (fmRow && fmRow.value) data.fmBridge = fmRow.value;
  const wooRow = settingRow("wooBridgeLast"); // website feed status (written by woo_sync)
  if (wooRow && wooRow.value) data.wooBridge = wooRow.value;
  // NOT adopted here: what this screen last saved/loaded only changes when the screen actually shows this
  // data (commit below). A refresh that was skipped because someone was typing must not move the baseline,
  // or the next save would think everything new since was deleted - and delete it.
  const snap = rowsFromData(data);
  const sset = { numbering: JSON.stringify(numbering), reminders: JSON.stringify(reminders), skuLists: skuListsRow ? JSON.stringify(skuListsRow.value) : undefined, sampleEmails: sampleEmailsRow ? JSON.stringify(sampleEmailsRow.value) : undefined, dsNotify: dsNotifyRow ? JSON.stringify(dsNotifyRow.value) : undefined, dsRunOrder: dsRunOrderRow ? JSON.stringify(dsRunOrderRow.value) : undefined, driverPhones: driverPhonesRow ? JSON.stringify(driverPhonesRow.value) : undefined, fleetCosts: fleetCostsRow ? JSON.stringify(fleetCostsRow.value) : undefined, reviewSettings: reviewSettingsRow ? JSON.stringify(reviewSettingsRow.value) : undefined };

  if (!customers.length && !sites.length && !invoices.length && !masterProducts.length && !collections.length && !vans.length && !quotes.length && !samples.length && !tasks.length && !suppliers.length && !purchases.length && !settings.length) return null;
  try {
    timings.push({ what: (hot ? "QUICK load total" : "FULL load total"), ms: Math.round(performance.now() - t0), rows: "" });
    console.log("[dk-load] " + (hot ? "quick" : "full") + " " + Math.round(performance.now() - t0) + "ms");
    console.table(timings);
  } catch (e) { /* console closed */ }
  return { data, commit: () => { snapshot = snap; settingsSnapshot = sset; }, partial: !!hot };
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

  // One record the database refuses must never stop everything else saving: if a batch fails, each row
  // is tried on its own, the good ones go in, and only the refused ones are kept back to retry (and reported).
  const failed = []; // { key, id, op, msg, label }
  const labelOf = (key, r) => (key === "invoices" && r && r.inv_no ? "job #" + r.inv_no : key === "customers" && r && r.name ? "account " + r.name : key.replace(/s$/, "") + " " + (r && r.id));
  // job numbers: the database has the final say (057 renumbers a clash), so read back what it kept
  const renumbered = []; // { id, from, to }
  const readBack = (sent, got) => {
    (got || []).forEach((g) => {
      const r = sent.find((x) => x.id === g.id);
      if (r && g.inv_no != null && Number(g.inv_no) !== Number(r.inv_no)) {
        renumbered.push({ id: g.id, from: r.inv_no, to: Number(g.inv_no) });
        r.inv_no = Number(g.inv_no); // the snapshot matches the database
      }
    });
  };
  // account numbers likewise (058 hands one out, or moves a clash on)
  const accountNos = []; // { id, to }
  const readAcct = (sent, got) => {
    (got || []).forEach((g) => {
      const r = sent.find((x) => x.id === g.id);
      if (r && g.account_no != null && Number(g.account_no) !== Number(r.account_no)) {
        accountNos.push({ id: g.id, to: Number(g.account_no) });
        r.account_no = Number(g.account_no);
      }
    });
  };
  const up_ = async (table, key, rows) => {
    if (!rows.length) return;
    const back = table === "invoices" ? ["id,inv_no", readBack] : table === "customers" ? ["id,account_no", readAcct] : null;
    const { data, error } = back ? await sb.from(table).upsert(rows).select(back[0]) : await sb.from(table).upsert(rows);
    if (!error) { if (back) back[1](rows, data); return; }
    for (const r of rows) {
      const { data: d1, error: e } = back ? await sb.from(table).upsert(r).select(back[0]) : await sb.from(table).upsert(r);
      if (e) failed.push({ key, id: r.id, op: "save", msg: e.message, label: labelOf(key, r) });
      else if (back) back[1]([r], d1);
    }
  };
  // Two people often have the same record open (one books the delivery date while
  // another takes a payment). Saves are whole rows, so the later save used to wipe
  // the earlier one's columns. Before writing, read what the database holds NOW and
  // merge column by column: a column someone else changed — and we didn't — keeps
  // their value. Only a column BOTH changed takes ours.
  const eqCol = (a, b) => a === b || JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  const merge3 = async (table, prevMap, rows) => {
    if (!rows.length || !prevMap) return;
    const skip = new Set(["id", "position", "created_at", "created_by", "updated_at", "updated_by"]);
    try {
      const { data } = await sb.from(table).select("*").in("id", rows.map((r) => r.id));
      const dbBy = new Map((data || []).map((r) => [r.id, r]));
      rows.forEach((r) => {
        const db = dbBy.get(r.id), base = prevMap.get(r.id);
        if (!db || !base) return; // brand new row, or nothing to compare against
        Object.keys(r).forEach((k) => {
          if (skip.has(k) || !(k in db)) return;
          if (!eqCol(db[k], base[k]) && eqCol(r[k], base[k])) r[k] = db[k]; // they changed it, we didn't — theirs stands
        });
      });
    } catch (e) { /* merge is best-effort — the save itself still goes ahead */ }
  };

  // A save should never be able to wipe swathes of records: if a client's copy has
  // somehow lost a chunk of a parent table, refuse the mass delete and say so.
  const guardDeletes = (key, ids, label) => {
    if (ids.length <= 30) return ids;
    failed.push({ key, id: "", op: "delete", msg: "refused: one save tried to delete " + ids.length + " " + label + " — reload the page and try again", label: ids.length + " " + label });
    return [];
  };

  const del_ = async (table, key, ids) => {
    if (!ids.length) return;
    const { error } = await sb.from(table).delete().in("id", ids);
    if (!error) return;
    for (const id of ids) {
      const { error: e } = await sb.from(table).delete().eq("id", id);
      if (e) failed.push({ key, id, op: "delete", msg: e.message, label: labelOf(key, (prev[key] && prev[key].get(id)) || { id }) });
    }
  };

  // children first on delete, parents first on upsert
  await del_("invoice_items", "items", dl.deletes);
  await del_("invoice_picks", "picks", dp.deletes);
  await del_("invoices", "invoices", guardDeletes("invoices", di.deletes, "jobs"));
  await del_("customer_sites", "sites", ds.deletes);
  await del_("customers", "customers", guardDeletes("customers", dc.deletes, "accounts"));
  await del_("product_components", "comps", dk.deletes);
  await del_("master_products", "mps", dm.deletes);
  await merge3("customers", prev.customers, dc.upserts);
  await merge3("customer_sites", prev.sites, ds.upserts);
  await merge3("invoices", prev.invoices, di.upserts);
  await merge3("invoice_items", prev.items, dl.upserts);
  await up_("customers", "customers", dc.upserts);
  await up_("customer_sites", "sites", ds.upserts);
  await up_("invoices", "invoices", di.upserts);
  await up_("invoice_items", "items", dl.upserts);
  await up_("invoice_picks", "picks", dp.upserts);
  await del_("collection_items", "collItems", dci.deletes);
  await del_("collections", "colls", dco.deletes);
  await del_("stock_movements", "moves", dmv.deletes);
  await up_("master_products", "mps", dm.upserts);
  await up_("product_components", "comps", dk.upserts);
  await up_("collections", "colls", dco.upserts);
  await up_("collection_items", "collItems", dci.upserts);
  await up_("stock_movements", "moves", dmv.upserts);
  await del_("van_checks", "checks", dvc.deletes);
  await del_("vans", "vans", dv.deletes);
  await up_("vans", "vans", dv.upserts);
  await up_("van_checks", "checks", dvc.upserts);
  if (quotesReady) {
    await del_("quote_items", "quoteItems", dqi.deletes);
    await del_("quotes", "quotes", dq.deletes);
    await up_("quotes", "quotes", dq.upserts);
    await up_("quote_items", "quoteItems", dqi.upserts);
  }
  if (samplesReady) {
    await del_("sample_items", "sampleItems", dsi.deletes);
    await del_("samples", "samples", dsm.deletes);
    await up_("samples", "samples", dsm.upserts);
    await up_("sample_items", "sampleItems", dsi.upserts);
  }
  if (purchasesReady) {
    await del_("purchases", "purchases", dpu.deletes);
    await del_("suppliers", "suppliers", dsp.deletes);
    await up_("suppliers", "suppliers", dsp.upserts);
    await up_("purchases", "purchases", dpu.upserts);
  }
  if (tasksReady) {
    await del_("task_log", "taskLog", dtl.deletes);
    await del_("tasks", "tasks", dtk.deletes);
    await up_("tasks", "tasks", dtk.upserts);
    await up_("task_log", "taskLog", dtl.upserts);
  }

  const settingsToSave = {
    numbering: d.numbering || { account: 1, site: 1, invoice: 1 },
    reminders: d.reminders || {},
  };
  if (d.skuLists) settingsToSave.skuLists = d.skuLists; // only once someone has edited the SKU lists
  if (d.sampleEmails) settingsToSave.sampleEmails = d.sampleEmails;
  if (d.dsNotify) settingsToSave.dsNotify = d.dsNotify; // who's been told their delivery date (Delivery Schedule)
  if (d.dsRunOrder) settingsToSave.dsRunOrder = d.dsRunOrder; // the order the runs go out in, per day (Delivery Schedule)
  if (d.fleetCosts) settingsToSave.fleetCosts = d.fleetCosts; // driver tracking: diesel price, mpg, driver rate
  if (d.driverPhones) settingsToSave.driverPhones = d.driverPhones; // drivers' mobiles, for sending them their run on WhatsApp
  if (d.reviewSettings) settingsToSave.reviewSettings = d.reviewSettings; // Google link, ask templates, opt-outs, bulk rules
  for (const [key, value] of Object.entries(settingsToSave)) {
    const j = JSON.stringify(value);
    if (j !== settingsSnapshot[key]) {
      await run(sb.from("crm_settings").upsert({ key, value }));
      settingsSnapshot[key] = j;
    }
  }

  // whatever was refused stays "unsaved" so the next save tries it again
  failed.forEach((f) => {
    const was = prev[f.key] && prev[f.key].get(f.id);
    if (!next[f.key]) return;
    if (was) next[f.key].set(f.id, was); else next[f.key].delete(f.id);
  });
  snapshot = next;
  if (failed.length) {
    const err = new Error(failed.slice(0, 3).map((f) => "Couldn't " + f.op + " " + f.label + ": " + f.msg).join(" · ") + (failed.length > 3 ? " · +" + (failed.length - 3) + " more" : ""));
    err.partial = true;
    err.renumbered = renumbered;
    err.accountNos = accountNos;
    throw err;
  }
  return { renumbered, accountNos };
}

// ===== live refresh: the newest change someone else made (FileMaker, the website, another member of staff) =====
// one tiny query against the audit log, so it can run every few seconds; the feeds' own status rows are ignored
export async function latestOtherChange(myEmail) {
  const sb = await getSupabase();
  let q = sb.from("audit_log").select("id").not("record_id", "in", "(fmBridgeLast,wooBridgeLast)").order("id", { ascending: false }).limit(1);
  if (myEmail) q = q.neq("actor", myEmail);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data && data[0] ? Number(data[0].id) : 0;
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
    if (key === "dk-crm-quick") {
      const d = await loadAll(true);
      return d === null ? null : { key, value: JSON.stringify(d.data), commit: d.commit, partial: d.partial };
    }
    if (key !== "dk-crm") return null;
    const d = await loadAll();
    // commit(): call it when this data is put on screen - it becomes the baseline the next save compares against
    return d === null ? null : { key, value: JSON.stringify(d.data), commit: d.commit };
  },
  async set(key, value) {
    if (key !== "dk-crm") return { key, value };
    const r = await saveAll(JSON.parse(value));
    return { key, value, renumbered: (r && r.renumbered) || [], accountNos: (r && r.accountNos) || [] };
  },
};

export const gradesSchemaReady = () => gradeReady;
export const riskSchemaReady = () => riskReady;
