// Postcode -> lat/lng via postcodes.io (free, no key), cached in this browser; plus distance helpers.
export const tidyPc = (p) => {
  const s = String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length > 3 ? s.slice(0, -3) + " " + s.slice(-3) : s;
};
const KEY = "dk-pc-geo";
const readCache = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
const writeCache = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* full / private */ } };

// -> { "OL6 6UG": { lat, lng } | null }
export async function geocodePostcodes(list) {
  const want = [...new Set(list.map(tidyPc).filter((p) => p.length >= 5))];
  const cache = readCache();
  const out = {};
  const missing = want.filter((p) => { if (p in cache) { out[p] = cache[p]; return false; } return true; });
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    try {
      const r = await fetch("https://api.postcodes.io/postcodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postcodes: chunk }) });
      const j = await r.json();
      (j.result || []).forEach((x) => {
        const p = tidyPc(x.query);
        const v = x.result && x.result.latitude != null ? { lat: x.result.latitude, lng: x.result.longitude } : null;
        out[p] = v; cache[p] = v;
      });
    } catch (e) { /* offline: leave them out */ }
  }
  writeCache(cache);
  return out;
}

export const milesBetween = (a, b) => {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const r = (x) => (x * Math.PI) / 180, R = 3958.8;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
