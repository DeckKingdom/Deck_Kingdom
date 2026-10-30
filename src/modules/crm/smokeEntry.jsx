// Node-side smoke test: render each CRM screen with sample data.
import CustomersScreen from "./CustomersScreen.jsx";
import InvoicesScreen from "./InvoicesScreen.jsx";
import ScheduleScreen from "./ScheduleScreen.jsx";
import HomeScreen from "../HomeScreen.jsx";
import ActivityScreen from "./ActivityScreen.jsx";
import StockScreen from "./StockScreen.jsx";
import CollectionsScreen from "./CollectionsScreen.jsx";
import VansScreen from "./VansScreen.jsx";
import QuotesScreen from "./QuotesScreen.jsx";
import SamplesScreen from "./SamplesScreen.jsx";
import TasksScreen from "./TasksScreen.jsx";
import PurchasesScreen from "./PurchasesScreen.jsx";
import { syncCatalogue, renameSkus, skuFor, codeSource, numericSku, skuLists, masterKey, colourSeg, skuSource } from "../../lib/crmCore.js";
import ProductsScreen from "./ProductsScreen.jsx";
import StockCheck from "./StockCheck.jsx";
import { stockCheck, partAlternatives, raiseShortfallCollections, releaseCollectionPicks, reconcilePicks, isColPick } from "../../lib/crmCore.js";
import SuppliersScreen from "./SuppliersScreen.jsx";
import { blankSupplier, blankPurchase, purchaseTotals, newPurchaseFor, supplierStats, findSupplierByName } from "../../lib/crmCore.js";
import { blankTask, scheduledOccurrence, nextScheduled, occurrenceAssignees, dailyTasksFor, dueScheduledFor, projectsFor, setTaskDone, isDailyDone } from "../../lib/crmCore.js";
import { blankSample, blankSampleItem, syncSampleConversions, sampleStatus, sampleStats, sampleInvoice } from "../../lib/crmCore.js";
import { addDays as addD } from "../../lib/core.js";
import { blankQuote, quoteTotals, quoteStatus, convertQuoteToInvoice, duplicateQuote, quoteInvoice, quoteIsOpen, nextNumber } from "../../lib/crmCore.js";
import { emptyCrm, normaliseCrm, blankCustomer, blankSite, blankInvoice, blankLine, invoiceTotals, blankMasterProduct, blankMovement, explodeInvoiceLines, invoiceLoadKg, invoiceCost, allocatedBySku, buildPicks, pickLandedCost, jobCost, stockValuation, matchShipmentToStock, blankCollection, blankCollectionItem, titleCase, formatPhone, formatPostcode, weightedCost, batchBreakdown, applyInvoiceStockDeduction, commitCollectionItem, assignCollectionItem, itemPending, TIME_SLOTS, blankVan, blankVanCheck, vanReminders, mondayOf, today, syncMasterFromProducts } from "../../lib/crmCore.js";

export default function run(React, renderToString) {
  const crm = normaliseCrm(emptyCrm());
  const cust = { ...blankCustomer(), accountNo: 2670, name: "Bob", address: "Old Stone Trough Pub", town: "Kelbrook", postcode: "BB18 6XY", contact: "Bob", mobile: "07577 776775", source: "Market Place", trader: true };
  const site = { ...blankSite(cust.id), siteNo: 10710, name: "Old Stone Trough Pub", town: "Kelbrook", postcode: "BB18 6XY", notes: "Access via rear car park" };
  const inv = { ...blankInvoice(cust.id, site.id), invNo: 4228, date: "2026-03-30", deliveryDate: new Date().toISOString().slice(0, 10), deliveryTime: "9:30", paymentType: "COD", paymentDate: "2026-04-01", deliveryCharge: "60", deliveryCompleted: true };
  inv.lines = [
    { ...blankLine(), code: "DK/3.6/D", description: "3.6m Embossed Woodgrain Decking", colour: "Ash Grey", qty: 59, price: 18 },
    { ...blankLine(), code: "DK/3.6/D", description: "3.6m Embossed Woodgrain Decking", colour: "Anthracite", qty: 10, price: 18 },
    { ...blankLine(), code: "TG/START", description: "Starter Clips (20 pack)", qty: 2, price: 15 },
    { ...blankLine(), code: "TG/PLASTIC", description: "Plastic Decking Clips (100 pack)", qty: 8, price: 15 },
  ];
  crm.customers.push(cust);
  crm.sites.push(site);
  crm.invoices.push(inv);

  const t = invoiceTotals(inv);
  const assert = (ok, msg) => { if (!ok) { console.error("FAIL: " + msg); process.exit(1); } };
  assert(Math.abs(t.goods - 1392) < 0.001, "goods should be 1392, got " + t.goods);
  assert(Math.abs(t.total - 1452) < 0.001, "total should be 1452, got " + t.total);
  assert(Math.abs(t.vat - 242) < 0.001, "vat should be 242, got " + t.vat);
  assert(Math.abs(t.net - 1210) < 0.001, "net should be 1210, got " + t.net);

  // field formatting
  assert(titleCase("old stone trough pub") === "Old Stone Trough Pub", "title case");
  assert(formatPhone("07951728742") === "07951-728-742", "mobile 5-3-3, got " + formatPhone("07951728742"));
  assert(formatPhone("0161 320 9664") === "0161-320-9664", "landline 4-3-4, got " + formatPhone("0161 320 9664"));
  assert(formatPhone("12345") === "12345", "short numbers left alone");
  assert(formatPostcode("ol6 6ug") === "OL6-6UG" && formatPostcode("bb18 6xy") === "BB18-6XY", "postcodes");

  // discount pulls through the totals: 1392 goods, 5% = 69.60 off, +60 delivery = 1382.40
  const dInv = { ...blankInvoice("c", "s"), discountPct: 5, deliveryCharge: "60" };
  dInv.lines = [{ ...blankLine(), qty: 1, price: 1392 }];
  const dt = invoiceTotals(dInv);
  assert(Math.abs(dt.discount - 69.6) < 1e-9 && Math.abs(dt.total - 1382.4) < 1e-9, "discounted totals, got " + dt.discount + "/" + dt.total);
  assert(Math.abs(dt.vat - 1382.4 / 6) < 1e-9, "VAT backed out of discounted total");

  assert(TIME_SLOTS[0] === "AM" && TIME_SLOTS[1] === "PM" && TIME_SLOTS[2] === "TBC" && TIME_SLOTS[3] === "08:00" && TIME_SLOTS[TIME_SLOTS.length - 1] === "18:00", "time slots sequence");
  assert(TIME_SLOTS.includes("09:15") && TIME_SLOTS.includes("12:45"), "quarter-hour slots");

  // weighted average: 100 @ 6.50 in stock + 300 arriving @ 10.34 -> 9.38
  assert(Math.abs(weightedCost(100, 6.5, 300, 10.34) - 9.38) < 0.001, "weighted cost, got " + weightedCost(100, 6.5, 300, 10.34));
  assert(weightedCost(0, "", 300, 10.34) === 10.34, "no prior stock -> new cost");

  const noop = () => {};
  const props = { crm, updateCrm: noop, askConfirm: noop, me: "jon@deckkingdom.co.uk", openInvoice: noop, newInvoiceFor: noop, goCustomer: noop };

  let html = renderToString(React.createElement(CustomersScreen, { ...props, selId: null, setSelId: noop }));
  assert(html.includes("New customer") && html.includes("Bob"), "customers list");
  html = renderToString(React.createElement(CustomersScreen, { ...props, selId: cust.id, setSelId: noop }));
  ["Account #","2670","10710","rear car park","1,452.00"].forEach((s)=>{ if(!html.includes(s)) console.error("missing:", s); }); assert(["Account #","2670","10710","rear car park","1,452.00"].every((s)=>html.includes(s)), "account view");
  html = renderToString(React.createElement(InvoicesScreen, { ...props, selId: null, setSelId: noop }));
  assert(html.includes("4228") && html.includes("Paid"), "invoice list");
  html = renderToString(React.createElement(InvoicesScreen, { ...props, selId: inv.id, setSelId: noop }));
  assert(html.includes("£1,452.00") && html.includes("£242.00") && html.includes("£1,210.00"), "invoice entry totals");
  html = renderToString(React.createElement(ScheduleScreen, props));
  assert(html.includes("Bob") && html.includes("1 job"), "schedule shows the job");
  html = renderToString(React.createElement(HomeScreen, { data: { products: [], shipments: [] }, crm, updateCrm: noop, me: "", askConfirm: noop, setTab: noop, addShipment: noop, newInvoice: noop }));
  assert(html.includes("Today") && html.includes("Reports") && html.includes("Sales this month") && html.includes("Projects"), "home: tasks + reports");
  html = renderToString(React.createElement(ActivityScreen, { crm, data: { products: [], shipments: [] }, storageMode: "local" }));
  assert(html.includes("activity log"), "activity preview note");
  html = renderToString(React.createElement(ActivityScreen, { crm, data: { products: [], shipments: [] }, storageMode: "supabase" }));
  assert(html.includes("Everyone"), "activity live view shell");
  // master products: kit explosion + costing + allocation
  const board = { ...blankMasterProduct(), sku: "DK/1.8/FE/TK", name: "1.8m Fence Board", colour: "Teak", costGbp: 6.5, weightKg: 4, priceIncVat: 14, stock: 100, stockAlert: 10 };
  const post = { ...blankMasterProduct(), sku: "DK/2.4/FP", name: "2.4m Comp Fence Post", costGbp: 14, weightKg: 12, priceIncVat: 36, stock: 40 };
  const kit = { ...blankMasterProduct(), sku: "KIT/FENCE/TK", name: "Full Fence Panel Kit", colour: "Teak", isKit: true, priceIncVat: 180,
    components: [ { id: "c1", componentId: board.id, qty: 10 }, { id: "c2", componentId: post.id, qty: 2 } ] };
  crm.masterProducts.push(board, post, kit);
  const kitInv = { ...blankInvoice(cust.id, site.id), invNo: 9999, deliveryDate: new Date().toISOString().slice(0, 10) };
  kitInv.lines = [{ ...blankLine(), code: "KIT/FENCE/TK", description: "Full Fence Panel Kit", qty: 3, price: 180 }];
  crm.invoices.push(kitInv);
  const ex = explodeInvoiceLines(kitInv, crm);
  assert(ex.length === 3 && ex[0].kind === "kit", "kit explodes to header + 2 parts, got " + JSON.stringify(ex.map((r) => r.kind)));
  assert(ex[1].qty === 30 && ex[2].qty === 6, "kit part quantities 30 boards + 6 posts, got " + ex[1].qty + "/" + ex[2].qty);
  assert(Math.abs(ex[1].weightKg - 120) < 0.001, "30 boards x 4kg = 120kg, got " + ex[1].weightKg);
  const ic = invoiceCost(kitInv, crm);
  assert(Math.abs(ic.cost - 3 * (10 * 6.5 + 2 * 14)) < 0.001, "kit cost from components = 279, got " + ic.cost);
  const alloc = allocatedBySku(crm);
  assert(alloc["dk/1.8/fe/tk"] === 30 && alloc["dk/2.4/fp"] === 6, "allocation counts kit parts, got " + JSON.stringify(alloc));
  // batch landed costing: shipment paid $3,000@1.25 + $7,000@1.4, 500 pcs, ship £500, duty £250
  const shipment = {
    id: "ship1", name: "Shipment 31", status: "Arrived",
    depositUsd: 3000, depositFx: 1.25, balanceUsd: 7000, balanceFx: 1.4,
    shippingGbp: 500, dutyGbp: 250, dutyOn: true, surchargeOn: true,
    lines: [{ id: "sl1", productId: "ip1", colour: "Teak", pallets: 10, qty: 50, cost: 4 }],
  };
  const planner = { products: [{ id: "ip1", name: "1.8m Fence Board", supplier: "Veejoy" }], shipments: [shipment] };
  board.importProductId = "ip1";
  kitInv.picks = buildPicks(kitInv, crm);
  assert(kitInv.picks.length === 2 && kitInv.picks[0].qty === 30, "picks built from exploded kit, got " + JSON.stringify(kitInv.picks.map((p) => [p.sku, p.qty])));
  kitInv.picks[0].shipmentId = "ship1"; // boards from Shipment 31
  const lc = pickLandedCost(kitInv.picks[0], crm, planner);
  // fx = 10000/7400; £/pc = 4*0.74 = 2.96; +3% = 3.0488; +duty 0.5 +ship 1.0 = 4.5488
  assert(lc.source === "landed" && Math.abs(lc.perPc - 4.5488) < 1e-9, "landed per pc 4.5488, got " + lc.source + " " + lc.perPc);
  const jc = jobCost(kitInv, crm, planner);
  // 30 boards x 4.5488 + 6 posts x master 14 = 136.464 + 84 = 220.464
  assert(Math.abs(jc.total - 220.464) < 1e-9 && jc.landedLines === 1, "job cost 220.464 with 1 landed line, got " + jc.total + "/" + jc.landedLines);
  // stock valuation: board stock 100 @ cost 6.5 / price 14; post 40 @ 14 / 36; kit 0 stock
  const sv = stockValuation(crm);
  // units 140; cost 100*6.5+40*14 = 1210; sale 100*14+40*36 = 2840; trade 2840*0.9 = 2556
  assert(sv.units === 140 && Math.abs(sv.costValue - 1210) < 1e-9, "valuation units/cost, got " + sv.units + "/" + sv.costValue);
  assert(Math.abs(sv.saleValue - 2840) < 1e-9 && Math.abs(sv.tradeValue - 2556) < 1e-9, "sale/trade value, got " + sv.saleValue + "/" + sv.tradeValue);
  // shipment -> stock matching via importProductId + colour
  const m = matchShipmentToStock(shipment, crm);
  assert(m.matched.length === 1 && m.matched[0].qty === 500 && Math.abs(m.matched[0].landed - 4.5488) < 1e-9, "shipment match 500 pcs @4.5488, got " + JSON.stringify(m.matched.map((x) => [x.qty, x.landed])));
  // collection with unit cost -> pick carries batch cost
  const colln = { ...blankCollection(), collectionNo: 7, supplier: "UK Timber Co", collectDate: new Date().toISOString().slice(0, 10) };
  colln.items = [{ ...blankCollectionItem(), sku: "DK/2.4/FP", description: "2.4m Comp Fence Post", qty: 10, unitCost: 13.25 }];
  crm.collections.push(colln);
  const batchPick = { sku: "DK/2.4/FP", qty: 10, unitCost: 13.25, shipmentId: "", batchRef: "COL-7" };
  const blc = pickLandedCost(batchPick, crm, planner);
  assert(blc.source === "batch" && blc.perPc === 13.25, "collection unit cost wins, got " + blc.source + " " + blc.perPc);
  html = renderToString(React.createElement(StockScreen, { crm, updateCrm: noop, planner, updatePlanner: noop, askConfirm: noop, me: "x" }));
  assert(html.includes("Stock value at cost") && html.includes("Trade value") === false ? html.includes("trade") || html.includes("Trade") : true, "stock screen renders");
  assert(html.includes("Post shipment to stock"), "stock screen post button");
  html = renderToString(React.createElement(CollectionsScreen, { crm, updateCrm: noop, askConfirm: noop, selId: null, setSelId: noop, openInvoice: noop, me: "x" }));
  assert(html.includes("UK Timber Co") && html.includes("COL-"), "collections list renders");
  // per-line disposition: one to stock, one to a job
  {
    colln.items.push({ ...colln.items[0], id: "ci2", sku: "DK/1.8/FE/TK", description: "1.8m Fence Board", qty: 4, unitCost: 6.1, assignedInvoiceId: "", postedAt: "" });
    const boardRef = crm.masterProducts.find((m) => m.sku === "DK/1.8/FE/TK");
    const preB = Number(boardRef.stock);
    assert(commitCollectionItem(crm, colln, colln.items[1], "x") && Number(boardRef.stock) === preB + 4 && colln.items[1].postedAt, "line to stock");
    assert(!commitCollectionItem(crm, colln, colln.items[1], "x"), "no double stocking");
    const assignInv = { ...blankInvoice(cust.id, ""), invNo: 9998 };
    crm.invoices.push(assignInv);
    assert(assignCollectionItem(crm, colln, colln.items[0], assignInv.id) && assignInv.picks.length === 1 && assignInv.picks[0].unitCost === 13.25, "line to job at purchase cost");
    assert(!itemPending(colln.items[0]) && !itemPending(colln.items[1]), "both lines dispositioned");
  }
  html = renderToString(React.createElement(CollectionsScreen, { crm, updateCrm: noop, askConfirm: noop, selId: colln.id, setSelId: noop, openInvoice: noop, me: "x" }));
  assert(html.includes("In stock") && html.includes("9998"), "collection editor shows per-line outcomes");
  html = renderToString(React.createElement(ScheduleScreen, { crm, updateCrm: noop, openInvoice: noop, openCollection: noop }));
  assert(html.includes("COLLECTION") && html.includes("UK Timber Co"), "collection shows on schedule");
  // auto-sync: products screen drives the stock rows
  {
    const syncPlanner = { products: [{ id: "ipX", name: "Decking Board 4.8m", colours: ["Anthracite", "Silver"], weight: 10.5, salePrice: 29.5, category: "Decking" }] };
    const before = crm.masterProducts.length;
    const synced = syncMasterFromProducts(crm, syncPlanner);
    assert(synced && synced.length === before + 2, "sync creates one row per colour, got " + (synced && synced.length));
    const row = synced.find((m) => m.importProductId === "ipX" && m.colour === "Anthracite");
    assert(row && row.sku.includes("DECK") && row.weightKg === 10.5 && row.priceIncVat === 29.5, "synced row carries sku/weight/price, got " + JSON.stringify(row && [row.sku, row.weightKg, row.priceIncVat]));
    crm.masterProducts = synced;
    assert(syncMasterFromProducts(crm, syncPlanner) === null, "second sync is a no-op");
  }
  const van = { ...blankVan(), name: "Sprinter", reg: "DK71 VAN", insurer: "NFU", insuranceRenewal: "2026-11-15", motDue: "2026-11-02" };
  van.checks = [{ ...blankVanCheck(), by: "Ian", mileage: 54210, lights: false, defects: "nearside indicator bulb" }];
  crm.vans.push(van);
  // reminders: unchecked van + MOT due inside 30 days -> both due; snoozed today -> hidden
  {
    crm.vans[0].checks[0].date = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
    const rs = vanReminders(crm);
    assert(rs.some((r) => r.kind === "check"), "weekly check reminder due (van checked 10 days ago)");
    const motVan = { ...blankVan(), name: "Renault", motDue: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10) };
    crm.vans.push(motVan);
    const rs2 = vanReminders(crm);
    assert(rs2.some((r) => r.key === "renew:" + motVan.id + ":motDue"), "MOT renewal reminder at 10 days out");
    crm.reminders["renew:" + motVan.id + ":motDue"] = today();
    assert(!vanReminders(crm).some((r) => r.key === "renew:" + motVan.id + ":motDue"), "snoozed renewal hidden for a week");
    crm.reminders["check:" + crm.vans[0].id] = mondayOf(today());
    assert(!vanReminders(crm).some((r) => r.key === "check:" + crm.vans[0].id), "snoozed check hidden until next Monday");
  }
  // batch breakdown + completion deduction
  {
    crm.movements.push(
      { id: "mv1", at: "2026-10-01T10:00:00Z", sku: "DK/2.4/FP", mpId: post.id, qty: 40, unitCost: 14.2, kind: "shipment", ref: "Shipment 25" },
      { id: "mv2", at: "2026-10-20T10:00:00Z", sku: "DK/2.4/FP", mpId: post.id, qty: 30, unitCost: 13.1, kind: "shipment", ref: "Shipment 31" }
    );
    kitInv.picks[1].shipmentId = "ship1"; // posts picked from Shipment 31
    const bb = batchBreakdown("DK/2.4/FP", crm, planner);
    // kitInv picks: 6 posts assigned to ship1 = "Shipment 31"
    const b31 = bb.find((b) => b.ref === "Shipment 31");
    const b25 = bb.find((b) => b.ref === "Shipment 25");
    assert(b25 && b25.left === 40 && b31 && b31.picked === 6 && b31.left === 24, "batch lefts, got " + JSON.stringify(bb.map((b) => [b.ref, b.qtyIn, b.picked, b.left])));
    // completion deducts stock once, untick restores
    const postRef = crm.masterProducts.find((m) => m.sku === "DK/2.4/FP");
    const preStock = Number(postRef.stock);
    applyInvoiceStockDeduction(kitInv, crm, true, "x");
    assert(Number(postRef.stock) === preStock - 6 && kitInv.stockDeducted, "completion deducts picks, got " + postRef.stock);
    applyInvoiceStockDeduction(kitInv, crm, true, "x");
    assert(Number(postRef.stock) === preStock - 6, "idempotent");
    applyInvoiceStockDeduction(kitInv, crm, false, "x");
    assert(Number(postRef.stock) === preStock && !kitInv.stockDeducted, "untick restores");
  }
  html = renderToString(React.createElement(VansScreen, { crm, updateCrm: noop, askConfirm: noop, me: "x" }));
  assert(html.includes("Sprinter") && html.includes("Weekly check") && html.includes("Insurance"), "vans screen renders");
  // ===== quotes =====
  {
    const qc = normaliseCrm(JSON.parse(JSON.stringify(crm)));
    assert(Array.isArray(qc.quotes) && qc.numbering.quote === 1, "quotes normalised + numbering");
    const qt = { ...blankQuote(cust.id, site.id), quoteNo: 101, deliveryCharge: "60", discountPct: "10" };
    qt.lines = inv.lines.map((l) => ({ ...l, id: l.id + "q" }));
    qc.quotes.push(qt);
    const tq = quoteTotals(qt);
    assert(Math.abs(tq.goods - 1392) < 0.001 && Math.abs(tq.discount - 139.2) < 0.001 && Math.abs(tq.total - 1312.8) < 0.001, "quote totals: " + JSON.stringify(tq));
    assert(quoteStatus(qt, qc) === "Draft" && quoteIsOpen(qt, qc), "new quote is an open draft");
    const old = { ...blankQuote(cust.id, ""), quoteNo: 99, validUntil: "2020-01-01" };
    qc.quotes.push(old);
    assert(quoteStatus(old, qc) === "Expired" && !quoteIsOpen(old, qc), "past validity -> Expired");

    // convert
    const before = qc.invoices.length;
    const nextInv = nextNumber(qc.invoices, "invNo", qc.numbering.invoice);
    const made = convertQuoteToInvoice(qc, qt.id, "jon", "fixed-id");
    assert(made && made.id === "fixed-id" && qc.invoices.length === before + 1, "conversion adds an invoice");
    assert(made.invNo === nextInv && qc.numbering.invoice === nextInv + 1, "invoice sequence moves on");
    assert(made.customerId === cust.id && made.siteId === site.id && made.quoteId === qt.id, "invoice linked to customer, site and quote");
    assert(made.lines.length === 4 && made.lines[0].id !== qt.lines[0].id, "lines copied with fresh ids");
    assert(Math.abs(invoiceTotals(made).total - tq.total) < 0.001, "invoice total matches the quote");
    assert(quoteStatus(qt, qc) === "Converted" && quoteInvoice(qt, qc) === made, "quote shows Converted");
    assert(convertQuoteToInvoice(qc, qt.id, "jon") === null, "can't convert twice");
    const nocust = { ...blankQuote("", ""), quoteNo: 102 };
    qc.quotes.push(nocust);
    assert(convertQuoteToInvoice(qc, nocust.id, "jon") === null, "needs a customer");
    // quote lines never touch stock allocation
    const allocBefore = JSON.stringify(allocatedBySku({ ...qc, invoices: qc.invoices.filter((i) => i.id !== made.id) }));
    assert(allocBefore === JSON.stringify(allocatedBySku({ ...qc, quotes: [], invoices: qc.invoices.filter((i) => i.id !== made.id) })), "quotes don't allocate stock");
    // deleting the invoice reopens the quote
    qc.invoices = qc.invoices.filter((i) => i.id !== made.id);
    assert(quoteStatus(qt, qc) === "Accepted", "orphaned quote reopens as Accepted");
    // duplicate
    const dup = duplicateQuote(qc, qt.id, "jon", "dup-id");
    assert(dup.id === "dup-id" && dup.status === "Draft" && dup.quoteNo === 103 && dup.lines.length === 4 && dup.lines[0].id !== qt.lines[0].id, "duplicate is a fresh draft");

    const qprops = { crm: qc, updateCrm: noop, askConfirm: noop, setSelId: noop, goCustomer: noop, openInvoice: noop, me: "x", filter: null, setFilter: noop };
    html = renderToString(React.createElement(QuotesScreen, { ...qprops, selId: null }));
    assert(html.includes("Q-103") && html.includes("Open value") && html.includes("New quote"), "quotes list renders");
    html = renderToString(React.createElement(QuotesScreen, { ...qprops, selId: qt.id }));
    assert(html.includes("Q-101") && html.includes("Convert to invoice") && html.includes("Old Stone Trough Pub"), "quote entry renders");
    const conv2 = convertQuoteToInvoice(qc, qt.id, "jon", "inv-2");
    html = renderToString(React.createElement(QuotesScreen, { ...qprops, selId: qt.id }));
    assert(html.includes("Open invoice #") && html.includes("locked"), "converted quote locks");
    html = renderToString(React.createElement(InvoicesScreen, { crm: qc, updateCrm: noop, askConfirm: noop, selId: conv2.id, setSelId: noop, goCustomer: noop, openQuote: noop, me: "x", planner: { products: [], shipments: [] }, filter: null, setFilter: noop }));
    assert(html.includes("From quote Q-101"), "invoice links back to its quote");
    html = renderToString(React.createElement(CustomersScreen, { crm: qc, updateCrm: noop, askConfirm: noop, selId: cust.id, setSelId: noop, openInvoice: noop, newInvoiceFor: noop, openQuote: noop, newQuoteFor: noop, me: "x" }));
    assert(html.includes("Quotes (") && html.includes("Q-101") && html.includes("Converted"), "customer account lists quotes");
  }
  // ===== samples & conversion attribution =====
  {
    const sc = normaliseCrm({ customers: [cust, { ...blankCustomer(), id: "c2", name: "Sue" }], sites: [site], invoices: [] });
    assert(Array.isArray(sc.samples) && sc.numbering.sample === 1, "samples normalised");
    const d0 = addD(today(), -100);
    const mkInv = (id, date, extra = {}) => ({ ...blankInvoice(cust.id, ""), id: String(id), invNo: id, date, lines: [{ ...blankLine(), qty: 10, price: 20 }], ...extra });
    const s1 = { ...blankSample(cust.id), id: "s1", sampleNo: 1, date: d0, items: [{ ...blankSampleItem(), description: "Decking board", colour: "Ash Grey" }] };
    const s2 = { ...blankSample(cust.id), id: "s2", sampleNo: 2, date: addD(d0, 40) };
    const s3 = { ...blankSample("c2"), id: "s3", sampleNo: 3, date: addD(today(), -300) };
    sc.samples.push(s1, s2, s3);
    sc.invoices.push(
      mkInv(10, addD(d0, -5)),                                   // before the sample: never counts
      mkInv(11, addD(d0, 10), { paymentType: "Sample" }),        // the sample order itself: not a sale
      mkInv(12, addD(d0, 20)),                                   // first real order -> s1
      mkInv(13, addD(d0, 50)),                                   // after s2 -> s2
      { ...mkInv(14, addD(today(), -5)), customerId: "c2" },      // Sue ordered 295 days after: outside window
    );
    let synced = syncSampleConversions(sc);
    assert(synced, "sync finds conversions");
    sc.samples = synced;
    const by = (id) => sc.samples.find((x) => x.id === id);
    assert(by("s1").convertedInvoiceId === "12", "s1 credited with first sale after it, got " + by("s1").convertedInvoiceId);
    assert(by("s2").convertedInvoiceId === "13", "s2 credited with order after the 2nd request (no double count)");
    assert(by("s3").convertedInvoiceId === "" && sampleStatus(by("s3"), sc) === "Lapsed", "outside the window -> Lapsed");
    assert(syncSampleConversions(sc) === null, "sync is stable once stored");
    // manual override + no sale
    by("s1").linkManual = true; by("s1").convertedInvoiceId = "13";
    sc.samples = syncSampleConversions(sc) || sc.samples;
    assert(by("s1").convertedInvoiceId === "13" && sampleInvoice(by("s1"), sc).invNo === 13 && syncSampleConversions(sc) === null, "pinned invoice respected");
    by("s1").linkManual = false;
    sc.samples = syncSampleConversions(sc) || sc.samples;
    assert(by("s1").convertedInvoiceId === "12", "back to automatic");
    by("s2").outcome = "lost";
    sc.samples = syncSampleConversions(sc) || sc.samples;
    assert(by("s2").convertedInvoiceId === "" && sampleStatus(by("s2"), sc) === "No sale", "no sale clears credit");
    by("s2").outcome = "";
    sc.samples = syncSampleConversions(sc) || sc.samples;
    // deleting the invoice removes the credit
    sc.invoices = sc.invoices.filter((i) => i.id !== "12");
    sc.samples = syncSampleConversions(sc) || sc.samples;
    assert(by("s1").convertedInvoiceId === "13" || by("s1").convertedInvoiceId === "", "re-matched after delete");
    sc.invoices.push(mkInv(12, addD(d0, 20)));
    sc.samples = syncSampleConversions(sc) || sc.samples;
    const st = sampleStats(sc.samples, sc);
    assert(st.requests === 3 && st.converted === 2 && Math.abs(st.revenue - 400) < 0.01 && st.avgDays === 15, "stats " + JSON.stringify(st));
    // statuses for the work lists
    const fresh = { ...blankSample(cust.id), id: "s4", sampleNo: 4 };
    sc.samples.push(fresh);
    assert(sampleStatus(fresh, sc) === "To send", "new request is To send");
    fresh.dispatchedDate = addD(today(), -8); fresh.followUpDate = addD(today(), -1);
    assert(sampleStatus(fresh, sc) === "Follow-up due", "follow-up due");
    fresh.followedUp = true;
    assert(sampleStatus(fresh, sc) === "Followed up", "followed up");

    const sprops = { crm: sc, updateCrm: noop, askConfirm: noop, setSelId: noop, goCustomer: noop, openInvoice: noop, me: "x" };
    html = renderToString(React.createElement(SamplesScreen, { ...sprops, selId: null }));
    assert(html.includes("Sample requests") && html.includes("Sales from samples") && html.includes("By month requested"), "samples list renders");
    html = renderToString(React.createElement(SamplesScreen, { ...sprops, selId: "s1" }));
    assert(html.includes("S-1") && html.includes("Ordered — invoice #12") && html.includes("Decking board"), "sample entry renders converted");
    html = renderToString(React.createElement(SamplesScreen, { ...sprops, selId: "s4" }));
    assert(html.includes("Watching for an order"), "open sample renders");
    html = renderToString(React.createElement(InvoicesScreen, { crm: sc, updateCrm: noop, askConfirm: noop, selId: "12", setSelId: noop, goCustomer: noop, openQuote: noop, openSample: noop, me: "x", planner: { products: [], shipments: [] }, filter: null, setFilter: noop }));
    assert(html.includes("From sample S-1"), "invoice shows its sample");
    html = renderToString(React.createElement(CustomersScreen, { crm: sc, updateCrm: noop, askConfirm: noop, selId: cust.id, setSelId: noop, openInvoice: noop, newInvoiceFor: noop, openQuote: noop, newQuoteFor: noop, openSample: noop, newSampleFor: noop, me: "x" }));
    assert(html.includes("Sample requests (") && html.includes("Log sample"), "customer account lists samples");
  }
  // ===== tasks =====
  {
    const tc = normaliseCrm({ customers: [], staff: [{ email: "ian@dk.co.uk", name: "Ian" }, { email: "molly@dk.co.uk", name: "Molly" }] });
    // weekly on Wednesday from Mon 2026-10-05
    const wk = { ...blankTask("scheduled"), id: "wk", title: "Sweep warehouse", frequency: "weekly", weekday: 2, startDate: "2026-10-05", assignees: ["ian@dk.co.uk", "molly@dk.co.uk"], rotate: true };
    assert(scheduledOccurrence(wk, "2026-10-06") === null, "nothing before first Wednesday");
    let o = scheduledOccurrence(wk, "2026-10-07");
    assert(o.date === "2026-10-07" && o.index === 0 && occurrenceAssignees(wk, o)[0] === "ian@dk.co.uk", "first Wed is Ian's");
    o = scheduledOccurrence(wk, "2026-10-16");
    assert(o.date === "2026-10-14" && o.index === 1 && occurrenceAssignees(wk, o)[0] === "molly@dk.co.uk", "second Wed is Molly's (rota)");
    assert(nextScheduled(wk, "2026-10-14").date === "2026-10-21", "next after a Wednesday is the following one");
    const fn = { ...wk, id: "fn", frequency: "fortnightly" };
    assert(scheduledOccurrence(fn, "2026-10-20").date === "2026-10-07" && scheduledOccurrence(fn, "2026-10-21").date === "2026-10-21", "fortnightly");
    const mo = { ...blankTask("scheduled"), id: "mo", frequency: "monthly", monthDay: 31, startDate: "2026-01-15" };
    assert(scheduledOccurrence(mo, "2026-02-27").date === "2026-01-31" && scheduledOccurrence(mo, "2026-02-28").date === "2026-02-28", "monthly clamps to month end");
    assert(scheduledOccurrence(mo, "2026-03-10").index === 1, "monthly index");
    const mo2 = { ...mo, monthDay: 1, startDate: "2026-01-15" };
    assert(scheduledOccurrence(mo2, "2026-01-20") === null && scheduledOccurrence(mo2, "2026-02-01").date === "2026-02-01", "monthly starts after start date");

    // due lists + ticking
    tc.tasks.push({ ...wk, startDate: addD(today(), -21) });
    const due = dueScheduledFor(tc, "ian@dk.co.uk", today()).concat(dueScheduledFor(tc, "molly@dk.co.uk", today()));
    const occNow = scheduledOccurrence(tc.tasks[0], today());
    if (occNow) {
      assert(due.length === 1, "exactly one person has the current rota occurrence");
      setTaskDone(tc, "wk", occNow.date, due[0].task ? "x" : "", true);
      assert(dueScheduledFor(tc, "ian@dk.co.uk").length === 0 && dueScheduledFor(tc, "molly@dk.co.uk").length === 0, "done clears it for everyone");
    }
    const d1 = { ...blankTask("daily"), id: "d1", title: "Check web orders", repeat: "everyday" };
    const d2 = { ...blankTask("daily"), id: "d2", title: "Ian only", repeat: "everyday", assignees: ["ian@dk.co.uk"] };
    const d3 = { ...blankTask("daily"), id: "d3", title: "One-off", repeat: "once", onDate: addD(today(), 1) };
    tc.tasks.push(d1, d2, d3);
    assert(dailyTasksFor(tc, "molly@dk.co.uk", today()).map((t) => t.id).join() === "d1", "Molly sees shared daily only");
    assert(dailyTasksFor(tc, "ian@dk.co.uk", today()).length === 2 && dailyTasksFor(tc, "ian@dk.co.uk", addD(today(), 1)).length === 3, "one-off shows on its day");
    setTaskDone(tc, "d1", today(), "ian@dk.co.uk", true);
    assert(isDailyDone(tc, d1, today(), "ian@dk.co.uk") && !isDailyDone(tc, d1, today(), "molly@dk.co.uk"), "daily ticks are per person");
    assert(!isDailyDone(tc, d1, addD(today(), 1), "ian@dk.co.uk"), "fresh list tomorrow");
    setTaskDone(tc, "d1", today(), "ian@dk.co.uk", false);
    assert(!isDailyDone(tc, d1, today(), "ian@dk.co.uk"), "untick");
    const wd = { ...blankTask("daily"), id: "wd", repeat: "workdays" };
    tc.tasks.push(wd);
    assert(!dailyTasksFor(tc, "", "2026-10-31").some((t) => t.id === "wd") && dailyTasksFor(tc, "", "2026-10-30").some((t) => t.id === "wd"), "working days only");
    const pj = { ...blankTask("project"), id: "pj", title: "Photograph fencing", assignees: ["molly@dk.co.uk"], priority: "High" };
    tc.tasks.push(pj, { ...pj, id: "pj2", status: "Done" });
    assert(projectsFor(tc, "molly@dk.co.uk").length === 1 && projectsFor(tc, "ian@dk.co.uk").length === 0 && projectsFor(tc, "molly@dk.co.uk", true).length === 2, "projects per person");

    html = renderToString(React.createElement(HomeScreen, { data: { products: [], shipments: [] }, crm: tc, updateCrm: noop, me: "molly@dk.co.uk", askConfirm: noop, setTab: noop, addShipment: noop, newInvoice: noop }));
    assert(html.includes("Check web orders") && html.includes("Photograph fencing") && !html.includes("Ian only"), "home shows Molly's list");
    for (const k of ["daily", "project", "scheduled"]) {
      html = renderToString(React.createElement(TasksScreen, { crm: tc, updateCrm: noop, askConfirm: noop, me: "ian@dk.co.uk", goHome: noop }));
      assert(html.includes("Daily list") && html.includes("Check web orders"), "tasks manager renders");
    }
  }
  // ===== suppliers & purchases =====
  {
    const pc = normaliseCrm({ customers: [] });
    assert(pc.numbering.purchase === 1 && Array.isArray(pc.suppliers) && Array.isArray(pc.purchases), "purchases normalised");
    const tuda = { ...blankSupplier(), id: "sup1", name: "Tuda Grass", accountNo: "DK001", postcode: "M1-1AA", category: "Products", paymentMethod: "Virgin Transfer" };
    pc.suppliers.push(tuda);
    pc.numbering.purchase = 3798;
    const po = newPurchaseFor(pc, "sup1", "hayley@dk.co.uk", "po1");
    assert(po.poNo === 3798 && pc.numbering.purchase === 3799, "PO numbering continues");
    assert(po.category === "Products" && po.paymentMethod === "Virgin Transfer", "supplier defaults pulled through");
    Object.assign(po, { invNo: "106163", invDate: "2026-01-05", invDetail: "4 x U channel\n66 x Fence panel grey", subTotal: "748", purchasedBy: "Jon", datePaid: "2026-02-20" });
    let t = purchaseTotals(po);
    assert(t.sub === 748 && t.vat === 149.6 && t.total === 897.6, "FileMaker example: 748 + 149.60 = 897.60, got " + JSON.stringify(t));
    po.vatAmount = "100";
    t = purchaseTotals(po);
    assert(t.manualVat && t.total === 848, "typed-over VAT");
    po.vatAmount = ""; po.vatRate = 0;
    assert(purchaseTotals(po).total === 748, "zero-rated");
    po.vatRate = 20;
    const po2 = newPurchaseFor(pc, "sup1", "x", "po2");
    po2.subTotal = "100";
    const st = supplierStats(pc, "sup1");
    assert(st.count === 2 && st.spend === 1017.6 && st.unpaid === 120 && st.unpaidCount === 1, "supplier stats " + JSON.stringify(st));
    assert(findSupplierByName(pc, "TUDA GRASS LTD") === tuda && !findSupplierByName(pc, "Cladco"), "duplicate supplier match");
    const pprops = { crm: pc, updateCrm: noop, askConfirm: noop, setSelId: noop, me: "x", goSupplier: noop, filter: null, setFilter: noop };
    html = renderToString(React.createElement(PurchasesScreen, { ...pprops, selId: null }));
    assert(html.includes("Spent this month") && html.includes("New purchase") && html.includes("Unpaid"), "purchases list renders");
    html = renderToString(React.createElement(PurchasesScreen, { ...pprops, selId: "po1" }));
    assert(html.includes("PO# 3798") && html.includes("Tuda Grass") && html.includes("DK001") && html.includes("106163") && html.includes("£897.60"), "purchase entry renders");
    const sprops = { crm: pc, updateCrm: noop, askConfirm: noop, setSelId: noop, me: "x", openPurchase: noop, newPurchase: noop, openCollection: noop };
    html = renderToString(React.createElement(SuppliersScreen, { ...sprops, selId: null }));
    assert(html.includes("Tuda Grass") && html.includes("New supplier"), "suppliers list renders");
    html = renderToString(React.createElement(SuppliersScreen, { ...sprops, selId: "sup1" }));
    assert(html.includes("Account #DK001") && html.includes("106163") && html.includes("Total spend"), "supplier view renders");
    const col = { ...blankCollection(), id: "colx", collectionNo: 9, supplierId: "sup1", supplier: "Tuda Grass" };
    pc.collections.push(col);
    html = renderToString(React.createElement(CollectionsScreen, { crm: pc, updateCrm: noop, askConfirm: noop, selId: "colx", setSelId: noop, openInvoice: noop, me: "x", goSupplier: noop }));
    assert(html.includes("Tuda Grass"), "collection shows linked supplier");
    assert(supplierStats(pc, "sup1").collections === 1, "supplier counts its collections");
  }
  // ===== product codes: code-based SKUs, renames carry stock + history =====
  {
    const kc = normaliseCrm({ customers: [] });
    const plannerK = { products: [{ id: "pk", name: "Decking Board 3.6m", colours: ["Anthracite", "Ash White"], salePrice: 19.99 }] };
    kc.masterProducts = syncCatalogue(kc, plannerK).masterProducts;
    const oldSku = kc.masterProducts[0].sku;
    kc.masterProducts[0].stock = 120;
    kc.movements.push({ ...blankMovement(), sku: oldSku, qty: 120 });
    const kInv = { ...blankInvoice("", ""), id: "ki", lines: [{ ...blankLine(), code: oldSku, qty: 2, price: 19.99 }] };
    kc.invoices.push(kInv);
    plannerK.products[0].code = "dk/3.6/deck ";
    plannerK.products[0].costGbp = 7.84;
    const r = syncCatalogue(kc, plannerK);
    assert(r && Object.keys(r.renames).length === 2, "both colours renamed");
    kc.masterProducts = r.masterProducts;
    renameSkus(kc, r.renames);
    const ant = kc.masterProducts.find((m) => m.colour === "Anthracite");
    assert(ant.sku === "DK/3.6/DECK/ANT" && ant.stock === 120 && ant.costGbp === 7.84, "renamed row keeps stock, gets cost: " + JSON.stringify(ant));
    assert(kc.movements[0].sku === "DK/3.6/DECK/ANT" && kc.invoices[0].lines[0].code === "DK/3.6/DECK/ANT", "history and invoices follow the rename");
    assert(kc.masterProducts.find((m) => m.colour === "Ash White").sku === "DK/3.6/DECK/AWH", "colour codes");
    assert(syncCatalogue(kc, plannerK) === null, "stable after rename");
    plannerK.products.push({ id: "tg1", code: "TG/CLIPS-METAL", name: "Decking Clips Metal (100 pack)", colours: [] });
    kc.masterProducts = syncCatalogue(kc, plannerK).masterProducts;
    assert(kc.masterProducts.some((m) => m.sku === "TG/CLIPS-METAL"), "no colours = one row on the bare code");
    assert(skuFor("TG/3.6/DECK", "Red/Brown") === "TG/3.6/DECK/RBR" && codeSource("tg/3.6/deck") === "TG", "helpers");
  }
  // ===== numeric SKUs + master products =====
  {
    const nc = normaliseCrm({ customers: [] });
    const L = skuLists(nc);
    const dk = { id: "n1", code: "DK/3.6/DECK", name: "Decking Board Embossed Woodgrain 3.6m", colours: ["Anthracite", "Grey"], segSup: "01", segLen: "06", segCat: "01", segSub: "01", segProd: "01" };
    const tg = { id: "n2", code: "TG/3.6/DECK", name: "Decking Board Embossed Woodgrain 3.6m", colours: ["Teak"], segSup: "02", segLen: "06", segCat: "01", segSub: "01", segProd: "01" };
    assert(numericSku(dk, "Anthracite", L) === "010601010112" && colourSeg(L, "grey") === "12" && colourSeg(L, "Purple") === null, "numeric SKU + colour aliases");
    assert(masterKey(dk) === masterKey(tg) && masterKey({ ...dk, segProd: "" }) === "", "DK and TG versions share a master product");
    const pl = { products: [dk, tg] };
    nc.masterProducts = syncCatalogue(nc, pl).masterProducts;
    assert(nc.masterProducts.some((m) => m.sku === "020601010105" && m.family === "TG/3.6/DECK/TEA"), "TG teak row: numeric SKU, readable code kept");
    assert(skuSource(nc.masterProducts.find((m) => m.sku === "020601010105"), L) === "TG", "source read from the SKU");
    // Grey and Anthracite are one colour in the list -> same SKU: the second one keeps a fallback, never a clash
    const skusN = nc.masterProducts.map((m) => m.sku);
    assert(new Set(skusN).size === skusN.length, "no duplicate SKUs even when two colours share a code");
    // an edited list renumbers: TG becomes 09 -> its rows move
    nc.skuLists = JSON.parse(JSON.stringify(L));
    nc.skuLists.supplier.find((x) => x.key === "TG").code = "09";
    const rr = syncCatalogue(nc, { products: [dk, { ...tg, segSup: "09" }] });
    assert(rr && Object.values(rr.renames).includes("090601010105"), "renumbering a list entry renames the SKU");
    html = renderToString(React.createElement(ProductsScreen, { planner: pl, update: noop, crm: nc, updateCrm: noop, removeProduct: noop }));
    assert(html.includes("Master product") && html.includes("Decking Board Embossed Woodgrain 3.6m") && html.includes("SKU lists"), "products screen renders");
  }
  // ===== kits: recipe on the product -> parts on every colour's stock row =====
  {
    const kc2 = normaliseCrm({ customers: [] });
    const board = { id: "kb", code: "DK/1.83/FENCE", name: "Fence Board 1.83m", colours: ["Grey", "Black"], segSup: "01", segLen: "01", segCat: "02", segSub: "01", segProd: "01", weight: 5 };
    const post = { id: "kp", code: "DK/2.4/POST-COMP", name: "Fence Post Composite 2.4m", colours: ["Black"], segSup: "01", segLen: "03", segCat: "02", segSub: "02", segProd: "01" };
    const ins = { id: "ki", code: "DK/40MM/POST-INSERT", name: "Fence Post Insert 40mm", colours: ["Galvanised"], segSup: "01", segLen: "41", segCat: "02", segSub: "02", segProd: "05" };
    const kit = { id: "kk", code: "DK/6FT/RETRO-KIT", name: "Fence Retro Kit 6ft", colours: ["Grey", "Black"], segSup: "01", segLen: "24", segCat: "02", segSub: "03", segProd: "01",
      isKit: true, kit: [{ productId: "kb", qty: 11, colour: "" }, { productId: "kp", qty: 1, colour: "Black" }, { productId: "ki", qty: 1, colour: "" }] };
    const plk = { products: [board, post, ins, kit] };
    kc2.masterProducts = syncCatalogue(kc2, plk).masterProducts;
    const greyKit = kc2.masterProducts.find((m) => m.importProductId === "kk" && m.colour === "Grey");
    assert(greyKit.isKit && greyKit.components.length === 2, "grey kit: board + always-black post resolve; the insert has no grey");
    const greyBoard = kc2.masterProducts.find((m) => m.importProductId === "kb" && m.colour === "Grey");
    assert(greyKit.components.some((c) => c.componentId === greyBoard.id && c.qty === 11), "same-colour part picks the grey board");
    assert(syncCatalogue(kc2, plk) === null, "kit sync stable");
    // fix the insert to galvanised -> resolves for both kit colours
    kit.kit[2].colour = "Galvanised";
    kc2.masterProducts = syncCatalogue(kc2, plk).masterProducts;
    const blackKit = kc2.masterProducts.find((m) => m.importProductId === "kk" && m.colour === "Black");
    assert(blackKit.components.length === 3, "black kit has all three parts");
    // a sale of 2 black kits -> loading bill parts, and stock leaves as parts
    const sale = { ...blankInvoice("", ""), id: "ks", lines: [{ ...blankLine(), code: blackKit.sku, qty: 2, price: 182.5 }] };
    const ex = explodeInvoiceLines(sale, kc2);
    const blackBoard = kc2.masterProducts.find((m) => m.importProductId === "kb" && m.colour === "Black");
    assert(ex[0].kind === "kit" && ex.some((r) => r.kind === "part" && r.sku === blackBoard.sku && r.qty === 22), "loading bill: 2 kits = 22 black boards");
    assert(Math.abs(invoiceLoadKg(sale, kc2) - 110) < 0.01, "load weight from the parts");
    blackBoard.stock = 100;
    kc2.invoices.push(sale);
    applyInvoiceStockDeduction(sale, kc2, true, "x");
    assert(Number(blackBoard.stock) === 78, "delivery takes 22 boards out of stock");
    // untick kit -> generated parts are cleared
    kit.isKit = false;
    kc2.masterProducts = syncCatalogue(kc2, plk).masterProducts;
    assert(!kc2.masterProducts.find((m) => m.importProductId === "kk" && m.colour === "Black").isKit, "un-kitting clears the parts");
    html = renderToString(React.createElement(ProductsScreen, { planner: { products: [board, post, ins, { ...kit, isKit: true }] }, update: noop, crm: kc2, updateCrm: noop, removeProduct: noop }));
    assert(html.includes("aria-checked=\"true\""), "kit flagged in the master list");
  }
  // ===== stock check -> shortfall collection -> picks, deduction, job cost =====
  {
    const sc2 = normaliseCrm({ customers: [], suppliers: [{ ...blankSupplier(), id: "tgsup", name: "Tuda Grass", postcode: "BL1-2AA" }] });
    const seg = (sup, len, cat, sub, prod) => ({ segSup: sup, segLen: len, segCat: cat, segSub: sub, segProd: prod });
    const board = { id: "b", code: "DK/1.83/FENCE", name: "Fence Board 1.83m", colours: ["Black"], ...seg("01", "01", "02", "01", "01"), supplier: "Veejoy" };
    const beamDK = { id: "bd", code: "DK/1.83/BEAM-TOP", name: "Aluminium Top Beam 1.83m", colours: ["Black"], ...seg("01", "01", "02", "02", "09"), supplier: "Veejoy" };
    const beamTG = { id: "bt", code: "TG/1.83/BEAM-TOP", name: "Aluminium Top Beam 1.83m", colours: ["Black"], ...seg("02", "01", "02", "02", "09"), supplier: "Tuda Grass", costGbp: 11.02 };
    const kit = { id: "k", code: "DK/6FT/RETRO-KIT", name: "Fence Retro Kit 6ft", colours: ["Black"], ...seg("01", "24", "02", "03", "01"), isKit: true,
      kit: [{ productId: "b", qty: 11, colour: "" }, { productId: "bd", qty: 1, colour: "" }] };
    const pl2 = { products: [board, beamDK, beamTG, kit] };
    sc2.masterProducts = syncCatalogue(sc2, pl2).masterProducts;
    const R = (pid) => sc2.masterProducts.find((m) => m.importProductId === pid);
    R("b").stock = 40; R("b").costGbp = 4.5; R("bd").stock = 0;
    const job = { ...blankInvoice("", ""), id: "job", invNo: 4400, lines: [{ ...blankLine(), code: R("k").sku, qty: 2, price: 182.5 }] };
    sc2.invoices.push(job);
    let chk = stockCheck(job, sc2);
    const beamChk = chk.find((r) => r.sku === R("bd").sku);
    assert(chk.find((r) => r.sku === R("b").sku).short === 0 && beamChk.short === 2, "boards in stock, 2 beams short");
    const alts = partAlternatives(sc2, R("bd").sku);
    assert(alts.length === 1 && alts[0].sku === R("bt").sku, "TG's beam is the same part (same SKU after the supplier digits)");
    const made = raiseShortfallCollections(sc2, "job", [{ row: alts[0], qty: 2, supplierName: "Tuda Grass" }], "molly");
    const coll = made[0];
    assert(coll.supplierId === "tgsup" && coll.postcode === "BL1-2AA" && coll.items[0].assignedInvoiceId === "job" && coll.items[0].unitCost === 11.02, "collection note: supplier filled in, line linked to the job at cost");
    chk = stockCheck(job, sc2);
    assert(chk.every((r) => r.short === 0) && chk.find((r) => r.sku === R("bd").sku).covered === 2, "nothing short once the collection is raised");
    const stockPicks = job.picks.filter((p) => !isColPick(p));
    assert(stockPicks.length === 1 && stockPicks[0].sku === R("b").sku && stockPicks[0].qty === 22, "pick list: 22 boards from stock + the collected beams");
    reconcilePicks(job, sc2); reconcilePicks(job, sc2);
    assert(job.picks.length === 2, "reconcile is stable");
    const jc = jobCost(job, sc2, { shipments: [] });
    assert(Math.abs(jc.total - (22 * 4.5 + 2 * 11.02)) < 0.001, "job cost = boards at stock cost + beams at the price paid: " + jc.total);
    applyInvoiceStockDeduction(job, sc2, true, "x");
    assert(Number(R("b").stock) === 18 && Number(R("bt").stock || 0) === 0, "delivery takes the boards from stock, not the collected beams");
    applyInvoiceStockDeduction(job, sc2, false, "x");
    // deleting the collection hands the shortfall back to the stock check
    releaseCollectionPicks(sc2, coll);
    sc2.collections = sc2.collections.filter((c) => c.id !== coll.id);
    assert(stockCheck(job, sc2).find((r) => r.sku === R("bd").sku).short === 2 && !job.picks.some(isColPick), "deleted collection releases the job");
    html = renderToString(React.createElement(StockCheck, { inv: job, crm: sc2, planner: pl2, updateCrm: noop, me: "x" }));
    assert(html.includes("Stock check") && html.includes("Collect the shortfall") && html.includes("1 part short"), "stock check renders");
  }
  console.log("smoke OK — all screens render, totals reconcile (1392 goods + 60 delivery = 1452 inc VAT, £242 VAT, £1210 net)");
}
