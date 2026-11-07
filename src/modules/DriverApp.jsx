// Driver logins: a phone screen with just their own runs (today, tomorrow and the rest of the week)
// and a fuel form. The database only hands a driver the jobs and pick-ups planned for them.
import { useState, useEffect, useMemo } from "react";
import { crmStorage } from "../data/crmStorage.js";
import { getSupabase } from "../data/supabaseClient.js";
import { signOut } from "../data/auth.js";
import { normaliseCrm, isVoidInvoice, isCollectionJob, invoiceTotals, isPaid, gbp } from "../lib/crmCore.js";
import { NAVY, GOLD, RED, uid, prettyDate, prettyDateTime } from "../lib/core.js";
import { Icon } from "./crm/ui.jsx";
import { loadDrops, saveDrop, shrinkPhoto } from "../data/drops.js";
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

export default function DriverApp({ me }) {
  const driver = me.driverName || (me.fullName || "").split(" ")[0] || "";
  const [crm, setCrm] = useState(null);
  const [err, setErr] = useState("");
  const [view, setView] = useState(null); // null = home · a yyyy-mm-dd = that day's runs · "fuel"
  const load = async () => {
    setErr("");
    try {
      const r = await crmStorage.get("dk-crm");
      setCrm(normaliseCrm(r && r.value ? JSON.parse(r.value) : {}));
    } catch (e) {
      setErr("Couldn't load your runs — check your signal and tap refresh.");
    }
  };
  useEffect(() => { load(); }, []);

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
        <div style={{ fontSize: 12, color: "#aeb9cf", fontWeight: 600 }}>{driver ? driver + " · " : ""}Deck Kingdom</div>
      </div>
      <button type="button" onClick={load} title="Refresh" style={{ border: "none", background: "rgba(255,255,255,.12)", color: "#fff", borderRadius: 10, height: 40, padding: "0 12px", fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>↻</button>
    </div>
  );

  if (!driver) {
    return (
      <div style={page}>{header("Driver")}
        <div style={{ padding: 16 }}><div style={cardS}>Your login isn't linked to a driver name yet — ask the office to set it in Users &amp; access.</div></div>
      </div>
    );
  }

  if (view === "fuel") return <FuelForm driver={driver} vans={(crm && crm.vans) || []} header={header} onBack={() => setView(null)} />;
  if (view) return <DayRuns date={view} stops={byDay[view] || []} crm={crm} header={header} onBack={() => setView(null)} />;

  // ===== home: 7 day buttons + fuel =====
  return (
    <div style={page}>
      {header("Hi " + driver)}
      <div style={{ padding: 14 }}>
        {err && <div style={{ ...cardS, borderColor: RED, color: RED, fontWeight: 700 }}>{err}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {days.map((d, n) => {
            const k = ymd(d), count = crm ? (byDay[k] || []).length : null;
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
        <button type="button" onClick={() => signOut().then(() => window.location.reload())}
          style={{ marginTop: 22, width: "100%", border: "1px solid #d5d9e0", background: "#fff", borderRadius: 12, padding: 12, fontFamily: "inherit", fontWeight: 700, color: "#5a6a85", cursor: "pointer" }}>Sign out</button>
      </div>
    </div>
  );
}

// ===== one day's stops, in run and drop order =====
// Fail-safe: a run's delivery addresses stay part-hidden (first 5 characters, first half of the
// postcode) until the driver has ticked every item on that run as being on the van.
const tickKey = (date) => "dk-van-check:" + date;
const loadTicks = (date) => { try { return JSON.parse(localStorage.getItem(tickKey(date)) || "{}"); } catch (e) { return {}; } };
const saveTicks = (date, t) => {
  try {
    localStorage.setItem(tickKey(date), JSON.stringify(t));
    // tidy old days
    Object.keys(localStorage).filter((k) => k.startsWith("dk-van-check:") && k.slice(13) < ymd(addDaysTo(new Date(), -7))).forEach((k) => localStorage.removeItem(k));
  } catch (e) { /* private window: ticks just last while the page is open */ }
};
const maskAddr = (address, postcode) => {
  const a = String(address || "").trim();
  const out = outwardCode(postcode);
  return [a ? a.slice(0, 5) + (a.length > 5 ? "…" : "") : "", out ? out + " •••" : ""].filter(Boolean).join("  ·  ");
};
const invLines = (o) => (o.lines || []).map((l, i) => ({ l, i })).filter(({ l }) => l.qty && (l.description || l.code));

function NavButtons({ dest }) {
  const apple = isApple();
  const g = <a key="g" href={googleNavHref(dest)} target="_blank" rel="noopener noreferrer" style={{ ...navBtn, background: apple ? "#fff" : "#185FA5", color: apple ? "#185FA5" : "#fff" }}>▶ {apple ? "Google Maps" : "Navigate"}</a>;
  const a = <a key="a" href={appleNavHref(dest)} target="_blank" rel="noopener noreferrer" style={{ ...navBtn, background: apple ? "#185FA5" : "#fff", color: apple ? "#fff" : "#185FA5" }}>▶ {apple ? "Navigate" : "Apple Maps"}</a>;
  return <div style={{ display: "flex", gap: 8, marginTop: 8 }}>{apple ? [a, g] : [g, a]}</div>;
}
const navBtn = { flex: 1, textAlign: "center", border: "1px solid #185FA5", borderRadius: 10, padding: "11px 8px", fontWeight: 800, fontSize: 15, textDecoration: "none" };

function DayRuns({ date, stops, crm, header, onBack }) {
  const d = new Date(date + "T00:00:00");
  const title = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const custById = {}, siteById = {};
  ((crm && crm.customers) || []).forEach((c) => (custById[c.id] = c));
  ((crm && crm.sites) || []).forEach((s) => (siteById[s.id] = s));
  const [ticks, setTicks] = useState(() => loadTicks(date));
  const toggle = (k) => setTicks((t) => { const n = { ...t }; if (n[k]) delete n[k]; else n[k] = Date.now(); saveTicks(date, n); return n; });
  const [drops, setDrops] = useState({}); // invoiceId -> confirmation
  const [dropsErr, setDropsErr] = useState("");
  const [completing, setCompleting] = useState(null); // the job being confirmed
  useEffect(() => {
    let live = true;
    loadDrops([date]).then((m) => live && setDrops(m)).catch((e) => live && setDropsErr(/drop_confirmations/.test(String(e && e.message)) ? "Drop confirmations aren't switched on yet — ask the office to run drop-confirmations.sql." : "Couldn't check which drops are done — tap ↻ to try again."));
    return () => { live = false; };
  }, [date]);
  const dropped = (o) => !!(o.deliveryCompleted || drops[o.id]);
  const isDrop = (x) => x.kind === "inv" && !isCollectionJob(x.obj);

  // what has to be on the van for each run (drops still to do; not warehouse collections)
  const need = {}, order = {};
  stops.forEach((x) => {
    if (!isDrop(x)) return;
    const r = x.obj.runNo || "";
    (order[r] = order[r] || []).push(x.obj);
    if (dropped(x.obj)) return;
    invLines(x.obj).forEach(({ i }) => (need[r] = need[r] || []).push(x.obj.id + ":" + i));
  });
  const runState = (r) => { const l = need[r] || []; const done = l.filter((k) => ticks[k]).length; return { total: l.length, done, open: done === l.length }; };
  // once loaded, drops open one at a time: the next one only after the one before is confirmed
  const currentOf = (r) => (order[r] || []).find((o) => !dropped(o)) || null;

  if (completing) return <CompleteDrop job={completing} cust={custById[completing.customerId] || {}} header={header} date={date}
    onBack={() => setCompleting(null)} onSaved={(conf) => { setDrops((m) => ({ ...m, [conf.invoiceId]: conf })); setCompleting(null); window.scrollTo(0, 0); }} />;

  let lastRun = null;
  return (
    <div style={page}>
      {header(title, onBack)}
      <div style={{ padding: 14 }}>
        {dropsErr && <div style={{ ...cardS, borderColor: "#f4d78f", background: "#fff8e6", color: "#6b5305", fontWeight: 700, fontSize: 13.5 }}>{dropsErr}</div>}
        {stops.length === 0 && <div style={{ ...cardS, textAlign: "center", color: "#8593a8", fontWeight: 700 }}>Nothing planned for you on {prettyDate(date)}.</div>}
        {stops.map((x, n) => {
          const o = x.obj;
          const runKey = o.runNo || "";
          const rs = runState(runKey);
          const runHead = runKey !== lastRun ? (lastRun = runKey, (
            <div style={{ margin: n ? "18px 0 8px" : "2px 0 8px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#5a6a85", letterSpacing: 0.5, textTransform: "uppercase", margin: "0 2px 6px" }}>
                {o.runNo ? "Run " + o.runNo : "No run number"}{o.van ? " · " + o.van : ""}
              </div>
              {rs.total > 0 && (rs.open ? (
                <div style={{ background: "#f1faf4", border: "1px solid #bfe3ca", color: GREEN, borderRadius: 10, padding: "9px 12px", fontSize: 13.5, fontWeight: 800 }}>✓ Everything's on the van — {currentOf(runKey) ? "drops open one at a time" : "all drops confirmed"}</div>
              ) : (
                <div style={{ background: "#fff8e6", border: "1px solid #f4d78f", color: "#6b5305", borderRadius: 10, padding: "9px 12px", fontSize: 13.5, fontWeight: 700 }}>
                  <div style={{ fontWeight: 800 }}>🔒 Load check: {rs.done} of {rs.total} ticked</div>
                  <div style={{ marginTop: 3, fontWeight: 600 }}>Tick every item as you check it's on the van. Your first drop's address and sat nav open once everything's ticked.</div>
                  <div style={{ height: 6, background: "#f4e3b5", borderRadius: 4, marginTop: 7, overflow: "hidden" }}><div style={{ height: "100%", width: (100 * rs.done / rs.total) + "%", background: GOLD }} /></div>
                </div>
              ))}
            </div>
          )) : null;
          if (x.kind === "col") {
            const addr = [o.address, o.town, tidyPostcode(o.postcode)].filter(Boolean).join(", ");
            return (
              <div key={"c" + o.id}>
                {runHead}
                <div style={{ ...cardS, borderLeft: "5px solid #185FA5" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <b style={{ fontSize: 13, color: "#8593a8" }}>{o.dropNo || n + 1}</b>
                    <b style={{ fontSize: 17, flex: 1 }}>Pick up · {o.supplier || "Supplier"}</b>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#185FA5" }}>COL-{o.collectionNo}</span>
                  </div>
                  {o.collectTime && <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>{o.collectTime}</div>}
                  {addr && <div style={{ marginTop: 6, fontWeight: 700, fontSize: 14 }}>📍 {addr}</div>}
                  {addr && !o.collected && <NavButtons dest={addr} />}
                  {o.phone && <a href={telHref(o.phone)} style={{ display: "block", marginTop: 8, color: "#185FA5", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>📞 {o.phone}{o.contact ? " · " + o.contact : ""}</a>}
                  <Items rows={(o.items || []).map((it) => ({ qty: it.qty, text: it.description || it.sku, colour: it.colour }))} />
                  {o.notes && <div style={{ marginTop: 8, background: "#fff8e6", borderRadius: 8, padding: "8px 10px", fontSize: 13.5, fontWeight: 600 }}>{o.notes}</div>}
                  {o.collected && <div style={{ marginTop: 8, color: GREEN, fontWeight: 800, fontSize: 13 }}>✓ Collected</div>}
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
          const isDone = dropped(o);
          const cur = !coll && rs.open && currentOf(runKey) && currentOf(runKey).id === o.id;
          const unlocked = isDone || cur;
          const prev = !coll && !isDone && !cur && rs.open ? (order[runKey] || [])[(order[runKey] || []).findIndex((y) => y.id === o.id) - 1] : null;
          const lines = invLines(o);
          const tickable = !isDone && !coll && !rs.open;
          const conf = drops[o.id];
          return (
            <div key={"i" + o.id}>
              {runHead}
              <div style={{ ...cardS, borderLeft: "5px solid " + (isDone ? GREEN : coll ? GOLD : cur ? "#185FA5" : NAVY), opacity: isDone ? 0.75 : 1, boxShadow: cur ? "0 0 0 2px #185FA533" : "none" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <b style={{ fontSize: 13, color: "#8593a8" }}>{o.dropNo || n + 1}</b>
                  <b style={{ fontSize: 17, flex: 1 }}>{c.name || "Customer"}</b>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#8593a8" }}>#{o.invNo}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: coll ? "#a06d00" : cur ? "#185FA5" : "#5a6a85", marginTop: 3 }}>
                  {coll ? "Customer collecting from the warehouse" : cur ? "Next drop" : "Delivery"}{o.deliveryTime ? " · " + o.deliveryTime : ""}
                </div>
                {addr && !coll && (unlocked ? (
                  <>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 14 }}>📍 {addr}</div>
                    {cur && <NavButtons dest={addr} />}
                  </>
                ) : (
                  <div style={{ marginTop: 6, fontWeight: 700, fontSize: 14, color: "#8593a8" }}>🔒 {maskAddr(a.address, a.postcode)}</div>
                ))}
                {prev && <div style={{ marginTop: 4, fontSize: 12.5, fontWeight: 700, color: "#8593a8" }}>Opens once drop {prev.dropNo || ""} ({(custById[prev.customerId] || {}).name || "#" + prev.invNo}) is confirmed</div>}
                {tel && <a href={telHref(tel)} style={{ display: "block", marginTop: 8, color: "#185FA5", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>📞 {tel}{st && st.contact ? " · " + st.contact : ""}</a>}
                {tickable ? (
                  <div style={{ marginTop: 8, borderTop: "1px solid #eef1f6", paddingTop: 4 }}>
                    {lines.map(({ l, i }) => {
                      const k = o.id + ":" + i, on = !!ticks[k];
                      return (
                        <button key={k} type="button" onClick={() => toggle(k)}
                          style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", border: "none", background: "none", fontFamily: "inherit", color: NAVY, textAlign: "left", fontSize: 14.5, padding: "8px 0", cursor: "pointer", borderBottom: "1px solid #f3f5f8" }}>
                          <span style={tickBox(on)}>{on ? "✓" : ""}</span>
                          <b style={{ minWidth: 34, textAlign: "right" }}>{l.qty}×</b>
                          <span style={{ flex: 1, textDecoration: on ? "line-through" : "none", color: on ? "#8593a8" : NAVY }}>{l.description || l.code}{l.colour ? <span style={{ color: "#5a6a85" }}> · {l.colour}</span> : null}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Items rows={lines.map(({ l }) => ({ qty: l.qty, text: l.description || l.code, colour: l.colour }))} />
                )}
                {o.jobNotes && <div style={{ marginTop: 8, background: "#fff8e6", borderRadius: 8, padding: "8px 10px", fontSize: 13.5, fontWeight: 600 }}>{o.jobNotes}</div>}
                {owed > 0 && <div style={{ marginTop: 8, background: "#fde8ea", color: RED, borderRadius: 8, padding: "8px 10px", fontSize: 14, fontWeight: 800 }}>Payment to take: {gbp(owed)}</div>}
                {cur && (
                  <button type="button" onClick={() => setCompleting(o)}
                    style={{ marginTop: 10, width: "100%", border: "none", borderRadius: 12, padding: 15, fontFamily: "inherit", fontWeight: 800, fontSize: 17, background: GREEN, color: "#fff", cursor: "pointer" }}>
                    ✓ Complete this drop
                  </button>
                )}
                {isDone && (
                  <div style={{ marginTop: 8, color: GREEN, fontWeight: 800, fontSize: 13 }}>
                    ✓ {conf ? "Dropped " + new Date(conf.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " · photo taken" + (conf.items && conf.items.some((x) => x.short) ? " · short drop noted" : "") : "Delivered"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {stops.length > 0 && <div style={{ textAlign: "center", fontSize: 12.5, color: "#8593a8", fontWeight: 600, marginTop: 10 }}>Problems? Call the office on <a href="tel:01613991837" style={{ color: "#185FA5", fontWeight: 800 }}>0161 399 1837</a></div>}
      </div>
    </div>
  );
}

const Items = ({ rows }) => (rows.length ? (
  <div style={{ marginTop: 8, borderTop: "1px solid #eef1f6", paddingTop: 6 }}>
    {rows.map((r, i) => (
      <div key={i} style={{ display: "flex", gap: 8, fontSize: 14, padding: "3px 0" }}>
        <b style={{ minWidth: 34, textAlign: "right" }}>{r.qty}×</b>
        <span style={{ flex: 1 }}>{r.text}{r.colour ? <span style={{ color: "#5a6a85" }}> · {r.colour}</span> : null}</span>
      </div>
    ))}
  </div>
) : null);

const tickBox = (on) => ({ width: 26, height: 26, flex: "none", borderRadius: 7, border: "2px solid " + (on ? GREEN : "#c4cbd6"), background: on ? GREEN : "#fff", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 15 });

// ===== confirm a drop: tick what was left, a photo, then the next job opens =====
function CompleteDrop({ job, cust, header, date, onBack, onSaved }) {
  const lines = invLines(job);
  const [got, setGot] = useState({}); // line index -> true
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState("");
  const [geo, setGeo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => setGeo({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), () => {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }, []);
  const all = lines.every(({ i }) => got[i]);
  const short = !all;
  const ok = photo && (all || notes.trim().length >= 3);
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true); setMsg("");
    try {
      const blob = await shrinkPhoto(photo);
      const conf = await saveDrop({
        id: uid(), driver: job.driver || "", invoiceId: job.id, invNo: job.invNo, date,
        items: lines.map(({ l, i }) => ({ qty: l.qty, text: l.description || l.code, colour: l.colour || "", dropped: !!got[i], short: !got[i] })),
        notes: notes.trim(), lat: geo && geo.lat, lng: geo && geo.lng, acc: geo && geo.acc,
      }, blob);
      onSaved(conf);
    } catch (e) {
      setMsg("Couldn't save — " + (e && e.message ? e.message : "try again") + ". Check your signal and tap Confirm again.");
    } finally { setBusy(false); }
  };
  return (
    <div style={page}>
      {header("Complete drop " + (job.dropNo || ""), onBack)}
      <div style={{ padding: 14 }}>
        <div style={cardS}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{cust.name || "Customer"} <span style={{ fontSize: 12, color: "#8593a8" }}>#{job.invNo}</span></div>
          <span style={label}>Tick everything you've dropped</span>
          {lines.map(({ l, i }) => {
            const on = !!got[i];
            return (
              <button key={i} type="button" onClick={() => setGot((g) => ({ ...g, [i]: !g[i] }))}
                style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", border: "none", background: "none", fontFamily: "inherit", color: NAVY, textAlign: "left", fontSize: 15, padding: "10px 0", cursor: "pointer", borderBottom: "1px solid #f3f5f8" }}>
                <span style={tickBox(on)}>{on ? "✓" : ""}</span>
                <b style={{ minWidth: 34, textAlign: "right" }}>{l.qty}×</b>
                <span style={{ flex: 1 }}>{l.description || l.code}{l.colour ? <span style={{ color: "#5a6a85" }}> · {l.colour}</span> : null}</span>
              </button>
            );
          })}
          {lines.length > 1 && (
            <button type="button" onClick={() => setGot(all ? {} : Object.fromEntries(lines.map(({ i }) => [i, true])))}
              style={{ marginTop: 8, border: "none", background: "none", color: "#185FA5", fontFamily: "inherit", fontWeight: 800, fontSize: 14, padding: 0, cursor: "pointer" }}>{all ? "Untick all" : "Tick all"}</button>
          )}

          <span style={label}>Photo of the drop</span>
          <label style={{ ...field, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 54, cursor: "pointer", fontWeight: 800, borderStyle: preview ? "solid" : "dashed", color: preview ? GREEN : NAVY }}>
            <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) { setPhoto(f); setPreview(URL.createObjectURL(f)); } }} />
            📷 {preview ? "Photo taken — tap to retake" : "Take a photo of the goods where you left them"}
          </label>
          {preview && <img src={preview} alt="Drop" style={{ marginTop: 10, width: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 10, border: "1px solid #e6e9ef" }} />}

          <span style={label}>{short ? "What's short or wrong? (needed)" : "Notes (optional)"}</span>
          <textarea style={{ ...field, minHeight: 70, resize: "vertical", borderColor: short && lines.length ? "#f4d78f" : "#d5d9e0" }} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder={short ? "e.g. 2 boards damaged, brought back" : "e.g. left round the back by the gate"} />

          {msg && <div style={{ marginTop: 12, color: RED, fontWeight: 700, fontSize: 14 }}>{msg}</div>}
          <button type="button" onClick={save} disabled={!ok || busy}
            style={{ marginTop: 16, width: "100%", border: "none", borderRadius: 12, padding: 15, fontFamily: "inherit", fontWeight: 800, fontSize: 17, background: ok ? GREEN : "#e6e9ef", color: ok ? "#fff" : "#8593a8", cursor: ok ? "pointer" : "default" }}>
            {busy ? "Saving…" : "Confirm drop"}
          </button>
          {!ok && <div style={{ marginTop: 8, fontSize: 12.5, color: "#8593a8", fontWeight: 600, textAlign: "center" }}>{!photo ? "A photo of the drop is needed." : "Tick everything dropped, or say what's short."}</div>}
          <div style={{ marginTop: 8, fontSize: 12.5, color: "#8593a8", fontWeight: 600, textAlign: "center" }}>Confirming opens your next drop.</div>
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
