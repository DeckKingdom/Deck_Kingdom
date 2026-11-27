// The fixed-cost register: direct debits, standing orders and finance
// agreements (076, admin-only RLS). Each row carries its frequency, so the
// card and the snapshot work in monthly equivalents; renewal dates inside
// 60 days get flagged. Lives on the Business screen.
import { useEffect, useState } from "react";
import { NAVY, RED, prettyDate, addDays } from "../../lib/core.js";
import { gbp, today } from "../../lib/crmCore.js";
import { getSupabase } from "../../data/supabaseClient.js";
import { Icon, Chip, sect, card, abtn, inp, btn, goldBtn, selectAllProps } from "./ui.jsx";
import { COST_CENTRES, COST_CENTRE_LIST } from "../../lib/costCentres.js";

const uid = () => "cm-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const th = { fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 6px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap", textAlign: "left" };
const tdc = { padding: "6px 6px", borderBottom: "1px solid #f0f2f6", verticalAlign: "middle" };
const FREQS = { "Weekly": 52 / 12, "4-weekly": 13 / 12, "Monthly": 1, "Quarterly": 1 / 3, "Annual": 1 / 12 };
const METHODS = ["DD", "SO", "Card", "Bank"];
export const monthlyEq = (c) => (Number(c.amount) || 0) * (FREQS[c.freq] || 1);

// On the purchase entry: one button marks this supplier as a recurring
// DD/SO — it drops a prefilled row into the register (admins only; everyone
// else never sees the button, and the table's RLS backs that up).
export function RecurringMark({ supplierName, purchase, amount }) {
  const [state, setState] = useState("hidden"); // hidden | idle | in | busy
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (!supplierName) return;
        const { getMyAccess } = await import("../../data/auth.js");
        const acc = await getMyAccess();
        if (!acc || acc.role !== "admin") return;
        const sb = await getSupabase();
        const { data, error } = await sb.from("commitments").select("id,supplier").limit(1000);
        if (error || !live) return; // table not migrated yet -> stay hidden
        const hit = (data || []).some((c) => (c.supplier || "").trim().toLowerCase() === supplierName.trim().toLowerCase());
        setState(hit ? "in" : "idle");
      } catch (e) { /* stay hidden */ }
    })();
    return () => { live = false; };
  }, [supplierName]);

  const add = async () => {
    setState("busy");
    try {
      const sb = await getSupabase();
      const m = String(purchase.paymentMethod || "");
      const method = /standing|^so$/i.test(m) ? "SO" : /card/i.test(m) ? "Card" : /bank|transfer|bacs/i.test(m) ? "Bank" : "DD";
      const { error } = await sb.from("commitments").insert({
        id: uid(), name: (String(purchase.invDetail || "").split("\n")[0] || supplierName).slice(0, 48), supplier: supplierName,
        cost_centre: purchase.costCentre || "", cost_sub: purchase.costSub || "",
        amount: Number(amount) || 0, freq: "Monthly", method, start_date: purchase.invDate || "",
        term_months: 0, renewal_date: "", notes: "from PO " + (purchase.poNo || ""), active: true,
      });
      if (error) throw error;
      setState("in");
    } catch (e) { setState("idle"); window.alert("Couldn't add it to the register: " + ((e && e.message) || e)); }
  };

  if (state === "hidden") return null;
  if (state === "in") return <Chip tone="green">↻ In the fixed-cost register — edit it on the Business screen</Chip>;
  return (
    <button style={{ ...btn, justifyContent: "center" }} disabled={state === "busy"} onClick={add}
      title="A direct debit / standing order / subscription? One click puts it in the fixed-cost register on the Business screen, prefilled from this purchase — set the frequency and renewal date there.">
      <Icon name="refresh" size={14} />{state === "busy" ? "Adding…" : "Mark recurring (DD/SO)"}
    </button>
  );
}

export default function CommitmentsCard({ onLoaded }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const sb = await getSupabase();
      const { data, error } = await sb.from("commitments").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      setRows(data || []); setErr("");
      if (onLoaded) onLoaded(data || []);
    } catch (e) {
      const m = String((e && e.message) || e);
      setErr(/relation .* does not exist|42P01/i.test(m) ? "Run 076_commitments.sql in the Supabase SQL editor to add the fixed-cost register." : m);
      setRows([]);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (row) => {
    try {
      const sb = await getSupabase();
      const { error } = await sb.from("commitments").upsert({ ...row, updated_at: new Date().toISOString() });
      if (error) throw error;
      setErr("");
    } catch (e) { setErr(String((e && e.message) || e)); }
  };
  const patch = (id, up, persist) => setRows((rs) => {
    const next = rs.map((r) => (r.id === id ? { ...r, ...up } : r));
    if (persist) { const row = next.find((r) => r.id === id); if (row) save(row); }
    if (onLoaded) onLoaded(next);
    return next;
  });
  const removeRow = async (id) => {
    setRows((rs) => { const next = rs.filter((r) => r.id !== id); if (onLoaded) onLoaded(next); return next; });
    try { const sb = await getSupabase(); await sb.from("commitments").delete().eq("id", id); } catch (e) { setErr(String((e && e.message) || e)); }
  };
  const addRow = () => setRows((rs) => [{ id: uid(), name: "", supplier: "", cost_centre: "Premises", cost_sub: "", amount: 0, freq: "Monthly", method: "DD", start_date: "", term_months: 0, renewal_date: "", notes: "", active: true }, ...(rs || [])]);

  const live = (rows || []).filter((r) => r.active !== false);
  const totalMo = live.reduce((t, r) => t + monthlyEq(r), 0);
  const soon = addDays(today(), 60);
  const sel = (r, k, opts, w) => (
    <select style={{ ...inp, width: w || 110, padding: "5px 6px" }} value={r[k] || ""} onChange={(e) => patch(r.id, { [k]: e.target.value }, true)}>
      {k === "cost_sub" && <option value="">—</option>}
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  const txt = (r, k, w, ph, type) => (
    <input style={{ ...inp, width: w, padding: "5px 6px", ...(type === "number" ? { textAlign: "right" } : {}) }} type={type || "text"} step="0.01" placeholder={ph || ""}
      value={r[k] === 0 && type === "number" ? r[k] : r[k] || ""} {...selectAllProps}
      onChange={(e) => patch(r.id, { [k]: type === "number" ? (e.target.value === "" ? 0 : Number(e.target.value)) : e.target.value })} onBlur={() => patch(r.id, {}, true)} />
  );

  return (
    <div style={{ ...card, marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <p style={{ ...sect, margin: 0 }}>Direct debits, standing orders & agreements</p>
        <Chip tone="gold">{gbp(totalMo)}/month committed</Chip>
        <Chip>{gbp(totalMo * 12)}/year</Chip>
        <span style={{ flex: 1 }} />
        <button style={goldBtn} onClick={addRow}><Icon name="plus" stroke={NAVY} size={14} />Add commitment</button>
      </div>
      {err && <div style={{ background: "#fdeef0", border: "1px solid #ecc4cb", color: "#8a0b20", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, margin: "10px 0 0" }}>{err}</div>}
      {rows === null ? <div style={{ padding: 16, fontWeight: 700, color: "#5a6a85" }}>Loading…</div> : rows.length === 0 && !err ? (
        <div style={{ padding: "18px 4px 6px", color: "#5a6a85", fontWeight: 600 }}>Nothing registered yet — add the rent, utilities, FLT finance, insurances, software subs… anything that leaves the bank on a schedule.</div>
      ) : rows.length > 0 && (
        <div className="dk-bleed" style={{ overflowX: "auto", marginTop: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 1050 }}>
            <thead><tr>{["", "Name", "Supplier", "Cost centre", "Sub", "£ / payment", "Freq", "Via", "Term", "Renews", "≈ £/mo", "Notes", ""].map((h, i) => <th key={i} style={{ ...th, textAlign: h === "£ / payment" || h === "≈ £/mo" ? "right" : "left" }}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => {
                const renewing = r.active !== false && r.renewal_date && r.renewal_date <= soon;
                const overdue = renewing && r.renewal_date < today();
                return (
                  <tr key={r.id} style={{ opacity: r.active === false ? 0.45 : 1, background: renewing ? "#fdf4e3" : "" }}>
                    <td style={tdc}><input type="checkbox" title="Active — untick when cancelled" checked={r.active !== false} onChange={(e) => patch(r.id, { active: e.target.checked }, true)} /></td>
                    <td style={tdc}>{txt(r, "name", 140, "Unit rent")}</td>
                    <td style={tdc}>{txt(r, "supplier", 120, "Who")}</td>
                    <td style={tdc}>{sel(r, "cost_centre", COST_CENTRE_LIST, 150)}</td>
                    <td style={tdc}>{sel(r, "cost_sub", COST_CENTRES[r.cost_centre] || [], 130)}</td>
                    <td style={tdc}>{txt(r, "amount", 86, "", "number")}</td>
                    <td style={tdc}>{sel(r, "freq", Object.keys(FREQS), 96)}</td>
                    <td style={tdc}>{sel(r, "method", METHODS, 70)}</td>
                    <td style={tdc}><div style={{ display: "flex", alignItems: "center", gap: 4 }}>{txt(r, "term_months", 52, "0", "number")}<span style={{ fontSize: 11, color: "#8593a8", fontWeight: 700 }}>mo</span></div></td>
                    <td style={tdc}>
                      <input style={{ ...inp, width: 128, padding: "5px 6px", ...(renewing ? { borderColor: overdue ? RED : "#d99a2b" } : {}) }} type="date" value={r.renewal_date || ""} onChange={(e) => patch(r.id, { renewal_date: e.target.value }, true)} />
                      {renewing && <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: overdue ? RED : "#a05f10" }}>{overdue ? "passed — check it" : "renews " + prettyDate(r.renewal_date)}</span>}
                    </td>
                    <td style={{ ...tdc, textAlign: "right", fontWeight: 700 }}>{r.active === false ? "—" : gbp(monthlyEq(r))}</td>
                    <td style={tdc}>{txt(r, "notes", 130, "—")}</td>
                    <td style={{ ...tdc, textAlign: "right" }}><button style={abtn} title="Delete" onClick={() => removeRow(r.id)}><Icon name="x" stroke={RED} size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, margin: "8px 2px 0" }}>
        Term 0 = rolling. Renewals inside 60 days highlight amber, passed dates red. Cancelled ones stay (unticked) so the history keeps its shape.
      </p>
    </div>
  );
}
