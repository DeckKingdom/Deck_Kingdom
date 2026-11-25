// Screenshot → order details, via the read-order edge function (Claude).
// matchProduct pairs each extracted item with the product book the same way
// the phone's line picker searches it.
import { getSupabase } from "./supabaseClient.js";
import { blankInvoice, blankQuote, blankLine, blankSample, blankSampleItem, blankSite, nextNumber } from "../lib/crmCore.js";

// text-only or screenshot+text read, with optional customer history for
// resolving "one more board" style requests against what they actually had
export async function readOrderRequest({ file = null, note = "", history = null }) {
  const sb = await getSupabase();
  const body = { note: String(note || "").trim() };
  if (file) {
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    body.image = base64;
    body.mime = file.type || "image/png";
  }
  if (history) body.history = history;
  const { data, error } = await sb.functions.invoke("read-order", { body });
  if (error) throw error;
  if (data && data.error) throw new Error(data.error);
  return data.order;
}

// a customer's recent orders, condensed for the assistant to resolve against
export function recentOrdersFor(crm, cust, n = 3) {
  if (!cust) return null;
  const invs = (crm.invoices || [])
    .filter((i) => i.customerId === cust.id && !/void/i.test(String(i.jobType || "")))
    .sort((a, b) => String(b.invDate || "").localeCompare(String(a.invDate || "")))
    .slice(0, n);
  if (!invs.length) return null;
  return invs.map((i) => ({
    inv: i.invNo || "",
    date: i.invDate || "",
    items: (i.lines || []).filter((l) => String(l.description || "").trim()).map((l) => ({
      item: l.description, colour: l.colour || "", qty: Number(l.qty) || 0,
    })).slice(0, 15),
  }));
}

// one call that does the whole job: parse the request (text alone is fine),
// find the account, and when the request leans on "what they had", make a
// second pass with their recent orders so "one more board" becomes the exact
// board, colour and all
export async function readOrderSmart({ crm, file = null, note = "" }) {
  const order = await readOrderRequest({ file, note });
  const cust = matchCustomer(crm, order);
  if (!cust) return { order, cust: null };
  const history = recentOrdersFor(crm, cust);
  const vague = (order.items || []).some((x) => !String(x.text || "").match(/\d\.?\d?m|woodgrain|embossed|premium|enhanced|fascia|kit|balustrade|cladding|grass/i));
  if (history && (vague || order.needsHistory)) {
    try {
      const order2 = await readOrderRequest({ file, note, history });
      if (order2 && (order2.items || []).length) return { order: { ...order2, customer: order.customer }, cust };
    } catch (e) { /* the first-pass order still stands */ }
  }
  return { order, cust };
}

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
  // phones match on their last 9 digits, so 07... and +447... are the same number
  const tail = (v) => dg(v).slice(-9);
  let c = mob.length >= 9 ? (crm.customers || []).find((x) => (dg(x.mobile) && tail(x.mobile) === tail(mob)) || (dg(x.landline) && tail(x.landline) === tail(mob))) : null;
  const email = String((order && order.customer && order.customer.email) || "").trim().toLowerCase();
  if (!c && email) c = (crm.customers || []).find((x) => String(x.email || "").trim().toLowerCase() === email);
  if (!c) {
    const nm = String((order && order.customer && order.customer.name) || "").trim().toLowerCase();
    if (nm) {
      const exact = (crm.customers || []).filter((x) => String(x.name || "").trim().toLowerCase() === nm);
      if (exact.length === 1) c = exact[0];
      else if (!exact.length) {
        // loose: every word of the extracted name appears in the account name
        // OR the contact person — but only when exactly ONE account fits
        const words = nm.split(/\s+/).filter((w) => w.length > 1);
        if (words.length) {
          const hits = (crm.customers || []).filter((x) => {
            const hay = (String(x.name || "") + " " + String(x.contact || "")).toLowerCase();
            return words.every((w) => hay.includes(w));
          });
          if (hits.length === 1) c = hits[0];
        }
      }
    }
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
  const quote = kind === "quote";
  const cust = (crm.customers || []).find((x) => x.id === custId);
  // which address? match the extracted postcode against the account's sites;
  // an address we don't know yet becomes a new site on the account
  const pcN = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const addr = order.address || {};
  const wantPc = pcN(addr.postcode);
  const mySites = (crm.sites || []).filter((s2) => s2.customerId === custId);
  let siteId = mySites[0] ? mySites[0].id : "";
  let newSite = null;
  if (wantPc) {
    const hit = mySites.find((s2) => pcN(s2.postcode) === wantPc);
    if (hit) siteId = hit.id;
    else if (cust && pcN(cust.postcode) === wantPc) siteId = ""; // delivering to their own address
    else {
      newSite = { ...blankSite(custId), siteNo: nextNumber(crm.sites, "siteNo", crm.numbering.site),
        name: [addr.line, addr.town].filter(Boolean).join(", "),
        address: addr.line || "", town: addr.town || "", postcode: addr.postcode || "",
        contact: (order.customer && order.customer.name) || "", mobile: (order.customer && order.customer.mobile) || "" };
      siteId = newSite.id;
    }
  }
  const n = quote ? blankQuote(custId, siteId) : blankInvoice(custId, siteId);
  if (quote) n.quoteNo = nextNumber(crm.quotes, "quoteNo", crm.numbering.quote);
  else n.invNo = nextNumber(crm.invoices, "invNo", crm.numbering.invoice);
  n.raisedBy = me || "";
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
    + (newSite ? " NEW delivery site added from the message: " + [addr.line, addr.town, addr.postcode].filter(Boolean).join(", ") + " — check it." : "")
    + (unmatched.length ? " Couldn't match: " + unmatched.join("; ") + "." : "")
    + (String(order.notes || "").trim() ? " From the message: " + String(order.notes).trim() : "")).trim();
  if (quote) n.internalNotes = note; else n.jobNotes = note;
  return { n, unmatched, newSite };
}
