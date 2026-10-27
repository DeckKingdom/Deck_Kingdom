export const NAVY = "#0B1F3F";
export const GOLD = "#F4B73E";
export const RED = "#C8102E";

export const uid = () => Math.random().toString(36).slice(2, 10);

export const seedProducts = [
  { id: uid(), name: "Decking board 3.6m", colours: ["Grey", "Teak", "Chocolate", "Black"], qty: 110, cost: 8.2, weight: 0, supplier: "", category: "Decking boards" },
  { id: uid(), name: "Balustrade kit 1.8m", colours: ["Black", "Grey", "Teak", "Chocolate"], qty: 78, cost: 10.5, weight: 0, supplier: "", category: "Balustrade kits" },
  { id: uid(), name: "Composite fence post 2.4m", colours: ["Grey", "Teak", "Chocolate", "Black"], qty: 100, cost: 0, weight: 0, supplier: "", category: "Fencing components" },
];

export const newShipment = (name) => ({
  id: uid(),
  name: name || "New shipment",
  status: "Planning",
  supplier: "",
  created: new Date().toISOString().slice(0, 10),
  orderDate: new Date().toISOString().slice(0, 10),
  depositDate: "",
  balancePaidDate: "",
  surchargeOn: true,
  arrivedDate: "",
  valueUsd: "",
  fxRate: "",
  shippingGbp: "",
  dutyGbp: "",
  dutyOn: true,
  invoiceNo: "",
  depositUsd: "",
  depositFx: "",
  balanceUsd: "",
  balanceFx: "",
  lines: [],
});

export const addMonths = (dateStr, months) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

export const addDays = (dateStr, days) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const hashPin = async (pin) => {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("dk-pin:" + pin));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    let h = 5381;
    const s = "dk-pin:" + pin;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return "djb2:" + h.toString(16);
  }
};

export const daysBetween = (a, b) => {
  if (!a || !b) return null;
  const d1 = new Date(a + "T00:00:00");
  const d2 = new Date(b + "T00:00:00");
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
  return Math.round((d2 - d1) / 86400000);
};

export const prettyDate = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const STATUSES = ["Planning", "Confirmed", "In production", "Shipped", "Arrived", "Paid"];
export const STATUS_COLOURS = {
  Planning: "#F4B73E",
  Confirmed: "#8ab4f8",
  "In production": "#c58af9",
  Shipped: "#7bd88f",
  Arrived: "#9aa5b1",
  Paid: "#2c7a3f",
};

// Row/panel background tint per stage — Planning stays plain; from Confirmed onwards the stage colour shows through
export const stageTint = (status) => (status && status !== "Planning" && STATUS_COLOURS[status] ? STATUS_COLOURS[status] + "1a" : undefined);

export const snapPallets = (v) => {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return 0;
  if (n < 1) return n <= 0.375 ? 0.25 : 0.5;
  if (n < 2) return Math.round(n * 2) / 2;
  return Math.round(n);
};

export const stepPallets = (v, dir) => {
  const n = Number(v) || 0;
  if (dir > 0) {
    if (n < 0.25) return 0.25;
    if (n < 0.5) return 0.5;
    if (n < 1) return 1;
    if (n < 1.5) return 1.5;
    if (n < 2) return 2;
    return Math.floor(n) + 1;
  }
  if (n > 2) return Math.ceil(n) - 1;
  if (n > 1.5) return 1.5;
  if (n > 1) return 1;
  if (n > 0.5) return 0.5;
  if (n > 0.25) return 0.25;
  return 0.25;
};

export const money = (n) =>
  (isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const int = (n) => (isFinite(n) ? n : 0).toLocaleString("en-US");
