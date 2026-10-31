// Email from ops: compose box, per-login mailbox settings, and the sent-email
// history on a customer account. Outgoing only; replies arrive in Gmail as usual.
import React, { useEffect, useState } from "react";
import { NAVY, prettyDateTime } from "../../lib/core.js";
import { userInitials } from "../../lib/crmCore.js";
import { Icon, Modal, sect, lbl, card, inp, btn, goldBtn } from "./ui.jsx";
import { emailReady, listMailAccounts, saveMailAccount, sendEmail, emailLogFor, defaultSignature } from "../../data/email.js";

const lc = (s) => String(s || "").trim().toLowerCase();
const firstName = (v) => String(v || "").trim().split(/\s+/)[0] || "";
const gmailLink = (to, subject, body) =>
  "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(to || "") + "&su=" + encodeURIComponent(subject || "") + "&body=" + encodeURIComponent(body || "");
const note = (tone) => ({
  fontSize: 12.5, fontWeight: 600, borderRadius: 8, padding: "8px 11px", marginBottom: 10,
  background: tone === "red" ? "#fdecef" : tone === "green" ? "#e9f6ee" : "#fff8e6",
  color: tone === "red" ? "#9b1c2e" : tone === "green" ? "#28713e" : "#6b5305",
  border: "1px solid " + (tone === "red" ? "#f3c2cb" : tone === "green" ? "#bfe3cb" : "#f4d78f"),
});

// ===== compose =====
export function ComposeEmail({ to, name, customerId, siteId, me, onClose, onSent, onSetup }) {
  const [acc, setAcc] = useState(undefined); // undefined = loading, null = not linked
  const [err, setErr] = useState("");
  const [f, setF] = useState({ to: to || "", cc: "", subject: "Deck Kingdom", body: "" });
  const [showCc, setShowCc] = useState(false);
  const [busy, setBusy] = useState(false);
  const greet = (firstName(name) ? "Hi " + firstName(name) : "Hi") + ",\n\n\n\n";

  useEffect(() => {
    let live = true;
    listMailAccounts()
      .then((rows) => {
        if (!live) return;
        const a = rows.find((r) => lc(r.login_email) === lc(me)) || null;
        const ok = a && a.from_email && a.has_password ? a : null;
        setAcc(ok);
        setF((x) => ({ ...x, body: greet + (ok ? ok.signature || defaultSignature(ok.from_name) : "") }));
      })
      .catch((e) => { if (live) { setAcc(null); setErr(e.message); } });
    return () => { live = false; };
  }, [me]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const send = async () => {
    setBusy(true); setErr("");
    try {
      const r = await sendEmail({ ...f, customerId: customerId || "", siteId: siteId || "" });
      onSent && onSent(r && r.logged);
      onClose();
    } catch (e) {
      setErr(e.message + (e.detail ? " (" + e.detail.slice(0, 120) + ")" : ""));
      if (e.setup) setAcc(null);
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Email" onClose={onClose} width={620}>
      {acc === undefined && <div style={{ fontSize: 13, color: "#8593a8", fontWeight: 600 }}>Loading…</div>}
      {acc === null && (
        <div>
          <div style={note("amber")}>{err || "Your login isn't linked to a mailbox yet, so ops can't send as you."}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onSetup && <button style={goldBtn} onClick={() => { onClose(); onSetup(); }}>Link my mailbox</button>}
            <a style={{ ...btn, textDecoration: "none", display: "inline-flex", alignItems: "center" }} href={gmailLink(f.to, f.subject, greet)} target="_blank" rel="noopener noreferrer" onClick={onClose}>
              Open in Gmail instead
            </a>
          </div>
        </div>
      )}
      {acc && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: "8px 10px", alignItems: "center" }}>
            <span style={{ ...lbl, marginBottom: 0 }}>From</span>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>{acc.from_name ? acc.from_name + " · " : ""}<span style={{ color: "#5a6a85" }}>{acc.from_email}</span></div>
            <span style={{ ...lbl, marginBottom: 0 }}>To</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input style={{ ...inp, flex: 1 }} value={f.to} onChange={set("to")} />
              {!showCc && <button style={{ ...btn, padding: "5px 10px", fontSize: 12 }} onClick={() => setShowCc(true)}>+ Cc</button>}
            </div>
            {showCc && <><span style={{ ...lbl, marginBottom: 0 }}>Cc</span><input style={inp} value={f.cc} onChange={set("cc")} placeholder="separate with commas" /></>}
            <span style={{ ...lbl, marginBottom: 0 }}>Subject</span>
            <input style={inp} value={f.subject} onChange={set("subject")} />
          </div>
          <textarea value={f.body} onChange={set("body")} rows={13} onKeyDown={(e) => e.stopPropagation()}
            style={{ ...inp, width: "100%", boxSizing: "border-box", marginTop: 10, fontFamily: "inherit", lineHeight: 1.5, resize: "vertical" }} autoFocus />
          {err && <div style={{ ...note("red"), marginTop: 10 }}>{err}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <span style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600 }}>
              {acc.copy_me ? "A copy goes to your inbox. " : ""}Logged on the customer's account.
            </span>
            <span style={{ flex: 1 }} />
            <button style={btn} onClick={onClose}>Cancel</button>
            <button style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }} disabled={busy || !f.to.trim()} onClick={send}>{busy ? "Sending…" : "Send"}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ===== which mailbox each login sends from =====
export function EmailSettings({ me, onClose }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => listMailAccounts().then(setRows).catch((e) => { setRows([]); setErr(e.message); });
  useEffect(() => { load(); }, []);

  const open = (r) => {
    setMsg(null);
    setEdit({
      login_email: r.login_email, full_name: r.full_name, has_password: r.has_password,
      from_email: r.from_email || "", from_name: r.from_name || r.full_name || "",
      smtp_user: r.smtp_user || "", smtp_pass: "", smtp_host: r.smtp_host || "mail.deckkingdom.co.uk",
      smtp_port: r.smtp_port || 465, copy_me: r.copy_me !== false,
      signature: r.signature || "",
    });
  };
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const save = async (andTest) => {
    setBusy(true); setMsg(null);
    try {
      if (!edit.from_email.includes("@")) throw new Error("Enter the address emails come from.");
      if (!edit.has_password && !edit.smtp_pass) throw new Error("Enter the mailbox password.");
      await saveMailAccount({ ...edit, smtp_user: edit.smtp_user || edit.from_email, signature: edit.signature || defaultSignature(edit.from_name) });
      setEdit((x) => ({ ...x, has_password: true, smtp_pass: "", signature: x.signature || defaultSignature(x.from_name) }));
      await load();
      if (andTest) {
        await sendEmail({ test: true });
        setMsg(["green", "Saved — test email sent to " + edit.from_email + ". Check it arrived."]);
      } else setMsg(["green", "Saved."]);
    } catch (e) {
      setMsg(["red", e.message + (e.detail ? " (" + e.detail.slice(0, 140) + ")" : "")]);
    } finally { setBusy(false); }
  };

  const mine = edit && lc(edit.login_email) === lc(me);
  return (
    <Modal title={edit ? "Mailbox for " + (edit.full_name || edit.login_email) : "Email settings"} onClose={onClose} width={600}>
      {!edit && (
        <div>
          <div style={{ fontSize: 12.5, color: "#5a6a85", fontWeight: 600, marginBottom: 10 }}>
            Link each ops login to the Deck Kingdom mailbox it sends from. Passwords are stored securely and can't be viewed again.
          </div>
          {err && <div style={note("red")}>{err}</div>}
          {rows === null ? <div style={{ fontSize: 13, color: "#8593a8" }}>Loading…</div> : rows.map((r) => (
            <button key={r.login_email} onClick={() => open(r)}
              style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 6, border: "1px solid #e6e9ef", borderRadius: 10, background: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <div style={{ width: 30, height: 30, borderRadius: 999, background: NAVY, color: "#fff", fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                {userInitials({ staff: [{ email: r.login_email, name: r.full_name }] }, r.login_email)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <b style={{ fontSize: 13.5, color: NAVY }}>{r.full_name || r.login_email}</b>
                <div style={{ fontSize: 12, color: "#5a6a85", fontWeight: 600 }}>{r.full_name ? r.login_email : ""}</div>
              </div>
              {r.from_email && r.has_password
                ? <span style={{ fontSize: 12, fontWeight: 700, color: "#28713e" }}>✓ sends as {r.from_email}</span>
                : <span style={{ fontSize: 12, fontWeight: 700, color: "#9a7408" }}>Not linked</span>}
              <Icon name="pen" size={13} />
            </button>
          ))}
        </div>
      )}
      {edit && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label><span style={lbl}>Sends from (email)</span><input style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={edit.from_email} onChange={set("from_email")} placeholder="name@deckkingdom.co.uk" /></label>
            <label><span style={lbl}>Name shown</span><input style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={edit.from_name} onChange={set("from_name")} placeholder="Jon at Deck Kingdom" /></label>
            <label><span style={lbl}>Mailbox password</span><input type="password" autoComplete="new-password" style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={edit.smtp_pass} onChange={set("smtp_pass")} placeholder={edit.has_password ? "saved — leave blank to keep" : "the Krystal mailbox password"} /></label>
            <label><span style={lbl}>Login name (if different)</span><input style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={edit.smtp_user} onChange={set("smtp_user")} placeholder={edit.from_email || "same as the email"} /></label>
            <label><span style={lbl}>Outgoing server</span><input style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={edit.smtp_host} onChange={set("smtp_host")} /></label>
            <label><span style={lbl}>Port</span><input style={{ ...inp, width: "100%", boxSizing: "border-box" }} value={edit.smtp_port} onChange={set("smtp_port")} /></label>
          </div>
          <label style={{ display: "block", marginTop: 10 }}>
            <span style={lbl}>Signature</span>
            <textarea rows={5} value={edit.signature || defaultSignature(edit.from_name)} onChange={set("signature")} onKeyDown={(e) => e.stopPropagation()}
              style={{ ...inp, width: "100%", boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.5 }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, fontWeight: 600, color: NAVY }}>
            <input type="checkbox" checked={edit.copy_me} onChange={set("copy_me")} /> Send me a copy of each email (so it shows in my inbox)
          </label>
          {msg && <div style={{ ...note(msg[0]), marginTop: 10 }}>{msg[1]}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
            <button style={btn} onClick={() => { setEdit(null); setMsg(null); }}>Back</button>
            <span style={{ flex: 1 }} />
            <button style={btn} disabled={busy} onClick={() => save(false)}>Save</button>
            {mine && <button style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => save(true)}>{busy ? "Working…" : "Save & send test"}</button>}
          </div>
          {!mine && <div style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 600, marginTop: 8 }}>They can send a test themselves from their own login.</div>}
        </div>
      )}
    </Modal>
  );
}

// ===== sent emails on the account =====
export function EmailHistory({ crm, customerId, refresh, onCompose }) {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    let live = true;
    setRows(null);
    emailLogFor(customerId).then((r) => live && setRows(r));
    return () => { live = false; };
  }, [customerId, refresh]);
  if (!emailReady) return null;
  return (
    <div style={{ ...card, marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <p style={{ ...sect, margin: 0 }}>Emails sent ({rows ? rows.length : "…"})</p>
        <span style={{ flex: 1 }} />
        {onCompose && <button style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={onCompose}><Icon name="mail" size={13} /> New email</button>}
      </div>
      {rows && rows.length === 0 && <div style={{ fontSize: 13, color: "#8593a8", fontWeight: 600 }}>No emails sent from ops yet.</div>}
      {(rows || []).map((r) => (
        <div key={r.id} style={{ borderTop: "1px solid #f0f2f6" }}>
          <button onClick={() => setOpen(open === r.id ? null : r.id)}
            style={{ display: "flex", width: "100%", gap: 12, alignItems: "baseline", padding: "9px 2px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", fontSize: 13 }}>
            <span style={{ color: "#5a6a85", fontWeight: 600, whiteSpace: "nowrap", width: 150, flex: "none" }}>{prettyDateTime(r.sent_at)}</span>
            <b style={{ color: NAVY, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.subject}</b>
            <span style={{ color: "#5a6a85", fontWeight: 600, whiteSpace: "nowrap" }}>to {r.to_email}</span>
            <span title={r.sent_by} style={{ fontSize: 11, fontWeight: 800, color: "#5a6a85", background: "#f0f3f8", borderRadius: 999, padding: "1px 7px" }}>{userInitials(crm, r.sent_by)}</span>
            <span style={{ color: "#8593a8" }}>{open === r.id ? "▾" : "▸"}</span>
          </button>
          {open === r.id && (
            <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5, color: NAVY, background: "#f7f9fc", borderRadius: 8, padding: "10px 12px", margin: "0 0 10px" }}>
              <div style={{ fontSize: 11.5, color: "#8593a8", fontWeight: 700, marginBottom: 6 }}>From {r.from_email}{r.cc ? " · cc " + r.cc : ""}</div>
              {r.body}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
