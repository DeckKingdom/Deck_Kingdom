// read-order: reads a screenshot of a message thread / written order with
// Claude and returns the order details as JSON. Needs the ANTHROPIC_KEY
// secret (console.anthropic.com). Deployed like route-miles.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const GLOSSARY = `Deck Kingdom terms (use these to name items the way the catalogue does):
- "boards" / "decking" on their own mean composite decking boards (Decking Board Embossed Woodgrain unless another range is named: Enhanced, M Premium, Bullnose).
- "fascia" = Decking Fascia Premium; "trim" / "trims" = Decking Trim; "step edge" = Decking Step Edge Board.
- "clips" = Decking Clips Plastic & Screws; "metal clips" = Decking Clips Metal 3mm & Screws; "starter clips" = Decking Starter Clips & Screws.
- "fence boards" / "fencing" = Fence Board; "posts" in a fencing context = Fence Post Composite; "U beam" / "H beam" / "top beam" / "bottom beam" = the Aluminium beams; "post caps" = Fence Post Composite Cap.
- "balustrade" items: Balustrade Post Kit, Handrail, Base Rail, Finishing Kit.
- "grass" = Artificial Grass; "cladding" = Slatted Cladding.
- Lengths matter: boards and trims come in 2.4m / 2.9m / 3.6m / 4m / 4.8m. Keep the length with the item when stated.`;

const PROMPT = `You are reading an order request for a UK decking company's office. It may be a screenshot (WhatsApp/text/email thread or written order), a typed message from the office, or both. Extract the order details.

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
- Leave fields as empty strings when the message doesn't say. Never invent details.
- If the request refers to what the customer had before ("one more board", "same again", "another pack of the clips he ordered") and you have NOT been given their order history, still list the item as written and add "needsHistory": true at the top level of the JSON.

` + GLOSSARY;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const key = (Deno.env.get("ANTHROPIC_KEY") || "").replace(/\s+/g, ""); // stray line breaks from a paste are harmless
    if (!key) return json({ error: "The ANTHROPIC_KEY secret isn't set in Supabase yet." }, 500);
    const { image, mime, note, history } = await req.json();
    const extra = String(note || "").trim().slice(0, 600);
    if (!image && !extra) return json({ error: "Nothing to read — send a screenshot, a message, or both." }, 400);
    let historyTxt = "";
    if (history) {
      try { historyTxt = JSON.stringify(history).slice(0, 4000); } catch (_e) { historyTxt = ""; }
    }
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            ...(image ? [{ type: "image", source: { type: "base64", media_type: mime || "image/png", data: image } }] : []),
            { type: "text", text: PROMPT
              + (extra ? "\n\nMessage from the office — " + (image ? "it may narrow or correct what to extract from the screenshot" : "this IS the request; extract the order from it") + ":\n" + extra : "")
              + (historyTxt ? "\n\nThis customer's recent orders (most recent first). When the request leans on what they had — \"one more board\", \"same again\" — resolve each item to the EXACT item text and colour from these orders, with the qty asked for now:\n" + historyTxt : "") },
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
