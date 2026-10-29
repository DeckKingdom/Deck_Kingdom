// Schedule tab: the daily delivery board — invoices grouped by delivery date,
// workflow toggles inline, pending (undated) jobs at the bottom.
import { useState, useMemo } from "react";
import { NAVY, GOLD, RED, prettyDate } from "../../lib/core.js";
import {
  invoiceTotals, gbp, isPaid, scheduleStatus, STRIPE_COLOURS, daysSinceRaised, isCollectionJob, invoiceLoadKg, collectionProgress,
  PREP_FLAGS, FOLLOWUP_FLAGS, today,
} from "../../lib/crmCore.js";
import { Icon, Chip, Tg, sect, lbl, card, abtn, inp, btn, goldBtn } from "./ui.jsx";

const RANGE_OPTS = [
  ["upcoming", "Upcoming + last 7 days"],
  ["all", "Everything"],
  ["week", "This week"],
  ["today", "Today"],
];

const dayLabel = (d) => {
  const x = new Date(d + "T00:00:00");
  if (isNaN(x.getTime())) return d;
  return x.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
};

const COLLECTION_BLUE = "#185FA5";

export default function ScheduleScreen({ crm, updateCrm, openInvoice, openCollection }) {
  const [search, setSearch] = useState("");
  const [range, setRange] = useState("upcoming");
  const [van, setVan] = useState("");
  const [hideDone, setHideDone] = useState(false);

  const custById = useMemo(() => {
    const m = {};
    crm.customers.forEach((c) => (m[c.id] = c));
    return m;
  }, [crm.customers]);
  const siteById = useMemo(() => {
    const m = {};
    crm.sites.forEach((s) => (m[s.id] = s));
    return m;
  }, [crm.sites]);

  const setFlag = (invId, k) =>
    updateCrm((c) => {
      const t = c.invoices.find((i) => i.id === invId);
      if (t) t.flags[k] = !t.flags[k];
      return c;
    });

  const vans = useMemo(() => {
    const s = new Set();
    crm.invoices.forEach((i) => i.van && s.add(i.van));
    (crm.collections || []).forEach((c) => c.van && s.add(c.van));
    return [...s].sort();
  }, [crm.invoices, crm.collections]);

  const tod = today();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const q = search.trim().toLowerCase();
  const visible = crm.invoices.filter((i) => {
    if (hideDone && i.deliveryCompleted) return false;
    if (van && i.van !== van) return false;
    if (q) {
      const c = custById[i.customerId];
      const s = siteById[i.siteId];
      const hay = [String(i.invNo || ""), c && c.name, c && c.postcode, s && s.postcode, s && s.name, i.van].map((v) => String(v || "").toLowerCase());
      if (!hay.some((v) => v.includes(q))) return false;
    }
    if (!i.deliveryDate) return true; // pending section always shows
    if (range === "all") return true;
    if (range === "today") return i.deliveryDate === tod;
    if (range === "week") return i.deliveryDate >= tod && i.deliveryDate <= weekEnd;
    return i.deliveryDate >= weekAgo; // upcoming + last 7 days
  });

  // collections ride the same board: a van picking up from a UK supplier is a run too
  const visibleColls = (crm.collections || []).filter((c) => {
    if (hideDone) { const pr = collectionProgress(c); if (pr.total > 0 && pr.pending === 0) return false; }
    if (van && c.van !== van) return false;
    if (q && ![("col-" + (c.collectionNo || "")), c.supplier, c.postcode, c.van].some((v) => String(v || "").toLowerCase().includes(q))) return false;
    if (!c.collectDate) return true;
    if (range === "all") return true;
    if (range === "today") return c.collectDate === tod;
    if (range === "week") return c.collectDate >= tod && c.collectDate <= weekEnd;
    return c.collectDate >= weekAgo;
  });

  const entries = [
    ...visible.map((i) => ({ kind: "inv", date: i.deliveryDate, time: i.deliveryTime || "", obj: i })),
    ...visibleColls.map((c) => ({ kind: "col", date: c.collectDate, time: c.collectTime || "", obj: c })),
  ];
  const dated = entries.filter((e) => e.date).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const pending = entries.filter((e) => !e.date).sort((a, b) => ((a.obj.date || "")).localeCompare(b.obj.date || ""));

  const groups = [];
  dated.forEach((e) => {
    const g = groups[groups.length - 1];
    if (g && g.date === e.date) g.rows.push(e);
    else groups.push({ date: e.date, rows: [e] });
  });

  const Row = ({ i }) => {
    const c = custById[i.customerId];
    const s = siteById[i.siteId];
    const t = invoiceTotals(i);
    const status = scheduleStatus(i);
    const days = daysSinceRaised(i);
    const paid = isPaid(i);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #e6e9ef", borderRadius: 10, padding: "9px 12px 9px 0", marginBottom: 6, overflow: "hidden", flexWrap: "wrap" }}>
        <div style={{ width: 4, alignSelf: "stretch", borderRadius: "4px 0 0 4px", margin: "-9px 0", background: STRIPE_COLOURS[status], flex: "none" }} />
        <div style={{ flex: "1 1 190px", minWidth: 170 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => openInvoice(i.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14, color: NAVY }}>
              {c ? c.name || "Unnamed" : "No customer"}
            </button>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "#185FA5" }}>#{i.invNo || "—"}</span>
          </div>
          <div style={{ fontSize: 11.5, color: "#5a6a85", fontWeight: 600, marginTop: 2, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {(s && s.postcode) || (c && c.postcode) || "—"}
            {c && c.source && <Chip style={{ fontSize: 10.5, padding: "1px 8px" }}>{c.source}</Chip>}
            {i.raisedBy && <span>by {i.raisedBy.split("@")[0]}</span>}
          </div>
        </div>
        <div style={{ flex: "none", width: 96, fontSize: 12.5, fontWeight: 700, color: isCollectionJob(i) ? "#9a7408" : NAVY }}>
          {i.jobType || "—"}
          <div style={{ fontSize: 11, color: "#5a6a85", fontWeight: 600, marginTop: 1 }}>{i.van || (isCollectionJob(i) ? "Customer pickup" : "—")}</div>
        </div>
        <div style={{ flex: "none", width: 48, textAlign: "right", fontSize: 12.5, fontWeight: 700 }}>{(() => { const lk = invoiceLoadKg(i, crm); return lk === null ? "—" : lk.toLocaleString("en-GB", { maximumFractionDigits: 0 }); })()}</div>
        <div style={{ flex: "none", width: 48, textAlign: "right", fontSize: 12.5, fontWeight: 700 }}>{i.deliveryTime || "—"}</div>
        <div style={{ display: "flex", gap: 4, flex: "none" }}>
          {PREP_FLAGS.map(([k, label, icon]) => (
            <Tg key={k} on={i.flags[k]} na={k === "courier" && isCollectionJob(i) && !i.flags[k]} title={label} icon={icon} onClick={() => setFlag(i.id, k)} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, flex: "none" }}>
          {FOLLOWUP_FLAGS.map(([k, label, icon]) => (
            <Tg key={k} on={i.flags[k]} title={label} icon={icon} onClick={() => setFlag(i.id, k)} />
          ))}
        </div>
        <div style={{ flex: "none", width: 118, fontSize: 11.5, fontWeight: 700, color: paid ? "#28713e" : "#a05f10" }}>
          {paid ? "Paid" : i.paymentType === "COD" ? "COD " + gbp(invoiceTotals(i).total) : "Awaiting"}
          {paid && i.paymentType ? " · " + i.paymentType : ""}
          <div style={{ fontSize: 11, color: "#8593a8", fontWeight: 600, marginTop: 1 }}>{i.paymentDate ? prettyDate(i.paymentDate) : "—"}</div>
        </div>
        <div style={{ flex: "none" }}>
          <Chip tone={days !== null && days > 10 && !i.deliveryCompleted ? "red" : "grey"}>{days === null ? "—" : days + "d"}</Chip>
        </div>
        <div style={{ flex: "none", display: "flex", gap: 4, marginRight: 10 }}>
          <button style={abtn} title="Open invoice" onClick={() => openInvoice(i.id)}><Icon name="pen" /></button>
        </div>
      </div>
    );
  };

  const CollRow = ({ c }) => {
    const pr = collectionProgress(c);
    const done = pr.total > 0 && pr.pending === 0;
    const items = (c.items || []).reduce((t, it) => t + (Number(it.qty) || 0), 0);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #e6e9ef", borderRadius: 10, padding: "9px 12px 9px 0", marginBottom: 6, overflow: "hidden", flexWrap: "wrap" }}>
        <div style={{ width: 4, alignSelf: "stretch", borderRadius: "4px 0 0 4px", margin: "-9px 0", background: COLLECTION_BLUE, flex: "none" }} />
        <div style={{ flex: "1 1 190px", minWidth: 170 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => openCollection && openCollection(c.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14, color: COLLECTION_BLUE }}>
              COLLECTION — {c.supplier || "supplier"}
            </button>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: COLLECTION_BLUE }}>COL-{c.collectionNo || "—"}</span>
          </div>
          <div style={{ fontSize: 11.5, color: "#5a6a85", fontWeight: 600, marginTop: 2 }}>
            {[c.postcode, c.contact, c.phone].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        <div style={{ flex: "none", width: 96, fontSize: 12.5, fontWeight: 700, color: COLLECTION_BLUE }}>
          Pick up
          <div style={{ fontSize: 11, color: "#5a6a85", fontWeight: 600, marginTop: 1 }}>{c.van || "—"}</div>
        </div>
        <div style={{ flex: "none", width: 48, textAlign: "right", fontSize: 12.5, fontWeight: 700 }}>{items || "—"}<div style={{ fontSize: 10, color: "#8593a8", fontWeight: 600 }}>pcs</div></div>
        <div style={{ flex: "none", width: 48, textAlign: "right", fontSize: 12.5, fontWeight: 700 }}>{c.collectTime || "—"}</div>
        <div style={{ flex: "1 1 120px", fontSize: 12, fontWeight: 700 }}>
          {done ? (
            <Chip tone="green">Processed</Chip>
          ) : pr.done > 0 ? (
            <Chip tone="gold">{pr.done}/{pr.total} processed</Chip>
          ) : (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={c.collected}
                onChange={(e) => updateCrm((x) => {
                  const t = x.collections.find((y) => y.id === c.id);
                  if (t) t.collected = e.target.checked;
                  return x;
                })} />
              Collected
            </label>
          )}
        </div>
        <div style={{ flex: "none", display: "flex", gap: 4, marginRight: 10 }}>
          <button style={abtn} title="Open collection" onClick={() => openCollection && openCollection(c.id)}><Icon name="pen" /></button>
        </div>
      </div>
    );
  };

  const GroupHead = ({ label, meta, red }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, background: red ? RED : NAVY, color: "#fff", borderRadius: 10, padding: "10px 16px", margin: "18px 0 8px", flexWrap: "wrap" }}>
      <b style={{ color: red ? "#fff" : GOLD, fontSize: 15 }}>{label}</b>
      <span style={{ fontSize: 12.5, color: red ? "#ffd8dd" : "#cfd6e4", fontWeight: 600 }}>{meta}</span>
    </div>
  );

  const groupMeta = (rows) => {
    const invs = rows.filter((e) => e.kind === "inv").map((e) => e.obj);
    const cols = rows.filter((e) => e.kind === "col");
    const kg = invs.reduce((t, i) => t + (invoiceLoadKg(i, crm) || 0), 0);
    const vansUsed = [...new Set(rows.map((e) => e.obj.van).filter(Boolean))];
    return (
      invs.length + (invs.length === 1 ? " job" : " jobs") +
      (cols.length ? " · " + cols.length + (cols.length === 1 ? " collection" : " collections") : "") +
      (kg ? " · " + kg.toLocaleString("en-GB") + " kg loading" : "") +
      (vansUsed.length ? " · " + vansUsed.join(" + ") : "")
    );
  };

  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "16px 20px" }}>
      {/* filters */}
      <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px", marginBottom: 10 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 300 }}>
          <span style={{ position: "absolute", left: 11, top: 10 }}><Icon name="search" /></span>
          <input style={{ ...inp, paddingLeft: 34 }} placeholder="Search customer, postcode, inv #…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select style={{ ...inp, width: "auto" }} value={range} onChange={(e) => setRange(e.target.value)}>
          {RANGE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select style={{ ...inp, width: "auto" }} value={van} onChange={(e) => setVan(e.target.value)}>
          <option value="">All vans</option>
          {vans.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <label style={{ fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide completed
        </label>
        <span style={{ flex: 1 }} />
        {pending.length > 0 && <Chip tone="red">{pending.length} pending — no date</Chip>}
      </div>

      {/* legend */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", fontSize: 12, fontWeight: 600, color: "#5a6a85", margin: "0 0 4px 4px" }}>
        {[["Ready to go", STRIPE_COLOURS.green], ["Prep outstanding", STRIPE_COLOURS.amber], ["Customer collection", STRIPE_COLOURS.gold], ["Supplier collection", COLLECTION_BLUE], ["No date set", STRIPE_COLOURS.red]].map(([l, k]) => (
          <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: k, display: "inline-block" }} />{l}
          </span>
        ))}
        <span style={{ marginLeft: 10 }}>Prep: booked · courier · parts ordered · parts ready · payment link</span>
        <span>Follow-up: review asked · review in · photos · social · sample</span>
      </div>

      {groups.length === 0 && pending.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: "36px 10px", color: "#5a6a85", fontWeight: 600, marginTop: 14 }}>
          Nothing scheduled{q || van || hideDone ? " for these filters" : " yet"} — book a delivery date on an invoice and it appears here.
        </div>
      )}

      {groups.map((g) => (
        <div key={g.date}>
          <GroupHead label={dayLabel(g.date)} meta={groupMeta(g.rows)} />
          {g.rows.map((e) => (e.kind === "col" ? <CollRow key={e.obj.id} c={e.obj} /> : <Row key={e.obj.id} i={e.obj} />))}
        </div>
      ))}

      {pending.length > 0 && (
        <>
          <GroupHead red label="Pending — no date booked" meta={pending.length + " waiting to be booked in"} />
          {pending.map((e) => (e.kind === "col" ? <CollRow key={e.obj.id} c={e.obj} /> : <Row key={e.obj.id} i={e.obj} />))}
        </>
      )}
      <div style={{ height: 30 }} />
    </div>
  );
}
