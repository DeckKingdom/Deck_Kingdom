// Email the supplier about items that weren't ready when the driver came to collect (opens Gmail).
import { dropLeft } from "../data/drops.js";

export function supplierOf(col, crm) {
  if (!col) return null;
  return (crm.suppliers || []).find((x) => x.id === col.supplierId) || (crm.suppliers || []).find((x) => (x.name || "").toLowerCase() === String(col.supplier || "").toLowerCase()) || null;
}

// -> { email, href, subject, body } (href null when there's no email address)
export function shortPickupMail(col, conf, crm) {
  const sup = supplierOf(col, crm);
  const email = sup && sup.email ? String(sup.email).trim() : "";
  const left = dropLeft(conf);
  const day = new Date(conf.at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const ref = "COL-" + ((col && col.collectionNo) || "");
  const first = String((col && col.contact) || (sup && sup.contact) || "").trim().split(/\s+/)[0];
  const subject = "Items not ready for collection – " + ref + " – Deck Kingdom";
  const body = "Hi" + (first ? " " + first : "") + ",\n\n" +
    "Our driver" + (conf.driver ? " " + conf.driver : "") + " came to collect " + ref + " on " + day + ", but the following weren't available:\n\n" +
    left.map((x) => "  " + x.remaining + " × " + x.text + (x.colour ? " – " + x.colour : "") + "   (" + x.delivered + " of " + x.qty + " collected)").join("\n") +
    "\n\nCould you let us know when these will be ready so we can book them in for collection?\n\nOur reference: " + ref +
    "\nAny problems, call us on 0161 399 1837.\n\nKind regards,\nDeck Kingdom";
  const href = email ? "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(email) + "&su=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body) : null;
  return { email, href, subject, body, supplier: sup };
}
