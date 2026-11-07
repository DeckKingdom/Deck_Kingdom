// Fuel prices (fuel-price edge function -> fuel_price_days) and road miles (route-miles -> Google).
import { storageMode } from "./storage.js";
import { getSupabase } from "./supabaseClient.js";

// { "2026-11-07": 142.9, ... } pence per litre, supermarket diesel
export async function fuelPrices(from, to) {
  if (storageMode !== "supabase") { try { return JSON.parse(localStorage.getItem("dk-fuel-prices-local") || "{}"); } catch (e) { return {}; } }
  const sb = await getSupabase();
  const { data, error } = await sb.from("fuel_price_days").select("day, diesel_ppl").gte("day", from).lte("day", to);
  if (error) return {};
  const m = {};
  (data || []).forEach((r) => { if (Number(r.diesel_ppl) > 0) m[r.day] = Number(r.diesel_ppl); });
  return m;
}
// ask the function to fetch today's price (it only goes to Fuel Finder if today's isn't saved yet)
export async function refreshFuelPrice() {
  if (storageMode !== "supabase") return null;
  try {
    const sb = await getSupabase();
    const { data } = await sb.functions.invoke("fuel-price", { body: {} });
    return data || null;
  } catch (e) { return null; }
}

// road miles between points, cached in this browser: legs [{ from, to }] -> { key: { miles, minutes } }
const RKEY = "dk-road-legs";
export const legKey = (a, b) => [a.lat, a.lng, b.lat, b.lng].map((n) => Number(n).toFixed(3)).join(",");
export async function roadLegs(legs) {
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(RKEY) || "{}"); } catch (e) { /* */ }
  const out = {}, todo = [];
  legs.forEach((l) => { const k = legKey(l.from, l.to); if (cache[k]) out[k] = cache[k]; else if (!todo.some((t) => t.k === k)) todo.push({ k, ...l }); });
  if (todo.length && storageMode === "supabase") {
    try {
      const sb = await getSupabase();
      for (let i = 0; i < todo.length; i += 50) {
        const chunk = todo.slice(i, i + 50);
        const { data, error } = await sb.functions.invoke("route-miles", { body: { legs: chunk.map((t) => ({ from: t.from, to: t.to })) } });
        if (error || !data || data.setup || !Array.isArray(data.legs)) break;
        data.legs.forEach((r, n) => { if (r && r.miles != null) { out[chunk[n].k] = r; cache[chunk[n].k] = r; } });
      }
      const keys = Object.keys(cache);
      if (keys.length > 3000) keys.slice(0, keys.length - 3000).forEach((k) => delete cache[k]);
      localStorage.setItem(RKEY, JSON.stringify(cache));
    } catch (e) { /* not set up: straight-line estimate is used */ }
  }
  return out;
}
