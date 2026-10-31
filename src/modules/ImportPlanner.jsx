import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { storage, storageMode } from "../data/storage.js";
import { signOut, getSessionEmail } from "../data/auth.js";
import {
  NAVY,
  GOLD,
  RED,
  uid,
  seedProducts,
  newShipment,
  addMonths,
  addDays,
  hashPin,
  daysBetween,
  prettyDate,
  prettyDateTime,
  STATUSES,
  STATUS_COLOURS,
  stageTint,
  snapPallets,
  stepPallets,
  money,
  int,
} from "../lib/core.js";
import { blankInvoice, blankQuote, blankSample, blankSampleItem, nextNumber, TRADE_COUNTER, vanReminders, syncCatalogue, renameSkus, syncOpenPicks, colourTidyPlan, syncSampleConversions, cleanCode, codeSource, PRODUCT_SOURCES, dueScheduledFor, setTaskDone, describeSchedule, today as todayStr, newPurchaseFor } from "../lib/crmCore.js";
import { useCrm } from "./crm/useCrm.js";
import CustomersScreen from "./crm/CustomersScreen.jsx";
import InvoicesScreen from "./crm/InvoicesScreen.jsx";
import QuotesScreen from "./crm/QuotesScreen.jsx";
import SamplesScreen from "./crm/SamplesScreen.jsx";
import TasksScreen from "./crm/TasksScreen.jsx";
import ProductsScreen from "./crm/ProductsScreen.jsx";
import PurchasesScreen from "./crm/PurchasesScreen.jsx";
import SuppliersScreen from "./crm/SuppliersScreen.jsx";
import { quotesAvailable, samplesAvailable, tasksAvailable, purchasesAvailable } from "../data/crmStorage.js";
import ScheduleScreen from "./crm/ScheduleScreen.jsx";
import Sidebar, { TAB_LABELS } from "./Sidebar.jsx";
import HomeScreen from "./HomeScreen.jsx";
import ActivityScreen from "./crm/ActivityScreen.jsx";
import StockScreen from "./crm/StockScreen.jsx";
import CollectionsScreen from "./crm/CollectionsScreen.jsx";
import VansScreen from "./crm/VansScreen.jsx";
import { Icon } from "./crm/ui.jsx";
import { EmailSettings } from "./crm/EmailPanels.jsx";
import { emailReady } from "../data/email.js";

const CRM_TABS = ["customers", "samples", "quotes", "invoices", "schedule"];

export default function ImportPlanner() {
  const [data, setData] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [tab, setTab] = useState("home");
  const [sideOpen, setSideOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= 950));
  const [saveState, setSaveState] = useState("");
  const [pop, setPop] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [copyPanel, setCopyPanel] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmBox, setConfirmBox] = useState(null);
  const [pinHash, setPinHash] = useState(null);
  const [locked, setLocked] = useState(false);
  const [pinEntry, setPinEntry] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinPanel, setPinPanel] = useState(false);
  const [emailSettings, setEmailSettings] = useState(false);
  const [pinCurrent, setPinCurrent] = useState("");
  const [pinNew, setPinNew] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const saveTimer = useRef(null);
  const loaded = useRef(false);
  const dirty = useRef(false);
  const restoreInput = useRef(null);
  const headerRef = useRef(null);
  const [headerH, setHeaderH] = useState(66);

  useEffect(() => {
    const measure = () => {
      if (headerRef.current) setHeaderH(headerRef.current.offsetHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });

  const loadData = async () => {
    setLoadError(false);
    try {
      const rp = await storage.get("dk-import-planner-pin");
      if (rp && rp.value) {
        setPinHash(rp.value);
        setLocked(true);
      }
    } catch (e) {}
    let d = null;
    try {
      const r = await storage.get("dk-import-planner");
      if (r && r.value) d = JSON.parse(r.value);
    } catch (e) {
      const msg = String(e && e.message ? e.message : e).toLowerCase();
      const isEmpty = msg.includes("not found") || msg.includes("no such") || msg.includes("404");
      if (!isEmpty) {
        setLoadError(true);
        return;
      }
    }
    if (!d) {
      d = { products: seedProducts, shipments: [newShipment("Shipment 1")] };
    }
      d.products.forEach((p) => {
        if (p.weight === undefined) p.weight = 0;
        if (p.supplier === undefined) p.supplier = "";
        if (p.category === undefined) p.category = "";
        if (p.cbm === undefined) p.cbm = 0;
        if (p.salePrice === undefined) p.salePrice = "";
      });
      d.shipments.forEach((s) => {
        if (s.orderDate === undefined) s.orderDate = s.created || new Date().toISOString().slice(0, 10);
        if (s.supplier === undefined) s.supplier = "";
        if (s.depositDate === undefined) s.depositDate = "";
        if (s.balancePaidDate === undefined) s.balancePaidDate = "";
        if (s.surchargeOn === undefined) s.surchargeOn = true;
        if (s.arrivedDate === undefined) s.arrivedDate = "";
        if (s.valueUsd === undefined) s.valueUsd = "";
        if (s.fxRate === undefined) s.fxRate = "";
        if (s.shippingGbp === undefined) s.shippingGbp = "";
        if (s.dutyGbp === undefined) s.dutyGbp = "";
        if (s.dutyOn === undefined) s.dutyOn = true;
        if (s.invoiceNo === undefined) s.invoiceNo = "";
        if (s.postedToStock === undefined) s.postedToStock = "";
        ["depositUsd", "depositFx", "balanceUsd", "balanceFx"].forEach((f) => {
          if (s[f] === undefined) s[f] = "";
        });
        s.lines.forEach((l) => {
          if (l.weight === undefined) {
            const p = d.products.find((x) => x.id === l.productId);
            l.weight = p ? p.weight : 0;
          }
        })
      });
      setData(d);
      setActiveId(d.shipments[0] ? d.shipments[0].id : null);
      loaded.current = true;
  };

  useEffect(() => {
    setPop(null);
  }, [tab]);

  useEffect(() => {
    loadData();
  }, []);

  // ===== CRM module (customers / invoices / schedule) =====
  const [crmOn, setCrmOn] = useState(false);
  const { crm, updateCrm, replaceCrm, crmError, loadCrm, crmSave } = useCrm(crmOn);
  const [selCustomerId, setSelCustomerId] = useState(null);
  const [selInvoiceId, setSelInvoiceId] = useState(null);
  const [selCollectionId, setSelCollectionId] = useState(null);
  const [selQuoteId, setSelQuoteId] = useState(null);
  const [quoteFilter, setQuoteFilter] = useState(null); // { customerId }
  const [selSampleId, setSelSampleId] = useState(null);
  const [newCustSignal, setNewCustSignal] = useState(0);
  const [prodFilter, setProdFilter] = useState({ src: "", q: "" }); // Products screen: source + search
  const [selPurchaseId, setSelPurchaseId] = useState(null);
  const [purchaseFilter, setPurchaseFilter] = useState(null); // { supplierId }
  const [selSupplierId, setSelSupplierId] = useState(null);
  const [newSupplierSignal, setNewSupplierSignal] = useState(0);
  // menu and header buttons always land on the list, never on the last record that was open
  const navTo = (t) => {
    setSelCustomerId(null); setSelInvoiceId(null); setSelCollectionId(null); setSelQuoteId(null);
    setSelSampleId(null); setSelPurchaseId(null); setSelSupplierId(null);
    setQuoteFilter(null); setPurchaseFilter(null); setInvFilter(null);
    setTab(t);
  };
  const openPurchase = (id) => {
    setSelPurchaseId(id);
    setTab("purchases");
  };
  const goSupplier = (id) => {
    setSelSupplierId(id);
    setTab("suppliers");
  };
  const newPurchase = (supplierId) => {
    if (!crm) return;
    if (!purchasesAvailable()) {
      setSelPurchaseId(null);
      setTab("purchases");
      return;
    }
    const id = Math.random().toString(36).slice(2, 10);
    updateCrm((c) => {
      newPurchaseFor(c, supplierId || "", me, id);
      return c;
    });
    setSelPurchaseId(id);
    setTab("purchases");
  };
  // "+" buttons in the side menu
  const sideNew = (t) => {
    if (t === "customers") {
      setSelCustomerId(null);
      setNewCustSignal((n) => n + 1);
      setTab("customers");
      return;
    }
    if (!crm) {
      setTab(t); // still loading: just go there
      return;
    }
    if (t === "suppliers") {
      setSelSupplierId(null);
      setNewSupplierSignal((n) => n + 1);
      setTab("suppliers");
      return;
    }
    if (t === "purchases") newPurchase("");
    else if (t === "invoices") newInvoiceFor("", "");
    else if (t === "quotes") newQuoteFor("", "");
    else if (t === "samples") newSampleFor("");
  };
  const [invFilter, setInvFilter] = useState(null); // { customerId, outstanding }
  const [remindersClosed, setRemindersClosed] = useState(false); // closed for this visit

  useEffect(() => {
    if (CRM_TABS.includes(tab) || ["home", "tasks", "purchases", "suppliers", "activity", "stock", "collections", "vans", "products"].includes(tab)) setCrmOn(true);
  }, [tab]);

  const me = storageMode === "supabase" ? getSessionEmail() || "" : "";

  const openInvoice = (id) => {
    setSelInvoiceId(id);
    setTab("invoices");
  };
  const openSample = (id) => {
    setSelSampleId(id);
    setTab("samples");
  };
  const newSampleFor = (customerId) => {
    if (!crm) return;
    if (!samplesAvailable()) {
      setSelSampleId(null);
      setTab("samples"); // shows the "run the SQL" notice
      return;
    }
    const n = blankSample(customerId);
    n.sampleNo = nextNumber(crm.samples || [], "sampleNo", crm.numbering.sample);
    n.raisedBy = me;
    n.items = [blankSampleItem()];
    updateCrm((c) => {
      c.samples.unshift(n);
      c.numbering.sample = (Number(n.sampleNo) || 0) + 1;
      return c;
    });
    setSelSampleId(n.id);
    setTab("samples");
  };
  const openQuote = (id) => {
    setSelQuoteId(id);
    setTab("quotes");
  };
  const newQuoteFor = (customerId, siteId) => {
    if (!crm) return;
    if (!quotesAvailable()) {
      setSelQuoteId(null);
      setTab("quotes"); // shows the "run the SQL" notice
      return;
    }
    const n = blankQuote(customerId, siteId);
    n.quoteNo = nextNumber(crm.quotes || [], "quoteNo", crm.numbering.quote);
    n.raisedBy = me;
    const cust = customerId && crm.customers.find((c) => c.id === customerId);
    if (cust && cust.discountPct !== "" && cust.discountPct !== null) n.discountPct = cust.discountPct;
    updateCrm((c) => {
      c.quotes.unshift(n);
      c.numbering.quote = (Number(n.quoteNo) || 0) + 1;
      return c;
    });
    setSelQuoteId(n.id);
    setTab("quotes");
  };
  const goCustomer = (id) => {
    setSelCustomerId(id);
    setTab("customers");
  };
  const openCollection = (id) => {
    setSelCollectionId(id);
    setTab("collections");
  };
  // product colours follow the colour list's names (Anthracite -> Grey, Charcoal -> Black);
  // the stock rows are renamed in the same step so stock stays with them
  useEffect(() => {
    if (!crm || !data) return;
    const plan = colourTidyPlan(crm, data);
    if (!plan) return;
    update((d) => {
      d.products.forEach((p) => {
        const rn = plan.renames[p.id] || {}, dr = plan.drops[p.id] || [];
        if (!Object.keys(rn).length && !dr.length) return;
        p.colours = (p.colours || []).filter((c) => !dr.includes(c)).map((c) => rn[c] || c).sort((a, b) => a.localeCompare(b));
      });
      return d;
    });
    updateCrm((c) => {
      (c.masterProducts || []).forEach((m) => {
        const rn = plan.renames[m.importProductId];
        if (rn && rn[m.colour]) m.colour = rn[m.colour];
      });
      return c;
    });
  }, [crm, data]);

  // keep the background stock/SKU rows in step with the Products screen
  useEffect(() => {
    if (!crm || !data) return;
    const synced = syncCatalogue(crm, data);
    if (synced)
      updateCrm((c) => {
        c.masterProducts = synced.masterProducts;
        renameSkus(c, synced.renames); // stock history, invoices, quotes, picks follow a re-coded product
        return c;
      });
  }, [crm, data]);

  // open jobs' pick lists follow their lines and kit recipes, so the loading
  // bill always has every part (nobody has to press "rebuild")
  useEffect(() => {
    if (!crm) return;
    const picks = syncOpenPicks(crm);
    if (picks)
      updateCrm((c) => {
        c.invoices.forEach((i) => { if (picks[i.id]) i.picks = picks[i.id]; });
        return c;
      });
  }, [crm]);

  // credit each sample request with the order it led to (stored on the sample)
  useEffect(() => {
    if (!crm) return;
    const synced = syncSampleConversions(crm);
    if (synced)
      updateCrm((c) => {
        c.samples = synced;
        return c;
      });
  }, [crm]);

  // scheduled rota tasks due for the logged-in person pop up once per visit;
  // "Not today" hides them until tomorrow on this device
  const [taskPopClosed, setTaskPopClosed] = useState(false);
  const snoozeKey = "dk-task-snooze:" + (me || "").toLowerCase();
  const taskSnoozedToday = (() => {
    try {
      return window.localStorage.getItem(snoozeKey) === todayStr();
    } catch (e) {
      return false;
    }
  })();
  const dueTasks = crm && me && tasksAvailable() ? dueScheduledFor(crm, me, todayStr()) : [];
  const snoozeTasks = () => {
    try {
      window.localStorage.setItem(snoozeKey, todayStr());
    } catch (e) {}
    setTaskPopClosed(true);
  };

  const dueReminders = crm ? vanReminders(crm) : [];
  const snoozeReminders = () => {
    const tod = new Date().toISOString().slice(0, 10);
    updateCrm((c) => {
      c.reminders = c.reminders || {};
      dueReminders.forEach((r) => (c.reminders[r.key] = tod));
      return c;
    });
    setRemindersClosed(true);
  };

  const showOutstanding = (customerId) => {
    setInvFilter({ customerId, outstanding: true });
    setSelInvoiceId(null);
    setTab("invoices");
  };
  const newInvoiceFor = (customerId, siteId) => {
    if (!crm) return;
    const n = blankInvoice(customerId, siteId);
    n.invNo = nextNumber(crm.invoices, "invNo", crm.numbering.invoice);
    n.raisedBy = me;
    if (siteId === TRADE_COUNTER) n.jobType = "Customer Collection";
    const cust = customerId && crm.customers.find((c) => c.id === customerId);
    if (cust && cust.discountPct !== "" && cust.discountPct !== null) n.discountPct = cust.discountPct;
    updateCrm((c) => {
      c.invoices.unshift(n);
      c.numbering.invoice = (Number(n.invNo) || 0) + 1;
      return c;
    });
    setSelInvoiceId(n.id);
    setTab("invoices");
  };

  useEffect(() => {
    if (!loaded.current || !data || !dirty.current) return;
    setSaveState("Saving…");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await storage.set("dk-import-planner", JSON.stringify(data));
        setSaveState("Saved");
      } catch (e) {
        setSaveState("Save failed — will retry on next change");
      }
    }, 600);
  }, [data]);

  if (loadError)
    return (
      <div style={{ fontFamily: "Quicksand, sans-serif", padding: 40, textAlign: "center", color: NAVY }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap');`}</style>
        <p style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>Couldn't load your saved data</p>
        <p style={{ fontSize: 14, color: "#5a6a85", marginBottom: 16 }}>
          Nothing has been changed or overwritten. This is usually temporary — try again.
        </p>
        <button
          onClick={loadData}
          style={{ fontFamily: "inherit", fontSize: 14, fontWeight: 600, padding: "9px 18px", borderRadius: 8, border: "1px solid " + GOLD, background: GOLD, color: NAVY, cursor: "pointer" }}
        >
          Retry
        </button>
      </div>
    );

  if (locked)
    return (
      <div style={{ fontFamily: "Quicksand, sans-serif", background: NAVY, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap');`}</style>
        <div style={{ textAlign: "center", width: "100%", maxWidth: 300 }}>
          <div style={{ width: 46, height: 46, borderRadius: 10, background: GOLD, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: NAVY, fontSize: 22, marginBottom: 12 }}>
            DK
          </div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 19 }}>Import planner</div>
          <div style={{ color: "#8fa0c0", fontSize: 13, fontWeight: 600, marginBottom: 18 }}>Enter your PIN to unlock</div>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pinEntry}
            onChange={(e) => setPinEntry(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
            onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
            style={{ fontFamily: "inherit", fontSize: 22, letterSpacing: 8, textAlign: "center", padding: "10px 12px", borderRadius: 9, border: "1px solid #33466b", background: "#122b52", color: "#fff", width: "100%", boxSizing: "border-box", marginBottom: 12 }}
          />
          <button
            onClick={tryUnlock}
            style={{ fontFamily: "inherit", fontSize: 15, fontWeight: 700, padding: "10px 0", borderRadius: 9, border: "1px solid " + GOLD, background: GOLD, color: NAVY, cursor: "pointer", width: "100%" }}
          >
            Unlock
          </button>
          {pinError && <div style={{ color: "#f2a6b1", fontSize: 13, fontWeight: 600, marginTop: 10 }}>{pinError}</div>}
          <div style={{ color: "#5a6a85", fontSize: 11.5, fontWeight: 600, marginTop: 16 }}>Forgotten it? Ask Claude in the chat to reset the PIN.</div>
        </div>
      </div>
    );

  if (!data)
    return (
      <div style={{ fontFamily: "Quicksand, sans-serif", padding: 40, textAlign: "center", color: NAVY }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap');`}</style>
        Loading planner…
      </div>
    );

  const active = data.shipments.find((s) => s.id === activeId) || data.shipments[0];

  const update = (fn) => {
    dirty.current = true;
    setData((d) => fn(JSON.parse(JSON.stringify(d))));
  };

  const updateShipment = (fn) =>
    update((d) => {
      const s = d.shipments.find((x) => x.id === active.id);
      if (s) fn(s, d);
      return d;
    });

  const nextShipmentName = () => {
    let max = 0;
    data.shipments.forEach((s) => {
      const m = s.name.match(/(\d+)\s*$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return "Shipment " + (max + 1);
  };

  const addShipment = () => {
    const n = newShipment(nextShipmentName());
    update((d) => {
      d.shipments.unshift(n);
      return d;
    });
    setActiveId(n.id);
    setTab("shipments");
  };

  const duplicateShipment = (sid) => {
    const src = data.shipments.find((x) => x.id === sid);
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = uid();
    copy.name = nextShipmentName();
    copy.status = "Planning";
    copy.created = new Date().toISOString().slice(0, 10);
    copy.orderDate = new Date().toISOString().slice(0, 10);
    copy.lines = copy.lines.map((l) => ({ ...l, id: uid() }));
    copy.depositDate = "";
    copy.balancePaidDate = "";
    copy.arrivedDate = "";
    copy.valueUsd = "";
    copy.fxRate = "";
    copy.shippingGbp = "";
    copy.dutyGbp = "";
    copy.invoiceNo = "";
    copy.depositUsd = "";
    copy.depositFx = "";
    copy.balanceUsd = "";
    copy.balanceFx = "";
    copy.postedToStock = "";
    update((d) => {
      d.shipments.unshift(copy);
      return d;
    });
    setActiveId(copy.id);
    setTab("shipments");
  };

  const deleteShipment = () => {
    if (!active) return;
    const sid = active.id;
    setConfirmBox({
      message: 'Delete "' + active.name + '"? This can\'t be undone.',
      confirmLabel: "Delete",
      danger: true,
      action: () => {
        update((d) => {
          d.shipments = d.shipments.filter((s) => s.id !== sid);
          return d;
        });
        const rest = data.shipments.filter((s) => s.id !== sid);
        setActiveId(rest[0] ? rest[0].id : null);
      },
    });
  };

  const addLine = () => {
    updateShipment((s) => {
      const pool = productsForSupplier((s.supplier || "").trim());
      const p = pool[0] || data.products[0];
      const last = s.lines.length ? s.lines[s.lines.length - 1] : null;
      const lastProd = last ? data.products.find((x) => x.id === last.productId) : null;
      const prod = lastProd && pool.some((x) => x.id === lastProd.id) ? lastProd : p;
      s.lines.push({
        id: uid(),
        productId: prod ? prod.id : "",
        colour: prod && prod.colours[0] ? prod.colours[0] : "",
        pallets: 1,
        qty: prod ? prod.qty : 0,
        cost: prod ? prod.cost : 0,
        weight: prod ? prod.weight : 0,
      });
    });
  };

  const setLine = (lineId, field, value) =>
    updateShipment((s) => {
      const l = s.lines.find((x) => x.id === lineId);
      if (!l) return;
      if (field === "productId") {
        l.productId = value;
        const p = data.products.find((x) => x.id === value);
        if (p) {
          l.qty = p.qty;
          l.cost = p.cost;
          l.weight = p.weight;
          if (!p.colours.includes(l.colour)) l.colour = p.colours[0] || "";
        }
      } else if (field === "pallets" || field === "qty" || field === "cost" || field === "weight") {
        l[field] = value === "" ? "" : Number(value);
      } else {
        l[field] = value;
      }
    });

  const removeLine = (lineId) =>
    updateShipment((s) => {
      s.lines = s.lines.filter((x) => x.id !== lineId);
    });

  const lineCalc = (l) => {
    const pallets = Number(l.pallets) || 0;
    const qty = Number(l.qty) || 0;
    const cost = Number(l.cost) || 0;
    const weight = Number(l.weight) || 0;
    const pieces = pallets * qty;
    return { pallets, pieces, total: pieces * cost, kg: pieces * weight };
  };

  const shipTotals = (s) =>
    (s ? s.lines : []).reduce(
      (a, l) => {
        const c = lineCalc(l);
        const p = data.products.find((x) => x.id === l.productId);
        const cbm = c.pallets * (p ? Number(p.cbm) || 0 : 0);
        return { pallets: a.pallets + c.pallets, pieces: a.pieces + c.pieces, cost: a.cost + c.total, kg: a.kg + c.kg, cbm: a.cbm + cbm };
      },
      { pallets: 0, pieces: 0, cost: 0, kg: 0, cbm: 0 }
    );

  const totals = shipTotals(active);

  const setShipmentField = (sid, field, value) =>
    update((d) => {
      const s = d.shipments.find((x) => x.id === sid);
      if (s) s[field] = value;
      return d;
    });

  const productName = (id) => {
    const p = data.products.find((x) => x.id === id);
    return p ? p.name : "";
  };

  const suppliers = [...new Set(data.products.map((p) => (p.supplier || "").trim()).filter(Boolean))].sort();

  const categories = [...new Set(data.products.map((p) => (p.category || "").trim()).filter(Boolean))].sort();

  const productsForSupplier = (supplier) =>
    supplier
      ? data.products.filter((p) => (p.supplier || "").trim() === supplier)
      : data.products.filter((p) => !cleanCode(p.code) || codeSource(p.code) === "DK"); // shipments are our own imports

  const lineOptions = (line, supplier) => {
    const opts = productsForSupplier(supplier);
    if (line.productId && !opts.some((p) => p.id === line.productId)) {
      const cur = data.products.find((p) => p.id === line.productId);
      if (cur) return [cur, ...opts];
    }
    return opts;
  };

  const orderRows = () => {
    const rows = [
      ["DECK KINGDOM LTD — SHIPMENT ORDER"],
      [],
      ["Shipment", active.name],
      ["Supplier", active.supplier || "—"],
      ["Supplier invoice no.", active.invoiceNo || "—"],
      ["Status", active.status],
      ["Date", new Date().toISOString().slice(0, 10)],
      [],
      ["Product", "Colour", "Pallets / Cartons", "Qty per Pallet / Carton", "Total pieces", "Weight per piece (kg)", "Line weight (kg)", "Cost per piece (USD)", "Line total (USD)"],
    ];
    active.lines.forEach((l) => {
      const c = lineCalc(l);
      rows.push([productName(l.productId), l.colour, c.pallets, Number(l.qty) || 0, c.pieces, Number(l.weight) || 0, Number(c.kg.toFixed(1)), Number(l.cost) || 0, Number(c.total.toFixed(2))]);
    });
    rows.push([]);
    rows.push(["TOTALS", "", totals.pallets, "", totals.pieces, "", Number(totals.kg.toFixed(1)), "", Number(totals.cost.toFixed(2))]);
    return rows;
  };

  const downloadXlsx = () => {
    const rows = orderRows();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 9 }, { wch: 14 }, { wch: 13 }, { wch: 19 }, { wch: 16 }, { wch: 20 }, { wch: 17 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Order");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = active.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-order.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportXlsx = () => {
    if (!active) return;
    const tsv = orderRows()
      .map((r) => r.join("\t"))
      .join("\n");
    setCopied(false);
    setCopyPanel({
      title: "Export order for factory",
      note: "Press Copy, then paste into cell A1 of a blank Excel or WPS sheet — it lands as a formatted order table ready to save and email. The download button may be blocked by your browser; if the screen goes blank after pressing it, just close and reopen the app — your data is safe.",
      text: tsv,
      download: true,
    });
  };

  const storePin = async (hash) => {
    try {
      await storage.set("dk-import-planner-pin", hash || "");
      setPinHash(hash || null);
      return true;
    } catch (e) {
      setPinError("Couldn't save the PIN — try again.");
      return false;
    }
  };

  const tryUnlock = async () => {
    const h = await hashPin(pinEntry);
    if (h === pinHash) {
      setLocked(false);
      setPinEntry("");
      setPinError("");
    } else {
      setPinError("Wrong PIN — try again.");
      setPinEntry("");
    }
  };

  const savePinChange = async () => {
    setPinError("");
    if (pinHash) {
      const cur = await hashPin(pinCurrent);
      if (cur !== pinHash) {
        setPinError("Current PIN is wrong.");
        return;
      }
    }
    if (!/^\d{4,8}$/.test(pinNew)) {
      setPinError("PIN must be 4-8 digits.");
      return;
    }
    if (pinNew !== pinConfirm) {
      setPinError("PINs don't match.");
      return;
    }
    const h = await hashPin(pinNew);
    if (await storePin(h)) {
      setPinPanel(false);
      setPinCurrent("");
      setPinNew("");
      setPinConfirm("");
    }
  };

  const removePin = async () => {
    setPinError("");
    const cur = await hashPin(pinCurrent);
    if (cur !== pinHash) {
      setPinError("Current PIN is wrong.");
      return;
    }
    if (await storePin(null)) {
      setPinPanel(false);
      setPinCurrent("");
      setPinNew("");
      setPinConfirm("");
    }
  };

  const backupJson = () => {
    setCopied(false);
    setCopyPanel({
      title: "Backup your data",
      note: "Copy this text and keep it somewhere safe — your notes, an email to yourself, or paste it into the Claude chat. To restore, save it as a .json file and use the Restore button (or paste it to Claude, who can turn it into a restore file for you)." + (crm ? " Includes the planner and the customer/invoice data." : " Open the Customers tab first if you also want customers and invoices included."),
      text: JSON.stringify(crm ? { ...data, crm } : data, null, 2),
      download: null,
    });
  };

  const copyPanelText = async () => {
    if (!copyPanel) return;
    try {
      await navigator.clipboard.writeText(copyPanel.text);
      setCopied(true);
    } catch (e) {
      const ta = document.getElementById("dk-copy-text");
      if (ta) {
        ta.focus();
        ta.select();
        try {
          document.execCommand("copy");
          setCopied(true);
        } catch (e2) {}
      }
    }
  };

  const restoreJson = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        const hasPlanner = d && Array.isArray(d.products) && Array.isArray(d.shipments);
        const hasCrm = d && d.crm && typeof d.crm === "object";
        if (!hasPlanner && !hasCrm) throw new Error("invalid");
        const parts = [];
        if (hasPlanner) parts.push(d.products.length + " products, " + d.shipments.length + " shipments");
        if (hasCrm) parts.push((d.crm.customers || []).length + " customers, " + (d.crm.invoices || []).length + " invoices");
        setConfirmBox({
          message: "Replace the current data with this backup? (" + parts.join(" · ") + ")",
          confirmLabel: "Restore",
          danger: false,
          action: () => {
            if (hasPlanner) {
              dirty.current = true;
              const { crm: _c, ...plannerOnly } = d;
              setData(plannerOnly);
              setActiveId(d.shipments[0] ? d.shipments[0].id : null);
            }
            if (hasCrm) {
              setCrmOn(true);
              replaceCrm(d.crm);
            }
          },
        });
      } catch (e) {
        setConfirmBox({ message: "That file doesn't look like a planner backup.", okOnly: true });
      }
    };
    reader.readAsText(file);
  };

  const addProduct = () =>
    update((d) => {
      const src = prodFilter.src;
      const sup = src ? (d.products.find((x) => codeSource(x.code) === src && x.supplier) || {}).supplier || "" : "";
      d.products.unshift({ id: uid(), code: src ? src + "/" : "", name: "", colours: [], qty: 0, cost: 0, weight: 0, cbm: 0, supplier: sup, category: "", salePrice: "", costGbp: "" });
      return d;
    });

  const setProduct = (pid, field, value) =>
    update((d) => {
      const p = d.products.find((x) => x.id === pid);
      if (!p) return d;
      if (field === "colours") p.colours = value.split(",").map((c) => c.trim()).filter(Boolean);
      else if (field === "qty" || field === "cost" || field === "weight" || field === "cbm" || field === "salePrice" || field === "costGbp") p[field] = value === "" ? "" : Number(value);
      else if (field === "code") p.code = cleanCode(value);
      else p[field] = value;
      return d;
    });

  const removeProduct = (pid) => {
    const doRemove = () =>
      update((d) => {
        d.products = d.products.filter((x) => x.id !== pid);
        return d;
      });
    const used = data.shipments.some((s) => s.lines.some((l) => l.productId === pid));
    if (used) {
      setConfirmBox({
        message: "This product is used on shipments. Remove it anyway?",
        confirmLabel: "Remove",
        danger: true,
        action: doRemove,
      });
    } else {
      doRemove();
    }
  };

  const footBtnStyle = (open) => ({
    display: "flex", alignItems: "center", gap: 9, width: "100%",
    justifyContent: open ? "flex-start" : "center", padding: open ? "8px 11px" : "8px 0",
    borderRadius: 8, border: "none", background: "transparent", color: "#8fa0c0",
    fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
  });

  const sideFooter = (open) => (
    <div>
      {storageMode === "supabase" && open && (
        <div style={{ color: "#5f729a", fontSize: 11, fontWeight: 700, padding: "0 11px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={getSessionEmail() || ""}>
          {getSessionEmail()}
        </div>
      )}
      <button onClick={backupJson} title="Copy or download all data as a backup" style={footBtnStyle(open)}>
        <Icon name="doc" size={15} stroke="#8fa0c0" />
        {open && "Backup"}
      </button>
      <button onClick={() => restoreInput.current && restoreInput.current.click()} title="Restore from a backup file" style={footBtnStyle(open)}>
        <Icon name="note" size={15} stroke="#8fa0c0" />
        {open && "Restore"}
      </button>
      {emailReady && (
        <button onClick={() => setEmailSettings(true)} title="Which mailbox each login sends email from" style={footBtnStyle(open)}>
          <Icon name="mail" size={15} stroke="#8fa0c0" />
          {open && "Email settings"}
        </button>
      )}
      {storageMode === "supabase" ? (
        <button onClick={() => signOut()} title="Sign out" style={footBtnStyle(open)}>
          <Icon name="logout" size={15} stroke="#8fa0c0" />
          {open && "Sign out"}
        </button>
      ) : pinHash ? (
        <>
          <button onClick={() => { setPinEntry(""); setPinError(""); setLocked(true); }} title="Lock the app now" style={footBtnStyle(open)}>
            <Icon name="lock" size={15} stroke="#8fa0c0" />
            {open && "Lock"}
          </button>
          <button onClick={() => { setPinError(""); setPinPanel(true); }} title="Change or remove the PIN" style={footBtnStyle(open)}>
            <Icon name="gear" size={15} stroke="#8fa0c0" />
            {open && "PIN"}
          </button>
        </>
      ) : (
        <button onClick={() => { setPinError(""); setPinPanel(true); }} title="Protect the app with a PIN" style={footBtnStyle(open)}>
          <Icon name="lock" size={15} stroke="#8fa0c0" />
          {open && "Set PIN"}
        </button>
      )}
    </div>
  );

  const inp = {
    fontFamily: "inherit",
    fontSize: 14,
    padding: "7px 9px",
    border: "1px solid #d5d9e0",
    borderRadius: 7,
    background: "#fff",
    color: NAVY,
    width: "100%",
    boxSizing: "border-box",
  };
  const num = { ...inp, textAlign: "right" };
  const btn = {
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 600,
    padding: "9px 14px",
    borderRadius: 8,
    border: "1px solid #d5d9e0",
    background: "#fff",
    color: NAVY,
    cursor: "pointer",
  };
  const th = {
    textAlign: "left",
    fontSize: 12.5,
    fontWeight: 600,
    color: "#5a6a85",
    padding: "10px 8px",
    borderBottom: "2px solid #e6e9ef",
    whiteSpace: "nowrap",
  };
  const td = { padding: "6px 8px", borderBottom: "1px solid #eef0f4", verticalAlign: "middle" };

  return (
    <div style={{ fontFamily: "Quicksand, sans-serif", background: "#f3f5f8", minHeight: "100vh", color: NAVY }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap');
        input:focus, select:focus { outline: 2px solid ${GOLD}; outline-offset: 0; }
        button:hover { filter: brightness(0.97); }
        input.dk-pallets::-webkit-outer-spin-button, input.dk-pallets::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input.dk-pallets { -moz-appearance: textfield; appearance: textfield; }
        .dk-sticky-table thead th { position: sticky; top: 0; background: #fff; z-index: 4; }
        @media print {
          .no-print, button { display: none !important; }
          body { background: #fff !important; }
          input, select { border-color: transparent !important; background: transparent !important; appearance: none; -webkit-appearance: none; }
          input[type="date"]::-webkit-calendar-picker-indicator { display: none; }
        }`}</style>

      <div style={{ display: "flex", alignItems: "stretch" }}>
      <Sidebar tab={tab} setTab={navTo} open={sideOpen} footer={sideFooter} onNew={sideNew} />
      <div style={{ flex: 1, minWidth: 0 }}>

      <div ref={headerRef} className="no-print" style={{ background: NAVY, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 25, boxShadow: "0 2px 8px rgba(11,31,63,0.25)" }}>
        <button onClick={() => setSideOpen((o) => !o)} title={sideOpen ? "Collapse the menu" : "Expand the menu"} style={{ background: "transparent", border: "1px solid #33466b", borderRadius: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none", padding: 0 }}>
          <Icon name={sideOpen ? "chevleft" : "menu"} size={17} stroke="#cfd6e4" />
        </button>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 15.5, whiteSpace: "nowrap" }}>{TAB_LABELS[tab] || "Home"}</span>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {[["home", "Home", "home"], ["overview", "Imports", "ship"], ["customers", "Customers", "users"], ["invoices", "Invoices", "doc"], ["quotes", "Quotes", "tag"], ["samples", "Samples", "leaf"], ["schedule", "Delivery Schedule", "cal"]].map(([t, label, icon]) => (
            <button key={t} onClick={() => navTo(t)} title={label} style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid " + (tab === t ? GOLD : "#33466b"), background: tab === t ? GOLD : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none", padding: 0 }}>
              <Icon name={icon} size={16} stroke={tab === t ? NAVY : "#cfd6e4"} />
            </button>
          ))}
        </div>
        <input
          ref={restoreInput}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            restoreJson(e.target.files && e.target.files[0]);
            e.target.value = "";
          }}
        />
        <span style={{ color: "#8fa0c0", fontSize: 12, minWidth: 48, textAlign: "right" }}>{CRM_TABS.includes(tab) ? crmSave : saveState}</span>
      </div>

      {tab === "home" && (
        <>
          {crmError && (
            <div style={{ maxWidth: 1140, margin: "14px auto 0", padding: "0 22px" }}>
              <div style={{ background: "#C8102E10", border: "1px solid #ecc4cb", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13, fontWeight: 600, color: "#8a0b20" }}>
                <span style={{ flex: 1 }}>
                  Couldn't load the customer/stock data — usually a migration hasn't been run in Supabase yet (latest: 012_vans.sql). Nothing is lost.
                </span>
                <button onClick={loadCrm} style={{ ...btn, padding: "6px 12px", fontSize: 12.5, background: GOLD, borderColor: GOLD }}>Retry</button>
              </div>
            </div>
          )}
          <HomeScreen data={data} crm={crm} updateCrm={updateCrm} me={me} askConfirm={setConfirmBox} setTab={setTab} addShipment={addShipment} newInvoice={() => (crm ? newInvoiceFor("", "") : setTab("invoices"))} />
        </>
      )}

      {(tab === "purchases" || tab === "suppliers") &&
        (!crm ? (
          <div style={{ padding: 40, textAlign: "center", color: "#5a6a85", fontWeight: 600 }}>Loading…</div>
        ) : tab === "purchases" ? (
          <PurchasesScreen crm={crm} updateCrm={updateCrm} askConfirm={setConfirmBox} selId={selPurchaseId} setSelId={setSelPurchaseId}
            me={me} goSupplier={goSupplier} filter={purchaseFilter} setFilter={setPurchaseFilter} />
        ) : (
          <SuppliersScreen crm={crm} updateCrm={updateCrm} askConfirm={setConfirmBox} selId={selSupplierId} setSelId={setSelSupplierId}
            me={me} openPurchase={openPurchase} newPurchase={newPurchase} openCollection={openCollection}
            newSignal={newSupplierSignal} onNewHandled={() => setNewSupplierSignal(0)} />
        ))}

      {tab === "tasks" &&
        (!crm ? (
          <div style={{ padding: 40, textAlign: "center", color: "#5a6a85", fontWeight: 600 }}>Loading tasks…</div>
        ) : (
          <TasksScreen crm={crm} updateCrm={updateCrm} askConfirm={setConfirmBox} me={me} goHome={() => setTab("home")} />
        ))}

      {emailSettings && <EmailSettings me={me} onClose={() => setEmailSettings(false)} />}
      {tab === "activity" && <ActivityScreen crm={crm} data={data} storageMode={storageMode} />}

      {tab === "vans" &&
        (!crm ? (
          <div style={{ padding: 40, textAlign: "center", color: "#5a6a85", fontWeight: 600 }}>Loading vans…</div>
        ) : (
          <VansScreen crm={crm} updateCrm={updateCrm} askConfirm={setConfirmBox} me={me} />
        ))}

      {CRM_TABS.includes(tab) &&
        (crmError ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <p style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>Couldn't load the customer data</p>
            <p style={{ fontSize: 14, color: "#5a6a85", marginBottom: 16 }}>Nothing has been changed or overwritten. This is usually temporary — try again.</p>
            <button onClick={loadCrm} style={{ ...btn, background: GOLD, borderColor: GOLD }}>Retry</button>
          </div>
        ) : !crm ? (
          <div style={{ padding: 40, textAlign: "center", color: "#5a6a85", fontWeight: 600 }}>Loading customers…</div>
        ) : tab === "customers" ? (
          <CustomersScreen
            onEmailSetup={() => setEmailSettings(true)}
            crm={crm}
            updateCrm={updateCrm}
            askConfirm={setConfirmBox}
            selId={selCustomerId}
            setSelId={setSelCustomerId}
            openInvoice={openInvoice}
            newInvoiceFor={newInvoiceFor}
            openQuote={openQuote}
            newQuoteFor={newQuoteFor}
            openSample={openSample}
            newSampleFor={newSampleFor}
            newSignal={newCustSignal}
            onNewHandled={() => setNewCustSignal(0)}
            onOutstanding={showOutstanding}
            me={me}
          />
        ) : tab === "samples" ? (
          <SamplesScreen
            crm={crm}
            updateCrm={updateCrm}
            askConfirm={setConfirmBox}
            selId={selSampleId}
            setSelId={setSelSampleId}
            goCustomer={goCustomer}
            openInvoice={openInvoice}
            me={me}
          />
        ) : tab === "quotes" ? (
          <QuotesScreen
            crm={crm}
            updateCrm={updateCrm}
            askConfirm={setConfirmBox}
            selId={selQuoteId}
            setSelId={setSelQuoteId}
            goCustomer={goCustomer}
            openInvoice={openInvoice}
            me={me}
            filter={quoteFilter}
            setFilter={setQuoteFilter}
          />
        ) : tab === "invoices" ? (
          <InvoicesScreen
            crm={crm}
            updateCrm={updateCrm}
            askConfirm={setConfirmBox}
            selId={selInvoiceId}
            setSelId={setSelInvoiceId}
            goCustomer={goCustomer}
            openQuote={openQuote}
            openSample={openSample}
            openCollection={openCollection}
            me={me}
            planner={data}
            updatePlanner={update}
            filter={invFilter}
            setFilter={setInvFilter}
          />
        ) : (
          <ScheduleScreen crm={crm} updateCrm={updateCrm} openInvoice={openInvoice} openCollection={openCollection} />
        ))}

      {(tab === "stock" || tab === "collections") &&
        (!crm ? (
          <div style={{ padding: 40, textAlign: "center", color: "#5a6a85", fontWeight: 600 }}>Loading stock…</div>
        ) : tab === "stock" ? (
          <StockScreen crm={crm} updateCrm={updateCrm} planner={data} updatePlanner={update} askConfirm={setConfirmBox} me={me} />
        ) : (
          <CollectionsScreen crm={crm} updateCrm={updateCrm} askConfirm={setConfirmBox} selId={selCollectionId} setSelId={setSelCollectionId} openInvoice={openInvoice} me={me} goSupplier={goSupplier} planner={data} />
        ))}

      {tab === "overview" && (
        <div style={{ padding: "18px 22px", maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 14px" }}>All shipments</h2>
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e6e9ef", padding: "4px 12px 12px", overflowX: "auto", overflowY: "auto", maxHeight: "max(320px, calc(100vh - " + (headerH + 130) + "px))" }}>
            <table className="dk-sticky-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: "13%" }}>Shipment</th>
                  <th style={{ ...th, width: "27%" }}>Products</th>
                  <th style={{ ...th, width: "8%", textAlign: "right" }}>Weight</th>
                  <th style={{ ...th, width: "12%" }}>Status</th>
                  <th style={{ ...th, width: "11%", fontSize: 11.5 }}>Planned order</th>
                  <th style={{ ...th, width: "10%", fontSize: 11.5 }}>Expected delivery</th>
                  <th style={{ ...th, width: "9%", fontSize: 11.5 }}>Arrived</th>
                  <th style={{ ...th, width: "10%", fontSize: 11.5 }}>Expected balance</th>
                  <th style={{ ...th, width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.shipments.map((s) => {
                  const t = shipTotals(s);
                  const famOrder = [];
                  const famMap = {};
                  s.lines.forEach((l) => {
                    const p = data.products.find((x) => x.id === l.productId);
                    if (!p) return;
                    const fname = (p.category || "").trim() || p.name.replace(/\s*\d+(?:\.\d+)?\s*m\b/gi, "").trim();
                    if (!fname) return;
                    if (!famMap[fname]) {
                      famMap[fname] = { accessory: /accessor/i.test(p.category || ""), colours: [] };
                      famOrder.push(fname);
                    }
                    if (l.colour && !famMap[fname].colours.includes(l.colour)) famMap[fname].colours.push(l.colour);
                  });
                  const summary = famOrder.length
                    ? famOrder
                        .map((n) => (!famMap[n].accessory && famMap[n].colours.length ? n + " (" + famMap[n].colours.join(", ") + ")" : n))
                        .join(" / ")
                    : "No lines yet";
                  return (
                    <tr key={s.id} style={{ background: stageTint(s.status) }}>
                      <td style={td}>
                        <button
                          onClick={() => {
                            setActiveId(s.id);
                            setTab("shipments");
                          }}
                          style={{ ...btn, border: "none", background: "transparent", padding: 0, textDecoration: "underline", textUnderlineOffset: 3 }}
                        >
                          {s.name}
                        </button>
                        {((s.supplier || "").trim() || (s.invoiceNo || "").trim()) && (
                          <div style={{ fontSize: 12, color: "#5a6a85" }}>
                            {[(s.supplier || "").trim(), (s.invoiceNo || "").trim() ? "Inv " + s.invoiceNo.trim() : ""].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5 }}>{summary}</div>
                            <div style={{ fontSize: 12, color: "#5a6a85" }}>{int(t.pallets)} pallets · {int(t.pieces)} pcs · ${money(t.cost)}</div>
                          </div>
                          {s.lines.length > 0 && (
                            <button
                              title="Show full product list"
                              onClick={(e) => {
                                if (pop && pop.id === s.id) {
                                  setPop(null);
                                  return;
                                }
                                const r = e.currentTarget.getBoundingClientRect();
                                setPop({
                                  id: s.id,
                                  top: Math.min(r.bottom + 6, window.innerHeight - 300),
                                  left: Math.min(r.left, window.innerWidth - 330),
                                });
                              }}
                              style={{
                                width: 22,
                                height: 22,
                                flexShrink: 0,
                                borderRadius: 999,
                                border: "1px solid " + GOLD,
                                background: GOLD + "33",
                                color: NAVY,
                                fontWeight: 700,
                                fontSize: 14,
                                lineHeight: "18px",
                                cursor: "pointer",
                                padding: 0,
                                fontFamily: "inherit",
                              }}
                            >
                              +
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{int(Math.round(t.kg))} kg</td>
                      <td style={td}>
                        <select
                          value={s.status}
                          onChange={(e) => setShipmentField(s.id, "status", e.target.value)}
                          style={{
                            ...inp,
                            fontWeight: 600,
                            background: (STATUS_COLOURS[s.status] || GOLD) + "33",
                            borderColor: STATUS_COLOURS[s.status] || GOLD,
                          }}
                        >
                          {STATUSES.map((st) => (
                            <option key={st}>{st}</option>
                          ))}
                        </select>
                      </td>
                      <td style={td}>
                        <input type="date" value={s.orderDate || ""} onChange={(e) => setShipmentField(s.id, "orderDate", e.target.value)} style={{ ...inp, fontSize: 12, padding: "6px 6px" }} />
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap", fontSize: 12 }}>{prettyDate(addMonths(s.orderDate, 3))}</td>
                      <td style={{ ...td, whiteSpace: "nowrap", fontSize: 12, fontWeight: s.arrivedDate ? 700 : 400, color: s.arrivedDate ? undefined : "#9aa5b1" }}>
                        {prettyDate(s.arrivedDate)}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap", fontSize: 12 }}>{prettyDate(addDays(addMonths(s.orderDate, 3), 30))}</td>
                      <td style={{ ...td, textAlign: "center" }}>
                        <button
                          onClick={() => duplicateShipment(s.id)}
                          title={"Duplicate " + s.name}
                          style={{ ...btn, padding: "4px 8px", fontSize: 13 }}
                        >
                          ⧉
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!data.shipments.length && (
                  <tr>
                    <td colSpan={9} style={{ ...td, textAlign: "center", color: "#5a6a85", padding: 24 }}>
                      No shipments yet — create one from the Shipments tab.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12.5, color: "#5a6a85", marginTop: 10 }}>
            Expected delivery is the planned order date plus a 3 month turnaround; expected balance is 30 days after delivery. Click a shipment name to open it.
          </p>
          {pop &&
            (() => {
              const s = data.shipments.find((x) => x.id === pop.id);
              if (!s) return null;
              return (
                <>
                  <div onClick={() => setPop(null)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
                  <div
                    style={{
                      position: "fixed",
                      top: pop.top,
                      left: pop.left,
                      zIndex: 31,
                      background: "#fff",
                      border: "1px solid #d5d9e0",
                      borderRadius: 10,
                      boxShadow: "0 10px 28px rgba(11,31,63,0.2)",
                      width: 320,
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid #eef0f4" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{s.name}</span>
                      <button
                        onClick={() => setPop(null)}
                        style={{ ...btn, padding: "2px 8px", border: "none", background: "transparent", color: "#5a6a85" }}
                        title="Close"
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{ maxHeight: 220, overflowY: "auto", padding: "4px 12px 10px" }}>
                      {s.lines.map((l) => {
                        const c = lineCalc(l);
                        return (
                          <div
                            key={l.id}
                            style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "7px 0", borderBottom: "1px solid #f2f4f7", fontSize: 13 }}
                          >
                            <span>
                              {productName(l.productId)} — {l.colour}
                            </span>
                            <span style={{ color: "#5a6a85", whiteSpace: "nowrap" }}>
                              {int(c.pallets)} plt · {int(c.pieces)} pcs · {int(Math.round(c.kg))} kg
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })()}
        </div>
      )}

      {tab === "shipments" && (
        <div style={{ padding: "18px 22px", maxWidth: 1100, margin: "0 auto" }}>
          <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            <select
              value={active ? active.id : ""}
              onChange={(e) => setActiveId(e.target.value)}
              style={{ ...inp, width: "auto", minWidth: 220, fontWeight: 600 }}
            >
              {data.shipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div style={{ flex: 1 }} />
            <button onClick={addShipment} style={btn}>+ New</button>
            <button onClick={() => active && duplicateShipment(active.id)} style={btn} disabled={!active}>Duplicate</button>
            <button onClick={deleteShipment} style={{ ...btn, color: RED, borderColor: "#ecc4cb" }} disabled={!active}>
              Delete
            </button>
            <button onClick={exportXlsx} style={{ ...btn, background: GOLD, border: "1px solid " + GOLD }} disabled={!active}>
              Export for factory
            </button>
          </div>

          {active && (
            <>
              <input
                value={active.name}
                onChange={(e) => updateShipment((s) => (s.name = e.target.value))}
                style={{ ...inp, fontSize: 20, fontWeight: 700, marginBottom: 2, background: "transparent", border: "1px solid transparent" }}
                onFocus={(e) => (e.target.style.border = "1px solid #d5d9e0")}
                onBlur={(e) => (e.target.style.border = "1px solid transparent")}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, paddingLeft: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#5a6a85" }}>Supplier invoice no.</span>
                <input
                  value={active.invoiceNo || ""}
                  onChange={(e) => setShipmentField(active.id, "invoiceNo", e.target.value)}
                  placeholder="e.g. VJ-2026-0451"
                  style={{ ...inp, width: 140, fontSize: 12.5, padding: "4px 8px" }}
                />
                {active.updatedAt && (
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "#8593a8", marginLeft: 8 }}>
                    Updated {prettyDateTime(active.updatedAt)}{active.modifiedBy ? " by " + active.modifiedBy.split("@")[0] : ""}
                  </span>
                )}
              </div>

              <div style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 10, padding: "12px 16px", display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
                <div>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5a6a85", marginBottom: 4 }}>Status</span>
                  <select
                    value={active.status}
                    onChange={(e) => updateShipment((s) => (s.status = e.target.value))}
                    style={{
                      ...inp,
                      width: "auto",
                      fontWeight: 600,
                      background: (STATUS_COLOURS[active.status] || GOLD) + "33",
                      borderColor: STATUS_COLOURS[active.status] || GOLD,
                    }}
                  >
                    {STATUSES.map((st) => (
                      <option key={st}>{st}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5a6a85", marginBottom: 4 }}>Supplier</span>
                  <select
                    value={active.supplier || ""}
                    onChange={(e) => setShipmentField(active.id, "supplier", e.target.value)}
                    title={suppliers.length ? "Supplier for this shipment" : "Set suppliers on your products first"}
                    style={{ ...inp, width: "auto", fontWeight: 600 }}
                  >
                    <option value="">All suppliers</option>
                    {suppliers.map((sup) => (
                      <option key={sup} value={sup}>
                        {sup}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5a6a85", marginBottom: 4 }}>Order date</span>
                  <input
                    type="date"
                    value={active.orderDate || ""}
                    onChange={(e) => setShipmentField(active.id, "orderDate", e.target.value)}
                    style={{ ...inp, width: "auto" }}
                  />
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ textAlign: "right" }}>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5a6a85", marginBottom: 2 }}>Expected delivery</span>
                  <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>{prettyDate(addMonths(active.orderDate, 3))}</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5a6a85", marginBottom: 2 }}>Expected balance</span>
                  <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>{prettyDate(addDays(addMonths(active.orderDate, 3), 30))}</span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16, position: "sticky", top: headerH, zIndex: 15, background: "#f3f5f8", padding: "8px 0", boxShadow: "0 6px 6px -6px rgba(11,31,63,0.15)" }}>
                {[
                  ["Pallets / Cartons", int(totals.pallets)],
                  ["Total pieces", int(totals.pieces)],
                  ["Total weight", int(Math.round(totals.kg)) + " kg"],
                  ["Total volume", (Math.round(totals.cbm * 10) / 10).toLocaleString("en-US") + " m³"],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: "1px solid #e6e9ef" }}>
                    <div style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2 }}>{value}</div>
                  </div>
                ))}
                <div style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: "1px solid #e6e9ef" }}>
                  <div style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600 }}>Total cost</div>
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2 }}>
                    ${money(active.surchargeOn !== false ? totals.cost * 1.03 : totals.cost)}
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5a6a85", fontWeight: 600, marginTop: 4, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={active.surchargeOn !== false}
                      onChange={(e) => setShipmentField(active.id, "surchargeOn", e.target.checked)}
                      style={{ accentColor: NAVY, width: 14, height: 14 }}
                    />
                    {active.surchargeOn !== false ? "incl. 3% surcharge ($" + money(totals.cost * 0.03) + ")" : "3% surcharge off"}
                  </label>
                </div>
              </div>

              <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e6e9ef", padding: "4px 12px 12px", overflowX: "auto", overflowY: "auto", maxHeight: "max(320px, calc(100vh - " + (headerH + 210) + "px))" }}>
                <table className="dk-sticky-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: "21%" }}>Product</th>
                      <th style={{ ...th, width: "12%" }}>Colour</th>
                      <th style={{ ...th, width: "8%", textAlign: "right" }}>Pallets / Cartons</th>
                      <th style={{ ...th, width: "10%", textAlign: "right" }}>Qty / Pallet / Carton</th>
                      <th style={{ ...th, width: "9%", textAlign: "right" }}>Pieces</th>
                      <th style={{ ...th, width: "9%", textAlign: "right" }}>kg / pc</th>
                      <th style={{ ...th, width: "10%", textAlign: "right" }}>Total kg</th>
                      <th style={{ ...th, width: "9%", textAlign: "right" }}>$ / pc</th>
                      <th style={{ ...th, width: "11%", textAlign: "right" }}>Total $</th>
                      <th style={{ ...th, width: 34 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.lines.map((l) => {
                      const p = data.products.find((x) => x.id === l.productId);
                      const c = lineCalc(l);
                      return (
                        <tr key={l.id}>
                          <td style={td}>
                            <select value={l.productId} onChange={(e) => setLine(l.id, "productId", e.target.value)} style={inp}>
                              {lineOptions(l, (active.supplier || "").trim()).map((pr) => (
                                <option key={pr.id} value={pr.id}>
                                  {pr.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={td}>
                            <select value={l.colour} onChange={(e) => setLine(l.id, "colour", e.target.value)} style={inp}>
                              {(p ? p.colours : []).map((col) => (
                                <option key={col}>{col}</option>
                              ))}
                            </select>
                          </td>
                          <td style={td}>
                            <div style={{ position: "relative" }}>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                className="dk-pallets"
                                value={l.pallets}
                                onChange={(e) => setLine(l.id, "pallets", e.target.value)}
                                onBlur={(e) => setLine(l.id, "pallets", snapPallets(e.target.value))}
                                style={{ ...num, paddingRight: 24 }}
                              />
                              <div style={{ position: "absolute", right: 3, top: 3, bottom: 3, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                <button
                                  onClick={() => setLine(l.id, "pallets", stepPallets(l.pallets, 1))}
                                  title="Increase"
                                  tabIndex={-1}
                                  style={{ border: "none", background: "transparent", cursor: "pointer", color: "#5a6a85", fontSize: 8, lineHeight: "11px", padding: "0 5px", fontFamily: "inherit" }}
                                >
                                  ▲
                                </button>
                                <button
                                  onClick={() => setLine(l.id, "pallets", stepPallets(l.pallets, -1))}
                                  title="Decrease"
                                  tabIndex={-1}
                                  style={{ border: "none", background: "transparent", cursor: "pointer", color: "#5a6a85", fontSize: 8, lineHeight: "11px", padding: "0 5px", fontFamily: "inherit" }}
                                >
                                  ▼
                                </button>
                              </div>
                            </div>
                          </td>
                          <td style={td}>
                            <input type="number" min="0" step="1" value={l.qty} onChange={(e) => setLine(l.id, "qty", e.target.value)} style={num} />
                          </td>
                          <td style={{ ...td, textAlign: "right", color: "#5a6a85" }}>{int(c.pieces)}</td>
                          <td style={td}>
                            <input type="number" min="0" step="0.1" value={l.weight} onChange={(e) => setLine(l.id, "weight", e.target.value)} style={num} />
                          </td>
                          <td style={{ ...td, textAlign: "right", color: "#5a6a85", whiteSpace: "nowrap" }}>{int(Math.round(c.kg))} kg</td>
                          <td style={td}>
                            <input type="number" min="0" step="0.01" value={l.cost} onChange={(e) => setLine(l.id, "cost", e.target.value)} style={num} />
                          </td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{money(c.total)}</td>
                          <td style={{ ...td, textAlign: "center" }}>
                            <button onClick={() => removeLine(l.id)} title="Remove line" style={{ ...btn, padding: "4px 9px", color: RED, border: "none", background: "transparent" }}>
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td colSpan={10} style={{ padding: "10px 8px" }}>
                        <button onClick={addLine} style={{ ...btn, border: "1px dashed #b9c2d0", width: "100%" }}>
                          + Add line
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 12.5, color: "#5a6a85", marginTop: 10 }}>
                Picking a product pre-fills qty per pallet and cost from your product list — both stay editable per line. Everything saves automatically.
              </p>
            </>
          )}
        </div>
      )}

      {tab === "completion" && (
        <div style={{ padding: "18px 22px", maxWidth: 720, margin: "0 auto" }}>
          <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10, position: "sticky", top: headerH, zIndex: 16, background: "#f3f5f8", padding: "8px 0" }}>
            <select
              value={active ? active.id : ""}
              onChange={(e) => setActiveId(e.target.value)}
              style={{ ...inp, width: "auto", minWidth: 220, fontWeight: 600 }}
            >
              {data.shipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {active &&
            (() => {
              const valueUsd = totals.cost;
              const shipping = Number(active.shippingGbp) || 0;
              const surchargeOn = active.surchargeOn !== false;
              const surchargeUsd = surchargeOn ? valueUsd * 0.03 : 0;
              const subUsdVal = valueUsd + surchargeUsd;
              const depUsd = Number(active.depositUsd) || 0;
              const depFx = Number(active.depositFx) || 0;
              const balUsd = Number(active.balanceUsd) || 0;
              const balFx = Number(active.balanceFx) || 0;
              const depGbp = depFx > 0 ? depUsd / depFx : 0;
              const balGbp = balFx > 0 ? balUsd / balFx : 0;
              const dutyOn = active.dutyOn !== false;
              const duty = dutyOn ? Number(active.dutyGbp) || 0 : 0;
              const totalCost = depGbp + balGbp + shipping + duty;
              const subUsd = { fontSize: 12, fontWeight: 600, color: "#9aa5b1" };
              const lbl = { fontSize: 12.5, fontWeight: 600, color: "#5a6a85", marginBottom: 4, display: "block" };
              const sectionLbl = { fontSize: 12, fontWeight: 700, color: "#5a6a85", letterSpacing: 0.6, textTransform: "uppercase", margin: "0 0 10px" };
              const sumRow = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid #eef0f4" };
              const sumLbl = { fontSize: 13.5, fontWeight: 600, color: "#5a6a85" };
              const sumVal = { fontSize: 15, fontWeight: 700 };
              return (
                <div style={{ background: stageTint(active.status) || "#fff", borderRadius: 10, border: "1px solid " + (active.status !== "Planning" && STATUS_COLOURS[active.status] ? STATUS_COLOURS[active.status] : "#e6e9ef"), padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, flex: 1, minWidth: 220 }}>{active.name} — completion report</h2>
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: NAVY,
                        background: (STATUS_COLOURS[active.status] || GOLD) + "33",
                        border: "1px solid " + (STATUS_COLOURS[active.status] || GOLD),
                        borderRadius: 999,
                        padding: "5px 14px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {active.status}
                    </span>
                    {(active.invoiceNo || "").trim() && (
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#5a6a85", background: "#f3f5f8", border: "1px solid #e6e9ef", borderRadius: 999, padding: "5px 14px", whiteSpace: "nowrap" }}>
                        Invoice {active.invoiceNo}
                      </span>
                    )}
                  </div>

                  <p style={sectionLbl}>Key dates</p>
                  <div style={{ background: "#f8f9fb", border: "1px solid #e6e9ef", borderRadius: 10, padding: "8px 16px", marginBottom: 20 }}>
                    {[
                      ["1", "Order date", "orderDate", null],
                      ["2", "Deposit paid", "depositDate", ["depositUsd", "depositFx", 0.3]],
                      ["3", "Arrived", "arrivedDate", null],
                      ["4", "Balance paid", "balancePaidDate", ["balanceUsd", "balanceFx", 0.7]],
                    ].map(([n, label, field, pay], idx) => {
                      const set = !!active[field];
                      return (
                        <div key={field} style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", padding: "10px 0", borderBottom: idx < 3 ? "1px solid #eef0f4" : "none" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, width: 130, paddingTop: 23 }}>
                            <span
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 999,
                                background: set ? NAVY : "transparent",
                                border: "1.5px solid " + (set ? NAVY : "#b9c2d0"),
                                color: set ? GOLD : "#8593a8",
                                fontSize: 11,
                                fontWeight: 700,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              {set ? "✓" : n}
                            </span>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: set ? NAVY : "#5a6a85" }}>{label}</span>
                          </div>
                          <div>
                            <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#8593a8", marginBottom: 3 }}>Date</span>
                            <input type="date" value={active[field] || ""} onChange={(e) => setShipmentField(active.id, field, e.target.value)} style={{ ...inp, width: 160, maxWidth: "100%" }} />
                          </div>
                          {field === "arrivedDate" && daysBetween(active.orderDate, active.arrivedDate) !== null && (
                            <div style={{ paddingTop: 23 }}>
                              <span
                                style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, whiteSpace: "nowrap" }}
                                title={"Elapsed from order date to arrival (\u2248 " + Math.round(daysBetween(active.orderDate, active.arrivedDate) / 7) + " weeks)"}
                              >
                                = {daysBetween(active.orderDate, active.arrivedDate)} days from order
                              </span>
                            </div>
                          )}
                          {pay && (
                            <>
                              <div>
                                <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#8593a8", marginBottom: 3 }}>Value ($)</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={active[pay[0]]}
                                  onChange={(e) => setShipmentField(active.id, pay[0], e.target.value)}
                                  style={{ ...num, width: 120 }}
                                />
                                {(() => {
                                  const dep30 = Math.round(valueUsd * 0.3 * 100) / 100;
                                  const fill = pay[2] === 0.3 ? dep30 : Math.round((valueUsd - dep30) * 100) / 100;
                                  return (
                                    <button
                                      onClick={() => setShipmentField(active.id, pay[0], fill)}
                                      title={"Fill with " + Math.round(pay[2] * 100) + "% of the shipment total ($" + money(valueUsd) + ")"}
                                      style={{ ...btn, padding: "2px 7px", fontSize: 11, marginTop: 4, border: "1px dashed #b9c2d0", display: "block" }}
                                    >
                                      {Math.round(pay[2] * 100)}% = ${money(fill)}
                                    </button>
                                  );
                                })()}
                              </div>
                              <div>
                                <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#8593a8", marginBottom: 3 }}>Exchange rate ($/£)</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.0001"
                                  value={active[pay[1]]}
                                  onChange={(e) => setShipmentField(active.id, pay[1], e.target.value)}
                                  style={{ ...num, width: 110 }}
                                  placeholder="e.g. 1.27"
                                />
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ background: "#f8f9fb", border: "1px solid #e6e9ef", borderRadius: 10, padding: "6px 16px 12px" }}>
                    <div style={{ padding: "10px 0 2px", fontSize: 15, fontWeight: 700, color: NAVY }}>£ Cost summary</div>
                    <div style={sumRow}>
                      <span style={sumLbl}>Total value ($)</span>
                      <span style={sumVal}>${money(valueUsd)}</span>
                    </div>
                    <div style={sumRow}>
                      <label style={{ ...sumLbl, display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={surchargeOn}
                          onChange={(e) => setShipmentField(active.id, "surchargeOn", e.target.checked)}
                          style={{ accentColor: NAVY, width: 14, height: 14 }}
                        />
                        Surcharge (3%)
                      </label>
                      <span style={{ ...sumVal, color: surchargeOn ? undefined : "#9aa5b1", fontWeight: surchargeOn ? 700 : 600 }}>
                        {surchargeOn ? "$" + money(surchargeUsd) : "Off for this order"}
                      </span>
                    </div>
                    <div style={sumRow}>
                      <span style={{ ...sumLbl, color: NAVY }}>Sub total ($)</span>
                      <span style={sumVal}>${money(subUsdVal)}</span>
                    </div>
                    <div style={sumRow}>
                      <span style={sumLbl}>Deposit paid (£)</span>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                        {depGbp > 0 && <span style={subUsd}>${money(depUsd)} @ {depFx}</span>}
                        <span style={{ ...sumVal, color: depGbp > 0 ? undefined : "#9aa5b1", fontWeight: depGbp > 0 ? 700 : 600 }}>£{money(depGbp)}</span>
                      </span>
                    </div>
                    <div style={sumRow}>
                      <span style={sumLbl}>Balance paid (£)</span>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                        {balGbp > 0 && <span style={subUsd}>${money(balUsd)} @ {balFx}</span>}
                        <span style={{ ...sumVal, color: balGbp > 0 ? undefined : "#9aa5b1", fontWeight: balGbp > 0 ? 700 : 600 }}>£{money(balGbp)}</span>
                      </span>
                    </div>
                    <div style={sumRow}>
                      <label style={{ ...sumLbl, display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={dutyOn}
                          onChange={(e) => setShipmentField(active.id, "dutyOn", e.target.checked)}
                          style={{ accentColor: NAVY, width: 14, height: 14 }}
                        />
                        Duty (£)
                      </label>
                      {dutyOn ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={active.dutyGbp}
                          onChange={(e) => setShipmentField(active.id, "dutyGbp", e.target.value)}
                          style={{ ...num, width: 140 }}
                        />
                      ) : (
                        <span style={{ ...sumVal, color: "#9aa5b1", fontWeight: 600 }}>Off for this order</span>
                      )}
                    </div>
                    <div style={sumRow}>
                      <span style={sumLbl}>Shipping costs (£)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={active.shippingGbp}
                        onChange={(e) => setShipmentField(active.id, "shippingGbp", e.target.value)}
                        style={{ ...num, width: 140 }}
                      />
                    </div>
                    <div style={{ ...sumRow, borderBottom: "none", borderTop: "2px solid " + NAVY, marginTop: 2, paddingTop: 12, alignItems: "flex-start" }}>
                      <span style={{ ...sumLbl, color: NAVY, fontSize: 14.5 }}>Total cost (£)</span>
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <span style={{ fontSize: 22, fontWeight: 700, background: GOLD + "33", border: "1px solid " + GOLD, borderRadius: 8, padding: "4px 12px" }}>
                          £{money(totalCost)}
                        </span>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: "#9aa5b1" }}>Surcharge guide: 3% of goods paid (deposit + balance) = £{money((depGbp + balGbp) * 0.03)}</span>
                      </span>
                    </div>
                  </div>

                  <p style={{ fontSize: 12.5, color: "#5a6a85", margin: "14px 0 0" }}>
                    Total value $ comes from this shipment's order lines; surcharge = 3% of total value when ticked on; sub total $ = value + surcharge. Deposit and balance £ = paid $ ÷ that payment's exchange rate; total cost £ = deposit + balance + shipping + duty (when ticked on). Everything saves automatically.
                  </p>
                </div>
              );
            })()}
        </div>
      )}

      {tab === "landed" && (
        <div style={{ padding: "18px 22px", maxWidth: 1000, margin: "0 auto" }}>
          <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10, position: "sticky", top: headerH, zIndex: 16, background: "#f3f5f8", padding: "8px 0" }}>
            <select
              value={active ? active.id : ""}
              onChange={(e) => setActiveId(e.target.value)}
              style={{ ...inp, width: "auto", minWidth: 220, fontWeight: 600 }}
            >
              {data.shipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {active &&
            (() => {
              const depUsd = Number(active.depositUsd) || 0;
              const depFx = Number(active.depositFx) || 0;
              const balUsd = Number(active.balanceUsd) || 0;
              const balFx = Number(active.balanceFx) || 0;
              const paidGbp = (depFx > 0 ? depUsd / depFx : 0) + (balFx > 0 ? balUsd / balFx : 0);
              const paidUsd = (depFx > 0 ? depUsd : 0) + (balFx > 0 ? balUsd : 0);
              const fx = paidGbp > 0 ? paidUsd / paidGbp : 0;
              const shipping = Number(active.shippingGbp) || 0;
              const surchargeOn = active.surchargeOn !== false;
              const dutyOn = active.dutyOn !== false;
              const duty = dutyOn ? Number(active.dutyGbp) || 0 : 0;
              const shipPerPc = totals.pieces > 0 ? shipping / totals.pieces : 0;
              const dutyPerPc = dutyOn && totals.pieces > 0 ? duty / totals.pieces : 0;
              return (
                <>
                  <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e6e9ef", padding: "14px 16px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, flexWrap: "wrap", position: "sticky", top: headerH + 62, zIndex: 15, boxShadow: "0 6px 10px -6px rgba(11,31,63,0.18)" }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: NAVY, paddingTop: 2 }}>Shipping &amp; duty per piece</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
                      <div style={{ background: "#f8f9fb", border: "1px solid #e6e9ef", borderRadius: 8, padding: "8px 6px", width: 122, boxSizing: "border-box", textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>£{money(shipping)}</div>
                        <div style={{ fontSize: 11.5, color: "#5a6a85", fontWeight: 600, marginTop: 1 }}>Shipping costs</div>
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#9aa5b1", width: 16, textAlign: "center" }}>÷</div>
                      <div style={{ background: "#f8f9fb", border: "1px solid #e6e9ef", borderRadius: 8, padding: "8px 6px", width: 122, boxSizing: "border-box", textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{int(totals.pieces)}</div>
                        <div style={{ fontSize: 11.5, color: "#5a6a85", fontWeight: 600, marginTop: 1 }}>Total pieces</div>
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#9aa5b1", width: 16, textAlign: "center" }}>=</div>
                      <div style={{ background: GOLD + "33", border: "1px solid " + GOLD, borderRadius: 8, padding: "8px 6px", width: 122, boxSizing: "border-box", textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>£{money(shipPerPc)}</div>
                        <div style={{ fontSize: 11.5, color: NAVY, fontWeight: 600, marginTop: 1 }}>Shipping per piece</div>
                      </div>
                    </div>
                    {dutyOn ? (
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
                        <div style={{ background: "#f8f9fb", border: "1px solid #e6e9ef", borderRadius: 8, padding: "8px 6px", width: 122, boxSizing: "border-box", textAlign: "center" }}>
                          <div style={{ fontSize: 18, fontWeight: 700 }}>£{money(duty)}</div>
                          <div style={{ fontSize: 11.5, color: "#5a6a85", fontWeight: 600, marginTop: 1 }}>Duty</div>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#9aa5b1", width: 16, textAlign: "center" }}>÷</div>
                        <div style={{ background: "#f8f9fb", border: "1px solid #e6e9ef", borderRadius: 8, padding: "8px 6px", width: 122, boxSizing: "border-box", textAlign: "center" }}>
                          <div style={{ fontSize: 18, fontWeight: 700 }}>{int(totals.pieces)}</div>
                          <div style={{ fontSize: 11.5, color: "#5a6a85", fontWeight: 600, marginTop: 1 }}>Total pieces</div>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#9aa5b1", width: 16, textAlign: "center" }}>=</div>
                        <div style={{ background: GOLD + "33", border: "1px solid " + GOLD, borderRadius: 8, padding: "8px 6px", width: 122, boxSizing: "border-box", textAlign: "center" }}>
                          <div style={{ fontSize: 18, fontWeight: 700 }}>£{money(dutyPerPc)}</div>
                          <div style={{ fontSize: 11.5, color: NAVY, fontWeight: 600, marginTop: 1 }}>Duty per piece</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "#9aa5b1", fontWeight: 600 }}>Duty off for this order</div>
                    )}
                    </div>
                  </div>
                  {fx <= 0 && (
                    <p style={{ fontSize: 13, color: RED, fontWeight: 600, margin: "0 0 12px" }}>
                      Enter the deposit and balance payments with their exchange rates on the Completion tab to calculate £ landed costs (a blended rate across both payments is used here).
                    </p>
                  )}
                  <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e6e9ef", padding: "4px 12px 12px", overflowX: "auto", overflowY: "auto", maxHeight: "max(320px, calc(100vh - " + (headerH + 170) + "px))" }}>
                    <table className="dk-sticky-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 840 }}>
                      <thead>
                        <tr>
                          <th style={{ ...th, width: "20%" }}>Product</th>
                          <th style={{ ...th, width: "10%" }}>Colour</th>
                          <th style={{ ...th, width: "8%", textAlign: "right" }}>Pieces</th>
                          <th style={{ ...th, width: "10%", textAlign: "right" }}>Cost / pc ($)</th>
                          <th style={{ ...th, width: "10%", textAlign: "right" }}>Cost / pc (£)</th>
                          <th style={{ ...th, width: "10%", textAlign: "right" }}>Surcharge / pc (£)</th>
                          <th style={{ ...th, width: "10%", textAlign: "right" }}>Duty / pc (£)</th>
                          <th style={{ ...th, width: "11%", textAlign: "right" }}>Shipping / pc (£)</th>
                          <th style={{ ...th, width: "11%", textAlign: "right" }}>Landed / pc (£)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {active.lines.map((l) => {
                          const c = lineCalc(l);
                          const usd = Number(l.cost) || 0;
                          const gbp = fx > 0 ? usd / fx : 0;
                          const surchPc = surchargeOn ? gbp * 0.03 : 0;
                          const landed = gbp + surchPc + dutyPerPc + shipPerPc;
                          return (
                            <tr key={l.id}>
                              <td style={td}>{productName(l.productId)}</td>
                              <td style={td}>{l.colour}</td>
                              <td style={{ ...td, textAlign: "right", color: "#5a6a85" }}>{int(c.pieces)}</td>
                              <td style={{ ...td, textAlign: "right" }}>{money(usd)}</td>
                              <td style={{ ...td, textAlign: "right" }}>{fx > 0 ? money(gbp) : "—"}</td>
                              <td style={{ ...td, textAlign: "right", color: surchargeOn ? undefined : "#9aa5b1" }}>
                                {surchargeOn ? (fx > 0 ? money(surchPc) : "—") : "off"}
                              </td>
                              <td style={{ ...td, textAlign: "right", color: dutyOn ? undefined : "#9aa5b1" }}>{dutyOn ? money(dutyPerPc) : "off"}</td>
                              <td style={{ ...td, textAlign: "right" }}>{money(shipPerPc)}</td>
                              <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fx > 0 ? money(landed) : "—"}</td>
                            </tr>
                          );
                        })}
                        {!active.lines.length && (
                          <tr>
                            <td colSpan={9} style={{ ...td, textAlign: "center", color: "#5a6a85", padding: 24 }}>
                              No lines on this shipment yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize: 12.5, color: "#5a6a85", marginTop: 10 }}>
                    Cost per piece $ comes from the shipment order lines; exchange rate and shipping come from the Completion report. £ conversion uses the blended rate across the deposit and balance payments. Shipping and duty are each spread evenly per piece (total ÷ total pieces); landed = £ cost + 3% surcharge + duty per piece + shipping per piece (each only when ticked on for the order).
                  </p>
                </>
              );
            })()}
        </div>
      )}

      {tab === "products" &&
        (!crm ? (
          <div style={{ padding: 40, textAlign: "center", color: "#5a6a85", fontWeight: 600 }}>Loading products…</div>
        ) : (
          <ProductsScreen planner={data} update={update} crm={crm} updateCrm={updateCrm} removeProduct={removeProduct} headerH={headerH} />
        ))}
      {dueReminders.length > 0 && !remindersClosed && !locked && (
        <div style={{ position: "fixed", inset: 0, zIndex: 55, background: "rgba(11,31,63,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, overflow: "hidden", boxShadow: "0 24px 70px rgba(11,31,63,0.5)" }}>
            <div style={{ background: "linear-gradient(135deg,#C8102E 0%,#8a0b20 100%)", padding: "18px 22px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 26 }}>🚐</span>
              <div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Van reminders</div>
                <div style={{ color: "#ffd8dd", fontSize: 12.5, fontWeight: 600 }}>
                  {dueReminders.length} item{dueReminders.length === 1 ? "" : "s"} need attention
                </div>
              </div>
            </div>
            <div style={{ padding: "16px 22px", maxHeight: "46vh", overflowY: "auto" }}>
              {dueReminders.map((r) => (
                <div key={r.key} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: "1px solid #f0f2f6" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 99, background: r.severity === "red" ? RED : "#E8912D", flex: "none" }} />
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: NAVY }}>{r.label}</span>
                  {r.date && <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 600, color: "#5a6a85", whiteSpace: "nowrap" }}>{prettyDate(r.date)}</span>}
                </div>
              ))}
              <p style={{ fontSize: 12, color: "#8593a8", fontWeight: 600, margin: "10px 0 0" }}>
                Weekly checks come back every Monday until recorded; renewals nag weekly from a month out until the date is moved on.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, padding: "0 22px 18px", flexWrap: "wrap" }}>
              <button onClick={() => { setRemindersClosed(true); setTab("vans"); }}
                style={{ ...btn, background: GOLD, borderColor: GOLD, fontWeight: 700 }}>
                Go to Vans
              </button>
              <button onClick={snoozeReminders} style={btn}>Snooze for a week</button>
              <span style={{ flex: 1 }} />
              <button onClick={() => setRemindersClosed(true)} style={{ ...btn, border: "none", color: "#8593a8" }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {dueTasks.length > 0 && !taskPopClosed && !taskSnoozedToday && !locked && (remindersClosed || dueReminders.length === 0) && (
        <div style={{ position: "fixed", inset: 0, zIndex: 55, background: "rgba(11,31,63,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 540, overflow: "hidden", boxShadow: "0 24px 70px rgba(11,31,63,0.5)" }}>
            <div style={{ background: "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", padding: "18px 22px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="cal" size={20} stroke={NAVY} />
              </span>
              <div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Your scheduled tasks</div>
                <div style={{ color: "#aeb9cf", fontSize: 12.5, fontWeight: 600 }}>
                  {dueTasks.length} due — tick them off as you go
                </div>
              </div>
            </div>
            <div style={{ padding: "12px 22px", maxHeight: "46vh", overflowY: "auto" }}>
              {dueTasks.map(({ task: t, occ, overdueDays }) => (
                <div key={t.id} style={{ display: "flex", gap: 11, alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f0f2f6" }}>
                  <button title="Done" onClick={() => updateCrm((c) => { setTaskDone(c, t.id, occ.date, me, true); return c; })}
                    style={{ width: 26, height: 26, borderRadius: 7, border: "2px solid #c9d0db", background: "#fff", cursor: "pointer", flex: "none" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: NAVY }}>{t.title}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: overdueDays > 0 ? RED : "#5a6a85" }}>
                      {describeSchedule(t)}{overdueDays > 0 ? " · due " + prettyDate(occ.date) : " · due today"}
                    </div>
                    {t.notes && <div style={{ fontSize: 12, color: "#8593a8", fontWeight: 600, marginTop: 2 }}>{t.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, padding: "6px 22px 18px", flexWrap: "wrap" }}>
              <button onClick={() => { setTaskPopClosed(true); setTab("home"); }} style={{ ...btn, background: GOLD, borderColor: GOLD, fontWeight: 700 }}>
                See my list
              </button>
              <button onClick={snoozeTasks} style={btn}>Not today</button>
              <span style={{ flex: 1 }} />
              <button onClick={() => setTaskPopClosed(true)} style={{ ...btn, border: "none", color: "#8593a8" }}>Remind me later</button>
            </div>
          </div>
        </div>
      )}

      {copyPanel && (
        <div
          onClick={() => setCopyPanel(null)}
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(11,31,63,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 560, padding: "16px 18px", fontFamily: "inherit" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{copyPanel.title}</span>
              <button onClick={() => setCopyPanel(null)} style={{ ...btn, padding: "2px 8px", border: "none", background: "transparent", color: "#5a6a85" }} title="Close">
                ✕
              </button>
            </div>
            <p style={{ fontSize: 13, color: "#5a6a85", margin: "0 0 10px" }}>{copyPanel.note}</p>
            <textarea
              id="dk-copy-text"
              readOnly
              value={copyPanel.text}
              onFocus={(e) => e.target.select()}
              style={{ ...inp, height: 160, fontFamily: "monospace", fontSize: 11.5, resize: "vertical", whiteSpace: "pre" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={copyPanelText} style={{ ...btn, background: GOLD, border: "1px solid " + GOLD }}>
                Copy all to clipboard
              </button>
              {copyPanel.download && (
                <button onClick={downloadXlsx} style={btn} title="May be blocked by your browser">
                  Try .xlsx download
                </button>
              )}
              {copied && <span style={{ fontSize: 13, color: "#2c7a3f", fontWeight: 600 }}>Copied ✓</span>}
            </div>
          </div>
        </div>
      )}
      {pinPanel && (
        <div
          onClick={() => setPinPanel(false)}
          style={{ position: "fixed", inset: 0, zIndex: 45, background: "rgba(11,31,63,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 380, padding: "18px 20px", fontFamily: "inherit" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{pinHash ? "Change or remove PIN" : "Set a PIN"}</span>
              <button onClick={() => setPinPanel(false)} style={{ ...btn, padding: "2px 8px", border: "none", background: "transparent", color: "#5a6a85" }} title="Close">
                ✕
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: "#5a6a85", margin: "0 0 12px" }}>
              4-8 digits, asked for every time the planner opens. This deters casual access on a shared screen — it doesn't encrypt the data.
            </p>
            {pinHash && (
              <div style={{ marginBottom: 10 }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5a6a85", marginBottom: 4 }}>Current PIN</span>
                <input type="password" inputMode="numeric" value={pinCurrent} onChange={(e) => setPinCurrent(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))} style={inp} />
              </div>
            )}
            <div style={{ marginBottom: 10 }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5a6a85", marginBottom: 4 }}>New PIN</span>
              <input type="password" inputMode="numeric" value={pinNew} onChange={(e) => setPinNew(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))} style={inp} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5a6a85", marginBottom: 4 }}>Confirm new PIN</span>
              <input type="password" inputMode="numeric" value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))} onKeyDown={(e) => e.key === "Enter" && savePinChange()} style={inp} />
            </div>
            {pinError && <p style={{ color: RED, fontSize: 13, fontWeight: 600, margin: "0 0 10px" }}>{pinError}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {pinHash && (
                <button onClick={removePin} style={{ ...btn, color: RED, borderColor: "#ecc4cb", marginRight: "auto" }}>
                  Remove PIN
                </button>
              )}
              <button onClick={() => setPinPanel(false)} style={btn}>
                Cancel
              </button>
              <button onClick={savePinChange} style={{ ...btn, background: GOLD, border: "1px solid " + GOLD }}>
                Save PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmBox && (
        <div
          onClick={() => setConfirmBox(null)}
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(11,31,63,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 400, padding: "18px 20px", fontFamily: "inherit" }}>
            <p style={{ fontSize: 14.5, fontWeight: 600, margin: "0 0 16px" }}>{confirmBox.message}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {confirmBox.okOnly ? (
                <button onClick={() => setConfirmBox(null)} style={{ ...btn, background: GOLD, border: "1px solid " + GOLD }}>
                  OK
                </button>
              ) : (
                <>
                  <button onClick={() => setConfirmBox(null)} style={btn}>
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const a = confirmBox.action;
                      setConfirmBox(null);
                      if (a) a();
                    }}
                    style={
                      confirmBox.danger
                        ? { ...btn, background: RED, border: "1px solid " + RED, color: "#fff" }
                        : { ...btn, background: GOLD, border: "1px solid " + GOLD }
                    }
                  >
                    {confirmBox.confirmLabel || "Confirm"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
