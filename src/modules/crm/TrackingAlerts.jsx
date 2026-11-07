// Driver-tracking alerts as a pop-up - only on the desktop of the login named in the tracking
// rates ("Pop-up alerts go to"). Checks the last 7 days every 15 minutes; each alert shows once
// until it's dismissed on that computer.
import { useEffect, useRef, useState } from "react";
import { loadTracking, workOut } from "../../data/trackingData.js";
import { refreshFuelPrice } from "../../data/fleetApi.js";
import { NAVY, RED } from "../../lib/core.js";
import { Modal, btn, goldBtn } from "./ui.jsx";

const SEEN = "dk-track-seen";
const idOf = (a) => { let h = 0; const t = (a.date || "") + "|" + a.text; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return String(h); };
const seen = () => { try { return JSON.parse(localStorage.getItem(SEEN) || "{}"); } catch (e) { return {}; } };

export function useTrackingAlerts({ crm, enabled }) {
  const crmRef = useRef(crm);
  crmRef.current = crm;
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const run = async () => {
      const c = crmRef.current;
      if (!c) return;
      try {
        await refreshFuelPrice();
        const t = new Date(), f = new Date(); f.setDate(f.getDate() - 7);
        const to = t.toISOString().slice(0, 10), from = f.toISOString().slice(0, 10);
        const data = await loadTracking(c, from, to);
        const { alerts } = workOut(c, data, from, to);
        const s = seen();
        if (live) setList(alerts.map((a) => ({ ...a, id: idOf(a) })).filter((a) => !s[a.id]));
      } catch (e) { /* tables not there yet */ }
    };
    const first = setTimeout(run, 8000);
    const timer = setInterval(run, 15 * 60000);
    return () => { live = false; clearTimeout(first); clearInterval(timer); };
  }, [enabled]);
  const dismiss = (ids) => {
    const s = seen();
    ids.forEach((id) => (s[id] = Date.now()));
    try { localStorage.setItem(SEEN, JSON.stringify(s)); } catch (e) { /* */ }
    setList((l) => l.filter((a) => !ids.includes(a.id)));
  };
  return { alerts: enabled ? list : [], dismiss };
}

const dayLabel = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "");

export function TrackingAlertPop({ alerts, onDismiss, onOpen }) {
  if (!alerts.length) return null;
  return (
    <Modal title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 19 }}>🚚</span>Driver tracking — {alerts.length} new alert{alerts.length === 1 ? "" : "s"}</span>} onClose={() => onDismiss(alerts.map((a) => a.id))} width={620} z={115}>
      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        {alerts.map((a) => (
          <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 0", borderTop: "1px solid #f0f2f6", fontSize: 13.5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: a.tone === "red" ? RED : "#E8912D", marginTop: 6, flex: "none" }} />
            <span style={{ flex: 1, color: NAVY, fontWeight: 600 }}>{a.date && <b style={{ color: "#5a6a85", marginRight: 6 }}>{dayLabel(a.date)}{a.driver ? " · " + a.driver : ""}</b>}{a.text}</span>
            <button onClick={() => onDismiss([a.id])} title="Dismiss this one" style={{ border: "none", background: "none", color: "#8593a8", cursor: "pointer", fontSize: 15 }}>×</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button style={btn} onClick={() => onDismiss(alerts.map((a) => a.id))}>Dismiss all</button>
        <button style={{ ...goldBtn, color: NAVY }} onClick={() => { onDismiss(alerts.map((a) => a.id)); onOpen(); }}>Open driver tracking</button>
      </div>
    </Modal>
  );
}
