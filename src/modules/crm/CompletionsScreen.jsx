// Completions: every drop and pick-up the drivers have confirmed, with a page for each one, and the
// clear / reset tools (reopen one, delete one, reset the phones' load checks, clear everything).
import { useEffect, useMemo, useState } from "react";
import { NAVY, RED, prettyDateTime } from "../../lib/core.js";
import { gbp, DRIVERS } from "../../lib/crmCore.js";
import { ListHero, HeroStat, Chip, card, sect, lbl, inp, btn, goldBtn, Modal, SearchBox } from "./ui.jsx";
import { loadAllDrops, dropLeft, payMissed, dropPhotoUrl, deleteDrops, resetLoadChecks, wipeDriverData, updateDrops } from "../../data/drops.js";
import { reopenConfirmations } from "./DropSync.jsx";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const RANGES = [["week", "This week"], ["lastweek", "Last week"], ["month", "This month"], ["all", "All"]];
const rangeOf = (k) => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  if (k === "week") return [ymd(mon), ymd(sun)];
  if (k === "lastweek") { const a = new Date(mon); a.setDate(a.getDate() - 7); const b = new Date(mon); b.setDate(b.getDate() - 1); return [ymd(a), ymd(b)]; }
  if (k === "month") return [ymd(new Date(t.getFullYear(), t.getMonth(), 1)), ymd(new Date(t.getFullYear(), t.getMonth() + 1, 0))];
  return ["0000", "9999"];
};
const STATUS = [["all", "All"], ["short", "Items left"], ["unpaid", "Payment not taken"], ["note", "Driver note"], ["open", "Alert open"], ["void", "Reopened"]];
const dayLabel = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "");
const hm = (t) => (t ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—");

export default function CompletionsScreen({ crm, updateCrm, openInvoice, openCollection, me, isAdmin }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [range, setRange] = useState("week");
  const [driver, setDriver] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(null); // confirmation id
  const [reload, setReload] = useState(0);
  const [tool, setTool] = useState(null); // "loads" | "wipe"
  useEffect(() => {
    let live = true;
    loadAllDrops().then((l) => live && setRows(l.sort((a, b) => String(b.at).localeCompare(String(a.at))))).catch((e) => live && setErr(/drop_confirmations|column/.test(String(e && e.message)) ? "Run driver-app-all.sql in Supabase to switch completions on." : String((e && e.message) || e)));
    return () => { live = false; };
  }, [reload]);

  const invById = useMemo(() => Object.fromEntries((crm.invoices || []).map((x) => [x.id, x])), [crm.invoices]);
  const colById = useMemo(() => Object.fromEntries((crm.collections || []).map((x) => [x.id, x])), [crm.collections]);
  const custById = useMemo(() => Object.fromEntries((crm.customers || []).map((x) => [x.id, x])), [crm.customers]);
  const describe = (r) => {
    if (r.collectionId) { const c = colById[r.collectionId]; return { pickup: true, obj: c, name: (c && c.supplier) || "Supplier", ref: "COL-" + ((c && c.collectionNo) || "?"), office: c ? (c.collected ? "Collected" : "Not collected") : "Collection deleted", officeOk: !!(c && c.collected) }; }
    const i = invById[r.invoiceId]; const cu = i && custById[i.customerId];
    return { pickup: false, obj: i, name: (cu && cu.name) || "Customer", ref: "#" + ((i && i.invNo) || r.invNo || "?"), office: i ? (i.deliveryCompleted ? "Delivered" + (i.stockDeducted ? " · stock out" : "") : "Not delivered") : "Job deleted", officeOk: !!(i && i.deliveryCompleted) };
  };
  const flags = (r) => ({ short: dropLeft(r).length > 0, unpaid: payMissed(r), note: !!String(r.notes || "").trim(), open: r.alertState === "open", void: !!r.voidedAt });

  const [from, to] = rangeOf(range);
  const list = (rows || []).filter((r) => {
    if (!(r.date >= from && r.date <= to)) return false;
    if (driver && String(r.driver || "").toLowerCase() !== driver.toLowerCase()) return false;
    if (kind && (kind === "pickup") !== !!r.collectionId) return false;
    const f = flags(r);
    if (status === "all" ? f.void : !f[status]) return false;
    if (q.trim()) { const d = describe(r); if (![d.name, d.ref, r.driver, r.notes].some((v) => String(v || "").toLowerCase().includes(q.trim().toLowerCase()))) return false; }
    return true;
  });
  const live_ = (rows || []).filter((r) => !r.voidedAt && r.date >= from && r.date <= to);
  const counts = Object.fromEntries(STATUS.map(([k]) => [k, (rows || []).filter((r) => r.date >= from && r.date <= to && (k === "all" ? !r.voidedAt : flags(r)[k])).length]));
  const drivers = [...new Set([...DRIVERS, ...(rows || []).map((r) => r.driver).filter(Boolean)])];
  const cur = page && (rows || []).find((r) => r.id === page);

  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "18px 18px 40px" }}>
      <ListHero title="Completions" sub="Every drop and pick-up confirmed on the drivers' phones — click one for the full completion page"
        action={isAdmin && (
          <span style={{ display: "inline-flex", gap: 8 }}>
            <button onClick={() => setTool("loads")} title="Every driver's phone forgets its load-check ticks" style={{ ...btn, background: "transparent", border: "1px solid #3a4f78", color: "#fff" }}>Reset load checks</button>
            <button onClick={() => setTool("wipe")} title="Remove every confirmation, set-off and photo" style={{ ...btn, background: "transparent", border: "1px solid #7a3b48", color: "#f3b3bf" }}>Clear everything</button>
          </span>
        )}>
        <HeroStat label="Confirmed" value={rows ? live_.length : "…"} sub={rows ? live_.filter((r) => r.collectionId).length + " pick-ups" : ""} />
        <HeroStat label="Items left" value={rows ? counts.short : "…"} tone={counts.short ? "#ff9aa8" : undefined} onClick={() => setStatus("short")} />
        <HeroStat label="Payment not taken" value={rows ? counts.unpaid : "…"} tone={counts.unpaid ? "#ff9aa8" : undefined} onClick={() => setStatus("unpaid")} />
        <HeroStat label="Driver notes" value={rows ? counts.note : "…"} onClick={() => setStatus("note")} />
        <HeroStat label="Reopened" value={rows ? counts.void : "…"} sub="kept on record" onClick={() => setStatus("void")} />
      </ListHero>

      <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {RANGES.map(([k, l]) => <button key={k} onClick={() => setRange(k)} style={{ ...btn, padding: "6px 12px", fontSize: 12.5, background: range === k ? NAVY : "#fff", color: range === k ? "#fff" : NAVY, borderColor: range === k ? NAVY : "#d5d9e0" }}>{l}</button>)}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {STATUS.map(([k, l]) => <button key={k} onClick={() => setStatus(k)} style={{ ...btn, padding: "6px 10px", fontSize: 12, background: status === k ? "#185FA5" : "#fff", color: status === k ? "#fff" : NAVY, borderColor: status === k ? "#185FA5" : "#d5d9e0" }}>{l}{rows ? " " + counts[k] : ""}</button>)}
        </div>
        <span style={{ flex: 1 }} />
        <SearchBox value={q} onChange={setQ} placeholder="Customer, job #, note…" width={220} />
        <select style={{ ...inp, width: 130 }} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Drops + pick-ups</option><option value="drop">Drops</option><option value="pickup">Pick-ups</option>
        </select>
        <select style={{ ...inp, width: 140 }} value={driver} onChange={(e) => setDriver(e.target.value)}>
          <option value="">All drivers</option>
          {drivers.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {err && <div style={{ ...card, borderColor: "#f4d78f", background: "#fff8e6", color: "#6b5305", fontWeight: 700 }}>{err}</div>}
      {!rows && !err && <div style={{ ...card, color: "#8593a8", textAlign: "center", fontWeight: 600 }}>Loading completions…</div>}
      {rows && (
        <div style={{ ...card, padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "#8593a8", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", textAlign: "left", background: "#f8f9fb" }}>
                {["Day", "Time", "Driver", "Stop", "Ref", "Completion", "In the office", ""].map((h) => <th key={h} style={{ padding: "10px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={8} style={{ padding: 22, textAlign: "center", color: "#8593a8", fontWeight: 600 }}>Nothing here for these filters.</td></tr>}
              {list.map((r) => {
                const d = describe(r), f = flags(r);
                return (
                  <tr key={r.id} onClick={() => setPage(r.id)} style={{ borderTop: "1px solid #f0f2f6", cursor: "pointer", opacity: f.void ? 0.55 : 1 }}>
                    <td style={td}>{dayLabel(r.date)}</td>
                    <td style={td}>{hm(r.at)}</td>
                    <td style={td}>{r.driver}</td>
                    <td style={{ ...td, fontWeight: 700, color: d.pickup ? "#185FA5" : NAVY }}>{d.pickup ? d.name + " pick-up" : d.name}</td>
                    <td style={td}>{d.ref}</td>
                    <td style={td}><Flags r={r} f={f} /></td>
                    <td style={td}><Chip tone={d.officeOk ? "green" : "grey"}>{d.office}</Chip></td>
                    <td style={{ ...td, color: "#185FA5", fontWeight: 800, textAlign: "right" }}>Open ›</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {cur && <CompletionPage r={cur} d={describe(cur)} f={flags(cur)} crm={crm} updateCrm={updateCrm} me={me} isAdmin={isAdmin}
        onClose={() => setPage(null)} onChanged={() => setReload((n) => n + 1)} openInvoice={openInvoice} openCollection={openCollection} />}
      {tool && <ToolModal tool={tool} rows={rows || []} drivers={drivers} updateCrm={updateCrm} me={me} onClose={() => setTool(null)} onDone={() => setReload((n) => n + 1)} />}
    </div>
  );
}

const td = { padding: "10px 12px", verticalAlign: "middle", whiteSpace: "nowrap" };

function Flags({ r, f }) {
  const left = dropLeft(r);
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {f.void ? <Chip>Reopened {r.voidedAt ? new Date(r.voidedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}</Chip>
        : left.length ? <Chip tone="red">{left.reduce((t, x) => t + x.remaining, 0)} left on {left.length} line{left.length === 1 ? "" : "s"}</Chip>
        : <Chip tone="green">{r.collectionId ? "All collected" : "All delivered"}</Chip>}
      {r.payment && Number(r.payment.owed) > 0 && <Chip tone={r.payment.collected ? "green" : "red"}>{r.payment.collected ? "Paid " + (r.payment.method || "") : "Not paid"}</Chip>}
      {f.note && <Chip tone="gold" title={r.notes}>Note</Chip>}
      {f.open && <Chip tone="amber">Alert open</Chip>}
      {r.followupInvNo && <Chip tone="blue">Follow-up #{r.followupInvNo}</Chip>}
    </span>
  );
}

// ===== one completion, in full =====
function CompletionPage({ r, d, f, crm, updateCrm, me, isAdmin, onClose, onChanged, openInvoice, openCollection }) {
  const [url, setUrl] = useState("");
  const [ask, setAsk] = useState(null); // "reopen" | "delete"
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { if (r.photoPath) dropPhotoUrl(r.photoPath).then(setUrl).catch(() => setUrl("x")); }, [r.id]);
  const left = dropLeft(r);
  const o = d.obj;
  const go = async (what) => {
    setBusy(true); setMsg("");
    try {
      if (!f.void) await reopenConfirmations(updateCrm, [r], me, { noVoid: what === "delete" });
      if (what === "delete") { const x = await deleteDrops([r]); if (x.photoErr) setMsg("Deleted — but the photo couldn't be: " + x.photoErr); }
      onChanged();
      if (what === "delete") onClose();
      setAsk(null);
    } catch (e) { setMsg("Couldn't do that — " + ((e && e.message) || e) + (/column|voided/.test(String(e && e.message)) ? ". Run driver-app-all.sql in Supabase." : "")); }
    setBusy(false);
  };
  return (
    <Modal title={<span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>{d.pickup ? "Pick-up" : "Drop"} · {d.name} <Chip>{d.ref}</Chip>{f.void && <Chip>Reopened</Chip>}</span>} onClose={onClose} width={860} z={80}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.1fr)", gap: 18 }}>
        <div>
          <div style={{ borderRadius: 12, border: "1px solid #e6e9ef", background: "#f8f9fb", minHeight: 220, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {url && url !== "x" ? <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="" style={{ display: "block", maxWidth: "100%", maxHeight: 380 }} /></a>
              : <span style={{ fontSize: 12.5, color: "#8593a8", fontWeight: 600 }}>{url === "x" || !r.photoPath ? "No photo" : "Loading photo…"}</span>}
          </div>
          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: "#5a6a85", lineHeight: 1.6 }}>
            <div>Confirmed by <b style={{ color: NAVY }}>{r.driver || "—"}</b> · {prettyDateTime(r.at)}</div>
            <div>Run date {dayLabel(r.date)}</div>
            {r.lat != null ? <div><a href={"https://www.google.com/maps/search/?api=1&query=" + r.lat + "," + r.lng} target="_blank" rel="noopener noreferrer" style={{ color: "#185FA5", fontWeight: 700 }}>📍 Where it was confirmed</a></div> : <div>No location from the phone</div>}
          </div>
        </div>
        <div>
          <p style={sect}>{d.pickup ? "Collected" : "Delivered"}</p>
          {(r.items || []).map((x, k) => {
            const rem = x.remaining != null ? Number(x.remaining) : x.short ? Number(x.qty) : 0;
            return (
              <div key={k} style={{ display: "flex", gap: 8, fontSize: 13.5, padding: "5px 0", borderBottom: "1px solid #f0f2f6", color: rem ? "#9b1c2e" : NAVY }}>
                <b style={{ width: 16 }}>{rem ? "✗" : "✓"}</b>
                <span style={{ flex: 1 }}>{x.text}{x.colour ? <span style={{ color: "#5a6a85" }}> · {x.colour}</span> : null}</span>
                <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{x.delivered != null ? x.delivered : rem ? 0 : x.qty} of {x.qty}{rem ? " · " + rem + " left" : ""}</span>
              </div>
            );
          })}
          {r.payment && Number(r.payment.owed) > 0 && (
            <div style={{ marginTop: 10, borderRadius: 8, padding: "8px 12px", fontSize: 13.5, fontWeight: 800, border: "1px solid " + (r.payment.collected ? "#bfe3ca" : "#f4b9c1"), background: r.payment.collected ? "#f1faf4" : "#fdf3f4", color: r.payment.collected ? "#28713e" : "#9b1c2e" }}>
              {r.payment.collected ? "✓ " + gbp(Number(r.payment.owed)) + " collected" + (r.payment.method ? " by " + r.payment.method.toLowerCase() : "") : "✗ " + gbp(Number(r.payment.owed)) + " not collected"}
            </div>
          )}
          {f.note && <div style={{ marginTop: 10, background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "8px 12px", fontSize: 13.5, fontWeight: 600, color: "#6b5305" }}><b>Driver's note:</b> {r.notes}</div>}

          <p style={{ ...sect, marginTop: 16 }}>In the office</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Chip tone={d.officeOk ? "green" : "grey"}>{d.office}</Chip>
            {!d.pickup && o && <Chip tone={o.paymentDate ? "green" : "grey"}>{o.paymentDate ? "Paid " + (o.paymentType || "") : "Not paid"}</Chip>}
            {r.appliedAt ? <Chip title={"Applied " + prettyDateTime(r.appliedAt)}>Closed from the phone</Chip> : <Chip tone="amber">Not applied yet</Chip>}
            {r.alertState && <Chip tone={r.alertState === "open" ? "amber" : "grey"}>Alert {r.alertState}{r.alertBy ? " · " + String(r.alertBy).split("@")[0] : ""}</Chip>}
            {r.followupInvNo && <Chip tone="blue">Follow-up #{r.followupInvNo}</Chip>}
            {left.length > 0 && r.appliedAt && !d.pickup && <Chip title="What wasn't delivered was put back into stock when the job closed">Left-overs back in stock</Chip>}
          </div>
        </div>
      </div>

      {ask && (
        <div style={{ marginTop: 14, background: "#fdf3f4", border: "1px solid #f4b9c1", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#9b1c2e", lineHeight: 1.45 }}>
          {ask === "reopen"
            ? "Reopen: the " + (d.pickup ? "pick-up goes back to not collected" : "job goes back to not delivered — stock back in, left-overs taken back out, and the payment the driver recorded taken off") + ". It opens again on the driver's phone. This record and photo stay here, marked reopened."
            : "Delete for good: " + (f.void ? "" : (d.pickup ? "the pick-up goes back to not collected, " : "the job goes back to not delivered (stock, left-overs and payment undone), ")) + "this record and its photo are removed. It opens again on the driver's phone. Can't be undone."}
        </div>
      )}
      {msg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: RED }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {o && <button style={btn} onClick={() => { onClose(); d.pickup ? openCollection(o.id) : openInvoice(o.id); }}>Open {d.pickup ? "collection" : "job"}</button>}
        {f.open && <button style={btn} disabled={busy} onClick={async () => { await updateDrops([r.id], { alert_state: "dismissed", alert_by: me || "office" }); onChanged(); }}>Dismiss alert</button>}
        <span style={{ flex: 1 }} />
        {ask ? (
          <>
            <button style={btn} disabled={busy} onClick={() => setAsk(null)}>Cancel</button>
            <button style={{ ...btn, background: RED, borderColor: RED, color: "#fff" }} disabled={busy} onClick={() => go(ask)}>{busy ? "Working…" : ask === "reopen" ? "Yes, reopen" : "Yes, delete"}</button>
          </>
        ) : (
          <>
            {!f.void && <button style={{ ...btn, color: RED, borderColor: "#ecc4cb" }} onClick={() => setAsk("reopen")}>Reopen</button>}
            {isAdmin && <button style={{ ...btn, background: RED, borderColor: RED, color: "#fff" }} onClick={() => setAsk("delete")}>Delete for good</button>}
            <button style={{ ...goldBtn, color: NAVY }} onClick={onClose}>Close</button>
          </>
        )}
      </div>
    </Modal>
  );
}

// ===== reset the phones' load checks / clear everything =====
function ToolModal({ tool, rows, drivers, updateCrm, me, onClose, onDone }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);
  const wipe = tool === "wipe";
  const run = async () => {
    setBusy(true); setMsg(wipe ? "Clearing…" : "Resetting…");
    try {
      if (wipe) {
        await reopenConfirmations(updateCrm, rows.filter((r) => !r.voidedAt), me, { noVoid: true });
        const r = await wipeDriverData(drivers);
        setMsg("✓ Cleared " + (r.removed ?? rows.length) + " confirmation" + (r.removed === 1 ? "" : "s") + ", every set-off and " + r.photos + " photo" + (r.photos === 1 ? "" : "s") + "." + (r.photoErr ? " Photos not deleted: " + r.photoErr : "") + " Drivers tap ↻ on their phone to see it.");
      } else {
        await resetLoadChecks();
        setMsg("✓ Done — every driver's load check starts from 0 when they tap ↻ or reopen a day.");
      }
      setDone(true); onDone();
    } catch (e) {
      setMsg("Stopped — " + ((e && e.message) || e) + ". Run driver-app-all.sql in Supabase, then try again.");
    }
    setBusy(false);
  };
  return (
    <Modal title={wipe ? "Clear all driver completion data?" : "Reset every driver's load check?"} onClose={() => !busy && onClose()} width={520}>
      <div style={{ fontSize: 13.5, color: "#5a6a85", fontWeight: 600, lineHeight: 1.5 }}>
        {wipe
          ? <>Removes <b>every</b> drop and pick-up confirmation, set-off time and drop photo. Jobs and pick-ups the drivers closed go back to not delivered / not collected (stock back in, left-overs taken back out, driver-recorded payments taken off), and every driver's load-check ticks clear. Can't be undone. Fuel logs aren't touched.</>
          : <>Clears every item the drivers have ticked as on the van and every set-off, for every day — each driver has to check and tick the van again before any address opens. Confirmed drops and pick-ups aren't touched.</>}
      </div>
      {wipe && !done && <>
        <span style={{ ...lbl, marginTop: 14 }}>Type CLEAR to confirm</span>
        <input style={inp} value={text} autoFocus onChange={(e) => setText(e.target.value)} />
      </>}
      {msg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: done ? "#28713e" : busy ? "#5a6a85" : RED }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button style={btn} disabled={busy} onClick={onClose}>{done ? "Close" : "Cancel"}</button>
        {!done && <button style={{ ...btn, background: RED, borderColor: RED, color: "#fff", opacity: !wipe || text.trim().toUpperCase() === "CLEAR" ? 1 : 0.4 }}
          disabled={busy || (wipe && text.trim().toUpperCase() !== "CLEAR")} onClick={run}>{busy ? "Working…" : wipe ? "Clear everything" : "Reset load checks"}</button>}
      </div>
    </Modal>
  );
}
