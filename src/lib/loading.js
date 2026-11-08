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
        const src = pickupForLine(crm, inv, l);
        r.lines.push({ key: inv.id + ":" + i, inv, line: l, idx: i, qty: Number(l.qty) || 0, customer: (custs[inv.customerId] || {}).name || "Customer", src });
      });
    });
    return r;
  });
  return out.sort((a, b) => lc(a.van || a.driver).localeCompare(lc(b.van || b.driver)) || lc(a.driver).localeCompare(lc(b.driver)) || a.runNo.localeCompare(b.runNo));
}

// where a run's loading stands: { loaded, part, todo, allocated, unscheduled, total, ready, complete }
export function loadState(run, counts, report) {
  let loaded = 0, part = 0, todo = 0, allocated = 0, unscheduled = 0;
  run.lines.forEach((x) => {
    if (x.src) { if (x.src.scheduled) allocated++; else unscheduled++; return; }
    const n = Number((counts || {})[x.key] && counts[x.key].qtyLoaded) || 0;
    if (n >= x.qty) loaded++; else if (n > 0) part++; else todo++;
  });
  const total = run.lines.length;
  const ready = part === 0 && todo === 0 && unscheduled === 0; // everything on the van or booked on a pick-up
  const complete = total === 0 || !!(report && report.status === "complete");
  return { loaded, part, todo, allocated, unscheduled, total, ready, complete };
}
