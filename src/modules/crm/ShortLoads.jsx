// Short loads: a loading report closed with items missing from the van. Works like a delivery
// issue - a big alert on admin desktops, then a live entry on Delivery issues until the office
// raises a follow-up job for the missing parts, marks them posted, or marks it sorted.
import { useEffect, useState } from "react";
import { NAVY, RED, prettyDateTime } from "../../lib/core.js";
import { Modal, Chip, btn, goldBtn, inp, lbl, sect } from "./ui.jsx";
import { loadShortLoads, updateReport, loadPhotoUrl } from "../../data/loading.js";

const dayLabel = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "");
const short = (e) => String(e || "").split("@")[0];

// a short load, grouped by job: { jobs: [{ invId, invNo, customer, items, fu, sorted }], live, auto }
export function shortIssueOf(rep, crm) {
  const m = new Map();
  (rep.shortLines || []).forEach((x) => {
    if (!m.has(x.invId)) m.set(x.invId, { invId: x.invId, invNo: x.invNo, customer: x.customer, items: [] });
    m.get(x.invId).items.push(x);
  });
  const jobs = [...m.values()].map((j) => {
    const no = (rep.followups || {})[j.invId];
    const fu = no ? (crm.invoices || []).find((x) => String(x.invNo) === String(no)) : null;
    const inv = (crm.invoices || []).find((x) => x.id === j.invId);
    return { ...j, inv, fu, followNo: no || "", sorted: !!(fu && fu.deliveryCompleted) };
  });
  const auto = jobs.length > 0 && jobs.every((j) => j.sorted);
  return { jobs, auto, live: jobs.length > 0 && !rep.resolvedAt && !auto, count: (rep.shortLines || []).reduce((t, x) => t + (Number(x.missing) || 0), 0) };
}

export function useShortLoads({ enabled, alertsOn, me }) {
  const [reps, setReps] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const pull = () => loadShortLoads().then((l) => live && setReps(l)).catch(() => {});
    const first = setTimeout(pull, 2500);
    const t = setInterval(pull, 60000);
    return () => { live = false; clearTimeout(first); clearInterval(t); };
  }, [enabled, tick]);
  const patch = async (rep, p, local) => {
    setReps((l) => (l || []).map((r) => (r.id === rep.id ? { ...r, ...local } : r)));
    try { await updateReport(rep.id, p); } finally { setTick((n) => n + 1); }
  };
  const list = reps || [];
  return {
    reports: list,
    loaded: !!reps,
    alerts: alertsOn ? list.filter((r) => r.alertState === "open").sort((a, b) => String(a.completedAt).localeCompare(String(b.completedAt))) : [],
    refresh: () => setTick((n) => n + 1),
    dismiss: (rep) => patch(rep, { alert_state: "dismissed" }, { alertState: "dismissed" }),
    followedUp: (rep, invId, invNo) => {
      const f = { ...(rep.followups || {}), [invId]: String(invNo) };
      return patch(rep, { followups: f, alert_state: "followup" }, { followups: f, alertState: "followup" });
    },
    resolve: (rep, resolution) => {
      const at = new Date().toISOString();
      return patch(rep, { resolved_at: at, resolved_by: me || "office", resolution: resolution || "", alert_state: "dismissed" }, { resolvedAt: at, resolvedBy: me || "office", resolution: resolution || "", alertState: "dismissed" });
    },
    reopen: (rep) => patch(rep, { resolved_at: "", resolved_by: "", resolution: "" }, { resolvedAt: "", resolvedBy: "", resolution: "" }),
  };
}

function Photos({ rep, height = 200 }) {
  const [urls, setUrls] = useState({});
  const paths = rep.photoPaths || [];
  useEffect(() => { paths.forEach((p) => loadPhotoUrl(p).then((u) => setUrls((m) => ({ ...m, [p]: u }))).catch(() => {})); }, [rep.id, paths.length]);
  if (!paths.length) return <div style={{ height: 80, borderRadius: 10, background: "#f4f6f9", display: "flex", alignItems: "center", justifyContent: "center", color: "#8593a8", fontWeight: 700, fontSize: 13 }}>No photos</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: paths.length === 1 ? "1fr" : "1fr 1fr", gap: 6 }}>
      {paths.map((p) => <a key={p} href={urls[p]} target="_blank" rel="noopener noreferrer" style={{ display: "block", height: paths.length === 1 ? height : height / 2, borderRadius: 10, overflow: "hidden", background: "#f4f6f9" }}>{urls[p] && <img src={urls[p]} alt="Loaded van" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}</a>)}
    </div>
  );
}

const JobBlock = ({ j, canEdit, onFollowUp, onOpenJob }) => (
  <div style={{ marginTop: 10, border: "1px solid " + (j.sorted ? "#bfe3ca" : "#f4b9c1"), background: j.sorted ? "#f1faf4" : "#fdf3f4", borderRadius: 10, padding: "8px 12px" }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <b style={{ flex: 1, fontSize: 14, color: NAVY }}>{j.customer} <span style={{ color: "#8593a8", fontSize: 12 }}>#{j.invNo}</span></b>
      {j.inv && onOpenJob && <button style={{ ...btn, padding: "4px 10px", fontSize: 12 }} onClick={() => onOpenJob(j.inv.id)}>Open job</button>}
      {j.fu ? <button style={{ ...btn, padding: "4px 10px", fontSize: 12, color: j.sorted ? "#28713e" : NAVY }} onClick={() => onOpenJob && onOpenJob(j.fu.id)}>{j.sorted ? "✓ " : ""}Follow-up #{j.fu.invNo}{j.sorted ? " delivered" : j.fu.deliveryDate ? " · " + dayLabel(j.fu.deliveryDate) : " · no date yet"}</button>
        : canEdit && j.inv && onFollowUp && <button style={{ ...goldBtn, color: NAVY, padding: "4px 10px", fontSize: 12 }} onClick={() => onFollowUp(j)}>Raise follow-up job</button>}
    </div>
    {j.items.map((x, k) => (
      <div key={k} style={{ display: "flex", gap: 8, fontSize: 13.5, padding: "3px 0", color: NAVY }}>
        <b style={{ minWidth: 40, textAlign: "right", color: "#9b1c2e" }}>{x.missing}×</b>
        <span style={{ flex: 1 }}>{x.text}{x.colour ? " · " + x.colour : ""}</span>
        <span style={{ fontSize: 12, color: "#5a6a85", fontWeight: 700 }}>{x.why}{x.loaded ? " (" + x.loaded + " of " + x.qty + " on)" : ""}</span>
      </div>
    ))}
  </div>
);

// the pop-up, like the delivery alert
export function ShortLoadAlert({ alerts, crm, onDismiss, onFollowUp, onOpenJob, onOpenLoading }) {
  if (!alerts.length || !crm) return null;
  const rep = alerts[0];
  const x = shortIssueOf(rep, crm);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(11,31,63,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="alertdialog" aria-label="Van went out short"
        style={{ width: "min(600px, 94vw)", minHeight: "min(600px, 90vh)", maxHeight: "92vh", background: "#fff", borderRadius: 18, boxShadow: "0 24px 70px rgba(0,0,0,.35)", display: "flex", flexDirection: "column", overflow: "hidden", borderTop: "10px solid #C8102E" }}>
        <div style={{ textAlign: "center", padding: "22px 24px 10px" }}>
          <div style={{ fontSize: 54, lineHeight: 1 }}>🚚</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#C8102E", marginTop: 8 }}>Van loaded short · {rep.van || "No van"}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#5a6a85", marginTop: 4 }}>{rep.driver}{rep.runNo ? " · Run " + rep.runNo : ""} · {dayLabel(rep.date)} · closed by {short(rep.completedBy)} {prettyDateTime(rep.completedAt)}</div>
          {alerts.length > 1 && <div style={{ fontSize: 12.5, fontWeight: 700, color: "#8593a8", marginTop: 4 }}>1 of {alerts.length} alerts</div>}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 26px 6px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: "#9b1c2e", textTransform: "uppercase" }}>{x.count} item{x.count === 1 ? "" : "s"} not on the van</div>
          {x.jobs.map((j) => <JobBlock key={j.invId} j={j} canEdit onFollowUp={(jj) => onFollowUp(rep, jj)} />)}
          {rep.notes && (
            <div style={{ marginTop: 10, background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 10, padding: "8px 12px", fontSize: 13.5, fontWeight: 600, color: "#6b5305" }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 3 }}>Why it went short</div>
              {rep.notes}
            </div>
          )}
          <div style={{ marginTop: 10 }}><Photos rep={rep} height={220} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", padding: "14px 24px 20px", borderTop: "1px solid #eef1f6" }}>
          <button style={{ ...btn, padding: "11px 18px", fontSize: 14.5 }} onClick={() => onOpenLoading(rep)}>Open loading</button>
          {x.jobs.length === 1 && x.jobs[0].inv && <button style={{ ...btn, padding: "11px 18px", fontSize: 14.5 }} onClick={() => onOpenJob(x.jobs[0].inv.id)}>Open job</button>}
          <span style={{ flex: 1 }} />
          <button style={{ ...btn, padding: "11px 18px", fontSize: 14.5 }} onClick={() => onDismiss(rep)} title="Closes this pop-up — the short load stays live in Delivery issues until it's sorted">Dismiss</button>
          {x.jobs.length === 1 && x.jobs[0].inv && !x.jobs[0].fu && <button style={{ ...goldBtn, color: NAVY, padding: "11px 18px", fontSize: 14.5 }} onClick={() => onFollowUp(rep, x.jobs[0])}>Raise follow-up job</button>}
        </div>
      </div>
    </div>
  );
}

// the page from Delivery issues
export function ShortLoadPage({ crm, rep, canEdit, onClose, onFollowUp, onResolve, onReopen, onOpenJob }) {
  const x = shortIssueOf(rep, crm);
  const [mode, setMode] = useState("posted");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const go = async (fn) => { setBusy(true); setMsg(""); try { await fn(); onClose(); } catch (e) { setMsg("Couldn't save — " + ((e && e.message) || e) + (/column/.test(String(e && e.message)) ? ". Run driver-app-all.sql in Supabase." : "")); } setBusy(false); };
  return (
    <Modal title={<span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>Short load · {rep.van || "No van"} <Chip>{rep.driver}{rep.runNo ? " · Run " + rep.runNo : ""}</Chip>{x.live ? <Chip tone="red">LIVE</Chip> : <Chip tone="green">Sorted</Chip>}</span>} onClose={onClose} width={860} z={80}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)", gap: 18 }}>
        <div>
          <Photos rep={rep} height={320} />
          <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: "#5a6a85" }}>Run on {dayLabel(rep.date)} · loading closed by {short(rep.completedBy)} · {prettyDateTime(rep.completedAt)}</div>
          {rep.notes && <div style={{ marginTop: 8, background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontWeight: 600, color: "#6b5305" }}><b>Why it went short:</b> {rep.notes}</div>}
        </div>
        <div>
          <p style={sect}>Missing from the van</p>
          {x.jobs.map((j) => <JobBlock key={j.invId} j={j} canEdit={canEdit} onFollowUp={(jj) => { onClose(); onFollowUp(rep, jj); }} onOpenJob={(id) => { onClose(); onOpenJob(id); }} />)}
          <div style={{ fontSize: 12, color: "#8593a8", fontWeight: 600, marginTop: 8 }}>Sorts itself once every follow-up job is delivered — or mark it posted / sorted below.</div>
          {rep.resolvedAt && <div style={{ marginTop: 10, background: "#f1faf4", border: "1px solid #bfe3ca", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700, color: "#28713e" }}>Sorted by {short(rep.resolvedBy)} · {prettyDateTime(rep.resolvedAt)}{rep.resolution ? " — " + rep.resolution : ""}</div>}
          {x.live && canEdit && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", gap: 6 }}>
                {[["posted", "📮 Posted the parts"], ["sorted", "✓ Sorted another way"]].map(([k, l]) => (
                  <button key={k} onClick={() => setMode(k)} style={{ ...btn, padding: "6px 12px", fontSize: 12.5, background: mode === k ? NAVY : "#fff", color: mode === k ? "#fff" : NAVY, borderColor: mode === k ? NAVY : "#d5d9e0" }}>{l}</button>
                ))}
              </div>
              <span style={lbl}>{mode === "posted" ? "Courier / tracking number (optional)" : "How was it sorted? (optional)"}</span>
              <input style={inp} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "posted" ? "e.g. Royal Mail AB123456789GB" : "e.g. customer collected from the yard"} />
            </div>
          )}
        </div>
      </div>
      {msg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: RED }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <span style={{ flex: 1 }} />
        {canEdit && (x.live
          ? <button style={{ ...btn, background: "#28713e", borderColor: "#28713e", color: "#fff" }} disabled={busy} onClick={() => go(() => onResolve(rep, mode === "posted" ? "Posted" + (note.trim() ? " · " + note.trim() : "") : note.trim()))}>{busy ? "Saving…" : mode === "posted" ? "📮 Mark posted" : "✓ Mark sorted"}</button>
          : rep.resolvedAt && <button style={btn} disabled={busy} onClick={() => go(() => onReopen(rep))}>Make live again</button>)}
        <button style={{ ...goldBtn, color: NAVY }} onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
