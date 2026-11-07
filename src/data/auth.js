import { getSupabase } from "./supabaseClient.js";

let currentSession = null;

export async function getSession() {
  const sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  currentSession = data.session;
  return data.session;
}

export async function onAuthChange(cb) {
  const sb = await getSupabase();
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    cb(session);
  });
  return () => data.subscription.unsubscribe();
}

export async function signIn(email, password) {
  const sb = await getSupabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return error ? error.message : null;
}

export async function signOut() {
  const sb = await getSupabase();
  await sb.auth.signOut();
}

export function getSessionEmail() {
  return (currentSession && currentSession.user && currentSession.user.email) || "";
}

// this login's access level (profiles.role / read_only). Before the access-levels migration has
// been run there's no read_only column: everyone keeps full access, as before.
export async function getMyAccess() {
  const sb = await getSupabase();
  const uid = currentSession && currentSession.user && currentSession.user.id;
  if (!uid) return null;
  let { data, error } = await sb.from("profiles").select("role, read_only, full_name, driver_name").eq("id", uid).maybeSingle();
  if (error && /driver_name/.test(error.message || "")) ({ data, error } = await sb.from("profiles").select("role, read_only, full_name").eq("id", uid).maybeSingle());
  if (error) {
    if (/read_only/.test(error.message || "")) return { role: "admin", read_only: false, legacy: true };
    throw new Error(error.message);
  }
  return data || { role: "none", read_only: false };
}
