// "Email invoice": opens Gmail ready to send, with the invoice set out in the body
// (sending straight from ops with a PDF attached is parked - see data/email.js).
import { invoiceTotals, gbp, isPaid, isCollectionJob, isVoidInvoice } from "./crmCore.js";
import { prettyDate } from "./core.js";

const first = (s) => String(s || "").trim().split(/\s+/)[0] || "";
const money = (n) => gbp(Math.round((Number(n) || 0) * 100) / 100);

export const invoiceEmailTo = (cust, site) => String((cust && cust.email) || (site && site.email) || "").trim();

export function invoiceEmail(inv, cust, site) {
  const t = invoiceTotals(inv);
  const lines = (inv.lines || []).filter((l) => Number(l.qty) && (l.description || l.code));
  const qw = Math.max(1, ...lines.map((l) => String(l.qty).length));
  const name = first((site && site.contact) || (cust && (cust.contact || cust.name)));
  const where = isCollectionJob(inv)
    ? "Collection from our warehouse, Whitelands Road, Ashton-under-Lyne OL6 6UG"
    : [site && site.name !== site.address ? site.name : "", (site && site.address) || (cust && cust.address), (site && site.town) || (cust && cust.town), (site && site.postcode) || (cust && cust.postcode)]
        .flatMap((x) => String(x || "").split(/\n|,/)).map((x) => x.trim()).filter(Boolean)
        .filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i).join(", ");
  const lineTxt = lines.map((l) => {
    const desc = (l.description || l.code) + (l.colour && !String(l.description || "").toLowerCase().includes(String(l.colour).toLowerCase()) ? " – " + l.colour : "");
    return "  " + " ".repeat(qw - String(l.qty).length) + l.qty + " × " + desc + " @ " + money(l.price) + " = " + money((Number(l.qty) || 0) * (Number(l.price) || 0));
  }).join("\n");
  const paid = isPaid(inv);
  // web orders without a job number yet go by their order ref
  const ref = inv.invNo ? "#" + inv.invNo : inv.orderRef || "";
  const payLine = isVoidInvoice(inv) ? "This order was cancelled / refunded."
    : paid ? "Paid" + (inv.paymentType ? " by " + inv.paymentType : "") + (inv.paymentDate ? " on " + prettyDate(inv.paymentDate) : "") + " — thank you."
    : "Balance due: " + money(t.total) + ". You can pay by card over the phone on 0161 399 1837 — please quote " + (inv.invNo ? "invoice #" + inv.invNo : "order " + ref) + ".";
  const body = (name ? "Hi " + name : "Hi") + ",\n\n" +
    "Here's your invoice from Deck Kingdom.\n\n" +
    (inv.invNo ? "Invoice #" + inv.invNo : "Order " + ref) + " · " + prettyDate(inv.date) + (inv.invNo && inv.orderRef ? " · your ref " + inv.orderRef : "") + "\n" +
    (where ? (isCollectionJob(inv) ? "" : "Delivery to: ") + where + "\n" : "") +
    (inv.deliveryDate && !isCollectionJob(inv) ? "Delivery date: " + prettyDate(inv.deliveryDate) + "\n" : "") +
    "\n" + lineTxt + "\n\n" +
    (t.discount > 0 ? "Discount (" + t.discountPct + "%): −" + money(t.discount) + "\n" : "") +
    (t.delivery > 0 ? "Delivery: " + money(t.delivery) + "\n" : "") +
    "Total (inc VAT): " + money(t.total) + "\n" +
    "of which VAT: " + money(t.vat) + "\n\n" +
    payLine + "\n\n" +
    "Any questions, just reply to this email or call us on 0161 399 1837.\n\n" +
    "Kind regards,\nThe Deck Kingdom Team\nDeck Kingdom Ltd · Unit A, 106 Whitelands Road, Ashton-under-Lyne OL6 6UG · deckkingdom.co.uk";
  const subject = (inv.invNo ? "Invoice #" + inv.invNo : "Your order " + ref) + " – Deck Kingdom";
  return { to: invoiceEmailTo(cust, site), subject, body };
}

export const invoiceEmailLink = (inv, cust, site) => {
  const m = invoiceEmail(inv, cust, site);
  return "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(m.to) + "&su=" + encodeURIComponent(m.subject) + "&body=" + encodeURIComponent(m.body);
};
