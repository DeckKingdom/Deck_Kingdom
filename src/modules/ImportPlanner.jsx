import { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { storage, storageMode } from "../data/storage.js";
import { useDropSync, DropAlert } from "./crm/DropSync.jsx";
import { useShortLoads, ShortLoadAlert, shortIssueOf } from "./crm/ShortLoads.jsx";
import DriverPicker from "./DriverPicker.jsx";
import { loadLoading } from "../data/loading.js";
import { canCheck } from "../lib/loading.js";
import { useTrackingAlerts, TrackingAlertPop } from "./crm/TrackingAlerts.jsx";
import { fleetSettings } from "../lib/tracking.js";
import { signOut, getSessionEmail, getMyAccess } from "../data/auth.js";
import { accessFor, LOCAL_ACCESS, LOADING_ACCESS, levelLabel } from "../lib/access.js";
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
import { sampleStatus } from "../lib/crmCore.js";
import { blankInvoice, blankLine, blankQuote, blankSample, blankSampleItem, nextNumber, TRADE_COUNTER, vanReminders, reviewReminders, sampleReminders, reviewAskCounts, syncCatalogue, renameSkus, syncOpenPicks, colourTidyPlan, syncSampleConversions, cleanCode, codeSource, PRODUCT_SOURCES, suggestDescription, suggestCode, codeFollowsName, dueScheduledFor, setTaskDone, describeSchedule, today as todayStr, newPurchaseFor } from "../lib/crmCore.js";
import { useCrm } from "./crm/useCrm.js";
import CustomersScreen from "./crm/CustomersScreen.jsx";
import InvoicesScreen from "./crm/InvoicesScreen.jsx";
import QuotesScreen from "./crm/QuotesScreen.jsx";
import SamplesScreen from "./crm/SamplesScreen.jsx";
import ReviewsScreen from "./crm/ReviewsScreen.jsx";
import TasksScreen from "./crm/TasksScreen.jsx";
import ProductsScreen from "./crm/ProductsScreen.jsx";
import PurchasesScreen from "./crm/PurchasesScreen.jsx";
import SuppliersScreen from "./crm/SuppliersScreen.jsx";
import { quotesAvailable, samplesAvailable, tasksAvailable, purchasesAvailable } from "../data/crmStorage.js";
import ScheduleScreen from "./crm/ScheduleScreen.jsx";
import Sidebar, { TAB_LABELS } from "./Sidebar.jsx";
import { ProductEditor } from "./crm/ProductsScreen.jsx";
import HomeScreen from "./HomeScreen.jsx";
import ActivityScreen from "./crm/ActivityScreen.jsx";
import UsersScreen from "./crm/UsersScreen.jsx";
import StockScreen from "./crm/StockScreen.jsx";
import CollectionsScreen from "./crm/CollectionsScreen.jsx";
import VansScreen from "./crm/VansScreen.jsx";
import TrackingScreen from "./crm/TrackingScreen.jsx";
import CompletionsScreen from "./crm/CompletionsScreen.jsx";
import IssuesScreen, { issueOf } from "./crm/IssuesScreen.jsx";
import LoadingScreen from "./crm/LoadingScreen.jsx";
import { loadAllDrops } from "../data/drops.js";
import { Icon, SuggestInput, abtn, DateInput, CalendarPop, selectAllProps } from "./crm/ui.jsx";
import { EmailSettings } from "./crm/EmailPanels.jsx";
import { emailReady } from "../data/email.js";

const CRM_TABS = ["customers", "samples", "quotes", "invoices", "schedule", "reviews"];

// shipment lines left blank ($ / pc, qty, kg at 0) take the product's current figure; never overwrites a typed one
// the date each shipment stage was reached (Planning uses the planned order date)
const STAGE_DATE = { Confirmed: "confirmedDate", "In production": "productionDate", Shipped: "shippedDate", Arrived: "arrivedDate", Paid: "balancePaidDate" };

const fillBlankLines = (d) => {
  let n = 0;
  d.shipments.forEach((s) => (s.lines || []).forEach((l) => {
    const p = d.products.find((x) => x.id === l.productId);
    if (!p) return;
    ["cost", "qty", "weight"].forEach((f) => { if (!(Number(l[f]) > 0) && Number(p[f]) > 0) { l[f] = Number(p[f]); n++; } });
  }));
  return n;
};

export default function ImportPlanner() {
  const [data, setData] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [tab, setTab] = useState("home");
  // this login's access level (admin / manager / office / warehouse, optionally read only)
  const [access, setAccess] = useState(() => {
    if (storageMode === "supabase") return LOADING_ACCESS;
    // local preview only: ?as=office&ro=1 shows the app as that level
    try { const q = new URLSearchParams(window.location.search); if (q.get("as")) return accessFor(q.get("as"), q.get("ro") === "1"); } catch (e) { /* ignore */ }
    return LOCAL_ACCESS;
  });
  useEffect(() => {
    if (storageMode !== "supabase") return;
    let live = true;
    const get = () => getMyAccess().then((p) => { if (live && p) setAccess(p.legacy ? LOCAL_ACCESS : { ...accessFor(p.role, p.read_only), name: p.full_name || "" }); }).catch(() => {});
    get();
    const t = setInterval(get, 60_000); // a level changed by the admin applies within a minute
    return () => { live = false; clearInterval(t); };
  }, []);
  // never sit on a screen this login can't open
  useEffect(() => { if (access.known && !access.canTab(tab)) setTab("home"); }, [access, tab]);
  const [roNote, setRoNote] = useState(false);
  useEffect(() => { if (!roNote) return; const t = setTimeout(() => setRoNote(false), 3500); return () => clearTimeout(t); }, [roNote]);
  const [sideOpen, setSideOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= 950));
  // phones: the side menu becomes a drawer and the header slims down
  const [isPhone, setIsPhone] = useState(() => typeof window !== "undefined" && window.innerWidth < 760);
  useEffect(() => {
    const on = () => { const p = window.innerWidth < 760; setIsPhone((was) => { if (p && !was) setSideOpen(false); return p; }); };
    window.addEventListener("resize", on);
    if (window.innerWidth < 760) setSideOpen(false);
    return () => window.removeEventListener("resize", on);
  }, []);
  const [saveState, setSaveState] = useState("");
  const [pop, setPop] = useState(null);
  const [dragLine, setDragLine] = useState(null); // shipment line being dragged to a new place
  const [overLine, setOverLine] = useState(null);
  const moveLine = (fromId, toId) => {
    if (!fromId || fromId === toId) return;
    updateShipment((s) => {
      const from = s.lines.findIndex((x) => x.id === fromId);
      if (from < 0) return;
      const [l] = s.lines.splice(from, 1);
      const to = toId ? s.lines.findIndex((x) => x.id === toId) : -1;
      s.lines.splice(to < 0 ? s.lines.length : to, 0, l);
    });
  };
  const [prodPop, setProdPop] = useState(null);
  // jobs, quotes and the schedule can open a product's record from its line (managers and admin, who can change products)
  const openProduct = access && access.canManage ? (productId, rect) => setProdPop({ productId, rect, fromCrm: true }) : null;
  const [prodDraft, setProdDraft] = useState({});
  // "+ New product": a fresh product goes straight onto the line and the full product card opens to fill in
  const newProductOnLine = (lineId, name, rect, codeHint) => {
    const id = uid();
    const was = active && active.lines.find((x) => x.id === lineId);
    const prev = was && was.productId ? { productId: was.productId, colour: was.colour, qty: was.qty, cost: was.cost, weight: was.weight } : null;
    update((d) => {
      const nm = suggestDescription(name || "");
      d.products.unshift({ id, code: (nm && suggestCode(nm, codeSource(codeHint) || "DK")) || codeHint || "DK/", name: nm, colours: [], qty: 0, cost: 0, weight: 0, cbm: 0,
        supplier: (active && active.supplier) || "", category: "", salePrice: "", costGbp: "", segSup: "", segLen: "", segCat: "", segSub: "", segProd: "" });
      const sh = active && d.shipments.find((x) => x.id === active.id);
      const l = sh && sh.lines.find((x) => x.id === lineId);
      if (l) Object.assign(l, { productId: id, colour: "", qty: 0, cost: 0, weight: 0 });
      return d;
    });
    setProdPop({ productId: id, lineId, rect, created: true, prev });
  }; // lineId -> text being typed in a line's product box // { productId, lineId, rect }: quick edit of a shipment line's product
  const [loadError, setLoadError] = useState(false);
  const [copyPanel, setCopyPanel] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmBox, setConfirmBox] = useState(null);
  const [priceReview, setPriceReview] = useState(false);
  const [lineRefresh, setLineRefresh] = useState(null); // { skip: Set of line ids }
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
        if (s.balanceDue === undefined) s.balanceDue = "";
        ["confirmedDate", "productionDate", "shippedDate"].forEach((k) => { if (s[k] === undefined) s[k] = ""; });
        if (s.surchargeOn === undefined) s.surchargeOn = true;
        if (s.arrivedDate === undefined) s.arrivedDate = "";
        if (s.etaDate === undefined) s.etaDate = "";
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
  const { crm, updateCrm: updateCrmRaw, replaceCrm, crmError, loadCrm, crmSave, saveError, saveNotice, lastLive } = useCrm(crmOn);
  // read-only logins can look but not change: edits are ignored with a short note
  const updateCrm = (fn) => {
    if (!access.canEdit) { setRoNote(true); return; }
    updateCrmRaw(fn);
  };
  // drivers' full drop / pick-up confirmations close the job here
  // pop-up alerts only on the desktop of the login named in the tracking rates (Jon by default)
  // pop-up alerts: admin logins (plus anyone named in the tracking rates), on a desktop - never phones
  const alertsMine = !!crm && !isPhone && (storageMode !== "supabase" || access.role === "admin" || String(getSessionEmail() || "").toLowerCase() === String(fleetSettings(crm).alertsTo || "").toLowerCase());
  const dropSync = useDropSync({ crm, updateCrm: updateCrmRaw, me: storageMode === "supabase" ? getSessionEmail() || "" : "", enabled: !!crm && access.canEdit, alertsOn: alertsMine });
  // vans loaded short: alert + Delivery issues
  const shortLoads = useShortLoads({ enabled: !!crm && (access.canTab("issues") || alertsMine), alertsOn: alertsMine, me: storageMode === "supabase" ? getSessionEmail() || "" : "" });
  // live delivery issues, for the red count on the menu
  const [issueCount, setIssueCount] = useState(0);
  const crmRefForIssues = useRef(crm);
  crmRefForIssues.current = crm;
  const loadsRef = useRef([]);
  loadsRef.current = shortLoads.reports;
  useEffect(() => {
    if (!crm || !access.canTab("issues")) return;
    let live = true;
    const pull = () => loadAllDrops().then((l) => { const c = crmRefForIssues.current; if (live && c) setIssueCount(l.filter((r) => !r.voidedAt && issueOf(r, c).live).length + loadsRef.current.filter((x) => shortIssueOf(x, c).live).length); }).catch(() => {});
    pull();
    const t = setInterval(pull, 90000);
    return () => { live = false; clearInterval(t); };
  }, [!!crm, access.role, tab, shortLoads.reports]);
  // samples waiting to be posted: red count on Samples
  const samplesToSend = useMemo(() => (crm && crm.samples ? crm.samples.filter((x) => { try { return sampleStatus(x, crm) === "To send"; } catch (e) { return false; } }).length : 0), [crm && crm.samples, crm && crm.invoices]);
  const sampleFollowUps = useMemo(() => (crm && crm.samples ? crm.samples.filter((x) => { try { const st = sampleStatus(x, crm); return st === "Follow-up due" || st === "2nd follow-up due"; } catch (e) { return false; } }).length : 0), [crm && crm.samples, crm && crm.invoices]);
  const reviewsDue = useMemo(() => { if (!crm) return 0; try { const n = reviewAskCounts(crm); return n.email + n.wa + n.nudges; } catch (e) { return 0; } }, [crm]);
  const [reviewsFocus, setReviewsFocus] = useState(null); // jump into Reviews with a filter pre-set (from Home)
  const openReviews = (f) => { setReviewsFocus({ f, at: Date.now() }); setTab("reviews"); };
  const [phonePick, setPhonePick] = useState(false); // admin / manager: open the driver or loading app
  const canPhoneApps = storageMode !== "supabase" || access.role === "admin" || access.role === "manager";
  // vans loaded and waiting for a second person to double-check: blue count on Loading
  const [checkCount, setCheckCount] = useState(0);
  useEffect(() => {
    if (!crm || !access.canTab("loading") || !access.canEdit) return;
    let live = true;
    const who = storageMode === "supabase" ? getSessionEmail() || "" : "";
    const pull = () => {
      const ds = Array.from({ length: 7 }, (_, k) => { const d = new Date(); d.setDate(d.getDate() + k - 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); });
      loadLoading(ds).then((d) => live && setCheckCount(Object.values(d.reports).filter((r) => canCheck(r, who)).length)).catch(() => {});
    };
    pull();
    const t = setInterval(pull, 60000);
    return () => { live = false; clearInterval(t); };
  }, [!!crm, access.role, tab]);
  const trackAlerts = useTrackingAlerts({ crm, enabled: alertsMine && access.canTab("tracking") });
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
  const [newCollectionSignal, setNewCollectionSignal] = useState(0);
  // menu and header buttons always land on the list, never on the last record that was open
  // where the header's back arrow goes: an open record → its list; a shipment → Imports
  const goBackTarget = () => {
    if (tab === "shipments") return { label: "all shipments", go: () => setTab("overview") };
    if (tab === "tasks") return { label: "Home", go: () => setTab("home") };
    const open = {
      customers: [selCustomerId, setSelCustomerId, "all customers"], invoices: [selInvoiceId, setSelInvoiceId, "all invoices"],
      collections: [selCollectionId, setSelCollectionId, "all collections"], quotes: [selQuoteId, setSelQuoteId, "all quotes"],
      samples: [selSampleId, setSelSampleId, "all samples"], purchases: [selPurchaseId, setSelPurchaseId, "all purchases"],
      suppliers: [selSupplierId, setSelSupplierId, "all suppliers"],
    }[tab];
    if (open && open[0]) return { label: open[2], go: () => open[1](null) };
    return null;
  };
  const navTo = (t) => {
    if (!access.canTab(t)) return;
    if (isPhone) setSideOpen(false);
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
  const [newVanSignal, setNewVanSignal] = useState(0);
  // delivery schedule side windows, opened/closed from the tabs in the title bar (remembered on this computer)
  const [schedPanels, setSchedPanels] = useState(() => {
    try { return { pending: true, loading: false, ...JSON.parse(localStorage.getItem("dk-sched-panels") || "{}") }; } catch (e) { return { pending: true, loading: false }; }
  });
  const setSchedPanel = (k, v) => setSchedPanels((p) => { const n = { ...p, [k]: v }; try { localStorage.setItem("dk-sched-panels", JSON.stringify(n)); } catch (e) { /* not kept */ } return n; });
  const [schedPending, setSchedPending] = useState(0);
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
    if (t === "collections") {
      setSelCollectionId(null);
      setNewCollectionSignal((n) => n + 1);
      setTab("collections");
      return;
    }
    if (t === "overview") { addShipment(); return; }
    if (t === "vans") { setNewVanSignal((n) => n + 1); setTab("vans"); return; }
    if (t === "purchases") newPurchase("");
    else if (t === "invoices") newInvoiceFor("", "");
    else if (t === "quotes") newQuoteFor("", "");
    else if (t === "samples") newSampleFor("");
  };
  const [invFilter, setInvFilter] = useState(null); // { customerId, outstanding }
  const [remindersClosed, setRemindersClosed] = useState(false); // closed for this visit

  useEffect(() => {
    if (CRM_TABS.includes(tab) || ["home", "tasks", "purchases", "suppliers", "activity", "stock", "collections", "vans", "tracking", "completions", "issues", "loading", "products"].includes(tab)) setCrmOn(true);
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

  const dueReminders = crm ? [...vanReminders(crm), ...reviewReminders(crm), ...sampleReminders(crm)] : [];
  const remVan = dueReminders.some((r) => r.kind !== "review" && r.kind !== "sample");
  const remRev = dueReminders.some((r) => r.kind === "review");
  const remSmp = dueReminders.some((r) => r.kind === "sample");
  const remKinds = [remVan, remRev, remSmp].filter(Boolean).length;
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
  // Follow-up job: something was missing or broken — a new £0 job for the same customer and address,
  // pointing back at the original, ready for the missing items to be added and posted / delivered
  const newFollowUp = (origId) => {
    if (!crm) return;
    const o = crm.invoices.find((x) => x.id === origId);
    if (!o) return;
    setConfirmBox({
      message: "Create a follow-up job for #" + (o.invNo || "—") + "? It's a new job for the same customer and address with no charge — add the missing or broken items, then book it on the Delivery Schedule or post it.",
      confirmLabel: "Create follow-up",
      action: () => {
        const n = blankInvoice(o.customerId, o.siteId);
        n.invNo = nextNumber(crm.invoices, "invNo", crm.numbering.invoice);
        n.raisedBy = me;
        n.orderRef = "Follow-up to #" + (o.invNo || "—");
        n.jobNotes = "Follow-up to invoice #" + (o.invNo || "—") + " — missing / broken: ";
        n.deliveryCharge = 0;
        n.discountPct = "";
        n.paymentDate = todayStr(); // nothing to pay, so it doesn't sit in "awaiting payment"
        updateCrm((c) => {
          c.invoices.unshift(n);
          c.numbering.invoice = (Number(n.invNo) || 0) + 1;
          return c;
        });
        setSelInvoiceId(n.id);
        setTab("invoices");
      },
    });
  };
  // van went out short: a no-charge follow-up job for that job's missing parts
  const followUpFromLoad = (rep, j) => {
    const o = (crm.invoices || []).find((x) => x.id === j.invId);
    if (!o) return;
    const n = blankInvoice(o.customerId, o.siteId);
    n.invNo = nextNumber(crm.invoices, "invNo", crm.numbering.invoice);
    n.raisedBy = me;
    n.orderRef = "Follow-up to #" + (o.invNo || "—");
    n.jobNotes = "Follow-up to #" + (o.invNo || "—") + " — not loaded on " + (rep.van || "the van") + " for " + prettyDate(rep.date) + (rep.notes ? ". Loader: " + rep.notes : "");
    n.deliveryCharge = 0;
    n.discountPct = "";
    n.paymentDate = todayStr();
    n.lines = j.items.map((x) => {
      const l = (o.lines || [])[x.idx] || {};
      return { ...blankLine(), code: l.code || x.code || "", description: l.description || x.text || "", colour: l.colour || x.colour || "", qty: x.missing, price: 0 };
    });
    if (!n.lines.length) n.lines = [blankLine()];
    updateCrm((c) => {
      c.invoices.unshift(n);
      c.numbering.invoice = (Number(n.invNo) || 0) + 1;
      return c;
    });
    shortLoads.followedUp(rep, j.invId, n.invNo).catch(() => {});
    setSelInvoiceId(n.id);
    setTab("invoices");
  };
  // driver closed a job with items left over: a no-charge follow-up job carrying what's still to deliver
  const followUpFromDrop = (r, o, left) => {
    const n = blankInvoice(o.customerId, o.siteId);
    n.invNo = nextNumber(crm.invoices, "invNo", crm.numbering.invoice);
    n.raisedBy = me;
    n.orderRef = "Follow-up to #" + (o.invNo || "—");
    n.jobNotes = "Follow-up to #" + (o.invNo || "—") + (left.length ? " — not delivered on " + prettyDate(String(r.at).slice(0, 10)) : "") + (String(r.notes || "").trim() ? ". Driver: " + r.notes.trim() : "");
    n.deliveryCharge = 0;
    n.discountPct = "";
    n.paymentDate = todayStr();
    n.lines = left.map((x) => {
      const l = (o.lines || [])[x.lineIndex] || {};
      return { ...blankLine(), code: l.code || x.code || "", description: l.description || x.text || "", colour: l.colour || x.colour || "", qty: x.remaining, price: 0 };
    });
    if (!n.lines.length) n.lines = [blankLine()];
    updateCrm((c) => {
      c.invoices.unshift(n);
      c.numbering.invoice = (Number(n.invNo) || 0) + 1;
      return c;
    });
    dropSync.followedUp(r, n.invNo);
    setSelInvoiceId(n.id);
    setTab("invoices");
  };
  const newInvoiceFor = (customerId, siteId) => {
    if (!crm) return;
    const n = blankInvoice(customerId, siteId);
    n.invNo = nextNumber(crm.invoices, "invNo", crm.numbering.invoice);
    n.raisedBy = me;
    if (siteId === TRADE_COUNTER) { n.jobType = "Customer Collection"; n.deliveryDate = n.date; }
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
          <div style={{ width: 46, height: 46, borderRadius: 12, background: GOLD, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: NAVY, fontSize: 22, marginBottom: 12 }}>
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
            style={{ fontFamily: "inherit", fontSize: 22, letterSpacing: 8, textAlign: "center", padding: "10px 12px", borderRadius: 8, border: "1px solid #33466b", background: "#122b52", color: "#fff", width: "100%", boxSizing: "border-box", marginBottom: 12 }}
          />
          <button
            onClick={tryUnlock}
            style={{ fontFamily: "inherit", fontSize: 15, fontWeight: 700, padding: "10px 0", borderRadius: 8, border: "1px solid " + GOLD, background: GOLD, color: NAVY, cursor: "pointer", width: "100%" }}
          >
            Unlock
          </button>
          {pinError && <div style={{ color: "#f2a6b1", fontSize: 13, fontWeight: 600, marginTop: 10 }}>{pinError}</div>}
          <div style={{ color: "#5a6a85", fontSize: 11.5, fontWeight: 600, marginTop: 16 }}>Forgotten it? Ask Claude in the chat to reset the PIN.</div>
        </div>
      </div>
    );

  const linesFilled = useRef(false);
  useEffect(() => {
    if (linesFilled.current || !loaded.current || !data || !data.shipments || !access.known || !access.canManage) return;
    linesFilled.current = true;
    const copy = JSON.parse(JSON.stringify(data));
    if (fillBlankLines(copy)) {
      dirty.current = true;
      setData((d0) => { const d = JSON.parse(JSON.stringify(d0)); fillBlankLines(d); return d; });
    }
  }, [data, access]);

  if (!data)
    return (
      <div style={{ fontFamily: "Quicksand, sans-serif", padding: 40, textAlign: "center", color: NAVY }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap');`}</style>
        Loading planner…
      </div>
    );

  const active = data.shipments.find((s) => s.id === activeId) || data.shipments[0];
  // shipment picker with ‹ › arrows to step through the records (same order as the list)
  const shipPicker = () => {
    const list = data.shipments;
    const i = active ? list.findIndex((s) => s.id === active.id) : -1;
    const arrow = (d) => {
      const x = i >= 0 ? list[i + d] : null;
      return (
        <button type="button" style={{ ...abtn, width: 36, height: 36, opacity: x ? 1 : 0.4, cursor: x ? "pointer" : "default" }} disabled={!x} onClick={() => x && setActiveId(x.id)}
          title={x ? (d < 0 ? "Previous: " : "Next: ") + x.name : d < 0 ? "First shipment" : "Last shipment"}>
          <span style={{ display: "inline-flex", transform: d < 0 ? "rotate(90deg)" : "rotate(-90deg)" }}><Icon name="back" stroke={NAVY} /></span>
        </button>
      );
    };
    return (
      <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
        <select value={active ? active.id : ""} onChange={(e) => setActiveId(e.target.value)} style={{ ...inp, width: "auto", minWidth: 220, fontWeight: 600 }}>
          {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {arrow(-1)}
        {arrow(1)}
        {i >= 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#8593a8" }}>{i + 1} of {list.length}</span>}
      </div>
    );
  };

  const update = (fn) => {
    // products and shipments: managers and admin only
    if (!access.canManage) { if (access.known) setRoNote(true); return; }
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
    copy.balanceDue = "";
    copy.confirmedDate = ""; copy.productionDate = ""; copy.shippedDate = "";
    copy.arrivedDate = "";
    copy.etaDate = "";
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

  // a new line straight after this one, same product (pick another from the box)
  const addLineAfter = (lineId) =>
    updateShipment((s) => {
      const at = s.lines.findIndex((x) => x.id === lineId);
      const src = s.lines[at];
      const prod = src && data.products.find((x) => x.id === src.productId);
      s.lines.splice(at + 1, 0, {
        id: uid(),
        productId: prod ? prod.id : "",
        colour: prod && prod.colours[0] ? prod.colours[0] : "",
        pallets: 1,
        qty: prod ? prod.qty : 0,
        cost: prod ? prod.cost : 0,
        weight: prod ? prod.weight : 0,
      });
    });
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
    updateShipment((s, d) => {
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
        // a real figure typed on a line becomes the product's default, so it fills in next time
        if (field !== "pallets" && Number(value) > 0) {
          const p = d.products.find((x) => x.id === l.productId);
          if (p) p[field] = Number(value);
        }
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
      if (s) {
        s[field] = value;
        // moving to a stage stamps that stage's date (if it hasn't one already)
        if (field === "status" && STAGE_DATE[value] && !s[STAGE_DATE[value]]) s[STAGE_DATE[value]] = todayStr();
      }
      return d;
    });

  // balance falls due 30 days after the goods land: the real arrived date once entered, else the expected delivery.
  // Shipments already marked Paid keep the date they had.
  const balanceFromArrival = (s) => !!s.arrivedDate && s.status !== "Paid";
  // expected delivery: typed in (etaDate, also the Completion tab's "Expected in"), else order date + 3 months
  const autoEta = (s) => (s.orderDate ? addMonths(s.orderDate, 3) : "");
  const etaOf = (s) => s.etaDate || autoEta(s);
  const etaInput = (s, big) => {
    const manual = !!s.etaDate;
    return (
      <span style={{ display: big ? "inline-flex" : "flex", alignItems: "center", gap: 4 }}>
        <DateInput value={etaOf(s) || ""} onChange={(e) => setShipmentField(s.id, "etaDate", e.target.value)}
          title={manual ? "Set by hand — the automatic date would be " + (prettyDate(autoEta(s)) || "—") : "Automatic: 3 months after the order date. Change it to set your own."}
          style={{ ...inp, width: big ? 160 : "100%", minWidth: 0, fontSize: big ? 14 : 11.5, padding: big ? undefined : "6px 5px", fontWeight: manual ? 700 : 400,
            ...(manual ? { borderColor: GOLD, background: "#fff8e6" } : {}) }} />
        {manual && (
          <button type="button" onClick={() => setShipmentField(s.id, "etaDate", "")} title={"Back to automatic (" + (prettyDate(autoEta(s)) || "—") + ")"}
            style={{ fontFamily: "inherit", border: "none", background: "none", cursor: "pointer", color: "#8593a8", fontSize: 15, padding: 2, lineHeight: 1 }}>↺</button>
        )}
      </span>
    );
  };
  // (paid shipments keep the date they always had)
  const autoBalanceDate = (s) => addDays(balanceFromArrival(s) ? s.arrivedDate : s.status === "Paid" ? addMonths(s.orderDate, 3) : etaOf(s), 30);
  // a date typed in (balanceDue) wins; clear it to go back to the automatic one
  const balanceDate = (s) => s.balanceDue || autoBalanceDate(s);
  const balanceInput = (s, big) => {
    const manual = !!s.balanceDue;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <DateInput value={balanceDate(s) || ""} onChange={(e) => setShipmentField(s.id, "balanceDue", e.target.value)}
          title={manual ? "Set by hand — the automatic date would be " + prettyDate(autoBalanceDate(s)) : balanceFromArrival(s) ? "Automatic: 30 days after it arrived. Change it to set your own." : "Automatic: 30 days after expected delivery. Change it to set your own."}
          style={{ ...inp, width: big ? 160 : manual ? 84 : 104, fontSize: big ? 14 : 11.5, padding: big ? undefined : "6px 5px", fontWeight: manual || balanceFromArrival(s) ? 700 : 400,
            ...(manual ? { borderColor: GOLD, background: "#fff8e6" } : {}) }} />
        {manual && (
          <button type="button" onClick={() => setShipmentField(s.id, "balanceDue", "")} title={"Back to automatic (" + prettyDate(autoBalanceDate(s)) + ")"}
            style={{ fontFamily: "inherit", border: "none", background: "none", cursor: "pointer", color: "#8593a8", fontSize: 15, padding: 2, lineHeight: 1 }}>↺</button>
        )}
      </span>
    );
  };

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
      ["Planned order date", active.orderDate ? prettyDate(active.orderDate) : "—"],
      ["Expected delivery", etaOf(active) ? prettyDate(etaOf(active)) : "—"],
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

  // what past shipments say each product's $/pc (and qty/kg where blank) should be — latest order date wins
  const pastPriceFixes = () => {
    const seen = {};
    const ships = data.shipments.map((s, i) => ({ s, i })).sort((a, b) => String(b.s.orderDate || "").localeCompare(String(a.s.orderDate || "")) || a.i - b.i);
    ships.forEach(({ s }) => [...(s.lines || [])].reverse().forEach((l) => {
      const k = l.productId; if (!k) return;
      const r = (seen[k] = seen[k] || {});
      ["cost", "qty", "weight"].forEach((f) => { if (r[f] === undefined && Number(l[f]) > 0) r[f] = { v: Number(l[f]), from: s.name }; });
    }));
    const out = [];
    data.products.forEach((p) => {
      const r = seen[p.id]; if (!r) return;
      const ch = {};
      if (r.cost && !(Number(p.cost) > 0)) ch.cost = r.cost;
      if (r.qty && !(Number(p.qty) > 0)) ch.qty = r.qty;
      if (r.weight && !(Number(p.weight) > 0)) ch.weight = r.weight;
      if (Object.keys(ch).length) out.push({ p, ch });
    });
    return out;
  };
  const applyPastPrices = (fixes) =>
    update((d) => {
      fixes.forEach(({ p, ch }) => { const x = d.products.find((y) => y.id === p.id); if (x) Object.entries(ch).forEach(([f, r]) => { x[f] = r.v; }); });
      fillBlankLines(d);
      return d;
    });


  const setProduct = (pid, field, value) =>
    update((d) => {
      const p = d.products.find((x) => x.id === pid);
      if (!p) return d;
      if (field === "colours") p.colours = value.split(",").map((c) => c.trim()).filter(Boolean);
      else if (field === "qty" || field === "cost" || field === "weight" || field === "cbm" || field === "salePrice" || field === "costGbp") p[field] = value === "" ? "" : Number(value);
      else if (field === "code") p.code = cleanCode(value);
      else if (field === "name") { p.code = codeFollowsName(p, value, codeSource(p.code) || "DK"); p.name = value; }
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
      {canPhoneApps && open && (
        <button onClick={() => { setSideOpen(false); setPhonePick(true); }} style={{ display: "block", width: "calc(100% - 22px)", margin: "0 11px 10px", padding: "8px 10px", borderRadius: 8, border: "1px solid " + GOLD, background: "transparent", color: GOLD, fontFamily: "inherit", fontWeight: 800, fontSize: 12.5, cursor: "pointer", textAlign: "left" }}>
          🚚 Driver / loading app
        </button>
      )}
      {storageMode === "supabase" && open && (
        <div style={{ color: "#5f729a", fontSize: 11, fontWeight: 700, padding: "0 11px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={getSessionEmail() || ""}>
          {getSessionEmail()}
        </div>
      )}
      {storageMode === "supabase" && open && access.known && (
        <div style={{ color: "#5f729a", fontSize: 10.5, fontWeight: 700, padding: "0 11px 6px", letterSpacing: 0.3, textTransform: "uppercase" }}>
          {levelLabel(access.role)}{access.readOnly ? " · read only" : ""}
        </div>
      )}
      {access.money && (
      <button onClick={backupJson} title="Copy or download all data as a backup" style={footBtnStyle(open)}>
        <Icon name="doc" size={15} stroke="#8fa0c0" />
        {open && "Backup"}
      </button>
      )}
      {access.system && (
      <button onClick={() => restoreInput.current && restoreInput.current.click()} title="Restore from a backup file" style={footBtnStyle(open)}>
        <Icon name="note" size={15} stroke="#8fa0c0" />
        {open && "Restore"}
      </button>
      )}
      {emailReady && access.system && (
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
    borderRadius: 8,
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
        .dk-bin:hover svg { stroke: ${RED}; }
        /* ===== phones ===== */
        @media (max-width: 760px) {
          /* page wrappers and cards: less padding so content gets the width */
          div[style*="padding: 18px 22px"] { padding: 12px 10px 20px !important; }
          div[style*="padding: 16px 18px"] { padding: 12px 12px !important; }
          div[style*="padding: 20px 22px"], div[style*="padding: 16px 22px"], div[style*="padding: 18px 22px"][style*="border-radius"] { padding: 14px 14px !important; }
          /* Home: one column */
          .dk-home-grid { grid-template-columns: 1fr !important; }
          .dk-home-cell { grid-column: auto !important; }
          /* stop iOS zooming in on every field */
          input, select, textarea { font-size: 16px !important; }
          h2 { font-size: 18px !important; }
          /* wide tables scroll sideways inside their card instead of squashing or pushing the page wider */
          div:has(> table) { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          table:has(th:nth-child(5)), table:has(td:nth-child(5)) { min-width: 640px; }
          /* tool bars that stick under the header on desktop just scroll away on phones */
          div[style*="position: sticky"][style*="z-index: 15"], div[style*="position: sticky"][style*="z-index: 16"] { position: static !important; }
          /* pop-overs and dialogs never wider than the screen */
          div[style*="position: fixed"][style*="width:"] { max-width: calc(100vw - 16px) !important; }
        }
        @media print {
          .no-print, button { display: none !important; }
          body { background: #fff !important; }
          input, select { border-color: transparent !important; background: transparent !important; appearance: none; -webkit-appearance: none; }
          input[type="date"]::-webkit-calendar-picker-indicator { display: none; }
        }`}</style>

      {access.known && !access.staff && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#f3f5f8", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e6e9ef", padding: "26px 28px", maxWidth: 420, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Your login doesn't have access yet</div>
            <div style={{ fontSize: 14, color: "#5a6a85", marginBottom: 18 }}>
              Signed in as {getSessionEmail()}. Ask Jon to give this email an access level in Users &amp; access, then reload this page.
            </div>
            <button onClick={() => signOut()} style={{ fontFamily: "inherit", fontSize: 14, fontWeight: 700, padding: "9px 18px", borderRadius: 8, border: "1px solid " + GOLD, background: GOLD, color: NAVY, cursor: "pointer" }}>Sign out</button>
          </div>
        </div>
      )}
      {roNote && (() => {
        return (
          <div className="no-print" style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", zIndex: 150, background: NAVY, color: "#fff", borderRadius: 999, padding: "10px 20px", fontSize: 13.5, fontWeight: 700, boxShadow: "0 8px 24px rgba(11,31,63,.3)" }}>
            {access.readOnly ? "Your login is read only — nothing was changed." : "Only managers can change this — nothing was changed."}
          </div>
        );
      })()}
      <div style={{ display: "flex", alignItems: "stretch" }}>
      <Sidebar phone={isPhone} tab={tab} setTab={navTo} open={sideOpen} footer={sideFooter} onNew={access.canEdit ? (t) => { if (isPhone) setSideOpen(false); sideNew(t); } : null} canNew={(t) => (["overview", "vans", "purchases", "suppliers"].includes(t) ? access.canManage : access.canEdit)} onToggle={() => setSideOpen((o) => !o)} allow={access.canTab} badges={{ issues: issueCount, loading: checkCount, reviews: [{ n: reviewsDue, title: reviewsDue + " ready to ask or nudge" }], samples: [{ n: samplesToSend, title: samplesToSend + " to send" }, { n: sampleFollowUps, bg: "#E8912D", title: sampleFollowUps + " follow-up" + (sampleFollowUps === 1 ? "" : "s") + " due" }] }} />
      <div style={{ flex: 1, minWidth: 0 }}>

      <div ref={headerRef} className="no-print" style={{ background: NAVY, padding: isPhone ? "8px 10px" : "10px 16px", display: "flex", alignItems: "center", gap: isPhone ? 6 : 10, position: "sticky", top: 0, zIndex: 25, boxShadow: "0 2px 8px rgba(11,31,63,0.25)" }}>
        {isPhone && (
          <button onClick={() => setSideOpen(true)} title="Menu" aria-label="Menu"
            style={{ width: 38, height: 38, borderRadius: 8, border: "1px solid #33466b", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none", padding: 0 }}>
            <Icon name="menu" size={18} stroke="#fff" />
          </button>
        )}
        {isPhone && canPhoneApps && (
          <button onClick={() => setPhonePick(true)} title="Driver / loading app" aria-label="Driver or loading app"
            style={{ height: 38, borderRadius: 8, border: "1px solid " + GOLD, background: GOLD, color: NAVY, fontFamily: "inherit", fontWeight: 800, fontSize: 13, cursor: "pointer", flex: "none", padding: "0 10px", order: 99 }}>
            🚚 Driver app
          </button>
        )}
        {/* back arrow + page name: back to this section's list (or to Imports from a shipment) */}
        {(() => {
          const back = goBackTarget();
          return (
            <button onClick={() => back && back.go()} disabled={!back} title={back ? "Back to " + back.label : ""}
              onMouseEnter={(e) => back && (e.currentTarget.style.background = "#ffffff12")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              style={{ background: "transparent", border: "none", borderRadius: 8, height: 34, display: "flex", alignItems: "center", gap: 10, cursor: back ? "pointer" : "default", flex: "none", padding: "0 10px 0 0", fontFamily: "inherit" }}>
              {back && (
                <span style={{ border: "1px solid #33466b", borderRadius: 8, width: 34, height: 34, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="chevleft" size={17} stroke="#cfd6e4" />
                </span>
              )}
              <span style={{ color: "#fff", fontWeight: 700, fontSize: isPhone ? 15 : 15.5, whiteSpace: "nowrap", paddingLeft: back ? 0 : 6, overflow: "hidden", textOverflow: "ellipsis", maxWidth: isPhone ? "46vw" : undefined }}>{TAB_LABELS[tab] || "Home"}</span>
            </button>
          );
        })()}
        {tab === "schedule" && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 6 }}>
            {[["loading", "Loading", "box", null], ["pending", "Pending", "clock", schedPending]].map(([k, label, icon, n]) => {
              const on = !!schedPanels[k];
              return (
                <button key={k} type="button" onClick={() => setSchedPanel(k, !on)} title={(on ? "Close" : "Open") + " the " + label.toLowerCase() + " window"}
                  style={{ height: 30, borderRadius: 999, border: "1px solid " + (on ? GOLD : "#33466b"), background: on ? GOLD : "transparent", color: on ? NAVY : "#cfd6e4", display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800 }}>
                  <Icon name={icon} size={14} stroke={on ? NAVY : "#cfd6e4"} />{label}
                  {n ? <span style={{ background: on ? NAVY : RED, color: "#fff", borderRadius: 999, fontSize: 11, padding: "1px 7px" }}>{n}</span> : null}
                </button>
              );
            })}
          </div>
        )}
        <span style={{ flex: 1 }} />
        <div style={{ display: isPhone ? "none" : "flex", gap: 4, alignItems: "center" }}>
          {[["home", "Home", "home"], ["overview", "Imports", "ship"], ["customers", "Customers", "users"], ["invoices", "Invoices", "doc"], ["quotes", "Quotes", "tag"], ["samples", "Samples", "leaf"], ["schedule", "Delivery Schedule", "cal"]].filter(([t]) => access.canTab(t)).map(([t, label, icon]) => (
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
        {access.known && access.readOnly && (
          <span title="Your login can look at everything it can open, but changes aren't saved" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: NAVY, background: GOLD, borderRadius: 999, padding: "3px 10px" }}>Read only</span>
        )}
        {crm && storageMode === "supabase" && (
          <span title={"Live: changes from FileMaker, the website and other staff appear by themselves within about 10 seconds" + (lastLive ? " — last pulled in at " + lastLive.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "")}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#8fa0c0", fontSize: 12 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3FA55C", boxShadow: "0 0 0 3px rgba(63,165,92,.25)" }} />Live
          </span>
        )}
        <span style={{ color: saveError ? "#ff8a9a" : "#8fa0c0", fontWeight: saveError ? 800 : 400, fontSize: 12, minWidth: 48, textAlign: "right" }}>{CRM_TABS.includes(tab) || saveError ? crmSave : saveState}</span>
      </div>

      {saveNotice && !saveError && (
        <div role="status" style={{ position: "fixed", left: "50%", bottom: 18, transform: "translateX(-50%)", zIndex: 900, width: "min(620px, calc(100vw - 32px))", boxSizing: "border-box", background: "#0B1F3F", color: "#fff", border: "2px solid #F4B73E", borderRadius: 12, padding: "12px 16px", boxShadow: "0 10px 30px rgba(11,31,63,.35)", fontSize: 14, fontWeight: 700 }}>
          🔢 {saveNotice}
        </div>
      )}
      {saveError && (
        <div role="alert" style={{ position: "fixed", left: "50%", bottom: 18, transform: "translateX(-50%)", zIndex: 900, width: "min(720px, calc(100vw - 32px))", boxSizing: "border-box", background: "#C8102E", color: "#fff", borderRadius: 12, padding: "12px 16px", boxShadow: "0 10px 30px rgba(11,31,63,.35)", fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>
          <b style={{ display: "block", fontSize: 15, marginBottom: 3 }}>⚠ Not saved — don't refresh or close this page</b>
          {saveError}
          <span style={{ display: "block", marginTop: 4, opacity: 0.85, fontSize: 12.5 }}>Retrying every 15 seconds.{crmSave === "Partly saved" ? " Everything else has saved; only what's named above is held back." : ""} Send Jon a screenshot of this.</span>
        </div>
      )}

      {tab === "home" && (
        <>
          {crmError && (
            <div style={{ maxWidth: 1140, margin: "14px auto 0", padding: "0 22px" }}>
              <div style={{ background: "#C8102E10", border: "1px solid #ecc4cb", borderRadius: 12, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13, fontWeight: 600, color: "#8a0b20" }}>
                <span style={{ flex: 1 }}>
                  Couldn't load the customer/stock data — usually a migration hasn't been run in Supabase yet (latest: 012_vans.sql). Nothing is lost.
                </span>
                <button onClick={loadCrm} style={{ ...btn, padding: "6px 12px", fontSize: 12.5, background: GOLD, borderColor: GOLD }}>Retry</button>
              </div>
            </div>
          )}
          <HomeScreen money={access.money} canTab={access.canTab} data={data} crm={crm} updateCrm={updateCrm} me={me} askConfirm={setConfirmBox} setTab={setTab} openInvoice={openInvoice} openCollection={openCollection} openShipment={(id) => { setActiveId(id); setTab("shipments"); }} openReviews={openReviews} addShipment={addShipment} newInvoice={() => (crm ? newInvoiceFor("", "") : setTab("invoices"))} />
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
      {tab === "users" && access.system && storageMode === "supabase" && <UsersScreen me={me} />}

      {tab === "tracking" && access.canTab("tracking") &&
        (!crm ? (
          <div style={{ padding: 40, textAlign: "center", color: "#5a6a85", fontWeight: 600 }}>Loading driver tracking…</div>
        ) : (
          <TrackingScreen crm={crm} updateCrm={updateCrm} openInvoice={openInvoice} openCollection={openCollection} canSettings={access.system} me={me} />
        ))}

      {tab === "loading" && access.canTab("loading") &&
        (!crm ? (
          <div style={{ padding: 40, textAlign: "center", color: "#5a6a85", fontWeight: 600 }}>Loading the vans…</div>
        ) : (
          <LoadingScreen crm={crm} me={me} canEdit={access.canEdit} canManage={access.canManage} openInvoice={openInvoice} openCollection={openCollection} />
        ))}

      {tab === "issues" && access.canTab("issues") &&
        (!crm ? (
          <div style={{ padding: 40, textAlign: "center", color: "#5a6a85", fontWeight: 600 }}>Loading delivery issues…</div>
        ) : (
          <IssuesScreen crm={crm} updateCrm={updateCrm} me={me} openInvoice={openInvoice} openCollection={openCollection} newFollowUpFromDrop={followUpFromDrop} canEdit={access.canEdit} onLiveCount={setIssueCount} shortLoads={shortLoads} onLoadFollowUp={followUpFromLoad} />
        ))}

      {tab === "completions" && access.canTab("completions") &&
        (!crm ? (
          <div style={{ padding: 40, textAlign: "center", color: "#5a6a85", fontWeight: 600 }}>Loading completions…</div>
        ) : (
          <CompletionsScreen crm={crm} updateCrm={updateCrm} openInvoice={openInvoice} openCollection={openCollection} me={me} isAdmin={access.system} />
        ))}

      {tab === "vans" &&
        (!crm ? (
          <div style={{ padding: 40, textAlign: "center", color: "#5a6a85", fontWeight: 600 }}>Loading vans…</div>
        ) : (
          <VansScreen crm={crm} updateCrm={updateCrm} askConfirm={setConfirmBox} me={me} newSignal={newVanSignal} />
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
          <CustomersScreen money={access.money}
            onEmailSetup={() => setEmailSettings(true)}
            crm={crm}
            updateCrm={updateCrm}
            askConfirm={setConfirmBox}
            selId={selCustomerId}
            setSelId={setSelCustomerId}
            openInvoice={openInvoice}
            newInvoiceFor={newInvoiceFor}
            newFollowUp={newFollowUp}
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
          <SamplesScreen money={access.money}
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
          <QuotesScreen openProduct={openProduct} money={access.money}
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
          <InvoicesScreen headerH={headerH} openProduct={openProduct} money={access.money}
            newFollowUp={newFollowUp}
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
        ) : tab === "reviews" ? (
          <ReviewsScreen crm={crm} updateCrm={updateCrm} askConfirm={setConfirmBox} openInvoice={openInvoice} goCustomer={goCustomer} focus={reviewsFocus} />
        ) : (
          <ScheduleScreen headerH={headerH} panels={schedPanels} setPanel={setSchedPanel} onPendingCount={setSchedPending} openProduct={openProduct} money={access.money} crm={crm} updateCrm={updateCrm} askConfirm={setConfirmBox} openInvoice={openInvoice} openCollection={openCollection} me={me} planner={data} goCustomer={goCustomer} newFollowUp={newFollowUp} />
        ))}

      {(tab === "stock" || tab === "collections") &&
        (!crm ? (
          <div style={{ padding: 40, textAlign: "center", color: "#5a6a85", fontWeight: 600 }}>Loading stock…</div>
        ) : tab === "stock" ? (
          <StockScreen crm={crm} updateCrm={updateCrm} planner={data} updatePlanner={update} askConfirm={setConfirmBox} me={me} />
        ) : (
          <CollectionsScreen openProduct={openProduct} money={access.money} crm={crm} updateCrm={updateCrm} askConfirm={setConfirmBox} selId={selCollectionId} setSelId={setSelCollectionId} openInvoice={openInvoice} me={me} goSupplier={access.canTab("suppliers") ? goSupplier : null} planner={data} newSignal={newCollectionSignal} />
        ))}

      {tab === "overview" && (
        <div style={{ padding: "18px 22px", maxWidth: 1760, margin: "0 auto" }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 14px" }}>All shipments</h2>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e6e9ef", padding: "4px 12px 12px", overflowX: "auto", overflowY: "auto", maxHeight: "max(320px, calc(100vh - " + (headerH + 130) + "px))" }}>
            <table className="dk-sticky-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 1460, tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 108 }}>Shipment</th>
                  <th style={{ ...th }}>Products</th>
                  <th style={{ ...th, width: 78, textAlign: "right" }}>Weight</th>
                  <th style={{ ...th, width: 116 }}>Status</th>
                  {[["Planned order"], ["Confirmed"], ["In production"], ["Shipped"], ["Expected delivery", true], ["Arrived"], ["Expected balance"], ["Balance paid"]].map(([h, calc]) => (
                    <th key={h} style={{ ...th, width: 104, fontSize: 11.5, whiteSpace: "normal", padding: "10px 4px" }}>{h}</th>
                  ))}
                  <th style={{ ...th, width: 36 }}></th>
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
                          className="dk-title-link" title={"Open " + s.name}
                          style={{ fontSize: 14, fontWeight: 700, color: NAVY }}
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
                      {(() => {
                        // one date per stage: filled in when the status moves on, editable by hand
                        const dateCell = (k) => (
                          <td style={{ ...td, padding: "6px 4px" }}>
                            <DateInput value={s[k] || ""} placeholder="—" onChange={(e) => setShipmentField(s.id, k, e.target.value)}
                              style={{ ...inp, width: "100%", fontSize: 11.5, padding: "6px 5px", fontWeight: s[k] ? 700 : 400, ...(s[k] ? { background: "#fff" } : { background: "#ffffffaa", color: "#8593a8" }) }} />
                          </td>
                        );
                        return <>
                          {dateCell("orderDate")}
                          {dateCell("confirmedDate")}
                          {dateCell("productionDate")}
                          {dateCell("shippedDate")}
                          <td style={{ ...td, padding: "6px 4px", whiteSpace: "nowrap" }}>{etaInput(s, false)}</td>
                          {dateCell("arrivedDate")}
                          <td style={{ ...td, padding: "6px 4px", whiteSpace: "nowrap" }}>{balanceInput(s, false)}</td>
                          {dateCell("balancePaidDate")}
                        </>;
                      })()}
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
                    <td colSpan={14} style={{ ...td, textAlign: "center", color: "#5a6a85", padding: 24 }}>
                      No shipments yet — create one from the Shipments tab.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12.5, color: "#5a6a85", marginTop: 10 }}>
            Expected delivery is the planned order date plus a 3 month turnaround (or the date you type in); expected balance is 30 days after delivery — or 30 days after the arrived date once that's entered (paid shipments keep their original date). Type your own expected delivery or balance date to override it; ↺ puts it back. Click a shipment name to open it.
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
                      borderRadius: 12,
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

      {prodPop && prodPop.mode === "new" && (() => {
        // add a brand-new product from the shipment and put it on this line
        const line = active && active.lines.find((x) => x.id === prodPop.lineId);
        const dft = prodPop.draft;
        const setD = (k, v) => setProdPop((pp) => ({ ...pp, draft: { ...pp.draft, [k]: v } }));
        const W = 400;
        const below = prodPop.rect.bottom + 470 < window.innerHeight;
        const f = { width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: NAVY, border: "1px solid #d5d9e0", borderRadius: 8, padding: "8px 10px" };
        const l_ = { display: "block", fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", margin: "10px 0 4px" };
        const n = (v) => (v === "" || v === undefined ? 0 : Number(v) || 0);
        const ok = String(dft.name || "").trim();
        const create = () => {
          if (!ok) return;
          const id = uid();
          const colours = String(dft.colours || "").split(",").map((c) => c.trim()).filter(Boolean);
          update((d) => {
            d.products.unshift({ id, code: cleanCode(dft.code || ""), name: dft.name.trim(), colours, qty: n(dft.qty), cost: n(dft.cost), weight: n(dft.weight), cbm: 0,
              supplier: (active && active.supplier) || "", category: "", salePrice: "", costGbp: "" });
            const sh = active && d.shipments.find((x) => x.id === active.id);
            if (sh) {
              const l = sh.lines.find((x) => x.id === prodPop.lineId);
              const vals = { productId: id, colour: colours[0] || "", qty: n(dft.qty), cost: n(dft.cost), weight: n(dft.weight) };
              if (l) Object.assign(l, vals);
              else sh.lines.push({ id: uid(), pallets: 1, ...vals });
            }
            return d;
          });
          setProdPop(null);
        };
        return (
          <>
            <div onMouseDown={() => setProdPop(null)} style={{ position: "fixed", inset: 0, zIndex: 80 }} />
            <div style={{ position: "fixed", left: Math.max(10, Math.min(prodPop.rect.left - 10, window.innerWidth - W - 16)), ...(below ? { top: prodPop.rect.bottom + 6 } : { bottom: Math.max(10, window.innerHeight - prodPop.rect.top + 6) }),
              zIndex: 81, width: W, background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, boxShadow: "0 14px 40px rgba(11,31,63,.28)", padding: "14px 16px" }}>
              <b style={{ fontSize: 14.5, color: NAVY }}>New product</b>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "#8593a8", marginTop: 2 }}>{((active && active.supplier) || "No supplier") + (line ? " · goes on this line" : " · added as a new line")}</div>
              <span style={l_}>Product description</span>
              <input autoFocus style={f} value={dft.name || ""} placeholder="e.g. Fence Board 2.4m" onChange={(e) => setD("name", e.target.value)} />
              <span style={l_}>Code</span>
              <input style={f} value={dft.code || ""} placeholder="e.g. DK/2.4/FENCE" onChange={(e) => setD("code", e.target.value)} />
              <span style={l_}>Colours</span>
              <input style={f} value={dft.colours || ""} placeholder="Black, Grey, Teak" onChange={(e) => setD("colours", e.target.value)} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div><span style={l_}>Qty / pallet</span><input {...selectAllProps} type="number" min="0" step="any" style={{ ...f, textAlign: "right" }} value={dft.qty || ""} onChange={(e) => setD("qty", e.target.value)} /></div>
                <div><span style={l_}>$ / piece</span><input {...selectAllProps} type="number" min="0" step="any" style={{ ...f, textAlign: "right" }} value={dft.cost || ""} onChange={(e) => setD("cost", e.target.value)} /></div>
                <div><span style={l_}>kg / piece</span><input {...selectAllProps} type="number" min="0" step="any" style={{ ...f, textAlign: "right" }} value={dft.weight || ""} onChange={(e) => setD("weight", e.target.value)} /></div>
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "#8593a8", marginTop: 10 }}>Category, size and sale price can be filled in later on Products.</div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button onClick={() => setProdPop(null)} style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 13, background: "#fff", color: NAVY, border: "1px solid #d5d9e0", borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}>Cancel</button>
                <button onClick={create} disabled={!ok} style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 13, background: GOLD, color: NAVY, border: "none", borderRadius: 8, padding: "8px 16px", cursor: ok ? "pointer" : "default", opacity: ok ? 1 : 0.5 }}>Add product</button>
              </div>
            </div>
          </>
        );
      })()}

      {prodPop && prodPop.mode !== "new" && (() => {
        const p = data.products.find((x) => x.id === prodPop.productId);
        const line = active && active.lines.find((x) => x.id === prodPop.lineId);
        if (!p) return null;
        const W = Math.min(1180, window.innerWidth - 40);
        const below = prodPop.rect.top < window.innerHeight / 2;
        const f = { width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: NAVY, border: "1px solid #d5d9e0", borderRadius: 8, padding: "7px 10px", textAlign: "right" };
        const l_ = { display: "block", fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 };
        // this line's numbers: typing here also becomes the product's default for new lines
        const lineNum = (label, field) => (
          <div style={{ width: 130 }}>
            <span style={l_}>{label}</span>
            <input {...selectAllProps} type="number" min="0" step="any" style={f} value={line ? line[field] : p[field] === undefined || p[field] === null ? "" : p[field]}
              onChange={(e) => { const v = e.target.value === "" ? "" : Number(e.target.value); setProduct(p.id, field, v); if (line) setLine(line.id, field, v); }} />
          </div>
        );
        return (
          <>
            <div onMouseDown={() => setProdPop(null)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(11,31,63,.15)" }} />
            <div style={{ position: "fixed", left: Math.max(16, (window.innerWidth - W) / 2),
              ...(below ? { top: prodPop.rect.bottom + 6, maxHeight: window.innerHeight - prodPop.rect.bottom - 20 } : { bottom: window.innerHeight - prodPop.rect.top + 6, maxHeight: prodPop.rect.top - 20 }),
              overflowY: "auto", zIndex: 81, width: W, boxSizing: "border-box", background: "#f7f9fc", border: "1px solid #e6e9ef", borderRadius: 12, boxShadow: "0 14px 40px rgba(11,31,63,.28)", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <b style={{ fontSize: 15, color: NAVY }}>{p.name || "Product"}</b>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#8593a8" }}>{[p.code, p.supplier].filter(Boolean).join(" · ")}</span>
                <span style={{ flex: 1 }} />
                {prodPop.fromCrm ? null : prodPop.created ? <span style={{ fontSize: 12, fontWeight: 800, color: "#28713e", background: "#3FA55C22", borderRadius: 999, padding: "2px 10px" }}>New product</span>
                  : <button onClick={() => newProductOnLine(prodPop.lineId, "", prodPop.rect, p.code ? String(p.code).split("/").slice(0, -1).join("/") + "/" : "")}
                    style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 12, background: "none", border: "none", color: "#185FA5", cursor: "pointer", padding: 0 }}>+ New product instead</button>}
              </div>
              {line && (
                <div style={{ display: "flex", gap: 12, alignItems: "flex-end", background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, padding: "10px 12px", marginBottom: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, alignSelf: "center", minWidth: 120 }}>On this shipment line</div>
                  {lineNum("Qty / pallet", "qty")}
                  {lineNum("$ / piece", "cost")}
                  {lineNum("kg / piece", "weight")}
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "#8593a8", alignSelf: "center", flex: 1, minWidth: 180 }}>These set this line and become the product's default for new lines.</span>
                </div>
              )}
              <ProductEditor planner={data} update={update} updateCrm={updateCrm} crm={crm || { masterProducts: [] }} productId={p.id} removeProduct={(pid) => { setProdPop(null); removeProduct(pid); }} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                {prodPop.created && (
                  <button title="Throw this new product away" onClick={() => {
                      const prev = prodPop.prev;
                      update((d) => {
                        d.products = d.products.filter((x) => x.id !== p.id);
                        const sh = active && d.shipments.find((x) => x.id === active.id);
                        if (sh && line) { if (prev) Object.assign(sh.lines.find((x) => x.id === line.id) || {}, prev); else sh.lines = sh.lines.filter((x) => x.id !== line.id); }
                        return d;
                      });
                      setProdPop(null);
                    }}
                    style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 13, background: "#fff", color: NAVY, border: "1px solid #d5d9e0", borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}>Cancel</button>
                )}
                <button onClick={() => setProdPop(null)} style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 13, background: GOLD, color: NAVY, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>Done</button>
              </div>
            </div>
          </>
        );
      })()}

      {tab === "shipments" && (
        <div style={{ padding: "18px 22px", maxWidth: 1480, margin: "0 auto" }}>
          {(() => {
            const n = pastPriceFixes().length;
            if (!n) return null;
            return (
              <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff8e6", border: "1px solid #f3dc9c", borderRadius: 12, padding: "9px 14px", marginBottom: 12, fontSize: 13, fontWeight: 600, color: NAVY }}>
                <span>{n} product{n === 1 ? "" : "s"} can take {n === 1 ? "its" : "their"} price from past shipments, so it fills in by itself next time.</span>
                <span style={{ flex: 1 }} />
                <button onClick={() => setPriceReview(true)} style={{ ...btn, background: GOLD, border: "1px solid " + GOLD, padding: "6px 14px" }}>Review & update</button>
              </div>
            );
          })()}
          <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            {shipPicker()}
            <div style={{ flex: 1 }} />
            <button onClick={() => setLineRefresh({ skip: new Set() })} style={btn} disabled={!active}
              title="Compare this shipment's lines with the products' current $ / pc, qty / pallet and kg / pc">↻ Refresh prices</button>
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

              <div style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, padding: "12px 16px", display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
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
                  <DateInput
 
                    value={active.orderDate || ""}
                    onChange={(e) => setShipmentField(active.id, "orderDate", e.target.value)}
                    style={{ ...inp, width: "auto" }}
                  />
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ textAlign: "right" }}>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5a6a85", marginBottom: 2 }}>Expected delivery</span>
                  {etaInput(active, true)}
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5a6a85", marginBottom: 2 }}>Expected balance</span>
                  {balanceInput(active, true)}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16, position: "sticky", top: headerH, zIndex: 15, background: "#f3f5f8", padding: "8px 0", boxShadow: "0 6px 6px -6px rgba(11,31,63,0.15)" }}>
                {[
                  ["Pallets / Cartons", int(totals.pallets)],
                  ["Total pieces", int(totals.pieces)],
                  ["Total weight", int(Math.round(totals.kg)) + " kg"],
                  ["Total volume", (Math.round(totals.cbm * 10) / 10).toLocaleString("en-GB") + " m³"],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: "1px solid #e6e9ef" }}>
                    <div style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2 }}>{value}</div>
                  </div>
                ))}
                <div style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: "1px solid #e6e9ef" }}>
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

              <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e6e9ef", padding: "4px 12px 12px", overflowX: "auto", overflowY: "auto", maxHeight: "max(320px, calc(100vh - " + (headerH + 210) + "px))" }}>
                <table className="dk-sticky-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: 22, padding: 0 }}></th>
                      <th style={{ ...th, width: "34%", minWidth: 340 }}>Product</th>
                      <th style={{ ...th, width: "11%" }}>Colour</th>
                      <th style={{ ...th, width: "8%", textAlign: "right" }}>Pallets / Cartons</th>
                      <th style={{ ...th, width: "8%", textAlign: "right" }}>Qty / Pallet / Carton</th>
                      <th style={{ ...th, width: "6%", textAlign: "right" }}>Pieces</th>
                      <th style={{ ...th, width: "7%", textAlign: "right" }}>kg / pc</th>
                      <th style={{ ...th, width: "8%", textAlign: "right" }}>Total kg</th>
                      <th style={{ ...th, width: "7%", textAlign: "right" }}>$ / pc</th>
                      <th style={{ ...th, width: "8%", textAlign: "right" }}>Total $</th>
                      <th style={{ ...th, width: 64 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.lines.map((l) => {
                      const p = data.products.find((x) => x.id === l.productId);
                      const c = lineCalc(l);
                      return (
                        <tr key={l.id}
                          onDragOver={(e) => { if (dragLine && dragLine !== l.id) { e.preventDefault(); if (overLine !== l.id) setOverLine(l.id); } }}
                          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverLine((x) => (x === l.id ? null : x)); }}
                          onDrop={(e) => { e.preventDefault(); moveLine(dragLine, l.id); setDragLine(null); setOverLine(null); }}
                          style={{ opacity: dragLine === l.id ? 0.4 : 1, boxShadow: overLine === l.id ? "inset 0 3px 0 " + GOLD : "none" }}>
                          <td style={{ ...td, padding: "0 2px", width: 22 }}>
                            <span draggable className="no-print" title="Drag to move this line"
                              onDragStart={(e) => { e.dataTransfer.setData("text/plain", l.id); e.dataTransfer.effectAllowed = "move"; setDragLine(l.id); }}
                              onDragEnd={() => { setDragLine(null); setOverLine(null); }}
                              style={{ cursor: "grab", color: "#aab3c2", fontSize: 14, lineHeight: 1, padding: "6px 2px", userSelect: "none", display: "inline-block" }}>⋮⋮</span>
                          </td>
                          <td style={td}>
                            <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
                              {(() => {
                                // type to search, like the invoice line codes: name · code · colours
                                const opts = [
                                  ...lineOptions(l, (active.supplier || "").trim()).map((pr) => ({
                                    value: "pid:" + pr.id, label: [pr.name, pr.code, (pr.colours || []).join(" ")].join(" "),
                                    cells: [{ text: pr.name || "(no name)" }, { text: pr.code || "", style: { color: "#5a6a85", fontSize: 12 } }, { text: (pr.colours || []).join(", "), style: { color: "#8593a8", fontSize: 12 } }],
                                  })),
                                  { value: "pid:__new", label: "+ New product " + (prodDraft[l.id] || "") /* always offered, whatever's typed */, cells: [{ text: "+ New product…", style: { color: "#185FA5", fontWeight: 800 } }, { text: "" }, { text: "" }] },
                                ];
                                const typing = prodDraft[l.id] !== undefined;
                                return (
                                  <div style={{ flex: 1, minWidth: 0 }} data-prodbox={l.id}
                                    onBlur={() => setTimeout(() => setProdDraft((d) => { if (d[l.id] === undefined) return d; const n = { ...d }; delete n[l.id]; return n; }), 200)}>
                                    <SuggestInput options={opts} listWidth={620} cols="minmax(0,1fr) 150px 170px"
                                      value={typing ? prodDraft[l.id] : p ? p.name : ""} title={p ? p.name : ""}
                                      placeholder="Type to find a product…"
                                      onChange={(v) => {
                                        if (v === "pid:__new") {
                                          const box = document.querySelector('[data-prodbox="' + l.id + '"]');
                                          const typed = prodDraft[l.id];
                                          setProdDraft((d) => { const n = { ...d }; delete n[l.id]; return n; });
                                          return newProductOnLine(l.id, typed && typed !== (p && p.name) ? typed : "", box ? box.getBoundingClientRect() : { left: 300, top: 300, bottom: 330 });
                                        }
                                        if (String(v).startsWith("pid:")) { // picked from the list
                                          setProdDraft((d) => { const n = { ...d }; delete n[l.id]; return n; });
                                          return setLine(l.id, "productId", String(v).slice(4));
                                        }
                                        setProdDraft((d) => ({ ...d, [l.id]: v }));
                                      }} />
                                  </div>
                                );
                              })()}
                              {p && (
                                <button type="button" className="no-print" title="Edit this product's description and pallet qty"
                                  onClick={(e) => setProdPop({ productId: p.id, lineId: l.id, rect: e.currentTarget.getBoundingClientRect() })}
                                  style={{ width: 34, boxSizing: "border-box", borderRadius: 8, border: "1px solid #d5d9e0", background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flex: "none" }}>
                                  <Icon name="pen" size={14} stroke={NAVY} />
                                </button>
                              )}
                            </div>
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
                              <input {...selectAllProps}
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
                            <input {...selectAllProps} type="number" min="0" step="1" value={l.qty} onChange={(e) => setLine(l.id, "qty", e.target.value)} style={num} />
                          </td>
                          <td style={{ ...td, textAlign: "right", color: "#5a6a85" }}>{int(c.pieces)}</td>
                          <td style={td}>
                            <input {...selectAllProps} type="number" min="0" step="0.1" value={l.weight} onChange={(e) => setLine(l.id, "weight", e.target.value)} style={num} />
                          </td>
                          <td style={{ ...td, textAlign: "right", color: "#5a6a85", whiteSpace: "nowrap" }}>{int(Math.round(c.kg))} kg</td>
                          <td style={td}>
                            <input {...selectAllProps} type="number" min="0" step="0.01" value={l.cost} onChange={(e) => setLine(l.id, "cost", e.target.value)} style={num} />
                          </td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{money(c.total)}</td>
                          <td style={{ ...td, textAlign: "center", whiteSpace: "nowrap" }}>
                            <button className="no-print" onClick={() => addLineAfter(l.id)} title="Add a line below this one" style={{ ...btn, padding: "4px 7px", color: "#28713e", border: "none", background: "transparent", fontSize: 17, fontWeight: 700, lineHeight: 1 }}>
                              +
                            </button>
                            <button onClick={() => removeLine(l.id)} title="Remove line" style={{ ...btn, padding: "4px 7px", color: RED, border: "none", background: "transparent" }}>
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr onDragOver={(e) => { if (dragLine) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); moveLine(dragLine, null); setDragLine(null); setOverLine(null); }}>
                      <td colSpan={11} style={{ padding: "10px 8px" }}>
                        <button onClick={addLine} style={{ ...btn, border: "1px dashed #b9c2d0", width: "100%" }}>
                          + Add line
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 12.5, color: "#5a6a85", marginTop: 10 }}>
                Picking a product pre-fills qty per pallet, $ / pc and kg from your product list. Changing them on a line updates the product too, so next time they fill in by themselves. Everything saves automatically.
              </p>
            </>
          )}
        </div>
      )}

      {tab === "completion" && (
        <div style={{ padding: "18px 22px", maxWidth: 720, margin: "0 auto" }}>
          <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10, position: "sticky", top: headerH, zIndex: 16, background: "#f3f5f8", padding: "8px 0" }}>
            {shipPicker()}
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
                <div style={{ background: stageTint(active.status) || "#fff", borderRadius: 12, border: "1px solid " + (active.status !== "Planning" && STATUS_COLOURS[active.status] ? STATUS_COLOURS[active.status] : "#e6e9ef"), padding: "18px 20px" }}>
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
                  <div style={{ background: "#f8f9fb", border: "1px solid #e6e9ef", borderRadius: 12, padding: "8px 16px", marginBottom: 20 }}>
                    {[
                      ["1", "Order date", "orderDate", null],
                      ["2", "Deposit paid", "depositDate", ["depositUsd", "depositFx", 0.3]],
                      ["3", "Expected in", "etaDate", null],
                      ["4", "Arrived", "arrivedDate", null],
                      ["5", "Balance paid", "balancePaidDate", ["balanceUsd", "balanceFx", 0.7]],
                    ].map(([n, label, field, pay], idx) => {
                      const set = !!active[field];
                      return (
                        <div key={field} style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", padding: "10px 0", borderBottom: idx < 4 ? "1px solid #eef0f4" : "none" }}>
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
                            <DateInput value={active[field] || ""} onChange={(e) => setShipmentField(active.id, field, e.target.value)} style={{ ...inp, width: 160, maxWidth: "100%" }} />
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
                                <input {...selectAllProps}
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
                                <input {...selectAllProps}
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

                  <div style={{ background: "#f8f9fb", border: "1px solid #e6e9ef", borderRadius: 12, padding: "6px 16px 12px" }}>
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
                        <input {...selectAllProps}
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
                      <input {...selectAllProps}
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
            {shipPicker()}
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
                  <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e6e9ef", padding: "14px 16px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, flexWrap: "wrap", position: "sticky", top: headerH + 62, zIndex: 15, boxShadow: "0 6px 10px -6px rgba(11,31,63,0.18)" }}>
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
                  <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e6e9ef", padding: "4px 12px 12px", overflowX: "auto", overflowY: "auto", maxHeight: "max(320px, calc(100vh - " + (headerH + 170) + "px))" }}>
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
                            <td colSpan={14} style={{ ...td, textAlign: "center", color: "#5a6a85", padding: 24 }}>
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
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 560, overflow: "hidden", boxShadow: "0 24px 70px rgba(11,31,63,0.5)" }}>
            <div style={{ background: "linear-gradient(135deg,#C8102E 0%,#8a0b20 100%)", padding: "18px 22px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 26 }}>{remKinds > 1 ? "⏰" : remVan ? "🚐" : remRev ? "⭐" : "🌿"}</span>
              <div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>{remKinds > 1 ? "Reminders" : remVan ? "Van reminders" : remRev ? "Review routine" : "Sample follow-ups"}</div>
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
                {remVan && "Weekly checks come back every Monday until recorded; renewals nag weekly from a month out until the date is moved on. "}
                {remRev && "Tuesday is review day: morning — reply to new reviews, tick them in, send the group email; from 3pm — the WhatsApp session with any nudges. Each stays until dismissed, then rests for the week. "}
                {remSmp && "Monday is sample day: chase the follow-ups while the weekend's deliberating is fresh."}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, padding: "0 22px 18px", flexWrap: "wrap" }}>
              {remVan && (
                <button onClick={() => { setRemindersClosed(true); setTab("vans"); }}
                  style={{ ...btn, background: GOLD, borderColor: GOLD, fontWeight: 700 }}>
                  Go to Vans
                </button>
              )}
              {remRev && (
                <button onClick={() => { setRemindersClosed(true); setTab("reviews"); }}
                  style={{ ...btn, background: remVan ? undefined : GOLD, borderColor: remVan ? undefined : GOLD, fontWeight: 700 }}>
                  Go to Reviews
                </button>
              )}
              {remSmp && (
                <button onClick={() => { setRemindersClosed(true); setTab("samples"); }}
                  style={{ ...btn, background: remVan || remRev ? undefined : GOLD, borderColor: remVan || remRev ? undefined : GOLD, fontWeight: 700 }}>
                  Go to Samples
                </button>
              )}
              <button onClick={snoozeReminders} style={btn}>Done / snooze this week</button>
              <span style={{ flex: 1 }} />
              <button onClick={() => setRemindersClosed(true)} style={{ ...btn, border: "none", color: "#8593a8" }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {dueTasks.length > 0 && !taskPopClosed && !taskSnoozedToday && !locked && (remindersClosed || dueReminders.length === 0) && (
        <div style={{ position: "fixed", inset: 0, zIndex: 55, background: "rgba(11,31,63,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 540, overflow: "hidden", boxShadow: "0 24px 70px rgba(11,31,63,0.5)" }}>
            <div style={{ background: "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", padding: "18px 22px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
                    style={{ width: 26, height: 26, borderRadius: 8, border: "2px solid #c9d0db", background: "#fff", cursor: "pointer", flex: "none" }} />
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

      {lineRefresh && active && (() => {
        const lab = { cost: "$ / pc", qty: "Qty / pallet", weight: "kg / pc" };
        const diffs = (active.lines || []).map((l) => {
          const p = data.products.find((x) => x.id === l.productId);
          if (!p) return null;
          const ch = {};
          ["cost", "qty", "weight"].forEach((f) => { if (Number(p[f]) > 0 && Number(l[f]) !== Number(p[f])) ch[f] = { from: l[f], to: Number(p[f]) }; });
          return Object.keys(ch).length ? { l, p, ch } : null;
        }).filter(Boolean);
        const picked = diffs.filter((x) => !lineRefresh.skip.has(x.l.id));
        const cell = { padding: "7px 8px", borderBottom: "1px solid #eef1f5", fontSize: 13, textAlign: "left", verticalAlign: "top" };
        const fmt = (f, v) => (!(Number(v) > 0) ? "—" : f === "cost" ? "$" + Number(v) : String(Number(v)));
        const flip = (id) => setLineRefresh((r) => { const k = new Set(r.skip); k.has(id) ? k.delete(id) : k.add(id); return { skip: k }; });
        return (
          <div onClick={() => setLineRefresh(null)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(11,31,63,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 860, maxHeight: "85vh", display: "flex", flexDirection: "column", padding: "18px 20px", fontFamily: "inherit" }}>
              <b style={{ fontSize: 16, color: NAVY }}>Refresh {active.name} from current product prices</b>
              <p style={{ fontSize: 12.5, color: "#5a6a85", margin: "4px 0 10px" }}>
                Lines whose $ / pc, qty / pallet or kg / pc differ from the product. Untick any line you want to keep as it is.
              </p>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {diffs.length ? (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>{["", "Line", "Colour", "Change"].map((h, i) => <th key={i} style={{ ...cell, fontSize: 11, color: "#8593a8", textTransform: "uppercase", letterSpacing: 0.4 }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {diffs.map(({ l, p, ch }) => (
                        <tr key={l.id} onClick={() => flip(l.id)} style={{ cursor: "pointer", opacity: lineRefresh.skip.has(l.id) ? 0.45 : 1 }}>
                          <td style={{ ...cell, width: 24 }}><input type="checkbox" readOnly checked={!lineRefresh.skip.has(l.id)} /></td>
                          <td style={{ ...cell, fontWeight: 700, color: NAVY }}>{p.name || p.code}</td>
                          <td style={{ ...cell, color: "#5a6a85" }}>{l.colour || "—"}</td>
                          <td style={cell}>{Object.entries(ch).map(([f, r]) => <div key={f}><span style={{ color: "#8593a8" }}>{lab[f]}</span> {fmt(f, r.from)} → <b>{fmt(f, r.to)}</b></div>)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p style={{ fontSize: 13.5 }}>Every line already matches its product.</p>}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button onClick={() => setLineRefresh(null)} style={btn}>{diffs.length ? "Cancel" : "Close"}</button>
                {diffs.length > 0 && (
                  <button disabled={!picked.length} onClick={() => {
                    updateShipment((sh) => picked.forEach(({ l, ch }) => { const x = sh.lines.find((y) => y.id === l.id); if (x) Object.entries(ch).forEach(([f, r]) => { x[f] = r.to; }); }));
                    setLineRefresh(null);
                  }} style={{ ...btn, background: GOLD, border: "1px solid " + GOLD }}>Update {picked.length} line{picked.length === 1 ? "" : "s"}</button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {priceReview && (() => {
        const fixes = pastPriceFixes();
        const lab = { cost: "$ / pc", qty: "Qty / pallet", weight: "kg / pc" };
        const cell = { padding: "7px 8px", borderBottom: "1px solid #eef1f5", fontSize: 13, textAlign: "left", verticalAlign: "top" };
        const fmt = (f, v) => (v === "" || v === undefined || v === null || !(Number(v) > 0) ? "—" : f === "cost" ? "$" + Number(v) : String(Number(v)));
        return (
          <div onClick={() => setPriceReview(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(11,31,63,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 820, maxHeight: "85vh", display: "flex", flexDirection: "column", padding: "18px 20px", fontFamily: "inherit" }}>
              <b style={{ fontSize: 16, color: NAVY }}>Product prices from past shipments</b>
              <p style={{ fontSize: 12.5, color: "#5a6a85", margin: "4px 0 10px" }}>
                Products with no figures take them from the most recent shipment they were on (by order date). A figure already on the product is never changed. From now on, typing a figure on a shipment line updates the product too.
              </p>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {fixes.length ? (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>{["Product", "Change", "From"].map((h) => <th key={h} style={{ ...cell, fontSize: 11, color: "#8593a8", textTransform: "uppercase", letterSpacing: 0.4 }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {fixes.map(({ p, ch }) => (
                        <tr key={p.id}>
                          <td style={{ ...cell, fontWeight: 700, color: NAVY }}>{p.name || p.code}<div style={{ fontSize: 11.5, fontWeight: 600, color: "#8593a8" }}>{[p.code, p.supplier].filter(Boolean).join(" · ")}</div></td>
                          <td style={cell}>{Object.entries(ch).map(([f, r]) => <div key={f}><span style={{ color: "#8593a8" }}>{lab[f]}</span> {fmt(f, p[f])} → <b>{fmt(f, r.v)}</b></div>)}</td>
                          <td style={{ ...cell, color: "#5a6a85" }}>{[...new Set(Object.values(ch).map((r) => r.from))].join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p style={{ fontSize: 13.5 }}>All products already match their latest shipment.</p>}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button onClick={() => setPriceReview(false)} style={btn}>Cancel</button>
                {fixes.length > 0 && <button onClick={() => { applyPastPrices(fixes); setPriceReview(false); }} style={{ ...btn, background: GOLD, border: "1px solid " + GOLD }}>Update {fixes.length} product{fixes.length === 1 ? "" : "s"}</button>}
              </div>
            </div>
          </div>
        );
      })()}

      {crm && !dropSync.alerts.length && !shortLoads.alerts.length && trackAlerts.alerts.length > 0 && (
        <TrackingAlertPop alerts={trackAlerts.alerts} onDismiss={trackAlerts.dismiss} onOpen={() => setTab("tracking")} />
      )}
      {phonePick && <DriverPicker crm={crm} myName={(access.name || "").split(" ")[0] || (storageMode === "supabase" ? "" : "Jon")} onClose={() => setPhonePick(false)} />}
      {crm && !dropSync.alerts.length && shortLoads.alerts.length > 0 && (
        <ShortLoadAlert alerts={shortLoads.alerts} crm={crm} onDismiss={shortLoads.dismiss} onFollowUp={followUpFromLoad} onOpenJob={(id) => openInvoice(id)}
          onOpenLoading={(rep) => { try { sessionStorage.setItem("dk-load-day", rep.date); } catch (e) { /* */ } shortLoads.dismiss(rep); setTab("loading"); }} />
      )}
      {crm && dropSync.alerts.length > 0 && (
        <DropAlert alerts={dropSync.alerts} crm={crm} onDismiss={dropSync.dismiss} onFollowUp={followUpFromDrop}
          onOpenJob={(id) => openInvoice(id)} onOpenCollection={(id) => openCollection(id)} />
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
