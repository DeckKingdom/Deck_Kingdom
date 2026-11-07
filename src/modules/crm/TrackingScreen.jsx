// Driver tracking (admin): every run's set-off, drops, miles, hours and what each drop cost, plus
// alerts for drops closed away from the address and vans whose mileage or fuel doesn't add up.
import { useEffect, useMemo, useState } from "react";
import { NAVY, GOLD, RED } from "../../lib/core.js";
import { gbp, DRIVERS } from "../../lib/crmCore.js";
import { ListHero, HeroStat, Icon, Chip, card, sect, lbl, inp, btn, goldBtn, Modal } from "./ui.jsx";
import { dropLeft, dropPhotoUrl } from "../../data/drops.js";
import { loadTracking, workOut } from "../../data/trackingData.js";
import { refreshFuelPrice } from "../../data/fleetApi.js";
import { fleetSettings, FLEET_DEFAULTS, mpgFor } from "../../lib/tracking.js";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const hm = (t) => (t ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—");
const dayLabel = (s) => new Date(s + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const mi = (n) => (n == null ? "—" : n.toFixed(n < 10 ? 1 : 0) + " mi");
const dur = (m) => (m == null ? "—" : m >= 60 ? Math.floor(m / 60) + "h " + pad(Math.round(m % 60)) + "m" : Math.round(m) + "m");

const RANGES = [
  ["week", "This week"], ["lastweek", "Last week"], ["month", "This month"], ["lastmonth", "Last month"], ["custom", "Custom"],
];
const rangeOf = (k, custom) => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  if (k === "week") return [ymd(mon), ymd(t)];
  if (k === "lastweek") { const a = new Date(mon); a.setDate(a.getDate() - 7); const b = new Date(mon); b.setDate(b.getDate() - 1); return [ymd(a), ymd(b)]; }
  if (k === "month") return [ymd(new Date(t.getFullYear(), t.getMonth(), 1)), ymd(t)];
  if (k === "lastmonth") return [ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), ymd(new Date(t.getFullYear(), t.getMonth(), 0))];
  return [custom.from || ymd(mon), custom.to || ymd(t)];
};

export default function TrackingScreen({ crm, updateCrm, openInvoice, openCollection, canSettings }) {
  const s = fleetSettings(crm);
  const [range, setRange] = useState(() => { try { return localStorage.getItem("dk-track-range") || "week"; } catch (e) { return "week"; } });
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [driver, setDriver] = useState("");
  const [data, setData] = useState(null); // { confs, events, fuel, geo }
  const [err, setErr] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [openRun, setOpenRun] = useState({});
  const [from, to] = rangeOf(range, custom);

  useEffect(() => { try { localStorage.setItem("dk-track-range", range); } catch (e) { /* */ } }, [range]);
  useEffect(() => {
    let live = true;
    setErr("");
    (async () => {
      try {
        await refreshFuelPrice(); // today's supermarket price, if it isn't saved yet
        const d = await loadTracking(crm, from, to);
        if (live) setData(d);
      } catch (e) {
        if (live) setErr(/drop_confirmations|driver_events/.test(String(e && e.message)) ? "Run drop-confirmations.sql and driver-tracking.sql in Supabase to switch driver tracking on." : String((e && e.message) || e));
      }
    })();
    return () => { live = false; };
  }, [from, to, crm.invoices, crm.collections]);

  const result = useMemo(() => {
    if (!data) return null;
    return workOut(crm, data, from, to, driver);
  }, [data, driver, crm.fleetCosts, crm.invoices, crm.collections]);

  const tot = result ? result.runs.reduce((t, r) => ({ runs: t.runs + 1, drops: t.drops + r.confirmed.filter((x) => x.kind === "inv").length, miles: t.miles + r.miles, hours: t.hours + r.hours, fuel: t.fuel + r.fuel, time: t.time + r.time }), { runs: 0, drops: 0, miles: 0, hours: 0, fuel: 0, time: 0 }) : null;
  const drivers = [...new Set([...DRIVERS, ...((data && data.confs) || []).map((c) => c.driver).filter(Boolean)])];

  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "18px 18px 40px" }}>
      <ListHero title="Driver tracking" sub={dayLabel(from) + " – " + dayLabel(to) + " · set-off to back at " + s.yard + " · diesel at that day's supermarket price" + (data && Object.keys(data.prices || {}).length ? "" : " (none published yet — " + gbp(Number(s.dieselPerLitre)) + "/L used)") + " · " + s.mpg + "mpg (Sprinter " + s.sprinterMpg + ") · " + gbp(Number(s.hourly)) + "/hr" + (result && result.runs.length ? (result.runs.every((r) => r.roadMiles) ? " · Google road miles" : " · straight-line miles ×" + s.roadFactor + " where Google isn't connected") : "")}
        action={canSettings && <button onClick={() => setShowSettings(true)} title="Fuel price, mpg and driver rate" style={{ ...btn, background: "transparent", border: "1px solid #3a4f78", color: "#fff", display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="gear" stroke="#fff" /> Rates</button>}>
        <HeroStat label="Drops" value={tot ? tot.drops : "…"} sub={tot ? tot.runs + " run" + (tot.runs === 1 ? "" : "s") : ""} />
        <HeroStat label="Miles" value={tot ? Math.round(tot.miles).toLocaleString("en-GB") : "…"} sub={tot ? Math.round(tot.hours * 10) / 10 + " driver hours" : ""} />
        <HeroStat label="Fuel" value={tot ? gbp(tot.fuel) : "…"} sub="estimated from the miles" />
        <HeroStat label="Driver time" value={tot ? gbp(tot.time) : "…"} sub={"at " + gbp(Number(s.hourly)) + "/hr"} />
        <HeroStat label="Cost per drop" value={tot && tot.drops ? gbp((tot.fuel + tot.time) / tot.drops) : "—"} sub={tot ? gbp(tot.fuel + tot.time) + " in total" : ""} />
      </ListHero>

      <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {RANGES.map(([k, l]) => (
            <button key={k} onClick={() => setRange(k)} style={{ ...btn, padding: "6px 12px", fontSize: 12.5, background: range === k ? NAVY : "#fff", color: range === k ? "#fff" : NAVY, borderColor: range === k ? NAVY : "#d5d9e0" }}>{l}</button>
          ))}
        </div>
        {range === "custom" && (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="date" style={{ ...inp, width: 150 }} value={custom.from || from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <span style={{ color: "#8593a8" }}>to</span>
            <input type="date" style={{ ...inp, width: 150 }} value={custom.to || to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </span>
        )}
        <span style={{ flex: 1 }} />
        <select style={{ ...inp, width: 170 }} value={driver} onChange={(e) => setDriver(e.target.value)}>
          <option value="">All drivers</option>
          {drivers.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {err && <div style={{ ...card, borderColor: "#f4d78f", background: "#fff8e6", color: "#6b5305", fontWeight: 700 }}>{err}</div>}
      {!result && !err && <div style={{ ...card, color: "#8593a8", fontWeight: 600, textAlign: "center" }}>Working out the runs…</div>}

      {result && (
        <div style={card}>
          <p style={sect}>Alerts {result.alerts.length > 0 && <Chip tone="red" style={{ marginLeft: 6 }}>{result.alerts.length}</Chip>}</p>
          {result.alerts.length === 0 ? <div style={{ fontSize: 13.5, color: "#28713e", fontWeight: 700 }}>✓ Nothing out of line for these dates.</div> : (
            result.alerts.map((a, k) => (
              <div key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: k ? "1px solid #f0f2f6" : "none", fontSize: 13.5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: a.tone === "red" ? RED : "#E8912D", marginTop: 6, flex: "none" }} />
                <span style={{ flex: 1, color: NAVY, fontWeight: 600 }}>{a.date && <b style={{ color: "#5a6a85", marginRight: 6 }}>{dayLabel(a.date)}{a.driver ? " · " + a.driver : ""}</b>}{a.text}</span>
              </div>
            ))
          )}
        </div>
      )}

      {result && result.runs.length === 0 && <div style={{ ...card, color: "#8593a8", fontWeight: 600, textAlign: "center" }}>No driver runs with confirmations in these dates.</div>}

      {result && result.runs.map((r) => {
        const open = openRun[r.key] !== false;
        return (
          <div key={r.key} style={{ ...card, padding: 0, overflow: "hidden" }}>
            <button onClick={() => setOpenRun((m) => ({ ...m, [r.key]: !open }))}
              style={{ width: "100%", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", background: "#f8f9fb", border: "none", borderBottom: open ? "1px solid #e6e9ef" : "none", padding: "12px 16px", fontFamily: "inherit", color: NAVY, cursor: "pointer", textAlign: "left" }}>
              <b style={{ fontSize: 15 }}>{dayLabel(r.date)}</b>
              <span style={{ fontWeight: 700 }}>{r.driver}{r.runNo ? " · Run " + r.runNo : ""}</span>
              <Chip>{r.van || "No van"} · {mpgFor(r.van, s)}mpg</Chip>
              <Chip tone={r.price.published ? "blue" : "grey"} title={r.price.published ? "Supermarket diesel price published " + r.price.day : "No published price for this day — the set rate is used"}>{(r.price.perLitre * 100).toFixed(1)}p/L</Chip>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "#5a6a85" }}>
                Set off {hm(r.departAt)}{r.estimatedDepart ? " (est.)" : ""} · last drop {hm(r.lastAt)} · back ≈{hm(r.backAt)}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#5a6a85" }}>{mi(r.miles)} · {dur(r.hours * 60)}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>Fuel {gbp(r.fuel)} · Driver {gbp(r.time)}</span>
              <b style={{ fontSize: 15, color: NAVY }}>{gbp(r.cost)}</b>
              <Icon name={open ? "chevleft" : "chevright"} />
            </button>
            {open && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "#8593a8", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", textAlign: "left" }}>
                      {["#", "Stop", "Postcode", "Confirmed", "Leg", "Drive + stop time", "Leg cost", "Cost of the drop", "Completion"].map((h, k) => <th key={h} style={{ padding: "8px 10px", fontWeight: 700, textAlign: k >= 4 && k <= 7 ? "right" : "left", whiteSpace: "nowrap" }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {r.confirmed.map((x, n) => <StopRow key={x.id} x={x} n={n + 1} away={Number(s.awayMiles) || 0.5} openInvoice={openInvoice} openCollection={openCollection} />)}
                    {r.confirmed.length > 0 && <tr style={{ borderTop: "1px solid #f0f2f6", color: "#5a6a85" }}>
                      <td style={td} />
                      <td style={{ ...td, fontWeight: 700 }} colSpan={2}>Back to the yard · {s.yard}</td>
                      <td style={td}>≈{hm(r.backAt)}</td>
                      <td style={tdR}>{mi(r.back.miles)}</td>
                      <td style={tdR}>{dur(r.back.minutes)}</td>
                      <td style={tdR}>{gbp(r.back.cost)}</td>
                      <td style={{ ...tdR, fontSize: 11.5 }}>shared across the drops</td>
                      <td style={td} />
                    </tr>}
                    {r.unconfirmed.map((x) => (
                      <tr key={x.id} style={{ borderTop: "1px solid #f0f2f6", color: "#8593a8" }}>
                        <td style={td}>{x.dropNo || ""}</td>
                        <td style={td}>{x.name} <span style={{ fontSize: 11.5 }}>{x.ref}</span></td>
                        <td style={td}>{x.postcode}</td>
                        <td style={td} colSpan={6}>{x.done ? "Marked done in the office — no driver confirmation" : "Not confirmed yet"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {result && (
        <div style={card}>
          <p style={sect}>Van mileage check · between fill-ups</p>
          <div style={{ fontSize: 12.5, color: "#8593a8", fontWeight: 600, marginBottom: 8 }}>
            Miles on the clock (from the fuel log) against the miles the runs account for, and against how far the fuel bought should go — receipt £ ÷ that day's published supermarket diesel price = litres, × the van's mpg. Assumes each fill-up brings the tank back to full. Over {s.tolerancePct}% either way is flagged.
          </div>
          {result.vans.length === 0 ? <div style={{ fontSize: 13.5, color: "#8593a8", fontWeight: 600 }}>Needs two fill-ups with a mileage reading for a van in these dates.</div> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: "#8593a8", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", textAlign: "left" }}>
                    {["Van", "Between", "Odometer", "On the clock", "Runs account for", "vs runs", "Fuel bought", "Price that day", "Fuel should cover", "vs fuel"].map((h, k) => <th key={h} style={{ padding: "8px 10px", fontWeight: 700, textAlign: k >= 3 ? "right" : "left", whiteSpace: "nowrap" }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.vans.map((v, k) => (
                    <tr key={k} style={{ borderTop: "1px solid #f0f2f6" }}>
                      <td style={{ ...td, fontWeight: 700 }}>{v.van}</td>
                      <td style={td}>{new Date(v.from).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} → {new Date(v.to).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                      <td style={td}>{v.startMiles.toLocaleString("en-GB")} → {v.endMiles.toLocaleString("en-GB")}</td>
                      <td style={tdR}>{Math.round(v.clock)} mi</td>
                      <td style={tdR}>{v.expected ? Math.round(v.expected) + " mi" : "—"}</td>
                      <td style={tdR}><Var v={v.vRuns} tol={s.tolerancePct} /></td>
                      <td style={tdR}>{gbp(v.fuelSpent)}{v.litres ? <div style={{ fontSize: 11, color: "#8593a8" }}>≈{Math.round(v.litres)} L</div> : null}</td>
                      <td style={tdR} title={v.price.published ? "Supermarket average, " + v.price.day : "No published price — set rate"}>{(v.price.perLitre * 100).toFixed(1)}p{!v.price.published && <div style={{ fontSize: 11, color: "#8593a8" }}>set rate</div>}</td>
                      <td style={tdR}>{v.fuelMiles ? Math.round(v.fuelMiles) + " mi" : "—"}</td>
                      <td style={tdR}><Var v={v.vFuel} tol={s.tolerancePct} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showSettings && <RatesModal s={s} onClose={() => setShowSettings(false)} onSave={(v) => { updateCrm((c) => { c.fleetCosts = v; return c; }); setShowSettings(false); }} />}
    </div>
  );
}

const td = { padding: "8px 10px", verticalAlign: "top" };
const tdR = { ...td, textAlign: "right", whiteSpace: "nowrap" };
const Var = ({ v, tol }) => (v == null ? <span style={{ color: "#aab3c2" }}>—</span>
  : <b style={{ color: Math.abs(v) * 100 > tol ? RED : "#28713e" }}>{(v > 0 ? "+" : "") + Math.round(v * 100)}%</b>);

function StopRow({ x, n, away, openInvoice, openCollection }) {
  const [photo, setPhoto] = useState("");
  const c = x.conf;
  const left = dropLeft(c);
  const pay = c.payment && Number(c.payment.owed) > 0 ? c.payment : null;
  return (
    <tr style={{ borderTop: "1px solid #f0f2f6", background: x.awayMi != null && x.awayMi > away ? "#fdf3f4" : "transparent" }}>
      <td style={{ ...td, color: "#8593a8", fontWeight: 700 }}>{n}</td>
      <td style={td}>
        <button className="dk-title-link" onClick={() => (x.kind === "col" ? openCollection(x.id) : openInvoice(x.id))} style={{ fontWeight: 700, color: x.kind === "col" ? "#185FA5" : NAVY, textAlign: "left" }}>{x.name}</button>
        <span style={{ fontSize: 11.5, color: "#8593a8", marginLeft: 5 }}>{x.ref}</span>
      </td>
      <td style={td}>{x.postcode || "—"}</td>
      <td style={td}>
        {hm(c.at)}
        {x.awayMi != null && x.awayMi > away && <div style={{ fontSize: 11.5, fontWeight: 800, color: RED }}>{x.awayMi.toFixed(1)} mi from the address</div>}
        {x.noGeo && <div style={{ fontSize: 11.5, fontWeight: 700, color: "#a05f10" }}>no location — postcode used</div>}
      </td>
      <td style={tdR}>{mi(x.leg.miles)}</td>
      <td style={tdR}>{dur(x.leg.minutes)}</td>
      <td style={tdR}>{gbp(x.leg.cost)}</td>
      <td style={{ ...tdR, fontWeight: 800 }}>{x.kind === "inv" ? gbp(x.jobCost) : <span style={{ fontWeight: 600, fontSize: 11.5, color: "#8593a8" }}>charged to {x.forJobs && x.forJobs.length ? "the jobs it's for" : "the run"}</span>}</td>
      <td style={{ ...td, fontSize: 12 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {left.length ? <Chip tone="red" title={left.map((l) => l.remaining + "× " + l.text + " left").join("\n")}>{left.length} line{left.length === 1 ? "" : "s"} short</Chip> : <Chip tone="green">{x.kind === "col" ? "All collected" : "All delivered"}</Chip>}
          {pay && <Chip tone={pay.collected ? "green" : "red"}>{pay.collected ? "Paid " + (pay.method || "") : "Not paid"} {gbp(Number(pay.owed))}</Chip>}
          {c.notes && <Chip tone="gold" title={c.notes}>Note</Chip>}
          {c.followupInvNo && <Chip title="Follow-up job raised">Follow-up #{c.followupInvNo}</Chip>}
          <button onClick={() => (photo ? window.open(photo, "_blank") : dropPhotoUrl(c.photoPath).then((u) => { setPhoto(u); window.open(u, "_blank"); }).catch(() => {}))} title="The driver's photo"
            style={{ border: "1px solid #d5d9e0", background: "#fff", borderRadius: 999, padding: "1px 7px", cursor: "pointer", fontSize: 11 }}>📷</button>
        </div>
        {c.notes && <div style={{ color: "#6b5305", marginTop: 3, maxWidth: 260 }}>{c.notes}</div>}
      </td>
    </tr>
  );
}

function RatesModal({ s, onClose, onSave }) {
  const [v, setV] = useState({ ...s });
  const f = (k, label, unit) => (
    <div>
      <span style={lbl}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input style={inp} inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: k === "yard" ? e.target.value.toUpperCase() : e.target.value.replace(/[^\d.]/g, "") })} />
        {unit && <span style={{ fontSize: 12.5, color: "#8593a8", fontWeight: 700, whiteSpace: "nowrap" }}>{unit}</span>}
      </div>
    </div>
  );
  return (
    <Modal title="Driver tracking rates" onClose={onClose} width={560}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {f("dieselPerLitre", "Diesel price when none is published", "£ / litre")}
        {f("hourly", "Driver rate", "£ / hour")}
        {f("mpg", "Vans", "mpg")}
        {f("sprinterMpg", "Sprinter", "mpg")}
        {f("yard", "Yard postcode")}
        {f("avgMph", "Drive back to the yard", "mph average")}
        {f("roadFactor", "Road miles per straight-line mile", "×")}
        {f("awayMiles", "Flag a drop confirmed further than", "miles away")}
        {f("tolerancePct", "Flag mileage / fuel outside", "%")}
        <div style={{ gridColumn: "1 / -1" }}>
          <span style={lbl}>Pop-up alerts go to (login email — desktop only)</span>
          <input style={inp} value={v.alertsTo || ""} onChange={(e) => setV({ ...v, alertsTo: e.target.value.trim().toLowerCase() })} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button style={btn} onClick={() => setV({ ...FLEET_DEFAULTS })}>Reset to defaults</button>
        <span style={{ flex: 1 }} />
        <button style={btn} onClick={onClose}>Cancel</button>
        <button style={{ ...goldBtn, color: NAVY }} onClick={() => onSave(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "yard" || k === "alertsTo" ? x : Number(x) || FLEET_DEFAULTS[k]])))}>Save</button>
      </div>
    </Modal>
  );
}
