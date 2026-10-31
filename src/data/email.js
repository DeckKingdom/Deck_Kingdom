// Outgoing email from ops: each login sends through its linked mailbox via
// the "send-email" edge function; every sent email is logged per customer.
import { getSupabase } from "./supabaseClient.js";
import { storageMode } from "./storage.js";

export const emailReady = storageMode === "supabase";

export async function listMailAccounts() {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc("mail_accounts_list");
  if (error) throw new Error(/does not exist|Could not find/i.test(error.message) ? "Email isn't switched on in Supabase yet (run 026_email.sql)." : error.message);
  return data || [];
}

export async function saveMailAccount(acc) {
  const sb = await getSupabase();
  const { error } = await sb.rpc("mail_account_save", { p: acc });
  if (error) throw new Error(error.message);
}

export async function removeMailAccount(login) {
  const sb = await getSupabase();
  const { error } = await sb.rpc("mail_account_remove", { p_login: login });
  if (error) throw new Error(error.message);
}

// { to, cc, subject, body, customerId, siteId } or { test: true }
export async function sendEmail(msg) {
  const sb = await getSupabase();
  const { data, error } = await sb.functions.invoke("send-email", { body: msg });
  if (error) {
    let j = null;
    try { j = await error.context.json(); } catch { /* not json */ }
    if (j && j.error) { const e = new Error(j.error); e.setup = !!j.setup; e.detail = j.detail; throw e; }
    throw new Error(/Failed to send a request|404|not found/i.test(String(error.message))
      ? "The send-email function isn't deployed in Supabase yet." : String(error.message || error));
  }
  return data;
}

export async function emailLogFor(customerId) {
  const sb = await getSupabase();
  const { data, error } = await sb.from("email_log").select("*").eq("customer_id", customerId).order("sent_at", { ascending: false }).limit(200);
  if (error) return [];
  return data || [];
}

export const defaultSignature = (name) =>
  [name || "", "Deck Kingdom", "0161 399 1837 · deckkingdom.co.uk", "Whitelands Road, Ashton-under-Lyne, OL6 6UG"].filter(Boolean).join("\n");
