// CRM domain helpers: customers, sites, invoices, delivery schedule.
import { uid, daysBetween, landedPerPiece } from "./core.js";

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
  return d.toISOString().slice(0, 10);
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

export const today = () => new Date().toISOString().slice(0, 10);

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

export const blankCollectionItem = () => ({ id: uid(), sku: "", description: "", colour: "", qty: "", unitCost: "" });

export const blankMovement = () => ({ id: uid(), at: new Date().toISOString(), sku: "", mpId: "", qty: 0, unitCost: "", kind: "", ref: "" });

export const blankLine = () => ({ id: uid(), code: "", description: "", colour: "", qty: 0, price: "" });

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
  numbering: { account: 1, site: 1, invoice: 1, collection: 1 },
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

// Keeps the background stock/SKU table in step with the Products screen:
// one row per product+colour, created and updated automatically. Stock and
// batch costs are never touched. Returns the new array, or null if in step.
export const syncMasterFromProducts = (crm, planner) => {
  const products = (planner && planner.products) || [];
  if (!products.length) return null;
  const next = JSON.parse(JSON.stringify(crm.masterProducts || []));
  const byKey = {};
  next.forEach((m) => {
    if (m.importProductId) byKey[m.importProductId + "||" + (m.colour || "").trim().toLowerCase()] = m;
  });
  const taken = new Set(next.map((m) => (m.sku || "").toLowerCase()));
  let changed = false;
  products.forEach((p) => {
    const colours = p.colours && p.colours.length ? p.colours : [""];
    const seen = new Set();
    colours.forEach((colRaw) => {
      const col = String(colRaw || "").trim();
      const lk = col.toLowerCase();
      if (seen.has(lk)) return;
      seen.add(lk);
      const want = {
        name: p.name || "",
        colour: col,
        family: p.name || "",
        category: p.category || "",
        weightKg: Number(p.weight) > 0 ? Number(p.weight) : "",
        priceIncVat: Number(p.salePrice) > 0 ? Number(p.salePrice) : "",
      };
      const cur = byKey[p.id + "||" + lk];
      if (!cur) {
        const sku = genSku(p.name, col, taken);
        taken.add(sku.toLowerCase());
        next.push({ ...blankMasterProduct(), ...want, sku, importProductId: p.id, unit: "each" });
        changed = true;
      } else {
        Object.entries(want).forEach(([k, v]) => {
          if (k === "priceIncVat" && v === "" && cur[k] !== "") return; // keep a price once set
          if (cur[k] !== v) {
            cur[k] = v;
            changed = true;
          }
        });
      }
    });
  });
  return changed ? next : null;
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
export const explodeInvoiceLines = (inv, crm) => {
  const bySku = skuIndex(crm);
  const byId = mpById(crm);
  const rows = [];
  (inv.lines || []).forEach((l) => {
    const qty = Number(l.qty) || 0;
    const mp = bySku[(l.code || "").trim().toLowerCase()];
    if (mp && mp.isKit && (mp.components || []).length) {
      rows.push({ kind: "kit", sku: mp.sku, description: l.description || mp.name, colour: l.colour || mp.colour, qty, weightKg: null });
      mp.components.forEach((c) => {
        const comp = byId[c.componentId];
        if (!comp) return;
        const cq = qty * (Number(c.qty) || 0);
        rows.push({ kind: "part", sku: comp.sku, description: comp.name, colour: comp.colour, qty: cq, weightKg: comp.weightKg !== "" && comp.weightKg !== null ? cq * Number(comp.weightKg) : null });
      });
    } else {
      rows.push({ kind: "line", sku: l.code, description: l.description, colour: l.colour, qty, weightKg: mp && mp.weightKg !== "" && mp.weightKg !== null ? qty * Number(mp.weightKg) : null });
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
export const buildPicks = (inv, crm) =>
  explodeInvoiceLines(inv, crm)
    .filter((r) => r.kind !== "kit")
    .map((r) => ({ ...blankPick(), sku: r.sku, description: r.description, colour: r.colour, qty: r.qty }));

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
