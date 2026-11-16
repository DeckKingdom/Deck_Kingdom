// Home dashboard: what delivery really costs. Prices every van run in the
// chosen period the same way as the schedule's run chips — road miles + drive
// time from Google (cached per leg), £15/hr driver, 30 mpg at £1.90/litre,
// 30 minutes per drop — and sets it against the delivery fees charged, so the
// card shows how much the product is subsidising the vans. Deliberately lazy:
// pricing starts a couple of seconds after the dashboard paints and runs one
// run at a time; the first look at a long period takes a while (every leg is
// a one-off lookup), then it's all cached and instant.
import { useState, useEffect, useMemo, useRef } from "react";
import { today, gbp } from "../lib/crmCore.js";
import { addDays } from "../lib/core.js";
import { roadLegsAddr, addrKey } from "../data/fleetApi.js";
import { runGroups, runLegList, priceRun, DRIVER_HR, MILE_COST, UNLOAD_MIN, FREE_LEAK_LIMIT } from "../lib/runCost.js";

const NAVY = "#0B1F3F", RED = "#C94F4F", GREEN = "#28713e";
const BLUE = "#2E7CD6", ORANGE = "#E8833A";

// date helpers for the chart buckets (UTC-safe, ISO in and out)
const shiftDay = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekStart = (iso) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const fmtDay = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const fmtMonth = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
const fmtMoney = (v) => "£" + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v).toLocaleString("en-GB"));

// Fees vs run cost across the period, drawn like an analytics chart: two
// lines, light grid, hover crosshair with the figures. The gap between the
// lines IS the subsidy.
function PLTrend({ byDate, from, to }) {
  const [hov, setHov] = useState(null);
  const buckets = useMemo(() => {
    const dates = Object.keys(byDate).sort();
    if (!dates.length) return [];
    const start = from || dates[0];
    const span = Math.round((new Date(to + "T12:00:00Z") - new Date(start + "T12:00:00Z")) / 86400000);
    const mode = span <= 95 ? "day" : span <= 430 ? "week" : "month";
    const keyOf = (iso) => (mode === "day" ? iso : mode === "week" ? weekStart(iso) : iso.slice(0, 7) + "-01");
    const next = (iso) => (mode === "day" ? shiftDay(iso, 1) : mode === "week" ? shiftDay(iso, 7) : (iso.slice(0, 7) === "9999-12" ? "" : new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 1, 12)).toISOString().slice(0, 8) + "01"));
    const sums = {};
    dates.forEach((d) => { const k = keyOf(d); const t = sums[k] || (sums[k] = { f: 0, c: 0, d: 0 }); t.f += byDate[d].f; t.c += byDate[d].c; t.d += byDate[d].d || 0; });
    const out = [];
    for (let k = keyOf(start), guard = 0; k && k <= to && guard < 600; k = next(k), guard += 1) {
      const t = sums[k] || { f: 0, c: 0, d: 0 };
      out.push({ k, label: mode === "month" ? fmtMonth(k) : fmtDay(k), f: t.f, c: t.c, u: t.d > 0 ? Math.max(0, (t.c - t.f) / t.d) : 0 });
    }
    return out;
  }, [byDate, from, to]);
  if (buckets.length < 2) return null;
  const W = 700, H = 170, L = 46, R = 44, T = 12, B = 22;
  const max = Math.max(1, ...buckets.flatMap((b) => [b.f, b.c])) * 1.1;
  const maxU = Math.max(1, ...buckets.map((b) => b.u)) * 1.1;
  const x = (i) => L + (i / (buckets.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const yU = (v) => T + (1 - v / maxU) * (H - T - B);
  const path = (key) => buckets.map((b, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + (key === "u" ? yU(b.u) : y(b[key])).toFixed(1)).join(" ");
  const ticks = [max / 1.1, max / 2.2, 0];
  const nLab = Math.min(6, buckets.length);
  const labIdx = Array.from({ length: nLab }, (_, i) => Math.round((i / (nLab - 1)) * (buckets.length - 1)));
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left - (L / W) * r.width) / ((1 - (L + R) / W) * r.width)));
    setHov(Math.round(frac * (buckets.length - 1)));
  };
  const hb = hov !== null ? buckets[hov] : null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#5a6a85" }}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: BLUE, marginRight: 5 }} />Fees (ex VAT)</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#5a6a85" }}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: ORANGE, marginRight: 5 }} />Run cost</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#5a6a85" }}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: RED, marginRight: 5 }} />Add per drop to break even <span style={{ color: "#aab3c2" }}>(right axis)</span></span>
      </div>
      <div style={{ position: "relative" }}>
        <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto", display: "block" }} onMouseMove={onMove} onMouseLeave={() => setHov(null)}>
          {ticks.map((tv, i) => (
            <g key={i}>
              <line x1={L} x2={W - R} y1={y(tv)} y2={y(tv)} stroke="#eef0f4" strokeWidth="1" />
              <text x={L - 6} y={y(tv) + 3.5} textAnchor="end" fontSize="10" fill="#8593a8" fontFamily="inherit">{fmtMoney(tv)}</text>
              <text x={W - R + 6} y={y(tv) + 3.5} textAnchor="start" fontSize="10" fill={RED} fontFamily="inherit">{"£" + (maxU * (1 - (y(tv) - T) / (H - T - B))).toFixed(0)}</text>
            </g>
          ))}
          {labIdx.map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#8593a8" fontFamily="inherit">{buckets[i].label}</text>
          ))}
          {hb && <line x1={x(hov)} x2={x(hov)} y1={T} y2={H - B} stroke="#d5d9e0" strokeWidth="1" />}
          <path d={path("u")} fill="none" stroke={RED} strokeWidth="1.5" strokeDasharray="5 4" strokeLinejoin="round" />
          <path d={path("c")} fill="none" stroke={ORANGE} strokeWidth="2" strokeLinejoin="round" />
          <path d={path("f")} fill="none" stroke={BLUE} strokeWidth="2" strokeLinejoin="round" />
          {hb && (
            <g>
              <circle cx={x(hov)} cy={y(hb.c)} r="3.5" fill={ORANGE} stroke="#fff" strokeWidth="1.5" />
              <circle cx={x(hov)} cy={y(hb.f)} r="3.5" fill={BLUE} stroke="#fff" strokeWidth="1.5" />
              <circle cx={x(hov)} cy={yU(hb.u)} r="3" fill={RED} stroke="#fff" strokeWidth="1.5" />
            </g>
          )}
        </svg>
        {hb && (
          <div style={{ position: "absolute", top: 4, left: (x(hov) / W) * 100 + "%", transform: "translateX(" + (hov > buckets.length / 2 ? "calc(-100% - 10px)" : "10px") + ")", background: "#fff", border: "1px solid #e6e9ef", borderRadius: 10, boxShadow: "0 8px 24px rgba(11,31,63,.12)", padding: "8px 11px", pointerEvents: "none", whiteSpace: "nowrap", zIndex: 5 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: NAVY, marginBottom: 3 }}>{hb.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#5a6a85" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: BLUE, marginRight: 5 }} />Fees {gbp(hb.f)}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#5a6a85" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: ORANGE, marginRight: 5 }} />Run cost {gbp(hb.c)}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#5a6a85" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: RED, marginRight: 5 }} />Add per drop £{hb.u.toFixed(2)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
const PERIODS = [["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["year", "This year"], ["all", "All time"]];

export default function DeliveryPLCard({ crm, card, sect, onLeak }) {
  const [period, setPeriod] = useState("30");
  const [agg, setAgg] = useState(null);
  const grouped = useMemo(() => {
    if (!crm) return { runs: [], skipped: 0, from: "", to: today() };
    const to = today();
    const from = period === "all" ? "" : period === "year" ? to.slice(0, 4) + "-01-01" : addDays(to, -Number(period));
    const g = runGroups(crm, from, to);
    return { ...g, from, to };
  }, [crm, period]);

  useEffect(() => {
    let live = true;
    setAgg({ done: 0, total: grouped.runs.length, priced: 0, mi: 0, cost: 0, driver: 0, drops: 0, feeDrops: 0, freeDrops: 0, smallFree: 0, fees: 0, feesNet: 0, noRoute: 0, byDate: {} });
    if (!grouped.runs.length) return undefined;
    const t = setTimeout(async () => {
      const a = { done: 0, total: grouped.runs.length, priced: 0, mi: 0, cost: 0, driver: 0, drops: 0, feeDrops: 0, freeDrops: 0, smallFree: 0, fees: 0, feesNet: 0, noRoute: 0, byDate: {} };
      for (const r of grouped.runs) {
        if (!live) return;
        const legs = runLegList(r.pcs);
        const got = await roadLegsAddr(legs).catch(() => ({}));
        if (!live) return;
        let mi = 0, min = 0, ok = true;
        legs.forEach((l) => { const g = got[addrKey(l.from, l.to)]; if (g) { mi += Number(g.miles) || 0; min += Number(g.minutes) || 0; } else ok = false; });
        if (ok && mi > 0) {
          const { cost, totMin } = priceRun(mi, min, r.drops);
          a.priced += 1; a.mi += mi; a.cost += cost; a.driver += (totMin / 60) * DRIVER_HR; a.drops += r.drops; a.feeDrops += r.feeDrops; a.freeDrops += r.freeDrops; a.smallFree += r.smallFree; a.fees += r.fees; a.feesNet += r.feesNet;
          const b = a.byDate[r.date] || (a.byDate[r.date] = { f: 0, c: 0, d: 0 });
          b.f += r.feesNet; b.c += cost; b.d += r.drops;
        } else a.noRoute += 1;
        a.done += 1;
        if (a.done % 4 === 0 || a.done === a.total) setAgg({ ...a });
      }
    }, 2000); // well after the dashboard has painted
    return () => { live = false; clearTimeout(t); };
  }, [grouped]);

  const a = agg || { done: 0, total: 0, priced: 0, mi: 0, cost: 0, driver: 0, drops: 0, feeDrops: 0, freeDrops: 0, smallFree: 0, fees: 0, feesNet: 0, noRoute: 0, byDate: {} };
  const pl = a.feesNet - a.cost;
  const busy = a.done < a.total;
  const missing = grouped.skipped + a.noRoute;
  return (
    <div style={{ ...card, marginBottom: 0, height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <p style={{ ...sect, margin: 0 }}>Delivery P/L</p>
        <span style={{ flex: 1 }} />
        {PERIODS.map(([k, label]) => (
          <button key={k} onClick={() => setPeriod(k)}
            style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, cursor: "pointer",
              border: "1px solid " + (period === k ? NAVY : "#d5d9e0"), background: period === k ? NAVY : "#fff", color: period === k ? "#fff" : "#5a6a85" }}>
            {label}
          </button>
        ))}
      </div>
      {a.priced === 0 && !busy ? (
        <div style={{ color: "#8593a8", fontWeight: 600, fontSize: 13, padding: "6px 0" }}>
          No priceable runs in this period{missing ? " (" + missing + " without postcodes or routes)" : ""}.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <b style={{ fontSize: 26, color: pl >= 0 ? GREEN : RED }}>{pl >= 0 ? "+" : "−"}£{Math.abs(pl).toLocaleString("en-GB", { maximumFractionDigits: 0 })}</b>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#8593a8" }}>
              {pl >= 0 ? "delivery fees cover the vans" : "subsidised by the product"}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#5a6a85", marginTop: 8, display: "grid", gap: 3 }}>
            <span>Fees charged: <b style={{ color: NAVY }}>{gbp(a.fees)}</b> <span style={{ color: "#8593a8" }}>({gbp(a.feesNet)} ex VAT)</span></span>
            <span>Estimated run cost: <b style={{ color: NAVY }}>{gbp(a.cost)}</b> <span style={{ color: "#8593a8" }}>(driver {gbp(a.driver)} · fuel {gbp(a.mi * MILE_COST)})</span> · {a.priced} run{a.priced === 1 ? "" : "s"} · {Math.round(a.mi).toLocaleString("en-GB")} mi</span>
            <span>{a.drops.toLocaleString("en-GB")} drop{a.drops === 1 ? "" : "s"}: <b style={{ color: NAVY }}>{a.feeDrops.toLocaleString("en-GB")}</b> with a delivery fee · <b style={{ color: NAVY }}>{a.freeDrops.toLocaleString("en-GB")}</b> without{a.smallFree > 0 ? <span> — <button onClick={() => onLeak && onLeak(grouped.from, grouped.to)} title="See exactly which jobs these were"
                  style={{ fontFamily: "inherit", border: "none", background: "none", padding: 0, cursor: "pointer", color: RED, fontWeight: 800, fontSize: 13, textDecoration: "underline" }}>
                  {a.smallFree.toLocaleString("en-GB")}
                </button> of those under £{FREE_LEAK_LIMIT.toLocaleString("en-GB")} order value</span> : null}</span>
            {pl < 0 && a.drops > 0 && (
              <span>Break even: add <b style={{ color: RED }}>£{(Math.abs(pl) / a.drops).toFixed(2)}</b> to every drop{a.feeDrops > 0 && a.feeDrops < a.drops ? <span style={{ color: "#8593a8" }}> — or £{(Math.abs(pl) / a.feeDrops).toFixed(2)} on just the fee-paying ones</span> : null}</span>
            )}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#aab3c2", marginTop: 8 }}>
            £{DRIVER_HR}/hr driver · 30 mpg @ £1.90/l · {UNLOAD_MIN}m per drop · out and back from OL6
            {missing ? " · " + missing + " run" + (missing === 1 ? "" : "s") + " unpriceable" : ""}
          </div>
        </>
      )}
      {a.priced > 0 && <PLTrend byDate={a.byDate} from={grouped.from} to={grouped.to} />}
      {busy && (
        <div style={{ fontSize: 12, fontWeight: 700, color: "#a05f10", marginTop: 8 }}>
          Pricing runs… {a.done} of {a.total}{period === "all" || period === "year" ? " — first time through old runs takes a while, then it's cached" : ""}
        </div>
      )}
    </div>
  );
}
