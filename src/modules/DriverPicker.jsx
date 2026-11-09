// Admin / manager on a phone: open the driver app as any driver (yourself included), or the
// loading app for every van - for doing runs, loading, testing and fault finding.
import { DRIVERS } from "../lib/crmCore.js";
import { NAVY, GOLD } from "../lib/core.js";

export const phoneAppParams = () => {
  try {
    const q = new URLSearchParams(window.location.search);
    const app = q.get("app");
    if (app === "loading") return { app: "loading" };
    if (app === "driver" && q.get("driver")) return { app: "driver", driver: q.get("driver") };
  } catch (e) { /* */ }
  return null;
};

// installed app: reopen on the last driver / loading screen you picked ("Back to the office" clears it)
export const LAST_APP = "dk-phone-app";
export const resumePhoneApp = () => {
  try {
    if (window.location.search) return;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    const last = localStorage.getItem(LAST_APP);
    if (standalone && last) window.location.replace(window.location.pathname + "?" + last);
  } catch (e) { /* */ }
};
export const openPhoneApp = (app, driver) => {
  const q = new URLSearchParams();
  if (app) { q.set("app", app); if (driver) q.set("driver", driver); }
  const s = q.toString();
  try { if (s) localStorage.setItem(LAST_APP, s); else localStorage.removeItem(LAST_APP); } catch (e) { /* */ }
  window.location.href = window.location.pathname + (s ? "?" + s : "");
};

export default function DriverPicker({ crm, myName, current, onClose }) {
  const seen = new Set();
  const names = [];
  const add = (n) => { const k = String(n || "").trim(); if (k && !seen.has(k.toLowerCase())) { seen.add(k.toLowerCase()); names.push(k); } };
  if (myName) add(myName);
  DRIVERS.forEach(add);
  ((crm && crm.invoices) || []).forEach((i) => add(i.driver));
  ((crm && crm.collections) || []).forEach((c) => add(c.driver));
  const isMe = (n) => myName && n.toLowerCase() === String(myName).toLowerCase();
  const cur = (app, d) => current && current.app === app && (!d || String(current.driver || "").toLowerCase() === d.toLowerCase());
  const row = (key, on, icon, title, sub, go) => (
    <button key={key} type="button" onClick={go}
      style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", textAlign: "left", fontFamily: "inherit", color: NAVY, padding: "13px 14px", marginBottom: 8, borderRadius: 12, border: "1px solid " + (on ? GOLD : "#e6e9ef"), background: on ? "#fff6dd" : "#fff", cursor: "pointer" }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <span style={{ flex: 1 }}><b style={{ fontSize: 16 }}>{title}</b><span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#5a6a85" }}>{sub}</span></span>
      {on && <b style={{ color: "#8a5a00", fontSize: 12 }}>NOW</b>}
    </button>
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(11,31,63,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: "Quicksand, sans-serif" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#f3f5f8", width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto", borderRadius: "18px 18px 0 0", padding: "18px 14px 26px", boxSizing: "border-box" }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: NAVY, margin: "0 2px 4px" }}>Phone apps</div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5a6a85", margin: "0 2px 12px" }}>Open the driver screen as anyone, or load the vans. Anything you confirm is recorded under your login.</div>
        {row("load", cur("loading"), "📦", "Loading", "Every van, any day", () => openPhoneApp("loading"))}
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: "#8593a8", margin: "10px 2px 6px" }}>Driver screen as…</div>
        {names.map((n) => row("d" + n, cur("driver", n), "🚚", n + (isMe(n) ? " (me)" : ""), isMe(n) ? "Your own runs" : "See exactly what " + n + " sees", () => openPhoneApp("driver", n)))}
        {current && row("office", false, "🏠", "Back to the office system", "The full ops screens", () => openPhoneApp(null))}
        <button type="button" onClick={onClose} style={{ width: "100%", marginTop: 6, border: "1px solid #d5d9e0", background: "#fff", borderRadius: 12, padding: 12, fontFamily: "inherit", fontWeight: 700, color: "#5a6a85", cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}
