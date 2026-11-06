// Printable documents: customer invoice and warehouse/driver job sheet.
// Opens a print window (browser's Save as PDF gives the PDF). Returns false
// when the window can't be opened (e.g. inside the design preview sandbox).
import { invoiceTotals, explodeInvoiceLines, skuIndex, TRADE_COUNTER, sizeLabel } from "../../lib/crmCore.js";
const withSize = (x) => (sizeLabel(x) ? ` <span style="color:#5a6a85;font-weight:700">(${sizeLabel(x)})</span>` : "");

const esc = (s) =>
  String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const gb = (n) => "£" + (isFinite(n) ? n : 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pretty = (d) => {
  if (!d) return "—";
  const x = new Date(d + "T00:00:00");
  return isNaN(x.getTime()) ? "—" : x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const COMPANY = {
  name: "Deck Kingdom Ltd",
  address: "Unit A, 106 Whitelands Road, Ashton-under-Lyne, OL6 6UG",
  phone: "0161 399 1837",
  email: "info@deckkingdom.co.uk",
  web: "deckkingdom.co.uk",
};

const shell = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap');
  body { font-family: Quicksand, sans-serif; color: #0B1F3F; margin: 0; padding: 32px 36px; font-size: 13px; }
  .top { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #F4B73E; padding-bottom: 14px; margin-bottom: 18px; }
  .logo { width: 44px; height: 44px; border-radius: 10px; background: #0B1F3F; color: #F4B73E; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20px; }
  h1 { font-size: 20px; margin: 0; } .sub { color: #5a6a85; font-size: 11.5px; font-weight: 600; }
  .doc { margin-left: auto; text-align: right; }
  .doc b { font-size: 18px; }
  .grid { display: flex; gap: 24px; margin-bottom: 18px; flex-wrap: wrap; }
  .blk { flex: 1; min-width: 180px; }
  .blk h3 { font-size: 10.5px; letter-spacing: .6px; text-transform: uppercase; color: #8593a8; margin: 0 0 5px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th { text-align: left; font-size: 10.5px; letter-spacing: .4px; text-transform: uppercase; color: #8593a8; padding: 7px 8px; border-bottom: 2px solid #e6e9ef; }
  td { padding: 8px; border-bottom: 1px solid #eef0f4; vertical-align: top; }
  .r { text-align: right; }
  .totals { margin-left: auto; width: 270px; }
  .totals td { padding: 6px 8px; border: none; }
  .totals .final td { border-top: 2px solid #0B1F3F; font-weight: 700; font-size: 15px; padding-top: 9px; }
  .note { background: #fff8e6; border: 1px solid #f4d78f; border-radius: 8px; padding: 9px 12px; font-weight: 600; margin-bottom: 14px; }
  .foot { margin-top: 26px; border-top: 1px solid #e6e9ef; padding-top: 10px; color: #8593a8; font-size: 11px; font-weight: 600; text-align: center; }
  .big { font-size: 15px; font-weight: 700; }
  /* paperwork colours, so each kind is easy to spot in the warehouse and the vans */
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* a coloured strip down the left (saves ink) — the page itself stays white */
  .pg { border-left: 7mm solid; padding: 4px 0 4px 18px; min-height: 270mm; box-sizing: border-box; }
  .pg-loading { border-left-color: #e0a526; } .pg-delivery { border-left-color: #3f9b5c; } .pg-collection { border-left-color: #3b78d8; }
  .band { display: inline-block; color: #fff; font-weight: 800; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; border-radius: 8px; padding: 5px 12px; margin-bottom: 4px; white-space: nowrap; }
  .docno { font-size: 22px; font-weight: 800; white-space: nowrap; margin-top: 4px; }
  .pg-loading .band { background: #c98a12; } .pg-delivery .band { background: #2f8a4c; } .pg-collection .band { background: #2563c9; }
  .pg td { border-bottom-color: rgba(11,31,63,.12); } .pg th { border-bottom-color: rgba(11,31,63,.2); }
    @page { size: A4; margin: 10mm; }
  @media print { body { padding: 0; } }
</style></head><body>${body}
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
</body></html>`;

// red strip on warehouse paperwork while a job's payment risk hasn't been checked
const riskBanner = (inv) => (inv && inv.riskFlag && !inv.riskChecked
  ? `<div style="background:#C8102E;color:#fff;font-weight:700;border-radius:8px;padding:8px 12px;margin-bottom:14px;font-size:14px">⚠ ${inv.riskFlag === "manual" ? "FLAGGED HIGH RISK" : "PAYMENT RISK: " + esc(String(inv.riskFlag).toUpperCase())} — check with the office before this goes out</div>`
  : "");
// paper: the warehouse / van paperwork (loading, delivery, collection notes) — no company address in
// the heading (it's in Return to / the footer) and the number on its own line under the coloured label
const head = (docType, no, date, paper) => paper ? `
<div class="top">
  <div class="logo">DK</div>
  <div><h1>${esc(COMPANY.name)}</h1></div>
  <div class="doc"><div class="band">${esc(docType)}</div><div class="docno">#${esc(no || "—")}</div><div class="sub">${esc(date)}</div></div>
</div>` : `
<div class="top">
  <div class="logo">DK</div>
  <div><h1>${esc(COMPANY.name)}</h1>
  <div class="sub">${esc(COMPANY.address)} · ${esc(COMPANY.phone)} · ${esc(COMPANY.email)}</div></div>
  <div class="doc"><b>${esc(docType)} #${esc(no || "—")}</b><div class="sub">${esc(date)}</div></div>
</div>`;

const openDoc = (html) => {
  try {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return false;
    w.document.open();
    w.document.write(html);
    w.document.close();
    return true;
  } catch (e) {
    return false;
  }
};

const addrBlock = (title, lines) => `
<div class="blk"><h3>${esc(title)}</h3>${lines.filter(Boolean).map((l) => `<div>${esc(l)}</div>`).join("")}</div>`;

const invoiceBody = (inv, cust, site) => {
  const t = invoiceTotals(inv);
  const lines = (inv.lines || []).map((l) => `
    <tr><td><b>${esc(l.code)}</b></td><td>${esc(l.description)}${withSize(l)}</td><td>${esc(l.colour)}</td>
    <td class="r">${esc(l.qty)}</td><td class="r">${gb(Number(l.price) || 0)}</td>
    <td class="r"><b>${gb((Number(l.qty) || 0) * (Number(l.price) || 0))}</b></td></tr>`).join("");

  const body = head("Invoice", inv.invNo, pretty(inv.date)) + `
<div class="grid">
  ${addrBlock("Invoice to", [cust && cust.name, cust && cust.address, cust && [cust.town, cust.postcode].filter(Boolean).join(" "), cust && (cust.mobile || cust.landline)])}
  ${site ? addrBlock("Deliver to", [site.name, site.address !== site.name ? site.address : "", [site.town, site.postcode].filter(Boolean).join(" "), site.mobile || site.landline]) : ""}
  ${addrBlock("Details", ["Account #" + ((cust && cust.accountNo) || "—"), inv.orderRef ? "Order ref: " + inv.orderRef : "", inv.jobType, inv.deliveryDate ? "Delivery: " + pretty(inv.deliveryDate) + (inv.deliveryTime ? " " + inv.deliveryTime : "") : "", inv.paymentType ? "Payment: " + inv.paymentType + (inv.paymentDate ? " (" + pretty(inv.paymentDate) + ")" : "") : ""])}
</div>
<table><tr><th>Code</th><th>Description</th><th>Colour</th><th class="r">Qty</th><th class="r">Price inc VAT</th><th class="r">Total</th></tr>${lines}</table>
<table class="totals">
  <tr><td>Goods (inc VAT)</td><td class="r">${gb(t.goods)}</td></tr>
  ${t.discount > 0 ? `<tr><td>Discount (${t.discountPct}%)</td><td class="r">−${gb(t.discount)}</td></tr>` : ""}
  <tr><td>Delivery charge</td><td class="r">${gb(t.delivery)}</td></tr>
  <tr><td>of which VAT (${Number(inv.vatRate) || 20}%)</td><td class="r">${gb(t.vat)}</td></tr>
  <tr><td>Net</td><td class="r">${gb(t.net)}</td></tr>
  <tr class="final"><td>TOTAL</td><td class="r">${gb(t.total)}</td></tr>
</table>
<div class="foot">Thank you for your order · ${esc(COMPANY.web)} · ${esc(COMPANY.phone)}</div>`;
  return body;
};
export function printInvoice(inv, cust, site) {
  return openDoc(shell("Invoice " + (inv.invNo || ""), invoiceBody(inv, cust, site)));
}

// Customer quotation: same layout as the invoice, with validity and notes.
export function printQuote(q, cust, site) {
  const t = invoiceTotals(q);
  const lines = (q.lines || []).map((l) => `
    <tr><td><b>${esc(l.code)}</b></td><td>${esc(l.description)}${withSize(l)}</td><td>${esc(l.colour)}</td>
    <td class="r">${esc(l.qty)}</td><td class="r">${gb(Number(l.price) || 0)}</td>
    <td class="r"><b>${gb((Number(l.qty) || 0) * (Number(l.price) || 0))}</b></td></tr>`).join("");
  const deliverTo = q.siteId === TRADE_COUNTER
    ? addrBlock("Collection", ["Collected from our warehouse", COMPANY.address])
    : site ? addrBlock("Deliver to", [site.name, site.address !== site.name ? site.address : "", [site.town, site.postcode].filter(Boolean).join(" ")]) : "";

  const body = head("Quotation", "Q-" + (q.quoteNo || "—"), pretty(q.date)) + `
<div class="grid">
  ${addrBlock("Quote for", [cust && cust.name, cust && cust.address, cust && [cust.town, cust.postcode].filter(Boolean).join(" "), cust && (cust.mobile || cust.landline), cust && cust.email])}
  ${deliverTo}
  ${addrBlock("Details", ["Account #" + ((cust && cust.accountNo) || "—"), "Quote date: " + pretty(q.date), q.validUntil ? "Valid until: " + pretty(q.validUntil) : ""])}
</div>
<table><tr><th>Code</th><th>Description</th><th>Colour</th><th class="r">Qty</th><th class="r">Price inc VAT</th><th class="r">Total</th></tr>${lines}</table>
<table class="totals">
  <tr><td>Goods (inc VAT)</td><td class="r">${gb(t.goods)}</td></tr>
  ${t.discount > 0 ? `<tr><td>Discount (${t.discountPct}%)</td><td class="r">−${gb(t.discount)}</td></tr>` : ""}
  <tr><td>Delivery charge</td><td class="r">${gb(t.delivery)}</td></tr>
  <tr><td>of which VAT (${Number(q.vatRate) || 20}%)</td><td class="r">${gb(t.vat)}</td></tr>
  <tr><td>Net</td><td class="r">${gb(t.net)}</td></tr>
  <tr class="final"><td>QUOTE TOTAL</td><td class="r">${gb(t.total)}</td></tr>
</table>
${String(q.notes || "").trim() ? `<div class="note">${esc(q.notes).replace(/\n/g, "<br>")}</div>` : ""}
<div class="sub">${q.validUntil ? "This quotation is valid until " + esc(pretty(q.validUntil)) + ". " : ""}Prices include VAT. To go ahead, call ${esc(COMPANY.phone)} or email ${esc(COMPANY.email)} quoting Q-${esc(q.quoteNo || "")}.</div>
<div class="foot">Thank you for your enquiry · ${esc(COMPANY.web)} · ${esc(COMPANY.phone)}</div>`;

  return openDoc(shell("Quote Q-" + (q.quoteNo || ""), body));
}

// Sample dispatch slip: big address block for the envelope + what to pack.
const sampleSlipBody = (smp, cust) => {
  const items = (smp.items || []).map((it) => `<tr><td class="r" style="width:50px"><b>${esc(it.qty)}</b></td><td>${esc(it.description)}</td><td>${esc(it.colour)}</td><td>${esc(it.size)}</td></tr>`).join("");
  const addr = cust ? [cust.name, cust.address, cust.town, cust.postcode].filter(Boolean) : [];
  const body = head("Sample", "S-" + (smp.sampleNo || "—"), pretty(smp.date)) + `
<div style="border:2px dashed #0B1F3F;border-radius:12px;padding:18px 22px;margin-bottom:18px;max-width:420px">
  ${addr.map((l, i) => `<div class="${i === 0 ? "big" : ""}" style="font-size:${i === 0 ? 18 : 15}px;font-weight:${i === 0 ? 700 : 600}">${esc(l)}</div>`).join("")}
</div>
<table><tr><th class="r">Qty</th><th>Sample</th><th>Colour</th><th>Size</th></tr>${items}</table>
${smp.dispatchMethod ? `<div class="sub">Dispatch: ${esc(smp.dispatchMethod)}${smp.trackingRef ? " · " + esc(smp.trackingRef) : ""}</div>` : ""}
<div class="foot">Thanks for requesting samples · questions or ready to order? ${esc(COMPANY.phone)} · ${esc(COMPANY.email)}</div>`;
  return body;
};
export function printSampleSlip(smp, cust) {
  return openDoc(shell("Sample S-" + (smp.sampleNo || ""), sampleSlipBody(smp, cust)));
}
// several tickets in one print job, one per page
export function printSampleSlips(list, custOf) {
  if (!list.length) return true;
  const body = list.map((smp, i) => `<div style="${i < list.length - 1 ? "page-break-after:always;break-after:page;" : ""}">${sampleSlipBody(smp, custOf(smp))}</div>`).join("");
  return openDoc(shell(list.length + " sample tickets", body));
}

// Warehouse picking list: kit lines pull their component SKUs through.
// Once the pick list has been built on the invoice (with batch refs), the
// bill prints from it, including the batch each SKU was loaded from.
const loadingBody = (inv, cust, site, crm, planner) => {
  const bySku = skuIndex(crm);
  const shipName = (id) => {
    const s = planner && (planner.shipments || []).find((x) => x.id === id);
    return s ? s.name : "";
  };
  const hasPicks = inv.picks && inv.picks.length > 0;
  const rows = hasPicks
    ? inv.picks.map((p) => {
        const mp = bySku[(p.sku || "").trim().toLowerCase()];
        const q = Number(p.qty) || 0;
        return {
          kind: "line", sku: p.sku, description: p.description, colour: p.colour, qty: p.qty,
          weightKg: mp && mp.weightKg !== "" && mp.weightKg !== null ? q * Number(mp.weightKg) : null,
          batch: shipName(p.shipmentId) || p.batchRef || "",
          picked: p.picked === true,
        };
      })
    : explodeInvoiceLines(inv, crm);
  let totalKg = 0;
  let anyKg = false;
  const batchCol = hasPicks;
  const body_rows = rows.map((r) => {
    if (r.kind === "kit")
      return `<tr style="background:#f3f5f8"><td></td><td colspan="${batchCol ? 3 : 2}"><b>${esc(r.sku)} — ${esc(r.description)}</b>${r.colour ? " · " + esc(r.colour) : ""} <span style="color:#8593a8">(kit × ${esc(r.qty)} — load the parts below)</span></td><td></td><td class="r big">${esc(r.qty)}</td></tr>`;
    if (r.weightKg !== null) { totalKg += r.weightKg; anyKg = true; }
    const indent = r.kind === "part" ? 'style="padding-left:26px"' : "";
    const box = r.picked
      ? '<div style="width:16px;height:16px;border:2px solid #0B1F3F;border-radius:4px;background:#0B1F3F;color:#F4B73E;font-size:12px;line-height:14px;text-align:center">✓</div>'
      : '<div style="width:16px;height:16px;border:2px solid #0B1F3F;border-radius:4px"></div>';
    return `<tr><td style="width:26px">${box}</td>
      <td ${indent}><b>${esc(r.sku)}</b></td><td>${esc(r.description)}${r.colour ? " · " + esc(r.colour) : ""}</td>
      ${batchCol ? `<td><b>${esc(r.batch || "")}</b></td>` : ""}
      <td class="r">${r.weightKg !== null ? r.weightKg.toFixed(1) + " kg" : ""}</td><td class="r big">${esc(r.qty)}</td></tr>`;
  }).join("");

  const dest = site || cust || {};
  const body = `<div class="pg pg-loading">` + head("Loading note", inv.invNo, pretty(inv.deliveryDate || inv.date), true) + riskBanner(inv) + `
<div class="grid">
  ${addrBlock("Job", [cust && cust.name, inv.jobType, "Delivery: " + pretty(inv.deliveryDate) + (inv.deliveryTime ? " " + inv.deliveryTime : ""), inv.driver ? "Driver: " + inv.driver : "", inv.van ? "Van: " + inv.van : ""])}
  ${addrBlock("Deliver to", [dest.name, dest.address !== dest.name ? dest.address : "", [dest.town, dest.postcode].filter(Boolean).join(" ")])}
  ${addrBlock("Load", [anyKg ? "Approx " + totalKg.toFixed(0) + " kg (items with known weights)" : ""])}
</div>
${site && site.notes ? `<div class="note">📍 ${esc(site.notes)}</div>` : ""}
${inv.jobNotes ? `<div class="note">📝 ${esc(inv.jobNotes)}</div>` : ""}
<table><tr><th></th><th>SKU</th><th>Description</th>${batchCol ? "<th>Batch / shipment</th>" : ""}<th class="r">Weight</th><th class="r">Qty to load</th></tr>${body_rows}</table>
<div class="grid" style="margin-top:30px">
  <div class="blk"><h3>Picked by</h3><div style="border-bottom:1px solid #0B1F3F;height:34px"></div></div>
  <div class="blk"><h3>Checked by</h3><div style="border-bottom:1px solid #0B1F3F;height:34px"></div></div>
  <div class="blk"><h3>Date / time</h3><div style="border-bottom:1px solid #0B1F3F;height:34px"></div></div>
</div>
<div class="foot">${esc(COMPANY.name)} · ${esc(COMPANY.phone)}</div></div>`;
  return body;
};
export function printLoadingBill(inv, cust, site, crm, planner) {
  return openDoc(shell("Loading note " + (inv.invNo || ""), loadingBody(inv, cust, site, crm, planner)));
}

// Driver's collection note for picking goods up from a UK supplier.
export function printCollectionNote(coll) {
  const body = collectionBody(coll);
  return openDoc(shell("Collection note COL-" + (coll.collectionNo || ""), body));
}
// suppliers known by a short name on the paperwork
const SUPPLIER_SHORT = { "tuda grass": "TG" };
const supplierShort = (n) => SUPPLIER_SHORT[String(n || "").trim().toLowerCase()] || n;
const collectionBody = (coll) => {
  const items = (coll.items || []).map((it) => `
    <tr><td style="width:26px"><div style="width:16px;height:16px;border:2px solid #0B1F3F;border-radius:4px"></div></td>
    <td><b>${esc(it.sku)}</b></td><td>${esc(it.description)}${it.colour ? " · " + esc(it.colour) : ""}${withSize(it)}</td>
    <td class="r big">${esc(it.qty)}</td></tr>`).join("");
  return `<div class="pg pg-collection">` + head("Collection note", "COL-" + (coll.collectionNo || "—"), pretty(coll.collectDate || coll.date), true) + `
<div class="grid">
  ${addrBlock("Collect from", [supplierShort(coll.supplier), coll.address, [coll.town, coll.postcode].filter(Boolean).join(" ")])}
  ${addrBlock("Supplier contact", [coll.contact, coll.phone])}
  ${addrBlock("Collection", ["Date: " + pretty(coll.collectDate), coll.collectTime ? "Time: " + coll.collectTime : "", coll.driver ? "Driver: " + coll.driver : "", coll.van ? "Van: " + coll.van : ""])}
  ${addrBlock("Return to", [COMPANY.name, COMPANY.address, COMPANY.phone])}
</div>
${coll.notes ? `<div class="note">📝 ${esc(coll.notes)}</div>` : ""}
<table><tr><th></th><th>SKU</th><th>Description</th><th class="r">Qty to collect</th></tr>${items}</table>
<div class="grid" style="margin-top:30px">
  <div class="blk"><h3>Collected by (driver)</h3><div style="border-bottom:1px solid #0B1F3F;height:34px"></div></div>
  <div class="blk"><h3>Released by (supplier)</h3><div style="border-bottom:1px solid #0B1F3F;height:34px"></div></div>
  <div class="blk"><h3>Date / time</h3><div style="border-bottom:1px solid #0B1F3F;height:34px"></div></div>
</div>
<div class="foot">${esc(COMPANY.name)} · ${esc(COMPANY.phone)}</div></div>`;
};

const jobSheetBody = (inv, cust, site) => {
  const t = invoiceTotals(inv);
  const lines = (inv.lines || []).map((l) => `
    <tr><td style="width:26px"><div style="width:16px;height:16px;border:2px solid #0B1F3F;border-radius:4px"></div></td>
    <td><b>${esc(l.code)}</b></td><td>${esc(l.description)}${withSize(l)}</td><td>${esc(l.colour)}</td>
    <td class="r big">${esc(l.qty)}</td></tr>`).join("");

  const dest = site || cust || {};
  const body = `<div class="pg pg-delivery">` + head("Delivery note", inv.invNo, pretty(inv.deliveryDate || inv.date), true) + riskBanner(inv) + `
<div class="grid">
  ${addrBlock("Deliver to", [cust && cust.name, dest.name && dest.name !== (cust && cust.name) ? dest.name : "", dest.address, [dest.town, dest.postcode].filter(Boolean).join(" ")])}
  ${addrBlock("Contact", [dest.contact || (cust && cust.contact), dest.mobile || (cust && cust.mobile), dest.landline || (cust && cust.landline)])}
  ${addrBlock("Job", [inv.jobType, "Delivery: " + pretty(inv.deliveryDate) + (inv.deliveryTime ? " " + inv.deliveryTime : ""), inv.driver ? "Driver: " + inv.driver : "", inv.van ? "Van: " + inv.van : "", inv.weightKg ? "Load: " + inv.weightKg + " kg" : ""])}
  ${addrBlock("Payment", [inv.paymentType || "—", inv.paymentDate ? "Paid " + pretty(inv.paymentDate) : (inv.paymentType === "COD" ? "COLLECT " + gb(t.total) + " ON DELIVERY" : "Outstanding: " + gb(t.total))])}
</div>
${site && site.notes ? `<div class="note">📍 ${esc(site.notes)}</div>` : ""}
${inv.jobNotes ? `<div class="note">📝 ${esc(inv.jobNotes)}</div>` : ""}
<table><tr><th></th><th>Code</th><th>Description</th><th>Colour</th><th class="r">Qty</th></tr>${lines}</table>
<div class="grid" style="margin-top:30px">
  <div class="blk"><h3>Loaded by / checked</h3><div style="border-bottom:1px solid #0B1F3F;height:34px"></div></div>
  <div class="blk"><h3>Received by (print &amp; sign)</h3><div style="border-bottom:1px solid #0B1F3F;height:34px"></div></div>
  <div class="blk"><h3>Date / time</h3><div style="border-bottom:1px solid #0B1F3F;height:34px"></div></div>
</div>
<div class="foot">${esc(COMPANY.name)} · ${esc(COMPANY.phone)}</div></div>`;
  return body;
};
export function printJobSheet(inv, cust, site) {
  return openDoc(shell("Delivery note " + (inv.invNo || ""), jobSheetBody(inv, cust, site)));
}

// Several jobs' paperwork in one print window, one document per page.
// kinds: any of "loading" (loading note), "delivery" (delivery note), "invoice" — per job, in that order;
// "collection" prints the collection notes passed in colls (supplier pick-ups in the same run / day).
export const DOC_KINDS = [["loading", "Loading note"], ["delivery", "Delivery note"], ["invoice", "Invoice"]];
export function printJobDocs(jobs, kinds, { custOf, siteOf, crm, planner, title, colls = [] }) {
  const pages = [];
  if (kinds.includes("collection")) colls.forEach((c) => pages.push(collectionBody(c)));
  jobs.forEach((inv) => {
    const c = custOf(inv), st = siteOf(inv);
    kinds.forEach((k) => { if (k !== "collection") pages.push(k === "invoice" ? invoiceBody(inv, c, st) : k === "loading" ? loadingBody(inv, c, st, crm, planner) : jobSheetBody(inv, c, st)); });
  });
  if (!pages.length) return true;
  const body = pages.map((p, i) => `<div style="${i < pages.length - 1 ? "page-break-after:always;break-after:page;" : ""}">${p}</div>`).join("");
  return openDoc(shell(title || "Paperwork", body));
}

// ===== pending deliveries waiting longer than N days (Delivery Schedule › Pending › Print) =====
export function printPendingList(jobs, { days, custOf, siteOf, isPaid, daysOf }) {
  const rows = [...jobs].sort((a, b) => (daysOf(b) || 0) - (daysOf(a) || 0));
  const today = pretty(new Date().toISOString().slice(0, 10));
  const body = `
<div class="top">
  <div class="logo">DK</div>
  <div><h1>Pending deliveries</h1><div class="sub">No delivery date yet · waiting over ${esc(days)} days</div></div>
  <div class="doc"><b>${rows.length} job${rows.length === 1 ? "" : "s"}</b><div class="sub">${esc(today)}</div></div>
</div>
${rows.length ? `<table>
  <thead><tr><th class="r">Days</th><th>Inv / ref</th><th>Ordered</th><th>Customer</th><th>Phone</th><th>Deliver to</th><th>Items</th><th>Paid</th><th>Notes</th></tr></thead>
  <tbody>${rows.map((i) => {
    const c = custOf(i) || {}, s = siteOf(i) || {};
    const lines = (i.lines || []).filter((l) => l.description || l.code);
    const items = lines.slice(0, 4).map((l) => esc((l.qty ? l.qty + " × " : "") + (l.description || l.code) + (l.colour ? " · " + l.colour : ""))).join("<br>") + (lines.length > 4 ? "<br><i>+" + (lines.length - 4) + " more</i>" : "");
    const note = String(i.jobNotes || "").trim();
    return `<tr>
      <td class="r big">${esc(daysOf(i) ?? "—")}</td>
      <td style="white-space:nowrap"><b>${i.invNo ? "#" + esc(i.invNo) : "—"}</b>${i.orderRef ? `<div class="sub">${esc(i.orderRef)}</div>` : ""}</td>
      <td style="white-space:nowrap">${esc(pretty(i.date))}</td>
      <td><b>${esc(c.name || "—")}</b>${c.contact && c.contact !== c.name ? `<div class="sub">${esc(c.contact)}</div>` : ""}</td>
      <td style="white-space:nowrap">${esc(c.mobile || s.mobile || c.landline || s.landline || "—")}</td>
      <td>${esc([s.address || c.address, s.town || c.town].filter(Boolean).join(", ") || "—")}<div><b>${esc(s.postcode || c.postcode || "")}</b></div></td>
      <td style="font-size:11.5px">${items || "—"}</td>
      <td>${isPaid(i) ? "Paid" : "<b>Not paid</b>"}</td>
      <td style="font-size:11.5px;max-width:200px">${esc(note.length > 160 ? note.slice(0, 160) + "…" : note)}</td>
    </tr>`;
  }).join("")}</tbody>
</table>` : `<div class="note">Nothing has been waiting that long.</div>`}
<div class="foot">${esc(COMPANY.name)} · printed ${esc(today)}</div>
<style>@page { size: A4 landscape; margin: 12mm; }</style>`;
  return openDoc(shell("Pending deliveries over " + days + " days", body));
}
