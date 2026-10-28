// Schedule tab: the daily delivery board — invoices grouped by delivery date,
// workflow toggles inline, pending (undated) jobs at the bottom.
import { useState, useMemo } from "react";
import { NAVY, GOLD, RED, prettyDate } from "../../lib/core.js";
import {
  invoiceTotals, gbp, isPaid, scheduleStatus, STRIPE_COLOURS, daysSinceRaised,
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

export default function ScheduleScreen({ crm, updateCrm, openInvoice }) {
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
    return [...s].sort();
  }, [crm.invoices]);

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

  const dated = visible.filter((i) => i.deliveryDate).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate) || (a.deliveryTime || "").localeCompare(b.deliveryTime || ""));
  const pending = visible.filter((i) => !i.deliveryDate).sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const groups = [];
  dated.forEach((i) => {
    const g = groups[groups.length - 1];
    if (g && g.date === i.deliveryDate) g.rows.push(i);
    else groups.push({ date: i.deliveryDate, rows: [i] });
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
        <div style={{ flex: "none", width: 96, fontSize: 12.5, fontWeight: 700, color: i.jobType === "Collection" ? "#9a7408" : NAVY }}>
          {i.jobType || "—"}
          <div style={{ fontSize: 11, color: "#5a6a85", fontWeight: 600, marginTop: 1 }}>{i.van || (i.jobType === "Collection" ? "Customer pickup" : "—")}</div>
        </div>
        <div style={{ flex: "none", width: 48, textAlign: "right", fontSize: 12.5, fontWeight: 700 }}>{i.weightKg ? Number(i.weightKg).toLocaleString("en-GB") : "—"}</div>
        <div style={{ flex: "none", width: 48, textAlign: "right", fontSize: 12.5, fontWeight: 700 }}>{i.deliveryTime || "—"}</div>
        <div style={{ display: "flex", gap: 4, flex: "none" }}>
          {PREP_FLAGS.map(([k, label, icon]) => (
            <Tg key={k} on={i.flags[k]} na={k === "courier" && i.jobType === "Collection" && !i.flags[k]} title={label} icon={icon} onClick={() => setFlag(i.id, k)} />
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

  const GroupHead = ({ label, meta, red }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, background: red ? RED : NAVY, color: "#fff", borderRadius: 10, padding: "10px 16px", margin: "18px 0 8px", flexWrap: "wrap" }}>
      <b style={{ color: red ? "#fff" : GOLD, fontSize: 15 }}>{label}</b>
      <span style={{ fontSize: 12.5, color: red ? "#ffd8dd" : "#cfd6e4", fontWeight: 600 }}>{meta}</span>
    </div>
  );

  const groupMeta = (rows) => {
    const kg = rows.reduce((t, i) => t + (Number(i.weightKg) || 0), 0);
    const vansUsed = [...new Set(rows.map((i) => i.van).filter(Boolean))];
    return rows.length + (rows.length === 1 ? " job" : " jobs") + (kg ? " · " + kg.toLocaleString("en-GB") + " kg loading" : "") + (vansUsed.length ? " · " + vansUsed.join(" + ") : "");
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
        {[["Ready to go", "green"], ["Prep outstanding", "amber"], ["Collection", "gold"], ["No date set", "red"]].map(([l, k]) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: STRIPE_COLOURS[k], display: "inline-block" }} />{l}
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
          {g.rows.map((i) => <Row key={i.id} i={i} />)}
        </div>
      ))}

      {pending.length > 0 && (
        <>
          <GroupHead red label="Pending jobs — no delivery date" meta={pending.length + (pending.length === 1 ? " job" : " jobs") + " waiting to be booked in"} />
          {pending.map((i) => <Row key={i.id} i={i} />)}
        </>
      )}
      <div style={{ height: 30 }} />
    </div>
  );
}
