// Driver tracking maths: miles, hours and the cost of each drop, worked out from the set-off time,
// every drop confirmation (time + where the phone was) and the postcodes; plus the checks.
import { milesBetween, tidyPc } from "./geo.js";
import { isVoidInvoice, isCollectionJob } from "./crmCore.js";

export const FLEET_DEFAULTS = {
  dieselPerLitre: 1.45, // £ a litre
  mpg: 30, // every van…
  sprinterMpg: 24, // …except the Sprinter
  hourly: 15, // driver £ an hour, set-off to back at the yard
  yard: "OL6 6UG",
  roadFactor: 1.25, // roads aren't straight lines: crow-flies miles x this
  avgMph: 35, // for the drive back to the yard
  awayMiles: 0.5, // a drop confirmed further than this from its address gets flagged
  tolerancePct: 5,
  alertsTo: "fastfireengineer@gmail.com", // whose desktop the pop-up alerts go to
};
export const fleetSettings = (crm) => ({ ...FLEET_DEFAULTS, ...((crm && crm.fleetCosts) || {}) });
const LITRES_PER_GALLON = 4.54609;
export const mpgFor = (van, s) => (/sprinter/i.test(String(van || "")) ? Number(s.sprinterMpg) || 24 : Number(s.mpg) || 30);
export const costPerMile = (van, s, perLitre) => ((perLitre || Number(s.dieselPerLitre)) * LITRES_PER_GALLON) / mpgFor(van, s);
export const legKey = (a, b) => [a.lat, a.lng, b.lat, b.lng].map((n) => Number(n).toFixed(3)).join(",");
// that day's supermarket diesel price (£/L), or the nearest day before it within a week, or the set rate
export const priceOn = (day, prices, s) => {
  for (let n = 0; n < 8; n++) {
    const d = new Date(day + "T12:00:00"); d.setDate(d.getDate() - n);
    const k = d.toISOString().slice(0, 10);
    if (prices && prices[k]) return { perLitre: prices[k] / 100, day: k, published: true };
  }
  return { perLitre: Number(s.dieselPerLitre), day: "", published: false };
};
const lc = (x) => String(x || "").trim().toLowerCase();
const ms = (iso) => new Date(iso).getTime();

// every postcode the screen needs coordinates for
export const trackingPostcodes = (crm, from, to, s) => {
  const out = [s.yard];
  const sites = {}; (crm.sites || []).forEach((x) => (sites[x.id] = x));
  const custs = {}; (crm.customers || []).forEach((x) => (custs[x.id] = x));
  (crm.invoices || []).forEach((i) => {
    if (i.deliveryDate >= from && i.deliveryDate <= to && i.driver) { const a = sites[i.siteId] || custs[i.customerId] || {}; out.push(a.postcode); }
  });
  (crm.collections || []).forEach((c) => { if (c.collectDate >= from && c.collectDate <= to && c.driver) out.push(c.postcode); });
  return out.filter(Boolean);
};

// -> { runs, alerts }
export function buildRuns({ crm, confs, events, geo, s, from, to, driver, roads = {}, prices = {} }) {
  const sites = {}; (crm.sites || []).forEach((x) => (sites[x.id] = x));
  const custs = {}; (crm.customers || []).forEach((x) => (custs[x.id] = x));
  const yard = geo[tidyPc(s.yard)] || null;
  const confBy = {};
  confs.forEach((r) => (confBy[r.collectionId ? "col:" + r.collectionId : r.invoiceId] = r));
  const byRun = new Map();
  const add = (date, drv, runNo, stop) => {
    if (driver && lc(drv) !== lc(driver)) return;
    const k = [date, lc(drv), String(runNo || "")].join("|");
    if (!byRun.has(k)) byRun.set(k, { key: k, date, driver: drv, runNo: String(runNo || ""), van: "", stops: [] });
    const r = byRun.get(k);
    if (!r.van && stop.van) r.van = stop.van;
    r.stops.push(stop);
  };
  (crm.invoices || []).forEach((i) => {
    if (isVoidInvoice(i) || isCollectionJob(i) || !i.driver || !(i.deliveryDate >= from && i.deliveryDate <= to)) return;
    const a = sites[i.siteId] || custs[i.customerId] || {};
    const c = custs[i.customerId] || {};
    add(i.deliveryDate, i.driver, i.runNo, { kind: "inv", id: i.id, obj: i, name: c.name || "Customer", ref: "#" + (i.invNo || ""), postcode: tidyPc(a.postcode), dropNo: i.dropNo, van: i.van, conf: confBy[i.id] || null, done: !!i.deliveryCompleted });
  });
  (crm.collections || []).forEach((c) => {
    if (!c.driver || !(c.collectDate >= from && c.collectDate <= to)) return;
    add(c.collectDate, c.driver, c.runNo, { kind: "col", id: c.id, obj: c, name: (c.supplier || "Supplier") + " pick-up", ref: "COL-" + (c.collectionNo || ""), postcode: tidyPc(c.postcode), dropNo: c.dropNo, van: c.van, conf: confBy["col:" + c.id] || null, done: !!c.collected,
      forJobs: [...new Set((c.items || []).map((it) => it.assignedInvoiceId).filter(Boolean))] });
  });

  const alerts = [];
  const runs = [...byRun.values()].map((run) => {
    const confirmed = run.stops.filter((x) => x.conf).sort((a, b) => ms(a.conf.at) - ms(b.conf.at));
    const unconfirmed = run.stops.filter((x) => !x.conf).sort((a, b) => (Number(a.dropNo) || 99) - (Number(b.dropNo) || 99));
    const dep = (events || []).filter((e) => e.kind === "depart" && e.date === run.date && lc(e.driver) === lc(run.driver) && String(e.runNo || "") === run.runNo).sort((a, b) => ms(a.at) - ms(b.at))[0] || null;
    const price = priceOn(run.date, prices, s);
    const cpm = costPerMile(run.van, s, price.perLitre);
    const rf = Number(s.roadFactor) || 1.25;
    const legs = []; // [{ from, to }] the screen asks Google for
    let allRoad = true;
    // road miles from Google when we have them, otherwise straight line x the road factor
    const legMiles = (a, b) => {
      if (!a || !b) return { miles: 0, minutes: null };
      legs.push({ from: a, to: b });
      const r = roads[legKey(a, b)];
      if (r) return r;
      allRoad = false;
      return { miles: (milesBetween(a, b) || 0) * rf, minutes: null };
    };
    const where = (x) => (x.conf && x.conf.lat != null ? { lat: x.conf.lat, lng: x.conf.lng } : geo[x.postcode] || null);
    // where each drop was confirmed vs its address
    confirmed.forEach((x) => {
      const addr = geo[x.postcode];
      x.awayMi = x.conf.lat != null && addr ? milesBetween({ lat: x.conf.lat, lng: x.conf.lng }, addr) : null;
      if (x.awayMi != null && x.awayMi > (Number(s.awayMiles) || 0.5)) {
        alerts.push({ tone: "red", kind: "away", date: run.date, driver: run.driver, text: x.name + " (" + x.ref + ") was confirmed " + x.awayMi.toFixed(1) + " miles from the " + (x.kind === "col" ? "supplier" : "delivery address") + " — closed after leaving, not at the drop.", stopId: x.id, at: x.conf.at });
      }
      if (x.conf.lat == null) x.noGeo = true;
    });
    // legs: yard -> each confirmed stop in the order they were done -> yard
    let prevPos = dep && dep.lat != null ? { lat: dep.lat, lng: dep.lng } : yard;
    let prevAt = dep ? ms(dep.at) : null;
    const first = confirmed.length ? legMiles(prevPos, where(confirmed[0])) : { miles: 0, minutes: 0 };
    const estDepart = !dep && confirmed.length ? ms(confirmed[0].conf.at) - (first.minutes != null ? first.minutes / 60 : first.miles / (Number(s.avgMph) || 35)) * 3600000 : null;
    if (prevAt === null) prevAt = estDepart;
    confirmed.forEach((x) => {
      const pos = where(x);
      const mi = legMiles(prevPos, pos).miles;
      const at = ms(x.conf.at);
      const min = prevAt ? Math.max(0, (at - prevAt) / 60000) : 0;
      x.leg = { miles: mi, minutes: min, fuel: mi * cpm, time: (min / 60) * (Number(s.hourly) || 0) };
      x.leg.cost = x.leg.fuel + x.leg.time;
      prevPos = pos || prevPos; prevAt = at;
    });
    const lastPos = prevPos;
    const backLeg = confirmed.length ? legMiles(lastPos, yard) : { miles: 0, minutes: 0 };
    const backMi = backLeg.miles;
    const backMin = backLeg.minutes != null ? backLeg.minutes : (backMi / (Number(s.avgMph) || 35)) * 60;
    const back = { miles: backMi, minutes: backMin, fuel: backMi * cpm, time: (backMin / 60) * (Number(s.hourly) || 0) };
    back.cost = back.fuel + back.time;
    const departAt = dep ? ms(dep.at) : estDepart;
    const lastAt = confirmed.length ? ms(confirmed[confirmed.length - 1].conf.at) : null;
    const backAt = lastAt ? lastAt + backMin * 60000 : null;
    const miles = confirmed.reduce((t, x) => t + x.leg.miles, 0) + backMi;
    const hours = departAt && backAt ? (backAt - departAt) / 3600000 : 0;
    const fuel = miles * cpm;
    const time = hours * (Number(s.hourly) || 0);

    // what each job cost: its own leg + its share of the pick-ups it needed + a share of the drive back
    const jobs = confirmed.filter((x) => x.kind === "inv");
    const share = {};
    jobs.forEach((x) => (share[x.id] = x.leg.cost));
    const spread = (amount, ids) => { const l = ids.filter((id) => id in share); const to_ = l.length ? l : Object.keys(share); to_.forEach((id) => (share[id] += amount / Math.max(1, to_.length))); };
    confirmed.filter((x) => x.kind === "col").forEach((x) => spread(x.leg.cost, x.forJobs || []));
    spread(back.cost, Object.keys(share));
    jobs.forEach((x) => (x.jobCost = share[x.id]));

    // every stop should have been navigated to from the app before it was completed
    confirmed.forEach((x) => {
      const key = "nav:" + (x.kind === "col" ? "col:" : "") + x.id;
      const nav = (events || []).filter((e) => e.kind === "nav" && e.itemKey === key).sort((a, b) => ms(a.at) - ms(b.at))[0];
      x.navAt = nav ? nav.at : null;
      if (!nav && dep) alerts.push({ tone: "red", kind: "nonav", date: run.date, driver: run.driver, text: x.name + " (" + x.ref + ") was completed without starting the journey from the app's Navigate button." });
    });
    if (confirmed.length && !run.van) alerts.push({ tone: "amber", kind: "novan", date: run.date, driver: run.driver, text: "Run " + (run.runNo || "—") + " had no van set on the schedule — its miles can't be checked against a van's fuel log." });
    if (confirmed.length && !dep) alerts.push({ tone: "amber", kind: "nodepart", date: run.date, driver: run.driver, text: "Run " + (run.runNo || "—") + " — no set-off recorded; the start time is estimated from the first drop." });
    if (confirmed.length || dep) unconfirmed.filter((x) => x.done).forEach((x) => alerts.push({ tone: "amber", kind: "noconf", date: run.date, driver: run.driver, text: x.name + " (" + x.ref + ") was marked done without a driver confirmation — no time or location for it." }));
    return { ...run, legs, roadMiles: allRoad && legs.length > 0, price, dep, departAt, estimatedDepart: !dep, lastAt, backAt, back, confirmed, unconfirmed, miles, hours, fuel, time, cost: fuel + time, cpm };
  }).filter((r) => r.confirmed.length || r.dep) // runs done before the driver app was in use are left out
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : lc(a.driver).localeCompare(lc(b.driver)) || a.runNo.localeCompare(b.runNo)));
  return { runs, alerts };
}

// Odometer check per van: between two fuel-ups with a mileage reading, the miles on the clock vs
// what the runs account for, and vs what the fuel bought should have covered (filled to full each time).
export function vanChecks({ fuel, runs, s, from, to, prices = {} }) {
  const byVan = {};
  fuel.filter((f) => Number(f.mileage) > 0 && f.van).forEach((f) => (byVan[f.van] = byVan[f.van] || []).push(f));
  const tol = (Number(s.tolerancePct) || 5) / 100;
  const out = [], alerts = [];
  Object.entries(byVan).forEach(([van, list]) => {
    list.sort((a, b) => ms(a.at) - ms(b.at));
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      const bDay = String(b.at).slice(0, 10);
      if (bDay < from || bDay > to) continue;
      const clock = Number(b.mileage) - Number(a.mileage);
      const expected = runs.filter((r) => lc(r.van) === lc(van) && r.departAt && r.departAt >= ms(a.at) && r.departAt <= ms(b.at)).reduce((t, r) => t + r.miles, 0);
      const pr = priceOn(bDay, prices, s);
      const litres = Number(b.amount) > 0 ? Number(b.amount) / pr.perLitre : null;
      const fuelMiles = litres ? (litres / LITRES_PER_GALLON) * mpgFor(van, s) : null;
      const vRuns = expected > 0 ? (clock - expected) / expected : null;
      const vFuel = fuelMiles && clock > 0 ? (fuelMiles - clock) / clock : null;
      const row = { van, from: a.at, to: b.at, startMiles: Number(a.mileage), endMiles: Number(b.mileage), clock, expected, fuelSpent: Number(b.amount) || 0, litres, price: pr, fuelMiles, vRuns, vFuel };
      out.push(row);
      if (clock < 0) alerts.push({ tone: "red", kind: "odo", text: van + ": the mileage went down (" + a.mileage + " → " + b.mileage + ") between fill-ups — a reading was entered wrong." });
      else {
        if (vRuns !== null && Math.abs(vRuns) > tol) alerts.push({ tone: "red", kind: "miles", text: van + ": " + Math.round(clock) + " miles on the clock " + shortDate(a.at) + " → " + shortDate(b.at) + " but the logged runs only account for " + Math.round(expected) + " (" + pct(vRuns) + ")." });
        if (vFuel !== null && Math.abs(vFuel) > tol) alerts.push({ tone: vFuel > 0 ? "amber" : "red", kind: "fuel", text: van + ": " + money(b.amount) + " of fuel on " + shortDate(b.at) + " (≈" + Math.round(litres) + " L at " + (pr.perLitre * 100).toFixed(1) + "p" + (pr.published ? " supermarket price" : " — no published price, set rate used") + ") should cover about " + Math.round(fuelMiles) + " miles at " + mpgFor(van, s) + "mpg, but the clock shows " + Math.round(clock) + " since the last fill-up (" + pct(vFuel) + ")." });
      }
    }
  });
  return { rows: out.sort((x, y) => ms(y.to) - ms(x.to)), alerts };
}
const pct = (v) => (v > 0 ? "+" : "") + Math.round(v * 100) + "%";
const shortDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const money = (n) => "£" + (Number(n) || 0).toFixed(2);
