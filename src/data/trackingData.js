// Loads everything driver tracking needs and works it out (used by the screen and the pop-up alerts).
import { loadDropsRange, loadEventsRange, loadFuelRange } from "./drops.js";
import { fuelPrices, roadLegs } from "./fleetApi.js";
import { geocodePostcodes } from "../lib/geo.js";
import { fleetSettings, trackingPostcodes, buildRuns, vanChecks } from "../lib/tracking.js";

const dayBefore = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };

export async function loadTracking(crm, from, to) {
  const s = fleetSettings(crm);
  const fuelFrom = dayBefore(from, 45);
  const [confs, events, fuel, prices] = await Promise.all([
    loadDropsRange(from, to),
    loadEventsRange(from, to).catch(() => []),
    loadFuelRange(fuelFrom + "T00:00:00Z", to + "T23:59:59Z").catch(() => []),
    fuelPrices(dayBefore(from, 52), to).catch(() => ({})),
  ]);
  const geo = await geocodePostcodes(trackingPostcodes(crm, from, to, s));
  // first pass finds the legs; Google gives the road miles for them (cached), second pass uses them
  const pass1 = buildRuns({ crm, confs, events, geo, s, from, to, prices });
  const roads = await roadLegs(pass1.runs.flatMap((r) => r.legs));
  return { confs, events, fuel, geo, prices, roads };
}

export function workOut(crm, data, from, to, driver) {
  const s = fleetSettings(crm);
  const base = { crm, confs: data.confs, events: data.events, geo: data.geo, s, from, to, roads: data.roads, prices: data.prices };
  const { runs, alerts } = buildRuns({ ...base, driver });
  const all = driver ? buildRuns(base).runs : runs;
  const vc = vanChecks({ fuel: data.fuel, runs: all, s, from, to, prices: data.prices });
  return { runs, alerts: [...alerts, ...vc.alerts], vans: vc.rows };
}
