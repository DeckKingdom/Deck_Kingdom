// Driver logins: a phone screen with just their own runs (today, tomorrow and the rest of the week)
// and a fuel form. The database only hands a driver the jobs and pick-ups planned for them.
import { useState, useEffect, useMemo } from "react";
import { crmStorage } from "../data/crmStorage.js";
import { getSupabase } from "../data/supabaseClient.js";
import { signOut } from "../data/auth.js";
import { normaliseCrm, isVoidInvoice, isCollectionJob, invoiceTotals, isPaid, gbp } from "../lib/crmCore.js";
import { NAVY, GOLD, RED, uid, prettyDate, prettyDateTime } from "../lib/core.js";
import { Icon } from "./crm/ui.jsx";

const GREEN = "#28713e";
const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const addDaysTo = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const telHref = (n) => "tel:" + String(n || "").replace(/[^\d+]/g, "");
const mapHref = (q) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);

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
function DayRuns({ date, stops, crm, header, onBack }) {
  const d = new Date(date + "T00:00:00");
  const title = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const custById = {}, siteById = {};
  ((crm && crm.customers) || []).forEach((c) => (custById[c.id] = c));
  ((crm && crm.sites) || []).forEach((s) => (siteById[s.id] = s));
  let lastRun = null;
  return (
    <div style={page}>
      {header(title, onBack)}
      <div style={{ padding: 14 }}>
        {stops.length === 0 && <div style={{ ...cardS, textAlign: "center", color: "#8593a8", fontWeight: 700 }}>Nothing planned for you on {prettyDate(date)}.</div>}
        {stops.map((x, n) => {
          const o = x.obj;
          const runKey = o.runNo || "";
          const runHead = runKey !== lastRun ? (lastRun = runKey, (
            <div style={{ fontSize: 12, fontWeight: 800, color: "#5a6a85", letterSpacing: 0.5, textTransform: "uppercase", margin: n ? "16px 2px 8px" : "2px 2px 8px" }}>
              {o.runNo ? "Run " + o.runNo : "No run number"}{o.van ? " · " + o.van : ""}
            </div>
          )) : null;
          if (x.kind === "col") {
            const addr = [o.address, o.town, o.postcode].filter(Boolean).join(", ");
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
                  {addr && <a href={mapHref(addr)} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 6, color: "#185FA5", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>📍 {addr}</a>}
                  {o.phone && <a href={telHref(o.phone)} style={{ display: "block", marginTop: 6, color: "#185FA5", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>📞 {o.phone}{o.contact ? " · " + o.contact : ""}</a>}
                  <Items rows={(o.items || []).map((it) => ({ qty: it.qty, text: it.description || it.sku, colour: it.colour }))} />
                  {o.notes && <div style={{ marginTop: 8, background: "#fff8e6", borderRadius: 8, padding: "8px 10px", fontSize: 13.5, fontWeight: 600 }}>{o.notes}</div>}
                  {o.collected && <div style={{ marginTop: 8, color: GREEN, fontWeight: 800, fontSize: 13 }}>✓ Collected</div>}
                </div>
              </div>
            );
          }
          const c = custById[o.customerId] || {}, st = siteById[o.siteId] || null;
          const addr = st ? [st.address, st.town, st.postcode].filter(Boolean).join(", ") : [c.address, c.town, c.postcode].filter(Boolean).join(", ");
          const tel = (st && (st.mobile || st.landline)) || c.mobile || c.landline || "";
          const coll = isCollectionJob(o);
          const owed = !isPaid(o) ? invoiceTotals(o).total : 0;
          return (
            <div key={"i" + o.id}>
              {runHead}
              <div style={{ ...cardS, borderLeft: "5px solid " + (o.deliveryCompleted ? GREEN : coll ? GOLD : NAVY), opacity: o.deliveryCompleted ? 0.75 : 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <b style={{ fontSize: 13, color: "#8593a8" }}>{o.dropNo || n + 1}</b>
                  <b style={{ fontSize: 17, flex: 1 }}>{c.name || "Customer"}</b>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#8593a8" }}>#{o.invNo}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: coll ? "#a06d00" : "#5a6a85", marginTop: 3 }}>
                  {coll ? "Customer collecting from the warehouse" : "Delivery"}{o.deliveryTime ? " · " + o.deliveryTime : ""}
                </div>
                {addr && !coll && <a href={mapHref(addr)} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 6, color: "#185FA5", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>📍 {addr}</a>}
                {tel && <a href={telHref(tel)} style={{ display: "block", marginTop: 6, color: "#185FA5", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>📞 {tel}{st && st.contact ? " · " + st.contact : ""}</a>}
                <Items rows={(o.lines || []).filter((l) => l.qty && (l.description || l.code)).map((l) => ({ qty: l.qty, text: l.description || l.code, colour: l.colour }))} />
                {o.jobNotes && <div style={{ marginTop: 8, background: "#fff8e6", borderRadius: 8, padding: "8px 10px", fontSize: 13.5, fontWeight: 600 }}>{o.jobNotes}</div>}
                {owed > 0 && <div style={{ marginTop: 8, background: "#fde8ea", color: RED, borderRadius: 8, padding: "8px 10px", fontSize: 14, fontWeight: 800 }}>Payment to take: {gbp(owed)}</div>}
                {o.deliveryCompleted && <div style={{ marginTop: 8, color: GREEN, fontWeight: 800, fontSize: 13 }}>✓ Delivered</div>}
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
