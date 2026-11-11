// Shared peek pop-overs — the system-wide rule: clicking a record's link opens
// it in a pop-over rather than navigating away, and links inside a pop-over
// open the next pop-over. Each has an "Open …" button for the full screen.
import { useState, useRef, useEffect } from "react";
import { NAVY, prettyDate } from "../../lib/core.js";
import { gbp, invoiceTotals, isPaid, isSaleInvoice, mobileOf, DRIVERS, vanOptions, itemPending, sizeLabel, isGrassRoll } from "../../lib/crmCore.js";
import { Icon, btn, goldBtn, lbl, inp, Chip } from "./ui.jsx";
import LinesEditor from "./LinesEditor.jsx";

export const peekChip = (bg, fg) => ({ fontSize: 11, fontWeight: 800, color: fg, background: bg, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" });
const linkBtn = { border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", padding: 0 };

// Peeks are small floating windows, not modals: no backdrop, so windows can
// stack with the ones behind still visible and editable. Drag by the top bar,
// click anywhere to bring to the front, close with the X (or Esc, topmost first).
let topZ = 80; // peeks float above modals (z 60) but below reminders (z 90+)
let openSeq = 0; // cascade: each new window lands a step down-right of the last
export function PeekShell({ onClose, width = 1120, title = "", children }) {
  const PW = Math.min(width, window.innerWidth - 40);
  const [z, setZ] = useState(() => ++topZ);
  const [pos, setPos] = useState(() => {
    const n = openSeq++ % 7;
    return {
      x: Math.min(Math.max(10, Math.round((window.innerWidth - PW) / 2)) + n * 30, window.innerWidth - PW - 10),
      y: 30 + n * 30,
    };
  });
  const posRef = useRef(pos); posRef.current = pos;
  const zRef = useRef(z); zRef.current = z;
  const bringFront = () => { if (zRef.current !== topZ) setZ(++topZ); };

  const onBarDown = (e) => {
    if (e.target.closest("button, a, input, select, textarea")) return; // the X and friends still click
    bringFront();
    const start = { dx: e.clientX - posRef.current.x, dy: e.clientY - posRef.current.y };
    const move = (ev) => setPos({
      x: Math.min(Math.max(10 - PW + 80, ev.clientX - start.dx), window.innerWidth - 60),
      y: Math.min(Math.max(0, ev.clientY - start.dy), window.innerHeight - 40),
    });
    const up = () => window.removeEventListener("pointermove", move);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    e.preventDefault();
  };

  // Esc closes the topmost window
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && zRef.current === topZ) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div onMouseDownCapture={bringFront}
      style={{ position: "fixed", left: pos.x, top: pos.y, width: PW, maxHeight: "calc(100dvh - 50px)", display: "flex", flexDirection: "column", zIndex: z, background: "#fff", border: "1px solid #d8dde6", borderRadius: 12, boxShadow: "0 18px 50px rgba(11,31,63,.35)", boxSizing: "border-box", overflow: "hidden" }}>
      <div onPointerDown={onBarDown}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px 7px 14px", background: "#f3f5f9", borderBottom: "1px solid #e6e9ef", cursor: "move", userSelect: "none", flex: "none", touchAction: "none" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#5a6a85", letterSpacing: 0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <span style={{ flex: 1 }} />
        <button onClick={onClose} title="Close (Esc)"
          style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4, lineHeight: 0, borderRadius: 6 }}>
          <Icon name="x" stroke="#5a6a85" size={14} />
        </button>
      </div>
      <div style={{ overflowY: "auto", padding: "12px 18px 14px" }}>{children}</div>
    </div>
  );
}

// ----- an invoice, read-only -----
export function InvoicePeek({ crm, invId, onClose, onOpenFull, onCustomer }) {
  const i = crm.invoices.find((x) => x.id === invId);
  if (!i) return null;
  const c = crm.customers.find((x) => x.id === i.customerId);
  const s = crm.sites.find((x) => x.id === i.siteId);
  const t = invoiceTotals(i);
  const addr = (s ? [s.name !== s.address ? s.name : "", s.address, s.town, s.postcode] : c ? [c.address, c.town, c.postcode] : []).filter(Boolean);
  return (
    <PeekShell onClose={onClose} title={"Job #" + (i.invNo || "—") + ((c && c.name) ? " · " + c.name : "")}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        {onCustomer && c ? (
          <button onClick={() => onCustomer(c.id)} title="Peek at the account" style={{ ...linkBtn, fontSize: 15, fontWeight: 700, color: NAVY, textDecoration: "underline", textDecorationColor: "#c8cfdb" }}>{c.name || "Unnamed"}</button>
        ) : (
          <b style={{ fontSize: 15, color: NAVY }}>{(c && c.name) || "No customer"}</b>
        )}
        <span style={{ fontSize: 12, fontWeight: 700, color: "#185FA5" }}>#{i.invNo || "—"}</span>
        {i.deliveryDate && <span style={peekChip("#eef1f6", "#3b4c6b")}>{i.deliveryCompleted ? "delivered " : "booked "}{prettyDate(i.deliveryDate)}</span>}
        <span style={peekChip(isPaid(i) ? "#e9f6ee" : "#fdf3e4", isPaid(i) ? "#28713e" : "#8a5a14")}>{isPaid(i) ? "paid" + (i.paymentType ? " · " + i.paymentType : "") : "awaiting payment"}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "#8593a8" }}>
          {(i.created || i.date ? "Raised " + prettyDate(i.created || i.date) + (i.raisedBy ? " by " + String(i.raisedBy).split("@")[0] : "") : "")}
        </span>
      </div>
      {addr.length > 0 && (
        <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, lineHeight: 1.5, marginBottom: 6 }}>
          {addr.map((l, k) => <span key={k}>{l}{k < addr.length - 1 ? " · " : ""}</span>)}
        </div>
      )}
      <LinesEditor doc={i} crm={crm} readOnly edit={() => {}} />
      <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: NAVY, display: "grid", gridTemplateColumns: "1fr auto", gap: "3px 10px" }}>
        {Number(i.deliveryCharge) ? <><span style={{ color: "#5a6a85" }}>Delivery</span><span>{gbp(Number(i.deliveryCharge))}</span></> : null}
        <span>Total</span><span>{gbp(t.total)}</span>
      </div>
      {i.jobNotes && <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: "#6b5305", background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "6px 10px" }}>{i.jobNotes}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, gap: 8 }}>
        {onCustomer && c && <button style={btn} onClick={() => onCustomer(c.id)}><Icon name="user" stroke={NAVY} />Account</button>}
        {onOpenFull && <button style={goldBtn} onClick={() => onOpenFull(i.id)}><Icon name="doc" stroke={NAVY} />Open job</button>}
      </div>
    </PeekShell>
  );
}

// ----- a customer account at a glance -----
export function CustomerPeek({ crm, custId, optOut = [], onClose, onOpenFull, onInvoice }) {
  const c = crm.customers.find((x) => x.id === custId);
  if (!c) return null;
  const invs = crm.invoices.filter((x) => x.customerId === c.id && isSaleInvoice(x)).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const owed = invs.filter((x) => !isPaid(x)).reduce((s2, x) => s2 + invoiceTotals(x).total, 0);
  const mob = mobileOf(c);
  const line = (label, v) => (v ? <div style={{ display: "flex", gap: 8, fontSize: 13, fontWeight: 600, padding: "2px 0" }}><span style={{ color: "#8593a8", width: 86, flex: "none" }}>{label}</span><span style={{ color: NAVY }}>{v}</span></div> : null);
  return (
    <PeekShell onClose={onClose} width={600} title={"Account #" + (c.accountNo || "—") + (c.name ? " · " + c.name : "")}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 15, color: NAVY }}>{c.name || "Unnamed"}</b>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#8593a8" }}>#{c.accountNo || "—"}</span>
        {c.trader && <span style={peekChip("#eef1f6", "#3b4c6b")}>trade</span>}
        {Number(c.discountPct) > 0 && <span style={peekChip("#eef1f6", "#3b4c6b")}>{c.discountPct}% discount</span>}
        {optOut.includes(c.id) && <span style={peekChip("#fde8ea", "#9b1c2e")}>no review asks</span>}
      </div>
      {line("Contact", c.contact)}
      {line("Mobile", mob || c.mobile)}
      {line("Phone", c.phone)}
      {line("Email", c.email)}
      {line("Prefers", c.contactMethod)}
      {line("Address", [c.address, c.town, c.postcode].filter(Boolean).join(", "))}
      <div style={{ marginTop: 10, borderTop: "1px solid #eef1f6", paddingTop: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 }}>
          {invs.length} invoice{invs.length === 1 ? "" : "s"}{owed > 0 ? " · " + gbp(owed) + " outstanding" : ""}
        </div>
        {invs.slice(0, 6).map((x) => (
          <div key={x.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, fontWeight: 600, padding: "3px 0" }}>
            {onInvoice
              ? <button onClick={() => onInvoice(x.id)} style={{ ...linkBtn, fontWeight: 700, color: "#185FA5", fontSize: 12.5 }}>#{x.invNo || "—"}</button>
              : <b style={{ color: "#185FA5", fontSize: 12.5 }}>#{x.invNo || "—"}</b>}
            <span style={{ color: "#5a6a85" }}>{x.date ? prettyDate(x.date) : ""}</span>
            <span style={{ marginLeft: "auto" }}>{gbp(invoiceTotals(x).total)}</span>
            <span style={peekChip(isPaid(x) ? "#e9f6ee" : "#fdf3e4", isPaid(x) ? "#28713e" : "#8a5a14")}>{isPaid(x) ? "paid" : "owed"}</span>
          </div>
        ))}
        {invs.length > 6 && <div style={{ fontSize: 12, fontWeight: 600, color: "#8593a8" }}>…and {invs.length - 6} more on the account</div>}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, gap: 8 }}>
        {onOpenFull && <button style={goldBtn} onClick={() => onOpenFull(c.id)}><Icon name="user" stroke={NAVY} />Open account</button>}
      </div>
    </PeekShell>
  );
}

// ----- a supplier collection: book it from here, lines read-only -----
export function CollectionPeek({ crm, collId, updateCrm, onClose, onOpenFull, onJob }) {
  const c0 = (crm.collections || []).find((x) => x.id === collId);
  if (!c0) return null;
  const set = (fn) => updateCrm && updateCrm((d) => { const t = (d.collections || []).find((x) => x.id === collId); if (t) fn(t); return d; });
  const invNoFor = (id) => { const inv = crm.invoices.find((x) => x.id === id); return inv ? "#" + (inv.invNo || "—") : "#—"; };
  const canEdit = !!updateCrm;
  const sized = (c0.items || []).some((it) => isGrassRoll(it));
  const th = { fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "6px 6px", borderBottom: "2px solid #e6e9ef", textAlign: "left", whiteSpace: "nowrap" };
  const td = { padding: "6px 6px", borderBottom: "1px solid #f0f2f6", fontSize: 13, fontWeight: 600, verticalAlign: "middle" };
  return (
    <PeekShell onClose={onClose} width={820} title={"Collection COL-" + (c0.collectionNo || "—") + (c0.supplier ? " · " + c0.supplier : "")}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <b style={{ fontSize: 15, color: NAVY }}>Collection COL-{c0.collectionNo || "—"}</b>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#5a6a85" }}>{c0.supplier || "Supplier"}</span>
        {c0.collected && <span style={peekChip("#e9f6ee", "#28713e")}>collected</span>}
      </div>
      {/* the booking bits, editable right here */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
        <label><span style={lbl}>Collect date</span>
          <input type="date" style={{ ...inp, width: 150 }} value={c0.collectDate || ""} disabled={!canEdit} onChange={(e) => set((t) => (t.collectDate = e.target.value))} /></label>
        <label><span style={lbl}>Driver</span>
          <select style={{ ...inp, width: 120 }} value={c0.driver || ""} disabled={!canEdit} onChange={(e) => set((t) => (t.driver = e.target.value))}>
            <option value="">—</option>
            {DRIVERS.map((d) => <option key={d} value={d}>{d}</option>)}
            {c0.driver && !DRIVERS.includes(c0.driver) && <option value={c0.driver}>{c0.driver}</option>}
          </select></label>
        <label><span style={lbl}>Van</span>
          <select style={{ ...inp, width: 120 }} value={c0.van || ""} disabled={!canEdit} onChange={(e) => set((t) => (t.van = e.target.value))}>
            <option value="">—</option>
            {vanOptions(crm).map((v) => <option key={v} value={v}>{v}</option>)}
          </select></label>
        {canEdit && (
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 700, color: NAVY, paddingBottom: 7 }}>
            <input type="checkbox" checked={!!c0.collected} onChange={(e) => set((t) => (t.collected = e.target.checked))} />Collected
          </label>
        )}
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>{["Code", ...(sized ? ["Size"] : []), "Description", "Colour", "Qty", "Where it went"].map((h, k) => <th key={k} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {(c0.items || []).map((it) => (
            <tr key={it.id}>
              <td style={{ ...td, fontWeight: 700 }}>{it.sku || "—"}</td>
              {sized && <td style={td}>{sizeLabel(it) || ""}</td>}
              <td style={td}>{it.description}</td>
              <td style={td}>{it.colour || "—"}</td>
              <td style={td}>{it.qty}</td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>
                {it.postedAt ? <Chip tone="green">In stock · {prettyDate(it.postedAt)}</Chip>
                  : it.assignedInvoiceId ? (
                    onJob
                      ? <button onClick={() => onJob(it.assignedInvoiceId)} style={linkBtn}><Chip tone="gold">Job {invNoFor(it.assignedInvoiceId)} →</Chip></button>
                      : <Chip tone="gold">Job {invNoFor(it.assignedInvoiceId)}</Chip>
                  ) : <Chip tone="grey">Pending</Chip>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {c0.notes && <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: "#6b5305", background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "6px 10px" }}>{c0.notes}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, gap: 8 }}>
        {onOpenFull && <button style={goldBtn} onClick={() => onOpenFull(c0.id)}><Icon name="box" stroke={NAVY} />Open collection</button>}
      </div>
    </PeekShell>
  );
}
