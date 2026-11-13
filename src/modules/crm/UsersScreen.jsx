// Users & access (admin): who can log in to ops and what they can see and do.
import { useEffect, useState } from "react";
import { NAVY, GOLD, RED } from "../../lib/core.js";
import { LEVELS, levelLabel } from "../../lib/access.js";
import { DRIVERS } from "../../lib/crmCore.js";
import { loadAccess, saveAccess } from "../../data/staffAccess.js";
import { card, btn, goldBtn, inp, sect, lbl, Icon } from "./ui.jsx";

// the team as agreed (Nov 2026) - shown as ready-to-fill rows until each has an email
const SUGGESTED = [
  { full_name: "Amanda", role: "manager", read_only: false },
  { full_name: "Molly", role: "office", read_only: true },
  { full_name: "Ian", role: "warehouse", read_only: true },
];

const th = { textAlign: "left", fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" };
const td = { padding: "8px 8px", borderBottom: "1px solid #eef0f4", fontSize: 13.5, verticalAlign: "middle" };

// the Name column, editable in place: type, then click away (or press Enter) to save
function NameCell({ r, onSave, disabled }) {
  const [v, setV] = useState(r.full_name || "");
  useEffect(() => { setV(r.full_name || ""); }, [r.full_name]);
  return (
    <input style={{ ...inp, padding: "6px 8px", width: 110, fontWeight: 700 }} placeholder="Name" value={v} disabled={disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v.trim() !== (r.full_name || "")) onSave(v.trim()); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
}

export default function UsersScreen({ me }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState({ email: "", full_name: "", role: "office", read_only: false });
  const [suggest, setSuggest] = useState({}); // name -> email typed in a suggested row

  const reload = async () => {
    try {
      const { profiles, invites } = await loadAccess();
      const byEmail = {};
      profiles.forEach((p) => { const e = (p.email || "").toLowerCase(); byEmail[e] = { email: e, full_name: p.full_name || "", role: p.role, read_only: p.read_only, driver_name: p.driver_name || "", login: true }; });
      invites.forEach((i) => {
        const e = i.email.toLowerCase();
        byEmail[e] = { ...(byEmail[e] || { login: false }), email: e, full_name: i.full_name || (byEmail[e] && byEmail[e].full_name) || "", role: i.role, read_only: i.read_only, driver_name: i.driver_name || (byEmail[e] && byEmail[e].driver_name) || "", invited: true };
      });
      setRows(Object.values(byEmail).sort((a, b) => (a.role === "none") - (b.role === "none") || a.email.localeCompare(b.email)));
      setErr("");
    } catch (e) {
      setErr(/staff_invites|read_only|does not exist/i.test(e.message) ? "Run access-levels.sql in Supabase first (SQL Editor → New query → paste → Run), then reload this page." : e.message);
    }
  };
  useEffect(() => { reload(); }, []);

  const save = async (r) => {
    setBusy(r.email);
    try { await saveAccess(r); await reload(); } catch (e) { setErr(e.message); }
    setBusy("");
  };
  const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || "").trim());

  const levelSelect = (value, onChange, disabled) => (
    <select style={{ ...inp, width: 140, padding: "6px 8px" }} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
      <option value="none">No access</option>
    </select>
  );
  // a driver login sees the runs planned under this name on the delivery schedule
  const driverSelect = (r, onChange, disabled) => {
    const cur = r.driver_name || String(r.full_name || "").split(" ")[0];
    const names = [...new Set([...DRIVERS, cur].filter(Boolean))];
    return (
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: NAVY }} title="The name they go by on the delivery schedule — they'll see the runs planned for this driver">
        Runs for
        <select style={{ ...inp, width: 110, padding: "6px 8px" }} value={cur} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    );
  };
  // any non-driver login can also carry a schedule name (e.g. Ian, or Jon himself):
  // the phone app then shows that person's runs and tasks under this login
  const alsoDrives = (r, onChange, disabled) => (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: NAVY, marginLeft: 12 }} title="The name they go by on the delivery schedule and phone app — links this login to that name's runs and tasks">
      Also drives as
      <select style={{ ...inp, width: 110, padding: "6px 8px" }} value={r.driver_name || ""} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {[...new Set([...DRIVERS, r.driver_name].filter(Boolean))].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
  const roToggle = (on, onChange, disabled) => (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, cursor: disabled ? "default" : "pointer", color: on ? NAVY : "#8593a8" }}>
      <input type="checkbox" checked={!!on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />Read only
    </label>
  );

  const have = (name) => (rows || []).some((r) => (r.full_name || "").toLowerCase() === name.toLowerCase());
  const meLc = String(me || "").toLowerCase();

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "18px 22px" }}>
      <div style={{ background: "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", borderRadius: 12, padding: "16px 22px", color: "#fff", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 19 }}>Users &amp; access</h2>
        <div style={{ fontSize: 13, color: "#aeb9cf", fontWeight: 600, marginTop: 4 }}>Who can log in to ops, and what each person can see and change. Changes apply within a minute.</div>
      </div>

      <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
        {LEVELS.map((l) => (
          <div key={l.key}><b style={{ fontSize: 13.5 }}>{l.label}</b><div style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600, marginTop: 2 }}>{l.blurb}</div></div>
        ))}
        <div><b style={{ fontSize: 13.5 }}>Read only</b><div style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600, marginTop: 2 }}>Any level: can look, can't change anything</div></div>
      </div>

      {err && <div style={{ ...card, borderColor: "#ecc4cb", background: "#C8102E08", color: "#8a0b20", fontWeight: 600, fontSize: 13.5 }}>{err}</div>}

      <div style={card}>
        <p style={sect}>People</p>
        {!rows ? <div style={{ color: "#8593a8", fontWeight: 600, fontSize: 13 }}>{err ? "" : "Loading…"}</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Name", "Email", "Level", "", "Login"].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => {
                const self = r.email === meLc;
                return (
                  <tr key={r.email} style={{ opacity: r.role === "none" ? 0.55 : 1 }}>
                    <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}><NameCell r={r} onSave={(v) => save({ ...r, full_name: v })} disabled={busy === r.email} />{self && <span style={{ fontSize: 11, color: "#8593a8", marginLeft: 6 }}>(you)</span>}</td>
                    <td style={td}>{r.email}</td>
                    <td style={td}>{levelSelect(r.role, (v) => save({ ...r, role: v }), busy === r.email || self)}</td>
                    <td style={td}>{r.role === "driver" ? driverSelect(r, (v) => save({ ...r, driver_name: v }), busy === r.email || self) : r.role !== "none" && <>{roToggle(r.read_only, (v) => save({ ...r, read_only: v }), busy === r.email || self)}{alsoDrives(r, (v) => save({ ...r, driver_name: v }), busy === r.email)}</>}</td>
                    <td style={{ ...td, fontSize: 12.5, fontWeight: 700, color: r.login ? "#28713e" : "#a05f10", whiteSpace: "nowrap" }}>
                      {r.login ? "Has a login" : "Needs a login ↓"}
                    </td>
                  </tr>
                );
              })}
              {SUGGESTED.filter((s) => !have(s.full_name)).map((s) => (
                <tr key={"s-" + s.full_name} style={{ background: "#fff8e6" }}>
                  <td style={{ ...td, fontWeight: 700 }}>{s.full_name}</td>
                  <td style={td}><input style={{ ...inp, padding: "6px 8px" }} placeholder={s.full_name.toLowerCase() + "@…"} value={suggest[s.full_name] || ""} onChange={(e) => setSuggest((x) => ({ ...x, [s.full_name]: e.target.value }))} /></td>
                  <td style={{ ...td, fontWeight: 600 }}>{levelLabel(s.role)}</td>
                  <td style={{ ...td, fontWeight: 600, color: "#5a6a85" }}>{s.read_only ? "Read only" : ""}</td>
                  <td style={td}>
                    <button style={{ ...goldBtn, padding: "6px 12px", fontSize: 12.5 }} disabled={!validEmail(suggest[s.full_name])}
                      onClick={() => save({ ...s, email: suggest[s.full_name] })}>Add</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={card}>
        <p style={sect}>Add someone</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 150px auto auto", gap: 10, alignItems: "end" }}>
          <div><span style={lbl}>Name</span><input style={inp} value={draft.full_name} onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))} /></div>
          <div><span style={lbl}>Email they'll log in with</span><input style={inp} value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} /></div>
          <div><span style={lbl}>Level</span>{levelSelect(draft.role, (v) => setDraft((d) => ({ ...d, role: v })))}</div>
          <div style={{ paddingBottom: 8 }}>{draft.role === "driver" ? driverSelect(draft, (v) => setDraft((d) => ({ ...d, driver_name: v }))) : roToggle(draft.read_only, (v) => setDraft((d) => ({ ...d, read_only: v })))}</div>
          <button style={goldBtn} disabled={!validEmail(draft.email) || draft.role === "none"}
            onClick={async () => { await save(draft); setDraft({ email: "", full_name: "", role: "office", read_only: false }); }}>
            <Icon name="plus" stroke={NAVY} />Add
          </button>
        </div>
      </div>

      <div style={{ ...card, background: "#f8f9fb" }}>
        <p style={sect}>Giving someone a login</p>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, fontWeight: 600, color: "#33466b", lineHeight: 1.7 }}>
          <li>Add them above with their email and level.</li>
          <li>In Supabase: <b>Authentication → Users → Add user → Create new user</b>. Use the same email, set a password, and tick <b>Auto Confirm User</b>.</li>
          <li>Give them the password. They log in at ops.deckkingdom.co.uk and land on the screens their level allows.</li>
        </ol>
        <div style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600, marginTop: 8 }}>
          A login that isn't on this list gets no access at all, so nobody can sign themselves up. To take someone's access away, set their level to "No access".
        </div>
      </div>
    </div>
  );
}
