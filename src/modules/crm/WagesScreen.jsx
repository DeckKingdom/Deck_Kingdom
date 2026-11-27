// Wages: keyed in monthly, admin eyes only. The table lives behind its own
// row-level security (075: dk_is_admin), so nothing here ever reaches staff
// logins or the shared CRM payload — the screen talks to the table directly.
// Employer cost of a row = gross + employer NI + pension + other.
import { useEffect, useMemo, useState } from "react";
import { NAVY, RED } from "../../lib/core.js";
import { gbp } from "../../lib/crmCore.js";
import { getSupabase } from "../../data/supabaseClient.js";
import { Icon, Chip, sect, card, abtn, inp, btn, goldBtn, selectAllProps, ListHero, HeroStat } from "./ui.jsx";

const uid = () => "wg-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const th = { fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap", textAlign: "left" };
const tdc = { padding: "7px 8px", borderBottom: "1px solid #f0f2f6" };
const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
export const wageCost = (w) => num(w.gross) + num(w.emp_ni) + num(w.pension) + num(w.other);
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function WagesScreen() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const sb = await getSupabase();
      const { data, error } = await sb.from("wages").select("*").order("month", { ascending: false }).order("person");
      if (error) throw error;
      setRows(data || []); setErr("");
    } catch (e) {
      const m = String((e && e.message) || e);
      setErr(/relation .* does not exist|42P01/i.test(m) ? "The wages table isn't in the database yet — run 075_cost_centres_wages.sql in the Supabase SQL editor." : m);
      setRows([]);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (row) => {
    setSaving(true);
    try {
      const sb = await getSupabase();
      const { error } = await sb.from("wages").upsert({ ...row, updated_at: new Date().toISOString() });
      if (error) throw error;
      setErr("");
    } catch (e) { setErr(String((e && e.message) || e)); }
    setSaving(false);
  };
  const patch = (id, up, persist) => setRows((rs) => {
    const next = rs.map((r) => (r.id === id ? { ...r, ...up } : r));
    if (persist) { const row = next.find((r) => r.id === id); if (row) save(row); }
    return next;
  });
  const removeRow = async (id) => {
    setRows((rs) => rs.filter((r) => r.id !== id));
    try { const sb = await getSupabase(); await sb.from("wages").delete().eq("id", id); } catch (e) { setErr(String((e && e.message) || e)); }
  };
  const addRow = (month, person) => {
    const row = { id: uid(), month: month || thisMonth(), person: person || "", gross: 0, emp_ni: 0, pension: 0, other: 0, notes: "", paid_date: "" };
    setRows((rs) => [row, ...(rs || [])]);
  };
  const copyLastMonth = () => {
    const months = [...new Set((rows || []).map((r) => r.month))].sort().reverse();
    const src = months[0];
    if (!src) return addRow();
    const target = thisMonth() === src ? null : thisMonth();
    if (!target) return;
    (rows || []).filter((r) => r.month === src).forEach((r) => {
      const row = { ...r, id: uid(), month: target, paid_date: "" };
      setRows((rs) => [row, ...rs]); save(row);
    });
  };

  const byMonth = useMemo(() => {
    const m = new Map();
    (rows || []).forEach((r) => { if (!m.has(r.month)) m.set(r.month, []); m.get(r.month).push(r); });
    return [...m.entries()].sort((a, z) => (a[0] < z[0] ? 1 : -1));
  }, [rows]);
  const last12 = useMemo(() => {
    const cut = new Date(); cut.setMonth(cut.getMonth() - 12);
    const key = cut.toISOString().slice(0, 7);
    return (rows || []).filter((r) => r.month > key).reduce((t, r) => t + wageCost(r), 0);
  }, [rows]);
  const cell = (r, k, w) => (
    <input style={{ ...inp, width: w || 92, textAlign: "right", padding: "5px 8px" }} type="number" step="0.01" value={r[k]} {...selectAllProps}
      onChange={(e) => patch(r.id, { [k]: e.target.value === "" ? 0 : Number(e.target.value) })} onBlur={() => patch(r.id, {}, true)} />
  );

  if (rows === null) return <div style={{ padding: 30, fontWeight: 700, color: "#5a6a85" }}>Loading wages…</div>;
  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: "0 4px" }}>
      <ListHero title="Wages" sub="Admin only — gross pay plus employer NI and pension, keyed in per person per month. The business snapshot folds these into Staff costs."
        action={<div style={{ display: "flex", gap: 8 }}>
          <button style={btn} onClick={copyLastMonth} title="Copy the most recent month's people and figures into this month"><Icon name="refresh" size={14} />Copy last month</button>
          <button style={goldBtn} onClick={() => addRow()}><Icon name="plus" stroke={NAVY} size={14} />Add row</button>
        </div>}>
        <HeroStat label="Last 12 months" value={gbp(last12)} />
        <HeroStat label="≈ monthly" value={gbp(last12 / 12)} />
      </ListHero>
      {err && <div style={{ background: "#fdeef0", border: "1px solid #ecc4cb", color: "#8a0b20", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, margin: "10px 0" }}>{err}</div>}
      {byMonth.map(([month, list]) => {
        const tot = list.reduce((t, r) => t + wageCost(r), 0);
        return (
          <div key={month} style={{ ...card, marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <p style={{ ...sect, margin: 0 }}>{month}</p>
              <Chip tone="gold">{gbp(tot)} employer cost</Chip>
              <span style={{ flex: 1 }} />
              <button style={{ ...btn, padding: "4px 10px", fontSize: 12 }} onClick={() => addRow(month)}><Icon name="plus" size={12} />Person</button>
            </div>
            <div className="dk-bleed" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
                <thead><tr>{["Person", "Gross £", "Emp NI £", "Pension £", "Other £", "Employer cost", "Paid", "Notes", ""].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td style={tdc}><input style={{ ...inp, width: 150, padding: "5px 8px" }} value={r.person} placeholder="Name" {...selectAllProps}
                        onChange={(e) => patch(r.id, { person: e.target.value })} onBlur={() => patch(r.id, {}, true)} /></td>
                      <td style={tdc}>{cell(r, "gross")}</td>
                      <td style={tdc}>{cell(r, "emp_ni")}</td>
                      <td style={tdc}>{cell(r, "pension")}</td>
                      <td style={tdc}>{cell(r, "other")}</td>
                      <td style={{ ...tdc, fontWeight: 700, textAlign: "right" }}>{gbp(wageCost(r))}</td>
                      <td style={tdc}><input style={{ ...inp, width: 130, padding: "5px 8px" }} type="date" value={r.paid_date || ""}
                        onChange={(e) => patch(r.id, { paid_date: e.target.value }, true)} /></td>
                      <td style={tdc}><input style={{ ...inp, width: 160, padding: "5px 8px" }} value={r.notes || ""} placeholder="—" {...selectAllProps}
                        onChange={(e) => patch(r.id, { notes: e.target.value })} onBlur={() => patch(r.id, {}, true)} /></td>
                      <td style={{ ...tdc, textAlign: "right" }}><button style={abtn} title="Delete row" onClick={() => removeRow(r.id)}><Icon name="x" stroke={RED} size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {!byMonth.length && !err && <div style={{ ...card, marginTop: 12, textAlign: "center", color: "#5a6a85", fontWeight: 600, padding: 28 }}>No wages keyed in yet — Add row to start this month.</div>}
      {saving && <div style={{ position: "fixed", bottom: 14, right: 16, fontSize: 12, fontWeight: 700, color: "#5a6a85" }}>Saving…</div>}
    </div>
  );
}

// the snapshot needs monthly totals without rendering this screen
export async function fetchWageMonths() {
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.from("wages").select("month,gross,emp_ni,pension,other");
    if (error) throw error;
    const m = {};
    (data || []).forEach((r) => { m[r.month] = (m[r.month] || 0) + wageCost(r); });
    return m;
  } catch (e) { return null; }
}
