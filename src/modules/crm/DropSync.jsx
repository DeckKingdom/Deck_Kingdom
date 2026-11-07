// Runs in the office app.
// 1. Closes jobs / pick-ups the drivers have confirmed (job marked delivered - stock out as usual,
//    anything not delivered goes back into stock; pick-up marked collected). Each confirmation is
//    applied once, so un-ticking a job afterwards sticks.
// 2. If something was left over, or the driver wrote a note, an alert pops up on every office
//    screen until someone dismisses it or raises a follow-up job.
import { useEffect, useRef, useState } from "react";
import { loadDrops, dropLeft, dropNeedsLook, payMissed, updateDrops, dropPhotoUrl } from "../../data/drops.js";
import { applyInvoiceStockDeduction, explodeInvoiceLines, blankMovement, today, gbp } from "../../lib/crmCore.js";
import { addDays, NAVY, GOLD, RED, prettyDateTime } from "../../lib/core.js";
import { Modal, btn, goldBtn } from "./ui.jsx";

const DAYS_BACK = 14;

// the undelivered part of a job comes back on the van: put it back into stock
const returnLeftovers = (c, inv, left, actor) => {
  const lines = left.map((x) => {
    const l = (inv.lines || [])[x.lineIndex] || {};
    return { ...l, code: l.code || x.code || "", description: l.description || x.text || "", colour: l.colour || x.colour || "", qty: x.remaining };
  }).filter((l) => Number(l.qty) > 0);
  if (!lines.length) return;
  explodeInvoiceLines({ ...inv, lines }, c).forEach((r) => {
    if (r.kind === "kit" || !r.sku || !Number(r.qty)) return;
    const mp = (c.masterProducts || []).find((m) => (m.sku || "").trim().toLowerCase() === String(r.sku).trim().toLowerCase());
    if (!mp) return;
    const q = Number(r.qty);
    mp.stock = (mp.stock === "" || mp.stock === null ? 0 : Number(mp.stock)) + q;
    c.movements.push({ ...blankMovement(), sku: mp.sku, mpId: mp.id, qty: q, kind: "job", ref: "#" + (inv.invNo || "") + " not delivered", actor: actor || "" });
  });
};

export function useDropSync({ crm, updateCrm, me, enabled, alertsOn }) {
  const crmRef = useRef(crm), updRef = useRef(updateCrm);
  crmRef.current = crm; updRef.current = updateCrm;
  const [alerts, setAlerts] = useState([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true, busy = false;
    const run = async () => {
      if (!crmRef.current || busy) return;
      busy = true;
      try {
        const t = today();
        const dates = Array.from({ length: DAYS_BACK + 2 }, (_, n) => addDays(t, n - DAYS_BACK));
        const m = await loadDrops(dates);
        const all = Object.values(m);
        const todo = all.filter((r) => !r.appliedAt);
        if (live && todo.length) {
          updRef.current((c) => {
            todo.forEach((r) => {
              if (r.collectionId) {
                const col = (c.collections || []).find((x) => x.id === r.collectionId);
                if (col && !col.collected) col.collected = true;
              } else {
                const inv = (c.invoices || []).find((x) => x.id === r.invoiceId);
                // payment taken on the doorstep: the job shows paid, with how
                if (inv && r.payment && r.payment.collected && !inv.paymentDate) {
                  inv.paymentDate = String(r.at || new Date().toISOString()).slice(0, 10);
                  if (r.payment.method) inv.paymentType = r.payment.method;
                }
                if (inv && !inv.deliveryCompleted) {
                  inv.deliveryCompleted = true;
                  const actor = me || r.driver || "driver";
                  const was = !!inv.stockDeducted;
                  applyInvoiceStockDeduction(inv, c, true, actor);
                  if (!was && inv.stockDeducted) returnLeftovers(c, inv, dropLeft(r), actor);
                }
              }
            });
            return c;
          });
          const at = new Date().toISOString();
          const look = todo.filter(dropNeedsLook).map((r) => r.id);
          const plain = todo.filter((r) => !dropNeedsLook(r)).map((r) => r.id);
          await updateDrops(look, { applied_at: at, alert_state: "open" });
          await updateDrops(plain, { applied_at: at });
          todo.forEach((r) => { r.appliedAt = at; if (look.includes(r.id)) r.alertState = "open"; });
        }
        if (live) setAlerts(all.filter((r) => r.alertState === "open").sort((a, b) => String(a.at).localeCompare(String(b.at))));
      } catch (e) {
        /* table not there yet / offline: try again next time */
      } finally { busy = false; }
    };
    const first = setTimeout(run, 3000);
    const timer = setInterval(run, 60000);
    return () => { live = false; clearTimeout(first); clearInterval(timer); };
  }, [enabled, tick]);

  const close = async (r, patch) => {
    setAlerts((l) => l.filter((x) => x.id !== r.id));
    try { await updateDrops([r.id], patch); } catch (e) { setTick((n) => n + 1); }
  };
  return { alerts: alertsOn ? alerts : [], dismiss: (r) => close(r, { alert_state: "dismissed", alert_by: me || "office" }), followedUp: (r, invNo) => close(r, { alert_state: "followup", alert_by: me || "office", followup_inv_no: String(invNo || "") }) };
}

// the pop-up: one alert at a time, oldest first
export function DropAlert({ alerts, crm, onDismiss, onFollowUp, onOpenJob, onOpenCollection }) {
  const [photo, setPhoto] = useState({});
  if (!alerts.length || !crm) return null;
  const r = alerts[0];
  const pickup = !!r.collectionId;
  const inv = !pickup ? (crm.invoices || []).find((x) => x.id === r.invoiceId) : null;
  const col = pickup ? (crm.collections || []).find((x) => x.id === r.collectionId) : null;
  const cust = inv ? (crm.customers || []).find((x) => x.id === inv.customerId) : null;
  const left = dropLeft(r);
  const showPhoto = () => { if (!photo[r.id]) dropPhotoUrl(r.photoPath).then((u) => setPhoto((p) => ({ ...p, [r.id]: u }))).catch(() => setPhoto((p) => ({ ...p, [r.id]: "x" }))); };
  const title = pickup ? "Pick-up " + (left.length ? "short" : "note") + " · COL-" + (col ? col.collectionNo : "") + (col && col.supplier ? " " + col.supplier : "")
    : "Job closed " + (left.length ? "with items left over" : payMissed(r) ? "— payment not collected" : "with a driver's note") + " · #" + (r.invNo || (inv && inv.invNo) || "");
  return (
    <Modal title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 19 }}>{left.length || payMissed(r) ? "⚠️" : "📝"}</span>{title}</span>} onClose={() => onDismiss(r)} width={540} z={120}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#5a6a85" }}>
        {pickup ? (col ? col.supplier : "Supplier") : (cust ? cust.name : "Customer")} · {r.driver || "Driver"} · {prettyDateTime(r.at)}
        {alerts.length > 1 && <span style={{ float: "right", color: "#8593a8" }}>1 of {alerts.length}</span>}
      </div>
      {left.length > 0 && (
        <div style={{ marginTop: 10, border: "1px solid #f4b9c1", background: "#fdf3f4", borderRadius: 10, padding: "8px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: "#9b1c2e", textTransform: "uppercase", marginBottom: 4 }}>{pickup ? "Not collected" : "Still to deliver"}</div>
          {left.map((x, k) => (
            <div key={k} style={{ display: "flex", gap: 8, fontSize: 13.5, padding: "3px 0", color: NAVY }}>
              <b style={{ minWidth: 40, textAlign: "right", color: "#9b1c2e" }}>{x.remaining}×</b>
              <span style={{ flex: 1 }}>{x.text}{x.colour ? " · " + x.colour : ""}</span>
              <span style={{ fontSize: 12, color: "#5a6a85", fontWeight: 700 }}>{x.delivered} of {x.qty} {pickup ? "collected" : "dropped"}</span>
            </div>
          ))}
          {!pickup && <div style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, marginTop: 4 }}>What wasn't delivered has gone back into stock.</div>}
        </div>
      )}
      {!pickup && r.payment && Number(r.payment.owed) > 0 && (
        <div style={{ marginTop: 10, borderRadius: 10, padding: "8px 12px", fontSize: 13.5, fontWeight: 800, border: "1px solid " + (r.payment.collected ? "#bfe3ca" : "#f4b9c1"), background: r.payment.collected ? "#f1faf4" : "#fdf3f4", color: r.payment.collected ? "#28713e" : "#9b1c2e" }}>
          {r.payment.collected ? "✓ Payment of " + gbp(Number(r.payment.owed)) + " collected" + (r.payment.method ? " by " + r.payment.method.toLowerCase() : "") : "✗ Payment of " + gbp(Number(r.payment.owed)) + " NOT collected — still owed"}
        </div>
      )}
      {String(r.notes || "").trim() && (
        <div style={{ marginTop: 10, background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 10, padding: "8px 12px", fontSize: 13.5, fontWeight: 600, color: "#6b5305" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 3 }}>Driver's note</div>
          {r.notes}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        {photo[r.id] && photo[r.id] !== "x" ? <a href={photo[r.id]} target="_blank" rel="noopener noreferrer"><img src={photo[r.id]} alt="" style={{ display: "block", maxWidth: "100%", maxHeight: 260, borderRadius: 10, border: "1px solid #e6e9ef" }} /></a>
          : <button style={{ ...btn, fontSize: 12.5, padding: "5px 11px" }} onClick={showPhoto}>{photo[r.id] === "x" ? "Photo not available" : "📷 Show the driver's photo"}</button>}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, flexWrap: "wrap" }}>
        {pickup ? (col && <button style={btn} onClick={() => onOpenCollection(col.id)}>Open collection</button>)
          : (inv && <button style={btn} onClick={() => onOpenJob(inv.id)}>Open job</button>)}
        <span style={{ flex: 1 }} />
        <button style={btn} onClick={() => onDismiss(r)}>Dismiss</button>
        {!pickup && inv && (left.length > 0 || String(r.notes || "").trim()) && <button style={{ ...goldBtn, color: NAVY }} onClick={() => onFollowUp(r, inv, left)}>Raise follow-up job</button>}
      </div>
    </Modal>
  );
}
