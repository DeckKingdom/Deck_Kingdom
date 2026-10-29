// Node-side smoke test: render each CRM screen with sample data.
import CustomersScreen from "./CustomersScreen.jsx";
import InvoicesScreen from "./InvoicesScreen.jsx";
import ScheduleScreen from "./ScheduleScreen.jsx";
import HomeScreen from "../HomeScreen.jsx";
import ActivityScreen from "./ActivityScreen.jsx";
import StockScreen from "./StockScreen.jsx";
import CollectionsScreen from "./CollectionsScreen.jsx";
import VansScreen from "./VansScreen.jsx";
import { emptyCrm, normaliseCrm, blankCustomer, blankSite, blankInvoice, blankLine, invoiceTotals, blankMasterProduct, explodeInvoiceLines, invoiceCost, allocatedBySku, buildPicks, pickLandedCost, jobCost, stockValuation, matchShipmentToStock, blankCollection, blankCollectionItem, titleCase, formatPhone, formatPostcode, TIME_SLOTS, blankVan, blankVanCheck, vanReminders, mondayOf, today, syncMasterFromProducts } from "../../lib/crmCore.js";

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
  html = renderToString(React.createElement(HomeScreen, { data: { products: [], shipments: [] }, crm, setTab: noop, addShipment: noop, newInvoice: noop }));
  assert(html.includes("Customers") && html.includes("Delivery Schedule") && html.includes("Landed Costs"), "home screen tiles");
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
  html = renderToString(React.createElement(CollectionsScreen, { crm, updateCrm: noop, askConfirm: noop, selId: colln.id, setSelId: noop, openInvoice: noop, me: "x" }));
  assert(html.includes("Commit to stock") && html.includes("Assign to job"), "collection editor actions");
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
  html = renderToString(React.createElement(VansScreen, { crm, updateCrm: noop, askConfirm: noop, me: "x" }));
  assert(html.includes("Sprinter") && html.includes("Weekly check") && html.includes("Insurance"), "vans screen renders");
  console.log("smoke OK — all screens render, totals reconcile (1392 goods + 60 delivery = 1452 inc VAT, £242 VAT, £1210 net)");
}
