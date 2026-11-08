// Delivery issues: every drop or pick-up the driver couldn't finish cleanly - items left over,
// payment not taken, or a note. Each stays LIVE until it's sorted: by hand ("Mark sorted"), or on
// its own once the follow-up job is delivered and / or the job shows paid.
import { useEffect, useMemo, useState } from "react";
import { NAVY, RED, GOLD, prettyDateTime } from "../../lib/core.js";
import { gbp } from "../../lib/crmCore.js";
import { ListHero, HeroStat, Chip, card, sect, lbl, inp, btn, goldBtn, Modal, SearchBox } from "./ui.jsx";
import { loadAllDrops, dropLeft, payMissed, updateDrops } from "../../data/drops.js";
import DropPhotos from "./DropPhotos.jsx";
import { shortPickupMail } from "../../lib/supplierMail.js";

const dayLabel = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "");

// what's wrong with a confirmation, and whether each part has sorted itself
export function issueOf(r, crm) {
  const left = dropLeft(r);
  const inv = !r.collectionId ? (crm.invoices || []).find((x) => x.id === r.invoiceId) : null;
  const col = r.collectionId ? (crm.collections || []).find((x) => x.id === r.collectionId) : null;
  const fu = r.followupInvNo ? (crm.invoices || []).find((x) => String(x.invNo) === String(r.followupInvNo)) : null;
  const parts = [];
  if (left.length && r.collectionId) parts.push({ kind: "left", sorted: false, text: left.reduce((t, x) => t + x.remaining, 0) + " item" + (left.reduce((t, x) => t + x.remaining, 0) === 1 ? "" : "s") + " not collected", how: r.supplierEmailedAt ? "supplier emailed " + dayLabel(String(r.supplierEmailedAt).slice(0, 10)) : "supplier not told yet" });
  else if (left.length) parts.push({ kind: "left", sorted: !!(fu && fu.deliveryCompleted), text: left.reduce((t, x) => t + x.remaining, 0) + " item" + (left.reduce((t, x) => t + x.remaining, 0) === 1 ? "" : "s") + (r.collectionId ? " not collected" : " still to deliver"), how: fu ? (fu.deliveryCompleted ? "follow-up #" + fu.invNo + " delivered" : "follow-up #" + fu.invNo + (fu.deliveryDate ? " booked " + dayLabel(fu.deliveryDate) : " raised, no date yet")) : "no follow-up yet" });
  if (payMissed(r)) parts.push({ kind: "pay", sorted: !!(inv && inv.paymentDate), text: gbp(Number(r.payment.owed)) + " payment not taken", how: inv && inv.paymentDate ? "paid " + dayLabel(inv.paymentDate) + (inv.paymentType ? " · " + inv.paymentType : "") : "still owed" });
  if (String(r.notes || "").trim()) parts.push({ kind: "note", sorted: false, text: "Driver's note", how: "" });
  const auto = parts.some((p) => p.kind !== "note") && parts.filter((p) => p.kind !== "note").every((p) => p.sorted);
  const live = parts.length > 0 && !r.resolvedAt && !r.voidedAt && !auto;
  return { parts, live, auto, inv, col, fu, left };
}

export default function IssuesScreen({ crm, updateCrm, me, openInvoice, openCollection, newFollowUpFromDrop, canEdit, onLiveCount }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("live");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    const pull = () => loadAllDrops().then((l) => live && setRows(l)).catch((e) => live && setErr(/column|drop_confirmations/.test(String(e && e.message)) ? "Run driver-app-all.sql in Supabase to switch delivery issues on." : String((e && e.message) || e)));
    pull();
    const t = setInterval(pull, 60000); // live: new issues from the drivers turn up on their own
    return () => { live = false; clearInterval(t); };
  }, [reload]);

  const custById = useMemo(() => Object.fromEntries((crm.customers || []).map((x) => [x.id, x])), [crm.customers]);
  const issues = useMemo(() => (rows || []).filter((r) => !r.voidedAt).map((r) => ({ r, ...issueOf(r, crm) })).filter((x) => x.parts.length)
    .sort((a, b) => String(b.r.at).localeCompare(String(a.r.at))), [rows, crm.invoices, crm.collections]);
  const nameOf = (x) => (x.r.collectionId ? ((x.col && x.col.supplier) || "Supplier") + " pick-up" : ((x.inv && custById[x.inv.customerId]) || {}).name || "Customer");
  const refOf = (x) => (x.r.collectionId ? "COL-" + ((x.col && x.col.collectionNo) || "?") : "#" + ((x.inv && x.inv.invNo) || x.r.invNo || "?"));
  const liveOnes = issues.filter((x) => x.live);
  const list = issues.filter((x) => (tab === "live" ? x.live : !x.live)).filter((x) => !q.trim() || [nameOf(x), refOf(x), x.r.driver, x.r.notes].some((v) => String(v || "").toLowerCase().includes(q.trim().toLowerCase())));
  const cur = open && issues.find((x) => x.r.id === open);
  useEffect(() => { if (rows && onLiveCount) onLiveCount(liveOnes.length); }, [rows, liveOnes.length]);
  const oldest = liveOnes.length ? liveOnes[liveOnes.length - 1] : null;
  const ageDays = (x) => Math.floor((Date.now() - new Date(x.r.at).getTime()) / 86400000);

  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "18px 18px 40px" }}>
      <ListHero title="Delivery issues" sub="Drops and pick-ups the drivers couldn't finish cleanly — live until they're sorted. Updates every minute.">
        <HeroStat label="Live" value={rows ? liveOnes.length : "…"} tone={liveOnes.length ? "#ff9aa8" : undefined} onClick={() => setTab("live")} sub={oldest ? "oldest " + ageDays(oldest) + " day" + (ageDays(oldest) === 1 ? "" : "s") : ""} />
        <HeroStat label="Items still to deliver" value={rows ? liveOnes.filter((x) => x.parts.some((p) => p.kind === "left" && !p.sorted)).length : "…"} />
        <HeroStat label="Payments owed" value={rows ? gbp(liveOnes.filter((x) => x.parts.some((p) => p.kind === "pay" && !p.sorted)).reduce((t, x) => t + Number(x.r.payment.owed || 0), 0)) : "…"} />
        <HeroStat label="Sorted" value={rows ? issues.length - liveOnes.length : "…"} onClick={() => setTab("sorted")} />
      </ListHero>

      <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "12px 16px" }}>
        {[["live", "Live"], ["sorted", "Sorted"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...btn, padding: "7px 14px", fontSize: 13, background: tab === k ? (k === "live" ? RED : NAVY) : "#fff", color: tab === k ? "#fff" : NAVY, borderColor: tab === k ? (k === "live" ? RED : NAVY) : "#d5d9e0" }}>
            {l} {rows ? (k === "live" ? liveOnes.length : issues.length - liveOnes.length) : ""}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <SearchBox value={q} onChange={setQ} placeholder="Customer, job #, driver, note…" width={300} />
      </div>

      {err && <div style={{ ...card, borderColor: "#f4d78f", background: "#fff8e6", color: "#6b5305", fontWeight: 700 }}>{err}</div>}
      {!rows && !err && <div style={{ ...card, textAlign: "center", color: "#8593a8", fontWeight: 600 }}>Loading…</div>}
      {rows && list.length === 0 && <div style={{ ...card, textAlign: "center", color: tab === "live" ? "#28713e" : "#8593a8", fontWeight: 700 }}>{tab === "live" ? "✓ No live delivery issues." : "Nothing sorted yet."}</div>}

      {list.map((x) => (
        <div key={x.r.id} onClick={() => setOpen(x.r.id)}
          style={{ ...card, cursor: "pointer", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", padding: "12px 16px", borderLeft: "6px solid " + (x.live ? RED : "#3FA55C") }}>
          <div style={{ minWidth: 190 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: x.r.collectionId ? "#185FA5" : NAVY }}>{nameOf(x)} <span style={{ fontSize: 12, color: "#8593a8" }}>{refOf(x)}</span></div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5a6a85" }}>{dayLabel(String(x.r.at).slice(0, 10))} · {x.r.driver}{x.live ? " · live " + ageDays(x) + "d" : ""}</div>
          </div>
          <div style={{ flex: 1, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {x.parts.map((p, k) => (
              <Chip key={k} tone={p.kind === "note" ? "gold" : p.sorted ? "green" : "red"} title={p.kind === "note" ? x.r.notes : p.how}>
                {p.sorted ? "✓ " : ""}{p.text}{p.how ? " — " + p.how : ""}
              </Chip>
            ))}
          </div>
          {x.r.collectionId && x.r.supplierEmailedAt && <Chip tone="blue" title={"Supplier emailed " + prettyDateTime(x.r.supplierEmailedAt)}>✉ Supplier emailed</Chip>}
          {x.live ? <Chip tone="red" style={{ fontSize: 12.5 }}>LIVE</Chip>
            : <Chip tone="green" style={{ fontSize: 12.5 }} title={x.r.resolvedAt ? "Sorted by " + String(x.r.resolvedBy || "").split("@")[0] + (x.r.resolution ? ": " + x.r.resolution : "") : "Sorted itself"}>{x.r.resolvedAt ? "Sorted " + dayLabel(String(x.r.resolvedAt).slice(0, 10)) : "Sorted itself"}</Chip>}
        </div>
      ))}

      {cur && <IssuePage crm={crm} x={cur} name={nameOf(cur)} refNo={refOf(cur)} me={me} canEdit={canEdit} onClose={() => setOpen(null)} onChanged={() => setReload((n) => n + 1)}
        openInvoice={openInvoice} openCollection={openCollection} newFollowUpFromDrop={newFollowUpFromDrop} />}
    </div>
  );
}

function IssuePage({ crm, x, name, refNo, me, canEdit, onClose, onChanged, openInvoice, openCollection, newFollowUpFromDrop }) {
  const r = x.r;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = async (patch) => {
    setBusy(true); setMsg("");
    try { await updateDrops([r.id], patch); onChanged(); onClose(); }
    catch (e) { setMsg("Couldn't save — " + ((e && e.message) || e) + (/resolved/.test(String(e && e.message)) ? ". Run driver-app-all.sql in Supabase." : "")); }
    setBusy(false);
  };
  return (
    <Modal title={<span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{name} <Chip>{refNo}</Chip>{x.live ? <Chip tone="red">LIVE</Chip> : <Chip tone="green">Sorted</Chip>}</span>} onClose={onClose} width={860} z={80}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.1fr)", gap: 18 }}>
        <div>
          <DropPhotos conf={r} height={340} />
          <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: "#5a6a85" }}>{r.driver} · {prettyDateTime(r.at)}</div>
        </div>
        <div>
          <p style={sect}>What needs sorting</p>
          {x.parts.map((p, k) => (
            <div key={k} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #f0f2f6", fontSize: 13.5 }}>
              <b style={{ width: 18, color: p.sorted ? "#28713e" : p.kind === "note" ? "#9a7408" : RED }}>{p.sorted ? "✓" : "!"}</b>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: NAVY }}>{p.text}</div>
                {p.kind === "left" && x.left.map((l, n) => <div key={n} style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600 }}>{l.remaining}× {l.text}{l.colour ? " · " + l.colour : ""} <span style={{ color: "#8593a8" }}>({l.delivered} of {l.qty} {r.collectionId ? "collected" : "dropped"})</span></div>)}
                {p.kind === "note" && <div style={{ marginTop: 3, background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "6px 10px", fontWeight: 600, color: "#6b5305" }}>{r.notes}</div>}
                {p.how && <div style={{ fontSize: 12, fontWeight: 700, color: p.sorted ? "#28713e" : "#a05f10", marginTop: 2 }}>{p.how}</div>}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 12, color: "#8593a8", fontWeight: 600, marginTop: 8 }}>
            {r.collectionId ? "Mark it sorted once the missing items have been collected or replaced" : <>Sorts itself once {[x.parts.some((p) => p.kind === "left") && "the follow-up job is delivered", x.parts.some((p) => p.kind === "pay") && "the job shows paid"].filter(Boolean).join(" and ") || "someone marks it sorted"}</>}.
          </div>
          {r.resolvedAt && <div style={{ marginTop: 10, background: "#f1faf4", border: "1px solid #bfe3ca", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700, color: "#28713e" }}>Sorted by {String(r.resolvedBy || "").split("@")[0]} · {prettyDateTime(r.resolvedAt)}{r.resolution ? " — " + r.resolution : ""}</div>}
          {x.live && canEdit && (
            <div style={{ marginTop: 14 }}>
              <span style={lbl}>How was it sorted? (optional)</span>
              <input style={inp} value={note} onChange={(e) => setNote(e.target.value)} placeholder={r.collectionId ? "e.g. collected on COL-14" : "e.g. customer happy, trims credited"} />
            </div>
          )}
        </div>
      </div>
      {msg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: RED }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {x.inv && <button style={btn} onClick={() => { onClose(); openInvoice(x.inv.id); }}>Open job</button>}
        {x.col && <button style={btn} onClick={() => { onClose(); openCollection(x.col.id); }}>Open collection</button>}
        {x.col && x.left.length > 0 && (() => {
          const m = shortPickupMail(x.col, r, crm);
          if (!m.href) return <span title={"No email address for " + (x.col.supplier || "this supplier") + " — add one on the supplier record"} style={{ ...btn, opacity: 0.5, cursor: "default" }}>✉ Email supplier</span>;
          return <a href={m.href} target="_blank" rel="noopener noreferrer" onClick={() => updateDrops([r.id], { supplier_emailed_at: new Date().toISOString() }).then(onChanged).catch(() => {})}
            title={(r.supplierEmailedAt ? "Emailed " + prettyDateTime(r.supplierEmailedAt) + " — click to email again. " : "") + "Opens Gmail to " + m.email + " listing what wasn't ready"}
            style={{ ...btn, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, background: r.supplierEmailedAt ? "#e9f6ee" : "#185FA5", color: r.supplierEmailedAt ? "#28713e" : "#fff", borderColor: r.supplierEmailedAt ? "#bfe3ca" : "#185FA5" }}>
            ✉ {r.supplierEmailedAt ? "Supplier emailed " + new Date(r.supplierEmailedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Email supplier"}
          </a>;
        })()}
        {x.fu && <button style={btn} onClick={() => { onClose(); openInvoice(x.fu.id); }}>Open follow-up #{x.fu.invNo}</button>}
        {canEdit && x.inv && x.left.length > 0 && !x.fu && <button style={{ ...goldBtn, color: NAVY }} onClick={() => { onClose(); newFollowUpFromDrop(r, x.inv, x.left); }}>Raise follow-up job</button>}
        <span style={{ flex: 1 }} />
        {canEdit && (x.live
          ? <button style={{ ...btn, background: "#28713e", borderColor: "#28713e", color: "#fff" }} disabled={busy} onClick={() => set({ resolved_at: new Date().toISOString(), resolved_by: me || "office", resolution: note.trim(), alert_state: r.alertState === "open" ? "dismissed" : r.alertState })}>{busy ? "Saving…" : "✓ Mark sorted"}</button>
          : r.resolvedAt && <button style={btn} disabled={busy} onClick={() => set({ resolved_at: "", resolved_by: "", resolution: "" })}>Make live again</button>)}
        <button style={{ ...goldBtn, color: NAVY }} onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
