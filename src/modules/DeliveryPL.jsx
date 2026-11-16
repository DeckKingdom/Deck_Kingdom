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
const PERIODS = [["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["year", "This year"], ["all", "All time"]];

export default function DeliveryPLCard({ crm, card, sect }) {
  const [period, setPeriod] = useState("30");
  const [agg, setAgg] = useState(null);
  const grouped = useMemo(() => {
    if (!crm) return { runs: [], skipped: 0 };
    const to = today();
    const from = period === "all" ? "" : period === "year" ? to.slice(0, 4) + "-01-01" : addDays(to, -Number(period));
    return runGroups(crm, from, to);
  }, [crm, period]);

  useEffect(() => {
    let live = true;
    setAgg({ done: 0, total: grouped.runs.length, priced: 0, mi: 0, cost: 0, driver: 0, drops: 0, feeDrops: 0, freeDrops: 0, smallFree: 0, fees: 0, feesNet: 0, noRoute: 0 });
    if (!grouped.runs.length) return undefined;
    const t = setTimeout(async () => {
      const a = { done: 0, total: grouped.runs.length, priced: 0, mi: 0, cost: 0, driver: 0, drops: 0, feeDrops: 0, freeDrops: 0, smallFree: 0, fees: 0, feesNet: 0, noRoute: 0 };
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
        } else a.noRoute += 1;
        a.done += 1;
        if (a.done % 4 === 0 || a.done === a.total) setAgg({ ...a });
      }
    }, 2000); // well after the dashboard has painted
    return () => { live = false; clearTimeout(t); };
  }, [grouped]);

  const a = agg || { done: 0, total: 0, priced: 0, mi: 0, cost: 0, driver: 0, drops: 0, feeDrops: 0, freeDrops: 0, smallFree: 0, fees: 0, feesNet: 0, noRoute: 0 };
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
            <span>{a.drops.toLocaleString("en-GB")} drop{a.drops === 1 ? "" : "s"}: <b style={{ color: NAVY }}>{a.feeDrops.toLocaleString("en-GB")}</b> with a delivery fee · <b style={{ color: NAVY }}>{a.freeDrops.toLocaleString("en-GB")}</b> without{a.smallFree > 0 ? <span> — <b style={{ color: RED }}>{a.smallFree.toLocaleString("en-GB")}</b> of those under £{FREE_LEAK_LIMIT.toLocaleString("en-GB")} order value</span> : null}</span>
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
      {a.priced > 0 && a.drops > 0 && (() => {
        const rows = [
          { label: "All drops", now: a.feesNet / a.drops, need: a.cost / a.drops },
          ...(a.feeDrops > 0 && a.feeDrops < a.drops ? [{ label: "Fee-paying only", now: a.feesNet / a.feeDrops, need: a.cost / a.feeDrops }] : []),
        ];
        const max = Math.max(...rows.flatMap((r) => [r.now, r.need])) * 1.15 || 1;
        return (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "#8593a8", letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 6 }}>Average fee per drop (ex VAT) — today vs break-even</div>
            {rows.map((r) => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ width: 104, flex: "none", fontSize: 12, fontWeight: 700, color: "#5a6a85" }}>{r.label}</span>
                <div style={{ flex: 1, position: "relative", height: 18, background: "#f1f3f7", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: (r.now / max) * 100 + "%", background: "#9db2cc", borderRadius: 6 }} />
                  <div title={"Break-even: £" + r.need.toFixed(2) + " per drop"}
                    style={{ position: "absolute", left: "calc(" + (r.need / max) * 100 + "% - 1.5px)", top: -2, bottom: -2, width: 3, background: r.need > r.now ? RED : GREEN, borderRadius: 2 }} />
                </div>
                <span style={{ width: 150, flex: "none", fontSize: 12, fontWeight: 700, color: "#5a6a85", textAlign: "right" }}>
                  £{r.now.toFixed(2)} → <b style={{ color: r.need > r.now ? RED : GREEN }}>£{r.need.toFixed(2)}</b>
                </span>
              </div>
            ))}
            <div style={{ fontSize: 11, fontWeight: 600, color: "#aab3c2" }}>Grey bar = what a drop brings in now · marker = what it needs to bring in to break even</div>
          </div>
        );
      })()}
      {busy && (
        <div style={{ fontSize: 12, fontWeight: 700, color: "#a05f10", marginTop: 8 }}>
          Pricing runs… {a.done} of {a.total}{period === "all" || period === "year" ? " — first time through old runs takes a while, then it's cached" : ""}
        </div>
      )}
    </div>
  );
}
