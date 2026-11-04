// Users & access (admin only - the database refuses anyone else)
import { getSupabase } from "./supabaseClient.js";

const run = async (q) => {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
};

export async function loadAccess() {
  const sb = await getSupabase();
  const [profiles, invites] = await Promise.all([
    run(sb.from("profiles").select("id, email, full_name, role, read_only, created_at").order("email")),
    run(sb.from("staff_invites").select("email, full_name, role, read_only, created_at").order("email")),
  ]);
  return { profiles: profiles || [], invites: invites || [] };
}

// one person: the invite is the lasting record (it re-applies if their login is ever re-made),
// and it updates their login straight away if they already have one
export async function saveAccess({ email, full_name, role, read_only }) {
  const sb = await getSupabase();
  const e = String(email || "").trim().toLowerCase();
  if (role === "none") {
    await run(sb.from("staff_invites").delete().eq("email", e));
    await run(sb.from("profiles").update({ role: "none", read_only: false }).ilike("email", e));
    return;
  }
  await run(sb.from("staff_invites").upsert({ email: e, full_name: full_name || "", role, read_only: !!read_only }));
}
