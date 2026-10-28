// Node-side smoke test: render each CRM screen with sample data.
import CustomersScreen from "./CustomersScreen.jsx";
import InvoicesScreen from "./InvoicesScreen.jsx";
import ScheduleScreen from "./ScheduleScreen.jsx";
import HomeScreen from "../HomeScreen.jsx";
import ActivityScreen from "./ActivityScreen.jsx";
import MasterProductsScreen from "./MasterProductsScreen.jsx";
import { emptyCrm, normaliseCrm, blankCustomer, blankSite, blankInvoice, blankLine, invoiceTotals, blankMasterProduct, explodeInvoiceLines, invoiceCost, allocatedBySku } from "../../lib/crmCore.js";

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

  const noop = () => {};
  const props = { crm, updateCrm: noop, askConfirm: noop, me: "jon@deckkingdom.co.uk", openInvoice: noop, newInvoiceFor: noop, goCustomer: noop };

  let html = renderToString(React.createElement(CustomersScreen, { ...props, selId: null, setSelId: noop }));
  assert(html.includes("New customer") && html.includes("Bob"), "customers list");
  html = renderToString(React.createElement(CustomersScreen, { ...props, selId: cust.id, setSelId: noop }));
  ["Account #","2670","Site #","10710","rear car park","1,452.00"].forEach((s)=>{ if(!html.includes(s)) console.error("missing:", s); }); assert(["Account #","2670","Site #","10710","rear car park","1,452.00"].every((s)=>html.includes(s)), "account view");
  html = renderToString(React.createElement(InvoicesScreen, { ...props, selId: null, setSelId: noop }));
  assert(html.includes("4228") && html.includes("Paid"), "invoice list");
  html = renderToString(React.createElement(InvoicesScreen, { ...props, selId: inv.id, setSelId: noop }));
  assert(html.includes("£1,452.00") && html.includes("£242.00") && html.includes("£1,210.00") && html.includes("Delivered"), "invoice entry totals");
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
  html = renderToString(React.createElement(MasterProductsScreen, { crm, updateCrm: noop, askConfirm: noop }));
  assert(html.includes("KIT/FENCE/TK") && html.includes("Allocated") && html.includes("KIT"), "master products table");
  console.log("smoke OK — all screens render, totals reconcile (1392 goods + 60 delivery = 1452 inc VAT, £242 VAT, £1210 net)");
}
