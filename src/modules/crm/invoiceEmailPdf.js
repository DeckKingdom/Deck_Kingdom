// One flow for every "email the invoice" button: make the PDF, then either
// send it one-click with the attachment (mailbox linked under Email settings)
// or download it and open a Gmail draft with the short check-the-details note.
import { htmlToPdfFile } from "./pdfShare.js";
import { invoicePdfHtml } from "./printDocs.js";
import { invoiceAttachEmail, invoiceAttachEmailLink } from "../../lib/invoiceEmail.js";
import { emailReady, sendEmail } from "../../data/email.js";

export async function emailInvoiceWithPdf(inv, cust, site, say) {
  try {
    say("Making the invoice PDF…");
    const file = await htmlToPdfFile(invoicePdfHtml(inv, cust, site), "Deck Kingdom invoice " + (inv.invNo || inv.orderRef || "") + ".pdf");
    const m = invoiceAttachEmail(inv, cust, site);
    if (emailReady && m.to) {
      try {
        say("Sending to " + m.to + "…");
        const base64 = await new Promise((ok, no) => {
          const r = new FileReader();
          r.onload = () => ok(String(r.result).split(",")[1] || "");
          r.onerror = () => no(r.error);
          r.readAsDataURL(file);
        });
        await sendEmail({ to: m.to, subject: m.subject, body: m.body, customerId: cust && cust.id, attachments: [{ name: file.name, base64 }] });
        say("Invoice emailed to " + m.to + " with the PDF attached ✓");
        return;
      } catch (e2) {
        const setup = (e2 && e2.setup) || /isn't deployed|Email settings|026_email/i.test(String((e2 && e2.message) || ""));
        if (!setup) { say("Couldn't send — " + ((e2 && e2.message) || "try again")); return; }
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    window.open(invoiceAttachEmailLink(inv, cust, site), "_blank");
    say("PDF downloaded (" + file.name + ") — attach it to the Gmail draft that's opened.");
  } catch (e) {
    say(String((e && e.message) || e));
  }
}
