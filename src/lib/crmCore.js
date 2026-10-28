// CRM domain helpers: customers, sites, invoices, delivery schedule.
import { uid, daysBetween } from "./core.js";

export const JOB_TYPES = ["Delivery 1", "Delivery 2", "Collection", "Post", "Transfer"];
export const PAYMENT_TYPES = ["COD", "Stripe", "Transfer", "Card", "Cash", "Post"];
export const SOURCES = ["Website", "Market Place", "Repeat", "Transfer", "Word of Mouth", "Walk-in"];
export const VANS = ["Van 1", "Van 2", "Van 3", "Sprinter", "Courier"];

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
  jobType: "Delivery 1",
  van: "",
  weightKg: "",
  deliveryDate: "",
  deliveryTime: "",
  deliveryCompleted: false,
  paymentType: "",
  paymentDate: "",
  deliveryCharge: "",
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
});

export const blankLine = () => ({ id: uid(), code: "", description: "", colour: "", qty: "", price: "" });

export const emptyCrm = () => ({
  customers: [],
  sites: [],
  invoices: [],
  numbering: { account: 1, site: 1, invoice: 1 },
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
  d.customers.forEach((x) => Object.assign(x, { ...blankCustomer(), ...x, id: x.id || uid() }));
  d.sites.forEach((x) => Object.assign(x, { ...blankSite(x.customerId), ...x, id: x.id || uid() }));
  d.invoices.forEach((x) => {
    const b = blankInvoice(x.customerId, x.siteId);
    Object.assign(x, { ...b, ...x, id: x.id || uid() });
    x.flags = { ...b.flags, ...(x.flags || {}) };
    x.lines = Array.isArray(x.lines) ? x.lines : [];
    x.lines.forEach((l) => Object.assign(l, { ...blankLine(), ...l, id: l.id || uid() }));
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
  const delivery = Number(inv.deliveryCharge) || 0;
  const total = goods + delivery;
  const rate = isFinite(Number(inv.vatRate)) ? Number(inv.vatRate) : 20;
  const vat = total - total / (1 + rate / 100);
  return { goods, delivery, total, vat, net: total - vat };
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
  if (inv.jobType === "Collection") return "gold";
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
