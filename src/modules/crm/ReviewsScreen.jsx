// Reviews & Photos: the after-delivery pipeline worked as one list — ask for
// the review, log it arriving, chase photos, mark the social post. The same
// five flags as the schedule's follow-up icons, so ticking here shows there.
import { useState, useMemo } from "react";
import { NAVY, GOLD, prettyDate, daysBetween } from "../../lib/core.js";
import { FOLLOWUP_FLAGS, today, isSaleInvoice, onSchedule } from "../../lib/crmCore.js";
import { Icon, Tg, card, ListHero, HeroStat, SearchBox, FilterPills } from "./ui.jsx";

const th = { fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap", textAlign: "left" };
const tdc = { padding: "7px 8px", borderBottom: "1px solid #f0f2f6", fontSize: 13, fontWeight: 600, verticalAlign: "middle" };

const PERIODS = [["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last 12 months"], ["all", "All time"]];
const FILTERS = ["To ask", "Awaiting review", "Review in", "Posted", "All"];

// where a job sits in the pipeline, from its follow-up flags
export const reviewStage = (i) => {
  const f = i.flags || {};
  if (f.socialPosted) return "Posted";
  if (f.reviewReceived) return "Review in";
  if (f.reviewRequested) return "Awaiting review";
  return "To ask";
};
const STAGE_TONES = { "To ask": "#C64545", "Awaiting review": "#E8912D", "Review in": "#2E7D4F", Posted: NAVY };

export default function ReviewsScreen({ crm, updateCrm, openInvoice, goCustomer }) {
  const [filter, setFilter] = useState("To ask");
  const [period, setPeriod] = useState("90");
  const [search, setSearch] = useState("");

  const custById = useMemo(() => { const m = {}; crm.customers.forEach((c) => (m[c.id] = c)); return m; }, [crm.customers]);
  const siteById = useMemo(() => { const m = {}; crm.sites.forEach((s) => (m[s.id] = s)); return m; }, [crm.sites]);

  const setFlag = (invId, k) =>
    updateCrm((c) => {
      const t = c.invoices.find((i) => i.id === invId);
      if (!t) return c;
      if (!t.flags) t.flags = {};
      t.flags[k] = !t.flags[k];
      return c;
    });

  // the pool: delivered sales (what a review can be asked for), newest delivery first
  const tod = today();
  const since = period === "all" ? "" : new Date(Date.now() - Number(period) * 86400000).toISOString().slice(0, 10);
  const pool = useMemo(
    () =>
      crm.invoices
        .filter((i) => i.deliveryCompleted && isSaleInvoice(i) && onSchedule(i, crm))
        .filter((i) => !since || (i.deliveryDate || i.invDate || "") >= since)
        .sort((a, b) => String(b.deliveryDate || b.invDate || "").localeCompare(String(a.deliveryDate || a.invDate || ""))),
    [crm, since]
  );

  const counts = useMemo(() => {
    const n = { All: pool.length };
    FILTERS.slice(0, 4).forEach((f) => (n[f] = 0));
    pool.forEach((i) => n[reviewStage(i)]++);
    return n;
  }, [pool]);
  const photosAsked = useMemo(() => pool.filter((i) => (i.flags || {}).photosRequested).length, [pool]);
  const toPost = useMemo(() => pool.filter((i) => (i.flags || {}).reviewReceived && !(i.flags || {}).socialPosted).length, [pool]);

  const q = search.trim().toLowerCase();
  const rows = pool.filter((i) => {
    if (filter !== "All" && reviewStage(i) !== filter) return false;
    if (q) {
      const c = custById[i.customerId], s = siteById[i.siteId];
      const hay = [String(i.invNo || ""), c && c.name, c && c.postcode, s && s.postcode, s && s.name].map((v) => String(v || "").toLowerCase());
      if (!hay.some((v) => v.includes(q))) return false;
    }
    return true;
  });

  const pillBadge = (f) => STAGE_TONES[f] || "#8593a8";

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "18px 22px" }}>
      <ListHero
        title="Reviews & Photos"
        sub="Every delivered job, from review asked through to the social post — tick off here or on the schedule, it's the same flags"
      >
        <HeroStat label="To ask" value={counts["To ask"]} sub="Delivered, not asked yet" tone={counts["To ask"] ? "#f2a6b1" : GOLD} onClick={() => setFilter("To ask")} />
        <HeroStat label="Awaiting review" value={counts["Awaiting review"]} sub="Asked — nothing in yet" onClick={() => setFilter("Awaiting review")} />
        <HeroStat label="Reviews in" value={counts["Review in"] + counts["Posted"]} sub={pool.length ? Math.round(((counts["Review in"] + counts["Posted"]) / pool.length) * 100) + "% of delivered jobs" : "—"} onClick={() => setFilter("Review in")} />
        <HeroStat label="Photos asked" value={photosAsked} sub="Customer photos requested" />
        <HeroStat label="To post" value={toPost} sub="Review in, no social post yet" tone={toPost ? "#f2c66d" : GOLD} onClick={() => setFilter("Review in")} />
      </ListHero>

      <div style={card}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Search name, invoice #, postcode…" />
          <FilterPills options={FILTERS} value={filter} onPick={setFilter} counts={counts} badge={pillBadge} />
          <span style={{ flex: 1 }} />
          <select value={period} onChange={(e) => setPeriod(e.target.value)}
            style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "7px 10px", borderRadius: 9, border: "1px solid #d5d9e0", background: "#fff", color: "#5a6a85", cursor: "pointer" }}>
            {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 940 }}>
            <thead>
              <tr>
                <th style={th}>Invoice</th>
                <th style={th}>Customer</th>
                <th style={th}>Postcode</th>
                <th style={th}>Delivered</th>
                <th style={{ ...th, textAlign: "right" }}>Days</th>
                {FOLLOWUP_FLAGS.map(([k, label]) => (
                  <th key={k} style={{ ...th, textAlign: "center" }}>{label.replace(" requested", " asked").replace(" created", "").replace(" followed up", "")}</th>
                ))}
                <th style={th}>Status</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const c = custById[i.customerId], s = siteById[i.siteId];
                const del = i.deliveryDate || i.invDate || "";
                const days = del ? daysBetween(del, tod) : null;
                const st = reviewStage(i);
                return (
                  <tr key={i.id}>
                    <td style={tdc}>
                      <button onClick={() => openInvoice && openInvoice(i.id)} title="Open the invoice"
                        style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: NAVY, padding: 0, textDecoration: "underline", textDecorationColor: "#c8cfdb" }}>
                        #{i.invNo || "—"}
                      </button>
                    </td>
                    <td style={{ ...tdc, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <button onClick={() => goCustomer && goCustomer(i.customerId)} title="Open the customer account"
                        style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "#1a2b4a", padding: 0 }}>
                        {(c && c.name) || "—"}
                      </button>
                    </td>
                    <td style={{ ...tdc, whiteSpace: "nowrap" }}>{(s && s.postcode) || (c && c.postcode) || ""}</td>
                    <td style={{ ...tdc, whiteSpace: "nowrap" }}>{del ? prettyDate(del) : "—"}</td>
                    <td style={{ ...tdc, textAlign: "right", color: days > 28 && st === "To ask" ? "#C64545" : "#5a6a85" }}>{days === null ? "—" : days}</td>
                    {FOLLOWUP_FLAGS.map(([k, label, icon]) => (
                      <td key={k} style={{ ...tdc, textAlign: "center" }}>
                        <Tg on={(i.flags || {})[k]} title={label} icon={icon} onClick={() => setFlag(i.id, k)} />
                      </td>
                    ))}
                    <td style={tdc}>
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: "#fff", background: STAGE_TONES[st], borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{st}</span>
                    </td>
                    <td style={{ ...tdc, textAlign: "right" }}>
                      <button onClick={() => openInvoice && openInvoice(i.id)} title="Open the invoice"
                        style={{ border: "none", background: "transparent", cursor: "pointer", padding: 2, lineHeight: 0 }}>
                        <Icon name="chevright" size={14} stroke="#8fa0c0" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={12} style={{ ...tdc, textAlign: "center", color: "#8593a8", padding: 26 }}>
                  {pool.length ? "Nothing in this view — try another filter or a longer period." : "No delivered jobs in this period yet."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ height: 30 }} />
    </div>
  );
}
