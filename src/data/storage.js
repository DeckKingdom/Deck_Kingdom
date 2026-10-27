// Data storage adapter.
// Inside Claude's preview, window.storage (per-app key-value store) is used.
// Anywhere else (local dev, Vercel) it falls back to browser localStorage.
// Phase 2 replaces the fallback with a Supabase-backed adapter behind the
// same interface: get(key) -> { value } | null, set(key, value).

const hasClaudeStorage =
  typeof window !== "undefined" &&
  window.storage &&
  typeof window.storage.get === "function";

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

export const storage = hasClaudeStorage ? window.storage : localAdapter;
