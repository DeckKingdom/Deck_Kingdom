// Business snapshot: where the money goes. Admin only, behind the Financials
// unlock like every other money screen. Sales from invoices, spend from the
// purchase ledger grouped by cost centre (075), wages from the admin-only
// wages table, due & upcoming from unpaid purchases + container balances.
import { useEffect, useMemo, useState } from "react";
import { NAVY, GOLD, addMonths, addDays, prettyDate, linePieces } from "../lib/core.js";
import { invoiceTotals, isVoidInvoice, purchaseTotals, purchaseIsPaid, gbp, supplierById, today } from "../lib/crmCore.js";
import { COST_CENTRE_LIST, isOverhead, assignCostCentre } from "../lib/costCentres.js";
import { sect, card, ListHero, HeroStat } from "./crm/ui.jsx";
import { fetchWageMonths } from "./crm/WagesScreen.jsx";
import CommitmentsCard, { monthlyEq } from "./crm/CommitmentsCard.jsx";

const GREEN = "#2e7d4f";
const th = { fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap", textAlign: "right" };
const tdc = { padding: "8px 8px", borderBottom: "1px solid #f0f2f6", textAlign: "right", whiteSpace: "nowrap" };
const left = { textAlign: "left" };
const USD_GBP = 1.27; // planning rate for container balances still to pay

export default function BusinessScreen({ crm, data, setTab }) {
  const [wages, setWages] = useState(null); // { 'YYYY-MM': employer cost } | null while loading
  const [commits, setCommits] = useState([]); // the DD/SO register, loaded by its card
  useEffect(() => { fetchWageMonths().then((m) => setWages(m || {})); }, []);

  const tod = today();
  const monthKey = tod.slice(0, 7);
  const months = useMemo(() => { // this month first, 12 back
    const out = [];
    for (let i = 0; i < 12; i++) out.push(addMonths(tod.slice(0, 8) + "01", -i).slice(0, 7));
    return out;
  }, [tod]);

  // ===== sales by month (same rules as Home: voids out, inc VAT) =====
  const invs = (crm.invoices || []).filter((i) => !isVoidInvoice(i));
  const salesBy = useMemo(() => {
    const m = {};
    invs.forEach((i) => { const k = (i.date || "").slice(0, 7); if (k) m[k] = (m[k] || 0) + invoiceTotals(i).total; });
    return m;
  }, [crm]);

  // ===== spend by cost centre and month (backfilled rows carry their centre; stragglers get the rules) =====
  const supMap = useMemo(() => supplierById(crm), [crm]); // id -> supplier
  const supOf = (p) => { const s = supMap[p.supplierId]; return s ? s.name : ""; };
  const ccOf = (p) => p.costCentre || assignCostCentre(supOf(p), p.invDetail, p.category).costCentre;
  const spend = useMemo(() => {
    const by = {}; // centre -> month -> £
    (crm.purchases || []).forEach((p) => {
      const k = (p.invDate || (p.createdAt || "").slice(0, 10)).slice(0, 7);
      if (!k) return;
      const cc = ccOf(p);
      (by[cc] = by[cc] || {})[k] = (by[cc][k] || 0) + purchaseTotals(p).total;
    });
    return by;
  }, [crm]);
  const wageIn = (k) => (wages ? wages[k] || 0 : 0);
  const centres = COST_CENTRE_LIST.filter((c) => spend[c]);
  const spendIn = (k) => centres.reduce((t, c) => t + ((spend[c] || {})[k] || 0), 0) + wageIn(k);
  const overheadIn = (k) => centres.filter(isOverhead).reduce((t, c) => t + ((spend[c] || {})[k] || 0), 0) + wageIn(k);
  const avg12 = (fn) => months.slice(1).reduce((t, k) => t + fn(k), 0) / Math.max(1, months.length - 1);

  // ===== due & upcoming =====
  const unpaid = (crm.purchases || []).filter((p) => !purchaseIsPaid(p));
  const unpaidTotal = unpaid.reduce((t, p) => t + purchaseTotals(p).total, 0);
  const bigUnpaid = [...unpaid].sort((a, z) => purchaseTotals(z).total - purchaseTotals(a).total).slice(0, 8);
  const containers = useMemo(() => {
    const out = [];
    ((data && data.shipments) || []).forEach((s) => {
      if (s.balancePaidDate || s.status === "Paid") return;
      // value: the header field when filled, else priced up from the lines
      const val = Number(s.valueUsd) || (s.lines || []).reduce((t, l) => t + linePieces(l) * (Number(l.cost) || 0), 0);
      if (!val) return;
      const owedUsd = Math.max(0, val - (Number(s.depositUsd) || 0) - (Number(s.balanceUsd) || 0));
      if (owedUsd <= 0) return;
      const land = s.arrivedDate || s.etaDate || "";
      out.push({ name: s.name, land, due: land ? addDays(land, 30) : "", gbp: owedUsd / USD_GBP, usd: owedUsd });
    });
    return out.sort((a, z) => (a.due || "9999") < (z.due || "9999") ? -1 : 1).slice(0, 10);
  }, [data]);
  const containerTotal = containers.reduce((t, c) => t + c.gbp, 0);

  const mLabel = (k) => new Date(k + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  const salesMonth = salesBy[monthKey] || 0;
  const overheadMonth = overheadIn(monthKey);
  const fixedAvg = avg12(overheadIn);

  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 4px" }}>
      <ListHero title="Business snapshot" sub={"Where the money goes — ledger grouped by cost centre, wages folded in, commitments ahead. Admin only."}
        action={wages === null ? <span style={{ fontSize: 12, color: "#aeb9cf", fontWeight: 700 }}>loading wages…</span> : null}>
        <HeroStat label={"Sales " + mLabel(monthKey)} value={gbp(salesMonth)} sub="inc VAT" />
        <HeroStat label={"Overheads " + mLabel(monthKey)} value={gbp(overheadMonth)} sub="everything but stock, wages in" />
        <HeroStat label="Fixed costs · 12-mo avg" value={gbp(fixedAvg) + "/mo"} sub="overheads + wages, the break-even line" />
        {commits.some((c) => c.active !== false) && (
          <HeroStat label="Committed · DD/SO" value={gbp(commits.filter((c) => c.active !== false).reduce((t, c) => t + monthlyEq(c), 0)) + "/mo"}
            sub={commits.filter((c) => c.active !== false).length + " agreements in the register below"} />
        )}
        <HeroStat label="Ledger unpaid" value={gbp(unpaidTotal)} sub={unpaid.length + " invoices"} tone={unpaidTotal > 0 ? "#ffd27a" : GOLD} />
        <HeroStat label="Container balances" value={gbp(containerTotal)} sub={containers.length + " shipments, est at $" + USD_GBP + "/£"} />
      </ListHero>

      {/* ===== the year in two pictures ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 14, marginBottom: 14 }}>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <p style={{ ...sect, margin: 0 }}>Money in vs out — 12 months</p>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: GREEN }}>■ sales</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>■ spend + wages</span>
          </div>
          {(() => {
            const seq = [...months].reverse(); // oldest first, this month at the right
            const vals = seq.map((k) => ({ k, i: salesBy[k] || 0, o: spendIn(k) }));
            const max = Math.max(1, ...vals.flatMap((v) => [v.i, v.o]));
            const W = 960, H = 170, bw = W / vals.length;
            return (
              <svg viewBox={"0 0 " + W + " " + (H + 24)} style={{ width: "100%", height: "auto", marginTop: 6 }}>
                {vals.map((v, i) => {
                  const x = i * bw, hi = (v.i / max) * H, ho = (v.o / max) * H;
                  return (
                    <g key={v.k}>
                      <rect x={x + 5} y={H - hi} width={bw / 2 - 7} height={Math.max(1.5, hi)} fill={GREEN} rx="2"><title>{mLabel(v.k) + " sales " + gbp(v.i)}</title></rect>
                      <rect x={x + bw / 2} y={H - ho} width={bw / 2 - 7} height={Math.max(1.5, ho)} fill={NAVY} rx="2"><title>{mLabel(v.k) + " out " + gbp(v.o)}</title></rect>
                      <text x={x + bw / 2} y={H + 15} fontSize="10.5" textAnchor="middle" fill="#8593a8" fontWeight="700">{mLabel(v.k).split(" ")[0]}</text>
                    </g>
                  );
                })}
              </svg>
            );
          })()}
        </div>
        <div style={{ ...card, marginBottom: 0 }}>
          <p style={sect}>Where it goes — monthly average</p>
          {(() => {
            const rows2 = centres.map((c) => ({ c, v: avg12((k) => (spend[c] || {})[k] || 0) }));
            if (wages && avg12(wageIn) > 0) rows2.push({ c: "Wages (payroll)", v: avg12(wageIn) });
            rows2.sort((a, z) => z.v - a.v);
            const max = Math.max(1, ...rows2.map((r) => r.v));
            return rows2.map((r) => (
              <div key={r.c} style={{ display: "grid", gridTemplateColumns: "150px 1fr 76px", gap: 8, alignItems: "center", margin: "6px 0" }}>
                <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.c}</span>
                <div style={{ background: "#eef1f6", borderRadius: 6, height: 14 }}>
                  <div style={{ width: Math.max(1.5, (r.v / max) * 100) + "%", height: "100%", borderRadius: 6, background: r.c === "Stock" ? GOLD : r.c === "Wages (payroll)" ? GREEN : NAVY }} />
                </div>
                <b style={{ fontSize: 12, textAlign: "right" }}>{gbp(r.v)}</b>
              </div>
            ));
          })()}
          <p style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, margin: "8px 2px 0" }}>Average of the last 12 months. Gold = stock, green = payroll, navy = overheads.</p>
        </div>
      </div>

      {/* ===== by cost centre, month by month ===== */}
      <div style={card}>
        <p style={sect}>Spend by cost centre — last 12 months</p>
        <div className="dk-bleed" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 980 }}>
            <thead><tr>
              <th style={{ ...th, ...left }}>Centre</th>
              {months.map((k) => <th key={k} style={th}>{mLabel(k)}</th>)}
              <th style={th}>12-mo avg</th>
            </tr></thead>
            <tbody>
              {centres.map((c) => (
                <tr key={c}>
                  <td style={{ ...tdc, ...left, fontWeight: 700 }}>{c}</td>
                  {months.map((k) => { const v = (spend[c] || {})[k] || 0; return <td key={k} style={{ ...tdc, color: v ? NAVY : "#c4ccd8" }}>{v ? gbp(v) : "—"}</td>; })}
                  <td style={{ ...tdc, fontWeight: 700 }}>{gbp(avg12((k) => (spend[c] || {})[k] || 0))}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...tdc, ...left, fontWeight: 700 }}>Wages <span style={{ color: "#8593a8", fontWeight: 600 }}>(payroll)</span></td>
                {months.map((k) => { const v = wageIn(k); return <td key={k} style={{ ...tdc, color: v ? NAVY : "#c4ccd8" }}>{v ? gbp(v) : "—"}</td>; })}
                <td style={{ ...tdc, fontWeight: 700 }}>{gbp(avg12(wageIn))}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr style={{ background: "#f6f8fb" }}>
                <td style={{ ...tdc, ...left, fontWeight: 800 }}>Total out</td>
                {months.map((k) => <td key={k} style={{ ...tdc, fontWeight: 700 }}>{gbp(spendIn(k))}</td>)}
                <td style={{ ...tdc, fontWeight: 800 }}>{gbp(avg12(spendIn))}</td>
              </tr>
              <tr>
                <td style={{ ...tdc, ...left, fontWeight: 800 }}>Sales in</td>
                {months.map((k) => <td key={k} style={{ ...tdc, fontWeight: 700, color: "#1e5e33" }}>{gbp(salesBy[k] || 0)}</td>)}
                <td style={{ ...tdc, fontWeight: 800, color: "#1e5e33" }}>{gbp(avg12((k) => salesBy[k] || 0))}</td>
              </tr>
              <tr>
                <td style={{ ...tdc, ...left, fontWeight: 800 }}>Net</td>
                {months.map((k) => { const n = (salesBy[k] || 0) - spendIn(k); return <td key={k} style={{ ...tdc, fontWeight: 800, color: n >= 0 ? "#1e5e33" : "#8a0b20" }}>{gbp(n)}</td>; })}
                <td style={{ ...tdc, fontWeight: 800 }}>{gbp(avg12((k) => (salesBy[k] || 0) - spendIn(k)))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, margin: "8px 2px 0" }}>
          Months run on invoice date, inc VAT both ways. Stock is the goods themselves; the fixed-cost line is everything else plus wages.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>
        {/* ===== due now ===== */}
        <div style={{ ...card, marginBottom: 0 }}>
          <p style={sect}>Due — unpaid on the ledger</p>
          {bigUnpaid.length === 0 ? <div style={{ color: "#5a6a85", fontWeight: 600 }}>Nothing unpaid. </div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {bigUnpaid.map((p) => {
                  const s = supMap[p.supplierId];
                  return (
                    <tr key={p.id} style={{ cursor: setTab ? "pointer" : "default" }} onClick={() => setTab && setTab("purchases")}>
                      <td style={{ ...tdc, ...left, fontWeight: 700 }}>{(s && s.name) || "—"}<span style={{ display: "block", fontSize: 11.5, color: "#8593a8", fontWeight: 600 }}>{ccOf(p)}{p.invDate ? " · " + prettyDate(p.invDate) : ""}</span></td>
                      <td style={{ ...tdc, fontWeight: 700 }}>{gbp(purchaseTotals(p).total)}</td>
                    </tr>
                  );
                })}
                {unpaid.length > bigUnpaid.length && (
                  <tr><td style={{ ...tdc, ...left, color: "#8593a8", fontWeight: 600 }}>+ {unpaid.length - bigUnpaid.length} more</td>
                    <td style={{ ...tdc, fontWeight: 700 }}>{gbp(unpaidTotal - bigUnpaid.reduce((t, p) => t + purchaseTotals(p).total, 0))}</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ===== coming up ===== */}
        <div style={{ ...card, marginBottom: 0 }}>
          <p style={sect}>Coming up — container balances</p>
          {containers.length === 0 ? <div style={{ color: "#5a6a85", fontWeight: 600 }}>No unpaid container balances on the planner.</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {containers.map((c) => (
                  <tr key={c.name} style={{ cursor: setTab ? "pointer" : "default" }} onClick={() => setTab && setTab("overview")}>
                    <td style={{ ...tdc, ...left, fontWeight: 700 }}>{c.name}<span style={{ display: "block", fontSize: 11.5, color: "#8593a8", fontWeight: 600 }}>
                      {c.land ? "lands " + prettyDate(c.land) + " · balance due " + prettyDate(c.due) : "no landing date yet"}</span></td>
                    <td style={{ ...tdc, fontWeight: 700 }}>{gbp(c.gbp)}<span style={{ display: "block", fontSize: 11, color: "#8593a8", fontWeight: 600 }}>${Math.round(c.usd).toLocaleString()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, margin: "8px 2px 0" }}>Balances assume the $15k deposit pattern — exact once deposits are logged per shipment. Estimated in £ at ${USD_GBP}/£.</p>
        </div>
      </div>

      <CommitmentsCard onLoaded={setCommits} />
      <SpotlessCard crm={crm} />
    </div>
  );
}

// ===== the Spotless Water deal: they rent car-park space (£300+VAT/mo) and
// their dispenser feeds off our water and electric; sub-meters are read and
// recharged monthly. This card answers two questions: are the recharges
// covering the Water Plus bill (or are we subsidising their water), and is
// the rent genuine profit on top — month by month and over the whole deal.
export function SpotlessCard({ crm }) {
  const cust = (crm.customers || []).find((c) => /spotless/i.test(c.name || ""));
  if (!cust) return null;
  const by = {}; // month -> { rent, water, elec, other, bill (Water Plus), ebill (gas/electric) }
  const bump = (k, f, v) => { (by[k] = by[k] || { rent: 0, water: 0, elec: 0, other: 0, bill: 0, ebill: 0 })[f] += v; };
  (crm.invoices || []).forEach((i) => {
    if (i.customerId !== cust.id || isVoidInvoice(i)) return;
    const k = (i.date || "").slice(0, 7); if (!k) return;
    (i.lines || []).forEach((l) => {
      const d = String(l.description || ""), v = (Number(l.qty) || 0) * (Number(l.price) || 0);
      bump(k, /rent/i.test(d) ? "rent" : /water/i.test(d) ? "water" : /elec/i.test(d) ? "elec" : "other", v);
    });
  });
  const supMap2 = supplierById(crm);
  (crm.purchases || []).forEach((p) => {
    const s = supMap2[p.supplierId];
    const n = (s && s.name) || "";
    const k = (p.invDate || "").slice(0, 7); if (!k) return;
    if (/water ?plus/i.test(n)) bump(k, "bill", purchaseTotals(p).total);
    else if (/british gas|yu energy/i.test(n)) bump(k, "ebill", purchaseTotals(p).total);
  });
  const keys = Object.keys(by).sort().reverse();
  if (!keys.length) return null;
  const tot = { rent: 0, water: 0, elec: 0, other: 0, bill: 0, ebill: 0 };
  keys.forEach((k) => Object.keys(tot).forEach((f) => (tot[f] += by[k][f])));
  const net = (r) => r.rent + r.water + r.elec + r.other - r.bill;
  const gap = tot.bill - tot.water; // what we absorbed of the water bill: our own use + any subsidy
  return (
    <div style={{ ...card, marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <p style={{ ...sect, margin: 0 }}>Spotless Water — the car-park deal</p>
        <span style={{ fontSize: 12, fontWeight: 700, color: net(tot) >= 0 ? "#1e5e33" : "#8a0b20" }}>{net(tot) >= 0 ? "+" : ""}{gbp(net(tot))} over {keys.length} months</span>
      </div>
      <div className="dk-bleed" style={{ overflowX: "auto", marginTop: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 760 }}>
          <thead><tr>{["Month", "Rent in", "Water recharged", "Electric recharged", "Water Plus bill", "Water gap (ours)", "Gas/electric bill", "Net for us"].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>)}</tr></thead>
          <tbody>
            {keys.slice(0, 13).map((k) => {
              const r = by[k], g = r.bill - r.water, n = net(r);
              return (
                <tr key={k}>
                  <td style={{ ...tdc, textAlign: "left", fontWeight: 700 }}>{new Date(k + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}</td>
                  <td style={tdc}>{r.rent ? gbp(r.rent) : "—"}</td>
                  <td style={tdc}>{r.water ? gbp(r.water) : "—"}</td>
                  <td style={tdc}>{r.elec ? gbp(r.elec) : "—"}</td>
                  <td style={tdc}>{r.bill ? gbp(r.bill) : "—"}</td>
                  <td style={{ ...tdc, color: r.bill ? (g > 150 ? "#a05f10" : NAVY) : "#c4ccd8", fontWeight: 700 }}>{r.bill ? gbp(g) : "—"}</td>
                  <td style={{ ...tdc, color: r.ebill ? NAVY : "#c4ccd8" }}>{r.ebill ? gbp(r.ebill) : "—"}</td>
                  <td style={{ ...tdc, fontWeight: 800, color: n >= 0 ? "#1e5e33" : "#8a0b20" }}>{gbp(n)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr style={{ background: "#f6f8fb" }}>
            <td style={{ ...tdc, textAlign: "left", fontWeight: 800 }}>All time</td>
            <td style={{ ...tdc, fontWeight: 700 }}>{gbp(tot.rent)}</td>
            <td style={{ ...tdc, fontWeight: 700 }}>{gbp(tot.water)}</td>
            <td style={{ ...tdc, fontWeight: 700 }}>{gbp(tot.elec)}</td>
            <td style={{ ...tdc, fontWeight: 700 }}>{gbp(tot.bill)}</td>
            <td style={{ ...tdc, fontWeight: 700 }}>{gbp(gap)}</td>
            <td style={{ ...tdc, fontWeight: 700 }}>{gbp(tot.ebill)}</td>
            <td style={{ ...tdc, fontWeight: 800, color: net(tot) >= 0 ? "#1e5e33" : "#8a0b20" }}>{gbp(net(tot))}</td>
          </tr></tfoot>
        </table>
      </div>
      <p style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, margin: "8px 2px 0" }}>
        Water gap = Water Plus bill minus what Spotless was recharged — that's our own usage plus anything we're subsidising
        (recharges lag the bill by about a month, so judge the gap over a few months, not one). Net = everything they pay us minus the
        whole water bill; their electric recharge is pure contribution since the supply cost sits in our own bill anyway.
        The £1,064/mo Water Plus line in the register above is the gross bill — this card is the real cost of water to us.
      </p>
    </div>
  );
}
