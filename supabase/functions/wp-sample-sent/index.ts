// wp-sample-sent: when ops marks a website sample request as dispatched, this
// tells the WordPress Sample Requests page to flip the same request to "Sent",
// so the two never drift. Needs the WP_SR_KEY secret — the same string as the
// DK_SR_OPS_KEY constant in the dk-sample-requests snippet on the website.
// Deployed like read-order.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const key = (Deno.env.get("WP_SR_KEY") || "").replace(/\s+/g, "");
    if (!key) return json({ error: "WP_SR_KEY secret isn't set in Supabase yet." }, 500);
    const { ids, sent } = await req.json();
    const clean = (Array.isArray(ids) ? ids : []).map((x: unknown) => Number(x)).filter((n: number) => Number.isInteger(n) && n > 0).slice(0, 200);
    if (!clean.length) return json({ error: "No request ids sent." }, 400);
    const r = await fetch("https://deckkingdom.co.uk/wp-json/dk/v1/sample-sent", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dk-key": key },
      body: JSON.stringify({ ids: clean, sent: sent === false ? false : true }),
    });
    const text = await r.text();
    let body: unknown = null;
    try { body = JSON.parse(text); } catch (_e) { body = { raw: text.slice(0, 300) }; }
    if (!r.ok) return json({ error: "The website said no (" + r.status + ").", detail: body }, 502);
    return json({ ok: true, wp: body });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
