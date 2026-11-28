// Business snapshot: where the money goes. Admin only, behind the Financials
// unlock like every other money screen. Sales from invoices, spend from the
// purchase ledger grouped by cost centre (075), wages from the admin-only
// wages table, due & upcoming from unpaid purchases + container balances.
import { useEffect, useMemo, useState } from "react";
import { NAVY, GOLD, addMonths, addDays, prettyDate, linePieces } from "../lib/core.js";
import { invoiceTotals, isVoidInvoice, purchaseTotals, purchaseIsPaid, purchaseBalance, gbp, supplierById, today } from "../lib/crmCore.js";
import { COST_CENTRE_LIST, isOverhead, assignCostCentre } from "../lib/costCentres.js";
import { sect, card, ListHero, HeroStat } from "./crm/ui.jsx";
import { fetchWageMonths } from "./crm/WagesScreen.jsx";
import CommitmentsCard, { monthlyEq } from "./crm/CommitmentsCard.jsx";
import { fetchBankBalance, fetchBankSpend } from "./crm/BankScreen.jsx";

const GREEN = "#2e7d4f";
const th = { fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap", textAlign: "right" };
const tdc = { padding: "8px 8px", borderBottom: "1px solid #f0f2f6", textAlign: "right", whiteSpace: "nowrap" };
const left = { textAlign: "left" };
const USD_GBP = 1.27; // planning rate for container balances still to pay

export default function BusinessScreen({ crm, data, setTab }) {
  const [wages, setWages] = useState(null); // { 'YYYY-MM': employer cost } | null while loading
  const [commits, setCommits] = useState([]); // the DD/SO register, loaded by its card
  const [bank, setBank] = useState(null); // { date, balance } from the latest imported statement
  const [bankSpend, setBankSpend] = useState({}); // bank-only costs (VAT, Revolve …) by centre and month
  useEffect(() => {
    fetchWageMonths().then((m) => setWages(m || {}));
    fetchBankBalance().then(setBank);
    fetchBankSpend().then((m) => setBankSpend(m || {}));
  }, []);

  const [range, setRange] = useState("12m"); // 12m | ytd | ly | all
  const [focus, setFocus] = useState("all");  // all | overheads | a centre | wages
  const tod = today();
  const monthKey = tod.slice(0, 7);
  const back = (n) => addMonths(tod.slice(0, 8) + "01", -n).slice(0, 7);
  const months12 = useMemo(() => Array.from({ length: 12 }, (_, i) => back(i)), [tod]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // plus what only ever shows on the bank (VAT to HMRC, trade-finance repayments) — assigned on the Bank screen
    Object.entries(bankSpend || {}).forEach(([cc, months]) => Object.entries(months).forEach(([k, v]) => { (by[cc] = by[cc] || {})[k] = (by[cc][k] || 0) + v; }));
    return by;
  }, [crm, bankSpend]);
  // the earliest month anything was invoiced or bought — "all time" starts here
  const firstKey = useMemo(() => {
    const ks = [...Object.keys(salesBy), ...Object.values(spend).flatMap((m) => Object.keys(m))].filter((k) => /^\d{4}-\d{2}$/.test(k) && k >= "2022-01");
    return ks.length ? ks.sort()[0] : back(11);
  }, [salesBy, spend]); // eslint-disable-line react-hooks/exhaustive-deps
  const months = useMemo(() => { // newest first
    const yr = tod.slice(0, 4), out = [];
    const from = range === "ytd" ? yr + "-01" : range === "ly" ? (Number(yr) - 1) + "-01" : range === "all" ? firstKey : back(11);
    const to = range === "ly" ? (Number(yr) - 1) + "-12" : monthKey;
    for (let i = 0; i < 240; i++) { const k = back(i); if (k > to) continue; if (k < from) break; out.push(k); }
    return out;
  }, [range, firstKey, tod]); // eslint-disable-line react-hooks/exhaustive-deps
  const rangeName = { "12m": "last 12 months", ytd: "this year so far", ly: "last year", all: "all time" }[range];
  const wageIn = (k) => (wages ? wages[k] || 0 : 0);
  const centres = COST_CENTRE_LIST.filter((c) => spend[c]);
  const spendIn = (k) => centres.reduce((t, c) => t + ((spend[c] || {})[k] || 0), 0) + wageIn(k);
  const overheadIn = (k) => centres.filter(isOverhead).reduce((t, c) => t + ((spend[c] || {})[k] || 0), 0) + wageIn(k);
  // averages skip the month in progress so a half-month doesn't drag them down
  const avgOf = (list) => (fn) => { const ks = list.filter((k) => k !== monthKey); return ks.reduce((t, k) => t + fn(k), 0) / Math.max(1, ks.length); };
  const avg12 = avgOf(months12);           // the hero's fixed 12-month view
  const avgR = avgOf(months);              // the chosen range
  const sumR = (fn) => months.reduce((t, k) => t + fn(k), 0);
  const outFn = focus === "all" ? spendIn : focus === "overheads" ? overheadIn : focus === "wages" ? wageIn : (k) => (spend[focus] || {})[k] || 0;
  const outName = focus === "all" ? "spend + wages" : focus === "overheads" ? "overheads + wages" : focus === "wages" ? "wages" : focus;

  // ===== due & upcoming =====
  const unpaid = (crm.purchases || []).filter((p) => !purchaseIsPaid(p));
  const unpaidTotal = unpaid.reduce((t, p) => t + purchaseBalance(p), 0);
  const bigUnpaid = [...unpaid].sort((a, z) => purchaseBalance(z) - purchaseBalance(a)).slice(0, 8);
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
        {bank && <HeroStat label="Bank balance" value={gbp(bank.balance)} sub={"as at " + prettyDate(bank.date) + " — Finance › Bank"} />}
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

      {/* ===== filters ===== */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 14px" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", marginRight: 4 }}>Period</span>
        {[["12m", "Last 12 months"], ["ytd", "This year"], ["ly", "Last year"], ["all", "All time"]].map(([k, l]) => (
          <button key={k} onClick={() => setRange(k)} style={{ border: "1px solid " + (range === k ? NAVY : "#dfe4ec"), background: range === k ? NAVY : "#fff", color: range === k ? "#fff" : NAVY, borderRadius: 999, padding: "6px 14px", fontFamily: "inherit", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>{l}</button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, fontWeight: 800, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase" }}>Chart the out side as</span>
        <select value={focus} onChange={(e) => setFocus(e.target.value)} style={{ border: "1px solid #dfe4ec", borderRadius: 8, padding: "6px 10px", fontFamily: "inherit", fontWeight: 700, fontSize: 12.5, color: NAVY, background: "#fff" }}>
          <option value="all">All spend + wages</option>
          <option value="overheads">Overheads + wages (no stock)</option>
          {centres.map((c) => <option key={c} value={c}>{c}</option>)}
          <option value="wages">Wages only</option>
        </select>
      </div>

      {/* ===== the period in two pictures ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 14, marginBottom: 14 }}>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <p style={{ ...sect, margin: 0 }}>Money in vs out — {rangeName}</p>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: GREEN }}>■ sales</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>■ {outName}</span>
          </div>
          {(() => {
            const seq = [...months].reverse(); // oldest first, this month at the right
            const vals = seq.map((k) => ({ k, i: salesBy[k] || 0, o: outFn(k) }));
            const max = Math.max(1, ...vals.flatMap((v) => [v.i, v.o]));
            const W = 960, H = 170, bw = W / Math.max(1, vals.length);
            const gap = Math.min(5, bw * 0.08), barW = Math.max(1, bw / 2 - gap * 1.5);
            const many = vals.length > 18;
            return (
              <svg viewBox={"0 0 " + W + " " + (H + 24)} style={{ width: "100%", height: "auto", marginTop: 6 }}>
                {vals.map((v, i) => {
                  const x = i * bw, hi = (v.i / max) * H, ho = (v.o / max) * H;
                  const showLab = !many || v.k.endsWith("-01") || i === 0;
                  const lab = many ? (v.k.endsWith("-01") || i === 0 ? mLabel(v.k) : "") : mLabel(v.k).split(" ")[0];
                  return (
                    <g key={v.k}>
                      {many && v.k.endsWith("-01") && i > 0 && <line x1={x} x2={x} y1={0} y2={H} stroke="#e6e9ef" strokeWidth="1" />}
                      <rect x={x + gap} y={H - hi} width={barW} height={Math.max(1.5, hi)} fill={GREEN} rx="2"><title>{mLabel(v.k) + " · sales " + gbp(v.i)}</title></rect>
                      <rect x={x + bw / 2} y={H - ho} width={barW} height={Math.max(1.5, ho)} fill={NAVY} rx="2"><title>{mLabel(v.k) + " · " + outName + " " + gbp(v.o)}</title></rect>
                      {showLab && <text x={many ? x + 2 : x + bw / 2} y={H + 15} fontSize="10.5" textAnchor={many ? "start" : "middle"} fill="#8593a8" fontWeight="700">{lab}</text>}
                    </g>
                  );
                })}
              </svg>
            );
          })()}
          {(() => {
            const tin = sumR((k) => salesBy[k] || 0), tout = sumR(outFn), tnet = tin - tout;
            const box = (l, v, c) => (
              <div style={{ flex: 1, minWidth: 120, background: "#f6f8fb", borderRadius: 10, padding: "8px 12px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase" }}>{l}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: c || NAVY }}>{gbp(v)}</div>
              </div>
            );
            return (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {box("Sales in · " + months.length + " mo", tin, "#1e5e33")}
                {box(outName, tout)}
                {box("Difference", tnet, tnet >= 0 ? "#1e5e33" : "#8a0b20")}
              </div>
            );
          })()}
        </div>
        <div style={{ ...card, marginBottom: 0 }}>
          <p style={sect}>Where it goes — monthly average, {rangeName}</p>
          {(() => {
            const rows2 = centres.map((c) => ({ c, v: avgR((k) => (spend[c] || {})[k] || 0) }));
            if (wages && avgR(wageIn) > 0) rows2.push({ c: "Wages (payroll)", v: avgR(wageIn) });
            const all = rows2.reduce((t, r) => t + r.v, 0) || 1;
            rows2.sort((a, z) => z.v - a.v);
            const max = Math.max(1, ...rows2.map((r) => r.v));
            return rows2.map((r) => (
              <div key={r.c} onClick={() => setFocus(r.c === "Wages (payroll)" ? "wages" : r.c)} title={"Chart " + r.c + " against sales"}
                style={{ display: "grid", gridTemplateColumns: "150px 1fr 76px 38px", gap: 8, alignItems: "center", margin: "6px 0", cursor: "pointer", opacity: focus === "all" || focus === "overheads" || focus === r.c || (focus === "wages" && r.c === "Wages (payroll)") ? 1 : 0.45 }}>
                <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.c}</span>
                <div style={{ background: "#eef1f6", borderRadius: 6, height: 14 }}>
                  <div style={{ width: Math.max(1.5, (r.v / max) * 100) + "%", height: "100%", borderRadius: 6, background: r.c === "Stock" ? GOLD : r.c === "Wages (payroll)" ? GREEN : NAVY }} />
                </div>
                <b style={{ fontSize: 12, textAlign: "right" }}>{gbp(r.v)}</b>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#8593a8", textAlign: "right" }}>{Math.round((r.v / all) * 100)}%</span>
              </div>
            ));
          })()}
          <p style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, margin: "8px 2px 0" }}>Complete months only. Gold = stock, green = payroll, navy = overheads — click a row to chart it against sales.{wages && Object.keys(wages).length ? " Wages are keyed from " + mLabel(Object.keys(wages).sort()[0]) + " — months before that show no payroll." : ""}</p>
        </div>
      </div>

      {/* ===== by cost centre, month by month ===== */}
      <div style={card}>
        <p style={sect}>Spend by cost centre — {rangeName}</p>
        <div className="dk-bleed" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: Math.max(980, 260 + months.length * 84) }}>
            <thead><tr>
              <th style={{ ...th, ...left }}>Centre</th>
              {months.map((k) => <th key={k} style={th}>{mLabel(k)}</th>)}
              <th style={th}>Avg / mo</th>
              <th style={th}>Total</th>
            </tr></thead>
            <tbody>
              {centres.map((c) => (
                <tr key={c}>
                  <td style={{ ...tdc, ...left, fontWeight: 700 }}>{c}</td>
                  {months.map((k) => { const v = (spend[c] || {})[k] || 0; return <td key={k} style={{ ...tdc, color: v ? NAVY : "#c4ccd8" }}>{v ? gbp(v) : "—"}</td>; })}
                  <td style={{ ...tdc, fontWeight: 700 }}>{gbp(avgR((k) => (spend[c] || {})[k] || 0))}</td>
                  <td style={{ ...tdc, fontWeight: 700 }}>{gbp(sumR((k) => (spend[c] || {})[k] || 0))}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...tdc, ...left, fontWeight: 700 }}>Wages <span style={{ color: "#8593a8", fontWeight: 600 }}>(payroll)</span></td>
                {months.map((k) => { const v = wageIn(k); return <td key={k} style={{ ...tdc, color: v ? NAVY : "#c4ccd8" }}>{v ? gbp(v) : "—"}</td>; })}
                <td style={{ ...tdc, fontWeight: 700 }}>{gbp(avgR(wageIn))}</td>
                <td style={{ ...tdc, fontWeight: 700 }}>{gbp(sumR(wageIn))}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr style={{ background: "#f6f8fb" }}>
                <td style={{ ...tdc, ...left, fontWeight: 800 }}>Total out</td>
                {months.map((k) => <td key={k} style={{ ...tdc, fontWeight: 700 }}>{gbp(spendIn(k))}</td>)}
                <td style={{ ...tdc, fontWeight: 800 }}>{gbp(avgR(spendIn))}</td>
                <td style={{ ...tdc, fontWeight: 800 }}>{gbp(sumR(spendIn))}</td>
              </tr>
              <tr>
                <td style={{ ...tdc, ...left, fontWeight: 800 }}>Sales in</td>
                {months.map((k) => <td key={k} style={{ ...tdc, fontWeight: 700, color: "#1e5e33" }}>{gbp(salesBy[k] || 0)}</td>)}
                <td style={{ ...tdc, fontWeight: 800, color: "#1e5e33" }}>{gbp(avgR((k) => salesBy[k] || 0))}</td>
                <td style={{ ...tdc, fontWeight: 800, color: "#1e5e33" }}>{gbp(sumR((k) => salesBy[k] || 0))}</td>
              </tr>
              <tr>
                <td style={{ ...tdc, ...left, fontWeight: 800 }}>Net</td>
                {months.map((k) => { const n = (salesBy[k] || 0) - spendIn(k); return <td key={k} style={{ ...tdc, fontWeight: 800, color: n >= 0 ? "#1e5e33" : "#8a0b20" }}>{gbp(n)}</td>; })}
                <td style={{ ...tdc, fontWeight: 800 }}>{gbp(avgR((k) => (salesBy[k] || 0) - spendIn(k)))}</td>
                <td style={{ ...tdc, fontWeight: 800 }}>{gbp(sumR((k) => (salesBy[k] || 0) - spendIn(k)))}</td>
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
                      <td style={{ ...tdc, fontWeight: 700 }}>{gbp(purchaseBalance(p))}</td>
                    </tr>
                  );
                })}
                {unpaid.length > bigUnpaid.length && (
                  <tr><td style={{ ...tdc, ...left, color: "#8593a8", fontWeight: 600 }}>+ {unpaid.length - bigUnpaid.length} more</td>
                    <td style={{ ...tdc, fontWeight: 700 }}>{gbp(unpaidTotal - bigUnpaid.reduce((t, p) => t + purchaseBalance(p), 0))}</td></tr>
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
  const [allRows, setAllRows] = useState(false);
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
        <span style={{ flex: 1 }} />
        {keys.length > 13 && (
          <button onClick={() => setAllRows((v) => !v)} style={{ border: "1px solid #dfe4ec", background: "#fff", color: NAVY, borderRadius: 999, padding: "5px 12px", fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            {allRows ? "Last 13 months" : "Show all " + keys.length + " months"}
          </button>
        )}
      </div>
      <div className="dk-bleed" style={{ overflowX: "auto", marginTop: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 760 }}>
          <thead><tr>{["Month", "Rent in", "Water recharged", "Electric recharged", "Water Plus bill", "Water gap (ours)", "Gas/electric bill", "Net for us"].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>)}</tr></thead>
          <tbody>
            {(allRows ? keys : keys.slice(0, 13)).map((k) => {
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
