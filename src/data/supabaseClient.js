import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

let clientPromise = null;

// Lazily created so the Claude-preview bundle never loads supabase-js.
export function getSupabase() {
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    );
  }
  return clientPromise;
}
