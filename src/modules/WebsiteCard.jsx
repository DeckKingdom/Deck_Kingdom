// Home screen: live website visitors and the headline Google Analytics numbers.
import { useEffect, useState } from "react";
import { NAVY, GOLD, RED } from "../lib/core.js";
import { gbp } from "../lib/crmCore.js";
import { card, sect, lbl } from "./crm/ui.jsx";
import { fetchGaStats } from "../data/analytics.js";

const GREEN = "#2f8f4e";
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("en-GB");
const pct = (n) => Math.round((Number(n) || 0) * 100) + "%";
const change = (now, before) => {
  if (!before) return null;
  const d = (now - before) / before;
  return { up: d >= 0, text: (d >= 0 ? "▲ " : "▼ ") + Math.abs(Math.round(d * 100)) + "%" };
};
const cleanTitle = (t) => String(t || "").replace(/\s*[-|–]\s*Deck Kingdom.*$/i, "") || t;
const dayLabel = (d) => {
  const dt = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
};

// single-series bars, baseline-anchored, rounded data end, hover tooltip
function Bars({ values, labels, height = 54, highlightLast, unit }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...values);
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }} onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => (
          <div key={i} onMouseEnter={() => setHover(i)} style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", cursor: "default" }}>
            <div style={{ width: "100%", height: Math.max(v ? 3 : 1, (v / max) * height), borderRadius: "4px 4px 0 0",
              background: hover === i ? GOLD : highlightLast && i === values.length - 1 ? GOLD : v ? NAVY : "#dde2ea" }} />
          </div>
        ))}
      </div>
      {hover !== null && (
        <div style={{ position: "absolute", bottom: height + 6, left: `clamp(0px, calc(${((hover + 0.5) / values.length) * 100}% - 60px), calc(100% - 120px))`, width: 120, textAlign: "center",
          background: NAVY, color: "#fff", borderRadius: 8, padding: "4px 6px", fontSize: 11.5, fontWeight: 700, pointerEvents: "none", zIndex: 5 }}>
          {labels[hover]}<br /><span style={{ color: GOLD }}>{fmt(values[hover])} {values[hover] === 1 ? unit.replace(/s$/, "") : unit}</span>
        </div>
      )}
    </div>
  );
}

const Tile = ({ label, value, sub, subTone }) => (
  <div style={{ border: "1px solid #e6e9ef", borderRadius: 12, padding: "9px 12px" }}>
    <span style={{ ...lbl, marginBottom: 2 }}>{label}</span>
    <b style={{ fontSize: 18, color: NAVY, display: "block" }}>{value}</b>
    {sub && <div style={{ fontSize: 11.5, fontWeight: 700, color: subTone || "#8593a8", marginTop: 1 }}>{sub}</div>}
  </div>
);

const ListBars = ({ items, valueKey, unit }) => {
  const max = Math.max(1, ...items.map((x) => x[valueKey]));
  return items.map((x) => (
    <div key={x.name} title={fmt(x[valueKey]) + " " + unit} style={{ display: "grid", gridTemplateColumns: "1fr 46px", gap: 8, alignItems: "center", fontSize: 12.5, fontWeight: 600, padding: "3px 0" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</div>
        <div style={{ height: 5, background: "#eef0f4", borderRadius: 999, marginTop: 3 }}>
          <div style={{ width: (x[valueKey] / max) * 100 + "%", height: "100%", background: NAVY, borderRadius: 999 }} />
        </div>
      </div>
      <span style={{ textAlign: "right", color: "#5a6a85", fontWeight: 700 }}>{fmt(x[valueKey])}</span>
    </div>
  ));
};

export default function WebsiteCard() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [more, setMore] = useState(() => { try { return localStorage.getItem("dk-web-more") === "1"; } catch { return false; } });

  useEffect(() => {
    let live = true, timer = null;
    const load = () => {
      if (document.hidden) return;
      fetchGaStats().then((x) => { if (live) { setD(x); setErr(null); } })
        .catch((e) => { if (live) setErr({ msg: e.message, setup: !!e.setup }); });
    };
    load();
    timer = setInterval(load, 60_000);
    const vis = () => !document.hidden && load();
    document.addEventListener("visibilitychange", vis);
    return () => { live = false; clearInterval(timer); document.removeEventListener("visibilitychange", vis); };
  }, []);
  const toggleMore = () => setMore((m) => { try { localStorage.setItem("dk-web-more", m ? "0" : "1"); } catch {} return !m; });

  const head = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <p style={{ ...sect, margin: 0 }}>Website</p>
      {d && <span style={{ fontSize: 11, color: "#8593a8", fontWeight: 600 }}>updated {new Date(d.updated).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>}
      <span style={{ flex: 1 }} />
      {d && <button onClick={toggleMore} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#185FA5", padding: 0 }}>{more ? "Less ▾" : "More ▸"}</button>}
    </div>
  );

  if (err && !d) return (
    <div style={card}>{head}
      <div style={{ fontSize: 12.5, fontWeight: 600, color: err.setup ? "#6b5305" : "#9b1c2e", background: err.setup ? "#fff8e6" : "#fdecef", border: "1px solid " + (err.setup ? "#f4d78f" : "#f3c2cb"), borderRadius: 8, padding: "8px 11px" }}>{err.msg}</div>
    </div>
  );
  if (!d) return <div style={card}>{head}<div style={{ fontSize: 13, color: "#8593a8", fontWeight: 600 }}>Loading Google Analytics…</div></div>;

  const s = d.summary || {};
  const T = s.today || {}, Y = s.yesterday || {}, W = s.last7 || {}, P = s.prev7 || {};
  const cWeek = change(W.activeUsers, P.activeUsers);
  const f = d.funnel || {};
  const steps = [["view_item", "Viewed a product"], ["add_to_cart", "Added to basket"], ["begin_checkout", "Started checkout"], ["purchase", "Ordered"]];
  const devices = (d.live.devices || []).map((x) => fmt(x.users) + " " + x.name).join(" · ");

  return (
    <div style={card}>
      {head}
      {/* live */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "end", marginBottom: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: GREEN, boxShadow: "0 0 0 3px " + GREEN + "33", animation: "dkpulse 2s infinite" }} />
            <span style={{ ...lbl, marginBottom: 0 }}>On the site now</span>
          </div>
          <b style={{ fontSize: 34, color: NAVY, lineHeight: 1.1, display: "block" }}>{fmt(d.live.active)}</b>
          <div style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600 }}>{devices || "last 30 minutes"}</div>
        </div>
        <div>
          <Bars values={d.live.byMinute} unit="visitors" height={46}
            labels={d.live.byMinute.map((_, i) => (29 - i === 0 ? "This minute" : 29 - i + " min ago"))} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#8593a8", fontWeight: 600, marginTop: 3 }}><span>30 min ago</span><span>now</span></div>
        </div>
      </div>
      {d.live.pages.length > 0 && (
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5a6a85", marginBottom: 12 }}>
          {d.live.pages.slice(0, 3).map((p) => (
            <div key={p.name} style={{ display: "flex", gap: 8, padding: "2px 0" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, color: NAVY }}>{cleanTitle(p.name)}</span>
              <b style={{ color: NAVY }}>{fmt(p.users)}</b>
            </div>
          ))}
        </div>
      )}

      {/* today / week */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 12 }}>
        <Tile label="Visitors today" value={fmt(T.activeUsers)} sub={"yesterday " + fmt(Y.activeUsers)} />
        <Tile label="Page views today" value={fmt(T.screenPageViews)} sub={pct(T.engagementRate) + " engaged"} />
        <Tile label="Web orders today" value={fmt(T.ecommercePurchases)} sub={gbp(T.purchaseRevenue || 0)} />
        <Tile label="Visitors · 7 days" value={fmt(W.activeUsers)} sub={cWeek ? cWeek.text + " vs week before" : ""} subTone={cWeek ? (cWeek.up ? GREEN : RED) : undefined} />
      </div>

      {/* 28 days */}
      {d.daily.length > 0 && (
        <div>
          <span style={{ ...lbl, marginBottom: 6 }}>Visitors per day · last 4 weeks</span>
          <Bars values={d.daily.map((x) => x.users)} labels={d.daily.map((x) => dayLabel(x.date))} unit="visitors" height={60} highlightLast />
        </div>
      )}

      {more && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 14, paddingTop: 12, borderTop: "1px solid #f0f2f6" }}>
          <div>
            <span style={{ ...lbl, marginBottom: 6 }}>Shop funnel · 7 days</span>
            {steps.map(([k, l], i) => {
              const v = f[k] || 0, prev = i ? f[steps[i - 1][0]] || 0 : 0;
              return (
                <div key={k} style={{ display: "flex", gap: 8, fontSize: 12.5, fontWeight: 600, padding: "3px 0", color: NAVY }}>
                  <span style={{ flex: 1 }}>{l}</span>
                  {i > 0 && <span style={{ color: "#8593a8" }}>{prev ? Math.round((v / prev) * 100) + "%" : "—"}</span>}
                  <b style={{ width: 46, textAlign: "right" }}>{fmt(v)}</b>
                </div>
              );
            })}
            <div style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, marginTop: 4 }}>{fmt(W.ecommercePurchases)} orders · {gbp(W.purchaseRevenue || 0)} this week</div>
          </div>
          <div>
            <span style={{ ...lbl, marginBottom: 6 }}>Where visits came from · 7 days</span>
            <ListBars items={d.channels} valueKey="sessions" unit="visits" />
          </div>
          <div>
            <span style={{ ...lbl, marginBottom: 6 }}>Top pages · 7 days</span>
            <ListBars items={d.pages.map((p) => ({ name: p.title && p.title !== "(not set)" ? cleanTitle(p.title) : p.path, views: p.views }))} valueKey="views" unit="views" />
          </div>
          <div>
            <span style={{ ...lbl, marginBottom: 6 }}>Top towns · 7 days</span>
            <ListBars items={d.cities} valueKey="users" unit="visitors" />
            {d.devices.length > 0 && (
              <div style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, marginTop: 6 }}>
                {(() => { const t = d.devices.reduce((a, x) => a + x.sessions, 0) || 1; return d.devices.map((x) => Math.round((x.sessions / t) * 100) + "% " + x.name).join(" · "); })()}
              </div>
            )}
          </div>
        </div>
      )}
      {err && <div style={{ fontSize: 11.5, color: "#9b1c2e", fontWeight: 600, marginTop: 8 }}>Couldn't refresh: {err.msg}</div>}
      <style>{"@keyframes dkpulse{0%{box-shadow:0 0 0 0 #2f8f4e66}70%{box-shadow:0 0 0 7px #2f8f4e00}100%{box-shadow:0 0 0 0 #2f8f4e00}}"}</style>
    </div>
  );
}
