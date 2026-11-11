// Home card: the review pipeline at a glance, wired to the same rules as the
// Reviews & Photos screen (10-day hold, exclusions, one ask per person).
// Email-all works right here; the WhatsApp session and everything else jumps
// to the screen with the right filter already set.
import { useMemo } from "react";
import { NAVY, RED } from "../lib/core.js";
import {
  today, reviewable, reviewNext, reviewExclusion, reviewSettingsOf, reviewText,
  reviewChannel, personKeyOf, nudgeDue,
} from "../lib/crmCore.js";
import { Icon, card, sect, goldBtn } from "./crm/ui.jsx";

const gmailBcc = (list, subject, body) => "https://mail.google.com/mail/?view=cm&fs=1&bcc=" + encodeURIComponent(list.join(",")) + "&su=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);

export default function ReviewsCard({ crm, updateCrm, askConfirm, openReviews, samplesSlot }) {
  const tod = today();
  const rs = reviewSettingsOf(crm);

  const s = useMemo(() => {
    const custById = {};
    (crm.customers || []).forEach((c) => (custById[c.id] = c));
    const seen = new Set();
    const askEmail = [], askWa = [];
    let awaiting = 0, nudges = 0, photos = 0;
    (crm.invoices || []).forEach((i) => {
      if (!reviewable(i, crm)) return;
      const f = i.flags || {};
      if (f.reviewRequested && !f.reviewReceived) awaiting++;
      if (f.reviewReceived && !f.photosRequested && !f.socialPosted) photos++;
      if (nudgeDue(i, tod)) nudges++;
      if (reviewNext(i, tod) !== "ask") return;
      const c = custById[i.customerId];
      if (reviewExclusion(i, c, rs, null)) return;
      const key = personKeyOf(c);
      if (seen.has(key)) return;
      seen.add(key);
      const ch = reviewChannel(c);
      if (ch === "email") askEmail.push({ i, c });
      else if (ch === "wa") askWa.push({ i, c });
    });
    return { askEmail, askWa, awaiting, nudges, photos };
  }, [crm, rs, tod]);

  const emailAllHref = s.askEmail.length
    ? gmailBcc(s.askEmail.map(({ c }) => String(c.email).trim()), rs.email.ask.subject, reviewText(rs.email.ask.body, null, rs.link))
    : "";
  const markAsked = () =>
    askConfirm &&
    askConfirm({
      message: "Mark " + s.askEmail.length + " job" + (s.askEmail.length === 1 ? "" : "s") + " as review asked? The one-week nudge clock starts now.",
      confirmLabel: "Mark asked",
      action: () =>
        updateCrm((c) => {
          const ids = new Set(s.askEmail.map((x) => x.i.id));
          c.invoices.forEach((t) => { if (ids.has(t.id)) { if (!t.flags) t.flags = {}; t.flags.reviewRequested = true; if (!t.reviewAskedAt) t.reviewAskedAt = today(); } });
          return c;
        }),
    });

  const go = (f) => openReviews && openReviews(f);
  const rows = [
    {
      n: s.askWa.length, label: "To ask on WhatsApp", tone: RED, filter: "To ask",
      cta: s.askWa.length > 0 && (
        <button onClick={() => go("To ask")} style={{ border: "1px solid #25D36655", background: "#25D36622", color: "#0b6b4f", borderRadius: 8, padding: "5px 10px", fontFamily: "inherit", fontWeight: 800, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="wa" stroke="#128C7E" size={13} />Start session
        </button>
      ),
    },
    {
      n: s.askEmail.length, label: "To ask by email", tone: RED, filter: "To ask",
      cta: s.askEmail.length > 0 && (
        <a href={emailAllHref} target="_blank" rel="noreferrer" onClick={markAsked} style={{ ...goldBtn, padding: "5px 10px", fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="mail" stroke={NAVY} size={13} />Email all
        </a>
      ),
    },
    { n: s.nudges, label: "Nudges due (a week since the ask)", tone: "#a05f10", filter: "Awaiting review" },
    { n: s.photos, label: "Reviews in — photos to ask for", tone: "#2E7D4F", filter: "Review in" },
    { n: s.awaiting, label: "Awaiting a review", tone: "#8593a8", filter: "Awaiting review" },
  ];

  const reviewsCol = (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <p style={{ ...sect, margin: 0 }}>Reviews &amp; Photos</p>
        <span style={{ marginLeft: 10, fontSize: 11.5, fontWeight: 700, color: "#8593a8" }}>Tuesday</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => go("To ask")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#185FA5", padding: 0 }}>Open reviews ▸</button>
      </div>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid #f0f2f6", fontSize: 13, fontWeight: 600 }}>
          <b style={{ minWidth: 26, textAlign: "center", fontSize: 15, color: r.n ? r.tone : "#aab3c2" }}>{r.n}</b>
          <button onClick={() => go(r.filter)} style={{ flex: 1, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: r.n ? NAVY : "#8593a8" }}>{r.label}</button>
          {r.cta || null}
        </div>
      ))}
      <div style={{ fontSize: 11.5, fontWeight: 600, color: "#8593a8", marginTop: 8 }}>
        Asks go out 10 days after delivery, one per person — website orders, collections and opted-out accounts stay out.
      </div>
    </div>
  );
  return (
    <div style={{ ...card, marginBottom: 0, height: "100%", boxSizing: "border-box" }}>
      {/* one card for the week's chasing: Monday samples | Tuesday reviews, side by side */}
      {samplesSlot ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "6px 28px" }}>
          <div style={{ minWidth: 0 }}>{samplesSlot}</div>
          {reviewsCol}
        </div>
      ) : reviewsCol}
    </div>
  );
}
