// Activity: the audit trail — every create / update / delete across the
// whole system, recorded by database triggers and read here.
import { useState, useEffect, useMemo } from "react";
import { NAVY, GOLD, RED, prettyDateTime } from "../../lib/core.js";
import { fetchAuditLog } from "../../data/crmSupabase.js";
import { Icon, Chip, sect, card, inp, btn } from "./ui.jsx";

const TABLE_LABELS = {
  customers: "Customer",
  customer_sites: "Site",
  invoices: "Invoice",
  invoice_items: "Invoice line",
  products: "Product",
  shipments: "Shipment",
  shipment_lines: "Shipment line",
  crm_settings: "Settings",
};
const ACTION_TONES = { created: "green", updated: "gold", deleted: "red" };

const human = (k) =>
  k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()).replace("Gbp", "£").replace("Usd", "$").replace("Fx", "FX");

const fmtVal = (v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (v === true) return "yes";
  if (v === false) return "no";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

// "updated" changes are {field: {from, to}}; created/deleted hold a row snapshot
const pick = (changes, key) => {
  const v = changes ? changes[key] : undefined;
  if (v && typeof v === "object" && ("to" in v || "from" in v)) return v.to !== undefined && v.to !== null ? v.to : v.from;
  return v;
};

export default function ActivityScreen({ crm, data, storageMode }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const [who, setWho] = useState("");
  const [what, setWhat] = useState("");
  const [open, setOpen] = useState(null);

  const live = storageMode === "supabase";

  const load = async (beforeId) => {
    try {
      const rows = await fetchAuditLog(200, beforeId);
      setEntries((e) => (beforeId ? [...(e || []), ...rows] : rows));
      if (rows.length < 200) setDone(true);
      setError("");
    } catch (e) {
      setError(String((e && e.message) || e));
    }
  };

  useEffect(() => {
    if (live) load();
  }, []);

  const byId = useMemo(() => {
    const m = { customers: {}, customer_sites: {}, invoices: {}, products: {}, shipments: {} };
    if (crm) {
      crm.customers.forEach((c) => (m.customers[c.id] = c.name || "Account #" + (c.accountNo || "—")));
      crm.sites.forEach((s) => (m.customer_sites[s.id] = s.name || s.address || "Site #" + (s.siteNo || "—")));
      crm.invoices.forEach((i) => (m.invoices[i.id] = "#" + (i.invNo || "—")));
    }
    if (data) {
      data.products.forEach((p) => (m.products[p.id] = p.name));
      data.shipments.forEach((s) => (m.shipments[s.id] = s.name));
    }
    return m;
  }, [crm, data]);

  const labelFor = (e) => {
    const map = byId[e.table_name];
    if (map && map[e.record_id]) return map[e.record_id];
    const c = e.changes || {};
    return (
      fmtVal(pick(c, "name")) !== "—" ? fmtVal(pick(c, "name"))
      : pick(c, "inv_no") !== undefined ? "#" + fmtVal(pick(c, "inv_no"))
      : fmtVal(pick(c, "description")) !== "—" ? fmtVal(pick(c, "description"))
      : pick(c, "key") !== undefined ? fmtVal(pick(c, "key"))
      : e.record_id ? e.record_id.slice(0, 8) : "—"
    );
  };

  const actors = useMemo(() => [...new Set((entries || []).map((e) => e.actor))].sort(), [entries]);

  const filtered = (entries || []).filter((e) => {
    if (who && e.actor !== who) return false;
    if (what && e.table_name !== what) return false;
    return true;
  });

  // group by day
  const groups = [];
  filtered.forEach((e) => {
    const day = (e.at || "").slice(0, 10);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.rows.push(e);
    else groups.push({ day, rows: [e] });
  });

  const dayLabel = (d) => {
    const x = new Date(d + "T00:00:00");
    return isNaN(x.getTime()) ? d : x.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  };

  if (!live)
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "18px 22px" }}>
        <div style={{ ...card, textAlign: "center", padding: "36px 20px" }}>
          <div style={{ display: "inline-flex", width: 46, height: 46, borderRadius: 12, background: NAVY, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Icon name="clock" size={22} stroke={GOLD} />
          </div>
          <p style={{ fontWeight: 700, fontSize: 16, margin: "0 0 6px" }}>The activity log lives in the real database</p>
          <p style={{ fontSize: 13.5, color: "#5a6a85", fontWeight: 600, margin: 0 }}>
            Every create, edit and delete is recorded automatically — who did it, when, and exactly which fields changed.
            This design preview has no database, so open ops.deckkingdom.co.uk to see it in action.
          </p>
        </div>
      </div>
    );

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "18px 22px" }}>
      <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px" }}>
        <select style={{ ...inp, width: "auto" }} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Everyone</option>
          {actors.map((a) => <option key={a} value={a}>{a.split("@")[0]}</option>)}
        </select>
        <select style={{ ...inp, width: "auto" }} value={what} onChange={(e) => setWhat(e.target.value)}>
          <option value="">Everything</option>
          {Object.entries(TABLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}s</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "#5a6a85", fontWeight: 700 }}>
          {entries === null ? "Loading…" : filtered.length.toLocaleString("en-GB") + " entries" + (done ? "" : " (more available)")}
        </span>
      </div>

      {error && (
        <div style={{ ...card, borderColor: RED, fontWeight: 600, fontSize: 13 }}>
          Couldn't load the log: {error}. If 004_audit.sql hasn't been run in Supabase yet, run it and refresh.
        </div>
      )}

      {entries !== null && filtered.length === 0 && !error && (
        <div style={{ ...card, textAlign: "center", padding: "30px 10px", color: "#5a6a85", fontWeight: 600 }}>
          Nothing in the log yet — it starts recording from the moment 004_audit.sql is run.
        </div>
      )}

      {groups.map((g) => (
        <div key={g.day}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: NAVY, color: "#fff", borderRadius: 10, padding: "9px 16px", margin: "16px 0 8px" }}>
            <b style={{ color: GOLD, fontSize: 14 }}>{dayLabel(g.day)}</b>
            <span style={{ fontSize: 12, color: "#cfd6e4", fontWeight: 600 }}>{g.rows.length} changes</span>
          </div>
          {g.rows.map((e) => {
            const isOpen = open === e.id;
            const changeKeys = e.action === "updated" ? Object.keys(e.changes || {}) : [];
            return (
              <div key={e.id} style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 10, padding: "9px 13px", marginBottom: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", cursor: "pointer" }} onClick={() => setOpen(isOpen ? null : e.id)}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "#8593a8", width: 42 }}>{(e.at || "").slice(11, 16)}</span>
                  <Chip>{(e.actor || "system").split("@")[0]}</Chip>
                  <Chip tone={ACTION_TONES[e.action] || "grey"}>{e.action}</Chip>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#5a6a85" }}>{TABLE_LABELS[e.table_name] || e.table_name}</span>
                  <b style={{ fontSize: 13.5 }}>{labelFor(e)}</b>
                  {e.action === "updated" && (
                    <span style={{ fontSize: 12, color: "#8593a8", fontWeight: 600 }}>
                      {changeKeys.slice(0, 3).map(human).join(", ")}{changeKeys.length > 3 ? " +" + (changeKeys.length - 3) : ""}
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#aab3c2", fontWeight: 700 }}>{isOpen ? "▲" : "▼"}</span>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 9, borderTop: "1px solid #f0f2f6", paddingTop: 8, fontSize: 12.5 }}>
                    <div style={{ color: "#8593a8", fontWeight: 600, marginBottom: 6 }}>{prettyDateTime(e.at)} · {e.actor}</div>
                    {e.action === "updated" ? (
                      changeKeys.map((k) => (
                        <div key={k} style={{ display: "flex", gap: 8, padding: "3px 0", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, minWidth: 130 }}>{human(k)}</span>
                          <span style={{ color: "#a05f10", textDecoration: "line-through" }}>{fmtVal(e.changes[k] && e.changes[k].from)}</span>
                          <span style={{ color: "#8593a8" }}>→</span>
                          <span style={{ color: "#28713e", fontWeight: 700 }}>{fmtVal(e.changes[k] && e.changes[k].to)}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ display: "flex", gap: "4px 16px", flexWrap: "wrap" }}>
                        {Object.entries(e.changes || {})
                          .filter(([, v]) => v !== "" && v !== null && v !== false && !(Array.isArray(v) && !v.length))
                          .slice(0, 14)
                          .map(([k, v]) => (
                            <span key={k}><span style={{ fontWeight: 700 }}>{human(k)}:</span> {fmtVal(v)}</span>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {entries !== null && !done && filtered.length > 0 && (
        <button
          style={{ ...btn, width: "100%", justifyContent: "center", marginTop: 10, opacity: loadingMore ? 0.6 : 1 }}
          disabled={loadingMore}
          onClick={async () => {
            setLoadingMore(true);
            await load(entries[entries.length - 1].id);
            setLoadingMore(false);
          }}
        >
          Load older entries
        </button>
      )}
      <div style={{ height: 30 }} />
    </div>
  );
}
