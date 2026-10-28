// Node-side smoke test: render each CRM screen with sample data.
import CustomersScreen from "./CustomersScreen.jsx";
import InvoicesScreen from "./InvoicesScreen.jsx";
import ScheduleScreen from "./ScheduleScreen.jsx";
import HomeScreen from "../HomeScreen.jsx";
import { emptyCrm, normaliseCrm, blankCustomer, blankSite, blankInvoice, blankLine, invoiceTotals } from "../../lib/crmCore.js";

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
  console.log("smoke OK — all screens render, totals reconcile (1392 goods + 60 delivery = 1452 inc VAT, £242 VAT, £1210 net)");
}
