// Bank: statements in, payments assigned. Admin only (bank_transactions sits
// behind dk_is_admin RLS, 080). Import Virgin Money PDFs or CSV exports; each
// transaction is matched (lib/bankMatch.js) — sure ones are applied straight
// away (invoices marked paid, purchase payments recorded, wages totted up),
// the rest wait below for a yes / a different answer.
import { useEffect, useMemo, useRef, useState } from "react";
import { NAVY, RED, prettyDate } from "../../lib/core.js";
import { gbp, findSupplierByName, blankSupplier } from "../../lib/crmCore.js";
import { getSupabase } from "../../data/supabaseClient.js";
import { readStatementFile, txId } from "../../lib/bankParse.js";
import { buildContext, suggest, applyMatch, payeeOf } from "../../lib/bankMatch.js";
import { Icon, Chip, sect, card, inp, btn, goldBtn, ListHero, HeroStat } from "./ui.jsx";

const th = { fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap", textAlign: "left" };
const tdc = { padding: "7px 8px", borderBottom: "1px solid #f0f2f6", verticalAlign: "middle" };
const r2 = (n) => Math.round(n * 100) / 100;
const NOOP = ["takings", "transfer", "covered", "purchase-paid", "invoice-paid"];
const ACTIONS = [["accept", "✓ Suggestion"], ["wages", "Wages…"], ["new-purchase", "New purchase…"], ["takings", "Takings"], ["transfer", "Own money / transfer"], ["covered", "Already on the ledger"], ["ignore", "Ignore"]];

async function loadAll(sb) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("bank_transactions").select("*").order("tx_date", { ascending: false }).order("seq", { ascending: false }).range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

// wages for each person-month = the bank payments matched to them; a hand-keyed payroll row is never overwritten
async function syncWages(sb, rows) {
  const sums = {};
  rows.filter((r) => r.status === "matched" && r.match_kind === "wages" && r.match_ref).forEach((r) => {
    const k = r.tx_date.slice(0, 7) + "|" + r.match_ref;
    sums[k] = sums[k] || { amt: 0, n: 0 }; sums[k].amt += Math.abs(Number(r.amount) || 0); sums[k].n++;
  });
  const { data: wages, error } = await sb.from("wages").select("*");
  if (error) return 0;
  const ups = [];
  Object.entries(sums).forEach(([k, v]) => {
    const [month, person] = k.split("|");
    const ex = (wages || []).find((w) => w.month === month && String(w.person || "").toLowerCase() === person.toLowerCase());
    const fromBank = !ex || String(ex.id).startsWith("wg-bank-") || /^net paid from bank/i.test(ex.notes || "");
    if (!fromBank) return;
    const gross = r2(v.amt);
    if (ex && Math.abs(Number(ex.gross) - gross) < 0.01) return;
    const notes = "net paid from bank · " + v.n + " payment" + (v.n > 1 ? "s" : "");
    ups.push(ex ? { ...ex, gross, notes, updated_at: new Date().toISOString() }
      : { id: "wg-bank-" + month + "-" + person.toLowerCase().replace(/[^a-z]/g, "").slice(0, 12), month, person, gross, emp_ni: 0, pension: 0, other: 0, notes, paid_date: "" });
  });
  if (ups.length) await sb.from("wages").upsert(ups);
  return ups.length;
}

export default function BankScreen({ crm, updateCrm, me, crmFull }) {
  const [rows, setRows] = useState(null);
  const [people, setPeople] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [view, setView] = useState("review"); // review | matched | all
  const [q, setQ] = useState("");
  const [choice, setChoice] = useState({}); // row id -> { action, person, supplier }
  const fileRef = useRef(null);

  const load = async () => {
    try {
      const sb = await getSupabase();
      const [all, w] = await Promise.all([loadAll(sb), sb.from("wages").select("person")]);
      setRows(all);
      setPeople([...new Set(((w && w.data) || []).map((x) => x.person).filter(Boolean))]);
      setErr("");
    } catch (e) {
      const m = String((e && e.message) || e);
      setErr(/relation .* does not exist|42P01/i.test(m) ? "Run 080_part_payments_bank.sql in the Supabase SQL editor first — it adds the bank table." : m);
      setRows([]);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (list) => {
    const sb = await getSupabase();
    for (let i = 0; i < list.length; i += 500) {
      const { error } = await sb.from("bank_transactions").upsert(list.slice(i, i + 500).map((r) => ({ ...r, updated_at: new Date().toISOString() })));
      if (error) throw error;
    }
  };

  // match every "new" row: sure ones applied, the rest parked for review
  const runMatching = async (all) => {
    const fresh = all.filter((r) => r.status === "new");
    if (!fresh.length) return { applied: 0, review: 0 };
    const ctx = buildContext(crm, people.length ? people : []);
    const decided = fresh.map((r) => {
      const tx = { id: r.id, date: r.tx_date, description: r.description, type: r.tx_type, amount: Number(r.amount) };
      return { r, tx, m: suggest(tx, ctx) };
    });
    const autos = decided.filter((d) => d.m.auto);
    if (autos.some((d) => !NOOP.includes(d.m.kind) && d.m.kind !== "wages")) {
      updateCrm((c) => { autos.forEach((d) => applyMatch(c, d.tx, d.m, me)); return c; });
    }
    const upd = decided.map(({ r, m }) => ({
      ...r, status: m.auto ? "matched" : "review", match_kind: m.kind, match_ref: m.ref || m.person || m.supplierId || "", match_label: m.label,
    }));
    await save(upd);
    const merged = all.map((r) => upd.find((u) => u.id === r.id) || r);
    setRows(merged);
    await syncWages(await getSupabase(), merged);
    return { applied: autos.length, review: decided.length - autos.length };
  };

  const importFiles = async (files) => {
    if (!files.length) return;
    if (!crmFull) { setErr("The full ledger is still loading in the background — give it a few seconds and try again, so the matching sees every purchase."); return; }
    setErr(""); setNote("");
    try {
      const known = new Set((rows || []).map((r) => r.id));
      const add = [];
      for (const f of files) {
        setBusy("Reading " + f.name + "…");
        const txs = await readStatementFile(f);
        if (!txs.length) throw new Error(f.name + ": no transactions found — is it a Virgin Money statement PDF or a CSV export?");
        for (const t of txs) {
          const id = await txId(t);
          if (known.has(id)) continue;
          known.add(id);
          add.push({ id, tx_date: t.date, description: t.description, tx_type: t.type, amount: t.amount, balance: t.balance, seq: t.seq, source: f.name, status: "new", match_kind: "", match_ref: "", match_label: "", note: "" });
        }
      }
      setBusy("Saving " + add.length + " new transactions…");
      if (add.length) await save(add);
      const all = [...add, ...(rows || [])].sort((a, z) => (z.tx_date + String(z.seq).padStart(5, "0")).localeCompare(a.tx_date + String(a.seq).padStart(5, "0")));
      setBusy("Matching…");
      const res = await runMatching(all);
      setNote(add.length ? add.length + " new transactions · " + res.applied + " assigned automatically · " + res.review + " to check below" : "Nothing new — those statements are already in.");
    } catch (e) { setErr(String((e && e.message) || e)); }
    setBusy("");
  };

  // apply one row's answer (the suggestion, or what was picked instead)
  const resolve = (row, ch) => {
    const tx = { id: row.id, date: row.tx_date, description: row.description, type: row.tx_type, amount: Number(row.amount) };
    const action = (ch && ch.action) || "accept";
    let m;
    if (action === "accept") m = { kind: row.match_kind, ref: row.match_ref, supplierId: row.match_ref, person: row.match_ref, label: row.match_label };
    else if (action === "wages") m = { kind: "wages", ref: (ch.person || "").trim(), label: "Wages · " + (ch.person || "").trim() };
    else if (action === "new-purchase") m = { kind: "new-purchase", supplierName: (ch.supplier || "").trim(), label: "New purchase · " + (ch.supplier || "").trim() };
    else m = { kind: action, ref: "", label: ACTIONS.find((a) => a[0] === action)[1] };
    if (m.kind === "review" || (m.kind === "wages" && !m.ref) || (m.kind === "new-purchase" && action === "new-purchase" && !m.supplierName)) return null;
    return { tx, m };
  };

  const applyRows = async (list) => {
    const todo = list.map(({ row, ch }) => ({ row, res: resolve(row, ch) })).filter((x) => x.res);
    if (!todo.length) return;
    setBusy("Applying " + todo.length + "…");
    try {
      updateCrm((c) => {
        todo.forEach(({ res }) => {
          const m = res.m;
          if (m.kind === "new-purchase" && m.supplierName) {
            let s = findSupplierByName(c, m.supplierName);
            if (!s) { s = { ...blankSupplier(), name: m.supplierName }; c.suppliers = [...(c.suppliers || []), s]; }
            m.supplierId = s.id;
          }
          if (["invoice", "invoices", "purchase", "purchase-part", "new-purchase"].includes(m.kind)) applyMatch(c, res.tx, m, me);
        });
        return c;
      });
      const upd = todo.map(({ row, res }) => ({ ...row, status: res.m.kind === "ignore" ? "ignored" : "matched", match_kind: res.m.kind, match_ref: res.m.ref || res.m.supplierId || "", match_label: res.m.label }));
      await save(upd);
      const merged = (rows || []).map((r) => upd.find((u) => u.id === r.id) || r);
      setRows(merged);
      setChoice((c) => { const n = { ...c }; todo.forEach(({ row }) => delete n[row.id]); return n; });
      if (upd.some((u) => u.match_kind === "wages")) await syncWages(await getSupabase(), merged);
    } catch (e) { setErr(String((e && e.message) || e)); }
    setBusy("");
  };

  const latest = (rows || []).find((r) => r.balance !== null && r.balance !== undefined);
  const review = (rows || []).filter((r) => r.status === "review" || r.status === "new");
  const months = useMemo(() => {
    const m = {};
    (rows || []).forEach((r) => { const k = r.tx_date.slice(0, 7); m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).sort();
  }, [rows]);
  const shown = (rows || []).filter((r) => (view === "review" ? r.status === "review" || r.status === "new" : view === "matched" ? r.status === "matched" || r.status === "ignored" : true))
    .filter((r) => !q || (r.description + " " + r.match_label + " " + r.amount).toLowerCase().includes(q.toLowerCase()));
  const supNames = useMemo(() => (crm.suppliers || []).map((s) => s.name).filter(Boolean).sort(), [crm]);

  if (rows === null) return <div style={{ padding: 30, fontWeight: 700, color: "#5a6a85" }}>Loading the bank…</div>;
  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 4px" }}>
      <ListHero title="Bank" sub="Statements in, payments assigned — invoices marked paid, purchase payments recorded, wages totted up. Admin only."
        action={<>
          <input ref={fileRef} type="file" accept=".pdf,.csv,application/pdf,text/csv" multiple style={{ display: "none" }}
            onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ""; importFiles(f); }} />
          <button style={goldBtn} disabled={!!busy} onClick={() => fileRef.current && fileRef.current.click()}><Icon name="plus" stroke={NAVY} size={14} />Import statements</button>
        </>}>
        <HeroStat label="Balance" value={latest ? gbp(Number(latest.balance)) : "—"} sub={latest ? "as at " + prettyDate(latest.tx_date) : "import a statement"} />
        <HeroStat label="To check" value={String(review.length)} sub="transactions waiting for you" tone={review.length ? "#ffd27a" : undefined} />
        <HeroStat label="Assigned" value={String((rows || []).filter((r) => r.status === "matched").length)} sub={months.length ? months.length + " months · " + months[0] + " → " + months[months.length - 1] : "nothing yet"} />
      </ListHero>

      {busy && <div style={{ ...card, fontWeight: 700, color: "#5a6a85" }}>{busy}</div>}
      {err && <div style={{ background: "#fdeef0", border: "1px solid #ecc4cb", color: "#8a0b20", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>{err}</div>}
      {note && <div style={{ background: "#eef7f0", border: "1px solid #bfe3c8", color: "#1e5e33", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, marginBottom: 12 }}>{note}</div>}

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {[["review", "To check (" + review.length + ")"], ["matched", "Assigned"], ["all", "All"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{ border: "1px solid " + (view === k ? NAVY : "#dfe4ec"), background: view === k ? NAVY : "#fff", color: view === k ? "#fff" : NAVY, borderRadius: 999, padding: "6px 14px", fontFamily: "inherit", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>{l}</button>
          ))}
          <input style={{ ...inp, width: 220 }} placeholder="Search payee, amount…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span style={{ flex: 1 }} />
          {view === "review" && review.some((r) => r.match_kind && r.match_kind !== "review") && (
            <button style={goldBtn} disabled={!!busy} title="Accept every suggestion on the list (rows with no suggestion are left)"
              onClick={() => applyRows(shown.filter((r) => r.match_kind && r.match_kind !== "review").map((row) => ({ row, ch: choice[row.id] })))}>
              <Icon name="ready" stroke={NAVY} size={14} />Accept all suggestions
            </button>
          )}
        </div>
        <datalist id="dk-bank-sups">{supNames.map((n) => <option key={n} value={n} />)}</datalist>
        <datalist id="dk-bank-people">{people.map((n) => <option key={n} value={n} />)}</datalist>
        {shown.length === 0 ? (
          <div style={{ padding: "18px 4px", color: "#5a6a85", fontWeight: 600 }}>{rows.length ? (view === "review" ? "Nothing to check — every transaction is assigned." : "Nothing here.") : "No statements yet — Import statements and pick the PDFs (or CSV exports) from Virgin Money."}</div>
        ) : (
          <div className="dk-bleed" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 980 }}>
              <thead><tr>{["Date", "Payee / reference", "In / out", "Assigned to", view === "review" ? "Your call" : "", ""].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 2 ? "right" : "left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {shown.slice(0, 300).map((r) => {
                  const ch = choice[r.id] || {};
                  const act = ch.action || (r.match_kind && r.match_kind !== "review" ? "accept" : "");
                  const setCh = (up) => setChoice((c) => ({ ...c, [r.id]: { ...ch, action: act, ...up } }));
                  const amt = Number(r.amount);
                  return (
                    <tr key={r.id} style={{ opacity: r.status === "ignored" ? 0.5 : 1 }}>
                      <td style={{ ...tdc, whiteSpace: "nowrap", fontWeight: 700 }}>{prettyDate(r.tx_date)}</td>
                      <td style={{ ...tdc, maxWidth: 360 }}>
                        <b>{payeeOf(r.description)}</b>
                        <span style={{ display: "block", fontSize: 11.5, color: "#8593a8", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}{r.tx_type ? " · " + r.tx_type : ""}</span>
                      </td>
                      <td style={{ ...tdc, textAlign: "right", fontWeight: 800, color: amt >= 0 ? "#1e5e33" : NAVY, whiteSpace: "nowrap" }}>{amt >= 0 ? "+" : "−"}{gbp(Math.abs(amt))}</td>
                      <td style={{ ...tdc, fontSize: 12, fontWeight: 600, color: r.status === "matched" ? "#1e5e33" : r.match_kind === "review" ? "#8a0b20" : "#a05f10" }}>{r.match_label || "—"}</td>
                      {view === "review" && r.status !== "matched" ? (
                        <td style={tdc}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <select style={{ ...inp, width: 150, padding: "5px 6px" }} value={act} onChange={(e) => setCh({ action: e.target.value })}>
                              {!act && <option value="">— choose —</option>}
                              {ACTIONS.filter(([k]) => k !== "accept" || (r.match_kind && r.match_kind !== "review")).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </select>
                            {act === "wages" && <input style={{ ...inp, width: 140, padding: "5px 6px" }} list="dk-bank-people" placeholder="Person" value={ch.person || ""} onChange={(e) => setCh({ person: e.target.value })} />}
                            {act === "new-purchase" && <input style={{ ...inp, width: 160, padding: "5px 6px" }} list="dk-bank-sups" placeholder="Supplier" value={ch.supplier || ""} onChange={(e) => setCh({ supplier: e.target.value })} />}
                          </div>
                        </td>
                      ) : <td style={tdc}>{r.status === "ignored" ? <Chip>ignored</Chip> : r.status === "matched" ? <Chip tone="green">✓</Chip> : null}</td>}
                      <td style={{ ...tdc, textAlign: "right" }}>
                        {view === "review" && r.status !== "matched" && (
                          <button style={{ ...btn, padding: "5px 10px", fontSize: 12 }} disabled={!!busy || !act} onClick={() => applyRows([{ row: r, ch: { ...ch, action: act } }])}>Apply</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length > 300 && <div style={{ padding: 10, fontSize: 12, color: "#8593a8", fontWeight: 700 }}>Showing 300 of {shown.length} — search to narrow it down.</div>}
          </div>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, margin: "0 2px 18px" }}>
        Importing the same statement twice is harmless — every transaction keeps one row. "New purchase" adds a ledger entry at the bank amount
        with VAT at 0% — open it and add the invoice and VAT. Wages rows are worked out from the payments assigned to each person; payroll figures you've keyed in by hand are never overwritten.
      </p>
    </div>
  );
}

// latest balance for the Business screen (admin RLS: other logins get null)
export async function fetchBankBalance() {
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.from("bank_transactions").select("tx_date,balance").not("balance", "is", null).order("tx_date", { ascending: false }).order("seq", { ascending: false }).limit(1);
    if (error || !data || !data.length) return null;
    return { date: data[0].tx_date, balance: Number(data[0].balance) };
  } catch (e) { return null; }
}
