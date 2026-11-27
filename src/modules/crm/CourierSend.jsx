// Courier booking through Parcel2Go (the p2g-ship edge function): live quotes
// across Evri & co, book, pay (PrePay when P2G_AUTOPAY=1, else a payment link)
// and hand back the order/tracking reference. One modal shared by invoices and
// samples; the address arrives prefilled and stays editable.
import { useState } from "react";
import { NAVY, GOLD } from "../../lib/core.js";
import { getSupabase } from "../../data/supabaseClient.js";
import { Icon, inp, btn, goldBtn, lbl, selectAllProps } from "./ui.jsx";

const PRESETS = [
  { k: "Sample pack", weight: 1, length: 35, width: 25, height: 6, value: 10 },
  { k: "Small parts", weight: 4, length: 40, width: 30, height: 20, value: 40 },
  { k: "Heavy box", weight: 12, length: 60, width: 40, height: 30, value: 90 },
  { k: "Trim tube (1.2m)", weight: 6, length: 125, width: 15, height: 15, value: 60 },
];

async function callShip(body) {
  const sb = await getSupabase();
  const { data, error } = await sb.functions.invoke("p2g-ship", { body });
  if (error) {
    let msg = error.message || "the p2g-ship function isn't deployed yet";
    try { const ctx = await error.context.json(); if (ctx && ctx.error) msg = ctx.error; } catch { /* keep */ }
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

export function CourierButton({ to, reference, contents, onBooked, style }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button style={style || btn} title="Get live courier quotes (Parcel2Go) and book this as a parcel" onClick={() => setOpen(true)}>
        <Icon name="truck" size={14} />Courier
      </button>
      {open && <CourierModal to={to} reference={reference} contents={contents} onBooked={onBooked} onClose={() => setOpen(false)} />}
    </>
  );
}

function CourierModal({ to = {}, reference = "", contents = "", onBooked, onClose }) {
  const [addr, setAddr] = useState({
    contact: to.contact || "", phone: to.phone || "", email: to.email || "",
    street: to.street || "", town: to.town || "", county: to.county || "", postcode: to.postcode || "",
  });
  const [p, setP] = useState({ ...PRESETS[0] });
  const [quotes, setQuotes] = useState(null);
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const parcels = [{ weight: p.weight, length: p.length, width: p.width, height: p.height, value: p.value }];

  const getQuotes = async () => {
    setBusy("Getting live prices…"); setErr(""); setQuotes(null); setPick(null);
    try {
      const r = await callShip({ action: "quote", delivery: { postcode: addr.postcode }, parcels });
      console.log("[dk-courier] first quote:", r.quotes && r.quotes[0]);
      setQuotes(r.quotes || []);
      if (!(r.quotes || []).length) setErr("No services quoted for that postcode/size.");
    } catch (e) { setErr(String(e.message || e)); }
    setBusy("");
  };

  const book = async () => {
    if (!pick) return;
    setBusy("Booking with " + (pick.courier || pick.name) + "…"); setErr("");
    try {
      const r = await callShip({
        action: "order", service: pick.service, reference, contents,
        collectionDate: (pick.dates && pick.dates[0]) || "", parcels,
        delivery: { ...addr, property: "" },
      });
      setDone(r);
      if (onBooked) onBooked({ orderId: r.orderId, courier: pick.courier || pick.name, price: pick.price, paid: r.paid, links: r.links || {} });
    } catch (e) { setErr(String(e.message || e)); }
    setBusy("");
  };

  const field = (k, ph, w) => (
    <input style={{ ...inp, width: w || "100%" }} placeholder={ph} value={addr[k]} {...selectAllProps}
      onChange={(e) => setAddr((a) => ({ ...a, [k]: e.target.value }))} />
  );
  const dim = (k, label) => (
    <label style={{ fontSize: 12, fontWeight: 700, color: "#5a6a85", display: "grid", gap: 3 }}>{label}
      <input style={{ ...inp, width: 74, textAlign: "right" }} type="number" min="0" value={p[k]} {...selectAllProps}
        onChange={(e) => setP((x) => ({ ...x, [k]: Number(e.target.value) || 0 }))} />
    </label>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#0b1f3f80", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "min(620px, 96vw)", maxHeight: "92vh", overflowY: "auto", padding: "18px 20px", boxShadow: "0 18px 50px #0b1f3f55" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <b style={{ fontSize: 16 }}>Send by courier</b>
          <span style={{ fontSize: 12, color: "#8593a8", fontWeight: 700 }}>via Parcel2Go{reference ? " · " + reference : ""} · v2</span>
          <span style={{ flex: 1 }} />
          <button style={btn} onClick={onClose}><Icon name="x" size={13} /></button>
        </div>

        {done ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ background: "#eef7f0", border: "1px solid #bfe3c8", borderRadius: 10, padding: "12px 14px", fontWeight: 700, color: "#1e5e33" }}>
              {done.paid ? "Booked and paid — order " + done.orderId : "Order " + done.orderId + " created — pay it to release the label"}
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginTop: 3, color: "#2c6e42" }}>£{Number(done.total || 0).toFixed(2)} · the reference is saved on the job</span>
            </div>
            {!done.paid && done.links && (done.links.payment || done.links.PayWithPrePay) && (
              <a href={done.links.payment || done.links.PayWithPrePay} target="_blank" rel="noopener noreferrer" style={{ ...goldBtn, textDecoration: "none", justifyContent: "center" }}>Open payment ↗</a>
            )}
            {done.paid && done.labels && (done.labels["labels-a4"] || done.labels.Labels) && (
              <a href={done.labels["labels-a4"] || done.labels.Labels} target="_blank" rel="noopener noreferrer" style={{ ...goldBtn, textDecoration: "none", justifyContent: "center" }}>Open labels ↗</a>
            )}
            <button style={btn} onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <p style={{ ...lbl }}>Deliver to</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              {field("contact", "Contact name")}{field("phone", "Phone")}
              <div style={{ gridColumn: "1 / -1" }}>{field("street", "Address line")}</div>
              {field("town", "Town")}{field("postcode", "Postcode", 140)}
            </div>

            <p style={{ ...lbl }}>Parcel</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {PRESETS.map((x) => (
                <button key={x.k} style={{ ...btn, padding: "5px 10px", fontSize: 12.5, ...(p.k === x.k ? { background: NAVY, borderColor: NAVY, color: "#fff" } : {}) }}
                  onClick={() => setP({ ...x })}>{x.k}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginBottom: 12 }}>
              {dim("weight", "kg")}{dim("length", "L cm")}{dim("width", "W cm")}{dim("height", "H cm")}{dim("value", "Value £")}
              <button style={{ ...goldBtn, marginLeft: "auto" }} disabled={!!busy || !addr.postcode.trim()} onClick={getQuotes}>
                <Icon name="pound" stroke={NAVY} size={14} />Get quotes
              </button>
            </div>

            {busy && <div style={{ fontSize: 13, fontWeight: 700, color: "#5a6a85", marginBottom: 8 }}>{busy}</div>}
            {err && <div style={{ background: "#fdeef0", border: "1px solid #ecc4cb", color: "#8a0b20", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>{err}</div>}

            {quotes && quotes.length > 0 && (
              <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                {quotes.map((q, i) => (
                  <label key={i} style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid " + (pick === q ? GOLD : "#e6e9ef"), background: pick === q ? "#fdf8ec" : "#fff", borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}>
                    <input type="radio" name="p2g-q" checked={pick === q} onChange={() => setPick(q)} />
                    <span style={{ fontWeight: 700, flex: 1 }}>{q.courier || ""} <span style={{ fontWeight: 600, color: "#5a6a85" }}>{q.name}</span>
                      {q.eta ? <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "#8593a8" }}>{String(q.eta).slice(0, 10)}</span> : null}</span>
                    <b>{q.price === null || q.price === undefined ? "—" : "£" + Number(q.price).toFixed(2)}</b>
                  </label>
                ))}
                <button style={{ ...goldBtn, justifyContent: "center" }} disabled={!pick || !!busy} onClick={book}>
                  <Icon name="truck" stroke={NAVY} size={15} />Book {pick ? "£" + Number(pick.price || 0).toFixed(2) : ""}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
