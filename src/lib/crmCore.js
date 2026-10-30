// CRM domain helpers: customers, sites, invoices, delivery schedule.
import { uid, daysBetween, landedPerPiece, addDays } from "./core.js";

export const JOB_TYPES = ["Delivery Run 1", "Delivery Run 2", "Delivery Run 3", "Customer Collection", "Evri", "Post Office", "Courier TG", "Returns"];
// "collection" anywhere in the job type means the customer picks up — no van run
export const isCollectionJob = (inv) => /collection/i.test(inv && inv.jobType ? inv.jobType : "");
export const PAYMENT_TYPES = ["COD", "Stripe", "Transfer", "Card", "Cash", "Post"];
export const SOURCES = ["Website", "Market Place", "Repeat", "Transfer", "Word of Mouth", "Walk-in"];
// sentinel siteId for walk-in/trade-counter jobs: no delivery site, the
// customer collects from the warehouse
export const TRADE_COUNTER = "__trade_counter__";
export const TRADE_COUNTER_LABEL = "Trade counter collection";

export const CONTACT_METHODS = ["Text", "WhatsApp", "WhatsApp Business", "Messenger", "Email", "Phone"];
export const VANS = ["Vauxhall", "Renault", "Sprinter"];

// delivery time slots, FileMaker order: AM / PM / TBC then quarter hours
export const TIME_SLOTS = (() => {
  const out = ["AM", "PM", "TBC"];
  for (let h = 8; h <= 18; h++)
    for (const m of ["00", "15", "30", "45"]) {
      if (h === 18 && m !== "00") break;
      out.push(String(h).padStart(2, "0") + ":" + m);
    }
  return out;
})();

// ===== vans (fleet) =====
export const VAN_CHECK_ITEMS = [
  ["tyres", "Tyres & pressures"],
  ["lights", "Lights & indicators"],
  ["oil", "Oil level"],
  ["coolant", "Coolant & washer fluid"],
  ["brakes", "Brakes & horn"],
  ["bodywork", "Bodywork & mirrors"],
  ["loadArea", "Load area, straps & tail lift"],
];

export const blankVan = () => ({
  id: uid(),
  name: "",
  reg: "",
  makeModel: "",
  insurer: "",
  policyNo: "",
  insuranceRenewal: "",
  motDue: "",
  taxDue: "",
  serviceDue: "",
  notes: "",
  active: true,
  checks: [],
});

export const blankVanCheck = () => {
  const c = { id: uid(), date: today(), by: "", mileage: "", defects: "" };
  VAN_CHECK_ITEMS.forEach(([k]) => (c[k] = true));
  return c;
};

// days until a stored date (negative = overdue), null when unset
export const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const d = daysBetween(today(), dateStr);
  return d === null ? null : d;
};

// Monday of the week containing dateStr (reminder weeks run Mon-Sun)
export const mondayOf = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

export const RENEWAL_FIELDS = [
  ["insuranceRenewal", "Insurance"],
  ["motDue", "MOT"],
  ["taxDue", "Tax"],
  ["serviceDue", "Service"],
];

// Pop-up reminders: weekly van check each Monday until that week's check is
// recorded; renewals from 30 days before expiry, re-nagging weekly until the
// date is moved on. crm.reminders holds when each was last snoozed.
export const vanReminders = (crm) => {
  const tod = today();
  const weekStart = mondayOf(tod);
  const snoozes = crm.reminders || {};
  const out = [];
  (crm.vans || []).forEach((v) => {
    if (v.active === false) return;
    // weekly check
    const checkedThisWeek = (v.checks || []).some((c) => (c.date || "") >= weekStart);
    if (!checkedThisWeek) {
      const key = "check:" + v.id;
      if (!snoozes[key] || snoozes[key] < weekStart) {
        const last = (v.checks || []).map((c) => c.date).sort().pop();
        out.push({ key, van: v, kind: "check", label: (v.name || "Van") + " — weekly check due" + (last ? " (last checked " + last + ")" : " (never checked)"), severity: "amber" });
      }
    }
    // renewals
    RENEWAL_FIELDS.forEach(([k, label]) => {
      const d = daysUntil(v[k]);
      if (d === null || d > 30) return;
      const key = "renew:" + v.id + ":" + k;
      const snoozed = snoozes[key] && daysBetween(snoozes[key], tod) < 7;
      if (snoozed) return;
      out.push({
        key, van: v, kind: "renewal",
        label: (v.name || "Van") + " — " + label + " " + (d < 0 ? Math.abs(d) + " day" + (Math.abs(d) === 1 ? "" : "s") + " OVERDUE" : d === 0 ? "due TODAY" : "due in " + d + " day" + (d === 1 ? "" : "s")),
        date: v[k],
        severity: d <= 7 ? "red" : "amber",
      });
    });
  });
  return out;
};

// the van names offered on invoices/collections: the fleet if defined, else defaults
export const vanOptions = (crm) => {
  const names = (crm.vans || []).filter((v) => v.active !== false && (v.name || "").trim()).map((v) => v.name.trim());
  return names.length ? names : VANS;
};

// local calendar date (toISOString would give yesterday between midnight and 1am in BST)
export const today = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

export const blankCustomer = () => ({
  id: uid(),
  accountNo: null,
  name: "",
  address: "",
  town: "",
  postcode: "",
  contact: "",
  landline: "",
  mobile: "",
  email: "",
  source: "",
  trader: false,
  discountPct: "",
  contactMethod: "",
  created: today(),
  createdBy: "",
  modifiedBy: "",
});

export const blankSite = (customerId) => ({
  id: uid(),
  customerId,
  siteNo: null,
  name: "",
  address: "",
  town: "",
  postcode: "",
  contact: "",
  landline: "",
  mobile: "",
  email: "",
  notes: "",
});

export const blankInvoice = (customerId, siteId) => ({
  id: uid(),
  invNo: null,
  customerId: customerId || "",
  siteId: siteId || "",
  date: today(),
  orderRef: "",
  jobType: "Delivery Run 1",
  van: "",
  weightKg: "",
  deliveryDate: "",
  deliveryTime: "",
  deliveryCompleted: false,
  paymentType: "",
  paymentDate: "",
  deliveryCharge: "",
  discountPct: "",
  vatRate: 20,
  vatInclusive: true,
  jobNotes: "",
  raisedBy: "",
  stockDeducted: "",
  quoteId: "",
  created: today(),
  flags: {
    booked: false,
    courier: false,
    partsOrdered: false,
    partsReady: false,
    paymentLink: false,
    reviewRequested: false,
    reviewReceived: false,
    photosRequested: false,
    socialPosted: false,
    sampleFollowed: false,
  },
  lines: [],
  picks: [],
});

// One row of the loading bill once it's being picked: which batch (shipment)
// the stock actually came from, so real landed cost flows into the job cost.
export const blankPick = () => ({
  id: uid(),
  sku: "",
  description: "",
  colour: "",
  qty: "",
  shipmentId: "",
  batchRef: "",
  unitCost: "",
  picked: false,
});

export const blankCollection = () => ({
  id: uid(),
  collectionNo: null,
  supplierId: "",
  supplier: "",
  address: "",
  town: "",
  postcode: "",
  contact: "",
  phone: "",
  date: today(),
  collectDate: "",
  collectTime: "",
  van: "",
  collected: false,
  postedAt: "",
  assignedInvoiceId: "",
  notes: "",
  raisedBy: "",
  items: [],
});

export const blankCollectionItem = () => ({ id: uid(), sku: "", description: "", colour: "", qty: "", unitCost: "", assignedInvoiceId: "", postedAt: "" });

export const itemPending = (it) => !it.postedAt && !it.assignedInvoiceId;

export const collectionProgress = (c) => {
  const items = c.items || [];
  const done = items.filter((it) => !itemPending(it)).length;
  return { total: items.length, done, pending: items.length - done };
};

// Commit ONE collection item into stock (weighted-average cost, movement row).
export const commitCollectionItem = (c, coll, item, actor) => {
  if (!itemPending(item)) return false;
  const mp = (c.masterProducts || []).find((m) => (m.sku || "").trim().toLowerCase() === (item.sku || "").trim().toLowerCase());
  if (!mp) return false;
  const q = Number(item.qty) || 0;
  const oldStock = mp.stock === "" || mp.stock === null ? 0 : Number(mp.stock);
  if (item.unitCost !== "" && item.unitCost !== null) mp.costGbp = weightedCost(oldStock, mp.costGbp, q, Number(item.unitCost));
  mp.stock = oldStock + q;
  c.movements.push({ ...blankMovement(), sku: mp.sku, mpId: mp.id, qty: q, unitCost: item.unitCost === "" ? "" : Number(item.unitCost), kind: "collection", ref: "COL-" + (coll.collectionNo || ""), actor: actor || "" });
  item.postedAt = today();
  return true;
};

// Assign ONE collection item straight to a job: it lands on the invoice's
// pick list at purchase cost (batch COL-n); stock is not touched.
export const assignCollectionItem = (c, coll, item, invoiceId) => {
  if (!itemPending(item)) return false;
  const inv = (c.invoices || []).find((i) => i.id === invoiceId);
  if (!inv) return false;
  inv.picks = inv.picks || [];
  inv.picks.push({ ...blankPick(), sku: item.sku, description: item.description, colour: item.colour, qty: item.qty, batchRef: "COL-" + (coll.collectionNo || ""), unitCost: item.unitCost, picked: true });
  item.assignedInvoiceId = invoiceId;
  if (explodeInvoiceLines(inv, c).length) reconcilePicks(inv, c); // stock picks net off what this collection covers
  return true;
};

export const blankMovement = () => ({ id: uid(), at: new Date().toISOString(), sku: "", mpId: "", qty: 0, unitCost: "", kind: "", ref: "" });

export const blankLine = () => ({ id: uid(), code: "", description: "", colour: "", qty: "", price: "" });

export const blankMasterProduct = () => ({
  id: uid(),
  sku: "",
  name: "",
  colour: "",
  family: "",
  category: "",
  unit: "each",
  priceIncVat: "",
  costGbp: "",
  weightKg: "",
  isKit: false,
  stock: "",
  stockAlert: "",
  active: true,
  notes: "",
  importProductId: "",
  components: [],
});

export const blankComponent = () => ({ id: uid(), componentId: "", qty: 1 });

export const emptyCrm = () => ({
  customers: [],
  sites: [],
  invoices: [],
  masterProducts: [],
  collections: [],
  movements: [],
  vans: [],
  reminders: {},
  quotes: [],
  samples: [],
  tasks: [],
  taskLog: [],
  suppliers: [],
  purchases: [],
  staff: [],
  numbering: { account: 1, site: 1, invoice: 1, collection: 1, quote: 1, sample: 1 },
});

// Ensure older blobs gain any fields added later.
export const normaliseCrm = (c) => {
  const d = c && typeof c === "object" ? c : {};
  d.customers = Array.isArray(d.customers) ? d.customers : [];
  d.sites = Array.isArray(d.sites) ? d.sites : [];
  d.invoices = Array.isArray(d.invoices) ? d.invoices : [];
  d.numbering = d.numbering && typeof d.numbering === "object" ? d.numbering : {};
  if (!d.numbering.account) d.numbering.account = 1;
  if (!d.numbering.site) d.numbering.site = 1;
  if (!d.numbering.invoice) d.numbering.invoice = 1;
  if (!d.numbering.collection) d.numbering.collection = 1;
  if (!d.numbering.quote) d.numbering.quote = 1;
  if (!d.numbering.sample) d.numbering.sample = 1;
  d.tasks = Array.isArray(d.tasks) ? d.tasks : [];
  d.tasks.forEach((x) => {
    Object.assign(x, { ...blankTask(x.kind), ...x, id: x.id || uid() });
    x.assignees = Array.isArray(x.assignees) ? x.assignees : [];
  });
  d.taskLog = Array.isArray(d.taskLog) ? d.taskLog : [];
  d.staff = Array.isArray(d.staff) ? d.staff : [];
  if (!d.numbering.purchase) d.numbering.purchase = 1;
  if (!d.numbering.supplier) d.numbering.supplier = 1;
  d.suppliers = Array.isArray(d.suppliers) ? d.suppliers : [];
  d.suppliers.forEach((x) => Object.assign(x, { ...blankSupplier(), ...x, id: x.id || uid() }));
  d.purchases = Array.isArray(d.purchases) ? d.purchases : [];
  d.purchases.forEach((x) => Object.assign(x, { ...blankPurchase(x.supplierId), ...x, id: x.id || uid() }));
  d.samples = Array.isArray(d.samples) ? d.samples : [];
  d.samples.forEach((x) => {
    Object.assign(x, { ...blankSample(x.customerId), ...x, id: x.id || uid() });
    x.items = Array.isArray(x.items) ? x.items : [];
    x.items.forEach((it) => Object.assign(it, { ...blankSampleItem(), ...it, id: it.id || uid() }));
  });
  d.quotes = Array.isArray(d.quotes) ? d.quotes : [];
  d.quotes.forEach((x) => {
    Object.assign(x, { ...blankQuote(x.customerId, x.siteId), ...x, id: x.id || uid() });
    x.lines = Array.isArray(x.lines) ? x.lines : [];
    x.lines.forEach((l) => Object.assign(l, { ...blankLine(), ...l, id: l.id || uid() }));
  });
  d.collections = Array.isArray(d.collections) ? d.collections : [];
  d.collections.forEach((x) => {
    Object.assign(x, { ...blankCollection(), ...x, id: x.id || uid() });
    x.items = Array.isArray(x.items) ? x.items : [];
    x.items.forEach((c) => Object.assign(c, { ...blankCollectionItem(), ...c, id: c.id || uid() }));
  });
  d.movements = Array.isArray(d.movements) ? d.movements : [];
  d.movements.forEach((m) => Object.assign(m, { ...blankMovement(), ...m, id: m.id || uid() }));
  d.reminders = d.reminders && typeof d.reminders === "object" ? d.reminders : {};
  d.vans = Array.isArray(d.vans) ? d.vans : [];
  d.vans.forEach((v) => {
    Object.assign(v, { ...blankVan(), ...v, id: v.id || uid() });
    v.checks = Array.isArray(v.checks) ? v.checks : [];
    v.checks.forEach((c) => Object.assign(c, { ...blankVanCheck(), ...c, id: c.id || uid(), date: c.date || "" }));
  });
  d.masterProducts = Array.isArray(d.masterProducts) ? d.masterProducts : [];
  d.masterProducts.forEach((x) => {
    Object.assign(x, { ...blankMasterProduct(), ...x, id: x.id || uid() });
    x.components = Array.isArray(x.components) ? x.components : [];
    x.components.forEach((c) => Object.assign(c, { ...blankComponent(), ...c, id: c.id || uid() }));
  });
  d.customers.forEach((x) => Object.assign(x, { ...blankCustomer(), ...x, id: x.id || uid() }));
  d.sites.forEach((x) => Object.assign(x, { ...blankSite(x.customerId), ...x, id: x.id || uid() }));
  d.invoices.forEach((x) => {
    const b = blankInvoice(x.customerId, x.siteId);
    Object.assign(x, { ...b, ...x, id: x.id || uid() });
    x.flags = { ...b.flags, ...(x.flags || {}) };
    x.lines = Array.isArray(x.lines) ? x.lines : [];
    x.lines.forEach((l) => Object.assign(l, { ...blankLine(), ...l, id: l.id || uid() }));
    x.picks = Array.isArray(x.picks) ? x.picks : [];
    x.picks.forEach((p) => Object.assign(p, { ...blankPick(), ...p, id: p.id || uid() }));
  });
  return d;
};

// Fresh numbers continue from whichever is higher: the stored "next" or max existing + 1,
// so an import of historical records automatically moves the sequence on.
export const nextNumber = (list, field, storedNext) => {
  let max = 0;
  list.forEach((x) => {
    const n = Number(x[field]);
    if (isFinite(n) && n > max) max = n;
  });
  return Math.max(Number(storedNext) || 1, max + 1);
};

// ===== invoice money (prices entered inc VAT; VAT backed out of the total) =====
export const invoiceTotals = (inv) => {
  const goods = (inv.lines || []).reduce((t, l) => t + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
  const discountPct = Number(inv.discountPct) || 0;
  const discount = goods * (discountPct / 100);
  const delivery = Number(inv.deliveryCharge) || 0;
  const total = goods - discount + delivery;
  const rate = isFinite(Number(inv.vatRate)) ? Number(inv.vatRate) : 20;
  const vat = total - total / (1 + rate / 100);
  return { goods, discountPct, discount, delivery, total, vat, net: total - vat };
};

export const gbp = (n) =>
  "£" + (isFinite(n) ? n : 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ===== workflow definitions (prep then follow-up) =====
export const PREP_FLAGS = [
  ["booked", "Booked with customer", "cal"],
  ["courier", "Courier instructed", "truck"],
  ["partsOrdered", "Parts ordered", "box"],
  ["partsReady", "Parts ready", "ready"],
  ["paymentLink", "Payment link sent", "link"],
];
export const FOLLOWUP_FLAGS = [
  ["reviewRequested", "Review requested", "star"],
  ["reviewReceived", "Review received", "star"],
  ["photosRequested", "Photos requested", "cam"],
  ["socialPosted", "Social post created", "share"],
  ["sampleFollowed", "Sample followed up", "leaf"],
];

export const isPaid = (inv) => Boolean(inv.paymentDate);

// Row colour for the schedule: red = no date, gold = collection,
// green = prep complete (courier n/a for collections; payment link or payment taken), amber = outstanding.
export const scheduleStatus = (inv) => {
  if (!inv.deliveryDate) return "red";
  if (isCollectionJob(inv)) return "gold";
  const f = inv.flags || {};
  const prepDone =
    f.booked && f.partsOrdered && f.partsReady && (f.courier || inv.van) && (f.paymentLink || isPaid(inv));
  return inv.deliveryCompleted || prepDone ? "green" : "amber";
};

export const STRIPE_COLOURS = { green: "#3FA55C", amber: "#E8912D", gold: "#F4B73E", red: "#C8102E" };

export const daysSinceRaised = (inv) => {
  const d = daysBetween(inv.date, today());
  return d === null ? null : d;
};

export const followUpDone = (inv) => FOLLOWUP_FLAGS.filter(([k]) => inv.flags && inv.flags[k]).length;

// ===== field formatting (applied on blur, FileMaker style) =====
export const titleCase = (s) =>
  String(s || "").replace(/\S+/g, (w) => (/^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w));

// 11-digit UK numbers: mobiles 07951-728-742 (5-3-3), landlines 0161-320-9664 (4-3-4)
export const formatPhone = (s) => {
  const d = String(s || "").replace(/\D/g, "");
  if (d.length === 11)
    return d.startsWith("07")
      ? d.slice(0, 5) + "-" + d.slice(5, 8) + "-" + d.slice(8)
      : d.slice(0, 4) + "-" + d.slice(4, 7) + "-" + d.slice(7);
  return String(s || "").trim();
};

// OL6-6UG: outward-inward with a hyphen, uppercase
export const formatPostcode = (s) => {
  const c = String(s || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (c.length >= 5 && c.length <= 7) return c.slice(0, -3) + "-" + c.slice(-3);
  return String(s || "").trim().toUpperCase();
};

// which formatter belongs to which field name, shared by the record modals
export const FIELD_FORMATS = {
  name: titleCase,
  address: titleCase,
  town: titleCase,
  contact: titleCase,
  supplier: titleCase,
  source: titleCase,
  landline: formatPhone,
  mobile: formatPhone,
  phone: formatPhone,
  postcode: formatPostcode,
  email: (s) => String(s || "").trim().toLowerCase(),
};

// ===== auto-generated SKUs: the stock table mirrors the Products screen =====
const skuPart = (name) => {
  let size = "";
  const words = [];
  String(name || "").split(/\s+/).forEach((w) => {
    const m = w.match(/^(\d+(?:\.\d+)?)m$/i);
    if (m) size = m[1].replace(".", "");
    else {
      const a = w.replace(/[^A-Za-z]/g, "");
      if (a) words.push(a.toUpperCase());
    }
  });
  const base = words.slice(0, 2).map((w) => w.slice(0, 4)).join("") || "PROD";
  return base + (size ? "/" + size : "");
};

export const genSku = (name, colour, taken) => {
  const col = String(colour || "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3);
  let sku = skuPart(name) + (col ? "/" + col : "");
  let n = 2;
  const base = sku;
  while (taken.has(sku.toLowerCase())) sku = base + "-" + n++;
  return sku;
};

// ===== product codes =====
// Products carry a code: SOURCE / SIZE / TYPE (e.g. DK/3.6/DECK, TG/CLIPS-METAL).
// The source is the first part: DK = our own imports, TG = Tuda Grass, etc.
// Each product + colour is a stock row whose SKU is the code + a 3-letter colour.
export const PRODUCT_SOURCES = {
  DK: "Deck Kingdom (own import)", TG: "Tuda Grass", SY: "South Yorkshire Composites",
  TS: "Tradescape", CL: "Easy Composite", FN: "Finch Decking",
};
export const COLOUR_CODES = {
  "ash white": "AWH", ash: "ASH", silver: "SIL", anthracite: "ANT", black: "BLK", maple: "MAP", teak: "TEA",
  "red/brown": "RBR", "red brown": "RBR", chocolate: "CHO", oak: "OAK", walnut: "WAL", galvanised: "GAL",
  grey: "GRY", "golden teak": "GTK", "golden oak": "GOK", slate: "SLA", graphite: "GRA", "light grey": "LGR",
  "dark grey": "DGR", brown: "BRN", antique: "ANQ", sand: "SND", "cherry brown": "CBR", pebble: "PEB",
};
export const colourCode = (c) => {
  const k = String(c || "").trim().toLowerCase();
  if (!k) return "";
  return COLOUR_CODES[k] || k.replace(/[^a-z]/g, "").toUpperCase().slice(0, 3);
};
export const cleanCode = (c) => String(c || "").trim().toUpperCase().replace(/\s+/g, "");
export const codeSource = (code) => cleanCode(code).split("/")[0] || "";
export const skuFor = (code, colour) => cleanCode(code) + (colourCode(colour) ? "/" + colourCode(colour) : "");


// ===== numeric SKUs =====
// 12 digits = supplier · length · category · sub-category · product · colour,
// two digits each, from the editable lists below (Products → SKU lists).
// 01 06 01 01 01 12 = DK · 3.6m · decking · boards · embossed woodgrain · grey/anthracite.
// Products with the same length/category/sub-category/product are one master
// product; each supplier's version sits under it. The fields are the source of
// truth — the SKU is built from them, never read apart.
export const DEFAULT_SKU_LISTS = {
 "supplier": [
  {
   "code": "01",
   "key": "DK",
   "label": "Deck Kingdom (own import)"
  },
  {
   "code": "02",
   "key": "TG",
   "label": "Tuda Grass"
  },
  {
   "code": "03",
   "key": "TS",
   "label": "Tradescape"
  },
  {
   "code": "04",
   "key": "FN",
   "label": "Finch"
  },
  {
   "code": "05",
   "key": "SY",
   "label": "South Yorkshire Composites"
  },
  {
   "code": "06",
   "key": "CL",
   "label": "Easy Composite (Chinese Lee)"
  }
 ],
 "length": [
  {
   "code": "00",
   "key": "",
   "label": "n/a"
  },
  {
   "code": "01",
   "key": "1.83",
   "label": "1.83m"
  },
  {
   "code": "02",
   "key": "2.2",
   "label": "2.2m"
  },
  {
   "code": "03",
   "key": "2.4",
   "label": "2.4m"
  },
  {
   "code": "04",
   "key": "2.5",
   "label": "2.5m"
  },
  {
   "code": "05",
   "key": "2.9",
   "label": "2.9m"
  },
  {
   "code": "06",
   "key": "3.6",
   "label": "3.6m"
  },
  {
   "code": "07",
   "key": "4.0",
   "label": "4m"
  },
  {
   "code": "08",
   "key": "4.8",
   "label": "4.8m"
  },
  {
   "code": "09",
   "key": "5.0",
   "label": "5m"
  },
  {
   "code": "10",
   "key": "1.5",
   "label": "1.5m"
  },
  {
   "code": "11",
   "key": "1.8",
   "label": "1.8m"
  },
  {
   "code": "12",
   "key": "1.9",
   "label": "1.9m"
  },
  {
   "code": "13",
   "key": "3.0",
   "label": "3m"
  },
  {
   "code": "20",
   "key": "2FT",
   "label": "2ft"
  },
  {
   "code": "21",
   "key": "3FT",
   "label": "3ft"
  },
  {
   "code": "22",
   "key": "4FT",
   "label": "4ft"
  },
  {
   "code": "23",
   "key": "5FT",
   "label": "5ft"
  },
  {
   "code": "24",
   "key": "6FT",
   "label": "6ft"
  },
  {
   "code": "30",
   "key": "300MM",
   "label": "300mm"
  },
  {
   "code": "40",
   "key": "30MM",
   "label": "30mm"
  },
  {
   "code": "41",
   "key": "40MM",
   "label": "40mm"
  },
  {
   "code": "42",
   "key": "50MM",
   "label": "50mm"
  }
 ],
 "category": [
  {
   "code": "01",
   "label": "Decking"
  },
  {
   "code": "02",
   "label": "Fencing"
  },
  {
   "code": "03",
   "label": "Cladding"
  },
  {
   "code": "04",
   "label": "Balustrade"
  },
  {
   "code": "05",
   "label": "Grass"
  },
  {
   "code": "06",
   "label": "Misc"
  }
 ],
 "sub": [
  {
   "code": "00",
   "label": "N/a"
  },
  {
   "code": "01",
   "label": "Boards"
  },
  {
   "code": "02",
   "label": "Accessories"
  },
  {
   "code": "03",
   "label": "Kits"
  },
  {
   "code": "04",
   "label": "Balustrade"
  },
  {
   "code": "05",
   "label": "Grass"
  },
  {
   "code": "06",
   "label": "Misc"
  }
 ],
 "product": {
  "01-01": [
   {
    "code": "01",
    "label": "Embossed woodgrain board"
   },
   {
    "code": "02",
    "label": "Step edge board"
   },
   {
    "code": "03",
    "label": "Premium board"
   },
   {
    "code": "04",
    "label": "Premium bullnose board"
   },
   {
    "code": "05",
    "label": "Premium fascia board"
   },
   {
    "code": "06",
    "label": "Gen2 board"
   },
   {
    "code": "07",
    "label": "Gen2 board (2nds)"
   },
   {
    "code": "08",
    "label": "Printed woodgrain board"
   },
   {
    "code": "09",
    "label": "Traditional groove board"
   }
  ],
  "01-02": [
   {
    "code": "01",
    "label": "Decking trim"
   },
   {
    "code": "02",
    "label": "Premium trim"
   },
   {
    "code": "03",
    "label": "Gen2 trim"
   },
   {
    "code": "04",
    "label": "End cap"
   }
  ],
  "02-01": [
   {
    "code": "01",
    "label": "Fence board"
   },
   {
    "code": "02",
    "label": "Fence screen"
   }
  ],
  "02-02": [
   {
    "code": "01",
    "label": "Composite post"
   },
   {
    "code": "02",
    "label": "Aluminium post"
   },
   {
    "code": "03",
    "label": "Post cap"
   },
   {
    "code": "04",
    "label": "Post skirt"
   },
   {
    "code": "05",
    "label": "Post insert / foot"
   },
   {
    "code": "06",
    "label": "Concrete post adaptor"
   },
   {
    "code": "07",
    "label": "Adaptor cap"
   },
   {
    "code": "08",
    "label": "Post infill"
   },
   {
    "code": "09",
    "label": "Top beam"
   },
   {
    "code": "10",
    "label": "Bottom beam"
   },
   {
    "code": "11",
    "label": "Top / bottom beam"
   },
   {
    "code": "12",
    "label": "U beam"
   },
   {
    "code": "13",
    "label": "H beam"
   }
  ],
  "02-03": [
   {
    "code": "01",
    "label": "Retro kit"
   },
   {
    "code": "02",
    "label": "Retro kit (2.2m boards)"
   },
   {
    "code": "03",
    "label": "Aluminium post kit"
   }
  ],
  "03-01": [
   {
    "code": "01",
    "label": "Woodgrain cladding"
   },
   {
    "code": "02",
    "label": "Smooth cladding"
   },
   {
    "code": "03",
    "label": "Slatted cladding"
   },
   {
    "code": "04",
    "label": "Slatted cladding S1"
   },
   {
    "code": "05",
    "label": "Acoustic wall panel"
   }
  ],
  "03-02": [
   {
    "code": "01",
    "label": "Cladding trim"
   },
   {
    "code": "02",
    "label": "Slatted cladding trim"
   }
  ],
  "04-03": [
   {
    "code": "01",
    "label": "Handrail section (boxed)"
   },
   {
    "code": "02",
    "label": "Post kit (boxed)"
   },
   {
    "code": "03",
    "label": "Balustrade kit"
   },
   {
    "code": "04",
    "label": "Finishing kit"
   }
  ],
  "04-04": [
   {
    "code": "01",
    "label": "Handrail"
   },
   {
    "code": "02",
    "label": "Base rail"
   },
   {
    "code": "03",
    "label": "Handrail bracket"
   },
   {
    "code": "04",
    "label": "Base rail bracket"
   },
   {
    "code": "05",
    "label": "Post"
   },
   {
    "code": "06",
    "label": "Post base / skirt"
   },
   {
    "code": "07",
    "label": "Post cap"
   },
   {
    "code": "08",
    "label": "Spindle"
   },
   {
    "code": "09",
    "label": "Spindle lug"
   },
   {
    "code": "10",
    "label": "Post insert"
   }
  ],
  "05-05": [
   {
    "code": "01",
    "label": "Love Romance"
   },
   {
    "code": "02",
    "label": "Tokyo"
   },
   {
    "code": "03",
    "label": "Grass adhesive"
   }
  ],
  "06-06": [
   {
    "code": "01",
    "label": "Composite joist"
   },
   {
    "code": "02",
    "label": "Treated timber 4x2"
   },
   {
    "code": "03",
    "label": "Composite batten"
   },
   {
    "code": "10",
    "label": "Plastic clips & screws (100)"
   },
   {
    "code": "11",
    "label": "Plastic clips (100)"
   },
   {
    "code": "12",
    "label": "Metal clips (100)"
   },
   {
    "code": "13",
    "label": "Starter clips (20)"
   },
   {
    "code": "14",
    "label": "T7 clip (loose)"
   },
   {
    "code": "15",
    "label": "S4 screw (loose)"
   },
   {
    "code": "16",
    "label": "Square head screws black (100)"
   },
   {
    "code": "17",
    "label": "Black screws (100)"
   },
   {
    "code": "18",
    "label": "SQ1 drill bit"
   },
   {
    "code": "19",
    "label": "Cladding clips"
   },
   {
    "code": "20",
    "label": "Ratchet strap"
   }
  ]
 },
 "colour": [
  {
   "code": "00",
   "label": "n/a",
   "aliases": []
  },
  {
   "code": "01",
   "label": "Antique",
   "aliases": [
    "antique"
   ]
  },
  {
   "code": "02",
   "label": "Maple",
   "aliases": [
    "maple"
   ]
  },
  {
   "code": "03",
   "label": "Oak",
   "aliases": [
    "oak"
   ]
  },
  {
   "code": "04",
   "label": "Golden oak",
   "aliases": [
    "golden oak"
   ]
  },
  {
   "code": "05",
   "label": "Teak",
   "aliases": [
    "teak"
   ]
  },
  {
   "code": "06",
   "label": "Golden teak",
   "aliases": [
    "golden teak"
   ]
  },
  {
   "code": "07",
   "label": "Red/Brown",
   "aliases": [
    "red/brown",
    "red brown"
   ]
  },
  {
   "code": "08",
   "label": "Chocolate",
   "aliases": [
    "chocolate"
   ]
  },
  {
   "code": "09",
   "label": "Walnut",
   "aliases": [
    "walnut"
   ]
  },
  {
   "code": "10",
   "label": "Ash white",
   "aliases": [
    "ash white"
   ]
  },
  {
   "code": "11",
   "label": "Silver",
   "aliases": [
    "silver"
   ]
  },
  {
   "code": "12",
   "label": "Grey",
   "aliases": [
    "grey",
    "anthracite",
    "grey/anthracite",
    "dark grey"
   ]
  },
  {
   "code": "13",
   "label": "Ash grey",
   "aliases": [
    "ash grey",
    "ash"
   ]
  },
  {
   "code": "14",
   "label": "Black",
   "aliases": [
    "black",
    "charcoal",
    "black/charcoal"
   ]
  },
  {
   "code": "15",
   "label": "Galvanised",
   "aliases": [
    "galvanised"
   ]
  },
  {
   "code": "16",
   "label": "Slate",
   "aliases": [
    "slate"
   ]
  },
  {
   "code": "17",
   "label": "Graphite",
   "aliases": [
    "graphite"
   ]
  },
  {
   "code": "18",
   "label": "Light grey",
   "aliases": [
    "light grey"
   ]
  },
  {
   "code": "20",
   "label": "Brown",
   "aliases": [
    "brown"
   ]
  },
  {
   "code": "21",
   "label": "Cherry brown",
   "aliases": [
    "cherry brown"
   ]
  },
  {
   "code": "22",
   "label": "Sand",
   "aliases": [
    "sand"
   ]
  }
 ]
};
export const SEG_FIELDS = [["segSup", "supplier"], ["segLen", "length"], ["segCat", "category"], ["segSub", "sub"], ["segProd", "product"]];
export const skuLists = (crm) => {
  const l = crm && crm.skuLists && typeof crm.skuLists === "object" ? crm.skuLists : {};
  return {
    supplier: Array.isArray(l.supplier) ? l.supplier : DEFAULT_SKU_LISTS.supplier,
    length: Array.isArray(l.length) ? l.length : DEFAULT_SKU_LISTS.length,
    category: Array.isArray(l.category) ? l.category : DEFAULT_SKU_LISTS.category,
    sub: Array.isArray(l.sub) ? l.sub : DEFAULT_SKU_LISTS.sub,
    product: l.product && typeof l.product === "object" ? l.product : DEFAULT_SKU_LISTS.product,
    colour: Array.isArray(l.colour) ? tidyColours(l.colour) : DEFAULT_SKU_LISTS.colour,
  };
};
// Colour clean-up (Oct 2026): one Grey (was Grey/Anthracite, Dark grey folded in) and
// one Black (was Black/Charcoal). Applied to a saved list too; old names stay as aliases.
const COLOUR_MERGES = { "12": { label: "Grey", aliases: ["grey", "anthracite", "grey/anthracite", "dark grey"] }, "14": { label: "Black", aliases: ["black", "charcoal", "black/charcoal"] } };
const tidyColours = (list) => {
  if (!list.some((c) => c.code === "19" && /dark grey/i.test(c.label || "")) && !list.some((c) => /\/(anthracite|charcoal)$/i.test(c.label || ""))) return list;
  return list
    .filter((c) => !(c.code === "19" && /dark grey/i.test(c.label || "")))
    .map((c) => (COLOUR_MERGES[c.code] && /^(grey|black)/i.test(c.label || "")
      ? { ...c, label: COLOUR_MERGES[c.code].label, aliases: [...new Set([...(c.aliases || []), ...COLOUR_MERGES[c.code].aliases])] }
      : c));
};

// Product colours written the list's way: "Anthracite" / "Grey/Anthracite" -> "Grey".
// Returns { renames: { productId: { oldColour: newColour } }, drops: { productId: [colour] } } or null.
// A product that already has the target colour just drops the duplicate.
export const colourTidyPlan = (crm, planner) => {
  const lists = skuLists(crm);
  const out = { renames: {}, drops: {} };
  let any = false;
  ((planner && planner.products) || []).forEach((p) => {
    const cols = p.colours || [];
    const final = new Set();
    cols.forEach((c) => {
      const hit = lists.colour.find((x) => x.code !== "00" && (String(x.label).toLowerCase() === String(c).trim().toLowerCase() || (x.aliases || []).some((a) => String(a).toLowerCase() === String(c).trim().toLowerCase())));
      const want = hit ? hit.label : c;
      if (want === c) { final.add(c.toLowerCase()); return; }
      any = true;
      if (final.has(want.toLowerCase()) || cols.some((o) => o === want)) (out.drops[p.id] = out.drops[p.id] || []).push(c);
      else { (out.renames[p.id] = out.renames[p.id] || {})[c] = want; final.add(want.toLowerCase()); }
    });
  });
  return any ? out : null;
};
const two = (v) => /^\d{2}$/.test(String(v || "").trim());
// the 10-digit product part, or "" while any field is missing
export const productSkuBase = (p) => (SEG_FIELDS.every(([k]) => two(p[k])) ? SEG_FIELDS.map(([k]) => String(p[k]).trim()).join("") : "");
// master product = same length, category, sub-category and product (any supplier)
export const masterKey = (p) => (["segLen", "segCat", "segSub", "segProd"].every((k) => two(p[k])) ? ["segLen", "segCat", "segSub", "segProd"].map((k) => String(p[k]).trim()).join("-") : "");
export const productsInList = (lists, cat, sub) => (lists.product[cat + "-" + sub] || []);
export const colourSeg = (lists, colour) => {
  const k = String(colour || "").trim().toLowerCase();
  if (!k) return "00";
  const hit = lists.colour.find((c) => (c.label || "").toLowerCase() === k || (c.aliases || []).some((a) => String(a).toLowerCase() === k));
  return hit ? hit.code : null;
};
// stock-row SKU: 12 digits when the product's fields and colour are all in the lists
export const numericSku = (p, colour, lists) => {
  const base = productSkuBase(p);
  const c = colourSeg(lists, colour);
  return base && c ? base + c : "";
};
// which source a stock row is (DK, TG …): from the SKU's first two digits, else its code
export const skuSource = (row, lists) => {
  const sku = String((row && row.sku) || "");
  if (/^\d{12}$/.test(sku)) {
    const hit = lists.supplier.find((x) => x.code === sku.slice(0, 2));
    return hit ? hit.key : "";
  }
  return codeSource(row && row.family && row.family.includes("/") ? row.family : sku);
};
// how a stock row reads in pickers: SKU · readable code — name · colour
export const skuOptionLabel = (p) =>
  p.sku + (p.family && p.family.includes("/") && p.family !== p.sku ? " · " + p.family : "") + " — " + p.name + (p.colour ? " · " + p.colour : "");
export const segLabel = (list, code) => {
  const hit = (list || []).find((x) => x.code === code);
  return hit ? hit.label : "";
};

// A kit weighs what its parts weigh: each part's kg / pc × qty in the kit.
export const kitWeight = (p, products) =>
  Math.round((p.kit || []).reduce((t, k) => {
    const part = (products || []).find((x) => x.id === k.productId);
    return t + (part ? Number(part.weight) || 0 : 0) * (Number(k.qty) || 0);
  }, 0) * 100) / 100;

// Keeps the background stock/SKU table in step with the Products screen:
// one row per product+colour, created and updated automatically. Stock and
// batch costs are never touched. When a product has a code its rows take the
// code-based SKU; a row still on an old SKU is renamed (see renameSkus) so its
// stock, movements and any invoices/quotes/picks that used it follow along.
// Returns { masterProducts, renames } or null when everything is in step.
export const syncCatalogue = (crm, planner) => {
  const products = (planner && planner.products) || [];
  if (!products.length) return null;
  const lists = skuLists(crm);
  const next = JSON.parse(JSON.stringify(crm.masterProducts || []));
  const byKey = {};
  next.forEach((m) => {
    if (m.importProductId && !m.grade) byKey[m.importProductId + "||" + (m.colour || "").trim().toLowerCase()] = m;
  });
  const taken = new Set(next.map((m) => (m.sku || "").toLowerCase()));
  const renames = {};
  let changed = false;
  products.forEach((p) => {
    const colours = p.colours && p.colours.length ? p.colours : [""];
    const seen = new Set();
    const code = cleanCode(p.code);
    colours.forEach((colRaw) => {
      const col = String(colRaw || "").trim();
      const lk = col.toLowerCase();
      if (seen.has(lk)) return;
      seen.add(lk);
      const want = {
        name: p.name || "",
        colour: col,
        family: code ? skuFor(code, col) : p.name || "", // readable code alongside the numeric SKU
        category: p.category || "",
        weightKg: p.isKit ? kitWeight(p, products) || "" : Number(p.weight) > 0 ? Number(p.weight) : "",
        priceIncVat: Number(p.salePrice) > 0 ? Number(p.salePrice) : "",
      };
      const cur = byKey[p.id + "||" + lk];
      if (!cur) {
        const target = numericSku(p, col, lists) || (code ? skuFor(code, col) : "");
        let sku = target || genSku(p.name, col, taken);
        if (target && taken.has(sku.toLowerCase())) sku = genSku(p.name, col, taken);
        taken.add(sku.toLowerCase());
        const row = { ...blankMasterProduct(), ...want, sku, importProductId: p.id, unit: "each" };
        if (p.costGbp !== "" && p.costGbp !== null && p.costGbp !== undefined && isFinite(Number(p.costGbp))) row.costGbp = Number(p.costGbp);
        next.push(row);
        changed = true;
      } else {
        Object.entries(want).forEach(([k, v]) => {
          if (k === "priceIncVat" && v === "" && cur[k] !== "") return; // keep a price once set
          if (cur[k] !== v) {
            cur[k] = v;
            changed = true;
          }
        });
        // a bought-in product's £ cost seeds the row until real batch costs arrive
        if ((cur.costGbp === "" || cur.costGbp === null) && p.costGbp !== "" && p.costGbp !== null && p.costGbp !== undefined && isFinite(Number(p.costGbp)) && Number(p.costGbp) > 0) {
          cur.costGbp = Number(p.costGbp);
          changed = true;
        }
        const target = numericSku(p, col, lists) || (code ? skuFor(code, col) : "");
        if (target) {
          const sku = target;
          if (cur.sku !== sku && !taken.has(sku.toLowerCase())) {
            taken.delete((cur.sku || "").toLowerCase());
            taken.add(sku.toLowerCase());
            if (cur.sku) renames[cur.sku] = sku;
            cur.sku = sku;
            changed = true;
          }
        }
      }
    });
  });
  // Colours taken off a product: drop their stock rows when nothing ever used
  // them (no stock, movements, jobs, quotes or collections); otherwise just
  // retire them so they stop being offered but history still adds up.
  const wanted = {};
  products.forEach((p) => {
    wanted[p.id] = new Set((p.colours && p.colours.length ? p.colours : [""]).map((x) => String(x || "").trim().toLowerCase()));
  });
  const used = skusInUse(crm);
  for (let i = next.length - 1; i >= 0; i--) {
    const m = next[i];
    if (m.grade) continue; // damaged / returned / clearance rows are kept while they hold anything
    const keep = wanted[m.importProductId];
    if (!keep) continue; // not a catalogue row (or its product was deleted) — leave alone
    const listed = keep.has(String(m.colour || "").trim().toLowerCase());
    if (listed) {
      if (m.active === false) { m.active = true; changed = true; }
      continue;
    }
    if (!Number(m.stock) && !used.has(String(m.sku || "").trim().toLowerCase())) {
      next.splice(i, 1);
      changed = true;
    } else if (m.active !== false) {
      m.active = false;
      changed = true;
    }
  }
  // graded rows (…-D / -R / -C) follow their good row: name, readable code, weight, and SKU renames
  next.forEach((g) => {
    if (!g.grade) return;
    const gr = GRADES.find((x) => x.key === g.grade);
    if (!gr) return;
    const oldBase = baseSku(g.sku);
    const newBase = renames[oldBase] || oldBase;
    const parent = next.find((m) => !m.grade && String(m.sku || "").toLowerCase() === newBase.toLowerCase());
    if (newBase !== oldBase) {
      const sku = gradeSku(newBase, g.grade);
      renames[g.sku] = sku;
      g.sku = sku;
      changed = true;
    }
    if (!parent) return;
    const want = { name: parent.name, colour: parent.colour, family: parent.family ? parent.family + "-" + gr.suffix : "", category: parent.category, weightKg: parent.weightKg, importProductId: parent.importProductId };
    Object.entries(want).forEach(([k, v]) => { if (g[k] !== v) { g[k] = v; changed = true; } });
  });
  if (applyKits(next, products, lists)) changed = true;
  return changed ? { masterProducts: next, renames } : null;
};

// ===== kits =====
// A product can be a kit: a recipe of parts (other catalogue products) with a
// quantity each, and a colour that is either "same as the kit" (blank) or fixed
// (e.g. Galvanised). Each colour of the kit becomes a stock row whose parts are
// the matching colour rows of those products — so loading bills, stock
// deductions and job costs take the parts. Generated parts carry ids "k:…".
const kitRowIndex = (rows) => {
  const m = {};
  rows.forEach((r) => {
    if (!r.importProductId || r.grade) return; // kits are made from good stock
    (m[r.importProductId] = m[r.importProductId] || []).push(r);
  });
  return m;
};
// the stock row a kit line uses for one kit colour, or null
export const resolveKitPart = (line, kitColour, rowsByProduct, lists) => {
  const rows = rowsByProduct[line.productId] || [];
  if (!rows.length) return null;
  const want = String(line.colour || kitColour || "").trim().toLowerCase();
  if (rows.length === 1 && !(rows[0].colour || "").trim()) return rows[0]; // part has no colours
  const exact = rows.find((r) => (r.colour || "").trim().toLowerCase() === want);
  if (exact) return exact;
  const seg = colourSeg(lists, want); // Grey kit -> Anthracite part when they share a colour number
  return (seg && seg !== "00" && rows.find((r) => colourSeg(lists, r.colour) === seg)) || null;
};
export const kitPartsFor = (p, kitColour, rowsByProduct, lists) =>
  (p.kit || []).map((line, i) => ({ line, i, row: resolveKitPart(line, kitColour, rowsByProduct, lists) }));

const applyKits = (rows, products, lists) => {
  const byProd = kitRowIndex(rows);
  let changed = false;
  products.forEach((p) => {
    (byProd[p.id] || []).forEach((row) => {
      if (p.isKit && (p.kit || []).length) {
        const comps = kitPartsFor(p, row.colour, byProd, lists)
          .filter((x) => x.row && x.row.id !== row.id)
          .map((x) => ({ id: "k:" + row.id + ":" + x.i, componentId: x.row.id, qty: Number(x.line.qty) || 0 }));
        const same = row.isKit && JSON.stringify((row.components || []).map((c) => [c.componentId, Number(c.qty)])) === JSON.stringify(comps.map((c) => [c.componentId, c.qty]));
        if (!same) {
          row.isKit = true;
          row.components = comps;
          changed = true;
        }
      } else if (row.isKit && (row.components || []).every((c) => String(c.id).startsWith("k:"))) {
        row.isKit = false; // recipe removed in the catalogue
        row.components = [];
        changed = true;
      }
    });
  });
  return changed;
};
export const rowsByCatalogueProduct = (crm) => kitRowIndex(crm.masterProducts || []);

// Back-compat wrapper: just the new stock rows
export const syncMasterFromProducts = (crm, planner) => {
  const r = syncCatalogue(crm, planner);
  return r ? r.masterProducts : null;
};

// ===== stock grades: damaged / returned / clearance =====
// Each grade is its own stock row beside the good one: same product and colour,
// SKU with a suffix (010601010114-C), its own quantity, cost and price — so it
// can go on an invoice line, be picked, deducted and costed like anything else.
export const GRADES = [
  { key: "returned", label: "Returned", suffix: "R", tone: "blue", hint: "Back from a customer — check it over" },
  { key: "damaged", label: "Damaged", suffix: "D", tone: "red", hint: "Marked or broken — sell cheap or write off" },
  { key: "clearance", label: "Clearance", suffix: "C", tone: "gold", hint: "Ends of lines, seconds, old colours" },
];
export const gradeOf = (row) => GRADES.find((g) => g.key === (row && row.grade)) || null;
export const baseSku = (sku) => String(sku || "").replace(/-[DRC]$/i, "");
export const gradeSku = (base, grade) => { const g = GRADES.find((x) => x.key === grade); return g ? baseSku(base) + "-" + g.suffix : baseSku(base); };
const gradeRowFor = (c, from, grade) => {
  const rows = c.masterProducts || (c.masterProducts = []);
  const base = from.grade ? rows.find((m) => !m.grade && String(m.sku || "").toLowerCase() === baseSku(from.sku).toLowerCase()) || null : from;
  if (!grade) return base; // back to good stock
  const sku = gradeSku(from.sku, grade);
  let row = rows.find((m) => String(m.sku || "").toLowerCase() === sku.toLowerCase());
  if (!row) {
    const src = base || from;
    const gr = GRADES.find((x) => x.key === grade);
    row = { ...blankMasterProduct(), name: src.name, colour: src.colour, category: src.category, weightKg: src.weightKg, importProductId: src.importProductId, unit: src.unit || "each",
      sku, grade, family: src.family ? baseSku(src.family).replace(/-[DRC]$/i, "") + "-" + gr.suffix : "", stock: 0, costGbp: src.costGbp, priceIncVat: "" };
    rows.push(row);
  }
  return row;
};
// Move qty from one stock row into a grade (or back to good stock with to = "").
// to = "writeoff" takes it out of stock altogether. Cost travels with the stock.
export const moveStockGrade = (c, { rowId, qty, to, reason, priceIncVat, actor }) => {
  const from = (c.masterProducts || []).find((m) => m.id === rowId);
  const q = Number(qty) || 0;
  if (!from || q <= 0) return null;
  c.movements = c.movements || [];
  const fromStock = Number(from.stock) || 0;
  const unit = from.costGbp === "" || from.costGbp === null ? "" : Number(from.costGbp);
  const label = to === "writeoff" ? "Written off" : to ? (GRADES.find((g) => g.key === to) || {}).label : "Good stock";
  from.stock = fromStock - q;
  c.movements.push({ ...blankMovement(), sku: from.sku, mpId: from.id, qty: -q, unitCost: unit, kind: to === "writeoff" ? "write-off" : "grade", ref: "→ " + label + (reason ? " — " + reason : ""), actor: actor || "" });
  if (to === "writeoff") return from;
  const dest = gradeRowFor(c, from, to);
  if (!dest) return null;
  const old = Number(dest.stock) || 0;
  if (unit !== "") dest.costGbp = weightedCost(old, dest.costGbp, q, unit);
  dest.stock = old + q;
  if (priceIncVat !== "" && priceIncVat !== null && priceIncVat !== undefined && isFinite(Number(priceIncVat))) dest.priceIncVat = Number(priceIncVat);
  c.movements.push({ ...blankMovement(), sku: dest.sku, mpId: dest.id, qty: q, unitCost: unit, kind: "grade", ref: "← " + (from.grade ? gradeOf(from).label : "Good stock") + (reason ? " — " + reason : ""), actor: actor || "" });
  return dest;
};
// A customer brings goods back: they come into stock as Returned (or straight to
// good / damaged), at the cost the job carried, logged against the job.
export const customerReturn = (c, { invId, sku, qty, to = "returned", reason, actor }) => {
  const inv = (c.invoices || []).find((i) => i.id === invId);
  const good = (c.masterProducts || []).find((m) => String(m.sku || "").toLowerCase() === baseSku(sku).toLowerCase());
  const q = Number(qty) || 0;
  if (!inv || !good || q <= 0) return null;
  const dest = gradeRowFor(c, good, to || "");
  const pick = (inv.picks || []).find((p) => String(p.sku || "").toLowerCase() === String(sku).toLowerCase() && p.unitCost !== "" && p.unitCost !== null && p.unitCost !== undefined);
  const unit = pick ? Number(pick.unitCost) : good.costGbp === "" || good.costGbp === null ? "" : Number(good.costGbp);
  const old = Number(dest.stock) || 0;
  if (unit !== "") dest.costGbp = weightedCost(old, dest.costGbp, q, unit);
  dest.stock = old + q;
  c.movements = c.movements || [];
  c.movements.push({ ...blankMovement(), sku: dest.sku, mpId: dest.id, qty: q, unitCost: unit, kind: "return", ref: "From job #" + (inv.invNo || "") + (reason ? " — " + reason : ""), actor: actor || "" });
  return dest;
};

// Every SKU some record points at (movements, invoice lines/picks, quotes, collections)
export const skusInUse = (c) => {
  const u = new Set();
  const add = (v) => { const k = String(v || "").trim().toLowerCase(); if (k) u.add(k); };
  (c.movements || []).forEach((m) => add(m.sku));
  (c.invoices || []).forEach((i) => { (i.lines || []).forEach((l) => add(l.code)); (i.picks || []).forEach((p) => add(p.sku)); });
  (c.quotes || []).forEach((q) => (q.lines || []).forEach((l) => add(l.code)));
  (c.collections || []).forEach((x) => (x.items || []).forEach((it) => add(it.sku)));
  return u;
};

// Point every record that used an old SKU at its new one. Mutates c.
export const renameSkus = (c, renames) => {
  const map = {};
  Object.entries(renames || {}).forEach(([o, n]) => (map[String(o).trim().toLowerCase()] = n));
  if (!Object.keys(map).length) return 0;
  let n = 0;
  const fix = (obj, key) => {
    const k = String(obj[key] || "").trim().toLowerCase();
    if (k && map[k]) {
      obj[key] = map[k];
      n++;
    }
  };
  (c.movements || []).forEach((m) => fix(m, "sku"));
  (c.invoices || []).forEach((i) => {
    (i.lines || []).forEach((l) => fix(l, "code"));
    (i.picks || []).forEach((p) => fix(p, "sku"));
  });
  (c.quotes || []).forEach((q) => (q.lines || []).forEach((l) => fix(l, "code")));
  (c.collections || []).forEach((x) => (x.items || []).forEach((it) => fix(it, "sku")));
  return n;
};

// ===== master products: SKU lookup, kit explosion, stock allocation =====
export const skuIndex = (crm) => {
  const m = {};
  (crm.masterProducts || []).forEach((p) => {
    const k = (p.sku || "").trim().toLowerCase();
    if (k && !m[k]) m[k] = p;
  });
  return m;
};

export const mpById = (crm) => {
  const m = {};
  (crm.masterProducts || []).forEach((p) => (m[p.id] = p));
  return m;
};

// One invoice -> the physical pick list: kit lines pull their components through.
const looseRow = (crm, l) => {
  const lc = (v) => String(v || "").trim().toLowerCase();
  if (!lc(l.description)) return null;
  const hits = (crm.masterProducts || []).filter((r) => r.active !== false && lc(r.name) === lc(l.description) && lc(r.colour) === lc(l.colour));
  return hits.length === 1 ? hits[0] : null; // only when it's unambiguous
};
export const explodeInvoiceLines = (inv, crm) => {
  const bySku = skuIndex(crm);
  const byId = mpById(crm);
  const rows = [];
  (inv.lines || []).forEach((l) => {
    const qty = Number(l.qty) || 0;
    // a loosely typed code ("4.8") still finds its product by description + colour
    const mp = bySku[(l.code || "").trim().toLowerCase()] || looseRow(crm, l);
    if (mp && mp.isKit && (mp.components || []).length) {
      rows.push({ kind: "kit", sku: mp.sku, description: l.description || mp.name, colour: l.colour || mp.colour, qty, weightKg: null });
      mp.components.forEach((c) => {
        const comp = byId[c.componentId];
        if (!comp) return;
        const cq = qty * (Number(c.qty) || 0);
        rows.push({ kind: "part", sku: comp.sku, description: comp.name, colour: comp.colour, qty: cq, weightKg: comp.weightKg !== "" && comp.weightKg !== null ? cq * Number(comp.weightKg) : null });
      });
    } else {
      rows.push({ kind: "line", sku: mp ? mp.sku : l.code, description: l.description, colour: l.colour, qty, weightKg: mp && mp.weightKg !== "" && mp.weightKg !== null ? qty * Number(mp.weightKg) : null });
    }
  });
  return rows;
};

// Estimated load for an invoice from master-product weights (kits as parts);
// falls back to a manually recorded weight (e.g. imported history).
export const invoiceLoadKg = (inv, crm) => {
  let kg = 0;
  let any = false;
  explodeInvoiceLines(inv, crm).forEach((r) => {
    if (r.weightKg !== null && r.weightKg !== undefined) {
      kg += r.weightKg;
      any = true;
    }
  });
  if (any) return kg;
  const manual = Number(inv.weightKg);
  return isFinite(manual) && inv.weightKg !== "" && inv.weightKg !== null ? manual : null;
};

// Stock promised to undelivered invoices, per SKU (kits counted as their parts).
export const allocatedBySku = (crm) => {
  const m = {};
  (crm.invoices || []).forEach((inv) => {
    if (inv.deliveryCompleted) return;
    explodeInvoiceLines(inv, crm).forEach((r) => {
      if (r.kind === "kit") return;
      const k = (r.sku || "").trim().toLowerCase();
      if (k) m[k] = (m[k] || 0) + r.qty;
    });
  });
  return m;
};

// Estimated cost of an invoice from master-product unit costs (lines with a
// matching SKU only; kits cost = sum of component costs when the kit has no cost).
export const invoiceCost = (inv, crm) => {
  const bySku = skuIndex(crm);
  const byId = mpById(crm);
  let cost = 0;
  let matched = 0;
  (inv.lines || []).forEach((l) => {
    const qty = Number(l.qty) || 0;
    const mp = bySku[(l.code || "").trim().toLowerCase()];
    if (!mp) return;
    let unit = mp.costGbp !== "" && mp.costGbp !== null ? Number(mp.costGbp) : null;
    if (unit === null && mp.isKit && (mp.components || []).length) {
      unit = 0;
      mp.components.forEach((c) => {
        const comp = byId[c.componentId];
        if (comp && comp.costGbp !== "" && comp.costGbp !== null) unit += (Number(c.qty) || 0) * Number(comp.costGbp);
      });
    }
    if (unit !== null) {
      cost += qty * unit;
      matched++;
    }
  });
  return { cost, matched, of: (inv.lines || []).length };
};

// The pick list seeded from the invoice lines (kits already exploded).
// The pick list from the lines (kits exploded): stock picks for whatever isn't
// already coming on a collection for this job; collection picks are kept.
export const buildPicks = (inv, crm) => {
  const copy = { ...inv, picks: (inv.picks || []).filter(isColPick) };
  return reconcilePicks(copy, crm);
};

// Landed £/pc for one pick: the batch's real landed cost when the pick names a
// shipment and the SKU is linked to an import product; master cost otherwise.
export const pickLandedCost = (pick, crm, planner) => {
  if (pick.unitCost !== "" && pick.unitCost !== null && pick.unitCost !== undefined && isFinite(Number(pick.unitCost))) {
    return { perPc: Number(pick.unitCost), source: "batch" };
  }
  const mp = skuIndex(crm)[(pick.sku || "").trim().toLowerCase()];
  if (mp && pick.shipmentId && planner) {
    const s = (planner.shipments || []).find((x) => x.id === pick.shipmentId);
    if (s && mp.importProductId) {
      const lp = landedPerPiece(s, mp.importProductId, mp.colour);
      if (lp !== null) return { perPc: lp, source: "landed" };
    }
  }
  if (mp && mp.costGbp !== "" && mp.costGbp !== null) return { perPc: Number(mp.costGbp), source: "master" };
  return { perPc: null, source: "none" };
};

// Actual job cost from the picked batches (landed where linked, master cost as fallback).
export const jobCost = (inv, crm, planner) => {
  let total = 0;
  let costed = 0;
  let landedLines = 0;
  (inv.picks || []).forEach((p) => {
    const { perPc, source } = pickLandedCost(p, crm, planner);
    if (perPc !== null) {
      total += (Number(p.qty) || 0) * perPc;
      costed++;
      if (source === "landed") landedLines++;
    }
  });
  return { total, costed, landedLines, of: (inv.picks || []).length };
};

// New batch arriving on top of existing stock: weighted-average cost.
// (old stock x old cost + new qty x new cost) / total — falls back to the
// new cost when there's no prior stock or no prior cost.
export const weightedCost = (oldStock, oldCost, qty, newCost) => {
  const os = Number(oldStock);
  const oc = Number(oldCost);
  if (!isFinite(os) || os <= 0 || !isFinite(oc) || oldCost === "" || oldCost === null) return newCost;
  return Math.round(((os * oc + qty * newCost) / (os + qty)) * 10000) / 10000;
};

// Which batch a pick names (shipment name, or free-text batch ref)
export const batchKeyForPick = (pick, planner) => {
  if (pick.shipmentId && planner) {
    const s = (planner.shipments || []).find((x) => x.id === pick.shipmentId);
    if (s) return s.name;
  }
  return pick.batchRef || "";
};

// What's left from which batch: inbound movements grouped by reference,
// minus the picks assigned to that batch across all invoices.
export const batchBreakdown = (sku, crm, planner) => {
  const k = String(sku || "").trim().toLowerCase();
  const batches = [];
  const byRef = {};
  (crm.movements || []).forEach((m) => {
    if ((m.sku || "").trim().toLowerCase() !== k || !(Number(m.qty) > 0)) return;
    const ref = m.ref || "manual";
    let b = byRef[ref];
    if (!b) {
      b = byRef[ref] = { ref, date: (m.at || "").slice(0, 10), unitCost: "", qtyIn: 0, picked: 0 };
      batches.push(b);
    }
    b.qtyIn += Number(m.qty) || 0;
    if (m.unitCost !== "" && m.unitCost !== null && m.unitCost !== undefined) b.unitCost = Number(m.unitCost);
  });
  (crm.invoices || []).forEach((inv) =>
    (inv.picks || []).forEach((p) => {
      if ((p.sku || "").trim().toLowerCase() !== k) return;
      const b = byRef[batchKeyForPick(p, planner)];
      if (b) b.picked += Number(p.qty) || 0;
    })
  );
  batches.forEach((b) => (b.left = b.qtyIn - b.picked));
  return batches.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
};

// Delivery completed -> stock leaves (one movement per line, batch kept on
// the picks); unticking puts it back. Idempotent via inv.stockDeducted.
export const applyInvoiceStockDeduction = (inv, c, on, actor) => {
  if (on === Boolean(inv.stockDeducted)) return;
  // only what comes out of our stock: parts collected for the job never went into it
  const stockPicks = (inv.picks || []).filter((p) => !isColPick(p));
  const rows = stockPicks.length
    ? stockPicks.map((p) => ({ sku: p.sku, qty: Number(p.qty) || 0 }))
    : stockNeeds(inv, c).map((n) => ({ sku: n.sku, qty: n.fromStock }));
  const sign = on ? -1 : 1;
  rows.forEach(({ sku, qty }) => {
    if (!sku || !qty) return;
    const mp = (c.masterProducts || []).find((m) => (m.sku || "").trim().toLowerCase() === String(sku).trim().toLowerCase());
    if (!mp) return;
    mp.stock = (mp.stock === "" || mp.stock === null ? 0 : Number(mp.stock)) + sign * qty;
    c.movements.push({ ...blankMovement(), sku: mp.sku, mpId: mp.id, qty: sign * qty, kind: "job", ref: "#" + (inv.invNo || "") + (on ? "" : " reopened"), actor: actor || "" });
  });
  inv.stockDeducted = on ? today() : "";
};

// ===== stock =====
export const TRADE_DISCOUNT = 0.1; // trade pricing = standard - 10%

export const stockValuation = (crm) => {
  let units = 0;
  let costValue = 0;
  let saleValue = 0;
  let tradeValue = 0;
  (crm.masterProducts || []).forEach((p) => {
    const stock = p.stock === "" || p.stock === null ? 0 : Number(p.stock);
    if (!isFinite(stock) || stock === 0) return;
    units += stock;
    if (p.costGbp !== "" && p.costGbp !== null) costValue += stock * Number(p.costGbp);
    if (p.priceIncVat !== "" && p.priceIncVat !== null) {
      saleValue += stock * Number(p.priceIncVat);
      tradeValue += stock * Number(p.priceIncVat) * (1 - TRADE_DISCOUNT);
    }
  });
  return { units, costValue, saleValue, tradeValue };
};

// Match an import shipment's lines to master SKUs (importProductId + colour),
// with the landed £/pc, ready to post into stock.
export const matchShipmentToStock = (s, crm) => {
  const matched = [];
  const unmatched = [];
  (s.lines || []).forEach((l) => {
    const pieces = (Number(l.pallets) || 0) * (Number(l.qty) || 0);
    if (pieces <= 0) return;
    const candidates = (crm.masterProducts || []).filter((p) => p.importProductId === l.productId);
    const mp =
      candidates.find((p) => (p.colour || "").trim().toLowerCase() === (l.colour || "").trim().toLowerCase()) ||
      (candidates.length === 1 && !(candidates[0].colour || "").trim() ? candidates[0] : null);
    if (mp) matched.push({ mp, line: l, qty: pieces, landed: landedPerPiece(s, l.productId, l.colour) });
    else unmatched.push({ line: l, qty: pieces });
  });
  return { matched, unmatched };
};

export const customerStats = (crm, customerId) => {
  const invs = crm.invoices.filter((i) => i.customerId === customerId);
  let lifetime = 0;
  let last = "";
  invs.forEach((i) => {
    lifetime += invoiceTotals(i).total;
    if (i.date && i.date > last) last = i.date;
  });
  return { count: invs.length, lifetime, lastOrder: last };
};

// ===== quotations =====
// A quote is an invoice-in-waiting: same lines, prices (inc VAT), discount and
// delivery charge, on its own number sequence (Q-n). Converting it raises a
// real invoice carrying everything across, and the two stay linked both ways.
export const QUOTE_VALID_DAYS = 30;
export const QUOTE_STATUSES = ["Draft", "Sent", "Accepted", "Declined"];
export const quoteRef = (q) => "Q-" + (q && q.quoteNo ? q.quoteNo : "—");

export const blankQuote = (customerId, siteId) => ({
  id: uid(),
  quoteNo: null,
  customerId: customerId || "",
  siteId: siteId || "",
  date: today(),
  validUntil: addDays(today(), QUOTE_VALID_DAYS),
  status: "Draft",
  sentDate: "",
  deliveryCharge: "",
  discountPct: "",
  vatRate: 20,
  notes: "",
  internalNotes: "",
  raisedBy: "",
  created: today(),
  convertedInvoiceId: "",
  convertedAt: "",
  lines: [],
});

// same money rules as an invoice
export const quoteTotals = (q) => invoiceTotals(q);

// The invoice a quote became — null if never converted or that invoice has
// since been deleted (the quote then reopens as Accepted, ready to convert again).
export const quoteInvoice = (q, crm) =>
  q && q.convertedInvoiceId ? (crm.invoices || []).find((i) => i.id === q.convertedInvoiceId) || null : null;

// Displayed status: Converted / Declined / Accepted / Expired / Sent / Draft
export const quoteStatus = (q, crm) => {
  if (quoteInvoice(q, crm)) return "Converted";
  if (q.status === "Declined") return "Declined";
  if (q.status === "Accepted") return "Accepted";
  if (q.validUntil && q.validUntil < today()) return "Expired";
  return q.status === "Sent" ? "Sent" : "Draft";
};
export const QUOTE_TONES = { Draft: "grey", Sent: "amber", Accepted: "gold", Converted: "green", Declined: "red", Expired: "grey" };
// still in play: worth chasing
export const quoteIsOpen = (q, crm) => ["Draft", "Sent", "Accepted"].includes(quoteStatus(q, crm));

// Turn a quote into a sale. Mutates the crm copy passed in (inside updateCrm):
// pushes the new invoice, moves the invoice sequence on, marks the quote
// Accepted + linked. Returns the invoice, or null if it can't convert.
export const convertQuoteToInvoice = (c, quoteId, actor, newId) => {
  const q = (c.quotes || []).find((x) => x.id === quoteId);
  if (!q || !q.customerId || quoteInvoice(q, c)) return null;
  const inv = blankInvoice(q.customerId, q.siteId);
  if (newId) inv.id = newId;
  inv.invNo = nextNumber(c.invoices, "invNo", c.numbering.invoice);
  inv.raisedBy = actor || "";
  inv.quoteId = q.id;
  if (q.siteId === TRADE_COUNTER) inv.jobType = "Customer Collection";
  inv.deliveryCharge = q.deliveryCharge;
  inv.discountPct = q.discountPct;
  inv.vatRate = q.vatRate;
  inv.jobNotes = [q.notes, q.internalNotes].filter((x) => String(x || "").trim()).join("\n");
  inv.lines = (q.lines || []).map((l) => ({ ...blankLine(), code: l.code, description: l.description, colour: l.colour, qty: l.qty, price: l.price }));
  c.invoices.unshift(inv);
  c.numbering.invoice = (Number(inv.invNo) || 0) + 1;
  q.status = "Accepted";
  q.convertedInvoiceId = inv.id;
  q.convertedAt = today();
  return inv;
};

// A fresh draft copy (new number, today's dates) — for revising a quote
export const duplicateQuote = (c, quoteId, actor, newId) => {
  const q = (c.quotes || []).find((x) => x.id === quoteId);
  if (!q) return null;
  const n = blankQuote(q.customerId, q.siteId);
  if (newId) n.id = newId;
  n.quoteNo = nextNumber(c.quotes, "quoteNo", c.numbering.quote);
  n.raisedBy = actor || "";
  ["deliveryCharge", "discountPct", "vatRate", "notes", "internalNotes"].forEach((k) => (n[k] = q[k]));
  n.lines = (q.lines || []).map((l) => ({ ...l, id: uid() }));
  c.quotes.unshift(n);
  c.numbering.quote = (Number(n.quoteNo) || 0) + 1;
  return n;
};

// ===== sample requests & conversion tracking =====
// Each request (S-n) belongs to a customer account. A sale is credited to the
// sample automatically: the customer's first real invoice dated on/after the
// request, within SAMPLE_WINDOW_DAYS and before their next sample request (so
// one sale is never counted twice). The link is stored on the sample record;
// staff can pin a different invoice by hand, or mark the request as no sale.
export const SAMPLE_WINDOW_DAYS = 180;
export const SAMPLE_FOLLOWUP_DAYS = 7;
export const SAMPLE_SOURCES = ["Website", "Phone", "Showroom", "Email", "Market Place", "Social", "Trade"];
export const SAMPLE_DISPATCH = ["Royal Mail", "Evri", "Collected", "Showroom hand-out", "With a delivery"];
export const SAMPLE_SIZES = ["Free", "Large"];
export const sampleRef = (s) => "S-" + (s && s.sampleNo ? s.sampleNo : "—");

export const blankSampleItem = () => ({ id: uid(), description: "", colour: "", size: "Free", qty: 1 });

export const blankSample = (customerId) => ({
  id: uid(),
  sampleNo: null,
  customerId: customerId || "",
  date: today(),
  source: "Website",
  dispatchMethod: "",
  dispatchedDate: "",
  trackingRef: "",
  followUpDate: "",
  followedUp: false,
  followedUpDate: "",
  project: "",
  notes: "",
  outcome: "",        // "" | "lost"
  lostReason: "",
  convertedInvoiceId: "",
  convertedAt: "",
  linkManual: false,  // invoice pinned by hand: auto-matching leaves it alone
  raisedBy: "",
  created: today(),
  items: [],
});

// Invoices that count as a sale: money taken for goods, not a sample order itself.
export const isSaleInvoice = (inv) =>
  invoiceTotals(inv).total > 0 && !/sample/i.test(inv.paymentType || "") && !/sample/i.test(inv.jobType || "");

export const sampleInvoice = (s, crm) =>
  s && s.convertedInvoiceId ? (crm.invoices || []).find((i) => i.id === s.convertedInvoiceId) || null : null;

// Work out every sample's credited invoice. Returns a new samples array when
// any stored link changes, otherwise null (so it can run on every data change).
export const syncSampleConversions = (crm) => {
  const samples = crm.samples || [];
  if (!samples.length) return null;
  const invById = {};
  const invsByCust = {};
  (crm.invoices || []).forEach((i) => {
    invById[i.id] = i;
    if (isSaleInvoice(i)) (invsByCust[i.customerId] = invsByCust[i.customerId] || []).push(i);
  });
  Object.values(invsByCust).forEach((l) => l.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (Number(a.invNo) || 0) - (Number(b.invNo) || 0)));
  const byCust = {};
  samples.forEach((s) => (byCust[s.customerId] = byCust[s.customerId] || []).push(s));
  Object.values(byCust).forEach((l) => l.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (Number(a.sampleNo) || 0) - (Number(b.sampleNo) || 0)));

  const want = {};
  samples.forEach((s) => {
    if (s.linkManual) {
      const inv = invById[s.convertedInvoiceId];
      want[s.id] = inv ? { id: inv.id, at: inv.date || "" } : { id: "", at: "" };
      return;
    }
    if (s.outcome === "lost" || !s.customerId || !s.date) return (want[s.id] = { id: "", at: "" });
    const list = byCust[s.customerId];
    const next = list[list.indexOf(s) + 1];
    let end = addDays(s.date, SAMPLE_WINDOW_DAYS);
    if (next && next.date && next.date > s.date && next.date < end) end = next.date;
    const hit = (invsByCust[s.customerId] || []).find((i) => (i.date || "") >= s.date && (i.date || "") < end);
    want[s.id] = hit ? { id: hit.id, at: hit.date || "" } : { id: "", at: "" };
  });
  let changed = false;
  const out = samples.map((s) => {
    const w = want[s.id];
    if (w && (s.convertedInvoiceId !== w.id || s.convertedAt !== w.at)) {
      changed = true;
      return { ...s, convertedInvoiceId: w.id, convertedAt: w.at };
    }
    return s;
  });
  return changed ? out : null;
};

// Converted / No sale / Lapsed / To send / Follow-up due / Followed up / Sent
export const sampleStatus = (s, crm) => {
  if (sampleInvoice(s, crm)) return "Converted";
  if (s.outcome === "lost") return "No sale";
  if (s.date && addDays(s.date, SAMPLE_WINDOW_DAYS) < today()) return "Lapsed";
  if (!s.dispatchedDate) return "To send";
  if (s.followedUp) return "Followed up";
  if (s.followUpDate && s.followUpDate <= today()) return "Follow-up due";
  return "Sent";
};
export const SAMPLE_TONES = { Converted: "green", "No sale": "red", Lapsed: "grey", "To send": "red", "Follow-up due": "amber", "Followed up": "gold", Sent: "grey" };
export const sampleIsOpen = (s, crm) => ["To send", "Sent", "Follow-up due", "Followed up"].includes(sampleStatus(s, crm));

// Conversion figures for a set of sample requests
export const sampleStats = (list, crm) => {
  let converted = 0, revenue = 0, days = 0, lost = 0, open = 0;
  list.forEach((s) => {
    const inv = sampleInvoice(s, crm);
    if (inv) {
      converted++;
      revenue += invoiceTotals(inv).total;
      const d = daysBetween(s.date, inv.date);
      if (d !== null) days += d;
    } else if (sampleIsOpen(s, crm)) open++;
    else lost++;
  });
  const decided = converted + lost;
  return {
    requests: list.length, converted, lost, open, revenue,
    rate: list.length ? converted / list.length : null,       // of all requests
    decidedRate: decided ? converted / decided : null,         // of those no longer in play
    avgDays: converted ? Math.round(days / converted) : null,
    perSample: list.length ? revenue / list.length : null,
  };
};

// ===== tasks =====
// Three kinds:
//  daily     — a personal to-do prompt list: repeats every working day (or every
//              day), or a one-off for a single date. Each person ticks their own.
//  project   — a small job for spare time: status, priority, optional target date.
//  scheduled — weekly / fortnightly / monthly on a set day; pops up for whoever
//              is due. With several people and "rotate" on, each occurrence goes
//              to the next person on the rota. One tick completes the occurrence.
// Nobody assigned = everyone. Completions live in taskLog (taskId + period + who).
export const TASK_KINDS = [["daily", "Daily list"], ["project", "Projects"], ["scheduled", "Scheduled"]];
export const TASK_REPEATS = [["workdays", "Every working day (Mon–Fri)"], ["everyday", "Every day"], ["once", "One day only"]];
export const TASK_FREQS = [["weekly", "Weekly"], ["fortnightly", "Every 2 weeks"], ["monthly", "Monthly"]];
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const PROJECT_STATUSES = ["To do", "In progress", "Done"];
export const PRIORITIES = ["Low", "Normal", "High"];

export const blankTask = (kind) => ({
  id: uid(),
  kind: kind || "daily",
  title: "",
  notes: "",
  assignees: [],
  rotate: false,
  repeat: "workdays",
  onDate: today(),
  frequency: "weekly",
  weekday: 0,          // 0 = Monday
  monthDay: 1,         // 1-31 (clamped to the month's length)
  startDate: today(),
  status: "To do",
  priority: "Normal",
  dueDate: "",
  active: true,
  createdBy: "",
  created: today(),
});

export const blankTaskLog = () => ({ id: uid(), taskId: "", period: "", doneBy: "", doneAt: "" });

const dow = (dateStr) => (new Date(dateStr + "T00:00:00").getDay() + 6) % 7; // Mon=0
const lastDayOf = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const ymd = (y, m, d) => y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
const monthOcc = (y, m, day) => ymd(y, m, Math.min(Number(day) || 1, lastDayOf(y, m)));

// Most recent occurrence of a scheduled task on or before `onDay`:
// { date, index } (index counts occurrences from the start, for the rota), or null.
export const scheduledOccurrence = (t, onDay) => {
  const day = onDay || today();
  const start = t.startDate || day;
  if (day < start) return null;
  if (t.frequency === "monthly") {
    const [sy, sm] = start.split("-").map(Number);
    let first = monthOcc(sy, sm - 1, t.monthDay);
    let fy = sy, fm = sm - 1;
    if (first < start) { fm += 1; if (fm > 11) { fm = 0; fy += 1; } first = monthOcc(fy, fm, t.monthDay); }
    if (day < first) return null;
    const [dy, dm] = day.split("-").map(Number);
    let y = dy, m = dm - 1;
    let occ = monthOcc(y, m, t.monthDay);
    if (occ > day) { m -= 1; if (m < 0) { m = 11; y -= 1; } occ = monthOcc(y, m, t.monthDay); }
    return { date: occ, index: (y - fy) * 12 + (m - fm) };
  }
  const step = t.frequency === "fortnightly" ? 14 : 7;
  const first = addDays(start, (((Number(t.weekday) || 0) - dow(start)) + 7) % 7);
  if (day < first) return null;
  const k = Math.floor(daysBetween(first, day) / step);
  return { date: addDays(first, k * step), index: k };
};

// The next occurrence after today (for "next due" displays)
export const nextScheduled = (t, fromDay) => {
  let d = addDays(fromDay || today(), 1);
  for (let i = 0; i < 400; i++, d = addDays(d, 1)) {
    const o = scheduledOccurrence(t, d);
    if (o && o.date === d) return o;
  }
  return null;
};

const lc = (s) => String(s || "").trim().toLowerCase();

// Who an occurrence belongs to: everyone listed, or the rota's turn.
export const occurrenceAssignees = (t, occ) => {
  const list = t.assignees || [];
  if (!list.length) return [];
  if (t.rotate && occ && list.length > 1) return [list[occ.index % list.length]];
  return list;
};

const isFor = (assignees, user) => !assignees.length || !user || assignees.some((a) => lc(a) === lc(user));

export const isWorkday = (d) => dow(d) < 5;

// Daily items showing for a user on a day
export const dailyTasksFor = (crm, user, day) => {
  const d = day || today();
  return (crm.tasks || []).filter((t) => {
    if (t.kind !== "daily" || t.active === false || !isFor(t.assignees || [], user)) return false;
    if (t.repeat === "once") return t.onDate === d;
    if (t.repeat === "workdays") return isWorkday(d);
    return true;
  });
};

export const taskDoneEntry = (crm, taskId, period, user) =>
  (crm.taskLog || []).find((l) => l.taskId === taskId && l.period === period && (user === undefined || lc(l.doneBy) === lc(user))) || null;

// daily items are ticked per person; scheduled occurrences once by anyone
export const isDailyDone = (crm, t, day, user) => Boolean(taskDoneEntry(crm, t.id, day, user));
export const isOccurrenceDone = (crm, t, occ) => Boolean(occ && taskDoneEntry(crm, t.id, occ.date));

// Scheduled occurrences currently due for a user (date reached, not done)
export const dueScheduledFor = (crm, user, day) => {
  const d = day || today();
  const out = [];
  (crm.tasks || []).forEach((t) => {
    if (t.kind !== "scheduled" || t.active === false) return;
    const occ = scheduledOccurrence(t, d);
    if (!occ || isOccurrenceDone(crm, t, occ)) return;
    // only the current occurrence nags; a missed one is replaced by the next
    if (!isFor(occurrenceAssignees(t, occ), user)) return;
    out.push({ task: t, occ, overdueDays: daysBetween(occ.date, d) });
  });
  return out.sort((a, b) => a.occ.date.localeCompare(b.occ.date));
};

export const projectsFor = (crm, user, includeDone) =>
  (crm.tasks || [])
    .filter((t) => t.kind === "project" && t.active !== false && isFor(t.assignees || [], user) && (includeDone || t.status !== "Done"))
    .sort((a, b) => PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));

// Tick / untick. Mutates the crm copy (inside updateCrm).
export const setTaskDone = (c, taskId, period, user, done) => {
  c.taskLog = c.taskLog || [];
  const t = (c.tasks || []).find((x) => x.id === taskId);
  const perUser = t && t.kind === "daily";
  const match = (l) => l.taskId === taskId && l.period === period && (!perUser || lc(l.doneBy) === lc(user));
  if (done) {
    if (!c.taskLog.some(match)) c.taskLog.push({ ...blankTaskLog(), taskId, period, doneBy: user || "", doneAt: new Date().toISOString() });
  } else c.taskLog = c.taskLog.filter((l) => !match(l));
};

export const staffName = (crm, email) => {
  const s = (crm.staff || []).find((x) => lc(x.email) === lc(email));
  if (s && s.name) return s.name;
  const e = String(email || "");
  return e ? e.split("@")[0].replace(/^\w/, (m) => m.toUpperCase()) : "Everyone";
};

// Everyone who can be given a task: logins (profiles) plus anyone already assigned
export const staffList = (crm, me) => {
  const seen = new Map();
  const add = (email, name) => {
    const k = lc(email);
    if (k && !seen.has(k)) seen.set(k, { email: String(email).trim(), name: name || "" });
  };
  (crm.staff || []).forEach((s) => add(s.email, s.name));
  if (me) add(me);
  (crm.tasks || []).forEach((t) => (t.assignees || []).forEach((a) => add(a)));
  return [...seen.values()].sort((a, b) => staffName(crm, a.email).localeCompare(staffName(crm, b.email)));
};

export const describeSchedule = (t) => {
  if (t.frequency === "monthly") {
    const n = Number(t.monthDay) || 1;
    const sfx = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
    return "Monthly on the " + n + sfx;
  }
  return (t.frequency === "fortnightly" ? "Every other " : "Every ") + WEEKDAYS[Number(t.weekday) || 0];
};

// ===== suppliers & purchases =====
// Suppliers hold the details once (our account # with them, address, contact,
// usual category / payment method) and feed both Purchases and Collections.
// Purchases follow the FileMaker layout: sub total entered ex VAT, VAT worked
// out from the rate (or typed over for mixed-rate invoices), total = both.
export const PURCHASE_CATEGORIES = [
  "Products", "Fixings & sundries", "Packaging", "Tools & equipment", "Couriers & freight",
  "Fuel", "Vehicle", "Travel & subsistence", "Subcontractors & drivers", "Workwear",
  "Premises & utilities", "Office & telecoms", "Website & software", "Marketing",
  "Professional fees", "Bank, finance & fees", "Insurance", "Tax & government", "Other",
];
// supplier account numbers are 3-digit, as in FileMaker (001, 002 …)
export const nextSupplierAccount = (crm) =>
  String(nextNumber(crm.suppliers || [], "accountNo", crm.numbering && crm.numbering.supplier)).padStart(3, "0");
export const PAYMENT_METHODS = ["Virgin Transfer", "Card", "Direct Debit", "Cash", "On account"];
export const VAT_RATES = [20, 5, 0];

export const blankSupplier = () => ({
  id: uid(),
  name: "",
  accountNo: "",
  contact: "",
  phone: "",
  email: "",
  address: "",
  town: "",
  postcode: "",
  website: "",
  category: "",
  paymentMethod: "",
  notes: "",
  active: true,
  created: today(),
});

export const blankPurchase = (supplierId) => ({
  id: uid(),
  poNo: null,
  createdAt: new Date().toISOString(),
  createdBy: "",
  supplierId: supplierId || "",
  physicalReceipt: false,
  invNo: "",
  invDate: "",
  invDetail: "",
  purchasedBy: "",
  category: "",
  vehicle: "",
  subTotal: "",
  vatRate: 20,
  vatAmount: "",     // "" = worked out from the rate; a number = typed over
  datePaid: "",
  paymentMethod: "",
});

const round2 = (n) => Math.round(n * 100) / 100;
export const purchaseTotals = (p) => {
  const sub = Number(p.subTotal) || 0;
  const rate = isFinite(Number(p.vatRate)) && p.vatRate !== "" ? Number(p.vatRate) : 20;
  const manual = p.vatAmount !== "" && p.vatAmount !== null && p.vatAmount !== undefined && isFinite(Number(p.vatAmount));
  const vat = manual ? Number(p.vatAmount) : round2(sub * rate / 100);
  return { sub, rate, vat, total: round2(sub + vat), manualVat: manual };
};
export const purchaseIsPaid = (p) => Boolean(p.datePaid);
export const poRef = (p) => "PO " + (p && p.poNo ? p.poNo : "—");

// Start a purchase for a supplier with their usual category / payment method
export const newPurchaseFor = (c, supplierId, actor, newId) => {
  const sup = (c.suppliers || []).find((x) => x.id === supplierId);
  const n = blankPurchase(supplierId);
  if (newId) n.id = newId;
  n.poNo = nextNumber(c.purchases || [], "poNo", c.numbering.purchase);
  n.createdBy = actor || "";
  if (sup) {
    n.category = sup.category || "";
    n.paymentMethod = sup.paymentMethod || "";
  }
  c.purchases = c.purchases || [];
  c.purchases.unshift(n);
  c.numbering.purchase = (Number(n.poNo) || 0) + 1;
  return n;
};

export const supplierById = (crm) => {
  const m = {};
  (crm.suppliers || []).forEach((x) => (m[x.id] = x));
  return m;
};

// Same supplier, ignoring case / Ltd / punctuation — to spot duplicates and match collections
export const supplierKey = (name) => String(name || "").toLowerCase().replace(/\b(ltd|limited|plc|llp|uk)\b/g, "").replace(/[^a-z0-9]/g, "");
export const findSupplierByName = (crm, name) => {
  const k = supplierKey(name);
  return k ? (crm.suppliers || []).find((x) => supplierKey(x.name) === k) || null : null;
};

export const supplierStats = (crm, supplierId) => {
  const ps = (crm.purchases || []).filter((p) => p.supplierId === supplierId);
  let spend = 0, unpaid = 0, unpaidCount = 0, last = "";
  ps.forEach((p) => {
    const t = purchaseTotals(p).total;
    spend += t;
    if (!purchaseIsPaid(p)) { unpaid += t; unpaidCount++; }
    const d = p.invDate || (p.createdAt || "").slice(0, 10);
    if (d > last) last = d;
  });
  const colls = (crm.collections || []).filter((c) => c.supplierId === supplierId).length;
  return { count: ps.length, spend: round2(spend), unpaid: round2(unpaid), unpaidCount, last, collections: colls };
};

// ===== stock check & shortfall collections =====
// A job's parts (kits exploded) come from our stock or from a collection raised
// for the job (picks with batch COL-n). Parts are matched across suppliers by
// the SKU without its supplier digits: same length, category, sub-category,
// product and colour = the same part, whoever we buy it from.
export const isColPick = (p) => /^COL-/i.test(String((p && p.batchRef) || ""));
export const partKey = (sku) => {
  const s = String(sku || "").trim();
  return /^\d{12}$/.test(s) ? "n:" + s.slice(2) : "s:" + s.toLowerCase();
};

// what the job needs, per part: total, already coming on collections, and the rest from stock
export const stockNeeds = (inv, crm) => {
  const need = new Map();
  explodeInvoiceLines(inv, crm).forEach((r) => {
    if (r.kind === "kit" || !r.sku || !r.qty) return;
    const k = partKey(r.sku);
    const cur = need.get(k) || { key: k, sku: r.sku, description: r.description, colour: r.colour, need: 0, covered: 0 };
    cur.need += Number(r.qty) || 0;
    need.set(k, cur);
  });
  (inv.picks || []).filter(isColPick).forEach((p) => {
    const cur = need.get(partKey(p.sku));
    if (cur) cur.covered += Number(p.qty) || 0;
  });
  return [...need.values()].map((n) => ({ ...n, fromStock: Math.max(0, n.need - n.covered) }));
};

// stock promised to OTHER undelivered jobs, per SKU (their own collections netted off)
const allocatedElsewhere = (crm, invId) => {
  const m = {};
  (crm.invoices || []).forEach((i) => {
    if (i.deliveryCompleted || i.id === invId) return;
    stockNeeds(i, crm).forEach((n) => {
      const k = n.sku.trim().toLowerCase();
      m[k] = (m[k] || 0) + n.fromStock;
    });
  });
  return m;
};

// the stock check shown on an invoice: per part, need / coming / in stock / short
export const stockCheck = (inv, crm) => {
  const bySku = skuIndex(crm);
  const elsewhere = allocatedElsewhere(crm, inv.id);
  return stockNeeds(inv, crm).map((n) => {
    const row = bySku[n.sku.trim().toLowerCase()];
    const stock = row && row.stock !== "" && row.stock !== null ? Number(row.stock) : 0;
    const free = Math.max(0, stock - (elsewhere[n.sku.trim().toLowerCase()] || 0));
    return { ...n, row, stock, free, short: inv.deliveryCompleted ? 0 : Math.max(0, n.fromStock - free) };
  });
};

// other suppliers' versions of the same part (same SKU after the supplier digits)
export const partAlternatives = (crm, sku) => {
  const k = partKey(sku);
  return (crm.masterProducts || []).filter((r) => r.active !== false && r.sku && r.sku !== sku && partKey(r.sku) === k && !r.isKit);
};

// Every supplier we could collect a part from. Same part = same master product
// (length · category · sub-category · product) in the same colour. When a
// supplier's version doesn't list that colour yet it is still offered, as a
// row to be made (addColour) — picking it adds the colour to their version.
// Returns [{ row, productId, addColour }].
export const partSuppliers = (crm, planner, sku, description, colourHint) => {
  const lists = skuLists(crm);
  const rows = crm.masterProducts || [];
  const lc = (v) => String(v || "").trim().toLowerCase();
  // the line's stock row by SKU — or, when the code was typed loosely, by its description + colour
  const me = rows.find((r) => lc(r.sku) === lc(sku))
    || (description && rows.find((r) => r.active !== false && lc(r.name) === lc(description) && (!colourHint || lc(r.colour) === lc(colourHint) || colourSeg(lists, r.colour) === colourSeg(lists, colourHint))));
  const out = partAlternatives(crm, me ? me.sku : sku).map((row) => ({ row, productId: row.importProductId || "", addColour: "" }));
  const products = (planner && planner.products) || [];
  const mine = me && products.find((p) => p.id === me.importProductId);
  const key = mine && masterKey(mine);
  if (!key) return out;
  const colour = String(me.colour || colourHint || "").trim();
  const seg = colourSeg(lists, colour);
  // include this supplier's own row for the matched product when the line's code was loose
  if (lc(me.sku) !== lc(sku) && !out.some((o) => o.row.id === me.id)) out.push({ row: me, productId: mine.id, addColour: "" });
  products.forEach((q) => {
    if (q.id === mine.id || q.isKit || masterKey(q) !== key) return;
    if (out.some((o) => o.productId === q.id)) return;
    const qRows = rows.filter((r) => r.importProductId === q.id && r.active !== false);
    const hit = qRows.find((r) => String(r.colour || "").trim().toLowerCase() === colour.toLowerCase())
      || (seg && seg !== "00" && qRows.find((r) => colourSeg(lists, r.colour) === seg));
    if (hit) return out.push({ row: hit, productId: q.id, addColour: "" });
    const want = numericSku(q, colour, lists);
    if (!want || !colour) return;
    out.push({
      row: { id: "new:" + q.id, sku: want, name: q.name || mine.name, colour, importProductId: q.id,
        costGbp: q.costGbp === "" || q.costGbp === null || q.costGbp === undefined ? "" : Number(q.costGbp) },
      productId: q.id, addColour: colour,
    });
  });
  return out;
};

// Keep the job's pick list in step: collection picks stay; stock picks are set
// to need - coming for each part (batch details on existing picks are kept).
export const reconcilePicks = (inv, crm) => {
  const needs = stockNeeds(inv, crm);
  const col = (inv.picks || []).filter(isColPick);
  let stock = (inv.picks || []).filter((p) => !isColPick(p));
  const out = [];
  needs.forEach((n) => {
    let target = n.fromStock;
    const mine = stock.filter((p) => partKey(p.sku) === n.key);
    stock = stock.filter((p) => partKey(p.sku) !== n.key);
    mine.forEach((p) => {
      if (target <= 0) return;
      const q = Math.min(Number(p.qty) || 0, target);
      if (q > 0) { out.push({ ...p, qty: q }); target -= q; }
    });
    if (target > 0) {
      const first = out.find((p) => partKey(p.sku) === n.key && !p.shipmentId && !p.batchRef);
      if (first) first.qty = (Number(first.qty) || 0) + target;
      else out.push({ ...blankPick(), sku: n.sku, description: n.description, colour: n.colour, qty: target });
    }
  });
  inv.picks = [...out, ...col];
  return inv.picks;
};

// Pick lists follow their invoice: for every job not yet delivered that has a
// pick list, re-net it against the current lines and kit recipes (batch refs,
// ticks and collection lines are kept). Returns { invoiceId: picks } for the
// ones that changed, or null.
export const syncOpenPicks = (crm) => {
  const out = {};
  const sig = (ps) => JSON.stringify((ps || []).map((p) => [p.id, p.sku, Number(p.qty) || 0, p.shipmentId || "", p.batchRef || "", p.picked === true]));
  (crm.invoices || []).forEach((inv) => {
    if (inv.deliveryCompleted || !(inv.picks || []).length) return;
    const copy = { ...inv, picks: (inv.picks || []).map((p) => ({ ...p })) };
    const next = reconcilePicks(copy, crm);
    if (sig(next) !== sig(inv.picks)) out[inv.id] = next;
  });
  return Object.keys(out).length ? out : null;
};

// Raise collection notes for a job's shortfall. choices: [{ row (the supplier's
// stock row to collect), qty, supplierName }] — grouped into one collection per
// supplier, every line assigned to the job and added to its pick list at cost.
export const raiseShortfallCollections = (c, invId, choices, actor) => {
  const inv = (c.invoices || []).find((i) => i.id === invId);
  if (!inv) return [];
  const bySupplier = new Map();
  choices.filter((x) => x.row && Number(x.qty) > 0).forEach((x) => {
    const k = (x.supplierName || "").trim() || "Supplier";
    if (!bySupplier.has(k)) bySupplier.set(k, []);
    bySupplier.get(k).push(x);
  });
  const made = [];
  c.collections = c.collections || [];
  bySupplier.forEach((lines, supName) => {
    const coll = blankCollection();
    coll.collectionNo = nextNumber(c.collections, "collectionNo", c.numbering.collection);
    c.numbering.collection = (Number(coll.collectionNo) || 0) + 1;
    coll.raisedBy = actor || "";
    const sup = findSupplierByName(c, supName);
    coll.supplier = sup ? sup.name : supName;
    if (sup) {
      coll.supplierId = sup.id;
      ["address", "town", "postcode", "contact"].forEach((k) => (coll[k] = sup[k] || ""));
      coll.phone = sup.phone || "";
    }
    coll.notes = "For job #" + (inv.invNo || "");
    lines.forEach((x) => {
      const cost = x.row.costGbp === "" || x.row.costGbp === null || x.row.costGbp === undefined ? "" : Number(x.row.costGbp);
      const item = { ...blankCollectionItem(), sku: x.row.sku, description: x.row.name, colour: x.row.colour || "", qty: Number(x.qty), unitCost: cost, assignedInvoiceId: inv.id };
      coll.items.push(item);
      inv.picks = inv.picks || [];
      inv.picks.push({ ...blankPick(), sku: item.sku, description: item.description, colour: item.colour, qty: item.qty, batchRef: "COL-" + coll.collectionNo, unitCost: cost, picked: false });
    });
    c.collections.unshift(coll);
    made.push(coll);
  });
  reconcilePicks(inv, c);
  return made;
};

// a collection deleted before it's done: take its lines back off the jobs
export const releaseCollectionPicks = (c, coll) => {
  const ref = "COL-" + (coll.collectionNo || "");
  (c.invoices || []).forEach((i) => {
    if (!(i.picks || []).some((p) => p.batchRef === ref)) return;
    i.picks = i.picks.filter((p) => p.batchRef !== ref);
    reconcilePicks(i, c);
  });
};
