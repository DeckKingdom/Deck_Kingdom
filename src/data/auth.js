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
