// Business snapshot: where the money goes. Admin only, behind the Financials
// unlock like every other money screen. Sales from invoices, spend from the
// purchase ledger grouped by cost centre (075), wages from the admin-only
// wages table, due & upcoming from unpaid purchases + container balances.
import { useEffect, useMemo, useState } from "react";
import { NAVY, GOLD, addMonths, addDays, prettyDate } from "../lib/core.js";
import { invoiceTotals, isVoidInvoice, purchaseTotals, purchaseIsPaid, gbp, supplierById, today } from "../lib/crmCore.js";
import { COST_CENTRE_LIST, isOverhead, assignCostCentre } from "../lib/costCentres.js";
import { sect, card, ListHero, HeroStat } from "./crm/ui.jsx";
import { fetchWageMonths } from "./crm/WagesScreen.jsx";

const th = { fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap", textAlign: "right" };
const tdc = { padding: "8px 8px", borderBottom: "1px solid #f0f2f6", textAlign: "right", whiteSpace: "nowrap" };
const left = { textAlign: "left" };
const USD_GBP = 1.27; // planning rate for container balances still to pay

export default function BusinessScreen({ crm, data, setTab }) {
  const [wages, setWages] = useState(null); // { 'YYYY-MM': employer cost } | null while loading
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
  const supOf = (p) => { const s = supplierById(crm, p.supplierId); return s ? s.name : ""; };
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
      if (s.balancePaidDate) return;
      const val = Number(s.valueUsd) || 0;
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
        <HeroStat label="Ledger unpaid" value={gbp(unpaidTotal)} sub={unpaid.length + " invoices"} tone={unpaidTotal > 0 ? "#ffd27a" : GOLD} />
        <HeroStat label="Container balances" value={gbp(containerTotal)} sub={containers.length + " shipments, est at $" + USD_GBP + "/£"} />
      </ListHero>

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
                  const s = supplierById(crm, p.supplierId);
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
    </div>
  );
}
