// Driver logins: a phone screen with just their own runs (today, tomorrow and the rest of the week)
// and a fuel form. The database only hands a driver the jobs and pick-ups planned for them.
import { useState, useEffect, useMemo } from "react";
import { crmStorage } from "../data/crmStorage.js";
import { getSupabase } from "../data/supabaseClient.js";
import { signOut } from "../data/auth.js";
import { normaliseCrm, isVoidInvoice, isCollectionJob, invoiceTotals, isPaid, gbp, partKey, collNotesText } from "../lib/crmCore.js";
import { NAVY, GOLD, RED, uid, prettyDate, prettyDateTime } from "../lib/core.js";
import { Icon } from "./crm/ui.jsx";
import { loadDrops, saveDrop, shrinkPhoto, loadEvents, logEvent } from "../data/drops.js";
import { runsOn, loadState, canCheck, shortName } from "../lib/loading.js";
import { loadLoading } from "../data/loading.js";
import LoadingMobile from "./LoadingMobile.jsx";
import DriverPicker, { openPhoneApp } from "./DriverPicker.jsx";
import DriverTasks, { tasksOutstanding } from "./DriverTasks.jsx";
import { outwardCode, tidyPostcode, googleNavHref, appleNavHref, isApple } from "../lib/addressCheck.js";

const GREEN = "#28713e";
const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const addDaysTo = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const telHref = (n) => "tel:" + String(n || "").replace(/[^\d+]/g, "");

const page = { minHeight: "100vh", background: "#f3f5f8", fontFamily: "Quicksand, sans-serif", color: NAVY, paddingBottom: 30 };
const bar = { background: NAVY, color: "#fff", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 5 };
const cardS = { background: "#fff", border: "1px solid #e6e9ef", borderRadius: 14, padding: "14px 15px", marginBottom: 10 };
const field = { width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 16, padding: "12px 12px", borderRadius: 10, border: "1px solid #d5d9e0", background: "#fff", color: NAVY };
const label = { display: "block", fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: "#8593a8", margin: "14px 0 6px" };

// switcher: { current, myName } when an admin / manager opened this from the office system
export default function DriverApp({ me, warehouse, switcher }) {
  const [picking, setPicking] = useState(false);
  // warehouse logins on a phone get the loading side for every van; drivers get their own runs.
  // A warehouse login that also drives (a driver name set in Users & access, e.g. Ian) gets both:
  // Loading for every van, Deliveries for their own runs.
  const driver = warehouse ? me.driverName || "" : me.driverName || (me.fullName || "").split(" ")[0] || "";
  const allVans = warehouse || !!switcher; // who loads every van, not just their own
  const who = me.email || me.fullName || driver || "warehouse";
  const [mode, setMode] = useState(warehouse ? "loading" : "deliveries");
  const [crm, setCrm] = useState(null);
  // whose tasks: your own - or, when the office is viewing as a driver, that driver's login
  const taskWho = (() => {
    if (!switcher) return me.email || "";
    const lc = (x) => String(x || "").trim().toLowerCase();
    const s = ((crm && crm.staff) || []).find((x) => lc(x.driverName) === lc(driver)) || ((crm && crm.staff) || []).find((x) => lc(String(x.name || "").split(" ")[0]) === lc(driver));
    return s ? s.email : "";
  })();
  const [err, setErr] = useState("");
  const [view, setView] = useState(null); // null = home · a yyyy-mm-dd = that day's runs · "fuel"
  const [loads, setLoads] = useState(0); // bumped on refresh so the day view re-checks drops and resets
  const [todayLoad, setTodayLoad] = useState(null); // today's loading reports, for the Loading tab's count
  const load = async () => {
    setErr("");
    setLoads((n) => n + 1);
    loadLoading([ymd(new Date())]).then(setTodayLoad).catch(() => {});
    try {
      const r = await crmStorage.get("dk-crm");
      setCrm(normaliseCrm(r && r.value ? JSON.parse(r.value) : {}));
    } catch (e) {
      setErr("Couldn't load your runs — check your signal and tap refresh.");
    }
  };
  useEffect(() => { load(); }, []);

  // pull the screen down to refresh: a spinner drops in from the top while it reloads
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const t0 = Date.now();
    try { await load(); } finally {
      setTimeout(() => setRefreshing(false), Math.max(0, 700 - (Date.now() - t0))); // long enough to see it happen
    }
  };
  const refreshRef = { current: refresh };
  refreshRef.current = refresh;
  useEffect(() => {
    const prev = document.body.style.overscrollBehaviorY;
    document.body.style.overscrollBehaviorY = "contain"; // our pull, not the browser's full reload
    let y0 = null, dist = 0;
    const scrolledInside = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) if (n.scrollTop > 0) return true; return false; };
    const start = (e) => { y0 = (window.scrollY || document.documentElement.scrollTop) <= 0 && e.touches.length === 1 && !scrolledInside(e.target) ? e.touches[0].clientY : null; dist = 0; };
    const move = (e) => {
      if (y0 === null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy <= 0) { dist = 0; setPull(0); return; }
      dist = Math.min(110, dy * 0.5);
      setPull(dist);
    };
    const end = () => { if (y0 !== null && dist >= 60) refreshRef.current(); y0 = null; dist = 0; setPull(0); };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      document.body.style.overscrollBehaviorY = prev;
      window.removeEventListener("touchstart", start); window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end); window.removeEventListener("touchcancel", end);
    };
  }, []);
  const pullBadge = (pull > 0 || refreshing) && (
    <div aria-live="polite" style={{ position: "fixed", left: "50%", top: refreshing ? 78 : 40 + pull * 0.6, transform: "translateX(-50%)", zIndex: 60, width: 42, height: 42, borderRadius: 99, background: "#fff", boxShadow: "0 4px 16px rgba(11,31,63,.25)", display: "flex", alignItems: "center", justifyContent: "center", transition: refreshing ? "top .15s" : "none", pointerEvents: "none" }}>
      <style>{"@keyframes dkspin{to{transform:rotate(360deg)}}"}</style>
      <span style={{ fontSize: 22, fontWeight: 900, color: refreshing || pull >= 60 ? GOLD : "#aab3c2", display: "inline-block", transform: refreshing ? "none" : "rotate(" + pull * 4 + "deg)", animation: refreshing ? "dkspin .8s linear infinite" : "none" }}>↻</span>
    </div>
  );

  const mine = (x) => String(x.driver || "").trim().toLowerCase() === driver.trim().toLowerCase();
  // every stop for this driver, by day
  const byDay = useMemo(() => {
    const m = {};
    if (!crm) return m;
    (crm.invoices || []).filter((i) => !isVoidInvoice(i) && i.deliveryDate && mine(i)).forEach((i) => (m[i.deliveryDate] = m[i.deliveryDate] || []).push({ kind: "inv", obj: i }));
    (crm.collections || []).filter((c) => c.collectDate && mine(c)).forEach((c) => (m[c.collectDate] = m[c.collectDate] || []).push({ kind: "col", obj: c }));
    Object.values(m).forEach((l) => l.sort((a, b) => (Number(a.obj.runNo) || 99) - (Number(b.obj.runNo) || 99) || (Number(a.obj.dropNo) || 99) - (Number(b.obj.dropNo) || 99)));
    return m;
  }, [crm, driver]);

  const today = new Date();
  const days = Array.from({ length: 7 }, (_, n) => addDaysTo(today, n));
  const dayName = (d, n) => (n === 0 ? "Today's runs" : n === 1 ? "Tomorrow's runs" : d.toLocaleDateString("en-GB", { weekday: "long" }) + "'s runs");

  const header = (title, back) => (
    <div style={bar}>
      {back ? (
        <button type="button" onClick={back} style={{ border: "none", background: "rgba(255,255,255,.12)", color: "#fff", borderRadius: 10, width: 40, height: 40, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }} aria-label="Back">
          <Icon name="back" stroke="#fff" />
        </button>
      ) : (
        <div style={{ width: 40, height: 40, borderRadius: 10, background: GOLD, color: NAVY, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>DK</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>{title}</div>
        <div style={{ fontSize: 12, color: "#aeb9cf", fontWeight: 600 }}>{switcher ? (driver ? "Viewing as " + driver : "Loading · all vans") : (driver ? driver + " · " : warehouse ? "Warehouse · " : "") + "Deck Kingdom"}</div>
      </div>
      {switcher && <button type="button" onClick={() => setPicking(true)} title="Switch driver / app" style={{ border: "none", background: GOLD, color: NAVY, borderRadius: 10, height: 40, padding: "0 10px", flex: "none", fontFamily: "inherit", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>⇄ Switch</button>}
      {switcher && <button type="button" onClick={() => openPhoneApp(null)} title="Back to the office system" aria-label="Back to the office system" style={{ border: "none", background: "rgba(255,255,255,.12)", color: "#fff", borderRadius: 10, width: 40, height: 40, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="home" stroke="#fff" /></button>}
      {picking && <DriverPicker crm={crm} myName={switcher.myName} current={switcher.current} onClose={() => setPicking(false)} />}
      {pullBadge}
    </div>
  );

  // Loading | Deliveries switch under the header (drivers)
  // Loading | Deliveries (if they drive) | Tasks — under the header
  const nTasks = tasksOutstanding(crm, taskWho);
  // today's vans still to load / check, and today's stops still to do
  const tKey = ymd(new Date());
  const nLoad = crm && todayLoad ? runsOn(crm, tKey, allVans ? null : driver).filter((r) => !loadState(r, todayLoad.counts[r.key], todayLoad.reports[r.key]).complete).length : 0;
  const nDel = driver ? (byDay[tKey] || []).filter((x) => !(x.kind === "col" ? x.obj.collected : x.obj.deliveryCompleted)).length : 0;
  const counts = { loading: nLoad, deliveries: nDel, tasks: nTasks };
  const tabList = [["loading", "Loading"], ...(driver ? [["deliveries", "Deliveries"]] : []), ["tasks", "Tasks"]];
  const tabs = (
    <div style={{ display: "flex", gap: 6, padding: "10px 14px 0", position: "sticky", top: 68, zIndex: 4, background: "#f3f5f8" }}>
      {tabList.map(([k, l]) => (
        <button key={k} type="button" onClick={() => { setMode(k); setView(null); }}
          style={{ flex: 1, borderRadius: 12, padding: "11px 6px", fontFamily: "inherit", fontWeight: 800, fontSize: 15, cursor: "pointer", border: "1px solid " + (mode === k ? NAVY : "#d5d9e0"), background: mode === k ? NAVY : "#fff", color: mode === k ? "#fff" : NAVY, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {l}{counts[k] > 0 && <span title={k === "loading" ? "Vans still to load or check today" : k === "deliveries" ? "Stops still to do today" : "Tasks still to do"} style={{ minWidth: 20, height: 20, borderRadius: 99, background: RED, color: "#fff", fontSize: 11.5, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{counts[k]}</span>}
        </button>
      ))}
    </div>
  );
  if (mode === "tasks") {
    return (
      <div style={page}>
        {header("My tasks")}
        {tabs}
        <div style={{ padding: 14 }}><DriverTasks crm={crm} who={taskWho} setCrm={setCrm} full /></div>
      </div>
    );
  }
  if (mode === "loading") {
    return (
      <div style={page}>
        <LoadingMobile key={loads} crm={crm} driver={allVans ? null : driver} who={who} header={header} nav={tabs} />
        {warehouse && !switcher && <div style={{ padding: "0 14px" }}><button type="button" onClick={() => signOut().then(() => window.location.reload())}
          style={{ marginTop: 10, width: "100%", border: "1px solid #d5d9e0", background: "#fff", borderRadius: 12, padding: 12, fontFamily: "inherit", fontWeight: 700, color: "#5a6a85", cursor: "pointer" }}>Sign out</button></div>}
      </div>
    );
  }
  if (!driver) {
    return (
      <div style={page}>{header("Driver")}
        <div style={{ padding: 16 }}><div style={cardS}>Your login isn't linked to a driver name yet — ask the office to set it in Users &amp; access.</div></div>
      </div>
    );
  }

  if (view === "fuel") return <FuelForm driver={driver} vans={(crm && crm.vans) || []} header={header} onBack={() => setView(null)} />;
  if (view) return <DayRuns key={view + ":" + loads} driver={driver} who={who} onCheckLoad={() => { setMode("loading"); setView(null); }} date={view} stops={byDay[view] || []} crm={crm} header={header} onBack={() => setView(null)} />;

  // ===== home: 7 day buttons + fuel =====
  return (
    <div style={page}>
      {header("Hi " + driver)}
      {tabs}
      <div style={{ padding: 14 }}>
        {err && <div style={{ ...cardS, borderColor: RED, color: RED, fontWeight: 700 }}>{err}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {days.map((d, n) => {
            const k = ymd(d), count = crm ? (byDay[k] || []).filter((x) => !(x.kind === "col" ? x.obj.collected : x.obj.deliveryCompleted)).length : null;
            const first = n === 0;
            return (
              <button key={k} type="button" onClick={() => setView(k)}
                style={{ gridColumn: first ? "span 2" : undefined, minHeight: first ? 96 : 84, borderRadius: 16, border: "1px solid " + (first ? GOLD : "#e6e9ef"), background: first ? GOLD : "#fff", color: NAVY, fontFamily: "inherit", textAlign: "left", padding: "12px 14px", cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 1px 0 rgba(11,31,63,.04)" }}>
                <span style={{ fontWeight: 800, fontSize: first ? 19 : 16 }}>{dayName(d, n)} {count === null ? "" : "(" + count + ")"}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: first ? NAVY : "#8593a8" }}>{d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => setView("fuel")}
            style={{ gridColumn: "span 2", minHeight: 84, borderRadius: 16, border: "1px solid " + NAVY, background: NAVY, color: "#fff", fontFamily: "inherit", textAlign: "left", padding: "12px 14px", cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 800, fontSize: 16 }}>Fuel</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#aeb9cf" }}>Log a fill-up</span>
          </button>
        </div>
        {switcher ? <button type="button" onClick={() => openPhoneApp(null)}
          style={{ marginTop: 22, width: "100%", border: "1px solid #d5d9e0", background: "#fff", borderRadius: 12, padding: 12, fontFamily: "inherit", fontWeight: 800, color: NAVY, cursor: "pointer" }}>🏠 Back to the office system</button> : <button type="button" onClick={() => signOut().then(() => window.location.reload())}
          style={{ marginTop: 22, width: "100%", border: "1px solid #d5d9e0", background: "#fff", borderRadius: 12, padding: 12, fontFamily: "inherit", fontWeight: 700, color: "#5a6a85", cursor: "pointer" }}>Sign out</button>}
      </div>
    </div>
  );
}

// ===== one day's stops, in run and drop order =====
// Fail-safes: a run's addresses stay part-hidden (first 5 characters, first half of the postcode)
// until the driver has ticked every item on that run as being on the van. Then stops open one at a
// time - each needs confirming (ticks + photo) before the next. Parts coming on a supplier pick-up
// tick themselves once that pick-up is confirmed, and the jobs waiting on them open then.
const maskAddr = (address, postcode) => {
  const a = String(address || "").trim();
  const out = outwardCode(postcode);
  return [a ? a.slice(0, 5) + (a.length > 5 ? "…" : "") : "", out ? out + " •••" : ""].filter(Boolean).join("  ·  ");
};
const invLines = (o) => (o.lines || []).map((l, i) => ({ l, i })).filter(({ l }) => l.qty && (l.description || l.code));

function NavButtons({ dest, onNav, done }) {
  const apple = isApple();
  const g = <a key="g" href={googleNavHref(dest)} target="_blank" rel="noopener noreferrer" onClick={() => onNav && onNav("google")} style={{ ...navBtn, background: apple ? "#fff" : "#185FA5", color: apple ? "#185FA5" : "#fff" }}>▶ {apple ? "Google Maps" : "Navigate"}</a>;
  const a = <a key="a" href={appleNavHref(dest)} target="_blank" rel="noopener noreferrer" onClick={() => onNav && onNav("apple")} style={{ ...navBtn, background: apple ? "#185FA5" : "#fff", color: apple ? "#fff" : "#185FA5" }}>▶ {apple ? "Navigate" : "Apple Maps"}</a>;
  return (
    <>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>{apple ? [a, g] : [g, a]}</div>
      {done && <div style={{ marginTop: 5, fontSize: 12, fontWeight: 700, color: GREEN }}>✓ Journey started {new Date(done).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>}
    </>
  );
}
const navBtn = { flex: 1, textAlign: "center", border: "1px solid #185FA5", borderRadius: 10, padding: "11px 8px", fontWeight: 800, fontSize: 15, textDecoration: "none" };

function DayRuns({ date, stops, crm, header, onBack, driver, who, onCheckLoad }) {
  const d = new Date(date + "T00:00:00");
  const title = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const custById = {}, siteById = {};
  ((crm && crm.customers) || []).forEach((c) => (custById[c.id] = c));
  ((crm && crm.sites) || []).forEach((s) => (siteById[s.id] = s));
  // load-check ticks live in the database (driver_events), so the office can clear them and a
  // phone that can't reach the system stays locked
  const [evs, setEvs] = useState(null); // null = still loading
  const [tickErr, setTickErr] = useState("");
  const [drops, setDrops] = useState({}); // dropKey -> confirmation
  const [dropsErr, setDropsErr] = useState("");
  const [completing, setCompleting] = useState(null); // the stop being confirmed
  const [showDone, setShowDone] = useState(false);
  // set-off times per run (driver_events); if that table isn't there yet the set-off step is skipped
  const [departs, setDeparts] = useState({});
  const [resets, setResets] = useState({}); // run -> time the office reset it (older ticks / set-offs don't count)
  const [evErr, setEvErr] = useState("");
  const [loadData, setLoadData] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  useEffect(() => {
    let live = true;
    loadLoading([date]).then((d) => live && setLoadData(d)).catch((e) => live && setLoadErr(/load_|relation|column/.test(String(e && e.message)) ? "Loading isn't switched on yet — ask the office to run loading.sql." : "Couldn't check the loading report — check your signal and tap ↻."));
    return () => { live = false; };
  }, [date]);
  const [leaving, setLeaving] = useState("");
  useEffect(() => {
    let live = true;
    loadEvents([date]).then((l) => {
      if (!live) return;
      const rs = {}, m = {};
      l.filter((e) => e.kind === "reset").forEach((e) => { const t = new Date(e.at).getTime(); if (!rs[e.runNo || ""] || t > rs[e.runNo || ""]) rs[e.runNo || ""] = t; });
      l.filter((e) => e.kind === "depart" && new Date(e.at).getTime() > Math.max(rs[e.runNo || ""] || 0, rs["*"] || 0)).forEach((e) => (m[e.runNo || ""] = e));
      setResets(rs);
      setDeparts(m);
      setEvs(l.filter((e) => e.kind === "tick" || e.kind === "untick" || e.kind === "nav"));
    }).catch((e) => live && setEvErr(/driver_events|item_key|column/.test(String(e && e.message)) ? "The load check isn't switched on yet — ask the office to run driver-app-all.sql." : "Couldn't reach the office system — check your signal and tap ↻."));
    return () => { live = false; };
  }, [date]);
  const setOff = (runKey, van, driver) => {
    if (leaving) return;
    setLeaving(runKey);
    const go = (pos) => logEvent({ id: uid(), driver, date, runNo: runKey, van: van || "", kind: "depart", lat: pos && pos.coords.latitude, lng: pos && pos.coords.longitude, acc: pos && pos.coords.accuracy })
      .then((e) => setDeparts((m) => ({ ...m, [runKey]: e })))
      .catch(() => setTickErr("Couldn't record setting off — check your signal and tap Set off again."))
      .finally(() => setLeaving(""));
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(go, () => go(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
    else go(null);
  };
  useEffect(() => {
    let live = true;
    loadDrops([date]).then((m) => live && setDrops(m)).catch((e) => live && setDropsErr(/drop_confirmations|collection_id/.test(String(e && e.message)) ? "Drop confirmations aren't switched on yet — ask the office to run drop-confirmations.sql." : "Couldn't check which drops are done — tap ↻ to try again."));
    return () => { live = false; };
  }, [date]);

  // ----- the day's stops: supplier pick-ups and deliveries (warehouse collections aren't driven) -----
  const sid = (x) => (x.kind === "col" ? "col:" : "") + x.obj.id;
  const done = (x) => !!(drops[sid(x)] || (x.kind === "col" ? x.obj.collected : x.obj.deliveryCompleted));
  const driven = stops.filter((x) => x.kind === "col" || !isCollectionJob(x.obj));
  const colStops = stops.filter((x) => x.kind === "col");
  // the parts each job is waiting on from today's pick-ups
  const pickupFor = (job) => {
    const out = [];
    colStops.forEach((cs) => (cs.obj.items || []).forEach((it, k) => { if (it.assignedInvoiceId === job.id) out.push({ cs, it, k }); }));
    return out;
  };
  const same = (l, it) => (l.code && it.sku && partKey(l.code) === partKey(it.sku)) || (l.description && it.description && l.description.trim().toLowerCase() === it.description.trim().toLowerCase());
  // job line -> the pick-up it comes on (null = it should already be on the van)
  const lineSource = (job, l) => pickupFor(job).find((p) => same(l, p.it)) || null;
  const pickedState = (p) => { const c = drops["col:" + p.cs.obj.id]; if (c) { const r = (c.items || [])[p.k]; return r && (r.short || Number(r.remaining) > 0) ? "short" : "ok"; } return p.cs.obj.collected ? "ok" : "waiting"; };
  const waitingOn = (x) => (x.kind === "inv" ? [...new Map(pickupFor(x.obj).filter((p) => !done(p.cs)).map((p) => [p.cs.obj.id, p.cs])).values()] : []);

  // ----- load check per run: everything that should be on the van before leaving -----
  const need = {};
  driven.forEach((x) => {
    if (x.kind !== "inv" || done(x)) return;
    const r = x.obj.runNo || "";
    invLines(x.obj).forEach(({ l, i }) => { if (!lineSource(x.obj, l)) (need[r] = need[r] || []).push(x.obj.id + ":" + i); });
  });
  const resetAt = (r) => Math.max(resets[r] || 0, resets["*"] || 0);
  // the latest tick / untick for an item since the run was last reset
  const tk = (k, r) => {
    let last = null;
    (evs || []).forEach((e) => { if (e.itemKey === k && new Date(e.at).getTime() > resetAt(r) && (!last || new Date(e.at) >= new Date(last.at))) last = e; });
    return !!last && last.kind === "tick";
  };
  // the journey to a stop has to be started from the app's Navigate button before it can be completed
  const navAt = (x) => {
    const k = "nav:" + sid(x), r = x.obj.runNo || "";
    let t = 0;
    (evs || []).forEach((e) => { if (e.kind === "nav" && e.itemKey === k) { const at = new Date(e.at).getTime(); if (at > resetAt(r) && at > t) t = at; } });
    return t || null;
  };
  const startNav = (x, app) => {
    if (navAt(x)) return;
    const ev = { id: uid(), driver, date, runNo: x.obj.runNo || "", kind: "nav", itemKey: "nav:" + sid(x), van: app };
    setEvs((l) => [...(l || []), { ...ev, at: new Date().toISOString() }]);
    // first Navigate on a run = leaving the yard: record the set-off time for tracking
    const r = x.obj.runNo || "";
    const leavingNow = !setOffDone(r);
    const pos = (p) => {
      const where = { lat: p && p.coords.latitude, lng: p && p.coords.longitude, acc: p && p.coords.accuracy };
      if (leavingNow) logEvent({ id: uid(), driver, date, runNo: r, van: x.obj.van || "", kind: "depart", ...where }).then((e) => setDeparts((m) => ({ ...m, [r]: e }))).catch(() => {});
      logEvent({ ...ev, ...where }).catch(() => {
        setEvs((l) => (l || []).filter((e) => e.id !== ev.id));
        setTickErr("Couldn't record the journey starting — check your signal and tap Navigate again.");
      });
    };
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(pos, () => pos(null), { timeout: 6000, maximumAge: 120000 });
    else pos(null);
  };
  const toggle = (k, r) => {
    if (!evs) return;
    const ev = { id: uid(), driver, date, runNo: r, kind: tk(k, r) ? "untick" : "tick", itemKey: k };
    setTickErr("");
    setEvs((l) => [...(l || []), { ...ev, at: new Date().toISOString() }]);
    logEvent(ev).catch(() => {
      setEvs((l) => (l || []).filter((e) => e.id !== ev.id));
      setTickErr("Couldn't save that tick — check your signal and tap it again.");
    });
  };
  // deliveries open only once the run's loading report is closed (loaded + double-checked)
  const loadRuns = crm ? runsOn(crm, date, driver) : [];
  const runState = (r) => {
    const run = loadRuns.find((x) => x.runNo === String(r || ""));
    if (!run) return { total: 0, done: 0, open: !!evs && !evErr && !!loadData, rep: null };
    const st = loadState(run, loadData && loadData.counts[run.key], loadData && loadData.reports[run.key]);
    return { total: st.total, done: st.loaded + st.allocated, open: !!loadData && !loadErr && st.complete, rep: loadData && loadData.reports[run.key], st, counts: (loadData && loadData.counts[run.key]) || {} };
  };
  // stops open one at a time; a drop waiting on a pick-up is skipped until that pick-up is checked
  const byRun = {};
  driven.forEach((x) => (byRun[x.obj.runNo || ""] = byRun[x.obj.runNo || ""] || []).push(x));
  const setOffDone = (r) => !!departs[r] || (byRun[r] || []).some((x) => drops[sid(x)]);
  const currentOf = (r) => (runState(r).open ? (byRun[r] || []).find((x) => !done(x) && !waitingOn(x).length) || null : null);
  const stopName = (x) => (x.kind === "col" ? "the " + (x.obj.supplier || "supplier") + " pick-up" : "drop " + (x.obj.dropNo || "") + " (" + ((custById[x.obj.customerId] || {}).name || "#" + x.obj.invNo) + ")");

  if (completing) {
    const x = completing, o = x.obj;
    const target = x.kind === "col"
      ? { pickup: true, title: "Complete pick-up", name: o.supplier || "Supplier", ref: "COL-" + o.collectionNo, collectionId: o.id,
          rows: (o.items || []).map((it, k) => ({ qty: it.qty, text: it.description || it.sku, colour: it.colour, code: it.sku || "", lineIndex: k })) }
      : { title: "Complete drop " + (o.dropNo || ""), name: (custById[o.customerId] || {}).name || "Customer", ref: "#" + o.invNo, invoiceId: o.id, invNo: o.invNo,
          owed: !isPaid(o) ? invoiceTotals(o).total : 0,
          rows: invLines(o).map(({ l, i }) => ({ qty: l.qty, text: l.description || l.code, colour: l.colour, code: l.code || "", lineIndex: i })) };
    return <CompleteDrop target={{ ...target, driver: o.driver || "" }} header={header} date={date}
      onBack={() => setCompleting(null)} onSaved={(conf) => { setDrops((m) => ({ ...m, [conf.collectionId ? "col:" + conf.collectionId : conf.invoiceId]: conf })); setCompleting(null); window.scrollTo(0, 0); }} />;
  }

  const doneLine = (conf, pickup) => (
    <div style={{ marginTop: 8, color: conf && (conf.items || []).some((r) => r.short) ? "#a05f10" : GREEN, fontWeight: 800, fontSize: 13 }}>
      ✓ {conf ? (pickup ? "Collected " : "Dropped ") + new Date(conf.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " · " + ((conf.photoPaths || []).length > 1 ? conf.photoPaths.length + " photos" : "photo taken") + ((conf.items || []).some((r) => r.short) ? " · short noted" : "") : pickup ? "Collected" : "Delivered"}
    </div>
  );
  const completeBtn = (x, label, noAddress) => {
    const ok = !!navAt(x) || noAddress; // nothing to navigate to: the office is told in tracking
    return (
      <>
        <button type="button" onClick={() => ok && setCompleting(x)} disabled={!ok}
          style={{ marginTop: 10, width: "100%", border: "none", borderRadius: 12, padding: 15, fontFamily: "inherit", fontWeight: 800, fontSize: 17, background: ok ? GREEN : "#e6e9ef", color: ok ? "#fff" : "#8593a8", cursor: ok ? "pointer" : "default" }}>
          {ok ? "✓ " : "🔒 "}{label}
        </button>
        {!ok && <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, color: "#8593a8", textAlign: "center" }}>Tap Navigate above to start the journey — you can complete it once you've set off from here.</div>}
      </>
    );
  };
  const addrBlock = (open, isCur, a, addr, x) => (open ? (
    <>
      <div style={{ marginTop: 6, fontWeight: 700, fontSize: 14 }}>📍 {addr}</div>
      {isCur && <NavButtons dest={addr} onNav={(app) => startNav(x, app)} done={navAt(x)} />}
    </>
  ) : (
    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 14, color: "#8593a8" }}>🔒 {maskAddr(a.address, a.postcode)}</div>
  ));
  const note = (t, tone = "#8593a8") => <div style={{ marginTop: 4, fontSize: 12.5, fontWeight: 700, color: tone }}>{t}</div>;

  let lastRun = null;
  return (
    <div style={page}>
      {header(title, onBack)}
      <div style={{ padding: 14 }}>
        {loadErr && <div style={{ ...cardS, borderColor: "#f4b9c1", background: "#fdf3f4", color: RED, fontWeight: 700, fontSize: 13.5 }}>🔒 {loadErr}</div>}
        {(evErr || tickErr) && <div style={{ ...cardS, borderColor: "#f4b9c1", background: "#fdf3f4", color: RED, fontWeight: 700, fontSize: 13.5 }}>🔒 {evErr || tickErr}</div>}
        {dropsErr && <div style={{ ...cardS, borderColor: "#f4d78f", background: "#fff8e6", color: "#6b5305", fontWeight: 700, fontSize: 13.5 }}>{dropsErr}</div>}
        {stops.length === 0 && <div style={{ ...cardS, textAlign: "center", color: "#8593a8", fontWeight: 700 }}>Nothing planned for you on {prettyDate(date)}.</div>}
        {stops.map((x, n) => {
          const o = x.obj;
          if (done(x) && !showDone) return null;
          const runKey = o.runNo || "";
          const rs = runState(runKey);
          const cur = currentOf(runKey);
          const runHead = runKey !== lastRun ? (lastRun = runKey, (
            <div style={{ margin: n ? "18px 0 8px" : "2px 0 8px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#5a6a85", letterSpacing: 0.5, textTransform: "uppercase", margin: "0 2px 6px" }}>
                {o.runNo ? "Run " + o.runNo : "No run number"}{o.van ? " · " + o.van : ""}
              </div>
              {rs.open && !setOffDone(runKey) ? (
                <div style={{ background: "#f1faf4", border: "1px solid #bfe3ca", borderRadius: 10, padding: "10px 12px" }}>
                  {rs.rep && (rs.rep.shortLines || []).length > 0 && <div style={{ color: RED, fontSize: 13.5, fontWeight: 800, marginBottom: 4 }}>⚠ The van went out short — {rs.rep.shortLines.reduce((t, m) => t + (Number(m.missing) || 0), 0)} item{rs.rep.shortLines.reduce((t, m) => t + (Number(m.missing) || 0), 0) === 1 ? "" : "s"} not loaded (marked on each drop). The office knows.</div>}
                  <div style={{ color: GREEN, fontSize: 13.5, fontWeight: 800 }}>✓ {rs.rep && rs.rep.completedAt ? "Loaded by " + shortName(rs.rep.completedBy) + (rs.rep.checkedBy ? " · double-checked by " + shortName(rs.rep.checkedBy) + " at " + new Date(rs.rep.checkedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "") : "Ready to go"}</div>
                  <div style={{ marginTop: 4, fontSize: 12.5, fontWeight: 600, color: "#5a6a85" }}>Tap Navigate on your first stop as you leave the yard.</div>
                </div>
              ) : rs.open ? (
                <div style={{ background: "#f1faf4", border: "1px solid #bfe3ca", color: GREEN, borderRadius: 10, padding: "9px 12px", fontSize: 13.5, fontWeight: 800 }}>
                  ✓ {departs[runKey] ? "Set off " + new Date(departs[runKey].at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " — " : rs.total ? "Everything's on the van — " : ""}{(byRun[runKey] || []).every(done) ? "all stops confirmed" : "stops open one at a time"}
                </div>
              ) : (
                rs.st && rs.st.submitted ? (
                <div style={{ background: "#eef5fd", border: "1px solid #c6dcf3", color: "#185FA5", borderRadius: 10, padding: "9px 12px", fontSize: 13.5, fontWeight: 700 }}>
                  <div style={{ fontWeight: 800 }}>🔒 Loaded by {shortName(rs.rep.completedBy)} — waiting for a double-check</div>
                  {canCheck(rs.rep, who) ? (
                    <>
                      <div style={{ marginTop: 3, fontWeight: 600, color: "#5a6a85" }}>Nobody else has checked it yet. Go round the van and tick every line yourself — your stops open as soon as it's checked.</div>
                      <button type="button" onClick={onCheckLoad} style={{ marginTop: 8, width: "100%", border: "none", borderRadius: 12, padding: 13, fontFamily: "inherit", fontWeight: 800, fontSize: 16, background: "#185FA5", color: "#fff", cursor: "pointer" }}>👀 Double-check the van myself</button>
                    </>
                  ) : <div style={{ marginTop: 3, fontWeight: 600, color: "#5a6a85" }}>Someone else has to check it — ask the warehouse or the office.</div>}
                </div>
                ) : (
                <div style={{ background: "#fff8e6", border: "1px solid #f4d78f", color: "#6b5305", borderRadius: 10, padding: "9px 12px", fontSize: 13.5, fontWeight: 700 }}>
                  <div style={{ fontWeight: 800 }}>🔒 Waiting for the van to be loaded: {rs.done} of {rs.total} lines on</div>
                  <div style={{ marginTop: 3, fontWeight: 600 }}>Your stops open once the van is loaded, photographed and double-checked by a second person (Loading tab).</div>
                  <div style={{ height: 6, background: "#f4e3b5", borderRadius: 4, marginTop: 7, overflow: "hidden" }}><div style={{ height: "100%", width: (100 * rs.done / Math.max(1, rs.total)) + "%", background: GOLD }} /></div>
                </div>
                )
              )}
            </div>
          )) : null;
          const isDone = done(x);
          const isCur = !!cur && cur === x;
          const open = isDone || isCur;
          const conf = drops[sid(x)];

          if (x.kind === "col") {
            const addr = [o.address, o.town, tidyPostcode(o.postcode)].filter(Boolean).join(", ") || [o.supplier, tidyPostcode(o.postcode)].filter(Boolean).join(", ");
            const forJobs = [...new Set((o.items || []).map((it) => it.assignedInvoiceId).filter(Boolean))].map((id) => (stops.find((y) => y.kind === "inv" && y.obj.id === id) || {}).obj).filter(Boolean);
            return (
              <div key={"c" + o.id}>
                {runHead}
                <div style={{ ...cardS, borderLeft: "5px solid " + (isDone ? GREEN : "#185FA5"), opacity: isDone ? 0.75 : 1, boxShadow: isCur ? "0 0 0 2px #185FA533" : "none" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <b style={{ fontSize: 13, color: "#8593a8" }}>{o.dropNo || n + 1}</b>
                    <b style={{ fontSize: 17, flex: 1 }}>Pick up · {o.supplier || "Supplier"}</b>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#185FA5" }}>COL-{o.collectionNo}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isCur ? "#185FA5" : "#5a6a85", marginTop: 3 }}>
                    {isCur ? "Next stop" : "Supplier pick-up"}{o.collectTime ? " · " + o.collectTime : ""}{forJobs.length ? " · for " + forJobs.map((j) => "#" + j.invNo).join(", ") : ""}
                  </div>
                  {addr && addrBlock(open, isCur, o, addr, x)}
                  {!open && rs.open && cur && note("Opens after " + stopName(cur) + " is confirmed")}
                  {o.phone && <a href={telHref(o.phone)} style={{ display: "block", marginTop: 8, color: "#185FA5", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>📞 {o.phone}{o.contact ? " · " + o.contact : ""}</a>}
                  <Items rows={(o.items || []).map((it, k) => {
                    const r = conf && (conf.items || [])[k];
                    return { qty: it.qty, text: it.description || it.sku, colour: it.colour, mark: r ? (r.short ? "short" : "ok") : null };
                  })} />
                  {o.notes && <div style={{ marginTop: 8, background: "#fff8e6", borderRadius: 8, padding: "8px 10px", fontSize: 13.5, fontWeight: 600 }}>{collNotesText(crm, o.notes)}</div>}
                  {isCur && completeBtn(x, "Complete this pick-up", !addr)}
                  {isDone && doneLine(conf, true)}
                </div>
              </div>
            );
          }

          const c = custById[o.customerId] || {}, st = siteById[o.siteId] || null;
          const a = st || c;
          const addr = [a.address, a.town, tidyPostcode(a.postcode)].filter(Boolean).join(", ");
          const tel = (st && (st.mobile || st.landline)) || c.mobile || c.landline || "";
          const coll = isCollectionJob(o);
          const owed = !isPaid(o) ? invoiceTotals(o).total : 0;
          const wait = !isDone && !coll ? waitingOn(x) : [];
          const lines = invLines(o);
          const loading = false; // counting on happens in the Loading tab now
          // parts on a pick-up for this job that don't match one of its lines
          const extra = pickupFor(o).filter((p) => !lines.some(({ l }) => same(l, p.it)));
          return (
            <div key={"i" + o.id}>
              {runHead}
              <div style={{ ...cardS, borderLeft: "5px solid " + (isDone ? GREEN : coll ? GOLD : isCur ? "#185FA5" : NAVY), opacity: isDone ? 0.75 : 1, boxShadow: isCur ? "0 0 0 2px #185FA533" : "none" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <b style={{ fontSize: 13, color: "#8593a8" }}>{o.dropNo || n + 1}</b>
                  <b style={{ fontSize: 17, flex: 1 }}>{c.name || "Customer"}</b>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#8593a8" }}>#{o.invNo}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: coll ? "#a06d00" : isCur ? "#185FA5" : "#5a6a85", marginTop: 3 }}>
                  {coll ? "Customer collecting from the warehouse" : isCur ? "Next drop" : "Delivery"}{o.deliveryTime ? " · " + o.deliveryTime : ""}
                </div>
                {addr && !coll && addrBlock(open, isCur, a, addr, x)}
                {!coll && !open && rs.open && (wait.length
                  ? note("Waiting for " + wait.map((w) => "the " + (w.obj.supplier || "supplier") + " pick-up (COL-" + w.obj.collectionNo + ")").join(" and ") + " — opens once it's collected and checked", "#185FA5")
                  : cur ? note("Opens after " + stopName(cur) + " is confirmed") : null)}
                {tel && <a href={telHref(tel)} style={{ display: "block", marginTop: 8, color: "#185FA5", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>📞 {tel}{st && st.contact ? " · " + st.contact : ""}</a>}
                <div style={{ marginTop: 8, borderTop: "1px solid #eef1f6", paddingTop: 4 }}>
                  {lines.map(({ l, i }) => {
                    const src = !isDone && !coll ? lineSource(o, l) : null;
                    const k = o.id + ":" + i;
                    const ps = src ? pickedState(src) : null;
                    const on = src ? ps === "ok" : tk(k, runKey);
                    const miss = !isDone && rs.rep ? (rs.rep.shortLines || []).find((m) => m.key === k) : null;
                    const row = (
                      <>
                        {(loading || src) && <span style={{ ...tickBox(on), ...(src && !on ? { borderStyle: "dashed", borderColor: ps === "short" ? RED : "#8fb3d9" } : {}) }}>{on ? "✓" : ps === "short" ? "!" : ""}</span>}
                        <b style={{ minWidth: 34, textAlign: "right" }}>{l.qty}×</b>
                        <span style={{ flex: 1, color: loading && on ? "#8593a8" : NAVY, textDecoration: loading && on && !src ? "line-through" : "none" }}>
                          {l.description || l.code}{l.colour ? <span style={{ color: "#5a6a85" }}> · {l.colour}</span> : null}
                          {miss && <span style={{ display: "block", fontSize: 12, fontWeight: 800, color: RED }}>⚠ {miss.loaded ? "Only " + miss.loaded + " of " + miss.qty + " loaded" : "Not loaded"} — {miss.missing} not on the van</span>}
                          {!isDone && rs.counts[k] && rs.counts[k].boxed && <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#8a5a00" }}>📦 Packed in an accessory box</span>}
                          {src && <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: ps === "short" ? RED : ps === "ok" ? GREEN : "#185FA5" }}>
                            {ps === "ok" ? "✓ Collected on COL-" + src.cs.obj.collectionNo : ps === "short" ? "Short at the " + (src.cs.obj.supplier || "supplier") + " pick-up" : "Comes on the " + (src.cs.obj.supplier || "supplier") + " pick-up (COL-" + src.cs.obj.collectionNo + ") — ticks itself once collected"}
                          </span>}
                        </span>
                      </>
                    );
                    const rowStyle = { display: "flex", gap: 10, alignItems: "center", width: "100%", border: "none", background: "none", fontFamily: "inherit", color: NAVY, textAlign: "left", fontSize: 14.5, padding: loading || src ? "8px 0" : "3px 0", borderBottom: loading || src ? "1px solid #f3f5f8" : "none" };
                    return loading && !src
                      ? <button key={k} type="button" onClick={() => toggle(k, runKey)} style={{ ...rowStyle, cursor: "pointer" }}>{row}</button>
                      : <div key={k} style={rowStyle}>{row}</div>;
                  })}
                  {!isDone && extra.map((p) => {
                    const ps = pickedState(p);
                    return (
                      <div key={p.it.id || p.k} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5, padding: "6px 0", color: "#185FA5", fontWeight: 600 }}>
                        <span style={{ ...tickBox(ps === "ok"), width: 20, height: 20, fontSize: 12, ...(ps !== "ok" ? { borderStyle: "dashed", borderColor: ps === "short" ? RED : "#8fb3d9" } : {}) }}>{ps === "ok" ? "✓" : ps === "short" ? "!" : ""}</span>
                        <span>{p.it.qty}× {p.it.description || p.it.sku} — on COL-{p.cs.obj.collectionNo}</span>
                      </div>
                    );
                  })}
                </div>
                {!isDone && rs.counts && rs.counts["boxes:" + o.id] && Number(rs.counts["boxes:" + o.id].qtyLoaded) > 0 && <div style={{ marginTop: 8, background: "#fff6dd", border: "1px solid #f0d58c", borderRadius: 8, padding: "8px 10px", fontSize: 14, fontWeight: 800, color: "#6b5305" }}>📦 {rs.counts["boxes:" + o.id].qtyLoaded} accessory box{Number(rs.counts["boxes:" + o.id].qtyLoaded) === 1 ? "" : "es"} for this drop</div>}
                {o.jobNotes && <div style={{ marginTop: 8, background: "#fff8e6", borderRadius: 8, padding: "8px 10px", fontSize: 13.5, fontWeight: 600 }}>{o.jobNotes}</div>}
                {owed > 0 && <div style={{ marginTop: 8, background: "#fde8ea", color: RED, borderRadius: 8, padding: "8px 10px", fontSize: 14, fontWeight: 800 }}>Payment to take: {gbp(owed)}</div>}
                {isCur && completeBtn(x, "Complete this drop", !addr)}
                {isDone && doneLine(conf, false)}
              </div>
            </div>
          );
        })}
        {stops.length > 0 && stops.every(done) && !showDone && <div style={{ ...cardS, textAlign: "center", color: GREEN, fontWeight: 800 }}>✓ All done for {prettyDate(date)} — thanks!</div>}
        {stops.some(done) && (
          <button type="button" onClick={() => setShowDone((v) => !v)}
            style={{ display: "block", margin: "10px auto 0", border: "none", background: "none", color: "#185FA5", fontFamily: "inherit", fontWeight: 800, fontSize: 13.5, cursor: "pointer" }}>
            {showDone ? "Hide completed" : "Show " + stops.filter(done).length + " completed"}
          </button>
        )}
        {stops.length > 0 && <div style={{ textAlign: "center", fontSize: 12.5, color: "#8593a8", fontWeight: 600, marginTop: 10 }}>Problems? Call the office on <a href="tel:01613991837" style={{ color: "#185FA5", fontWeight: 800 }}>0161 399 1837</a></div>}
      </div>
    </div>
  );
}

const Items = ({ rows }) => (rows.length ? (
  <div style={{ marginTop: 8, borderTop: "1px solid #eef1f6", paddingTop: 6 }}>
    {rows.map((r, i) => (
      <div key={i} style={{ display: "flex", gap: 8, fontSize: 14, padding: "3px 0", color: r.mark === "short" ? RED : NAVY }}>
        {r.mark && <b style={{ width: 14, color: r.mark === "short" ? RED : GREEN }}>{r.mark === "short" ? "✗" : "✓"}</b>}
        <b style={{ minWidth: 34, textAlign: "right" }}>{r.qty}×</b>
        <span style={{ flex: 1 }}>{r.text}{r.colour ? <span style={{ color: "#5a6a85" }}> · {r.colour}</span> : null}</span>
      </div>
    ))}
  </div>
) : null);

const tickBox = (on) => ({ width: 26, height: 26, flex: "none", borderRadius: 7, border: "2px solid " + (on ? GREEN : "#c4cbd6"), background: on ? GREEN : "#fff", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 15, boxSizing: "border-box" });

// ===== confirm a stop: tick what was dropped (or collected), a photo, then the next stop opens =====
function CompleteDrop({ target, header, date, onBack, onSaved }) {
  const rows = target.rows;
  const pickup = !!target.pickup;
  const [got, setGot] = useState({}); // row index -> true (all of it)
  const [part, setPart] = useState({}); // row index -> how many, when not all of it
  const [notes, setNotes] = useState("");
  const owed = Number(target.owed) || 0;
  const [paid, setPaid] = useState(null); // true = collected, false = not collected
  const [method, setMethod] = useState("");
  const [photos, setPhotos] = useState([]); // [{ file, url }] - the first is required, more can be added
  const MAX_PHOTOS = 10;
  const [geo, setGeo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => setGeo({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), () => {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }, []);
  const all = rows.every((_, i) => got[i]);
  const qtyOf = (r) => Number(r.qty) || 0;
  const doneQty = (r, i) => (got[i] ? qtyOf(r) : Math.min(qtyOf(r), Number(part[i]) || 0));
  const counted = rows.every((r, i) => got[i] || (part[i] !== undefined && part[i] !== ""));
  const leftCount = rows.filter((r, i) => doneQty(r, i) < qtyOf(r)).length;
  const payOk = !owed || (paid === true && method) || (paid === false && notes.trim().length >= 3);
  const ok = photos.length > 0 && counted && payOk;
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true); setMsg("");
    try {
      const blob = [];
      for (const p of photos) blob.push(await shrinkPhoto(p.file));
      const conf = await saveDrop({
        id: uid(), driver: target.driver, invoiceId: target.invoiceId || "", collectionId: target.collectionId || "", invNo: target.invNo || "", date,
        items: rows.map((r, i) => { const dq = doneQty(r, i), rem = Math.max(0, qtyOf(r) - dq); return { qty: r.qty, text: r.text, colour: r.colour || "", code: r.code || "", lineIndex: r.lineIndex, delivered: dq, remaining: rem, dropped: rem === 0, short: rem > 0 }; }),
        notes: notes.trim(), payment: owed ? { owed, collected: paid === true, method: paid === true ? method : "" } : {}, lat: geo && geo.lat, lng: geo && geo.lng, acc: geo && geo.acc,
      }, blob);
      onSaved(conf);
    } catch (e) {
      setMsg("Couldn't save — " + (e && e.message ? e.message : "try again") + ". Check your signal and tap Confirm again.");
    } finally { setBusy(false); }
  };
  return (
    <div style={page}>
      {header(target.title, onBack)}
      <div style={{ padding: 14 }}>
        <div style={cardS}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{target.name} <span style={{ fontSize: 12, color: "#8593a8" }}>{target.ref}</span></div>
          <span style={label}>{pickup ? "Tick each line collected and checked" : "Tick each line dropped in full"}</span>
          {rows.map((r, i) => {
            const on = !!got[i];
            return (
              <div key={i} style={{ borderBottom: "1px solid #f3f5f8" }}>
                <button type="button" onClick={() => setGot((g) => ({ ...g, [i]: !g[i] }))}
                  style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", border: "none", background: "none", fontFamily: "inherit", color: NAVY, textAlign: "left", fontSize: 15, padding: "10px 0 " + (on ? 10 : 4) + "px", cursor: "pointer" }}>
                  <span style={tickBox(on)}>{on ? "✓" : ""}</span>
                  <b style={{ minWidth: 34, textAlign: "right" }}>{r.qty}×</b>
                  <span style={{ flex: 1 }}>{r.text}{r.colour ? <span style={{ color: "#5a6a85" }}> · {r.colour}</span> : null}</span>
                </button>
                {!on && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 0 10px 36px", fontSize: 13.5, fontWeight: 700, color: "#6b5305" }}>
                    <span>Not all of it? {pickup ? "Collected" : "Dropped"}</span>
                    <input inputMode="numeric" value={part[i] ?? ""} placeholder="0"
                      onChange={(e) => setPart((p) => ({ ...p, [i]: e.target.value.replace(/[^\d]/g, "") }))}
                      style={{ ...field, width: 70, padding: "7px 8px", fontSize: 15, textAlign: "center", borderColor: part[i] === undefined || part[i] === "" ? "#f4d78f" : "#d5d9e0" }} />
                    <span>of {r.qty}{part[i] !== undefined && part[i] !== "" ? " · " + Math.max(0, qtyOf(r) - doneQty(r, i)) + " left" : ""}</span>
                  </div>
                )}
              </div>
            );
          })}
          {rows.length > 1 && (
            <button type="button" onClick={() => setGot(all ? {} : Object.fromEntries(rows.map((_, i) => [i, true])))}
              style={{ marginTop: 8, border: "none", background: "none", color: "#185FA5", fontFamily: "inherit", fontWeight: 800, fontSize: 14, padding: 0, cursor: "pointer" }}>{all ? "Untick all" : "Tick all"}</button>
          )}

          <span style={label}>{pickup ? "Photos of the goods on the van" : "Photos of the drop"} <span style={{ textTransform: "none", fontWeight: 600 }}>— at least one, add as many as help</span></span>
          {photos.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
              {photos.map((p, n) => (
                <div key={p.url} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: "1px solid #e6e9ef", background: "#f3f5f8" }}>
                  <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <button type="button" onClick={() => setPhotos((l) => l.filter((_, k) => k !== n))} aria-label="Remove photo"
                    style={{ position: "absolute", top: 4, right: 4, width: 26, height: 26, borderRadius: 999, border: "none", background: "rgba(11,31,63,.75)", color: "#fff", fontWeight: 800, cursor: "pointer", lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}
          {photos.length < MAX_PHOTOS && (
          <label style={{ ...field, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 54, cursor: "pointer", fontWeight: 800, borderStyle: "dashed", color: photos.length ? "#185FA5" : NAVY, textAlign: "center" }}>
            <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) setPhotos((l) => [...l, { file: f, url: URL.createObjectURL(f) }]); e.target.value = ""; }} />
            📷 {photos.length ? "Add another photo (" + photos.length + " taken)" : pickup ? "Take a photo of what you've collected" : "Take a photo of the goods where you left them"}
          </label>
          )}

          {owed > 0 && (
            <div style={{ marginTop: 16, border: "2px solid " + (paid === true ? GREEN : paid === false ? RED : "#f4b9c1"), background: paid === true ? "#f1faf4" : "#fdf3f4", borderRadius: 12, padding: "12px 12px" }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: paid === true ? GREEN : RED }}>Payment to take: {gbp(owed)}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="button" onClick={() => setPaid(true)} style={{ flex: 1, borderRadius: 10, padding: "11px 6px", fontFamily: "inherit", fontWeight: 800, fontSize: 15, cursor: "pointer", border: "2px solid " + GREEN, background: paid === true ? GREEN : "#fff", color: paid === true ? "#fff" : GREEN }}>✓ Collected</button>
                <button type="button" onClick={() => setPaid(false)} style={{ flex: 1, borderRadius: 10, padding: "11px 6px", fontFamily: "inherit", fontWeight: 800, fontSize: 15, cursor: "pointer", border: "2px solid " + RED, background: paid === false ? RED : "#fff", color: paid === false ? "#fff" : RED }}>✗ Not collected</button>
              </div>
              {paid === true && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  {["Cash", "Card", "Transfer"].map((m) => (
                    <button key={m} type="button" onClick={() => setMethod(m)} style={{ flex: 1, borderRadius: 10, padding: "9px 4px", fontFamily: "inherit", fontWeight: 800, fontSize: 14, cursor: "pointer", border: "1px solid " + (method === m ? NAVY : "#d5d9e0"), background: method === m ? NAVY : "#fff", color: method === m ? "#fff" : NAVY }}>{m}</button>
                  ))}
                </div>
              )}
              {paid === false && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: RED }}>Say why in the notes — the office will be alerted.</div>}
            </div>
          )}

          <span style={label}>{leftCount ? "Notes — why is some left? (the office sees this)" : "Notes for the office (optional)"}</span>
          <textarea style={{ ...field, minHeight: 70, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder={leftCount ? (pickup ? "e.g. only 8 of the 10 boards ready" : "e.g. 2 boards damaged, brought back") : (pickup ? "e.g. collection note signed by Dave" : "e.g. left round the back by the gate")} />
          {(leftCount > 0 || paid === false) && counted && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: "#a05f10" }}>{[leftCount ? leftCount + " line" + (leftCount === 1 ? "" : "s") + " with some left" : "", paid === false ? "payment not collected" : ""].filter(Boolean).join(" and ")} — the office will be alerted.</div>}

          {msg && <div style={{ marginTop: 12, color: RED, fontWeight: 700, fontSize: 14 }}>{msg}</div>}
          <button type="button" onClick={save} disabled={!ok || busy}
            style={{ marginTop: 16, width: "100%", border: "none", borderRadius: 12, padding: 15, fontFamily: "inherit", fontWeight: 800, fontSize: 17, background: ok ? GREEN : "#e6e9ef", color: ok ? "#fff" : "#8593a8", cursor: ok ? "pointer" : "default" }}>
            {busy ? "Saving…" : pickup ? "Confirm pick-up" : "Confirm drop"}
          </button>
          {!ok && <div style={{ marginTop: 8, fontSize: 12.5, color: "#8593a8", fontWeight: 600, textAlign: "center" }}>{!photos.length ? "At least one photo is needed." : !counted ? "Tick each line, or put how many you " + (pickup ? "collected" : "dropped") + "." : paid === null ? "Say whether the payment was collected." : paid ? "Pick how they paid." : "Say why the payment wasn't collected."}</div>}
          <div style={{ marginTop: 8, fontSize: 12.5, color: "#8593a8", fontWeight: 600, textAlign: "center" }}>{pickup ? "Confirming ticks these parts off on the jobs they're for and opens your next stop." : "Confirming opens your next stop."}</div>
        </div>
      </div>
    </div>
  );
}

// ===== fuel: time, driver and location are recorded automatically =====
function FuelForm({ driver, vans, header, onBack }) {
  const [van, setVan] = useState("");
  const [amount, setAmount] = useState("");
  const [points, setPoints] = useState(false);
  const [mileage, setMileage] = useState("");
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState("");
  const [geo, setGeo] = useState({ state: "finding" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [msg, setMsg] = useState("");
  const [recent, setRecent] = useState([]);

  const locate = () => {
    if (!navigator.geolocation) { setGeo({ state: "none" }); return; }
    setGeo({ state: "finding" });
    navigator.geolocation.getCurrentPosition(
      (p) => setGeo({ state: "ok", lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      () => setGeo({ state: "denied" }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };
  const loadRecent = async () => {
    try {
      const sb = await getSupabase();
      const { data } = await sb.from("fuel_logs").select("id, at, van, amount, mileage, points_collected").order("at", { ascending: false }).limit(5);
      setRecent(data || []);
    } catch (e) { /* not set up yet */ }
  };
  useEffect(() => { locate(); loadRecent(); }, []);

  const pick = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
  };
  // shrink the receipt photo so it uploads quickly on a phone signal
  const shrink = (file) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob((b) => resolve(b || file), "image/jpeg", 0.82);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });

  const ok = van && Number(amount) > 0 && Number(mileage) > 0 && photo;
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true); setMsg("");
    try {
      const sb = await getSupabase();
      const { data: { user } } = await sb.auth.getUser();
      const id = uid();
      const path = user.id + "/" + new Date().toISOString().slice(0, 10) + "-" + id + ".jpg";
      const blob = await shrink(photo);
      const up = await sb.storage.from("fuel-receipts").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (up.error) throw new Error("photo: " + up.error.message);
      const row = { id, user_id: user.id, driver, van, amount: Number(amount), points_collected: points, mileage: Math.round(Number(mileage)), receipt_path: path,
        lat: geo.state === "ok" ? geo.lat : null, lng: geo.state === "ok" ? geo.lng : null, accuracy_m: geo.state === "ok" ? geo.acc : null };
      const ins = await sb.from("fuel_logs").insert(row);
      if (ins.error) throw new Error(ins.error.message);
      setDone(new Date());
      setAmount(""); setMileage(""); setPoints(false); setPhoto(null); setPreview("");
      loadRecent();
    } catch (e) {
      setMsg("Couldn't save — " + (e && e.message ? e.message : "try again") + ". Nothing was lost: check your signal and tap Save again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={page}>
      {header("Fuel", onBack)}
      <div style={{ padding: 14 }}>
        {done && <div style={{ ...cardS, borderColor: "#bfe3ca", background: "#f1faf4", color: GREEN, fontWeight: 800 }}>✓ Saved at {done.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} — thanks!</div>}
        <div style={cardS}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#5a6a85" }}>
            {driver} · {new Date().toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            <div style={{ marginTop: 4, color: geo.state === "ok" ? GREEN : geo.state === "finding" ? "#8593a8" : "#a05f10" }}>
              {geo.state === "ok" ? "📍 Location found" : geo.state === "finding" ? "Finding your location…" : "📍 Location not available"}
              {geo.state !== "ok" && geo.state !== "finding" && <button type="button" onClick={locate} style={{ marginLeft: 8, border: "none", background: "none", color: "#185FA5", fontFamily: "inherit", fontWeight: 800, padding: 0 }}>Try again</button>}
            </div>
          </div>

          <span style={label}>Vehicle</span>
          <select value={van} onChange={(e) => setVan(e.target.value)} style={field}>
            <option value="">Choose the van…</option>
            {vans.filter((v) => v.active !== false).map((v) => <option key={v.id} value={v.name}>{v.name}{v.reg ? " · " + v.reg : ""}</option>)}
          </select>

          <span style={label}>Fuel amount (£)</span>
          <input style={field} inputMode="decimal" placeholder="e.g. 85.40" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />

          <span style={label}>Mileage</span>
          <input style={field} inputMode="numeric" placeholder="Odometer reading" value={mileage} onChange={(e) => setMileage(e.target.value.replace(/[^\d]/g, ""))} />

          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
            <input type="checkbox" checked={points} onChange={(e) => setPoints(e.target.checked)} style={{ width: 22, height: 22 }} />
            Points collected
          </label>

          <span style={label}>Receipt photo</span>
          <label style={{ ...field, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 54, cursor: "pointer", fontWeight: 800, borderStyle: preview ? "solid" : "dashed", color: preview ? GREEN : NAVY }}>
            <input type="file" accept="image/*" capture="environment" onChange={pick} style={{ display: "none" }} />
            📷 {preview ? "Photo taken — tap to retake" : "Take a photo of the receipt"}
          </label>
          {preview && <img src={preview} alt="Receipt" style={{ marginTop: 10, width: "100%", maxHeight: 260, objectFit: "contain", borderRadius: 10, border: "1px solid #e6e9ef" }} />}

          {msg && <div style={{ marginTop: 12, color: RED, fontWeight: 700, fontSize: 14 }}>{msg}</div>}
          <button type="button" onClick={save} disabled={!ok || busy}
            style={{ marginTop: 16, width: "100%", border: "none", borderRadius: 12, padding: 15, fontFamily: "inherit", fontWeight: 800, fontSize: 17, background: ok ? GOLD : "#e6e9ef", color: ok ? NAVY : "#8593a8", cursor: ok ? "pointer" : "default" }}>
            {busy ? "Saving…" : "Save fuel"}
          </button>
          {!ok && <div style={{ marginTop: 8, fontSize: 12.5, color: "#8593a8", fontWeight: 600, textAlign: "center" }}>Vehicle, amount, mileage and the receipt photo are needed.</div>}
        </div>

        {recent.length > 0 && (
          <div style={cardS}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: "#8593a8", marginBottom: 6 }}>Your last fill-ups</div>
            {recent.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 8, fontSize: 13.5, padding: "6px 0", borderTop: "1px solid #eef1f6" }}>
                <span style={{ flex: 1 }}>{prettyDateTime(r.at)} · {r.van}</span>
                <b>{gbp(Number(r.amount) || 0)}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
