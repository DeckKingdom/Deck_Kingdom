// Customers tab: searchable account list -> account view with sites and
// invoice history, per the approved mockup.
import React, { useState, useMemo, useEffect } from "react";
import { NAVY, GOLD, RED, prettyDate, prettyDateTime, addDays as addDaysC } from "../../lib/core.js";
import {
  originText, recordOrigin, userInitials,
  blankCustomer, blankSite, nextNumber, SOURCES,
  invoiceTotals, gbp, isPaid, isSaleInvoice, today as todayC, followUpDone, FOLLOWUP_FLAGS, FIELD_FORMATS, CONTACT_METHODS,
  TRADE_COUNTER, TRADE_COUNTER_LABEL, quoteTotals, quoteStatus, quoteInvoice, quoteRef, QUOTE_TONES, sampleRef, sampleStatus, sampleInvoice, SAMPLE_TONES,
} from "../../lib/crmCore.js";
import { ComposeEmail, EmailHistory } from "./EmailPanels.jsx";
import { emailReady } from "../../data/email.js";
import { Icon, Chip, Modal, SuggestInput, selectAllProps, sect, lbl, card, abtn, inp, btn, goldBtn } from "./ui.jsx";

const navyBtn = { ...btn, background: "transparent", border: "1px solid #3a4f78", color: "#fff" };

// quick-contact links: WhatsApp (UK numbers → 44…) and email
export const waNumber = (v) => {
  let d = String(v || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "44" + d.slice(1);
  return d.length >= 10 ? d : "";
};
const isUkMobile = (v) => /^447\d{9}$/.test(waNumber(v));
const firstName = (v) => String(v || "").trim().split(/\s+/)[0] || "";
// per-PC choice: "app" = WhatsApp (Business) desktop app, "web" = WhatsApp Web tab
export const getWaMode = () => "app";
export const waLink = (num, name, mode = getWaMode()) => (mode === "web" ? "https://web.whatsapp.com/send?phone=" : "whatsapp://send?phone=") + waNumber(num) + "&text=" + encodeURIComponent((firstName(name) ? "Hi " + firstName(name) + ", " : "Hi, ") + "it's Deck Kingdom. ");
// Gmail compose in the browser (not the PC's default mail app)
export const mailLink = (email, name) => "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(String(email || "").trim()) + "&su=" + encodeURIComponent("Deck Kingdom") + "&body=" + encodeURIComponent((firstName(name) ? "Hi " + firstName(name) : "Hi") + ",\n\n");
const qbtn = (bg, fg) => ({ width: 30, height: 30, borderRadius: 8, border: "none", background: bg, color: fg, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flex: "none", textDecoration: "none" });
export const QuickWa = ({ num, name, size = 30, mode = getWaMode() }) => waNumber(num) ? (
  <a href={waLink(num, name, mode)} {...(mode === "web" ? { target: "dk-whatsapp" } : {})} title={"WhatsApp " + num} style={{ ...qbtn("#25D36622", "#128C7E"), width: size, height: size }}>
    <Icon name="wa" stroke="#128C7E" size={size > 26 ? 16 : 14} />
  </a>
) : null;
export const QuickMail = ({ email, name, size = 30, onCompose }) => !String(email || "").includes("@") ? null : onCompose ? (
  <button onClick={onCompose} title={"Email " + email} style={{ ...qbtn("#185FA51a", "#185FA5"), width: size, height: size }}>
    <Icon name="mail" stroke="#185FA5" size={size > 26 ? 15 : 13} />
  </button>
) : (
  <a href={mailLink(email, name)} target="_blank" rel="noopener noreferrer" title={"Email " + email} style={{ ...qbtn("#185FA51a", "#185FA5"), width: size, height: size }}>
    <Icon name="mail" stroke="#185FA5" size={size > 26 ? 15 : 13} />
  </a>
);

// hover a record's name to see when it was created / last changed and by whom
// small white pill shown while hovering its children
const HoverPill = ({ lines, children, block, head, foot }) => {
  const [open, setOpen] = useState(false);
  const ls = (lines || []).filter(Boolean), fs = (foot || []).filter(Boolean);
  return (
    <span style={{ position: "relative", display: block ? "block" : "inline-block", minWidth: 0 }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      {open && ls.length > 0 && (
        <span style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", zIndex: 20, background: "#fff", color: NAVY, border: "1px solid #e6e9ef", borderRadius: 12, padding: "8px 12px", boxShadow: "0 8px 24px rgba(11,31,63,.2)", whiteSpace: "nowrap", fontSize: 12, fontWeight: 600, lineHeight: 1.6 }}>
          {head && <b style={{ display: "block", fontSize: 12.5 }}>{head}</b>}
          {ls.map((l, k) => <span key={k} style={{ display: "block" }}>{l}</span>)}
          {fs.length > 0 && <span style={{ display: "block", borderTop: "1px solid #f0f2f6", marginTop: 5, paddingTop: 5, color: "#8593a8", fontSize: 11.5 }}>{fs.map((l, k) => <span key={k} style={{ display: "block" }}>{l}</span>)}</span>}
        </span>
      )}
    </span>
  );
};
const stampLines = (crm, rec) => {
  const who = (v) => String(v || "").split("@")[0];
  return [
    rec.created ? originText(rec, prettyDate(rec.created)) : "",
    rec.updatedAt ? "Updated " + prettyDateTime(rec.updatedAt) + (rec.modifiedBy ? " by " + who(rec.modifiedBy) + " (" + userInitials(crm, rec.modifiedBy) + ")" : "")
      : rec.modifiedBy ? "Last modified by " + who(rec.modifiedBy) : "",
  ].filter(Boolean);
};
const oneLine = { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

const FieldRow = ({ icon, label, value, actions, full }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #f0f2f6" }}>
    <div style={{ width: 30, height: 30, borderRadius: 8, background: "#f0f3f8", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
      <Icon name={icon} stroke={NAVY} />
    </div>
    <div style={{ minWidth: 0, flex: 1 }}>
      <span style={{ ...lbl, marginBottom: 0 }}>{label}</span>
      {full && value ? (
        <HoverPill lines={full} block><b style={{ ...oneLine, fontSize: 14, color: NAVY, cursor: "default" }}>{value}</b></HoverPill>
      ) : (
        <b style={{ fontSize: 14, color: value ? NAVY : "#aab3c2", overflowWrap: "anywhere" }}>{value || "—"}</b>
      )}
    </div>
    {actions && <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>{actions}</div>}
  </div>
);

const NoteBox = ({ children }) => (
  <div style={{ marginTop: 8, background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "7px 11px", fontSize: 12.5, fontWeight: 600, display: "flex", gap: 7, alignItems: "flex-start", color: "#6b5305" }}>
    <span style={{ marginTop: 2 }}><Icon name="note" size={13} stroke="#9a7408" /></span>
    <span>{children}</span>
  </div>
);

export default function CustomersScreen({ crm, updateCrm, askConfirm, selId, setSelId, openInvoice, newInvoiceFor, openQuote, newQuoteFor, openSample, newSampleFor, onOutstanding, me, newSignal, onNewHandled, onEmailSetup }) {
  const [search, setSearch] = useState("");
  const [custDraft, setCustDraft] = useState(null);
  const [siteDraft, setSiteDraft] = useState(null);
  const [noEdit, setNoEdit] = useState(false); // account # unlocked for editing
  const [noConfirm, setNoConfirm] = useState(false); // confirmation bar showing
  const [siteNoEdit, setSiteNoEdit] = useState(false);
  const [siteNoConfirm, setSiteNoConfirm] = useState(false);
  const [numPanel, setNumPanel] = useState(false);
  const [numDraft, setNumDraft] = useState(null);

  const invByCust = useMemo(() => {
    const m = {};
    crm.invoices.forEach((i) => (m[i.customerId] = m[i.customerId] || []).push(i));
    Object.values(m).forEach((list) => list.sort((a, b) => (b.date || "").localeCompare(a.date || "")));
    return m;
  }, [crm.invoices]);

  const quotesByCust = useMemo(() => {
    const m = {};
    (crm.quotes || []).forEach((q) => (m[q.customerId] = m[q.customerId] || []).push(q));
    Object.values(m).forEach((list) => list.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (Number(b.quoteNo) || 0) - (Number(a.quoteNo) || 0)));
    return m;
  }, [crm.quotes]);

  const samplesByCust = useMemo(() => {
    const m = {};
    (crm.samples || []).forEach((x) => (m[x.customerId] = m[x.customerId] || []).push(x));
    Object.values(m).forEach((list) => list.sort((a, b) => (b.date || "").localeCompare(a.date || "")));
    return m;
  }, [crm.samples]);

  const sitesByCust = useMemo(() => {
    const m = {};
    crm.sites.forEach((s) => (m[s.customerId] = m[s.customerId] || []).push(s));
    return m;
  }, [crm.sites]);

  const sel = crm.customers.find((c) => c.id === selId) || null;

  // type-ahead suggestions from existing records (helps against duplicates)
  const SUGGEST_FIELDS = ["name", "address", "town", "postcode", "contact", "landline", "mobile", "email"];
  const suggestions = useMemo(() => {
    if (!custDraft) return null;
    const out = {};
    SUGGEST_FIELDS.forEach((k) => {
      const seen = new Set();
      crm.customers.forEach((c) => {
        const v = String(c[k] || "").trim();
        if (v) seen.add(v);
      });
      out[k] = [...seen].sort().slice(0, 2000);
    });
    return out;
  }, [crm.customers, Boolean(custDraft)]);

  // possible duplicates of what's being typed (exact name / phone digits / email)
  const digits = (v) => String(v || "").replace(/\D/g, "");
  const dupes = useMemo(() => {
    if (!custDraft) return [];
    const name = (custDraft.name || "").trim().toLowerCase();
    const mob = digits(custDraft.mobile);
    const land = digits(custDraft.landline);
    const email = (custDraft.email || "").trim().toLowerCase();
    return crm.customers
      .filter((c) => c.id !== custDraft.id)
      .filter((c) => {
        if (name && (c.name || "").trim().toLowerCase() === name) return true;
        if (mob.length > 6 && (digits(c.mobile) === mob || digits(c.landline) === mob)) return true;
        if (land.length > 6 && (digits(c.landline) === land || digits(c.mobile) === land)) return true;
        if (email && (c.email || "").trim().toLowerCase() === email) return true;
        return false;
      })
      .slice(0, 3);
  }, [crm.customers, custDraft]);

  // ===== actions =====
  const openCustDraft = (draft) => {
    setNoEdit(false);
    setNoConfirm(false);
    setCustDraft(draft);
  };

  const startNewCustomer = () =>
    openCustDraft({ ...blankCustomer(), source: "Manual entry", accountNo: nextNumber(crm.customers, "accountNo", crm.numbering.account), createdBy: me || "", _new: true });

  const saveCustomer = () => {
    const d = custDraft;
    if (!d.name.trim()) return;
    updateCrm((c) => {
      if (d._new) {
        const { _new, ...clean } = d;
        c.customers.unshift(clean);
        c.numbering.account = (Number(clean.accountNo) || 0) + 1;
      } else {
        const t = c.customers.find((x) => x.id === d.id);
        if (t) Object.assign(t, d, { modifiedBy: me || t.modifiedBy });
      }
      return c;
    });
    if (d._new) setSelId(d.id);
    setCustDraft(null);
  };

  const removeCustomer = (cust) => {
    const invs = invByCust[cust.id] || [];
    if (invs.length) {
      askConfirm({ message: "This account has " + invs.length + " invoice(s), so it can't be deleted.", okOnly: true });
      return;
    }
    askConfirm({
      message: "Delete account #" + (cust.accountNo || "—") + " — " + (cust.name || "unnamed") + "? Its sites" + ((quotesByCust[cust.id] || []).length ? ", " + quotesByCust[cust.id].length + " quote(s)" : "") + ((samplesByCust[cust.id] || []).length ? ", " + samplesByCust[cust.id].length + " sample request(s)" : "") + " will be removed too.",
      confirmLabel: "Delete",
      danger: true,
      action: () =>
        updateCrm((c) => {
          c.customers = c.customers.filter((x) => x.id !== cust.id);
          c.sites = c.sites.filter((x) => x.customerId !== cust.id);
          c.quotes = (c.quotes || []).filter((x) => x.customerId !== cust.id);
          c.samples = (c.samples || []).filter((x) => x.customerId !== cust.id);
          return c;
        }) || setSelId(null),
    });
  };

  const openSiteDraft = (draft) => {
    setSiteNoEdit(false);
    setSiteNoConfirm(false);
    setSiteDraft(draft);
  };

  // "+" next to Customers in the side menu: open the new-account form straight away
  useEffect(() => {
    if (!newSignal) return;
    startNewCustomer();
    if (onNewHandled) onNewHandled();
  }, [newSignal]);

  const startNewSite = () =>
    openSiteDraft({ ...blankSite(sel.id), siteNo: nextNumber(crm.sites, "siteNo", crm.numbering.site), _new: true });

  const saveSite = () => {
    const d = siteDraft;
    updateCrm((c) => {
      if (d._new) {
        const { _new, ...clean } = d;
        c.sites.push(clean);
        c.numbering.site = (Number(clean.siteNo) || 0) + 1;
      } else {
        const t = c.sites.find((x) => x.id === d.id);
        if (t) Object.assign(t, d);
      }
      return c;
    });
    setSiteDraft(null);
  };

  const removeSite = (site) =>
    askConfirm({
      message: "Remove site #" + (site.siteNo || "—") + " — " + (site.name || site.address || "unnamed") + "? Past invoices keep their records.",
      confirmLabel: "Remove",
      danger: true,
      action: () =>
        updateCrm((c) => {
          c.sites = c.sites.filter((x) => x.id !== site.id);
          return c;
        }),
    });

  const removeSample = (smp) =>
    askConfirm({
      message: "Delete sample request " + sampleRef(smp) + "? It will drop out of the conversion figures.",
      confirmLabel: "Delete",
      danger: true,
      action: () => updateCrm((c) => { c.samples = c.samples.filter((x) => x.id !== smp.id); return c; }),
    });

  const copyFromAccount = () =>
    setSiteDraft((d) => ({
      ...d,
      name: sel.address, address: sel.address, town: sel.town, postcode: sel.postcode,
      contact: sel.contact, landline: sel.landline, mobile: sel.mobile, email: sel.email,
    }));

  // ===== search list =====
  const q = search.trim().toLowerCase();
  const matches = q
    ? crm.customers.filter((c) =>
        [c.name, c.town, c.postcode, c.contact, c.mobile, c.landline, c.email, String(c.accountNo || "")]
          .some((v) => String(v || "").toLowerCase().includes(q)))
    : crm.customers;
  // newest first: accounts still waiting for a number (just in from the website) on top, then highest account # down
  const sorted = [...matches].sort((a, b) => {
    const na = Number(a.accountNo) || 0, nb = Number(b.accountNo) || 0;
    if (!na !== !nb) return na ? 1 : -1;
    return nb - na || String(b.created || "").localeCompare(String(a.created || ""));
  });
  const shown = sorted.slice(0, 50);

  // ===== summary =====
  // retail top-ups (an extra board, trim and clips) under this value don't make a repeat customer
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [stampOpen, setStampOpen] = useState(false);
  const [jump, setJump] = useState("");
  const [compose, setCompose] = useState(null); // { to, name, customerId, siteId }
  const [emailTick, setEmailTick] = useState(0);
  const composeFor = (to, name, customerId, siteId) => emailReady ? () => setCompose({ to, name, customerId, siteId }) : undefined;
  const [topUp, setTopUp] = useState(() => { try { return Number(localStorage.getItem("dk-topup")) || 150; } catch (e) { return 150; } });
  const stats = useMemo(() => {
    const yearAgo = addDaysC(todayC(), -365), monthAgo = addDaysC(todayC(), -30);
    const seg = () => ({ accounts: 0, active: 0, buyers: 0, oneTime: 0, repeat: 0, topUps: 0, never: 0 });
    const out = { total: crm.customers.length, trade: seg(), retail: seg(), never: 0, newMonth: 0 };
    crm.customers.forEach((c) => {
      const sales = (invByCust[c.id] || []).filter(isSaleInvoice);
      const g = c.trader ? out.trade : out.retail;
      g.accounts++;
      if ((c.created || "") >= monthAgo) out.newMonth++;
      if (sales.some((i) => (i.date || "") >= yearAgo)) g.active++;
      if (!sales.length) { out.never++; g.never++; return; }
      g.buyers++;
      // trade: every order counts; retail: only orders over the top-up value
      const main = c.trader ? sales : sales.filter((i) => invoiceTotals(i).total >= topUp);
      if (!c.trader) g.topUps += sales.length - main.length;
      if (main.length >= 2) g.repeat++;
      else g.oneTime++;
    });
    return out;
  }, [crm.customers, invByCust, topUp]);

  const siteSuggestions = useMemo(() => {
    if (!siteDraft) return null;
    const out = {};
    ["name", "address", "town", "postcode", "contact", "landline", "mobile", "email"].forEach((k) => {
      const seen = new Set();
      crm.sites.forEach((x) => { const v = String(x[k] || "").trim(); if (v) seen.add(v); });
      crm.customers.forEach((x) => { const v = String(x[k === "name" ? "address" : k] || "").trim(); if (v) seen.add(v); });
      out[k] = [...seen].sort().slice(0, 2000);
    });
    return out;
  }, [crm.sites, crm.customers, Boolean(siteDraft)]);

  const custField = (k, label, props = {}, wrapStyle = {}) => (
    <div style={wrapStyle}>
      <span style={lbl}>{label}</span>
      {SUGGEST_FIELDS.includes(k) ? (
        <SuggestInput
          value={custDraft[k]}
          options={(suggestions && suggestions[k]) || []}
          format={FIELD_FORMATS[k]}
          onChange={(v) => setCustDraft((d) => ({ ...d, [k]: v }))}
          {...props}
        />
      ) : (
        <input style={inp} value={custDraft[k] === null ? "" : custDraft[k]} {...props}
          {...selectAllProps}
          onChange={(e) => setCustDraft({ ...custDraft, [k]: e.target.value })}
          onBlur={FIELD_FORMATS[k] ? (e) => setCustDraft((d) => ({ ...d, [k]: FIELD_FORMATS[k](e.target.value) })) : undefined} />
      )}
    </div>
  );
  const SITE_SUGGEST = ["name", "address", "town", "postcode", "contact", "landline", "mobile", "email"];
  const siteField = (k, label, props = {}, wrapStyle = {}) => (
    <div style={wrapStyle}>
      <span style={lbl}>{label}</span>
      {SITE_SUGGEST.includes(k) ? (
        <SuggestInput
          value={siteDraft[k]}
          options={(siteSuggestions && siteSuggestions[k]) || []}
          format={FIELD_FORMATS[k]}
          onChange={(v) => setSiteDraft((d) => ({ ...d, [k]: v }))}
          {...props}
        />
      ) : (
        <input style={inp} value={siteDraft[k] === null ? "" : siteDraft[k]} {...props}
          {...selectAllProps}
          onChange={(e) => setSiteDraft({ ...siteDraft, [k]: e.target.value })}
          onBlur={FIELD_FORMATS[k] ? (e) => setSiteDraft((d) => ({ ...d, [k]: FIELD_FORMATS[k](e.target.value) })) : undefined} />
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 1140, margin: "0 auto", padding: "18px 22px" }}>

      {/* summary */}
      {!sel && crm.customers.length > 0 && (() => {
        const pct = (n, d) => (d ? Math.round((n / d) * 100) + "%" : "—");
        const box = { flex: "1 1 140px", background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, padding: "12px 14px", minWidth: 135 };
        const lab = { fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.5, textTransform: "uppercase" };
        const big = { fontSize: 22, fontWeight: 800, color: NAVY, marginTop: 2 };
        const sub = { fontSize: 11.5, fontWeight: 600, color: "#5a6a85", marginTop: 2 };
        const tr = stats.trade, rt = stats.retail;
        return (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={box}>
              <div style={lab}>Customer accounts</div>
              <div style={big}>{stats.total.toLocaleString("en-GB")}</div>
              <div style={sub}>{stats.newMonth.toLocaleString("en-GB")} new in the last 30 days</div>
            </div>
            <div style={box}>
              <div style={lab}>Trade · Retail</div>
              <div style={big}>{tr.accounts.toLocaleString("en-GB")} <span style={{ color: "#aab3c2", fontWeight: 600 }}>·</span> {rt.accounts.toLocaleString("en-GB")}</div>
              <div style={sub}>{pct(tr.accounts, stats.total) + " trade accounts"}</div>
            </div>
            <div style={box}>
              <div style={lab}>Active</div>
              <div style={big}>{(tr.active + rt.active).toLocaleString("en-GB")}</div>
              <div style={sub}>{"ordered in the last 12 months · " + tr.active + " trade, " + rt.active + " retail"}</div>
            </div>
            <div style={{ ...box, flex: "1.8 1 250px" }}>
              <div style={lab}>Buyers — one-time vs repeat</div>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr 18px", gap: "2px 14px", alignItems: "baseline", marginTop: 4, fontSize: 12.5 }}>
                <span />
                <span style={{ ...lab, fontSize: 10 }}>One-time</span>
                <span style={{ ...lab, fontSize: 10 }}>Repeat</span>
                <span />
                {[["Trade", tr], ["Retail", rt], ["All", { oneTime: tr.oneTime + rt.oneTime, repeat: tr.repeat + rt.repeat, buyers: tr.buyers + rt.buyers, never: tr.never + rt.never, accounts: tr.accounts + rt.accounts }]].map(([name, g]) => (
                  <React.Fragment key={name}>
                    <span style={{ fontWeight: 700, color: "#5a6a85" }}>{name}</span>
                    <span style={{ fontWeight: 800, color: NAVY, fontSize: name === "All" ? 16 : 13.5 }}>{g.oneTime.toLocaleString("en-GB")} <span style={{ fontWeight: 600, color: "#8593a8", fontSize: 11.5 }}>{pct(g.oneTime, g.buyers)}</span></span>
                    <span style={{ fontWeight: 800, color: NAVY, fontSize: name === "All" ? 16 : 13.5 }}>{g.repeat.toLocaleString("en-GB")} <span style={{ fontWeight: 600, color: "#8593a8", fontSize: 11.5 }}>{pct(g.repeat, g.buyers)}</span></span>
                    {name === "All" ? (
                      <button type="button" onClick={() => setTopUpOpen((o) => !o)} title={"Retail top-ups under £" + topUp + " don't count as a new purchase — click to change"}
                        style={{ fontFamily: "inherit", border: "none", background: "none", padding: 0, cursor: "pointer", color: "#8593a8", fontSize: 11 }}>
                        {topUpOpen ? "▾" : "▸"}
                      </button>
                    ) : <span />}
                  </React.Fragment>
                ))}
              </div>
              {topUpOpen && (
                <div style={{ ...sub, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  Retail orders under £
                  <input type="number" min="0" step="10" value={topUp}
                    onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); setTopUp(v); try { localStorage.setItem("dk-topup", String(v)); } catch (err) {} }}
                    style={{ ...inp, width: 64, padding: "2px 6px", fontSize: 12, textAlign: "right" }} />
                  are top-ups (an extra board, trim, clips), not a new purchase{rt.topUps ? " · " + rt.topUps + " set aside so far" : ""}
                </div>
              )}
            </div>
            <div style={box}>
              <div style={lab}>Never ordered</div>
              <div style={big}>{stats.never.toLocaleString("en-GB")} <span style={{ fontSize: 14, color: "#5a6a85" }}>{pct(stats.never, stats.total)}</span></div>
              <div style={sub}>{tr.never + " trade, " + rt.never + " retail · accounts with no order yet"}</div>
            </div>
          </div>
        );
      })()}

      {/* ===== list view ===== */}
      {!sel && (
        <div style={card}>
          {crm.customers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 10px", color: "#5a6a85", fontWeight: 600 }}>
              No customers yet — add the first one, or import your FileMaker records later.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 360 }}>
                  <span style={{ position: "absolute", left: 11, top: 10 }}><Icon name="search" /></span>
                  <input style={{ ...inp, paddingLeft: 34, paddingRight: 34 }} placeholder="Search name, postcode, phone, account #…"
                    value={search} onChange={(e) => setSearch(e.target.value)} />
                    {search && <button title="Clear" onClick={() => setSearch("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 24, height: 24, borderRadius: 999, border: "none", background: "#eef1f6", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><Icon name="x" size={12} /></button>}
                </div>
                <span style={{ flex: 1 }} />
                <button style={{ ...abtn, width: 36, height: 36 }} title="Numbering — next account / site / invoice numbers"
                  onClick={() => { setNumDraft({ ...crm.numbering }); setNumPanel(true); }}>
                  <Icon name="gear" />
                </button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr>
                    {["#", "Name", "Town", "Postcode", "Contact", "Source", "", "Invoices"].map((h, i) => (
                      <th key={i} style={{ textAlign: i === 7 ? "right" : "left", fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c.id} onClick={() => setSelId(c.id)} style={{ cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f8fb")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", fontWeight: 700 }}>{c.accountNo || <span title="Waiting for FileMaker to give it an account number" style={{ fontSize: 10.5, fontWeight: 800, color: "#8a5a00", background: "#fdf3dc", borderRadius: 8, padding: "1px 5px" }}>NEW</span>}</td>
                      <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", fontWeight: 700 }}>{c.name || "—"}</td>
                      <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>{c.town}</td>
                      <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>{c.postcode}</td>
                      <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>{c.mobile || c.landline || c.email}</td>
                      <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>{c.source ? <Chip>{c.source}</Chip> : (() => {
                        // no source recorded: say where the account came from instead, in a lighter pill
                        const o = recordOrigin(c);
                        const t = o.key === "filemaker" ? "FileMaker" : o.key === "website" ? "Website" : "Manual entry";
                        return <Chip style={{ background: "#fff", borderStyle: "dashed", color: "#8593a8" }}>{t}</Chip>;
                      })()}</td>
                      <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>{c.trader && <Chip tone="red">Trade</Chip>}</td>
                      <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", textAlign: "right", fontWeight: 700 }}>{(invByCust[c.id] || []).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {matches.length > shown.length && (
                <div style={{ fontSize: 12, color: "#8593a8", fontWeight: 600, marginTop: 10 }}>
                  Showing {shown.length} of {matches.length.toLocaleString("en-GB")} — keep typing to narrow it down.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ===== account view ===== */}
      {sel && (() => {
        const invs = invByCust[sel.id] || [];
        const sites = sitesByCust[sel.id] || [];
        const lifetime = invs.reduce((t, i) => t + invoiceTotals(i).total, 0);
        const lastOrder = invs[0] ? invs[0].date : "";
        const owing = invs.filter((i) => !isPaid(i));
        const owed = owing.reduce((t, i) => t + invoiceTotals(i).total, 0);
        const siteName = (id) => {
          if (id === TRADE_COUNTER) return TRADE_COUNTER_LABEL;
          const s = crm.sites.find((x) => x.id === id);
          return s ? (s.name || s.address || "Site " + (s.siteNo || "")) : "";
        };
        return (
          <>
            {(() => {
              // step through the list in its current order (newest account first, current search applied)
              const order = sorted.some((c) => c.id === sel.id) ? sorted : [...crm.customers].sort((a, b) => (Number(b.accountNo) || 1e9) - (Number(a.accountNo) || 1e9));
              const at = order.findIndex((c) => c.id === sel.id);
              const prev = at > 0 ? order[at - 1] : null;
              const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
              const jq = jump.trim().toLowerCase();
              const hits = jq ? crm.customers.filter((c) =>
                [c.name, c.town, c.postcode, c.contact, c.mobile, c.landline, c.email, String(c.accountNo || "")]
                  .some((v) => String(v || "").toLowerCase().includes(jq))).slice(0, 8) : [];
              const go = (c) => { if (c) { setSelId(c.id); setJump(""); } };
              const arrow = (c, up) => (
                <button style={{ ...abtn, width: 36, height: 36, opacity: c ? 1 : 0.4, cursor: c ? "pointer" : "default" }} disabled={!c} onClick={() => go(c)}
                  title={c ? (up ? "Previous: " : "Next: ") + "#" + (c.accountNo || "—") + " " + (c.name || "") : up ? "First account" : "Last account"}>
                  <span style={{ display: "inline-flex", transform: up ? "rotate(90deg)" : "rotate(-90deg)" }}><Icon name="back" stroke={NAVY} /></span>
                </button>
              );
              return (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                  <button style={btn} onClick={() => setSelId(null)}><Icon name="back" stroke={NAVY} />All customers</button>
                  {arrow(prev, true)}
                  {arrow(next, false)}
                  {at >= 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#8593a8" }}>{(at + 1).toLocaleString("en-GB")} of {order.length.toLocaleString("en-GB")}</span>}
                  <div style={{ position: "relative", marginLeft: "auto", width: 320, maxWidth: "100%" }}>
                    <span style={{ position: "absolute", left: 11, top: 10 }}><Icon name="search" /></span>
                    <input style={{ ...inp, paddingLeft: 34, paddingRight: 34, width: "100%", boxSizing: "border-box" }} placeholder="Jump to account — name, postcode, #…"
                      value={jump} onChange={(e) => setJump(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) go(hits[0]); if (e.key === "Escape") setJump(""); }} />
                    {jump && <button title="Clear" onClick={() => setJump("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 24, height: 24, borderRadius: 999, border: "none", background: "#eef1f6", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><Icon name="x" size={12} /></button>}
                    {hits.length > 0 && (
                      <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30, background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, boxShadow: "0 10px 28px rgba(11,31,63,.18)", overflow: "hidden" }}>
                        {hits.map((c) => (
                          <button key={c.id} onClick={() => go(c)}
                            style={{ display: "flex", gap: 8, width: "100%", padding: "8px 11px", background: "none", border: "none", borderBottom: "1px solid #f0f2f6", cursor: "pointer", fontFamily: "inherit", textAlign: "left", fontSize: 13 }}>
                            <span style={{ color: "#8593a8", fontWeight: 700, width: 46, flex: "none" }}>#{c.accountNo || "—"}</span>
                            <b style={{ color: NAVY, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name || "Unnamed"}</b>
                            <span style={{ color: "#5a6a85", fontWeight: 600, whiteSpace: "nowrap" }}>{[c.town, c.postcode].filter(Boolean).join(" · ")}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* hero */}
            <div style={{ background: "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", borderRadius: 12, padding: "20px 22px", color: "#fff", marginBottom: 14, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ width: 54, height: 54, borderRadius: 12, background: GOLD, color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, flex: "none" }}>
                {(sel.name || "?").trim().charAt(0).toUpperCase() || "?"}
              </div>
              <div style={{ minWidth: 180 }}>
                {(() => {
                  // hover the name: where the account came from, when, and who last changed it
                  const o = recordOrigin(sel);
                  const who = (v) => String(v || "").split("@")[0];
                  const lines = [
                    originText(sel, prettyDate(sel.created)),
                    sel.updatedAt ? "Updated " + prettyDateTime(sel.updatedAt) + (sel.modifiedBy ? " by " + who(sel.modifiedBy) + " (" + userInitials(crm, sel.modifiedBy) + ")" : "")
                      : sel.modifiedBy ? "Last modified by " + who(sel.modifiedBy) : "",
                  ].filter(Boolean);
                  return (
                    <div style={{ position: "relative", display: "inline-block" }} onMouseEnter={() => setStampOpen(true)} onMouseLeave={() => setStampOpen(false)}>
                      <h2 style={{ margin: 0, fontSize: 21, cursor: "default" }}>{sel.name || "Unnamed account"}</h2>
                      {stampOpen && (
                        <div style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", zIndex: 20, background: "#fff", color: NAVY, borderRadius: 12, padding: "8px 12px", boxShadow: "0 8px 24px rgba(0,0,0,.28)", whiteSpace: "nowrap", fontSize: 12, fontWeight: 600, lineHeight: 1.6 }}>
                          <span style={{ display: "inline-block", fontSize: 10, fontWeight: 800, letterSpacing: 0.4, padding: "1px 7px", borderRadius: 999, marginBottom: 3,
                            background: o.key === "filemaker" ? "#eef1f6" : o.key === "website" ? "#fdf3dc" : "#3FA55C22", color: o.key === "filemaker" ? "#5a6a85" : o.key === "website" ? "#8a5a00" : "#28713e" }}>
                            {o.key === "filemaker" ? "FROM FILEMAKER" : o.key === "website" ? "FROM THE WEBSITE" : "KEYED IN"}
                          </span>
                          {lines.map((l) => <div key={l}>{l}</div>)}
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 7 }}>
                  <Chip tone="navy">Account #{sel.accountNo || "—"}</Chip>
                  {sel.trader && <Chip tone="red" style={{ background: RED, color: "#fff", border: "none" }}>Trade</Chip>}
                  {Number(sel.discountPct) > 0 && <Chip tone="gold">−{Number(sel.discountPct)}% discount</Chip>}
                  {sel.source && <Chip tone="navy">Source · {sel.source}</Chip>}
                  <button title="Edit account" onClick={() => openCustDraft({ ...sel })} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #33466b", background: "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flex: "none" }}>
                    <Icon name="pen" stroke="#cfd6e4" size={13} />
                  </button>
                </div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", background: "#ffffff14", border: "1px solid #ffffff22", borderRadius: 12, overflow: "hidden", flexWrap: "wrap" }}>
                {[[invs.length, "Invoices"], [gbp(lifetime), "Lifetime"], [lastOrder ? prettyDate(lastOrder) : "—", "Last order"]].map(([v, l], i) => (
                  <div key={l} style={{ padding: "10px 18px", textAlign: "center", borderLeft: i ? "1px solid #ffffff22" : "none" }}>
                    <b style={{ display: "block", fontSize: 16, color: GOLD }}>{v}</b>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "#aeb9cf", letterSpacing: 0.5, textTransform: "uppercase" }}>{l}</span>
                  </div>
                ))}
                <button
                  onClick={() => owing.length && onOutstanding && onOutstanding(sel.id)}
                  title={owing.length ? "Show this customer's outstanding invoices" : "Nothing outstanding"}
                  style={{ padding: "10px 18px", textAlign: "center", borderLeft: "1px solid #ffffff22", background: owing.length ? "#C8102E33" : "transparent", border: "none", borderLeftStyle: "solid", borderLeftWidth: 1, borderLeftColor: "#ffffff22", cursor: owing.length ? "pointer" : "default", fontFamily: "inherit" }}
                >
                  <b style={{ display: "block", fontSize: 16, color: owing.length ? "#f2a6b1" : GOLD }}>{gbp(owed)}</b>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "#aeb9cf", letterSpacing: 0.5, textTransform: "uppercase" }}>
                    Outstanding{owing.length ? " · " + owing.length + " inv" + (owing.length > 1 ? "s" : "") : ""}
                  </span>
                </button>
              </div>
              <button title="Delete this account" onClick={() => removeCustomer(sel)} style={{ alignSelf: "flex-end", width: 28, height: 28, borderRadius: 8, border: "1px dashed #3a4f78", background: "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flex: "none" }}>
                <Icon name="bin" stroke="#8fa0c0" size={13} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
              <div style={{ ...card, marginBottom: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <p style={{ ...sect, margin: 0 }}>Contact &amp; invoice address</p>
                </div>
                <FieldRow icon="user" label="Contact" value={sel.contact} />
                <FieldRow icon="mob" label="Mobile" value={sel.mobile} actions={<QuickWa num={sel.mobile} name={sel.contact || sel.name} />} />
                <FieldRow icon="phone" label="Landline" value={sel.landline} actions={isUkMobile(sel.landline) ? <QuickWa num={sel.landline} name={sel.contact || sel.name} /> : null} />
                <FieldRow icon="mail" label="Email" value={sel.email} actions={<QuickMail email={sel.email} name={sel.contact || sel.name} onCompose={composeFor(sel.email, sel.contact || sel.name, sel.id, "")} />} />
                <FieldRow icon="share" label="Preferred contact" value={sel.contactMethod} />
                <FieldRow icon="pin" label="Invoice address" value={[sel.address, sel.town, sel.postcode].filter(Boolean).join(", ")}
                  full={[...String(sel.address || "").split(/\s*,\s*/), sel.town, sel.postcode]} />
              </div>

              <div style={{ ...card, marginBottom: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <p style={{ ...sect, margin: 0 }}>Sites ({sites.length})</p>
                  <button style={abtn} title="Add site" onClick={startNewSite}>
                    <Icon name="pinPlus" size={16} stroke={NAVY} />
                  </button>
                  <span style={{ flex: 1 }} />
                  <button style={{ ...goldBtn, padding: "7px 12px", fontSize: 13 }} title="Raise an invoice collected from the trade counter — no delivery site"
                    onClick={() => newInvoiceFor(sel.id, TRADE_COUNTER)}>
                    <Icon name="plus" stroke={NAVY} />Trade counter invoice
                  </button>
                </div>
                {sites.length === 0 && <div style={{ fontSize: 13, color: "#8593a8", fontWeight: 600 }}>No sites yet — add one for deliveries to a different address.</div>}
                {sites.map((s) => (
                  <div key={s.id} style={{ border: "1px solid #e6e9ef", borderRadius: 12, padding: "13px 15px", display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 12, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                      <Icon name="pin" size={17} stroke={GOLD} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <HoverPill block head={s.name || s.address || "Unnamed site"} lines={[
                        ...(s.address && s.address !== s.name ? String(s.address).split(/\s*,\s*/) : []), s.town, s.postcode,
                        s.contact ? "Contact: " + s.contact : "", s.mobile ? "Mobile: " + s.mobile : "", s.landline ? "Landline: " + s.landline : "", s.email ? "Email: " + s.email : "",
                      ]} foot={stampLines(crm, s)}>
                        <b style={{ ...oneLine, fontSize: 14, cursor: "default" }}>{s.name || s.address || "Unnamed site"}</b>
                        <span style={{ ...oneLine, fontSize: 12.5, color: "#5a6a85", fontWeight: 600, marginTop: 2 }}>
                          {[s.address !== s.name ? s.address : "", s.town, s.postcode, s.mobile || s.landline].filter(Boolean).join(" · ")}
                        </span>
                      </HoverPill>
                      {s.notes && <NoteBox>{s.notes}</NoteBox>}
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      {newQuoteFor && <button style={abtn} title="New quote for this site" onClick={() => newQuoteFor(sel.id, s.id)}><Icon name="tag" /></button>}
                      <button style={abtn} title="New invoice for this site" onClick={() => newInvoiceFor(sel.id, s.id)}><Icon name="plus" /></button>
                      <button style={abtn} title="Edit site" onClick={() => openSiteDraft({ ...s })}><Icon name="pen" /></button>
                      <button style={abtn} title="Remove site" onClick={() => removeSite(s)}><Icon name="bin" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {(
              <div style={{ ...card, marginTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <p style={{ ...sect, margin: 0 }}>Sample requests ({(samplesByCust[sel.id] || []).length})</p>
                  <span style={{ flex: 1 }} />
                  <button style={{ ...btn, padding: "6px 11px", fontSize: 12.5 }} onClick={() => newSampleFor(sel.id)}><Icon name="plus" stroke={NAVY} />Log sample</button>
                </div>
                {(samplesByCust[sel.id] || []).length === 0 ? (
                  <div style={{ fontSize: 13, color: "#8593a8", fontWeight: 600 }}>No sample requests yet.</div>
                ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 600 }}>
                    <thead>
                      <tr>
                        {["Date", "Sample", "Samples", "Status", "Order", ""].map((h, i) => (
                          <th key={i} style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {samplesByCust[sel.id].map((x) => {
                        const st = sampleStatus(x, crm);
                        const si = sampleInvoice(x, crm);
                        return (
                          <tr key={x.id}>
                            <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", whiteSpace: "nowrap" }}>{prettyDate(x.date)}</td>
                            <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>
                              <button onClick={() => openSample(x.id)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, color: "#185FA5", fontSize: 13, padding: 0 }}>{sampleRef(x)}</button>
                            </td>
                            <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", color: "#5a6a85", fontWeight: 600 }}>
                              {(x.items || []).map((it) => [it.colour, it.description].filter(Boolean).join(" ")).filter(Boolean).join(", ") || "—"}
                            </td>
                            <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}><Chip tone={SAMPLE_TONES[st]}>{st}</Chip></td>
                            <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>
                              {si ? <button onClick={() => openInvoice(si.id)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, color: "#185FA5", fontSize: 13, padding: 0 }}>{"#" + (si.invNo || "—")}</button> : <span style={{ color: "#aab3c2" }}>—</span>}
                            </td>
                            <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", textAlign: "right" }}>
                              <span style={{ display: "inline-flex", gap: 5 }}>
                                <button style={abtn} title="Open sample request" onClick={() => openSample(x.id)}><Icon name="pen" /></button>
                                <button style={abtn} title="Delete sample request" onClick={() => removeSample(x)}><Icon name="bin" /></button>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            )}

            {(() => {
              const qs = quotesByCust[sel.id] || [];
              return (
                <div style={{ ...card, marginTop: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <p style={{ ...sect, margin: 0 }}>Quotes ({qs.length})</p>
                    <span style={{ flex: 1 }} />
                    {newQuoteFor && (
                      <button style={{ ...btn, padding: "6px 11px", fontSize: 12.5 }} onClick={() => newQuoteFor(sel.id, (sites[0] && sites[0].id) || "")}>
                        <Icon name="plus" stroke={NAVY} />New quote
                      </button>
                    )}
                  </div>
                  {qs.length === 0 ? (
                    <div style={{ fontSize: 13, color: "#8593a8", fontWeight: 600 }}>No quotes yet.</div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
                        <thead>
                          <tr>
                            {["Date", "Quote", "Site", "Total £", "Valid until", "Status", ""].map((h, i) => (
                              <th key={i} style={{ textAlign: i === 3 ? "right" : "left", fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {qs.map((q) => {
                            const st = quoteStatus(q, crm);
                            const qi = quoteInvoice(q, crm);
                            return (
                              <tr key={q.id}>
                                <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", whiteSpace: "nowrap" }}>{prettyDate(q.date)}</td>
                                <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>
                                  <button onClick={() => openQuote(q.id)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, color: "#185FA5", fontSize: 13, padding: 0 }}>{quoteRef(q)}</button>
                                </td>
                                <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", fontWeight: 600 }}>{q.siteId === TRADE_COUNTER ? "Trade counter" : siteName(q.siteId) || "Invoice address"}</td>
                                <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", textAlign: "right", fontWeight: 700 }}>{quoteTotals(q).total.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                                <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", whiteSpace: "nowrap" }}>{q.validUntil ? prettyDate(q.validUntil) : "—"}</td>
                                <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>
                                  <Chip tone={QUOTE_TONES[st]}>{st}{qi ? " · #" + (qi.invNo || "—") : ""}</Chip>
                                </td>
                                <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", textAlign: "right" }}>
                                  <button style={abtn} title="Open quote" onClick={() => openQuote(q.id)}><Icon name="pen" /></button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={{ ...card, marginTop: 14 }}>
              <p style={sect}>Invoice history ({invs.length})</p>
              {invs.length === 0 ? (
                <div style={{ fontSize: 13, color: "#8593a8", fontWeight: 600 }}>No invoices yet.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
                    <thead>
                      <tr>
                        {["Date", "Inv #", "Site · Job", "Total £", "Payment", "Delivery", "Follow-up", ""].map((h, i) => (
                          <th key={i} style={{ textAlign: i === 3 ? "right" : "left", fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {invs.map((i) => {
                        const t = invoiceTotals(i);
                        return (
                          <tr key={i.id}>
                            <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", whiteSpace: "nowrap" }}>{prettyDate(i.date)}</td>
                            <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>
                              <button onClick={() => openInvoice(i.id)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, color: "#185FA5", fontSize: 13, padding: 0 }}>{i.invNo || "—"}</button>
                            </td>
                            <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>
                              <b>{siteName(i.siteId) || "Invoice address"}</b> <span style={{ color: "#5a6a85", fontWeight: 600 }}>· {i.jobType}</span>
                            </td>
                            <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", textAlign: "right", fontWeight: 700 }}>{t.total.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                            <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>
                              <Chip tone={isPaid(i) ? "green" : "amber"}>{isPaid(i) ? "Paid" : "Awaiting"}{i.paymentType ? " · " + i.paymentType : ""}</Chip>
                            </td>
                            <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>
                              {i.deliveryCompleted ? <Chip tone="green">Done {i.deliveryDate ? prettyDate(i.deliveryDate).slice(0, 6) : ""}</Chip>
                                : i.deliveryDate ? <Chip tone="gold">Booked {prettyDate(i.deliveryDate).slice(0, 6)}</Chip>
                                : <Chip tone="red">Not booked</Chip>}
                            </td>
                            <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", fontSize: 11.5, fontWeight: 700, color: "#5a6a85", whiteSpace: "nowrap" }}>
                              {followUpDone(i)} / {FOLLOWUP_FLAGS.length} ✓
                            </td>
                            <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", textAlign: "right" }}>
                              <button style={abtn} title="Open invoice" onClick={() => openInvoice(i.id)}><Icon name="pen" /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {emailReady && <EmailHistory crm={crm} customerId={sel.id} refresh={emailTick}
              onCompose={composeFor(sel.email || "", sel.contact || sel.name, sel.id, "")} />}
          </>
        );
      })()}

      {compose && (
        <ComposeEmail {...compose} me={me} onClose={() => setCompose(null)} onSent={() => setEmailTick((t) => t + 1)} onSetup={onEmailSetup} />
      )}

      {/* ===== customer modal ===== */}
      {custDraft && (
        <Modal
          title={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {custDraft._new ? "New customer" : "Edit customer"}
              {noEdit ? (
                <input
                  style={{ ...inp, width: 100, fontWeight: 700 }}
                  inputMode="numeric"
                  value={custDraft.accountNo === null ? "" : custDraft.accountNo}
                  onChange={(e) => setCustDraft({ ...custDraft, accountNo: e.target.value.replace(/[^0-9]/g, "") })}
                />
              ) : (
                <Chip style={{ fontSize: 13 }}>#{custDraft.accountNo || "—"}</Chip>
              )}
              {!noEdit && (
                <button style={{ ...abtn, width: 26, height: 26 }} title="The account number is auto-generated — click to change it"
                  onClick={() => setNoConfirm(true)}>
                  <Icon name="pen" size={12} />
                </button>
              )}
            </span>
          }
          onClose={() => setCustDraft(null)}
        >
          {dupes.length > 0 && (
            <div style={{ background: "#C8102E10", border: "1px solid #ecc4cb", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12.5, fontWeight: 600, color: "#8a0b20" }}>
              <div style={{ marginBottom: 4 }}>Possible duplicate — same name, number or email as:</div>
              {dupes.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0", flexWrap: "wrap" }}>
                  <b>#{c.accountNo || "—"} {c.name}</b>
                  <span style={{ color: "#5a6a85" }}>{[c.town, c.postcode, c.mobile || c.landline].filter(Boolean).join(" · ")}</span>
                  <button style={{ ...btn, padding: "3px 10px", fontSize: 12 }} onClick={() => { setCustDraft(null); setSelId(c.id); }}>
                    Open that account instead
                  </button>
                </div>
              ))}
            </div>
          )}
          {noConfirm && !noEdit && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12.5, fontWeight: 600, color: "#6b5305" }}>
              <span style={{ flex: 1 }}>The account number is auto-generated and normally shouldn't be changed. Change it anyway?</span>
              <button style={{ ...btn, padding: "5px 11px", fontSize: 12.5 }} onClick={() => { setNoEdit(true); setNoConfirm(false); }}>Change it</button>
              <button style={{ ...btn, padding: "5px 11px", fontSize: 12.5, background: GOLD, borderColor: GOLD }} onClick={() => setNoConfirm(false)}>Keep as is</button>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            {custField("name", "Customer name / business", { autoFocus: true }, { gridColumn: "1 / -1" })}
            {custField("address", "Invoice address")}
            {custField("town", "Town")}
            {custField("postcode", "Post code")}
            {custField("contact", "Contact name")}
            {custField("landline", "Landline")}
            {custField("mobile", "Mobile")}
            {custField("email", "Email", {}, { gridColumn: "span 2" })}
            <div>
              <span style={lbl}>Source</span>
              <SuggestInput
                value={custDraft.source}
                options={[...new Set([...SOURCES, ...crm.customers.map((c) => (c.source || "").trim()).filter(Boolean)])].sort()}
                format={FIELD_FORMATS.source}
                onChange={(v) => setCustDraft((d) => ({ ...d, source: v }))}
              />
            </div>
            <div>
              <span style={lbl}>Preferred contact</span>
              <select style={inp} value={custDraft.contactMethod}
                onChange={(e) => setCustDraft({ ...custDraft, contactMethod: e.target.value })}>
                <option value="">—</option>
                {CONTACT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <span style={lbl}>Discount rate %</span>
              <input style={{ ...inp, textAlign: "right" }} inputMode="decimal" placeholder="0"
                title="Pulled through onto every new invoice for this customer"
                value={custDraft.discountPct === null ? "" : custDraft.discountPct}
                onChange={(e) => setCustDraft({ ...custDraft, discountPct: e.target.value })} />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, margin: "14px 0" }}>
            <input type="checkbox" checked={custDraft.trader} onChange={(e) => setCustDraft({ ...custDraft, trader: e.target.checked })} />
            Trade customer
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button style={btn} onClick={() => setCustDraft(null)}>Cancel</button>
            <button className="dk-save" style={{ ...goldBtn, opacity: custDraft.name.trim() ? 1 : 0.5 }} onClick={saveCustomer}>Save</button>
          </div>
        </Modal>
      )}

      {/* ===== site modal ===== */}
      {siteDraft && sel && (
        <Modal
          title={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {siteDraft._new ? "New site for " + (sel.name || "account") : "Edit site"}
              {siteNoEdit ? (
                <input
                  style={{ ...inp, width: 100, fontWeight: 700 }}
                  inputMode="numeric"
                  value={siteDraft.siteNo === null ? "" : siteDraft.siteNo}
                  onChange={(e) => setSiteDraft({ ...siteDraft, siteNo: e.target.value.replace(/[^0-9]/g, "") })}
                />
              ) : (
                <Chip style={{ fontSize: 13 }}>Site #{siteDraft.siteNo || "—"}</Chip>
              )}
              {!siteNoEdit && (
                <button style={{ ...abtn, width: 26, height: 26 }} title="The site number is auto-generated — click to change it"
                  onClick={() => setSiteNoConfirm(true)}>
                  <Icon name="pen" size={12} />
                </button>
              )}
            </span>
          }
          onClose={() => setSiteDraft(null)}
        >
          {siteNoConfirm && !siteNoEdit && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12.5, fontWeight: 600, color: "#6b5305" }}>
              <span style={{ flex: 1 }}>The site number is auto-generated and normally shouldn't be changed. Change it anyway?</span>
              <button style={{ ...btn, padding: "5px 11px", fontSize: 12.5 }} onClick={() => { setSiteNoEdit(true); setSiteNoConfirm(false); }}>Change it</button>
              <button style={{ ...btn, padding: "5px 11px", fontSize: 12.5, background: GOLD, borderColor: GOLD }} onClick={() => setSiteNoConfirm(false)}>Keep as is</button>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            {siteField("name", "Site name", { autoFocus: true }, { gridColumn: "1 / -1" })}
            {siteField("address", "Address")}
            {siteField("town", "Town")}
            {siteField("postcode", "Post code")}
            {siteField("contact", "Contact name")}
            {siteField("landline", "Landline")}
            {siteField("mobile", "Mobile")}
            {siteField("email", "Email", {}, { gridColumn: "span 2" })}
          </div>
          <div style={{ marginTop: 12 }}>
            <span style={lbl}>Notes for booking in &amp; locating this site</span>
            <textarea style={{ ...inp, resize: "vertical" }} rows={3} value={siteDraft.notes}
              onChange={(e) => setSiteDraft({ ...siteDraft, notes: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={btn} onClick={copyFromAccount}>Copy from account</button>
            <span style={{ flex: 1 }} />
            <button style={btn} onClick={() => setSiteDraft(null)}>Cancel</button>
            <button className="dk-save" style={goldBtn} onClick={saveSite}>Save</button>
          </div>
        </Modal>
      )}

      {/* ===== numbering modal ===== */}
      {numPanel && numDraft && (
        <Modal title="Next auto-numbers" onClose={() => setNumPanel(false)} width={420}>
          <p style={{ fontSize: 13, color: "#5a6a85", fontWeight: 600, marginTop: 0 }}>
            New records take whichever is higher: these, or the highest existing number + 1 — so an import of
            historical records moves the sequences on automatically.
          </p>
          {[["account", "Next account #"], ["site", "Next site #"], ["sample", "Next sample # (S-)"], ["quote", "Next quote # (Q-)"], ["purchase", "Next purchase PO#"], ["supplier", "Next supplier account #"], ["invoice", "Next invoice #"], ["collection", "Next collection #"]].map(([k, label]) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <span style={lbl}>{label}</span>
              <input style={inp} inputMode="numeric" value={numDraft[k]}
                onChange={(e) => setNumDraft({ ...numDraft, [k]: e.target.value.replace(/[^0-9]/g, "") })} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <button style={btn} onClick={() => setNumPanel(false)}>Cancel</button>
            <button style={goldBtn} onClick={() => {
              updateCrm((c) => {
                c.numbering = {
                  account: Number(numDraft.account) || 1,
                  site: Number(numDraft.site) || 1,
                  invoice: Number(numDraft.invoice) || 1,
                  collection: Number(numDraft.collection) || 1,
                  quote: Number(numDraft.quote) || 1,
                  sample: Number(numDraft.sample) || 1,
                  purchase: Number(numDraft.purchase) || 1,
                  supplier: Number(numDraft.supplier) || 1,
                };
                return c;
              });
              setNumPanel(false);
            }}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
