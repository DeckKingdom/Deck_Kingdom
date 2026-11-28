// Bank matching: one bank transaction -> what it pays (or is), and how sure.
//   suggest(tx, ctx) -> { kind, ref, label, auto, supplierId?, person? }
//   applyMatch(c, tx, m, actor) mutates a CRM draft (invoices / purchases)
// "auto" matches are applied on import; the rest wait in the review list.
// Kinds that change nothing ("covered", "takings", "transfer", "purchase-paid",
// "invoice-paid") just mark the bank row as accounted for.
import {
  invoiceTotals, isVoidInvoice, isPaid, purchaseTotals, purchasePayments, purchaseBalance, purchaseIsPaid,
  settlePurchasePayments, supplierKey, newPurchaseFor, gbp,
} from "./crmCore.js";
import { assignCostCentre } from "./costCentres.js";

const near = (a, b, tol = 0.011) => Math.abs(a - b) < tol;
const days = (a, b) => (a && b ? Math.abs((new Date(a + "T00:00:00") - new Date(b + "T00:00:00")) / 86400000) : 9999);
const norm = (s) => supplierKey(s);

// "MOB, Je Kirk Property, Aug" -> "Je Kirk Property"; "Card 48, Evri Limited" -> "Evri Limited"
export const payeeOf = (desc) => {
  const parts = String(desc || "").split(",").map((s) => s.trim()).filter(Boolean);
  while (parts.length > 1 && /^(mob|fps|bp|dd|so|card ?\d*|cls ?\d*|cls card ?\d*|\d{1,4}|gbp faster payment|\d{6,}.*)$/i.test(parts[0])) parts.shift();
  return parts[0] || String(desc || "");
};

const TAKINGS = /worldpay|world pay|stripe|teya|paypal|sumup|square|klarna|cashback|amex|woocommerce|woo payments/i;
const OWN = /deck ?kingdom/i;
const FUEL_CARD = /allstar/i; // weekly fuel-card DD: every fill-up is already in the ledger under Fuel

export function buildContext(crm, wagePeople) {
  const sups = (crm.suppliers || []).filter((s) => norm(s.name).length >= 3).map((s) => ({ s, k: norm(s.name) }));
  const byInvNo = new Map();
  (crm.invoices || []).forEach((i) => { if (i.invNo !== null && i.invNo !== undefined && !isVoidInvoice(i)) byInvNo.set(String(i.invNo), i); });
  const custById = new Map((crm.customers || []).map((c) => [c.id, c]));
  const purchBySup = new Map();
  (crm.purchases || []).forEach((p) => { if (!purchBySup.has(p.supplierId)) purchBySup.set(p.supplierId, []); purchBySup.get(p.supplierId).push(p); });
  const allInvs = (crm.invoices || []).filter((i) => !isVoidInvoice(i) && invoiceTotals(i).total > 0);
  const openInvs = allInvs.filter((i) => !isPaid(i));
  const people = (wagePeople || []).filter(Boolean).map((n) => ({ n, k: norm(n) })).filter((x) => x.k.length >= 6);
  return { crm, sups, byInvNo, custById, purchBySup, allInvs, openInvs, people };
}

// bank payee -> the ledger supplier(s) it really is, where the names differ (Jon, Nov 26)
const ALIASES = [
  [/t ?& ?a upholstery/i, /tuda/i],              // Tuda Grass (all products) bank as T&A Upholstery Supplies
  [/je kirk|j e kirk|joanne kirk/i, /kirk/i],     // the landlord: rent, the annual buildings insurance, 2024 set-up
  [/seneca|revolve/i, /seneca|revolve/i],         // trade finance for Veejoy stock (Seneca, now Revolve)
  [/\bhmrc\b/i, /^hmrc$/i],
];
export function supplierGroup(desc, ctx) {
  for (const [pay, sup] of ALIASES) {
    if (!pay.test(desc)) continue;
    const g = ctx.sups.filter(({ s }) => sup.test(s.name || "")).map(({ s }) => s)
      .sort((a, z) => (ctx.purchBySup.get(z.id) || []).length - (ctx.purchBySup.get(a.id) || []).length);
    if (g.length) return g;
  }
  const one = supplierFor(desc, ctx);
  return one ? [one] : [];
}

// costs that only ever show on the bank (no invoice to put on the ledger): VAT to HMRC,
// trade-finance repayments and interest, the landlord's extras. Kept on the bank row with a
// cost centre — the Business screen counts them — and nothing is added to the ledger.
// regular payees whose cost is only ever seen on the bank (Jon, Nov 26)
const BANK_ONLY = [
  [/courthill/i, "Finance & Professional", "Accountancy & software", "Accountant — Simon Cornforth (Courthill)"],
  [/skool\.com|p\.skool|beseen/i, "Marketing & Web", "SEO consulting", "beSeen SEO — Darren"],
  [/intuit|qbooks|quickbooks/i, "Finance & Professional", "Accountancy & software", "QuickBooks"],
  [/^nest\b|\bnest,/i, "Staff & Subcontract", "Pension", "NEST pension"],
  [/fgn purchase fee|non-sterling|foreign (txn|transaction) fee/i, "Finance & Professional", "Bank charges", "Foreign card fee"],
  [/^(charges|service charge|account fee)/i, "Finance & Professional", "Bank charges", "Bank charges"],
];

function bankOnlyCost(desc, tx, group) {
  for (const [re, c, s, label] of BANK_ONLY) if (re.test(desc)) return { c, s, label, sure: true };
  const names = group.map((s) => s.name).join(" ") + " " + desc;
  if (/\bhmrc\b/i.test(names)) return /vat/i.test(desc)
    ? { c: "Finance & Professional", s: "HMRC", label: "VAT to HMRC (all or part of a quarter)", sure: true }
    : { c: "Finance & Professional", s: "HMRC", label: "HMRC payment — check what it's for", sure: false };
  if (/seneca|revolve/i.test(names)) return /\binv|interest/i.test(desc)
    ? { c: "Finance & Professional", s: "Trade finance interest", label: "Revolve/Seneca interest", sure: true }
    : { c: "Stock", s: "Veejoy repayments", label: "Revolve/Seneca repayment for Veejoy stock", sure: true };
  if (/kirk/i.test(names)) {
    if (/insur/i.test(desc)) return { c: "Premises", s: "Other", label: "Buildings insurance via the landlord", sure: true };
    if (tx.date < "2024-09-01") return { c: "Premises", s: "Other", label: "Unit set-up (deposit / legal fees) — check", sure: false };
    return { c: "Premises", s: "Rent", label: "Rent", sure: true };
  }
  return null;
}

// supplier named in a bank description — banks truncate ("British Gas Busine", "Tameside Mbc")
export function supplierFor(desc, ctx) {
  const dk = norm(desc), pk = norm(payeeOf(desc));
  let best = null;
  for (const { s, k } of ctx.sups) {
    if (/deckkingdom/.test(k)) continue;
    let score = 0;
    if (pk.length >= 5 && (k === pk)) score = 100;
    else if (k.length >= 5 && dk.includes(k)) score = 50 + k.length;
    else if (pk.length >= 6 && k.startsWith(pk)) score = 40 + pk.length;
    else if (k.length >= 4 && pk.startsWith(k)) score = 30 + k.length;
    if (score && (!best || score > best.score)) best = { s, score };
  }
  return best ? best.s : null;
}

const custHit = (inv, desc, ctx) => {
  const c = ctx.custById.get(inv.customerId);
  if (!c) return false;
  const dk = norm(desc);
  const name = norm(c.name);
  if (name.length >= 5 && dk.includes(name)) return true;
  const words = String(c.name || "").split(/\s+/).map(norm).filter((w) => w.length >= 4 && !/^(the|limited|ltd|and|services|homes)$/.test(w));
  return words.some((w) => dk.includes(w));
};

export function suggest(tx, ctx) {
  const A = Math.abs(Number(tx.amount) || 0);
  const desc = tx.description || "";
  // ===== money in =====
  if (tx.amount > 0) {
    if (TAKINGS.test(desc)) return { kind: "takings", auto: true, label: "Card / online takings settlement" };
    if (OWN.test(payeeOf(desc))) return { kind: "transfer", auto: true, label: "Transfer between our own accounts" };
    if (/^(j|jon|jonathan|mr j) cheetham$/i.test(payeeOf(desc).trim())) return { kind: "transfer", auto: true, label: "Jon putting money back in" };
    const ref = desc.match(/\binv(?:oice)?[\s.#:\-]*(?:no\.?)?[\s.#:\-]*(\d{3,6})\b/i);
    // a bare number in the reference ("Somerset Loft Conversions Ltd, 5177") that is one of our invoice numbers
    const bare = !ref && [...desc.matchAll(/\b(\d{4,5})\b/g)].map((m) => m[1]).find((n) => ctx.byInvNo.has(n));
    const refNo = ref && ctx.byInvNo.has(ref[1]) ? ref[1] : bare || null;
    if (refNo) {
      const inv = ctx.byInvNo.get(refNo);
      const tot = invoiceTotals(inv).total;
      if (isPaid(inv)) return { kind: "invoice-paid", ref: inv.id, auto: true, label: "Invoice #" + inv.invNo + " — already marked paid" };
      if (near(tot, A, 0.5)) return { kind: "invoice", ref: inv.id, auto: true, label: "Pays invoice #" + inv.invNo };
      return { kind: "invoice", ref: inv.id, auto: false, label: "Quotes invoice #" + inv.invNo + " but it's " + gbp(tot) + " vs " + gbp(A) + " paid" };
    }
    // the payer's name + the amount: their invoice(s) from the last five months, open or already ticked paid
    const window = ctx.allInvs.filter((i) => i.date <= tx.date && days(i.date, tx.date) <= 150);
    const named = window.filter((i) => custHit(i, desc, ctx)).sort((a, z) => days(a.date, tx.date) - days(z.date, tx.date));
    const say = (list) => {
      const open = list.filter((i) => !isPaid(i));
      const nos = list.map((i) => "#" + i.invNo).join(" + ");
      return open.length
        ? { kind: list.length > 1 ? "invoices" : "invoice", ref: open.map((i) => i.id).join(","), auto: true, label: "Pays invoice" + (list.length > 1 ? "s " : " ") + nos }
        : { kind: "invoice-paid", ref: list.map((i) => i.id).join(","), auto: true, label: "Invoice" + (list.length > 1 ? "s " : " ") + nos + " — already marked paid" };
    };
    const one = named.find((i) => near(invoiceTotals(i).total, A, 0.5));
    if (one) return say([one]);
    // one payment covering several of the same customer's invoices (Spotless pay water + electric together)
    if (named.length >= 2) {
      const L = named.slice(0, 14);
      for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) {
        const ab = invoiceTotals(L[a]).total + invoiceTotals(L[b]).total;
        if (near(ab, A, 0.5)) return say([L[a], L[b]]);
        for (let d = b + 1; d < L.length; d++) if (near(ab + invoiceTotals(L[d]).total, A, 0.5)) return say([L[a], L[b], L[d]]);
      }
    }
    const amt = window.filter((i) => !isPaid(i) && near(invoiceTotals(i).total, A, 0.01));
    if (amt.length === 1) return { kind: "invoice", ref: amt[0].id, auto: false, label: "Same amount as invoice #" + amt[0].invNo + " — check the payer" };
    const amtPaid = window.filter((i) => isPaid(i) && near(invoiceTotals(i).total, A, 0.01) && days(i.paymentDate || i.date, tx.date) <= 10);
    if (amtPaid.length === 1) return { kind: "invoice-paid", ref: amtPaid[0].id, auto: false, label: "Same amount as invoice #" + amtPaid[0].invNo + " (already paid) — check the payer" };
    const sup = supplierGroup(payeeOf(desc), ctx)[0];
    if (sup) return { kind: "refund", auto: false, supplierId: sup.id, label: "Money back from " + sup.name + "?" };
    return { kind: "review", auto: false, label: "Money in — not matched" };
  }

  // ===== money out =====
  if (FUEL_CARD.test(desc)) return { kind: "covered", auto: true, label: "Allstar fuel card — fill-ups are in the ledger" };
  if (OWN.test(payeeOf(desc))) return { kind: "transfer", auto: true, label: "Transfer between our own accounts" };
  const dk = norm(desc);
  const who = ctx.people.find((p) => dk.includes(p.k));
  if (who) return { kind: "wages", auto: true, person: who.n, ref: who.n, label: "Wages · " + who.n };

  const group = supplierGroup(desc, ctx);
  const sup = group[0];
  if (sup) {
    const list = group.flatMap((g) => ctx.purchBySup.get(g.id) || []);
    // already recorded: a payment row with this bank id, or a paid entry of this amount near this date
    const done = list.find((p) => purchasePayments(p).some((x) => String(x.ref || "").includes(tx.id)));
    if (done) return { kind: "purchase-paid", ref: done.id, auto: true, label: "Already recorded on PO " + done.poNo };
    const paid = list.filter((p) => purchaseIsPaid(p) && (
      (!purchasePayments(p).length && near(purchaseTotals(p).total, A) && days(p.datePaid || p.invDate, tx.date) <= 12) ||
      purchasePayments(p).some((x) => near(Number(x.amount) || 0, A) && days(x.date, tx.date) <= 12)));
    if (paid.length) return { kind: "purchase-paid", ref: paid[0].id, auto: true, label: sup.name + " · PO " + paid[0].poNo + " — already marked paid" };
    const open = list.filter((p) => !purchaseIsPaid(p) && (p.invDate || "") <= tx.date && days(p.invDate, tx.date) <= 200);
    // their invoice number in our payment reference ("MOB, Far Logistics, 130142") picks the purchase outright
    const byNo = list.find((p) => String(p.invNo || "").replace(/\D/g, "").length >= 4 && dk.includes(String(p.invNo).toLowerCase().replace(/[^a-z0-9]/g, "")));
    if (byNo && purchaseIsPaid(byNo)) return { kind: "purchase-paid", ref: byNo.id, auto: true, label: sup.name + " inv " + byNo.invNo + " — already marked paid" };
    // one transfer settling a batch of invoices that were all ticked paid together (Tuda, weekly)
    const batch = list.filter((p) => purchaseIsPaid(p) && !purchasePayments(p).length && p.datePaid && days(p.datePaid, tx.date) <= 3);
    const byDay = {};
    batch.forEach((p) => { (byDay[p.datePaid] = byDay[p.datePaid] || []).push(p); });
    for (const ps of Object.values(byDay)) {
      const sum = ps.reduce((t, p) => t + purchaseTotals(p).total, 0);
      if (ps.length > 1 && near(sum, A, 1)) return { kind: "covered", ref: ps.map((p) => p.id).join(","), auto: true, label: "Pays " + ps.length + " " + sup.name + " invoices already marked paid (" + gbp(sum) + ")" };
    }
    if (byNo && !purchaseIsPaid(byNo)) {
      const bal = purchaseBalance(byNo);
      if (near(bal, A)) return { kind: "purchase", ref: byNo.id, auto: true, supplierId: sup.id, label: "Pays " + sup.name + " inv " + byNo.invNo + " (PO " + byNo.poNo + ")" };
      if (bal > A) return { kind: "purchase-part", ref: byNo.id, auto: true, supplierId: sup.id, label: "Part payment on " + sup.name + " inv " + byNo.invNo + " (" + gbp(bal) + " outstanding)" };
    }
    // paid in instalments against one monthly entry on the ledger: Martin's shifts, the rent in £250s
    const cc = assignCostCentre(sup.name, "", "");
    const roll = list.filter((p) => purchaseIsPaid(p) && days(p.invDate, tx.date) <= 40 && purchaseTotals(p).total > A + 0.01)
      .sort((a, z) => days(a.invDate, tx.date) - days(z.invDate, tx.date))[0];
    if (roll) return {
      kind: "covered", ref: roll.id, auto: cc.costCentre === "Staff & Subcontract" || cc.costSub === "Rent",
      label: sup.name + " — instalment towards PO " + roll.poNo + " (" + gbp(purchaseTotals(roll).total) + ", already marked paid)",
    };
    const full = open.filter((p) => near(purchaseBalance(p), A)).sort((a, z) => days(a.invDate, tx.date) - days(z.invDate, tx.date));
    if (full.length) return { kind: "purchase", ref: full[0].id, auto: true, supplierId: sup.id, label: "Pays " + sup.name + " PO " + full[0].poNo };
    const bigger = open.filter((p) => purchaseBalance(p) > A + 0.01).sort((a, z) => (a.invDate || "").localeCompare(z.invDate || ""));
    if (bigger.length) return {
      kind: "purchase-part", ref: bigger[0].id, auto: bigger.length === 1, supplierId: sup.id,
      label: "Part payment on " + sup.name + " PO " + bigger[0].poNo + " (" + gbp(purchaseBalance(bigger[0])) + " outstanding)",
    };
    // paid entry of the same amount but the dates are far apart — probably it, but ask
    const loose = list.find((p) => purchaseIsPaid(p) && near(purchaseTotals(p).total, A) && days(p.invDate, tx.date) <= 45);
    if (loose) return { kind: "purchase-paid", ref: loose.id, auto: false, label: sup.name + " · PO " + loose.poNo + " looks like this one (dates differ)" };
    const bo = bankOnlyCost(desc, tx, group);
    if (bo) return { kind: "spend", ref: bo.c + "|" + bo.s, auto: bo.sure, label: bo.label + " → " + bo.c + " · " + bo.s };
    // a supplier whose invoices are kept on the ledger (Tuda): a lump sum is paying those, not something new
    const busy = list.filter((p) => days(p.invDate, tx.date) <= 60).length;
    if (busy >= 8) return { kind: "covered", auto: false, label: "Lump sum to " + sup.name + " — " + busy + " of their invoices are on the ledger around then; probably paying those" };
    return { kind: "new-purchase", auto: false, supplierId: sup.id, label: "Not on the ledger — add a " + sup.name + " purchase" };
  }
  // no supplier by name — card spends are often on the ledger under another name (fuel stations, Amazon …)
  const near7 = (ctx.crm.purchases || []).filter((p) => days(p.invDate || p.datePaid, tx.date) <= 7);
  const paidSame = near7.filter((p) => purchaseIsPaid(p) && near(purchaseTotals(p).total, A));
  if (paidSame.length === 1) return { kind: "purchase-paid", ref: paidSame[0].id, auto: true, label: "Same amount as PO " + paidSame[0].poNo + " — already marked paid" };
  const openSame = near7.filter((p) => !purchaseIsPaid(p) && near(purchaseBalance(p), A));
  if (openSame.length === 1) return { kind: "purchase", ref: openSame[0].id, auto: false, label: "Same amount as unpaid PO " + openSame[0].poNo + " — check the supplier" };
  const bo = bankOnlyCost(desc, tx, []);
  if (bo) return { kind: "spend", ref: bo.c + "|" + bo.s, auto: bo.sure, label: bo.label + " → " + bo.c + " · " + bo.s };
  return { kind: "review", auto: false, label: "Money out — no supplier found for “" + payeeOf(desc).slice(0, 40) + "”" };
}

const methodOf = (t) => (/direct debit/i.test(t) ? "Direct Debit" : /standing order/i.test(t) ? "Standing Order" : /card/i.test(t) ? "Card" : "Virgin Transfer");

// write one accepted match into the CRM draft; returns a note of what changed
export function applyMatch(c, tx, m, actor) {
  const A = Math.abs(Number(tx.amount) || 0);
  if (m.kind === "invoice" || m.kind === "invoices") {
    String(m.ref || "").split(",").filter(Boolean).forEach((id) => {
      const inv = (c.invoices || []).find((i) => i.id === id);
      if (inv && !inv.paymentDate) { inv.paymentDate = tx.date; if (!inv.paymentType) inv.paymentType = "Virgin Transfer"; }
    });
    return "invoice paid";
  }
  if (m.kind === "purchase" || m.kind === "purchase-part") {
    const p = (c.purchases || []).find((x) => x.id === m.ref);
    if (!p || purchasePayments(p).some((x) => String(x.ref || "").includes(tx.id))) return "";
    p.payments = [...purchasePayments(p), { id: "pp-" + tx.id.slice(3, 15), date: tx.date, amount: A, method: methodOf(tx.type), ref: "bank " + tx.id }];
    settlePurchasePayments(p);
    return "payment recorded";
  }
  if (m.kind === "new-purchase" && m.supplierId) {
    const sup = (c.suppliers || []).find((s) => s.id === m.supplierId);
    const p = newPurchaseFor(c, m.supplierId, actor);
    p.invDate = tx.date;
    p.invDetail = tx.description + " — from the bank statement: add the invoice & VAT";
    p.subTotal = A; p.vatRate = 0;
    const cc = assignCostCentre(sup ? sup.name : "", tx.description, p.category);
    p.costCentre = cc.costCentre; p.costSub = cc.costSub;
    p.payments = [{ id: "pp-" + tx.id.slice(3, 15), date: tx.date, amount: A, method: methodOf(tx.type), ref: "bank " + tx.id }];
    settlePurchasePayments(p);
    return "purchase added";
  }
  return "";
}
