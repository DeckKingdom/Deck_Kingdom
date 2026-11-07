// Pop-up warning when a street and postcode don't belong together (see lib/addressCheck.js).
//   const addr = useAddressGuard();
//   addr.guard({ address, town, postcode }, () => save(), { saveLabel: "Save anyway" });
//   ...render {addr.modal}
import { useState, useEffect, useRef } from "react";
import { checkAddress } from "../../lib/addressCheck.js";
import { Modal, btn, goldBtn } from "./ui.jsx";
import { NAVY } from "../../lib/core.js";

export function useAddressGuard() {
  const [warn, setWarn] = useState(null); // { title, lines, go, saveLabel, fixLabel }
  const [busy, setBusy] = useState(false);
  const guard = async (a, go, opts = {}) => {
    if (busy) return;
    setBusy(true);
    let r = { ok: true };
    try { r = await checkAddress(a); } catch (e) { r = { ok: true }; }
    setBusy(false);
    if (r.ok) { go(); return; }
    setWarn({ ...r, go, saveLabel: opts.saveLabel || "Save anyway", fixLabel: opts.fixLabel || "Go back and fix it" });
  };
  const modal = warn ? (
    <Modal title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 20 }}>⚠️</span>{warn.title}</span>} onClose={() => setWarn(null)} width={470} z={90}>
      <div style={{ background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 10, padding: "12px 14px", color: "#6b5305", fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>
        {warn.lines.map((l, i) => <div key={i} style={{ marginTop: i ? 6 : 0 }}>{l}</div>)}
      </div>
      <div style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, marginTop: 8 }}>Checked against Royal Mail postcodes and OpenStreetMap.</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button style={btn} onClick={() => { const g = warn.go; setWarn(null); g(); }}>{warn.saveLabel}</button>
        <button style={{ ...goldBtn, color: NAVY }} onClick={() => setWarn(null)} autoFocus>{warn.fixLabel}</button>
      </div>
    </Modal>
  ) : null;
  return { guard, modal, busy };
}

// Under a job's "Deliver to": checks the chosen address, pops up when a newly picked one looks wrong,
// and keeps a small warning line while it's unresolved.
export function DeliverAddrCheck({ address, town, postcode, skip }) {
  const key = skip ? "" : [address, town, postcode].join("|");
  const [res, setRes] = useState(null);
  const [pop, setPop] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    let live = true;
    setRes(null);
    const wasFirst = first.current;
    first.current = false;
    if (!key || (!address && !postcode)) return;
    checkAddress({ address, town, postcode }).then((r) => {
      if (!live) return;
      setRes(r);
      if (!r.ok && !wasFirst) setPop(true);
    });
    return () => { live = false; };
  }, [key]);
  if (!res || res.ok) return null;
  return (
    <>
      <button type="button" onClick={() => setPop(true)} title="Click for details"
        style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center", width: "100%", textAlign: "left", border: "1px solid #f4d78f", background: "#fff8e6", color: "#6b5305", borderRadius: 8, padding: "6px 10px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
        ⚠️ {res.title} — check before it goes on a run
      </button>
      {pop && (
        <Modal title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 20 }}>⚠️</span>{res.title}</span>} onClose={() => setPop(false)} width={470} z={90}>
          <div style={{ background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 10, padding: "12px 14px", color: "#6b5305", fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>
            <div style={{ marginBottom: 6, color: NAVY, fontWeight: 800 }}>{[address, town, postcode].filter(Boolean).join(", ")}</div>
            {res.lines.map((l, i) => <div key={i} style={{ marginTop: i ? 6 : 0 }}>{l}</div>)}
          </div>
          <div style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, marginTop: 8 }}>Fix it on the customer's account or site and the warning clears.</div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <button style={{ ...goldBtn, color: NAVY }} onClick={() => setPop(false)} autoFocus>OK</button>
          </div>
        </Modal>
      )}
    </>
  );
}
