// Loading the vans: which runs go out on a day, and what has to go on each van.
// A run = one driver's run number on a day (shown with its van). Its loading list is every line of
// every delivery on the run; a line coming on a supplier pick-up doesn't go on in the yard - it's
// "allocated" once that pick-up is booked (date + driver) or already collected.
import { isVoidInvoice, isCollectionJob, partKey } from "./crmCore.js";

const lc = (x) => String(x || "").trim().toLowerCase();
export const reportKey = (date, driver, runNo) => [date, lc(driver), String(runNo || "")].join("|");
export const invLinesOf = (o) => (o.lines || []).map((l, i) => ({ l, i })).filter(({ l }) => Number(l.qty) && (l.description || l.code));
const same = (l, it) => (l.code && it.sku && partKey(l.code) === partKey(it.sku)) || (l.description && it.description && l.description.trim().toLowerCase() === it.description.trim().toLowerCase());

// the supplier pick-up a job line is coming on (any day), or null
export const pickupForLine = (crm, inv, l) => {
  for (const c of crm.collections || []) {
    const it = (c.items || []).find((x) => x.assignedInvoiceId === inv.id && same(l, x));
    if (it) return { col: c, it, scheduled: !!(c.collected || (c.collectDate && c.driver)) };
  }
  return null;
};

// runs on a day: [{ key, date, driver, runNo, van, jobs, pickups, lines }]
export function runsOn(crm, date, onlyDriver) {
  const m = new Map();
  const get = (drv, runNo, van) => {
    const k = reportKey(date, drv, runNo);
    if (!m.has(k)) m.set(k, { key: k, date, driver: drv, runNo: String(runNo || ""), van: "", jobs: [], pickups: [], lines: [] });
    const r = m.get(k);
    if (!r.van && van) r.van = van;
    return r;
  };
  const mineOk = (d) => !onlyDriver || lc(d) === lc(onlyDriver);
  (crm.invoices || []).forEach((i) => {
    if (isVoidInvoice(i) || isCollectionJob(i) || i.deliveryDate !== date || !i.driver || !mineOk(i.driver)) return;
    get(i.driver, i.runNo, i.van).jobs.push(i);
  });
  (crm.collections || []).forEach((c) => {
    if (c.collectDate !== date || !c.driver || !mineOk(c.driver)) return;
    get(c.driver, c.runNo, c.van).pickups.push(c);
  });
  const custs = Object.fromEntries((crm.customers || []).map((x) => [x.id, x]));
  const out = [...m.values()].map((r) => {
    r.jobs.sort((a, b) => (Number(b.dropNo) || 0) - (Number(a.dropNo) || 0)); // last drop first: it goes on first
    r.lines = [];
    r.jobs.forEach((inv) => {
      if (inv.deliveryCompleted) return; // already delivered: nothing to load
      invLinesOf(inv).forEach(({ l, i }) => {
        const p = pickupForLine(crm, inv, l);
        // once the pick-up is ticked as collected the goods are in hand, so the
        // line counts (and gets ticked) like any other; until then it just rides
        const from = p && p.col.collected ? p : null;
        r.lines.push({ key: inv.id + ":" + i, inv, line: l, idx: i, qty: Number(l.qty) || 0, customer: (custs[inv.customerId] || {}).name || "Customer", src: from ? null : p, from });
      });
    });
    return r;
  });
  return out.sort((a, b) => lc(a.van || a.driver).localeCompare(lc(b.van || b.driver)) || lc(a.driver).localeCompare(lc(b.driver)) || a.runNo.localeCompare(b.runNo));
}

// where a run's loading stands: { loaded, part, todo, allocated, unscheduled, total, ready, submitted, complete }
// submitted = loaded and photographed, waiting for a second person to double-check; complete = checked
export function loadState(run, counts, report) {
  let loaded = 0, part = 0, todo = 0, allocated = 0, unscheduled = 0;
  run.lines.forEach((x) => {
    if (x.src) { if (x.src.scheduled) allocated++; else unscheduled++; return; }
    const n = Number((counts || {})[x.key] && counts[x.key].qtyLoaded) || 0;
    if (n >= x.qty) loaded++; else if (n > 0) part++; else todo++;
  });
  const total = run.lines.length;
  const ready = part === 0 && todo === 0 && unscheduled === 0; // everything on the van or booked on a pick-up
  // a job added to the run AFTER the van was submitted/checked: its lines have no
  // count rows and aren't recorded as short, so the closed report no longer covers
  // the run — surface it as "new items to load" instead of a false green tick
  const closedRep = !!(report && (report.status === "complete" || report.status === "submitted"));
  const shortKeys = new Set(((report && report.shortLines) || []).map((x) => x.key));
  const stale = closedRep && total > 0 && run.lines.some((x) => !x.src && (counts || {})[x.key] === undefined && !shortKeys.has(x.key));
  const complete = !stale && (total === 0 || !!(report && report.status === "complete"));
  const submitted = !stale && !complete && !!(report && report.status === "submitted");
  return { loaded, part, todo, allocated, unscheduled, total, ready, submitted, complete, stale };
}
// can this person do the double-check? (anyone but whoever loaded and submitted it)
// who's on this van right now (someone else, within the last few minutes)
export const LOCK_STALE_MS = 3 * 60 * 1000;
export const lockHolder = (rep, who) => {
  if (!rep || !rep.loadingBy) return "";
  if (String(rep.loadingBy).toLowerCase() === String(who || "").replace(/[,()"']/g, "").trim().toLowerCase()) return "";
  const at = Date.parse(rep.loadingAt || "") || 0;
  return Date.now() - at < LOCK_STALE_MS ? rep.loadingBy : "";
};

export const canCheck = (report, who) => !!report && report.status === "submitted" && lc(report.completedBy) !== lc(who);
export const shortName = (e) => {
  const s = String(e || "").split("@")[0];
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

// what's missing from a van: [{ invId, invNo, customer, key, text, colour, qty, loaded, missing, why }]
export function shortLinesOf(run, counts) {
  const out = [];
  run.lines.forEach((x) => {
    const base = { invId: x.inv.id, invNo: x.inv.invNo, customer: x.customer, key: x.key, idx: x.idx, code: x.line.code || "", text: x.line.description || x.line.code, colour: x.line.colour || "", qty: x.qty };
    if (x.src) { if (!x.src.scheduled) out.push({ ...base, loaded: 0, missing: x.qty, why: "On COL-" + x.src.col.collectionNo + " - pick-up not booked" }); return; }
    const c = (counts || {})[x.key], got = c ? Number(c.qtyLoaded) || 0 : 0;
    if (got < x.qty) out.push({ ...base, loaded: got, missing: x.qty - got, why: got ? "Part loaded" : "Not loaded" });
  });
  return out;
}
