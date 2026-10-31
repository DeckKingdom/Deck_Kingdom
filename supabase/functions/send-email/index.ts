// Deck Kingdom Ops - send-email edge function
// Sends one email through the signed-in user's linked mailbox (Krystal SMTP)
// and logs it against the customer. Deploy: Supabase -> Edge Functions ->
// Deploy a new function -> Via editor -> name it  send-email  -> paste this -> Deploy.
import nodemailer from "npm:nodemailer@6.9.16";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const toHtml = (text: string) =>
  '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1b2a41">' +
  esc(text).replace(/\r?\n/g, "<br>") + "</div>";
const okEmail = (s: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s);
const list = (s: unknown) => String(s || "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);

export async function handle(req: Request, deps: { db: any; send: (acc: any, mail: any) => Promise<unknown> }) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST only" });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await deps.db.auth.getUser(token);
  const login = String(u?.user?.email || "").toLowerCase();
  if (ue || !login) return reply(401, { error: "Please sign in to ops again." });

  let p: any = {};
  try { p = await req.json(); } catch { return reply(400, { error: "Bad request" }); }

  const { data: acc } = await deps.db.from("mail_accounts").select("*").eq("login_email", login).maybeSingle();
  if (!acc || !acc.from_email || !acc.smtp_pass)
    return reply(400, { error: "Your login isn't linked to a mailbox yet — set it up under Email settings.", setup: true });

  const to = p.test ? [acc.from_email] : list(p.to);
  const cc = p.test ? [] : list(p.cc);
  if (!to.length || ![...to, ...cc].every(okEmail)) return reply(400, { error: "Check the email address." });
  const subject = String(p.subject || "").trim() || "Deck Kingdom";
  const body = String(p.body || (p.test ? "Test email from Deck Kingdom Ops — your mailbox is linked and sending works." : ""));
  if (!body.trim()) return reply(400, { error: "The email is empty." });

  try {
    await deps.send(acc, {
      from: acc.from_name ? { name: acc.from_name, address: acc.from_email } : acc.from_email,
      to, cc: cc.length ? cc : undefined,
      bcc: acc.copy_me && !p.test ? acc.from_email : undefined,
      replyTo: acc.from_email,
      subject, text: body, html: toHtml(body),
    });
  } catch (e) {
    const m = String((e as Error)?.message || e);
    const hint = /auth|535|credentials|password/i.test(m) ? "The mailbox password was rejected — re-enter it under Email settings."
      : /ENOTFOUND|getaddrinfo|ECONNREFUSED|timed? ?out|ETIMEDOUT/i.test(m) ? "Couldn't reach the mail server — check the server name and port under Email settings."
      : "The mail server refused the email.";
    return reply(502, { error: hint, detail: m });
  }

  if (p.test) return reply(200, { ok: true, test: true });
  const row = {
    sent_by: login, from_email: acc.from_email, to_email: to.join(", "), cc: cc.join(", "),
    subject, body, customer_id: String(p.customerId || ""), site_id: String(p.siteId || ""),
  };
  const { data: logged } = await deps.db.from("email_log").insert(row).select().maybeSingle();
  return reply(200, { ok: true, logged: logged || row });
}

const smtpSend = (acc: any, mail: any) =>
  nodemailer.createTransport({
    host: acc.smtp_host || "mail.deckkingdom.co.uk",
    port: Number(acc.smtp_port) || 465,
    secure: Number(acc.smtp_port || 465) === 465,
    auth: { user: acc.smtp_user || acc.from_email, pass: acc.smtp_pass },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  }).sendMail(mail);

if (import.meta.main) {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const db = createClient(Deno.env.get("SUPABASE_URL") || "", key, { auth: { persistSession: false } });
  Deno.serve((req) => handle(req, { db, send: smtpSend }));
}
