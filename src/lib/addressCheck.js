// Address fail-safe: does the street actually sit in the postcode it was given?
// postcodes.io (free, no key) says whether the postcode exists and where it is; OpenStreetMap
// (Nominatim, free, no key) then looks for the street name within a couple of miles of that spot.
// Any network trouble lets the save through - this is a warning, never a blocker.

const ROADY = /\b(road|rd|street|st|lane|ln|way|avenue|ave|close|cl|drive|dr|court|ct|crescent|cres|place|pl|grove|gardens|gdns|hill|park|terrace|view|row|walk|square|sq|mews|rise|green|parade|estate|meadows?|fields?|vale|yard|wharf|boulevard|broadway|chase|croft|end|gate|heights|approach|bank|brow|common|hollow|wood|side)\b/i;
const NOT_STREET = /^(unit|flat|apartment|apt|suite|block|building|plot|floor|the old|c\/o)\b/i;

export const tidyPostcode = (p) => {
  const s = String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length > 3 ? s.slice(0, -3) + " " + s.slice(-3) : s;
};
export const outwardCode = (p) => tidyPostcode(p).split(" ")[0] || "";

// the part of an address line that names the street, without the house number
export const streetOf = (address) => {
  const parts = String(address || "").split(/\s*[,\n]\s*/).map((x) => x.trim()).filter(Boolean);
  const cands = parts.filter((x) => !NOT_STREET.test(x) || ROADY.test(x.replace(NOT_STREET, "")));
  // only a part that clearly names a road - a house name alone ("Rose Cottage") isn't checked
  const pick = cands.find((x) => ROADY.test(x.replace(/^[\s\d\-\/]+[a-z]?\b\s*/i, ""))) || "";
  return pick.replace(NOT_STREET, "").replace(/^[\s\d\-\/]+[a-z]?\b\s*/i, "").replace(/^(no\.?\s*)/i, "").trim();
};

const milesBetween = (a, b) => {
  const r = (x) => (x * Math.PI) / 180, R = 3958.8;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
const getJson = async (url) => {
  const r = await withTimeout(fetch(url, { headers: { Accept: "application/json" } }), 6000);
  if (r.status === 404) return { _404: true };
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
};

const CACHE_KEY = "dk-addr-check";
const cacheGet = (k) => { try { return (JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"))[k]; } catch (e) { return undefined; } };
const cachePut = (k, v) => {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    all[k] = v;
    const keys = Object.keys(all);
    if (keys.length > 300) keys.slice(0, keys.length - 300).forEach((x) => delete all[x]);
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch (e) { /* private window */ }
};

// -> { ok: true } or { ok: false, title, lines: [..] }. Unknown (offline etc) counts as ok.
export async function checkAddress({ address, town, postcode }) {
  const pc = tidyPostcode(postcode);
  const street = streetOf(address);
  if (!pc && !street) return { ok: true };
  if (!pc) return { ok: false, title: "No postcode", lines: ["This address has no postcode, so the driver's sat nav can't find it.", "Add the postcode before the job goes on a run."] };
  const key = [pc, street.toLowerCase(), String(town || "").toLowerCase()].join("|");
  const hit = cacheGet(key);
  if (hit) return hit;
  let res = { ok: true };
  try {
    const p = await getJson("https://api.postcodes.io/postcodes/" + encodeURIComponent(pc.replace(" ", "")));
    if (p._404 || !p.result) {
      res = { ok: false, title: "Postcode not recognised", lines: ["\"" + pc + "\" isn't a live Royal Mail postcode.", "Check it with the customer — one wrong letter can send the van to the wrong town."] };
    } else if (street) {
      const at = { lat: p.result.latitude, lng: p.result.longitude };
      const area = [p.result.parish && !/unparished/i.test(p.result.parish) ? p.result.parish : "", p.result.admin_district].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
      if (at.lat == null) return { ok: true };
      const d = 0.045; // ~3 miles box around the postcode
      const box = [at.lng - d * 1.6, at.lat + d, at.lng + d * 1.6, at.lat - d].map((n) => n.toFixed(5)).join(",");
      const near = await getJson("https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&limit=5&bounded=1&viewbox=" + box + "&q=" + encodeURIComponent(street));
      const found = Array.isArray(near) ? near.map((x) => ({ lat: Number(x.lat), lng: Number(x.lon) })) : [];
      const best = found.length ? Math.min(...found.map((x) => milesBetween(at, x))) : Infinity;
      if (best > 1.5) {
        // where is a street of that name, if anywhere?
        let where = "";
        try {
          const any = await getJson("https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&limit=1&addressdetails=1&q=" + encodeURIComponent(street + (town ? ", " + town : "")));
          if (Array.isArray(any) && any[0]) {
            const a = any[0].address || {};
            const place = a.town || a.city || a.village || a.suburb || a.county || "";
            const miles = Math.round(milesBetween(at, { lat: Number(any[0].lat), lng: Number(any[0].lon) }));
            if (place) where = "There is a \"" + street + "\" in " + place + (a.postcode ? " (" + a.postcode + ")" : "") + ", about " + miles + " miles away.";
          }
        } catch (e) { /* skip */ }
        res = { ok: false, title: "Street and postcode don't match", lines: [
          "\"" + street + "\" couldn't be found near " + pc + (area ? " (" + area + ")" : "") + ".",
          ...(where ? [where] : []),
          "Check the street and postcode with the customer before this goes on a run.",
        ] };
      }
    }
  } catch (e) {
    return { ok: true, unknown: true }; // offline or the lookup is down: don't stop the office working
  }
  cachePut(key, res);
  return res;
}

// sat-nav links for the drivers
export const isApple = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && "ontouchend" in document;
export const googleNavHref = (dest) => "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=" + encodeURIComponent(dest);
export const appleNavHref = (dest) => "https://maps.apple.com/?dirflg=d&daddr=" + encodeURIComponent(dest);
