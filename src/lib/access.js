// Access levels: what each login can see and do. The database enforces the same rules
// (supabase/migrations/037_access_levels.sql); this just keeps the screens tidy.
export const LEVELS = [
  { key: "admin", label: "Admin", blurb: "Everything, including system settings and who can log in" },
  { key: "manager", label: "Manager", blurb: "Everything except system settings and user access" },
  { key: "office", label: "Office", blurb: "Customers, invoices, quotes, samples, delivery schedule, collections — no costs or profit" },
  { key: "warehouse", label: "Warehouse", blurb: "Same as office; on a phone it opens the loading app for every van" },
  { key: "driver", label: "Driver", blurb: "Phone screen only: loading and deliveries for their own runs, and the fuel log" },
];
export const levelLabel = (k) => (LEVELS.find((x) => x.key === k) || { label: k === "none" ? "No access" : k || "—" }).label;

// screens office and warehouse logins can open
const DAY_TO_DAY = ["home", "tasks", "customers", "invoices", "quotes", "samples", "schedule", "reviews", "loading", "issues", "collections"];

export const accessFor = (role, readOnly) => {
  const r = role || "none";
  const full = r === "admin" || r === "manager";
  const staff = r !== "none" && r !== "driver"; // drivers get their own phone screen, not the office app
  return {
    role: r,
    readOnly: !!readOnly,
    known: true,
    staff,
    canTab: (t) => (!staff ? false : t === "users" || t === "tracking" ? r === "admin" : full || DAY_TO_DAY.includes(t)),
    money: full, // costs, margins, landed costs, sales and profit totals
    system: r === "admin", // users & access, restore, email setup, SKU lists, product tidy
    canEdit: staff && !readOnly,
    canManage: full && !readOnly, // products, shipments, purchases, vans
  };
};
// before the login's level has loaded (or on the local/offline version): local = everything
export const LOCAL_ACCESS = { ...accessFor("admin", false), known: true };
export const LOADING_ACCESS = { ...accessFor("office", true), known: false };
