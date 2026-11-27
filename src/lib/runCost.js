// Pricing a delivery run — Jon's numbers: £15/hr driver, 30 mpg at £1.90 a
// litre, and 20 minutes allowed per drop for unloading. Road miles and drive
// times come from the route-miles function (Google), cached per leg in the
// browser. Used by the schedule's run chips and Home's Delivery P/L card.
import { isVoidInvoice, isCollectionJob, invoiceTotals } from "./crmCore.js";

export const DRIVER_HR = 15;
export const MILE_COST = (4.54609 * 1.9) / 30; // £ per mile at 30 mpg, £1.90/litre
export const UNLOAD_MIN = 20; // allowed per drop for unloading (Jon's average)
export const DRIVE_BUFFER = 1.1; // Google's drive time + 10% — real runs come in longer (traffic, loaded vans)
export const BASE_PC = "OL6 6UG";
export const FREE_LEAK_LIMIT = 1200; // a free drop under this order value is leakage

// postcodes (consecutive duplicates already collapsed) -> the out-and-back legs
export const runLegList = (pcs) => {
  const stops = [BASE_PC, ...pcs, BASE_PC];
  return stops.slice(1).map((to, i) => ({ from: stops[i], to }));
};

export const priceRun = (miles, driveMin, drops) => {
  const totMin = driveMin * DRIVE_BUFFER + drops * UNLOAD_MIN;
  return { totMin, cost: (totMin / 60) * DRIVER_HR + miles * MILE_COST };
};

// is this invoice a van delivery at all / a free drop that didn't earn it?
export const isVanDeliveryJob = (i) => !isVoidInvoice(i) && !isCollectionJob(i) && !posted(i);
export const isLeakFreeDrop = (i) => isVanDeliveryJob(i) && !((Number(i.deliveryCharge) || 0) > 0) && invoiceTotals(i).total < FREE_LEAK_LIMIT;

// Does a free drop look like a warranty job / re-visit rather than a sale we
// under-charged? Signals: nothing (or less) was charged at all, or the job's
// notes mention warranty / replacement / re-visit language. Line descriptions
// only count for the unambiguous words, so "damaged - clearance" sales don't match.
const WARR_NOTES = /warrant|replace|re-?visit|re-?deliver|redeliver|goodwill|free of charge|\bfoc\b|\bn\/c\b|no charge|snag|remedial|rectif|our (mistake|error|fault)|wrong (item|colou?r|board|length|product)|sent (the )?wrong|damaged|missing|short[- ]?(sent|delivered)/i;
const WARR_LINES = /warrant|replacement|re-?visit|goodwill|free of charge|\bfoc\b|no charge/i;
export const isWarrantyLook = (i) => {
  if (!(invoiceTotals(i).total > 0)) return true;
  if (WARR_NOTES.test([i.jobType, i.jobNotes, i.orderRef, i.paymentType].join(" "))) return true;
  return (i.lines || []).some((l) => WARR_LINES.test(l.description || ""));
};

// jobs that go by post or courier rather than on a van
const posted = (inv) => /evri|post|courier|parcel|royal ?mail|dpd|\bups\b|\btg\b/i.test((inv && inv.jobType) || "");

// Group the book's van work into runs between two dates (inclusive; from ""
// means from the beginning). A run = delivery date + driver + run number —
// deliveries in drop order with their supplier pick-ups (pick-ups first, the
// way they ride the schedule). Returns [{ date, drops, pcs, fees, feesNet }],
// newest first; runs with no postcoded stops are left out and counted.
// a collection's postcode, falling back to its supplier's record
export const collPostcode = (crm, c) => {
  let pc = String(c.postcode || "").trim();
  if (pc) return pc;
  const sup = (crm.suppliers || []).find((x) => x.id === c.supplierId) ||
    (crm.suppliers || []).find((x) => (x.name || "").toLowerCase() === String(c.supplier || "").toLowerCase());
  return String((sup && sup.postcode) || "").trim();
};

export const runGroups = (crm, from, to) => {
  const custById = Object.fromEntries((crm.customers || []).map((c) => [c.id, c]));
  const siteById = Object.fromEntries((crm.sites || []).map((s) => [s.id, s]));
  const map = new Map();
  const slot = (date, driver, runNo) => {
    const k = date + "|" + (driver || "") + "|" + (runNo || "");
    if (!map.has(k)) map.set(k, { date, stops: [], drops: 0, picks: 0, feeDrops: 0, freeDrops: 0, smallFree: 0, warrFree: 0, fees: 0, feesNet: 0 });
    return map.get(k);
  };
  (crm.invoices || []).forEach((i) => {
    const d = i.deliveryDate || "";
    if (!d || (from && d < from) || (to && d > to)) return;
    if (isVoidInvoice(i) || isCollectionJob(i) || posted(i)) return;
    const st = siteById[i.siteId] || {}, cu = custById[i.customerId] || {};
    const pc = String(st.postcode || cu.postcode || "").trim();
    const g = slot(d, i.driver, i.runNo);
    g.drops += 1;
    if ((Number(i.deliveryCharge) || 0) > 0) g.feeDrops += 1; else g.freeDrops += 1;
    let warr = false;
    if ((Number(i.deliveryCharge) || 0) > 0) ; else if (invoiceTotals(i).total < FREE_LEAK_LIMIT && isWarrantyLook(i)) warr = true;
    if (warr) g.warrFree += 1;
    if (!((Number(i.deliveryCharge) || 0) > 0) && invoiceTotals(i).total < FREE_LEAK_LIMIT) g.smallFree += 1;
    g.fees += Number(i.deliveryCharge) || 0;
    g.feesNet += (Number(i.deliveryCharge) || 0) / (1 + (Number(i.vatRate) || 20) / 100);
    if (pc) g.stops.push({ ord: 1, sub: Number(i.dropNo) || 99, pc, warr });
  });
  (crm.collections || []).forEach((c) => {
    const d = c.collectDate || "";
    if (!d || (from && d < from) || (to && d > to)) return;
    if (!(c.driver || c.runNo)) return; // not on a van run
    const g = slot(d, c.driver, c.runNo);
    g.picks += 1; // a pick-up takes loading time like a drop takes unloading
    const pc = collPostcode(crm, c);
    if (pc) g.stops.push({ ord: 0, sub: 0, pc });
  });
  let skipped = 0;
  const runs = [];
  const collapse = (stops) => stops.map((s) => s.pc).filter((pc, ix, arr) => pc.toUpperCase() !== String(arr[ix - 1] || "").toUpperCase());
  map.forEach((g) => {
    const sorted = g.stops.sort((a, b) => a.ord - b.ord || a.sub - b.sub);
    const pcs = collapse(sorted);
    if (!pcs.length) { skipped += 1; return; }
    // the same route with the warranty re-visit stops taken out — what the run
    // would have looked like if we hadn't had to go back
    const pcs2 = collapse(sorted.filter((s) => !s.warr));
    runs.push({ date: g.date, drops: g.drops, picks: g.picks, feeDrops: g.feeDrops, freeDrops: g.freeDrops, smallFree: g.smallFree, warrFree: g.warrFree, pcs, pcs2, fees: g.fees, feesNet: g.feesNet });
  });
  runs.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { runs, skipped };
};
