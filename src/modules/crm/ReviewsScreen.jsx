// Reviews & Photos: the after-delivery pipeline worked as one list — ask for
// the Google review (email or WhatsApp, following each account's preferred
// contact), log it arriving, chase photos for the socials, mark the post.
// Trustpilot is automatic via Woo on web orders, so those are excluded from
// bulk asks by default. Same five flags as the schedule's follow-up icons.
import { useState, useMemo, useEffect } from "react";
import { NAVY, GOLD, prettyDate, daysBetween } from "../../lib/core.js";
import {
  FOLLOWUP_FLAGS, today, isSaleInvoice, onSchedule, gbp,
  reviewSettingsOf, reviewText, reviewExclusion, customerDupeGroups, personKeyOf,
  reviewNext, nudgeDue, NUDGE_AFTER_DAYS,
} from "../../lib/crmCore.js";
import { Icon, Tg, card, sect, lbl, inp, btn, goldBtn, Modal, ListHero, HeroStat, SearchBox, FilterPills } from "./ui.jsx";
import { waNumber, getWaMode } from "./CustomersScreen.jsx";
import { loadAllDrops } from "../../data/drops.js";
import { issueOf } from "./IssuesScreen.jsx";

const th = { fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap", textAlign: "left" };
const tdc = { padding: "7px 8px", borderBottom: "1px solid #f0f2f6", fontSize: 13, fontWeight: 600, verticalAlign: "middle" };

const PERIODS = [["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last 12 months"], ["all", "All time"]];
const FILTERS = ["To ask", "Awaiting review", "Review in", "Posted", "All"];

// where a job sits in the pipeline, from its follow-up flags
export const reviewStage = (i) => {
  const f = i.flags || {};
  if (f.socialPosted) return "Posted";
  if (f.reviewReceived) return "Review in";
  if (f.reviewRequested) return "Awaiting review";
  return "To ask";
};
const STAGE_TONES = { "To ask": "#C64545", "Awaiting review": "#E8912D", "Review in": "#2E7D4F", Posted: NAVY };
const MSG_NAMES = { ask: "review ask", nudge: "nudge", photos: "photo ask", thanks: "thank-you" };

const gmailTo = (to, subject, body) => "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(to) + "&su=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
const gmailBcc = (list, subject, body) => "https://mail.google.com/mail/?view=cm&fs=1&bcc=" + encodeURIComponent(list.join(",")) + "&su=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
const waHref = (mobile, text) => (getWaMode() === "web" ? "https://web.whatsapp.com/send?phone=" : "whatsapp://send?phone=") + waNumber(mobile) + "&text=" + encodeURIComponent(text);

// which channel a bulk ask uses for this account: their preference first, then whatever we hold
const channelOf = (c) => {
  const pref = String((c && c.contactMethod) || "").toLowerCase();
  const hasWa = !!waNumber(c && c.mobile), hasEm = /@/.test(String((c && c.email) || ""));
  if (/whatsapp|text|messenger|phone/.test(pref)) return hasWa ? "wa" : hasEm ? "email" : "";
  return hasEm ? "email" : hasWa ? "wa" : "";
};

const chip = (bg, fg) => ({ fontSize: 11, fontWeight: 800, color: fg, background: bg, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" });
const linkBtn = { border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", padding: 0 };

export default function ReviewsScreen({ crm, updateCrm, askConfirm, openInvoice, goCustomer }) {
  const [filter, setFilter] = useState("To ask");
  const [period, setPeriod] = useState("90");
  const [search, setSearch] = useState("");
  const [settings, setSettings] = useState(false);
  const [dupes, setDupes] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [showExcl, setShowExcl] = useState(false);
  const [issueIds, setIssueIds] = useState(null); // invoice ids with a live delivery issue

  const rs = reviewSettingsOf(crm);

  // live delivery issues — a job with one open is never asked
  useEffect(() => {
    let live = true;
    loadAllDrops()
      .then((rows) => { if (live) setIssueIds(new Set((rows || []).filter((r) => !r.voidedAt && r.invoiceId && issueOf(r, crm).live).map((r) => r.invoiceId))); })
      .catch(() => {}); // offline / local: no issue data, no exclusions from it
    return () => { live = false; };
  }, [crm]);

  const custById = useMemo(() => { const m = {}; crm.customers.forEach((c) => (m[c.id] = c)); return m; }, [crm.customers]);
  const siteById = useMemo(() => { const m = {}; crm.sites.forEach((s) => (m[s.id] = s)); return m; }, [crm.sites]);
  const dupeGroups = useMemo(() => customerDupeGroups(crm), [crm.customers]);

  const setFlag = (invId, k, force) =>
    updateCrm((c) => {
      const t = c.invoices.find((i) => i.id === invId);
      if (!t) return c;
      if (!t.flags) t.flags = {};
      t.flags[k] = force === undefined ? !t.flags[k] : force;
      if (k === "reviewRequested" && t.flags[k] && !t.reviewAskedAt) t.reviewAskedAt = today(); // the nudge clock starts at the ask
      return c;
    });
  // what sending this stage's message records on the job
  const stampSend = (invId, kind) =>
    updateCrm((c) => {
      const t = c.invoices.find((i) => i.id === invId);
      if (!t) return c;
      if (!t.flags) t.flags = {};
      if (kind === "ask") { t.flags.reviewRequested = true; if (!t.reviewAskedAt) t.reviewAskedAt = today(); }
      if (kind === "nudge") t.reviewNudgedAt = today();
      if (kind === "photos") t.flags.photosRequested = true;
      return c;
    });
  const saveRs = (next) => updateCrm((c) => { c.reviewSettings = next; return c; });
  const toggleSkip = (invId) => saveRs({ ...rs, skip: rs.skip.includes(invId) ? rs.skip.filter((x) => x !== invId) : [...rs.skip, invId] });
  const toggleOptOut = (custId) => saveRs({ ...rs, optOut: rs.optOut.includes(custId) ? rs.optOut.filter((x) => x !== custId) : [...rs.optOut, custId] });
  const setRule = (k, v) => saveRs({ ...rs, rules: { ...rs.rules, [k]: v } });

  // the pool: delivered sales (what a review can be asked for), newest delivery first
  const tod = today();
  const since = period === "all" ? "" : new Date(Date.now() - Number(period) * 86400000).toISOString().slice(0, 10);
  const pool = useMemo(
    () =>
      crm.invoices
        .filter((i) => i.deliveryCompleted && isSaleInvoice(i) && onSchedule(i, crm))
        .filter((i) => !since || (i.deliveryDate || i.invDate || "") >= since)
        .sort((a, b) => String(b.deliveryDate || b.invDate || "").localeCompare(String(a.deliveryDate || a.invDate || ""))),
    [crm, since]
  );

  const counts = useMemo(() => {
    const n = { All: pool.length };
    FILTERS.slice(0, 4).forEach((f) => (n[f] = 0));
    pool.forEach((i) => n[reviewStage(i)]++);
    return n;
  }, [pool]);
  const photosAsked = useMemo(() => pool.filter((i) => (i.flags || {}).photosRequested).length, [pool]);
  const nudgesDue = useMemo(() => pool.filter((i) => nudgeDue(i, tod)).length, [pool, tod]);
  const toPost = useMemo(() => pool.filter((i) => (i.flags || {}).reviewReceived && !(i.flags || {}).socialPosted).length, [pool]);

  const exclOf = (i) => reviewExclusion(i, custById[i.customerId], rs, issueIds);

  const q = search.trim().toLowerCase();
  const stageRows = pool.filter((i) => {
    if (filter !== "All" && reviewStage(i) !== filter) return false;
    if (q) {
      const c = custById[i.customerId], s = siteById[i.siteId];
      const hay = [String(i.invNo || ""), c && c.name, c && c.postcode, s && s.postcode, s && s.name].map((v) => String(v || "").toLowerCase());
      if (!hay.some((v) => v.includes(q))) return false;
    }
    return true;
  });
  // on the To-ask view, excluded jobs drop out (toggle to see them greyed)
  const excluded = filter === "To ask" ? stageRows.filter((i) => exclOf(i)) : [];
  let rows = filter === "To ask" && !showExcl ? stageRows.filter((i) => !exclOf(i)) : stageRows;
  // awaiting view: jobs due their nudge float to the top
  if (filter === "Awaiting review") rows = [...rows].sort((a, b) => (nudgeDue(b, tod) ? 1 : 0) - (nudgeDue(a, tod) ? 1 : 0));

  // ----- bulk sends: asks on the To-ask pile, week-later nudges on Awaiting review -----
  // One person once (duplicates and repeat jobs collapse), their preferred channel.
  const bulkKind = filter === "To ask" ? "ask" : filter === "Awaiting review" ? "nudge" : null;
  const bulk = useMemo(() => {
    if (!bulkKind) return null;
    const seen = new Set();
    const email = [], wa = [], noContact = [];
    let collapsed = 0;
    stageRows.forEach((i) => {
      if (exclOf(i) || reviewNext(i, tod) !== bulkKind) return;
      const c = custById[i.customerId];
      const key = personKeyOf(c);
      if (seen.has(key)) { collapsed++; return; }
      seen.add(key);
      const ch = channelOf(c);
      if (ch === "email") email.push({ i, c });
      else if (ch === "wa") wa.push({ i, c });
      else noContact.push({ i, c });
    });
    return { email, wa, noContact, collapsed };
  }, [bulkKind, stageRows, custById, rs, issueIds, tod]);

  const markSent = (list, kind) =>
    askConfirm &&
    askConfirm({
      message: "Mark " + list.length + " job" + (list.length === 1 ? "" : "s") + " as " + (kind === "nudge" ? "nudged? They won't be chased again." : "review asked? The one-week nudge clock starts now."),
      confirmLabel: kind === "nudge" ? "Mark nudged" : "Mark asked",
      action: () =>
        updateCrm((c) => {
          const ids = new Set(list.map((x) => x.i.id));
          c.invoices.forEach((t) => {
            if (!ids.has(t.id)) return;
            if (!t.flags) t.flags = {};
            if (kind === "nudge") t.reviewNudgedAt = today();
            else { t.flags.reviewRequested = true; if (!t.reviewAskedAt) t.reviewAskedAt = today(); }
          });
          return c;
        }),
    });

  const bulkEmailHref = bulk && bulk.email.length && bulkKind
    ? gmailBcc(bulk.email.map(({ c }) => String(c.email).trim()), rs.email[bulkKind].subject, reviewText(rs.email[bulkKind].body, null, rs.link))
    : "";

  const pillBadge = (f) => STAGE_TONES[f] || "#8593a8";

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "18px 22px" }}>
      <ListHero
        title="Reviews & Photos"
        sub="Google reviews and photos for the socials — Trustpilot runs itself on website orders"
        action={
          <button onClick={() => setSettings(true)} title="Google link, message wording and bulk rules"
            style={{ ...btn, background: "transparent", border: "1px solid #3a4f78", color: "#fff", display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Icon name="gear" stroke="#cfd6e4" size={15} />Message set-up
          </button>
        }
      >
        <HeroStat label="To ask" value={counts["To ask"]} sub="Delivered, not asked yet" tone={counts["To ask"] ? "#f2a6b1" : GOLD} onClick={() => setFilter("To ask")} />
        <HeroStat label="Awaiting review" value={counts["Awaiting review"]} sub={nudgesDue ? nudgesDue + " due a nudge (week since the ask)" : "Asked — nothing in yet"} tone={nudgesDue ? "#f2a6b1" : undefined} onClick={() => setFilter("Awaiting review")} />
        <HeroStat label="Reviews in" value={counts["Review in"] + counts["Posted"]} sub={pool.length ? Math.round(((counts["Review in"] + counts["Posted"]) / pool.length) * 100) + "% of delivered jobs" : "—"} onClick={() => setFilter("Review in")} />
        <HeroStat label="Photos asked" value={photosAsked} sub={toPost ? toPost + " still to post" : "Customer photos requested"} />
        <HeroStat label="Possible duplicates" value={dupeGroups.length} sub={dupeGroups.length ? "Same person, more than one account" : "No doubles spotted"} tone={dupeGroups.length ? "#f2c66d" : GOLD} onClick={() => setDupes(true)} />
      </ListHero>

      <div style={card}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Search name, invoice #, postcode…" />
          <FilterPills options={FILTERS} value={filter} onPick={setFilter} counts={counts} badge={pillBadge} />
          <span style={{ flex: 1 }} />
          <select value={period} onChange={(e) => setPeriod(e.target.value)}
            style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "7px 10px", borderRadius: 9, border: "1px solid #d5d9e0", background: "#fff", color: "#5a6a85", cursor: "pointer" }}>
            {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {/* bulk bar: only on the To-ask pile */}
        {bulk && (
          <div style={{ background: "#f8f9fb", border: "1px solid #e6e9ef", borderRadius: 10, padding: "10px 13px", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {bulk.email.length > 0 && (
                <a href={bulkEmailHref} target="_blank" rel="noreferrer" onClick={() => markSent(bulk.email, bulkKind)}
                  style={{ ...goldBtn, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <Icon name="mail" stroke={NAVY} size={14} />{bulkKind === "nudge" ? "Email the nudges" : "Email all"} ({bulk.email.length})
                </a>
              )}
              {bulk.wa.length > 0 && (
                <button onClick={() => setWaOpen((o) => !o)} style={{ ...btn, background: "#25D36622", borderColor: "#25D36655", color: "#0b6b4f", display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <Icon name="wa" stroke="#128C7E" size={14} />WhatsApp ({bulk.wa.length}) {waOpen ? "▴" : "▾"}
                </button>
              )}
              {bulk.noContact.length > 0 && <span style={{ fontSize: 12.5, fontWeight: 600, color: "#8593a8" }}>{bulk.noContact.length} with no usable contact</span>}
              {bulk.collapsed > 0 && <span style={{ fontSize: 12.5, fontWeight: 600, color: "#8593a8" }}>· {bulk.collapsed} repeat/duplicate collapsed — one ask per person</span>}
              {excluded.length > 0 && (
                <button onClick={() => setShowExcl((o) => !o)} style={{ ...linkBtn, fontSize: 12.5, fontWeight: 700, color: "#8593a8", textDecoration: "underline" }}>
                  {excluded.length} excluded — {showExcl ? "hide" : "show"}
                </button>
              )}
              <span style={{ flex: 1 }} />
              {/* who never makes the bulk list */}
              <label style={{ fontSize: 12.5, fontWeight: 700, color: "#5a6a85", display: "inline-flex", gap: 5, alignItems: "center" }}>
                <input type="checkbox" checked={!!rs.rules.excludeWeb} onChange={(e) => setRule("excludeWeb", e.target.checked)} />Skip website orders (Trustpilot)
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: "#5a6a85", display: "inline-flex", gap: 5, alignItems: "center" }}>
                <input type="checkbox" checked={!!rs.rules.excludeTrade} onChange={(e) => setRule("excludeTrade", e.target.checked)} />Skip trade accounts
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: "#5a6a85", display: "inline-flex", gap: 5, alignItems: "center" }}>
                Min £<input style={{ ...inp, width: 64, padding: "5px 8px" }} value={rs.rules.minTotal} placeholder="any" onChange={(e) => setRule("minTotal", e.target.value.replace(/[^\d.]/g, ""))} />
              </label>
            </div>
            {waOpen && bulk.wa.length > 0 && (
              <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#8593a8" }}>WhatsApp can't bulk-send — tap each one, the message opens ready to go, and the job ticks itself:</div>
                {bulk.wa.map(({ i, c }) => (
                  <div key={i.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
                    {reviewNext(i, tod) !== bulkKind
                      ? <span style={chip("#e9f6ee", "#28713e")}>{bulkKind === "nudge" ? "nudged" : "asked"} ✓</span>
                      : <a href={waHref(c.mobile, reviewText(rs.wa[bulkKind], c, rs.link))} onClick={() => stampSend(i.id, bulkKind)}
                          style={{ ...chip("#25D36622", "#0b6b4f"), textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <Icon name="wa" stroke="#128C7E" size={12} />Send
                        </a>}
                    <span style={{ fontWeight: 700 }}>{c.name}</span>
                    <span style={{ color: "#8593a8" }}>#{i.invNo} · {c.mobile}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1020 }}>
            <thead>
              <tr>
                <th style={th}>Invoice</th>
                <th style={th}>Customer</th>
                <th style={th}>Postcode</th>
                <th style={th}>Delivered</th>
                <th style={{ ...th, textAlign: "right" }}>Days</th>
                <th style={{ ...th, textAlign: "center" }}>Send</th>
                {FOLLOWUP_FLAGS.map(([k, label]) => (
                  <th key={k} style={{ ...th, textAlign: "center" }}>{label.replace(" requested", " asked").replace(" created", "").replace(" followed up", "")}</th>
                ))}
                <th style={th}>Status</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const c = custById[i.customerId], s = siteById[i.siteId];
                const del = i.deliveryDate || i.invDate || "";
                const days = del ? daysBetween(del, tod) : null;
                const st = reviewStage(i);
                const excl = exclOf(i);
                const msgKind = reviewNext(i, tod);
                const mob = c && waNumber(c.mobile) ? c.mobile : "";
                const em = c && /@/.test(String(c.email || "")) ? String(c.email).trim() : "";
                const optedOut = c && rs.optOut.includes(c.id);
                const dim = excl ? { opacity: 0.55 } : null;
                return (
                  <tr key={i.id} style={dim}>
                    <td style={tdc}>
                      <button onClick={() => openInvoice && openInvoice(i.id)} title="Open the invoice"
                        style={{ ...linkBtn, fontSize: 13, fontWeight: 700, color: NAVY, textDecoration: "underline", textDecorationColor: "#c8cfdb" }}>
                        #{i.invNo || "—"}
                      </button>
                    </td>
                    <td style={{ ...tdc, maxWidth: 210, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <button onClick={() => goCustomer && goCustomer(i.customerId)} title="Open the customer account"
                        style={{ ...linkBtn, fontSize: 13, fontWeight: 700, color: "#1a2b4a" }}>
                        {(c && c.name) || "—"}
                      </button>
                    </td>
                    <td style={{ ...tdc, whiteSpace: "nowrap" }}>{(s && s.postcode) || (c && c.postcode) || ""}</td>
                    <td style={{ ...tdc, whiteSpace: "nowrap" }}>{del ? prettyDate(del) : "—"}</td>
                    <td style={{ ...tdc, textAlign: "right", color: days > 28 && st === "To ask" && !excl ? "#C64545" : "#5a6a85" }}>{days === null ? "—" : days}</td>
                    <td style={{ ...tdc, textAlign: "center", whiteSpace: "nowrap" }}>
                      {/* the message this stage needs, on the channels we hold for them */}
                      {excl ? (
                        <span style={chip("#f1f3f7", "#8593a8")} title={"Left out of bulk asks: " + excl}>{excl}</span>
                      ) : msgKind === "" ? (
                        // the cadence says leave them be — show where it's up to
                        st === "Awaiting review" ? (
                          i.reviewNudgedAt
                            ? <span style={chip("#f1f3f7", "#8593a8")} title="Asked and nudged once — the cadence stops here">nudged {prettyDate(i.reviewNudgedAt)}</span>
                            : <span style={chip("#fdf3e4", "#8a5a14")} title={"Nudge unlocks " + NUDGE_AFTER_DAYS + " days after the ask"}>asked {i.reviewAskedAt ? prettyDate(i.reviewAskedAt) : ""} · wait</span>
                        ) : st === "Review in" ? (
                          <span style={chip("#e9f6ee", "#28713e")}>photos asked</span>
                        ) : (
                          <span style={{ color: "#aab3c2", fontWeight: 700 }}>—</span>
                        )
                      ) : (
                        <>
                          {msgKind === "nudge" && <span style={{ ...chip("#C64545", "#fff"), marginRight: 6 }}>nudge due</span>}
                          {mob && (
                            <a href={waHref(mob, reviewText(rs.wa[msgKind], c, rs.link))} onClick={() => stampSend(i.id, msgKind)}
                              title={"WhatsApp the " + MSG_NAMES[msgKind] + " to " + mob}
                              style={{ display: "inline-flex", width: 26, height: 26, borderRadius: 8, background: "#25D36622", alignItems: "center", justifyContent: "center", marginRight: 4 }}>
                              <Icon name="wa" stroke="#128C7E" size={14} />
                            </a>
                          )}
                          {em && (
                            <a href={gmailTo(em, rs.email[msgKind].subject, reviewText(rs.email[msgKind].body, c, rs.link))} target="_blank" rel="noreferrer"
                              onClick={() => stampSend(i.id, msgKind)}
                              title={"Email the " + MSG_NAMES[msgKind] + " to " + em}
                              style={{ display: "inline-flex", width: 26, height: 26, borderRadius: 8, background: "#eef1f6", alignItems: "center", justifyContent: "center" }}>
                              <Icon name="mail" stroke="#3b4c6b" size={14} />
                            </a>
                          )}
                          {!mob && !em && <span style={{ fontSize: 11.5, color: "#aab3c2", fontWeight: 700 }}>no contact</span>}
                        </>
                      )}
                    </td>
                    {FOLLOWUP_FLAGS.map(([k, label, icon]) => (
                      <td key={k} style={{ ...tdc, textAlign: "center" }}>
                        <Tg on={(i.flags || {})[k]} title={label} icon={icon} onClick={() => setFlag(i.id, k)} />
                      </td>
                    ))}
                    <td style={tdc}>
                      <span style={chip(STAGE_TONES[st], "#fff")}>{st}</span>
                    </td>
                    <td style={{ ...tdc, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => toggleSkip(i.id)} title={rs.skip.includes(i.id) ? "Skipped — put this job back in" : "Skip this job (never bulk-asked)"}
                        style={{ ...linkBtn, padding: 2, lineHeight: 0, marginRight: 2 }}>
                        <Icon name="slash" stroke={rs.skip.includes(i.id) ? "#C64545" : "#aab3c2"} size={14} />
                      </button>
                      <button onClick={() => c && toggleOptOut(c.id)} title={optedOut ? "Account opted out of review asks — switch back on" : "Opt this whole account out of review asks"}
                        style={{ ...linkBtn, padding: 2, lineHeight: 0 }}>
                        <Icon name="userx" stroke={optedOut ? "#C64545" : "#aab3c2"} size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={13} style={{ ...tdc, textAlign: "center", color: "#8593a8", padding: 26 }}>
                  {excluded.length ? "Everything left here is excluded by the rules — use “show” above to see them." : pool.length ? "Nothing in this view — try another filter or a longer period." : "No delivered jobs in this period yet."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {settings && <ReviewSettings rs={rs} onSave={(d) => { saveRs(d); setSettings(false); }} onClose={() => setSettings(false)} />}
      {dupes && <DupePanel groups={dupeGroups} crm={crm} goCustomer={goCustomer} optOut={rs.optOut} onClose={() => setDupes(false)} />}
      <div style={{ height: 30 }} />
    </div>
  );
}

// ----- message set-up: Google link + the three messages, email and WhatsApp wording -----
function ReviewSettings({ rs, onSave, onClose }) {
  const [d, setD] = useState(() => JSON.parse(JSON.stringify(rs)));
  const area = { ...inp, width: "100%", boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.5, resize: "vertical" };
  const setEmail = (k, f, v) => setD((x) => ({ ...x, email: { ...x.email, [k]: { ...x.email[k], [f]: v } } }));
  const setWa = (k, v) => setD((x) => ({ ...x, wa: { ...x.wa, [k]: v } }));
  return (
    <Modal title="Reviews — message set-up" onClose={onClose} width={680}>
      <div style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600, marginBottom: 10 }}>
        <b>{"{name}"}</b> becomes the customer's first name ("there" in group emails) and <b>{"{link}"}</b> your Google review link.
        Website orders get the Trustpilot invite from the website automatically — these messages are for Google reviews and photos.
      </div>
      <label style={{ display: "block", marginBottom: 12 }}>
        <span style={lbl}>Google review link</span>
        <input style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={d.link} onChange={(e) => setD((x) => ({ ...x, link: e.target.value.trim() }))} />
      </label>
      {[["ask", "Review ask — after delivery"], ["nudge", "Nudge — a week after the ask, once, then stop"], ["photos", "Photo ask — only to customers whose review came in"], ["thanks", "Thank you — once it's posted"]].map(([k, title]) => (
        <div key={k} style={{ marginBottom: 14, borderTop: "1px solid #eef1f6", paddingTop: 10 }}>
          <p style={{ ...sect, marginBottom: 6 }}>{title}</p>
          <span style={lbl}>Email subject</span>
          <input style={{ ...inp, width: "100%", boxSizing: "border-box", marginBottom: 6 }} value={d.email[k].subject} onChange={(e) => setEmail(k, "subject", e.target.value)} />
          <span style={lbl}>Email body</span>
          <textarea style={area} rows={5} value={d.email[k].body} onChange={(e) => setEmail(k, "body", e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <span style={{ ...lbl, marginTop: 6, display: "block" }}>WhatsApp message</span>
          <textarea style={area} rows={3} value={d.wa[k]} onChange={(e) => setWa(k, e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button style={btn} onClick={onClose}>Cancel</button>
        <button className="dk-save" style={goldBtn} onClick={() => onSave(d)}>Save</button>
      </div>
    </Modal>
  );
}

// ----- possible duplicate accounts: same mobile, email, or name + postcode -----
function DupePanel({ groups, crm, goCustomer, optOut, onClose }) {
  const invCount = (cid) => crm.invoices.filter((i) => i.customerId === cid).length;
  return (
    <Modal title={"Possible duplicate accounts (" + groups.length + ")"} onClose={onClose} width={720}>
      <div style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600, marginBottom: 10 }}>
        Accounts sharing a mobile, an email, or the same name at the same postcode. Bulk review asks already treat each group as one person.
      </div>
      {!groups.length && <div style={{ color: "#8593a8", fontWeight: 600, padding: 10 }}>No doubles spotted.</div>}
      {groups.map((g, k) => (
        <div key={k} style={{ border: "1px solid #e6e9ef", borderRadius: 10, padding: "8px 11px", marginBottom: 8 }}>
          {g.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, fontWeight: 600, padding: "3px 0", flexWrap: "wrap" }}>
              <span style={{ color: "#8593a8" }}>#{c.accountNo || "—"}</span>
              <button onClick={() => { goCustomer && goCustomer(c.id); onClose(); }} style={{ ...linkBtn, fontWeight: 700, color: NAVY, textDecoration: "underline", textDecorationColor: "#c8cfdb", fontSize: 13 }}>{c.name || "—"}</button>
              <span style={{ color: "#5a6a85" }}>{c.postcode}</span>
              <span style={{ color: "#5a6a85" }}>{c.mobile}</span>
              <span style={{ color: "#5a6a85", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.email}</span>
              <span style={{ marginLeft: "auto", color: "#8593a8", fontSize: 12 }}>{invCount(c.id)} inv{optOut.includes(c.id) ? " · opted out" : ""}</span>
            </div>
          ))}
        </div>
      ))}
    </Modal>
  );
}
