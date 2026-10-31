// Deck Kingdom Ops - ga-stats edge function
// Reads Google Analytics (GA4) for the Home screen: live visitors plus the
// headline numbers. Signs in to Google with a service account (no user login).
// Secrets (Supabase -> Edge Functions -> Secrets):
//   GA_PROPERTY_ID       the GA4 property number, e.g. 312345678
//   GA_SERVICE_ACCOUNT   the whole JSON key file of the service account
// Deploy: Edge Functions -> Deploy a new function -> Via editor -> name  ga-stats  -> paste -> Deploy.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---- Google auth: service-account JWT -> access token ----
const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b as ArrayBuffer);
  let s = ""; bytes.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export async function signJwt(sa: { client_email: string; private_key: string }, now = Math.floor(Date.now() / 1000)) {
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + claim));
  return head + "." + claim + "." + b64url(sig);
}
let token: { value: string; until: number } | null = null;
async function accessToken(sa: any, fetcher = fetch) {
  if (token && token.until > Date.now() + 60_000) return token.value;
  const r = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + (await signJwt(sa)),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Google sign-in failed: " + (j.error_description || j.error || r.status));
  token = { value: j.access_token, until: Date.now() + (j.expires_in || 3600) * 1000 };
  return token.value;
}

// ---- GA4 Data API ----
const num = (v: any) => Number(v || 0);
const rows = (rep: any) => (rep && rep.rows) || [];
const dims = (r: any) => (r.dimensionValues || []).map((d: any) => d.value);
const mets = (r: any) => (r.metricValues || []).map((m: any) => num(m.value));

export async function gaReports(prop: string, tok: string, fetcher = fetch) {
  const base = "https://analyticsdata.googleapis.com/v1beta/properties/" + prop;
  const call = async (path: string, body: unknown) => {
    const r = await fetcher(base + path, { method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || "Google Analytics error " + r.status);
    return j;
  };
  const rt = (body: any) => call(":runRealtimeReport", body);
  const last7 = { startDate: "6daysAgo", endDate: "today" };
  const SUM = ["activeUsers", "sessions", "screenPageViews", "engagementRate", "ecommercePurchases", "purchaseRevenue"];
  const FUNNEL = ["view_item", "add_to_cart", "begin_checkout", "purchase"];

  const [liveTotal, liveMin, livePages, liveDev, b1, b2] = await Promise.all([
    rt({ metrics: [{ name: "activeUsers" }] }),
    rt({ dimensions: [{ name: "minutesAgo" }], metrics: [{ name: "activeUsers" }], limit: 30 }),
    rt({ dimensions: [{ name: "unifiedScreenName" }], metrics: [{ name: "activeUsers" }], limit: 6 }),
    rt({ dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "activeUsers" }] }),
    call(":batchRunReports", { requests: [
      { dateRanges: [{ startDate: "today", endDate: "today", name: "today" }, { startDate: "yesterday", endDate: "yesterday", name: "yesterday" },
                     { ...last7, name: "last7" }, { startDate: "13daysAgo", endDate: "7daysAgo", name: "prev7" }],
        metrics: SUM.map((name) => ({ name })) },
      { dateRanges: [{ startDate: "27daysAgo", endDate: "today" }], dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "sessions" }],
        orderBys: [{ dimension: { dimensionName: "date" } }], limit: 40 },
      { dateRanges: [last7], dimensions: [{ name: "pagePath" }, { name: "pageTitle" }], metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 8 },
      { dateRanges: [last7], dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 8 },
      { dateRanges: [last7], dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }],
        dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: FUNNEL } } } },
    ] }),
    call(":batchRunReports", { requests: [
      { dateRanges: [last7], dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "sessions" }] },
      { dateRanges: [last7], dimensions: [{ name: "city" }], metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }], limit: 8 },
    ] }),
  ]);

  const byMinute = Array(30).fill(0);
  rows(liveMin).forEach((r: any) => { const m = num(dims(r)[0]); if (m >= 0 && m < 30) byMinute[29 - m] = mets(r)[0]; });

  const [sumRep, dailyRep, pagesRep, chanRep, funnelRep] = b1.reports || [];
  const [devRep, cityRep] = b2.reports || [];
  const summary: Record<string, Record<string, number>> = {};
  rows(sumRep).forEach((r: any) => {
    const d = dims(r), m = mets(r);
    const range = d.find((x: string) => ["today", "yesterday", "last7", "prev7"].includes(x)) || d[0];
    summary[range] = Object.fromEntries(SUM.map((k, i) => [k, m[i]]));
  });
  const funnel: Record<string, number> = Object.fromEntries(FUNNEL.map((k) => [k, 0]));
  rows(funnelRep).forEach((r: any) => { funnel[dims(r)[0]] = mets(r)[0]; });

  return {
    live: {
      active: rows(liveTotal).length ? mets(rows(liveTotal)[0])[0] : 0,
      byMinute,
      pages: rows(livePages).map((r: any) => ({ name: dims(r)[0], users: mets(r)[0] })),
      devices: rows(liveDev).map((r: any) => ({ name: dims(r)[0], users: mets(r)[0] })),
    },
    summary,
    daily: rows(dailyRep).map((r: any) => ({ date: dims(r)[0], users: mets(r)[0], sessions: mets(r)[1] })),
    pages: rows(pagesRep).map((r: any) => ({ path: dims(r)[0], title: dims(r)[1], views: mets(r)[0] })),
    channels: rows(chanRep).map((r: any) => ({ name: dims(r)[0], sessions: mets(r)[0] })),
    funnel,
    devices: rows(devRep).map((r: any) => ({ name: dims(r)[0], sessions: mets(r)[0] })),
    cities: rows(cityRep).map((r: any) => ({ name: dims(r)[0], users: mets(r)[0] })).filter((c: any) => c.name && c.name !== "(not set)"),
    updated: new Date().toISOString(),
  };
}

let cache: { at: number; data: unknown } | null = null;

export async function handle(req: Request, deps: { db: any; env: (k: string) => string | undefined; fetcher?: typeof fetch }) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const tokenHdr = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await deps.db.auth.getUser(tokenHdr);
  if (ue || !u?.user) return reply(401, { error: "Please sign in to ops again." });

  const prop = (deps.env("GA_PROPERTY_ID") || "").replace(/\D/g, "");
  let sa: any = null;
  try { sa = JSON.parse(deps.env("GA_SERVICE_ACCOUNT") || "null"); } catch { /* bad json */ }
  if (!prop || !sa || !sa.client_email || !sa.private_key)
    return reply(200, { setup: true, error: "Google Analytics isn't connected yet (GA_PROPERTY_ID / GA_SERVICE_ACCOUNT secrets)." });

  if (cache && Date.now() - cache.at < 55_000) return reply(200, cache.data);
  try {
    const tok = await accessToken(sa, deps.fetcher);
    const data = await gaReports(prop, tok, deps.fetcher);
    cache = { at: Date.now(), data };
    return reply(200, data);
  } catch (e) {
    const m = String((e as Error)?.message || e);
    const hint = /permission|403|does not have/i.test(m)
      ? "The service account can't read this GA property yet — add " + sa.client_email + " as a Viewer in GA Admin → Property access management."
      : /has not been used|disabled|SERVICE_DISABLED/i.test(m) ? "Turn on the Google Analytics Data API in the Google Cloud project." : m;
    return reply(502, { error: hint });
  }
}

if (import.meta.main) {
  const db = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", { auth: { persistSession: false } });
  Deno.serve((req) => handle(req, { db, env: (k) => Deno.env.get(k) }));
}
