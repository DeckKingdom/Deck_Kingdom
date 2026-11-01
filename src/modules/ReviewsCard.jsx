// Home card: after-care prompts for finished jobs —
// ask for a Google review 10 days after delivery, and for photos of the job at 21 days.
// Per-customer WhatsApp / email open a ready-written message and tick the job's follow-up flag;
// the bulk "send all" buttons are placeholders until WhatsApp/email sending is wired in.
import { NAVY, RED, addDays } from "../lib/core.js";
import { today, isVoidInvoice } from "../lib/crmCore.js";
import { Icon, card, sect, Soon } from "./crm/ui.jsx";

export const REVIEW_DAYS = 10;
export const PHOTO_DAYS = 21;
const WINDOW_DAYS = 60; // older finished jobs drop off the list
// Google review link — swap for the Business Profile's own "ask for reviews" link (g.page/r/…) when you have it
const REVIEW_URL = "https://www.google.com/search?q=Deck+Kingdom+Ashton-under-Lyne+reviews";

const UK_PHONE = (v) => { let d = String(v || "").replace(/\D/g, ""); if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("0")) d = "44" + d.slice(1); return d.length >= 10 ? d : ""; };
const phoneOf = (c) => c && (UK_PHONE(c.mobile) || (/^447/.test(UK_PHONE(c.landline)) ? UK_PHONE(c.landline) : ""));
const emailOf = (c) => (c && String(c.email || "").includes("@") ? c.email.trim() : "");
const firstName = (c) => String((c && (c.contact || c.name)) || "").trim().split(/\s+/)[0];
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);

const MESSAGES = {
  review: {
    subject: "How's your new install? A quick favour",
    text: (c) => (firstName(c) ? "Hi " + firstName(c) : "Hi") + ", it's Deck Kingdom. Hope you're enjoying the new install! If you've got a minute, a Google review would really help a small local business like ours: " + REVIEW_URL + " — thank you!",
  },
  photos: {
    subject: "We'd love to see your finished project",
    text: (c) => (firstName(c) ? "Hi " + firstName(c) : "Hi") + ", it's Deck Kingdom. We'd love to see how your project turned out — could you reply with a few photos of the finished job? With your OK we may share them on our socials. Thanks!",
  },
};

export default function ReviewsCard({ crm, updateCrm, openInvoice }) {
  const tod = today();
  const cust = {};
  (crm.customers || []).forEach((c) => (cust[c.id] = c));
  const done = (crm.invoices || []).filter((i) => i.deliveryCompleted && i.deliveryDate && !isVoidInvoice(i) && i.deliveryDate >= addDays(tod, -WINDOW_DAYS));
  const age = (i) => daysBetween(i.deliveryDate, tod);
  const reviews = done.filter((i) => age(i) >= REVIEW_DAYS && !i.flags.reviewRequested && !i.flags.reviewReceived).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  const photos = done.filter((i) => age(i) >= PHOTO_DAYS && !i.flags.photosRequested).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  const soonR = done.filter((i) => age(i) < REVIEW_DAYS && !i.flags.reviewRequested).length;

  const tick = (id, flag) => updateCrm((c) => { const t = c.invoices.find((x) => x.id === id); if (t) t.flags[flag] = true; return c; });
  const bulkNote = (what) => "Send every customer in this list their " + what + " message in one go, in the background, and tick them all off. Needs the WhatsApp Business API (e.g. Twilio or 360dialog, with an approved template) and an email sending service (e.g. Resend or the Krystal SMTP) wired in — same as Confirm schedule's auto-send.";

  const b = (bg) => ({ width: 26, height: 26, borderRadius: 8, border: "none", background: bg, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, textDecoration: "none", flex: "none" });
  const Col = ({ kind, list, flag, title, days, icon }) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <Icon name={icon} size={15} stroke="#9a7408" />
        <b style={{ fontSize: 13.5, color: NAVY }}>{title}</b>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#8593a8" }}>{days} days after delivery</span>
        <b style={{ marginLeft: "auto", fontSize: 15, color: list.length ? "#a05f10" : "#aab3c2" }}>{list.length}</b>
      </div>
      <div style={{ display: "flex", gap: 6, margin: "2px 0 6px", flexWrap: "wrap" }}>
        <Soon label="WhatsApp all" icon="wa" note={bulkNote(kind === "review" ? "Google review" : "photo request")} />
        <Soon label="Email all" icon="mail" note={bulkNote(kind === "review" ? "Google review" : "photo request")} />
      </div>
      {list.length === 0 ? <div style={{ fontSize: 12.5, color: "#8593a8", fontWeight: 600, padding: "6px 0" }}>Nobody due — all caught up.</div>
        : list.slice(0, 6).map((i) => {
          const c = cust[i.customerId];
          const ph = phoneOf(c), em = emailOf(c);
          const m = MESSAGES[kind];
          const text = m.text(c);
          return (
            <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f0f2f6" }}>
              <button className="dk-title-link" onClick={() => openInvoice && openInvoice(i.id)}
                style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6, textAlign: "left" }}>
                <b style={{ fontSize: 13, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c ? c.name || "Unnamed" : "No customer"}</b>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: age(i) >= days + 7 ? RED : "#8593a8", whiteSpace: "nowrap" }}>{age(i)}d ago</span>
              </button>
              {ph ? <a href={"whatsapp://send?phone=" + ph + "&text=" + encodeURIComponent(text)} onClick={() => tick(i.id, flag)} title={"WhatsApp " + (c.mobile || "")} style={b("#25D36622")}><Icon name="wa" stroke="#128C7E" size={14} /></a>
                : <span title="No mobile number" style={{ ...b("#f0f2f6"), cursor: "default", opacity: 0.5 }}><Icon name="wa" stroke="#aab3c2" size={14} /></span>}
              {em ? <a href={"https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(em) + "&su=" + encodeURIComponent(m.subject) + "&body=" + encodeURIComponent(text.replace(", it's Deck Kingdom. ", ",\n\n") + "\n\nKind regards,\nDeck Kingdom")}
                  target="_blank" rel="noopener noreferrer" onClick={() => tick(i.id, flag)} title={"Email " + em} style={b("#185FA51a")}><Icon name="mail" stroke="#185FA5" size={13} /></a>
                : <span title="No email address" style={{ ...b("#f0f2f6"), cursor: "default", opacity: 0.5 }}><Icon name="mail" stroke="#aab3c2" size={13} /></span>}
              <button type="button" title="Mark as asked (e.g. asked by phone or in person)" onClick={() => tick(i.id, flag)} style={b("#eef1f6")}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke={NAVY} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </button>
            </div>
          );
        })}
      {list.length > 6 && <div style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, paddingTop: 4 }}>+ {list.length - 6} more</div>}
    </div>
  );

  return (
    <div style={{ ...card, marginBottom: 0, height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <p style={{ ...sect, margin: 0 }}>Reviews &amp; photos</p>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#8593a8" }}>finished jobs from the last {WINDOW_DAYS} days{soonR ? " · " + soonR + " more coming up" : ""}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 22 }}>
        <Col kind="review" list={reviews} flag="reviewRequested" title="Google review" days={REVIEW_DAYS} icon="star" />
        <Col kind="photos" list={photos} flag="photosRequested" title="Photos of the job" days={PHOTO_DAYS} icon="cam" />
      </div>
    </div>
  );
}
