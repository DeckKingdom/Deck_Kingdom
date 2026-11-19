// Screenshot → order details, via the read-order edge function (Claude).
// matchProduct pairs each extracted item with the product book the same way
// the phone's line picker searches it.
import { getSupabase } from "./supabaseClient.js";

export async function readOrderScreenshot(file) {
  const base64 = await new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] || "");
    r.onerror = () => no(r.error);
    r.readAsDataURL(file);
  });
  const sb = await getSupabase();
  const { data, error } = await sb.functions.invoke("read-order", { body: { image: base64, mime: file.type || "image/png" } });
  if (error) {
    let msg = error.message || "the read-order function isn't deployed yet";
    try { const ctx = await error.context.json(); if (ctx && ctx.error) msg = ctx.error; } catch { /* keep msg */ }
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  if (!data || !data.order) throw new Error("No order details came back.");
  return data.order;
}

// best product-book match for a free-text item; null when nothing fits
export function matchProduct(prods, text, colour) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  const words = t.split(/\s+/).filter((w) => w.length > 1);
  const col = String(colour || "").trim().toLowerCase();
  let best = null, bestScore = 0;
  prods.forEach((p) => {
    if (p.active === false || !p.sku) return;
    if (p.grade && !(Number(p.stock) > 0)) return;
    const hay = [p.name, p.sku, p.family, p.colour].join(" ").toLowerCase();
    const hit = words.filter((w) => hay.includes(w)).length;
    if (!hit) return;
    let score = hit / Math.max(1, words.length);
    if (score < 0.6) return; // more than a passing resemblance
    if (col && String(p.colour || "").toLowerCase() === col) score += 0.5;
    else if (col && p.colour && String(p.colour).toLowerCase() !== col) score -= 0.3;
    if (String(p.name || "").toLowerCase().startsWith(t.slice(0, 8))) score += 0.1;
    if (score > bestScore) { bestScore = score; best = p; }
  });
  return best;
}
