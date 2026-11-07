// Deck Kingdom Ops - fuel-price edge function
// Once a day: reads the UK government Fuel Finder prices, works out the average supermarket
// (Asda, Tesco, Sainsbury's, Morrisons) diesel and petrol price, and saves it in fuel_price_days.
// Driver tracking uses that day's price against each fuel receipt.
// Secrets (Supabase -> Edge Functions -> Secrets):
//   FUEL_FINDER_CLIENT_ID      from developer.fuel-finder.service.gov.uk (free, GOV.UK One Login)
//   FUEL_FINDER_CLIENT_SECRET
// Deploy: Edge Functions -> Deploy a new function -> Via editor -> name  fuel-price  -> paste -> Deploy.
// Check it: call with { "debug": true } to see a sample of what Fuel Finder sends back.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const BASE = "https://www.fuel-finder.service.gov.uk";
const SUPERMARKET = /asda|tesco|sainsbury|morrison/i;

async function token(id: string, secret: string, fetcher = fetch) {
  // client credentials; sent both as JSON and form fields to suit the token endpoint
  let r = await fetcher(BASE + "/api/v1/oauth/generate_access_token", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: id, client_secret: secret, grant_type: "client_credentials" }),
  });
  if (!r.ok) {
    r = await fetcher(BASE + "/api/v1/oauth/generate_access_token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials&client_id=" + encodeURIComponent(id) + "&client_secret=" + encodeURIComponent(secret),
    });
  }
  const j = await r.json().catch(() => ({}));
  const t = j.access_token || (j.data && j.data.access_token);
  if (!t) throw new Error("Fuel Finder sign-in failed (" + r.status + "): " + JSON.stringify(j).slice(0, 200));
  return t as string;
}

// every page of a list endpoint
async function all(path: string, tok: string, fetcher = fetch) {
  const out: any[] = [];
  let url: string | null = BASE + path;
  for (let n = 0; url && n < 400; n++) {
    const r = await fetcher(url, { headers: { Authorization: "Bearer " + tok, Accept: "application/json" } });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("Fuel Finder " + path + " " + r.status + ": " + JSON.stringify(j).slice(0, 200));
    const items = Array.isArray(j) ? j : j.items || j.data || j.results || (j.data && j.data.items) || [];
    out.push(...items);
    const next = j.next_page || j.next || (j.links && j.links.next) || (j.meta && j.meta.next);
    url = next ? (String(next).startsWith("http") ? String(next) : BASE + (String(next).startsWith("/") ? "" : "/") + next) : null;
    if (!items.length) break;
  }
  return out;
}

const idOf = (x: any) => String(x.node_id ?? x.pfs_id ?? x.site_id ?? x.id ?? "");
const nameOf = (x: any) => [x.brand_name, x.brand, x.trading_name, x.mft_organisation_name, x.operator, x.organisation_name].filter(Boolean).join(" ");
// [{ type, price }] from whichever shape the prices come in
const pricesOf = (x: any): { type: string; price: number }[] => {
  const raw = x.fuel_prices || x.prices || x.fuels || [];
  if (Array.isArray(raw)) return raw.map((p: any) => ({ type: String(p.fuel_type ?? p.type ?? p.fuel ?? p.name ?? ""), price: Number(p.price ?? p.price_pence ?? p.value) }));
  return Object.entries(raw).map(([k, v]: any) => ({ type: k, price: Number(typeof v === "object" ? v.price : v) }));
};
const ppl = (v: number) => (v > 0 && v < 10 ? v * 100 : v); // £/L -> pence
const isDiesel = (t: string) => /b7|diesel/i.test(t) && !/premium|super|sdv|b10/i.test(t);
const isPetrol = (t: string) => /e10|unleaded|petrol/i.test(t) && !/premium|super|e5/i.test(t);
const median = (l: number[]) => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export async function handle(req: Request, deps: { db: any; env: (k: string) => string | undefined; fetcher?: typeof fetch }) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const tokenHdr = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await deps.db.auth.getUser(tokenHdr);
  if (ue || !u?.user) return reply(401, { error: "Please sign in to ops again." });
  const body = await req.json().catch(() => ({}));
  const id = deps.env("FUEL_FINDER_CLIENT_ID"), secret = deps.env("FUEL_FINDER_CLIENT_SECRET");
  if (!id || !secret) return reply(200, { setup: true, error: "Fuel Finder isn't connected yet (FUEL_FINDER_CLIENT_ID / FUEL_FINDER_CLIENT_SECRET secrets)." });

  const day = new Date().toISOString().slice(0, 10);
  if (!body.debug && !body.force) {
    const { data: have } = await deps.db.from("fuel_price_days").select("*").eq("day", day).maybeSingle();
    if (have && Date.now() - new Date(have.fetched_at).getTime() < 6 * 3600_000) return reply(200, have);
  }
  try {
    const tok = await token(id, secret, deps.fetcher);
    const prices = await all("/api/v1/pfs/fuel-prices", tok, deps.fetcher);
    // brand names may only be on the station list
    let names: Record<string, string> = {};
    if (!prices.some((p) => SUPERMARKET.test(nameOf(p)))) {
      const pfs = await all("/api/v1/pfs", tok, deps.fetcher);
      pfs.forEach((s) => (names[idOf(s)] = nameOf(s)));
    }
    const diesel: number[] = [], petrol: number[] = [];
    let stations = 0;
    prices.forEach((p) => {
      const nm = nameOf(p) || names[idOf(p)] || "";
      if (!SUPERMARKET.test(nm)) return;
      stations++;
      pricesOf(p).forEach(({ type, price }) => {
        const v = ppl(price);
        if (!(v > 80 && v < 300)) return; // ignore junk
        if (isDiesel(type)) diesel.push(v); else if (isPetrol(type)) petrol.push(v);
      });
    });
    if (body.debug) return reply(200, { sample: prices.slice(0, 2), count: prices.length, supermarketStations: stations, diesel: median(diesel), petrol: median(petrol) });
    if (!diesel.length) throw new Error("No supermarket diesel prices found in " + prices.length + " Fuel Finder records — call with debug to check the format.");
    const row = { day, diesel_ppl: Math.round(median(diesel)! * 10) / 10, petrol_ppl: petrol.length ? Math.round(median(petrol)! * 10) / 10 : null, stations, source: "Fuel Finder · supermarket median", fetched_at: new Date().toISOString() };
    const { error } = await deps.db.from("fuel_price_days").upsert(row);
    if (error) throw new Error(error.message);
    return reply(200, row);
  } catch (e) {
    return reply(502, { error: String((e as Error)?.message || e) });
  }
}

if (import.meta.main) {
  const db = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", { auth: { persistSession: false } });
  Deno.serve((req) => handle(req, { db, env: (k) => Deno.env.get(k) }));
}
