// Vans: the fleet — registration and insurance details, renewal/MOT/tax/service
// countdowns, and the weekly van check log.
import { useState } from "react";
import { NAVY, GOLD, RED, prettyDate } from "../../lib/core.js";
import { blankVan, blankVanCheck, VAN_CHECK_ITEMS, daysUntil, FIELD_FORMATS } from "../../lib/crmCore.js";
import { Icon, Chip, Modal, selectAllProps, sect, lbl, card, abtn, inp, btn, goldBtn } from "./ui.jsx";

const DUE_FIELDS = [
  ["insuranceRenewal", "Insurance"],
  ["motDue", "MOT"],
  ["taxDue", "Tax"],
  ["serviceDue", "Service"],
];

const DueChip = ({ label, date }) => {
  const d = daysUntil(date);
  if (d === null) return <Chip tone="grey">{label} · not set</Chip>;
  const tone = d < 0 ? "red" : d <= 30 ? "amber" : "green";
  const text = d < 0 ? Math.abs(d) + "d overdue" : d === 0 ? "today" : d + "d";
  return <Chip tone={tone} title={prettyDate(date)}>{label} · {text}</Chip>;
};

export default function VansScreen({ crm, updateCrm, askConfirm, me }) {
  const [draft, setDraft] = useState(null);
  const [checkDraft, setCheckDraft] = useState(null); // { vanId, check }
  const [historyFor, setHistoryFor] = useState(null);

  const vans = crm.vans || [];

  const save = () => {
    const d = draft;
    if (!d.name.trim()) return;
    updateCrm((c) => {
      const t = (c.vans = c.vans || []).find((x) => x.id === d.id);
      const { _new, ...clean } = d;
      if (t) Object.assign(t, clean);
      else c.vans.push(clean);
      return c;
    });
    setDraft(null);
  };

  const saveCheck = () => {
    const { vanId, check } = checkDraft;
    updateCrm((c) => {
      const v = c.vans.find((x) => x.id === vanId);
      if (v) v.checks.unshift(check);
      return c;
    });
    setCheckDraft(null);
  };

  const remove = (v) =>
    askConfirm({
      message: 'Delete van "' + (v.name || v.reg) + '" and its check history?',
      confirmLabel: "Delete",
      danger: true,
      action: () =>
        updateCrm((c) => {
          c.vans = c.vans.filter((x) => x.id !== v.id);
          return c;
        }),
    });

  const lastCheck = (v) => (v.checks && v.checks.length ? [...v.checks].sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0] : null);

  const field = (k, label, props = {}, wrap = {}) => (
    <div style={wrap}>
      <span style={lbl}>{label}</span>
      <input style={inp} value={draft[k] === null ? "" : draft[k]} {...props} {...selectAllProps}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
    </div>
  );

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "18px 22px" }}>
      <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px" }}>
        <p style={{ ...sect, margin: 0 }}>Fleet ({vans.length})</p>
        <span style={{ flex: 1 }} />
        <button style={goldBtn} onClick={() => setDraft({ ...blankVan(), _new: true })}><Icon name="plus" stroke={NAVY} />New van</button>
      </div>

      {vans.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: "30px 10px", color: "#5a6a85", fontWeight: 600 }}>
          No vans yet — add the Vauxhall, Renault and Sprinter to track insurance, MOT and weekly checks.
        </div>
      )}

      {vans.map((v) => {
        const lc = lastCheck(v);
        const lcDays = lc ? -daysUntil(lc.date) : null; // days since
        const checkTone = !lc ? "red" : lcDays > 7 ? "amber" : "green";
        const defects = lc && (lc.defects || VAN_CHECK_ITEMS.some(([k]) => lc[k] === false));
        return (
          <div key={v.id} style={{ ...card, opacity: v.active === false ? 0.5 : 1 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <Icon name="truck" size={20} stroke={GOLD} />
              </div>
              <div style={{ minWidth: 150 }}>
                <b style={{ fontSize: 16 }}>{v.name || "Unnamed van"}</b>
                <div style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600 }}>
                  {[v.reg, v.makeModel, v.active === false ? "off the road" : ""].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <span style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {DUE_FIELDS.map(([k, label]) => <DueChip key={k} label={label} date={v[k]} />)}
                <Chip tone={checkTone}>
                  {lc ? "Checked " + prettyDate(lc.date) + (defects ? " · defects!" : "") : "Never checked"}
                </Chip>
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                <button style={{ ...goldBtn, padding: "7px 12px", fontSize: 12.5 }} onClick={() => setCheckDraft({ vanId: v.id, check: { ...blankVanCheck(), by: (me || "").split("@")[0] } })}>
                  <Icon name="ready" stroke={NAVY} />Weekly check
                </button>
                <button style={abtn} title="Check history" onClick={() => setHistoryFor(historyFor === v.id ? null : v.id)}><Icon name="clock" /></button>
                <button style={abtn} title="Edit van" onClick={() => setDraft(JSON.parse(JSON.stringify(v)))}><Icon name="pen" /></button>
                <button style={abtn} title="Delete van" onClick={() => remove(v)}><Icon name="bin" /></button>
              </div>
            </div>
            {(v.insurer || v.policyNo) && (
              <div style={{ fontSize: 12, color: "#5a6a85", fontWeight: 600, marginTop: 8 }}>
                Insurance: {[v.insurer, v.policyNo ? "policy " + v.policyNo : "", v.insuranceRenewal ? "renews " + prettyDate(v.insuranceRenewal) : ""].filter(Boolean).join(" · ")}
              </div>
            )}
            {v.notes && <div style={{ fontSize: 12.5, fontWeight: 600, color: "#6b5305", background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "6px 10px", marginTop: 8 }}>{v.notes}</div>}

            {historyFor === v.id && (
              <div style={{ marginTop: 12, borderTop: "1px solid #f0f2f6", paddingTop: 10 }}>
                <p style={sect}>Check history ({(v.checks || []).length})</p>
                {(v.checks || []).length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "#8593a8", fontWeight: 600 }}>No checks recorded yet.</div>
                ) : (
                  [...v.checks].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 12).map((c) => {
                    const failed = VAN_CHECK_ITEMS.filter(([k]) => c[k] === false);
                    return (
                      <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", padding: "5px 0", borderBottom: "1px solid #f6f8fb", fontSize: 12.5 }}>
                        <b style={{ whiteSpace: "nowrap" }}>{prettyDate(c.date)}</b>
                        <span style={{ color: "#5a6a85", fontWeight: 600 }}>{c.by || "—"}</span>
                        {c.mileage !== "" && c.mileage !== null && <span style={{ color: "#5a6a85", fontWeight: 600 }}>{Number(c.mileage).toLocaleString("en-GB")} mi</span>}
                        {failed.length === 0 && !c.defects ? (
                          <Chip tone="green" style={{ fontSize: 10.5, padding: "1px 8px" }}>All OK</Chip>
                        ) : (
                          <span style={{ color: RED, fontWeight: 700 }}>
                            {[...failed.map(([, l]) => l), c.defects].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* van modal */}
      {draft && (
        <Modal title={draft._new ? "New van" : "Edit " + (draft.name || "van")} onClose={() => setDraft(null)} width={620}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            {field("name", "Van name", { autoFocus: true })}
            {field("reg", "Registration")}
            {field("makeModel", "Make / model")}
            {field("insurer", "Insurer")}
            {field("policyNo", "Policy no.")}
            {field("insuranceRenewal", "Insurance renewal", { type: "date" })}
            {field("motDue", "MOT due", { type: "date" })}
            {field("taxDue", "Tax due", { type: "date" })}
            {field("serviceDue", "Service due", { type: "date" })}
          </div>
          <div style={{ marginTop: 12 }}>
            <span style={lbl}>Notes</span>
            <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, margin: "12px 0" }}>
            <input type="checkbox" checked={draft.active !== false} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            On the road (shows in van dropdowns)
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button style={btn} onClick={() => setDraft(null)}>Cancel</button>
            <button className="dk-save" style={{ ...goldBtn, opacity: draft.name.trim() ? 1 : 0.5 }} onClick={save}>Save</button>
          </div>
        </Modal>
      )}

      {/* weekly check modal */}
      {checkDraft && (
        <Modal title={"Weekly check — " + ((vans.find((v) => v.id === checkDraft.vanId) || {}).name || "van")} onClose={() => setCheckDraft(null)} width={520}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <span style={lbl}>Date</span>
              <input style={inp} type="date" value={checkDraft.check.date}
                onChange={(e) => setCheckDraft({ ...checkDraft, check: { ...checkDraft.check, date: e.target.value } })} />
            </div>
            <div>
              <span style={lbl}>Checked by</span>
              <input style={inp} value={checkDraft.check.by} {...selectAllProps}
                onChange={(e) => setCheckDraft({ ...checkDraft, check: { ...checkDraft.check, by: e.target.value } })} />
            </div>
            <div>
              <span style={lbl}>Mileage</span>
              <input style={{ ...inp, textAlign: "right" }} inputMode="numeric" value={checkDraft.check.mileage} {...selectAllProps}
                onChange={(e) => setCheckDraft({ ...checkDraft, check: { ...checkDraft.check, mileage: e.target.value } })} />
            </div>
          </div>
          <div style={{ background: "#f8f9fb", border: "1px solid #e6e9ef", borderRadius: 12, padding: "10px 13px", marginTop: 12 }}>
            {VAN_CHECK_ITEMS.map(([k, label]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, fontWeight: 600, padding: "5px 0" }}>
                <input type="checkbox" checked={checkDraft.check[k] !== false}
                  onChange={(e) => setCheckDraft({ ...checkDraft, check: { ...checkDraft.check, [k]: e.target.checked } })} />
                {label}
                {checkDraft.check[k] === false && <Chip tone="red" style={{ fontSize: 10, padding: "1px 7px" }}>defect</Chip>}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <span style={lbl}>Defects / notes</span>
            <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={checkDraft.check.defects}
              onChange={(e) => setCheckDraft({ ...checkDraft, check: { ...checkDraft.check, defects: e.target.value } })} />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <button style={btn} onClick={() => setCheckDraft(null)}>Cancel</button>
            <button className="dk-save" style={goldBtn} onClick={saveCheck}>Save check</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
