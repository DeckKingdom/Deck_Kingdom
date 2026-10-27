// Data storage adapter selection.
// - Inside Claude's preview: window.storage (design mode, demo data).
// - Hosted with Supabase configured: the relational adapter + real logins.
// - Anywhere else: browser localStorage (dev fallback).
import { supabaseStorage } from "./supabaseAdapter.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const hasClaudeStorage =
  typeof window !== "undefined" &&
  window.storage &&
  typeof window.storage.get === "function";

const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const storageMode = hasClaudeStorage ? "claude" : hasSupabaseConfig ? "supabase" : "local";

const localAdapter = {
  async get(key) {
    const value = window.localStorage.getItem(key);
    return value === null ? null : { key, value };
  },
  async set(key, value) {
    window.localStorage.setItem(key, value);
    return { key, value };
  },
};

export const storage =
  storageMode === "claude" ? window.storage : storageMode === "supabase" ? supabaseStorage : localAdapter;
