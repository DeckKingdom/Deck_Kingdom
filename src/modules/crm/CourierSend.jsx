// Courier booking through Parcel2Go (the p2g-ship edge function): live quotes
// across Evri & co, book, pay (PrePay when P2G_AUTOPAY=1, else a payment link)
// and hand back the order/tracking reference. One modal shared by invoices and
// samples; the address arrives prefilled and stays editable.
import { useEffect, useRef, useState } from "react";
import { NAVY, GOLD } from "../../lib/core.js";
import { getSupabase } from "../../data/supabaseClient.js";
import { Icon, inp, btn, goldBtn, lbl, selectAllProps } from "./ui.jsx";
import { samplesIn, SAMPLE_GROUPS } from "./sampleActions.js";
import { printLabelPdfs } from "./LabelSheet.jsx";

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

// Evri first — we know their drop-off shops. Shop-to-shop services (Relay
// Pudo To Pudo etc) need both drop shops choosing on P2G, so auto-booking
// skips them; they stay visible in the single modal for price reference.
const isEvri = (q) => /evri/i.test((q.courier || "") + " " + (q.name || ""));
const shopToShop = (q) => /pudo to pudo|shop to shop|to pudo\b/i.test((q.name || "") + " " + (q.service || ""));
export const bookingOrder = (qs) => [...(qs || []).filter(isEvri), ...(qs || []).filter((q) => !isEvri(q) && !shopToShop(q))];

// ===== one click for the whole "to send" pile (Home's samples card) =====
const SAMPLE_PARCEL = [{ weight: 1, length: 35, width: 25, height: 6, value: 10 }];

export function CourierBatchButton({ crm, updateCrm, style }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button style={style || btn} title="Price every sample still to send (as a 1kg sample pack) and book them all with Parcel2Go in one go" onClick={() => setOpen(true)}>
        <Icon name="truck" size={13} />Book couriers
      </button>
      {open && <BatchModal crm={crm} updateCrm={updateCrm} onClose={() => setOpen(false)} />}
    </>
  );
}

function BatchModal({ crm, updateCrm, onClose }) {
  const [rows, setRows] = useState(() => {
    const by = {}; (crm.customers || []).forEach((c) => (by[c.id] = c));
    return samplesIn(crm, SAMPLE_GROUPS.send).map((s) => {
      const c = by[s.customerId] || {};
      const pc = String(c.postcode || "").trim();
      return {
        id: s.id, no: s.sampleNo, name: c.name || "Customer", pc,
        to: { contact: c.contact || c.name || "", phone: c.mobile || "", email: c.email || "", street: c.address || "", town: c.town || "", postcode: pc },
        state: pc ? "wait" : "err", msg: pc ? "" : "no postcode on the customer record", quotes: null, pick: null, payLink: "", orderId: "",
      };
    });
  });
  const [busy, setBusy] = useState("");
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const patch = (id, up) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...up } : r)));

  // price everything as soon as the modal opens, cheapest first
  useEffect(() => {
    let live = true;
    (async () => {
      setBusy("Getting prices…");
      for (const r of rowsRef.current) {
        if (!live) return;
        if (r.state !== "wait") continue;
        patch(r.id, { state: "quoting" });
        try {
          const res = await callShip({ action: "quote", delivery: { postcode: r.pc }, parcels: SAMPLE_PARCEL });
          const qs = (res && res.quotes) || [];
          if (!live) return;
          const ord = bookingOrder(qs);
          if (!ord.length) patch(r.id, { state: "err", msg: qs.length ? "only shop-to-shop services quoted for " + r.pc : "no services quoted for " + r.pc });
          else patch(r.id, { state: "ready", quotes: ord, pick: ord[0] });
        } catch (e) { if (live) patch(r.id, { state: "err", msg: String(e.message || e) }); }
      }
      if (live) setBusy("");
    })();
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // book one sample: cheapest service first; a refusal about the phone or the
  // address tries the next service (home-delivery services are less fussy)
  const bookOne = async (r) => {
    let lastErr = "";
    for (const q of (r.quotes || []).slice(0, 4)) {
      try {
        const res = await callShip({
          action: "order", service: q.service, reference: "Sample " + (r.no || ""), contents: "Composite decking samples",
          collectionDate: (q.dates && q.dates[0]) || "", parcels: SAMPLE_PARCEL, delivery: { ...r.to, property: "" },
        });
        return { ok: true, q, res };
      } catch (e) {
        lastErr = String(e.message || e);
        if (!/mobile|phone|address|drop shop/i.test(lastErr)) break;
      }
    }
    return { ok: false, msg: lastErr };
  };

  const bookAll = async () => {
    setBusy("Booking…");
    for (const r of rowsRef.current) {
      if (r.state !== "ready") continue;
      patch(r.id, { state: "booking" });
      const out = await bookOne(r);
      if (!out.ok) { patch(r.id, { state: "err", msg: out.msg }); continue; }
      const { q, res } = out;
      const link = !res.paid && res.links ? String(res.links.payment || res.links.PayWithPrePay || "") : "";
      patch(r.id, { state: "booked", pick: q, payLink: link, orderId: res.orderId, labelPdf: res.labelPdf || "", msg: res.paid ? (res.labelPdf ? "paid · label ready" : "paid") : "pay it to release the label" });
      updateCrm((c) => {
        const s = (c.samples || []).find((x) => x.id === r.id);
        if (s) {
          if (!s.dispatchMethod) s.dispatchMethod = "Evri";
          s.notes = ((s.notes || "") + "\nP2G order " + res.orderId + " · " + (q.courier || q.name) + " £" + Number(q.price || 0).toFixed(2) + (res.paid ? " (paid)" : " (PAY IT on Parcel2Go)")).trim();
        }
        return c;
      });
    }
    // auto-pay returned the label PDFs: build the 4-up A4 sheet and open the print dialog
    const pdfs = rowsRef.current.filter((r) => r.state === "booked" && r.labelPdf).map((r) => r.labelPdf);
    if (pdfs.length) {
      setBusy("Building the label sheet…");
      try { await printLabelPdfs(pdfs); } catch (e) { /* rows keep their links */ }
    }
    setBusy("");
  };

  const ready = rows.filter((r) => r.state === "ready");
  const booked = rows.filter((r) => r.state === "booked");
  const unpaid = booked.filter((r) => r.payLink);
  const total = ready.reduce((t, r) => t + (Number(r.pick && r.pick.price) || 0), 0);
  const tone = { wait: "#8593a8", quoting: "#8593a8", ready: NAVY, booking: "#a05f10", booked: "#28713e", err: "#8a0b20" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#0b1f3f80", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", color: NAVY, borderRadius: 14, width: "min(640px, 96vw)", maxHeight: "92vh", overflowY: "auto", padding: "18px 20px", boxShadow: "0 18px 50px #0b1f3f55" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <b style={{ fontSize: 16 }}>Book couriers — samples to send</b>
          <span style={{ fontSize: 12, color: "#8593a8", fontWeight: 700 }}>via Parcel2Go · 1kg sample pack each</span>
          <span style={{ flex: 1 }} />
          <button style={btn} onClick={onClose}><Icon name="x" size={13} /></button>
        </div>
        {rows.length === 0 && <div style={{ color: "#8593a8", fontWeight: 600, fontSize: 13 }}>Nothing waiting to send.</div>}
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid #e6e9ef", borderRadius: 10, padding: "8px 12px", fontSize: 13 }}>
              <span style={{ fontWeight: 700, flex: 1, minWidth: 0 }}>
                {r.name} <span style={{ fontWeight: 600, color: "#5a6a85" }}>S-{r.no} · {r.pc || "—"}</span>
                <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: tone[r.state] }}>
                  {r.state === "wait" ? "waiting…" : r.state === "quoting" ? "pricing…" : r.state === "booking" ? "booking…"
                    : r.state === "ready" ? (r.pick.courier || "") + " " + r.pick.name
                    : r.state === "booked" ? "Booked — order " + r.orderId + " · " + r.msg : r.msg}
                </span>
              </span>
              {r.state === "booked" && r.payLink
                ? <a href={r.payLink} target="_blank" rel="noopener noreferrer" style={{ ...goldBtn, textDecoration: "none", padding: "5px 10px", fontSize: 12 }}>Pay ↗</a>
                : <b style={{ color: tone[r.state] }}>{r.pick ? "£" + Number(r.pick.price || 0).toFixed(2) : ""}</b>}
            </div>
          ))}
        </div>
        {busy && <div style={{ fontSize: 13, fontWeight: 700, color: "#5a6a85", marginBottom: 8 }}>{busy}</div>}
        {ready.length > 0 && !busy && (
          <button style={{ ...goldBtn, justifyContent: "center", width: "100%" }} onClick={bookAll}>
            <Icon name="truck" stroke={NAVY} size={15} />Book all {ready.length} · £{total.toFixed(2)}
          </button>
        )}
        {booked.length > 0 && !busy && (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {booked.some((r) => r.labelPdf) && (
              <button style={{ ...goldBtn, justifyContent: "center" }} onClick={() => printLabelPdfs(booked.filter((r) => r.labelPdf).map((r) => r.labelPdf))}>
                <Icon name="doc" stroke={NAVY} size={14} />Print the label sheet{booked.filter((r) => r.labelPdf).length > 1 ? " (" + booked.filter((r) => r.labelPdf).length + " labels)" : ""}
              </button>
            )}
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5a6a85" }}>
              {booked.length} booked{unpaid.length ? " — pay each one above to release its label, or top up PrePay + set the P2G_AUTOPAY secret to 1 and the labels print themselves" : " and paid"}.
              The order reference is saved on each sample; Print all / All sent as usual.
            </div>
          </div>
        )}
      </div>
    </div>
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
      setQuotes(r.quotes || []);
      const ord = bookingOrder(r.quotes || []);
      if (ord.length) setPick(ord[0]); // default to the cheapest Evri — we know their drop-off shops
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
      {/* color is set explicitly: the invoice screen mounts this inside the navy
          band (color #fff), and position:fixed doesn't stop that inheriting */}
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", color: NAVY, borderRadius: 14, width: "min(620px, 96vw)", maxHeight: "92vh", overflowY: "auto", padding: "18px 20px", boxShadow: "0 18px 50px #0b1f3f55" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <b style={{ fontSize: 16 }}>Send by courier</b>
          <span style={{ fontSize: 12, color: "#8593a8", fontWeight: 700 }}>via Parcel2Go{reference ? " · " + reference : ""}</span>
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
            {done.paid && done.labelPdf && (
              <button style={{ ...goldBtn, justifyContent: "center" }} onClick={() => printLabelPdfs([done.labelPdf])}>
                <Icon name="doc" stroke={NAVY} size={14} />Print label (A4 sticker sheet)
              </button>
            )}
            {done.paid && !done.labelPdf && done.labels && (done.labels["labels-a4"] || done.labels.Labels) && (
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
