// Instant open: a copy of the last successfully loaded book is kept on this
// device (IndexedDB) and painted the moment the app opens, while the live load
// catches up in the background. The cached copy is only ever LOOKED at — edits
// are held off until fresh data lands (useCrm ignores them while stale), and
// saves always diff against a real fetch, never against this cache.
// Everything here is best-effort: private browsing or a cleared browser just
// means the app opens the slower way, exactly as before.

const DB = "dk-crm-cache";
const STORE = "kv";

const openDb = () =>
  new Promise((ok, no) => {
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE);
    q.onsuccess = () => ok(q.result);
    q.onerror = () => no(q.error);
  });

// -> { at: ms-timestamp, value: JSON string } or null
export async function readCrmCache() {
  try {
    const db = await openDb();
    return await new Promise((ok, no) => {
      const r = db.transaction(STORE).objectStore(STORE).get("crm");
      r.onsuccess = () => ok(r.result || null);
      r.onerror = () => no(r.error);
    });
  } catch (e) {
    return null;
  }
}

export async function writeCrmCache(jsonString) {
  if (!jsonString) return;
  try {
    const db = await openDb();
    await new Promise((ok, no) => {
      const r = db.transaction(STORE, "readwrite").objectStore(STORE).put({ at: Date.now(), value: jsonString }, "crm");
      r.onsuccess = ok;
      r.onerror = () => no(r.error);
    });
  } catch (e) {
    /* cache is a bonus, never a requirement */
  }
}
