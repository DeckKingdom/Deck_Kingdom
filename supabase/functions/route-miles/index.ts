// Deck Kingdom Ops - route-miles edge function
// Real road miles and drive times between stops, from Google Maps (Routes API), for driver tracking.
// The key never reaches the browser.
// Secrets (Supabase -> Edge Functions -> Secrets):
//   GOOGLE_MAPS_KEY   a Google Maps Platform API key with the Routes API turned on
// Deploy: Edge Functions -> Deploy a new function -> Via editor -> name  route-miles  -> paste -> Deploy.
// Body: { legs: [{ from: { lat, lng }, to: { lat, lng } }, ...] }  ->  { legs: [{ miles, minutes } | null, ...] }
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const pt = (p: any) => ({ location: { latLng: { latitude: Number(p.lat), longitude: Number(p.lng) } } });

async function leg(key: string, from: any, to: any, fetcher = fetch) {
  const r = await fetcher("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters,routes.duration" },
    body: JSON.stringify({ origin: pt(from), destination: pt(to), travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE", units: "IMPERIAL" }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || "Google Routes " + r.status);
  const x = j.routes && j.routes[0];
  if (!x) return null;
  return { miles: (Number(x.distanceMeters) || 0) / 1609.344, minutes: (parseFloat(String(x.duration || "0").replace("s", "")) || 0) / 60 };
}

export async function handle(req: Request, deps: { db: any; env: (k: string) => string | undefined; fetcher?: typeof fetch }) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const tokenHdr = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await deps.db.auth.getUser(tokenHdr);
  if (ue || !u?.user) return reply(401, { error: "Please sign in to ops again." });
  const key = deps.env("GOOGLE_MAPS_KEY");
  if (!key) return reply(200, { setup: true, error: "Google Maps isn't connected yet (GOOGLE_MAPS_KEY secret)." });
  const body = await req.json().catch(() => ({}));
  const legs = Array.isArray(body.legs) ? body.legs.slice(0, 60) : [];
  try {
    const out = await Promise.all(legs.map((l: any) => (l && l.from && l.to ? leg(key, l.from, l.to, deps.fetcher).catch(() => null) : null)));
    return reply(200, { legs: out });
  } catch (e) {
    return reply(502, { error: String((e as Error)?.message || e) });
  }
}

if (import.meta.main) {
  const db = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", { auth: { persistSession: false } });
  Deno.serve((req) => handle(req, { db, env: (k) => Deno.env.get(k) }));
}
