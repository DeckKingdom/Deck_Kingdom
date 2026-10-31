// Samples tab: sample requests (S-n) with the day's work lists (to send,
// follow-ups due) and conversion reporting; entry screen per request.
// Conversions are credited automatically (see syncSampleConversions).
import { useState, useMemo } from "react";
import { NAVY, GOLD, RED, prettyDate, prettyDateTime, addDays, daysBetween } from "../../lib/core.js";
import {
  blankSample, blankSampleItem, blankCustomer, nextNumber, gbp, today, invoiceTotals, isSaleInvoice,
  sampleRef, sampleStatus, sampleInvoice, sampleIsOpen, sampleStats, SAMPLE_TONES,
  originText, userInitials, SAMPLE_SOURCES, SAMPLE_DISPATCH, SAMPLE_SIZES, SAMPLE_WINDOW_DAYS, SAMPLE_FOLLOWUP_DAYS, SOURCES, FIELD_FORMATS,
} from "../../lib/crmCore.js";
import { samplesAvailable } from "../../data/crmStorage.js";
import { Icon, Chip, SuggestInput, selectAllProps, sect, lbl, card, abtn, inp, btn, goldBtn } from "./ui.jsx";
import { ColourSelect } from "./LinesEditor.jsx";
import { printSampleSlip } from "./printDocs.js";

const navyBtn = { ...btn, background: "transparent", border: "1px solid #3a4f78", color: "#fff" };
const th = { fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap", textAlign: "left" };
const tdc = { padding: "9px 8px", borderBottom: "1px solid #f0f2f6" };
const pct = (r) => (r === null || r === undefined ? "—" : Math.round(r * 100) + "%");

const SchemaNotice = () => (
  <div style={{ ...card, borderColor: GOLD, background: "#fff8e6", fontSize: 13.5, fontWeight: 600, color: "#6b5305" }}>
    <b style={{ display: "block", fontSize: 14.5, color: NAVY, marginBottom: 4 }}>Samples need one more database step</b>
    Run <code>017_samples.sql</code> in Supabase (SQL Editor → New query → paste → Run), then refresh this page.
    Until then sample requests can't be saved — everything else carries on as normal.
  </div>
);

const PERIODS = [["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last 12 months"], ["all", "All time"]];
const FILTERS = ["To send", "Follow-up due", "Open", "Converted", "Closed", "All"];
const itemsSummary = (x) => (x.items || []).map((it) => (Number(it.qty) > 1 ? it.qty + "× " : "") + [it.colour, it.description].filter(Boolean).join(" ")).filter(Boolean).join(", ");

// how an invoice is known: its number, else the website order ref
const invRef = (i) => (i.invNo ? "invoice #" + i.invNo : i.orderRef ? "order " + i.orderRef : "invoice (not numbered yet)");

export default function SamplesScreen({ crm, updateCrm, askConfirm, selId, setSelId, goCustomer, openInvoice, me }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(null); // null = pick a sensible default
  const [period, setPeriod] = useState("90");
  const [custQuery, setCustQuery] = useState("");
  const [newCust, setNewCust] = useState(null);
  const [stampOpen, setStampOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const ready = samplesAvailable();
  const samples = crm.samples || [];

  const custById = useMemo(() => {
    const m = {};
    crm.customers.forEach((c) => (m[c.id] = c));
    return m;
  }, [crm.customers]);

  const productNames = useMemo(() => {
    const names = new Set();
    const colours = new Set();
    (crm.masterProducts || []).forEach((p) => {
      if (p.active === false) return;
      if (p.name) names.add(p.name);
      if (p.colour) colours.add(p.colour);
    });
    return {
      names: [...names].sort().map((v) => ({ value: v, label: v })),
      colours: [...colours].sort().map((v) => ({ value: v, label: v })),
    };
  }, [crm.masterProducts]);

  const smp = samples.find((x) => x.id === selId) || null;

  const setSample = (fn) =>
    updateCrm((c) => {
      const t = c.samples.find((x) => x.id === smp.id);
      if (t) fn(t, c);
      return c;
    });

  const newSample = () => {
    if (!ready) return;
    const n = blankSample("");
    n.sampleNo = nextNumber(samples, "sampleNo", crm.numbering.sample);
    n.raisedBy = me || "";
    n.items = [blankSampleItem()];
    updateCrm((c) => {
      c.samples.unshift(n);
      c.numbering.sample = (Number(n.sampleNo) || 0) + 1;
      return c;
    });
    setCustQuery("");
    setNewCust(null);
    setSelId(n.id);
  };

  // ===== list view =====
  if (!smp) {
    const counts = { "To send": 0, "Follow-up due": 0 };
    samples.forEach((x) => {
      const st = sampleStatus(x, crm);
      if (counts[st] !== undefined) counts[st]++;
    });
    const filterNow = statusFilter || (counts["To send"] ? "To send" : counts["Follow-up due"] ? "Follow-up due" : "Open");

    const since = period === "all" ? "" : addDays(today(), -Number(period));
    const inPeriod = samples.filter((x) => !since || (x.date || "") >= since);
    const stats = sampleStats(inPeriod, crm);

    // by request month (last 12) and by source
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().slice(0, 7));
    }
    const monthRows = months.map((m) => ({ key: m, ...sampleStats(samples.filter((x) => (x.date || "").slice(0, 7) === m), crm) }));
    const sources = [...new Set(inPeriod.map((x) => x.source || "Unknown"))].sort();
    const sourceRows = sources
      .map((src) => ({ key: src, ...sampleStats(inPeriod.filter((x) => (x.source || "Unknown") === src), crm) }))
      .sort((a, b) => b.requests - a.requests);

    const q = search.trim().toLowerCase();
    const matches = [...samples]
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (Number(b.sampleNo) || 0) - (Number(a.sampleNo) || 0))
      .filter((x) => {
        const st = sampleStatus(x, crm);
        if (filterNow === "Open" && !sampleIsOpen(x, crm)) return false;
        if (filterNow === "Closed" && !["No sale", "Lapsed"].includes(st)) return false;
        if (["To send", "Follow-up due", "Converted"].includes(filterNow) && st !== filterNow) return false;
        if (!q) return true;
        const c = custById[x.customerId];
        return [sampleRef(x), String(x.sampleNo || ""), c && c.name, c && c.postcode, c && c.email, itemsSummary(x)].some((v) => String(v || "").toLowerCase().includes(q));
      });
    const shown = matches.slice(0, 60);
    const monthLabel = (m) => new Date(m + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

    const ReportTable = ({ title, rows, label }) => (
      <div style={{ ...card, marginBottom: 0 }}>
        <p style={sect}>{title}</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr>{["", "Requests", "Orders", "Rate", "Sales £"].map((h, i) => <th key={i} style={{ ...th, textAlign: i ? "right" : "left", padding: "6px 6px" }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ ...tdc, padding: "7px 6px", fontWeight: 700 }}>{label(r.key)}</td>
                  <td style={{ ...tdc, padding: "7px 6px", textAlign: "right" }}>{r.requests || "—"}</td>
                  <td style={{ ...tdc, padding: "7px 6px", textAlign: "right" }}>{r.requests ? r.converted : "—"}</td>
                  <td style={{ ...tdc, padding: "7px 6px", textAlign: "right", fontWeight: 700, color: r.rate ? "#28713e" : "#8593a8" }}>{r.requests ? pct(r.rate) : "—"}</td>
                  <td style={{ ...tdc, padding: "7px 6px", textAlign: "right" }}>{r.revenue ? r.revenue.toLocaleString("en-GB", { maximumFractionDigits: 0 }) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );

    return (
      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "18px 22px" }}>
        {!ready && <SchemaNotice />}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <p style={{ ...sect, margin: 0 }}>Conversion</p>
          <select style={{ ...inp, width: "auto", padding: "5px 9px", fontSize: 13, fontWeight: 700 }} value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span style={{ fontSize: 12, color: "#8593a8", fontWeight: 600 }}>
            by request date · an order counts if placed within {SAMPLE_WINDOW_DAYS} days of the sample
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 14 }}>
          {[
            ["Sample requests", stats.requests.toLocaleString("en-GB"), stats.open + " still open"],
            ["Converted to orders", stats.converted.toLocaleString("en-GB") + " · " + pct(stats.rate), stats.lost ? pct(stats.decidedRate) + " of closed requests" : "of all requests"],
            ["Sales from samples", gbp(stats.revenue), stats.perSample !== null ? gbp(stats.perSample) + " per sample sent" : "inc VAT"],
            ["Avg time to order", stats.avgDays === null ? "—" : stats.avgDays + " days", "request → invoice"],
          ].map(([k, v, sub]) => (
            <div key={k} style={{ ...card, marginBottom: 0, padding: "12px 16px" }}>
              <span style={lbl}>{k}</span>
              <b style={{ fontSize: 20, color: NAVY }}>{v}</b>
              <div style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>

        <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 300 }}>
            <span style={{ position: "absolute", left: 11, top: 10 }}><Icon name="search" /></span>
            <input style={{ ...inp, paddingLeft: 34 }} placeholder="Search S-#, customer, email, colour…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {FILTERS.map((f) => {
              const on = filterNow === f;
              const n = counts[f];
              return (
                <button key={f} onClick={() => setStatusFilter(f)}
                  style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "6px 11px", borderRadius: 999, cursor: "pointer", border: "1px solid " + (on ? NAVY : "#d5d9e0"), background: on ? NAVY : "#fff", color: on ? "#fff" : "#5a6a85", display: "inline-flex", gap: 6, alignItems: "center" }}>
                  {f}
                  {n ? <span style={{ background: f === "To send" ? RED : "#E8912D", color: "#fff", borderRadius: 99, fontSize: 10.5, padding: "0 6px", lineHeight: "16px" }}>{n}</span> : null}
                </button>
              );
            })}
          </div>
          <span style={{ flex: 1 }} />
          <button style={{ ...goldBtn, opacity: ready ? 1 : 0.5 }} disabled={!ready} onClick={newSample}><Icon name="plus" stroke={NAVY} />Log sample request</button>
        </div>

        <div style={card}>
          {matches.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 10px", color: "#5a6a85", fontWeight: 600 }}>
              {samples.length === 0 ? "No sample requests yet." : filterNow === "To send" ? "Nothing waiting to go out." : filterNow === "Follow-up due" ? "No follow-ups due." : "No sample requests match."}
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 820 }}>
                  <thead>
                    <tr>{["Sample", "Date", "Customer", "Samples", "Source", "Status", "Order", ""].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {shown.map((x) => {
                      const c = custById[x.customerId];
                      const st = sampleStatus(x, crm);
                      const inv = sampleInvoice(x, crm);
                      return (
                        <tr key={x.id} onClick={() => setSelId(x.id)} style={{ cursor: "pointer" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f8fb")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                          <td style={{ ...tdc, fontWeight: 700, color: "#185FA5", whiteSpace: "nowrap" }}>{sampleRef(x)}</td>
                          <td style={{ ...tdc, whiteSpace: "nowrap" }}>{prettyDate(x.date)}</td>
                          <td style={{ ...tdc, fontWeight: 700 }}>
                            {c ? c.name : <span style={{ color: RED }}>No customer</span>}
                            {c && c.postcode ? <span style={{ color: "#8593a8", fontWeight: 600 }}> · {c.postcode}</span> : null}
                          </td>
                          <td style={{ ...tdc, color: "#5a6a85", fontWeight: 600, maxWidth: 260 }}>{itemsSummary(x) || "—"}</td>
                          <td style={tdc}>{x.source || "—"}</td>
                          <td style={tdc}><Chip tone={SAMPLE_TONES[st]}>{st}</Chip></td>
                          <td style={{ ...tdc, whiteSpace: "nowrap" }}>
                            {inv ? (
                              <button onClick={(e) => { e.stopPropagation(); openInvoice(inv.id); }}
                                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, color: "#185FA5", fontSize: 13, padding: 0 }}>
                                {"#" + (inv.invNo || "—") + " · " + gbp(invoiceTotals(inv).total)}
                              </button>
                            ) : <span style={{ color: "#aab3c2" }}>—</span>}
                          </td>
                          <td style={{ ...tdc, textAlign: "right" }}>
                            <button style={abtn} title="Open" onClick={(e) => { e.stopPropagation(); setSelId(x.id); }}><Icon name="pen" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {matches.length > shown.length && (
                <div style={{ fontSize: 12, color: "#8593a8", fontWeight: 600, marginTop: 10 }}>Showing {shown.length} of {matches.length.toLocaleString("en-GB")} — keep typing to narrow it down.</div>
              )}
            </>
          )}
        </div>

        {samples.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>
            <ReportTable title="By month requested (last 12)" rows={[...monthRows].reverse()} label={monthLabel} />
            <ReportTable title={"By source · " + PERIODS.find(([v]) => v === period)[1].toLowerCase()} rows={sourceRows} label={(k) => k} />
          </div>
        )}
      </div>
    );
  }

  // ===== entry view =====
  const cust = custById[smp.customerId];
  const st = sampleStatus(smp, crm);
  const inv = sampleInvoice(smp, crm);
  const custInvoices = crm.invoices
    .filter((i) => i.customerId === smp.customerId && isSaleInvoice(i))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const windowEnd = smp.date ? addDays(smp.date, SAMPLE_WINDOW_DAYS) : "";

  const custMatches = custQuery.trim()
    ? crm.customers
        .filter((c) => [c.name, c.postcode, c.town, c.mobile, c.email, String(c.accountNo || "")].some((v) => String(v || "").toLowerCase().includes(custQuery.trim().toLowerCase())))
        .slice(0, 8)
    : [];

  const field = (label, k, props = {}) => (
    <div>
      <span style={lbl}>{label}</span>
      <input style={inp} value={smp[k] === null ? "" : smp[k]} {...props} onChange={(e) => setSample((x) => (x[k] = e.target.value))} />
    </div>
  );

  const markSent = () =>
    setSample((x) => {
      x.dispatchedDate = x.dispatchedDate || today();
      if (!x.followUpDate) x.followUpDate = addDays(x.dispatchedDate, SAMPLE_FOLLOWUP_DAYS);
    });

  const saveNewCustomer = () => {
    const nc = { ...newCust };
    Object.keys(nc).forEach((k) => FIELD_FORMATS[k] && typeof nc[k] === "string" && (nc[k] = FIELD_FORMATS[k](nc[k])));
    if (!String(nc.name || "").trim()) return setNotice("Give the new customer a name.");
    const c = { ...blankCustomer(), ...nc, accountNo: nextNumber(crm.customers, "accountNo", crm.numbering.account), createdBy: me || "" };
    c.source = SOURCES.includes(smp.source) ? smp.source : smp.source === "Showroom" ? "Walk-in" : "";
    updateCrm((d) => {
      d.customers.push(c);
      d.numbering.account = (Number(c.accountNo) || 0) + 1;
      const t = d.samples.find((x) => x.id === smp.id);
      if (t) t.customerId = c.id;
      return d;
    });
    setNewCust(null);
    setCustQuery("");
  };

  const remove = () =>
    askConfirm({
      message: "Delete sample request " + sampleRef(smp) + "? It will drop out of the conversion figures.",
      confirmLabel: "Delete",
      danger: true,
      action: () => {
        updateCrm((c) => {
          c.samples = c.samples.filter((x) => x.id !== smp.id);
          return c;
        });
        setSelId(null);
      },
    });

  const tryPrint = () => {
    if (!printSampleSlip(smp, cust)) setNotice("Printing is blocked in the design preview — it works on the live site (ops.deckkingdom.co.uk).");
  };

  const statusChipStyle = st === "Converted" ? { background: "#3FA55C", color: "#fff", border: "none" } : st === "To send" ? { background: RED, color: "#fff", border: "none" } : { background: "#ffffff18", color: "#cfd6e4", border: "1px solid #ffffff2e" };

  return (
    <div style={{ maxWidth: 1140, margin: "0 auto", padding: "18px 22px" }}>
      <button style={{ ...btn, marginBottom: 12 }} onClick={() => setSelId(null)}><Icon name="back" stroke={NAVY} />All samples</button>
      {!ready && <SchemaNotice />}
      {notice && (
        <div style={{ ...card, borderColor: GOLD, background: "#fff8e6", display: "flex", gap: 10, alignItems: "center", fontWeight: 600, fontSize: 13 }}>
          <span style={{ flex: 1 }}>{notice}</span>
          <button style={abtn} onClick={() => setNotice("")}><Icon name="x" /></button>
        </div>
      )}

      {/* header band */}
      <div style={{ background: "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", borderRadius: 12, padding: "16px 22px", color: "#fff", marginBottom: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ position: "relative", display: "inline-block" }} onMouseEnter={() => setStampOpen(true)} onMouseLeave={() => setStampOpen(false)}>
              <h2 style={{ margin: 0, fontSize: 19, cursor: "default" }}>
                Sample {sampleRef(smp)}
                <span style={{ color: "#aeb9cf", fontWeight: 600, fontSize: 14, marginLeft: 12 }}>{prettyDate(smp.date)}</span>
              </h2>
              {stampOpen && (
                <span style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", zIndex: 20, background: "#fff", color: NAVY, border: "1px solid #e6e9ef", borderRadius: 12, padding: "8px 12px", boxShadow: "0 8px 24px rgba(0,0,0,.28)", whiteSpace: "nowrap", fontSize: 12, fontWeight: 600, lineHeight: 1.6 }}>
                  <span style={{ display: "block" }}>{originText(smp, prettyDate(smp.created))}</span>
                  {smp.updatedAt && <span style={{ display: "block" }}>{"Updated " + prettyDateTime(smp.updatedAt) + (smp.modifiedBy ? " by " + smp.modifiedBy.split("@")[0] + " (" + userInitials(crm, smp.modifiedBy) + ")" : "")}</span>}
                </span>
              )}
            </span>
            {st !== "Converted" && <Chip tone={SAMPLE_TONES[st]} style={statusChipStyle}>{st}</Chip>}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={navyBtn} onClick={tryPrint}><Icon name="doc" stroke="#fff" />Dispatch slip</button>
          <button style={{ ...navyBtn, border: "1px dashed #3a4f78", color: "#8fa0c0" }} onClick={remove}><Icon name="bin" stroke="#8fa0c0" />Delete</button>
          {!smp.dispatchedDate ? (
            <button style={goldBtn} onClick={markSent}><Icon name="truck" stroke={NAVY} />Mark as sent</button>
          ) : !smp.followedUp && !inv && smp.outcome !== "lost" ? (
            <button style={goldBtn} onClick={() => setSample((x) => { x.followedUp = true; x.followedUpDate = today(); })}><Icon name="phone" stroke={NAVY} />Followed up</button>
          ) : null}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 14 }}>
        {/* customer */}
        <div style={{ ...card, marginBottom: 0 }}>
          <p style={sect}>Customer</p>
          {cust ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: GOLD, color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, flex: "none" }}>
                {(cust.name || "?").trim().charAt(0).toUpperCase() || "?"}
              </div>
              <button onClick={() => goCustomer(cust.id)} title="Open the customer's account"
                style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", fontSize: 15, fontWeight: 700, color: "#185FA5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {cust.name || "Unnamed account"}
              </button>
            </div>
          ) : newCust ? (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[["name", "Name", 2], ["mobile", "Mobile", 1], ["email", "Email", 1], ["address", "Address", 2], ["town", "Town", 1], ["postcode", "Postcode", 1]].map(([k, label, span]) => (
                  <div key={k} style={{ gridColumn: "span " + span }}>
                    <span style={lbl}>{label}</span>
                    <input style={inp} autoFocus={k === "name"} value={newCust[k] || ""}
                      onChange={(e) => setNewCust({ ...newCust, [k]: e.target.value })}
                      onBlur={(e) => FIELD_FORMATS[k] && setNewCust((n) => ({ ...n, [k]: FIELD_FORMATS[k](e.target.value) }))} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
                <button style={btn} onClick={() => setNewCust(null)}>Cancel</button>
                <button style={goldBtn} onClick={saveNewCustomer}>Create account</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={inp} autoFocus placeholder="Find the customer — name, postcode, email, account #…" value={custQuery} onChange={(e) => setCustQuery(e.target.value)} />
                <button style={{ ...btn, whiteSpace: "nowrap" }} title="New customer — most sample requests are new enquiries"
                  onClick={() => setNewCust({ name: custQuery.trim(), mobile: "", email: "", address: "", town: "", postcode: "" })}>
                  <Icon name="plus" stroke={NAVY} />New
                </button>
              </div>
              {custMatches.length > 0 && (
                <div style={{ border: "1px solid #e6e9ef", borderRadius: 8, marginTop: 6, overflow: "hidden" }}>
                  {custMatches.map((c) => (
                    <button key={c.id} onClick={() => { setSample((x) => (x.customerId = c.id)); setCustQuery(""); }}
                      style={{ display: "block", width: "100%", textAlign: "left", background: "#fff", border: "none", borderBottom: "1px solid #f0f2f6", padding: "9px 12px", fontFamily: "inherit", fontSize: 13.5, cursor: "pointer" }}>
                      <b>{c.name || "Unnamed"}</b> <span style={{ color: "#5a6a85", fontWeight: 600 }}>#{c.accountNo || "—"} · {[c.town, c.postcode, c.email].filter(Boolean).join(" ")}</span>
                    </button>
                  ))}
                </div>
              )}
              {custQuery.trim() && custMatches.length === 0 && (
                <div style={{ fontSize: 12.5, color: "#8593a8", fontWeight: 600, marginTop: 8 }}>No match — press <b>New</b> to create the account here.</div>
              )}
            </div>
          )}
        </div>

        {/* conversion */}
        <div style={{ ...card, marginBottom: 0, borderColor: inv ? "#bfe3ca" : "#e6e9ef", background: inv ? "#3FA55C0d" : "#fff" }}>
          <p style={sect}>Conversion</p>
          {inv ? (
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "#3FA55C", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <Icon name="pound" size={18} stroke="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <button onClick={() => openInvoice(inv.id)} title="Open the order"
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", fontSize: 15, fontWeight: 700, color: "#28713e", textDecoration: "underline", textDecorationColor: "#28713e55", textUnderlineOffset: 3 }}>
                  {"Ordered — " + invRef(inv) + " · " + gbp(invoiceTotals(inv).total)}
                </button>
                <div style={{ fontSize: 12, color: "#5a6a85", fontWeight: 600, marginTop: 2 }}>
                  {prettyDate(inv.date)}{daysBetween(smp.date, inv.date) !== null ? " · " + daysBetween(smp.date, inv.date) + " days after the request" : ""} · {smp.linkManual ? "linked by hand" : "matched automatically"}
                </div>
              </div>
            </div>
          ) : smp.outcome === "lost" ? (
            <div>
              <b style={{ fontSize: 14, color: RED }}>Closed — no sale</b>
              <input style={{ ...inp, marginTop: 8 }} placeholder="Reason (price, went elsewhere, project shelved…)" value={smp.lostReason} {...selectAllProps}
                onChange={(e) => setSample((x) => (x.lostReason = e.target.value))} />
              <button style={{ ...btn, marginTop: 8 }} onClick={() => setSample((x) => { x.outcome = ""; x.lostReason = ""; })}>Reopen</button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#5a6a85", marginBottom: 10 }}>
                {!cust ? "Pick the customer — their orders are what count as conversions."
                  : smp.linkManual ? "Set by hand to credit no order to this sample."
                  : st === "Lapsed" ? "No order within " + SAMPLE_WINDOW_DAYS + " days of the request."
                  : <>Watching for an order from <b style={{ color: NAVY }}>{cust.name}</b> until <b style={{ color: NAVY }}>{prettyDate(windowEnd)}</b> — the first invoice raised for them is credited to this sample automatically.</>}
              </div>
              <button style={{ ...btn, padding: "6px 11px", fontSize: 12.5 }} onClick={() => setSample((x) => (x.outcome = "lost"))}>
                <Icon name="x" />Close as no sale
              </button>
            </div>
          )}
          {cust && custInvoices.length > 0 && smp.outcome !== "lost" && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #eef0f4" }}>
              <button type="button" onClick={() => setCreditOpen((o) => !o)}
                style={{ ...lbl, marginBottom: creditOpen || smp.linkManual ? 6 : 0, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
                Which order did this sample lead to?
                {!creditOpen && <span style={{ textTransform: "none", letterSpacing: 0, color: "#5a6a85" }}>{smp.linkManual ? (smp.convertedInvoiceId ? "· set by hand" : "· none") : "· worked out automatically"}</span>}
                <span style={{ marginLeft: "auto" }}>{creditOpen ? "▾" : "▸"}</span>
              </button>
              {creditOpen && <select style={{ ...inp, fontSize: 13 }} value={smp.linkManual ? smp.convertedInvoiceId || "__none__" : ""}
                onChange={(e) => setSample((x) => {
                  const v = e.target.value;
                  if (!v) { x.linkManual = false; return; } // back to automatic; the sync re-matches
                  x.linkManual = true;
                  x.convertedInvoiceId = v === "__none__" ? "" : v;
                  const i = crm.invoices.find((y) => y.id === v);
                  x.convertedAt = i ? i.date || "" : "";
                })}>
                <option value="">Work it out — their first order after the sample</option>
                <option value="__none__">None — the sample didn't lead to an order</option>
                {custInvoices.map((i) => (
                  <option key={i.id} value={i.id}>{"This one: " + invRef(i) + " · " + prettyDate(i.date) + " · " + gbp(invoiceTotals(i).total)}</option>
                ))}
              </select>}
            </div>
          )}
        </div>
      </div>

      {/* samples requested */}
      <div style={card}>
        <p style={sect}>Samples requested</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
            <thead><tr>{["Product", "Colour", "Size", "Qty", ""].map((h, i) => <th key={i} style={{ ...th, padding: "8px 6px" }}>{h}</th>)}</tr></thead>
            <tbody>
              {smp.items.map((it) => {
                const setItem = (k, v) => setSample((x) => { const t = x.items.find((y) => y.id === it.id); if (t) t[k] = v; });
                return (
                  <tr key={it.id}>
                    <td style={{ ...tdc, padding: "6px 6px", minWidth: 220 }}><SuggestInput value={it.description} options={productNames.names} onChange={(v) => setItem("description", v)} placeholder="e.g. Composite decking board" /></td>
                    <td style={{ ...tdc, padding: "6px 6px", width: 170 }}><ColourSelect line={{ code: "", colour: it.colour }} crm={crm} bySku={{}} onPick={(c) => setItem("colour", c)}
                      onPickMany={(cols) => setSample((x) => {
                        // first colour stays on this line; each extra one becomes its own line (same product, size, qty)
                        const i = x.items.findIndex((y) => y.id === it.id);
                        if (i < 0) return;
                        const t = x.items[i];
                        const keep = cols.some((c) => c.toLowerCase() === String(t.colour || "").toLowerCase()) ? t.colour : (cols[0] || "");
                        t.colour = keep;
                        const extra = cols.filter((c) => c.toLowerCase() !== String(keep).toLowerCase())
                          .filter((c) => !x.items.some((y) => y.id !== t.id && (y.description || "") === (t.description || "") && String(y.colour || "").toLowerCase() === c.toLowerCase()));
                        x.items.splice(i + 1, 0, ...extra.map((c) => ({ ...blankSampleItem(), description: t.description, size: t.size, qty: t.qty, colour: c })));
                      })} /></td>
                    <td style={{ ...tdc, padding: "6px 6px", width: 110 }}>
                      <select style={inp} value={it.size} onChange={(e) => setItem("size", e.target.value)}>
                        {SAMPLE_SIZES.map((z) => <option key={z} value={z}>{z === "Large" ? "Large (£2.95)" : z}</option>)}
                      </select>
                    </td>
                    <td style={{ ...tdc, padding: "6px 6px", width: 70 }}>
                      <input style={{ ...inp, textAlign: "right" }} inputMode="numeric" value={it.qty} {...selectAllProps} onChange={(e) => setItem("qty", e.target.value)} />
                    </td>
                    <td style={{ ...tdc, padding: "6px 2px", width: 34, textAlign: "right" }}>
                      <button style={{ ...abtn, border: "none" }} title="Remove" onClick={() => setSample((x) => (x.items = x.items.filter((y) => y.id !== it.id)))}><Icon name="x" stroke={RED} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button style={{ ...btn, width: "100%", justifyContent: "center", borderStyle: "dashed", color: "#5a6a85", marginTop: 8 }}
          onClick={() => setSample((x) => x.items.push(blankSampleItem()))}>
          <Icon name="plus" />Add sample
        </button>
      </div>

      {/* request, dispatch, follow-up */}
      <div style={card}>
        <p style={sect}>Request, dispatch &amp; follow-up</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 12 }}>
          {field("Requested", "date", { type: "date" })}
          <div>
            <span style={lbl}>Came from</span>
            <select style={inp} value={smp.source} onChange={(e) => setSample((x) => (x.source = e.target.value))}>
              {smp.source && !SAMPLE_SOURCES.includes(smp.source) && <option value={smp.source}>{smp.source}</option>}
              {SAMPLE_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <span style={lbl}>Sent by</span>
            <select style={inp} value={smp.dispatchMethod} onChange={(e) => setSample((x) => (x.dispatchMethod = e.target.value))}>
              <option value="">—</option>
              {smp.dispatchMethod && !SAMPLE_DISPATCH.includes(smp.dispatchMethod) && <option value={smp.dispatchMethod}>{smp.dispatchMethod}</option>}
              {SAMPLE_DISPATCH.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <span style={lbl}>Sent on</span>
            <input style={inp} type="date" value={smp.dispatchedDate}
              onChange={(e) => setSample((x) => {
                x.dispatchedDate = e.target.value;
                if (x.dispatchedDate && !x.followUpDate) x.followUpDate = addDays(x.dispatchedDate, SAMPLE_FOLLOWUP_DAYS);
              })} />
          </div>
          {field("Tracking ref", "trackingRef")}
          {field("Follow up on", "followUpDate", { type: "date" })}
          <div>
            <span style={lbl}>Followed up</span>
            <label style={{ display: "flex", alignItems: "center", gap: 8, height: 35, fontSize: 13.5, fontWeight: 700 }}>
              <input type="checkbox" checked={smp.followedUp}
                onChange={(e) => setSample((x) => { x.followedUp = e.target.checked; x.followedUpDate = e.target.checked ? x.followedUpDate || today() : ""; })} />
              {smp.followedUp ? (smp.followedUpDate ? prettyDate(smp.followedUpDate) : "Yes") : "Not yet"}
            </label>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          <div>
            <span style={lbl}>Their project</span>
            <textarea style={{ ...inp, resize: "vertical" }} rows={3} placeholder="e.g. ~30m² deck, raised, wants it fitted by spring; also asked about balustrade"
              value={smp.project} onChange={(e) => setSample((x) => (x.project = e.target.value))} />
          </div>
          <div>
            <span style={lbl}>Notes</span>
            <textarea style={{ ...inp, resize: "vertical" }} rows={3} placeholder="Follow-up calls, what they said, next steps…"
              value={smp.notes} onChange={(e) => setSample((x) => (x.notes = e.target.value))} />
          </div>
        </div>
      </div>
    </div>
  );
}
