// read-order: reads a screenshot of a message thread / written order with
// Claude and returns the order details as JSON. Needs the ANTHROPIC_KEY
// secret (console.anthropic.com). Deployed like route-miles.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const PROMPT = `You are reading a screenshot for a UK decking company's office. It is usually a WhatsApp/text/email thread or a written order. Extract the order details.

Return ONLY a JSON object, no other text, in exactly this shape:
{
  "customer": { "name": "", "mobile": "", "email": "" },
  "address": { "line": "", "town": "", "postcode": "" },
  "items": [ { "text": "", "qty": 1, "colour": "" } ],
  "deliveryDate": null,
  "notes": ""
}

Rules:
- items: one entry per product asked for; text is the product as written (e.g. "4.8m teak decking boards"); qty is a number; colour only if stated.
- deliveryDate: "YYYY-MM-DD" only if a specific date is clear, else null.
- notes: anything else the office should know — access instructions, payment mentions, vague dates in words, open questions.
- Leave fields as empty strings when the screenshot doesn't say. Never invent details.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const key = Deno.env.get("ANTHROPIC_KEY");
    if (!key) return json({ error: "The ANTHROPIC_KEY secret isn't set in Supabase yet." }, 500);
    const { image, mime } = await req.json();
    if (!image) return json({ error: "No image sent." }, 400);
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime || "image/png", data: image } },
            { type: "text", text: PROMPT },
          ],
        }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return json({ error: (j.error && j.error.message) || "Claude call failed." }, 502);
    const text = (j.content || []).map((c: { text?: string }) => c.text || "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return json({ error: "Claude didn't return readable order details." }, 502);
    let order;
    try { order = JSON.parse(m[0]); } catch { return json({ error: "Couldn't parse the order details." }, 502); }
    return json({ order, usage: j.usage });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
