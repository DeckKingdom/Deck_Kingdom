// Screenshot → order details, via the read-order edge function (Claude).
// matchProduct pairs each extracted item with the product book the same way
// the phone's line picker searches it.
import { getSupabase } from "./supabaseClient.js";
import { blankInvoice, blankQuote, blankLine, blankSample, blankSampleItem, nextNumber } from "../lib/crmCore.js";

export async function readOrderScreenshot(file, note = "") {
  const base64 = await new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] || "");
    r.onerror = () => no(r.error);
    r.readAsDataURL(file);
  });
  const sb = await getSupabase();
  const { data, error } = await sb.functions.invoke("read-order", { body: { image: base64, mime: file.type || "image/png", note: String(note || "").trim() } });
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


// account match: mobile digits first, exact name second
export function matchCustomer(crm, order) {
  const dg = (v) => String(v || "").replace(/\D/g, "");
  const mob = dg(order && order.customer && order.customer.mobile);
  let c = mob.length >= 10 ? (crm.customers || []).find((x) => dg(x.mobile) === mob || dg(x.landline) === mob) : null;
  if (!c) {
    const nm = String((order && order.customer && order.customer.name) || "").trim().toLowerCase();
    if (nm) c = (crm.customers || []).find((x) => String(x.name || "").trim().toLowerCase() === nm);
  }
  return c || null;
}

// a sample request from an extracted order — items named from the book where they match
export function sampleFromOrder(crm, me, custId, order) {
  const n = blankSample(custId);
  n.sampleNo = nextNumber(crm.samples, "sampleNo", crm.numbering.sample);
  n.raisedBy = me || "";
  const unmatched = [];
  n.items = (order.items || []).map((it) => {
    const mp = matchProduct(crm.masterProducts || [], it.text, it.colour);
    const si = blankSampleItem();
    si.description = mp ? mp.name : (it.text || "");
    si.colour = (mp && mp.colour) || it.colour || "";
    si.qty = Number(it.qty) || 1;
    if (!mp && it.text) unmatched.push(it.text);
    return si;
  });
  if (!n.items.length) n.items = [blankSampleItem()];
  n.notes = ("Raised from a screenshot — check the items and address."
    + (unmatched.length ? " Couldn't match: " + unmatched.join("; ") + "." : "")
    + (String(order.notes || "").trim() ? " From the message: " + String(order.notes).trim() : "")).trim();
  return { n, unmatched };
}

// a draft invoice or quote from an extracted order, lines matched to the book
export function draftFromOrder(crm, me, custId, order, kind) {
  const siteOf = (crm.sites || []).find((s2) => s2.customerId === custId);
  const quote = kind === "quote";
  const n = quote ? blankQuote(custId, siteOf ? siteOf.id : "") : blankInvoice(custId, siteOf ? siteOf.id : "");
  if (quote) n.quoteNo = nextNumber(crm.quotes, "quoteNo", crm.numbering.quote);
  else n.invNo = nextNumber(crm.invoices, "invNo", crm.numbering.invoice);
  n.raisedBy = me || "";
  const cust = (crm.customers || []).find((x) => x.id === custId);
  if (cust && cust.discountPct !== "" && cust.discountPct !== null && cust.discountPct !== undefined) n.discountPct = cust.discountPct;
  const unmatched = [];
  (order.items || []).forEach((it) => {
    const mp = matchProduct(crm.masterProducts || [], it.text, it.colour);
    const l = blankLine();
    if (mp) {
      l.code = mp.sku;
      l.description = mp.name;
      l.colour = mp.colour || it.colour || "";
      l.price = mp.priceIncVat !== "" && mp.priceIncVat !== null && mp.priceIncVat !== undefined ? Number(mp.priceIncVat) : "";
    } else {
      l.description = it.text || "";
      l.colour = it.colour || "";
      if (it.text) unmatched.push(it.text);
    }
    l.qty = Number(it.qty) || 1;
    n.lines.push(l);
  });
  if (!n.lines.length) n.lines = [blankLine()];
  if (!quote && order.deliveryDate && /^\d{4}-\d{2}-\d{2}$/.test(String(order.deliveryDate))) n.deliveryDate = order.deliveryDate;
  const note = ("Raised from a screenshot — check every line, price and address."
    + (unmatched.length ? " Couldn't match: " + unmatched.join("; ") + "." : "")
    + (String(order.notes || "").trim() ? " From the message: " + String(order.notes).trim() : "")).trim();
  if (quote) n.internalNotes = note; else n.jobNotes = note;
  return { n, unmatched };
}
