// Customers tab: searchable account list -> account view with sites and
// invoice history, per the approved mockup.
import { useState, useMemo } from "react";
import { NAVY, GOLD, RED, prettyDate, prettyDateTime } from "../../lib/core.js";
import {
  blankCustomer, blankSite, nextNumber, SOURCES,
  invoiceTotals, gbp, isPaid, followUpDone, FOLLOWUP_FLAGS, FIELD_FORMATS, CONTACT_METHODS,
} from "../../lib/crmCore.js";
import { Icon, Chip, Modal, SuggestInput, selectAllProps, sect, lbl, card, abtn, inp, btn, goldBtn } from "./ui.jsx";

const navyBtn = { ...btn, background: "transparent", border: "1px solid #3a4f78", color: "#fff" };

const FieldRow = ({ icon, label, value }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #f0f2f6" }}>
    <div style={{ width: 30, height: 30, borderRadius: 8, background: "#f0f3f8", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
      <Icon name={icon} stroke={NAVY} />
    </div>
    <div style={{ minWidth: 0 }}>
      <span style={{ ...lbl, marginBottom: 0 }}>{label}</span>
      <b style={{ fontSize: 14, color: value ? NAVY : "#aab3c2", overflowWrap: "anywhere" }}>{value || "—"}</b>
    </div>
  </div>
);

const NoteBox = ({ children }) => (
  <div style={{ marginTop: 8, background: "#fff8e6", border: "1px solid #f4d78f", borderRadius: 8, padding: "7px 11px", fontSize: 12.5, fontWeight: 600, display: "flex", gap: 7, alignItems: "flex-start", color: "#6b5305" }}>
    <span style={{ marginTop: 2 }}><Icon name="note" size={13} stroke="#9a7408" /></span>
    <span>{children}</span>
  </div>
);

export default function CustomersScreen({ crm, updateCrm, askConfirm, selId, setSelId, openInvoice, newInvoiceFor, onOutstanding, me }) {
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
    openCustDraft({ ...blankCustomer(), accountNo: nextNumber(crm.customers, "accountNo", crm.numbering.account), createdBy: me || "", _new: true });

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
      message: "Delete account #" + (cust.accountNo || "—") + " — " + (cust.name || "unnamed") + "? Its sites will be removed too.",
      confirmLabel: "Delete",
      danger: true,
      action: () =>
        updateCrm((c) => {
          c.customers = c.customers.filter((x) => x.id !== cust.id);
          c.sites = c.sites.filter((x) => x.customerId !== cust.id);
          return c;
        }) || setSelId(null),
    });
  };

  const openSiteDraft = (draft) => {
    setSiteNoEdit(false);
    setSiteNoConfirm(false);
    setSiteDraft(draft);
  };

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
  const shown = matches.slice(0, 50);

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

      {/* search / actions bar */}
      <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 360 }}>
          <span style={{ position: "absolute", left: 11, top: 10 }}><Icon name="search" /></span>
          <input
            style={{ ...inp, paddingLeft: 34 }}
            placeholder="Search name, postcode, phone, account #…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); if (sel) setSelId(null); }}
          />
        </div>
        <span style={{ fontSize: 12, color: "#5a6a85", fontWeight: 700 }}>{crm.customers.length.toLocaleString("en-GB")} customers</span>
        <span style={{ flex: 1 }} />
        <button style={{ ...abtn, width: 36, height: 36 }} title="Numbering — next account / site / invoice numbers"
          onClick={() => { setNumDraft({ ...crm.numbering }); setNumPanel(true); }}>
          <Icon name="gear" />
        </button>
        <button style={goldBtn} onClick={startNewCustomer}><Icon name="plus" stroke={NAVY} />New customer</button>
      </div>

      {/* ===== list view ===== */}
      {!sel && (
        <div style={card}>
          {crm.customers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 10px", color: "#5a6a85", fontWeight: 600 }}>
              No customers yet — add the first one, or import your FileMaker records later.
            </div>
          ) : (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr>
                    {["Acc #", "Name", "Town", "Postcode", "Contact", "Source", "", "Invoices"].map((h, i) => (
                      <th key={i} style={{ textAlign: i === 7 ? "right" : "left", fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 8px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c.id} onClick={() => setSelId(c.id)} style={{ cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f8fb")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", fontWeight: 700 }}>{c.accountNo || "—"}</td>
                      <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6", fontWeight: 700 }}>{c.name || "—"}</td>
                      <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>{c.town}</td>
                      <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>{c.postcode}</td>
                      <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>{c.mobile || c.landline || c.email}</td>
                      <td style={{ padding: "9px 8px", borderBottom: "1px solid #f0f2f6" }}>{c.source && <Chip>{c.source}</Chip>}</td>
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
          const s = crm.sites.find((x) => x.id === id);
          return s ? (s.name || s.address || "Site " + (s.siteNo || "")) : "";
        };
        return (
          <>
            <button style={{ ...btn, marginBottom: 12 }} onClick={() => setSelId(null)}><Icon name="back" stroke={NAVY} />All customers</button>

            {/* hero */}
            <div style={{ background: "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", borderRadius: 14, padding: "20px 22px", color: "#fff", marginBottom: 14, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ width: 54, height: 54, borderRadius: 14, background: GOLD, color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, flex: "none" }}>
                {(sel.name || "?").trim().charAt(0).toUpperCase() || "?"}
              </div>
              <div style={{ minWidth: 180 }}>
                <h2 style={{ margin: 0, fontSize: 21 }}>{sel.name || "Unnamed account"}</h2>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 7 }}>
                  <Chip tone="navy">Account #{sel.accountNo || "—"}</Chip>
                  {sel.trader && <Chip tone="red" style={{ background: RED, color: "#fff", border: "none" }}>Trade</Chip>}
                  {Number(sel.discountPct) > 0 && <Chip tone="gold">−{Number(sel.discountPct)}% discount</Chip>}
                  {sel.source && <Chip tone="navy">Source · {sel.source}</Chip>}
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
              <div style={{ display: "flex", gap: 8, flexBasis: "100%", marginTop: 2, flexWrap: "wrap" }}>
                <button style={goldBtn} onClick={() => newInvoiceFor(sel.id, sites[0] ? sites[0].id : "")}><Icon name="plus" stroke={NAVY} />New invoice</button>
                <button style={navyBtn} onClick={() => openCustDraft({ ...sel })}><Icon name="pen" stroke="#fff" />Edit account</button>
                <span style={{ flex: 1 }} />
                <button style={{ ...navyBtn, border: "1px dashed #3a4f78", color: "#8fa0c0" }} onClick={() => removeCustomer(sel)}><Icon name="bin" stroke="#8fa0c0" />Delete</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
              <div style={{ ...card, marginBottom: 0 }}>
                <p style={sect}>Contact &amp; invoice address</p>
                <FieldRow icon="user" label="Contact" value={sel.contact} />
                <FieldRow icon="mob" label="Mobile" value={sel.mobile} />
                <FieldRow icon="phone" label="Landline" value={sel.landline} />
                <FieldRow icon="mail" label="Email" value={sel.email} />
                <FieldRow icon="share" label="Preferred contact" value={sel.contactMethod} />
                <FieldRow icon="pin" label="Invoice address" value={[sel.address, sel.town, sel.postcode].filter(Boolean).join(", ")} />
              </div>

              <div style={{ ...card, marginBottom: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <button style={{ ...btn, padding: "7px 12px", fontSize: 13 }} onClick={startNewSite}>
                    <Icon name="plus" stroke={NAVY} />Add site
                  </button>
                  <span style={{ flex: 1 }} />
                  <p style={{ ...sect, margin: 0 }}>Sites ({sites.length})</p>
                </div>
                {sites.length === 0 && <div style={{ fontSize: 13, color: "#8593a8", fontWeight: 600 }}>No sites yet — add one for deliveries to a different address.</div>}
                {sites.map((s) => (
                  <div key={s.id} style={{ border: "1px solid #e6e9ef", borderRadius: 12, padding: "13px 15px", display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                      <Icon name="pin" size={17} stroke={GOLD} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <b style={{ fontSize: 14 }}>{s.name || s.address || "Unnamed site"}</b>
                        <Chip>Site #{s.siteNo || "—"}</Chip>
                      </div>
                      <div style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600, marginTop: 2 }}>
                        {[s.address !== s.name ? s.address : "", s.town, s.postcode, s.mobile || s.landline].filter(Boolean).join(" · ")}
                        {s.updatedAt ? <span style={{ color: "#aab3c2" }}> · updated {prettyDateTime(s.updatedAt)}{s.modifiedBy ? " by " + s.modifiedBy.split("@")[0] : ""}</span> : null}
                      </div>
                      {s.notes && <NoteBox>{s.notes}</NoteBox>}
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button style={abtn} title="New invoice for this site" onClick={() => newInvoiceFor(sel.id, s.id)}><Icon name="plus" /></button>
                      <button style={abtn} title="Edit site" onClick={() => openSiteDraft({ ...s })}><Icon name="pen" /></button>
                      <button style={abtn} title="Remove site" onClick={() => removeSite(s)}><Icon name="bin" /></button>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, marginTop: 10 }}>
                  Created {prettyDate(sel.created)}{sel.createdBy ? " by " + sel.createdBy.split("@")[0] : ""}
                  {sel.updatedAt ? " · Updated " + prettyDateTime(sel.updatedAt) + (sel.modifiedBy ? " by " + sel.modifiedBy.split("@")[0] : "") : sel.modifiedBy ? " · Last modified by " + sel.modifiedBy.split("@")[0] : ""}
                </div>
              </div>
            </div>

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
          </>
        );
      })()}

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
          {[["account", "Next account #"], ["site", "Next site #"], ["invoice", "Next invoice #"], ["collection", "Next collection #"]].map(([k, label]) => (
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
