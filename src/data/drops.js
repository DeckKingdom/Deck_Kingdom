// Drivers' drop confirmations (photo + what was dropped). Supabase table drop_confirmations;
// without Supabase (local preview) they live in this browser.
import { storageMode } from "./storage.js";
import { getSupabase } from "./supabaseClient.js";

const LOCAL = "dk-drop-confirmations";
const localAll = () => { try { return JSON.parse(localStorage.getItem(LOCAL) || "[]"); } catch (e) { return []; } };
const fromRow = (r) => ({ id: r.id, at: r.at, driver: r.driver, kind: r.kind || "job", invoiceId: r.invoice_id || "", collectionId: r.collection_id || "", invNo: r.inv_no, date: r.delivery_date, items: r.items || [], photoPath: r.photo_path, notes: r.notes, lat: r.lat, lng: r.lng, appliedAt: r.applied_at || "", alertState: r.alert_state || "", alertBy: r.alert_by || "", followupInvNo: r.followup_inv_no || "", payment: r.payment || {}, voidedAt: r.voided_at || "", resolvedAt: r.resolved_at || "", resolvedBy: r.resolved_by || "", resolution: r.resolution || "", photoPaths: Array.isArray(r.photo_paths) && r.photo_paths.length ? r.photo_paths : [r.photo_path].filter(Boolean) });

export const dropsReady = () => storageMode === "supabase";

// the key a confirmation is filed under: the job id, or "col:" + the collection id
export const dropKey = (r) => (r.collectionId ? "col:" + r.collectionId : r.invoiceId);
// a confirmation where everything was dropped / collected
export const dropFull = (r) => !!r && !(r.items || []).some((x) => x.short);
// lines with something left over: [{ text, qty, delivered, remaining }]
export const dropLeft = (r) => ((r && r.items) || []).filter((x) => x.short).map((x) => ({ ...x, remaining: x.remaining != null ? Number(x.remaining) : Number(x.qty) || 0, delivered: x.delivered != null ? Number(x.delivered) : 0 }));
// does the office need to look at it? (something left over, or the driver wrote a note)
export const payMissed = (r) => !!(r && r.payment && Number(r.payment.owed) > 0 && !r.payment.collected);
export const dropNeedsLook = (r) => !!r && (dropLeft(r).length > 0 || !!String(r.notes || "").trim() || payMissed(r));

// confirmations for these dates -> { [dropKey]: latest confirmation }
export async function loadDrops(dates) {
  const ds = [...new Set(dates.filter(Boolean))];
  if (!ds.length) return {};
  let rows = [];
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { data, error } = await sb.from("drop_confirmations").select("*").in("delivery_date", ds).order("at", { ascending: true });
    if (error) throw error;
    rows = (data || []).map(fromRow);
  } else rows = localAll().filter((r) => ds.includes(r.date));
  rows = rows.filter((r) => !r.voidedAt); // reopened by the office
  const m = {};
  rows.forEach((r) => (m[dropKey(r)] = r));
  return m;
}

// every photo of the drop, as stored paths (or data URLs in the local preview)
export const photosOf = (r) => (r && Array.isArray(r.photoPaths) && r.photoPaths.length ? r.photoPaths : [r && r.photoPath].filter(Boolean));

export async function saveDrop(conf, photoBlobs) {
  const blobs = Array.isArray(photoBlobs) ? photoBlobs : [photoBlobs];
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    const paths = [];
    for (let n = 0; n < blobs.length; n++) {
      const path = user.id + "/" + conf.date + "-" + conf.id + (n ? "-" + (n + 1) : "") + ".jpg";
      const up = await sb.storage.from("drop-photos").upload(path, blobs[n], { contentType: "image/jpeg", upsert: true });
      if (up.error) throw new Error("photo " + (n + 1) + ": " + up.error.message);
      paths.push(path);
    }
    const row = { id: conf.id, user_id: user.id, driver: conf.driver, kind: conf.collectionId ? "collection" : "job", invoice_id: conf.invoiceId || "", collection_id: conf.collectionId || "", inv_no: String(conf.invNo || ""), delivery_date: conf.date, items: conf.items, photo_path: paths[0] || "", photo_paths: paths, notes: conf.notes || "", payment: conf.payment || {}, lat: conf.lat ?? null, lng: conf.lng ?? null, accuracy_m: conf.acc ?? null };
    let ins = await sb.from("drop_confirmations").insert(row);
    if (ins.error && /photo_paths/.test(ins.error.message)) { const { photo_paths, ...old } = row; ins = await sb.from("drop_confirmations").insert(old); } // SQL not updated yet: first photo only
    if (ins.error) throw new Error(ins.error.message);
    return { ...conf, photoPath: paths[0], photoPaths: paths, at: new Date().toISOString() };
  }
  const urls = [];
  for (const bl of blobs) urls.push(await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(bl); }));
  const saved = { ...conf, photoPath: urls[0], photoPaths: urls, at: new Date().toISOString() };
  try { localStorage.setItem(LOCAL, JSON.stringify([...localAll(), saved].slice(-200))); } catch (e) { /* too big for the preview */ }
  return saved;
}

export async function dropPhotoUrl(path) {
  if (!path) return "";
  if (path.startsWith("data:")) return path;
  const sb = await getSupabase();
  const { data, error } = await sb.storage.from("drop-photos").createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

// shrink a phone photo so it uploads quickly on a weak signal
export const shrinkPhoto = (file, max = 1600) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    cv.toBlob((b) => resolve(b || file), "image/jpeg", 0.8);
  };
  img.onerror = () => resolve(file);
  img.src = URL.createObjectURL(file);
});


// set fields on confirmations: { applied_at, alert_state, alert_by, followup_inv_no }
export async function updateDrops(ids, patch) {
  if (!ids.length) return;
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { error } = await sb.from("drop_confirmations").update(patch).in("id", ids);
    if (error) throw error;
    return;
  }
  const camel = { applied_at: "appliedAt", alert_state: "alertState", alert_by: "alertBy", followup_inv_no: "followupInvNo", voided_at: "voidedAt", voided_by: "voidedBy", resolved_at: "resolvedAt", resolved_by: "resolvedBy", resolution: "resolution" };
  const p = {}; Object.keys(patch).forEach((k) => (p[camel[k] || k] = patch[k]));
  try { localStorage.setItem(LOCAL, JSON.stringify(localAll().map((r) => (ids.includes(r.id) ? { ...r, ...p } : r)))); } catch (e) { /* preview only */ }
}

// ===== run events: when a driver sets off on a run (driver_events) =====
const LOCAL_EV = "dk-driver-events";
const localEv = () => { try { return JSON.parse(localStorage.getItem(LOCAL_EV) || "[]"); } catch (e) { return []; } };
const evFromRow = (r) => ({ id: r.id, at: r.at, driver: r.driver, date: r.run_date, runNo: r.run_no, van: r.van, kind: r.kind, lat: r.lat, lng: r.lng, voidedAt: r.voided_at || "", itemKey: r.item_key || "" });

export async function loadEvents(dates) {
  const ds = [...new Set([...dates.filter(Boolean), "*"])];
  if (!ds.length) return [];
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { data, error } = await sb.from("driver_events").select("*").in("run_date", ds).order("at", { ascending: true });
    if (error) throw error;
    return (data || []).map(evFromRow).filter((e) => !e.voidedAt);
  }
  return localEv().filter((r) => ds.includes(r.date) && !r.voidedAt);
}

export async function logEvent(ev) {
  const row = { ...ev, at: ev.at || new Date().toISOString() };
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from("driver_events").insert({ id: row.id, user_id: user.id, driver: row.driver || "", run_date: row.date, run_no: String(row.runNo || ""), van: row.van || "", kind: row.kind || "depart", item_key: row.itemKey || "", lat: row.lat ?? null, lng: row.lng ?? null, accuracy_m: row.acc ?? null });
    if (error) throw error;
    return row;
  }
  try { localStorage.setItem(LOCAL_EV, JSON.stringify([...localEv(), row].slice(-500))); } catch (e) { /* preview */ }
  return row;
}

// every confirmation in a date range (office: driver tracking)
export async function loadDropsRange(from, to) {
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { data, error } = await sb.from("drop_confirmations").select("*").gte("delivery_date", from).lte("delivery_date", to).order("at", { ascending: true });
    if (error) throw error;
    return (data || []).map(fromRow).filter((r) => !r.voidedAt);
  }
  return localAll().filter((r) => r.date >= from && r.date <= to && !r.voidedAt);
}
export async function loadEventsRange(from, to) {
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { data, error } = await sb.from("driver_events").select("*").gte("run_date", from).lte("run_date", to).order("at", { ascending: true });
    if (error) throw error;
    return (data || []).map(evFromRow).filter((e) => !e.voidedAt);
  }
  return localEv().filter((r) => r.date >= from && r.date <= to && !r.voidedAt);
}
export async function loadFuelRange(fromIso, toIso) {
  if (storageMode !== "supabase") { try { return JSON.parse(localStorage.getItem("dk-fuel-local") || "[]"); } catch (e) { return []; } }
  const sb = await getSupabase();
  const { data, error } = await sb.from("fuel_logs").select("id, at, driver, van, amount, litres, mileage, lat, lng").gte("at", fromIso).lte("at", toIso).order("at", { ascending: true });
  if (error) throw error;
  return data || [];
}

// office: void set-off events for a run (so it can be set off again)
export async function voidEvents(ids) {
  if (!ids.length) return;
  const at = new Date().toISOString();
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { error } = await sb.from("driver_events").update({ voided_at: at }).in("id", ids);
    if (error) throw error;
    return;
  }
  try { localStorage.setItem(LOCAL_EV, JSON.stringify(localEv().map((e) => (ids.includes(e.id) ? { ...e, voidedAt: at } : e)))); } catch (e) { /* */ }
}

// ===== admin: wipe all driver completion data (testing) =====
export async function loadAllDrops() {
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { data, error } = await sb.from("drop_confirmations").select("*").limit(5000);
    if (error) throw error;
    return (data || []).map(fromRow);
  }
  return localAll();
}
// removes every confirmation, set-off and drop photo; drivers' phones get a reset so their load ticks clear
export async function wipeDriverData(drivers) {
  const stamp = Date.now().toString(36);
  if (storageMode !== "supabase") {
    try {
      localStorage.removeItem(LOCAL);
      localStorage.setItem(LOCAL_EV, JSON.stringify(drivers.map((d, n) => ({ id: "wipe" + stamp + n, driver: d, date: "*", runNo: "*", kind: "reset", at: new Date().toISOString() }))));
    } catch (e) { /* */ }
    return { photos: 0 };
  }
  const sb = await getSupabase();
  // 1. the records - this is what reopens everything on the phones
  let r = await sb.from("drop_confirmations").delete().neq("id", "").select("id");
  if (r.error) throw new Error("confirmations: " + r.error.message);
  const removed = (r.data || []).length;
  r = await sb.from("driver_events").delete().neq("id", "");
  if (r.error) throw new Error("set-offs: " + r.error.message);
  // tell every driver's phone to forget its load-check ticks
  const { data: { user } } = await sb.auth.getUser();
  if (drivers.length) {
    r = await sb.from("driver_events").insert(drivers.map((d, n) => ({ id: "wipe" + stamp + n, user_id: user.id, driver: d, run_date: "*", run_no: "*", kind: "reset" })));
    if (r.error) throw new Error("reset: " + r.error.message);
  }
  // 2. the photos (one folder per driver login) - best effort, reported back
  let photos = 0, photoErr = "";
  try {
    const { data: folders } = await sb.storage.from("drop-photos").list("", { limit: 1000 });
    for (const f of folders || []) {
      const { data: files } = await sb.storage.from("drop-photos").list(f.name, { limit: 1000 });
      const paths = (files || []).map((x) => f.name + "/" + x.name);
      for (let i = 0; i < paths.length; i += 100) {
        const { data: gone, error } = await sb.storage.from("drop-photos").remove(paths.slice(i, i + 100));
        if (error) throw new Error(error.message);
        if (!(gone || []).length) throw new Error("permission missing — run clear-driver-data.sql, then clear again");
        photos += gone.length;
      }
    }
  } catch (e) { photoErr = String((e && e.message) || e); }
  return { photos, photoErr, removed };
}

// delete confirmations for good (and their photos, best effort)
export async function deleteDrops(confs) {
  const ids = confs.map((r) => r.id);
  if (!ids.length) return { photoErr: "" };
  if (storageMode !== "supabase") {
    try { localStorage.setItem(LOCAL, JSON.stringify(localAll().filter((r) => !ids.includes(r.id)))); } catch (e) { /* */ }
    return { photoErr: "" };
  }
  const sb = await getSupabase();
  let photoErr = "";
  const paths = confs.flatMap(photosOf).filter((p) => p && !p.startsWith("data:"));
  if (paths.length) {
    const { data: gone, error } = await sb.storage.from("drop-photos").remove(paths);
    if (error) photoErr = error.message;
    else if ((gone || []).length < paths.length) photoErr = "permission missing — run driver-app-all.sql";
  }
  const { error } = await sb.from("drop_confirmations").delete().in("id", ids);
  if (error) throw error;
  return { photoErr };
}

// delete load-check ticks and set-offs - optionally just one run: { date, driver, runNo }
export async function clearLoadChecks(run) {
  const kinds = ["tick", "untick", "depart", "nav"];
  if (storageMode !== "supabase") {
    const keep = (e) => !kinds.includes(e.kind) || (run && !(e.date === run.date && String(e.driver || "").toLowerCase() === String(run.driver || "").toLowerCase() && String(e.runNo || "") === String(run.runNo || "")));
    try { localStorage.setItem(LOCAL_EV, JSON.stringify(localEv().filter(keep))); } catch (e) { /* */ }
    return;
  }
  const sb = await getSupabase();
  let q = sb.from("driver_events").delete().in("kind", kinds);
  if (run) q = q.eq("run_date", run.date).ilike("driver", run.driver || "").eq("run_no", String(run.runNo || ""));
  const { error } = await q;
  if (error) throw error;
}
// every driver's phone forgets its load-check ticks (all days, all runs)
export async function resetLoadChecks() {
  await clearLoadChecks(null);
}

// office: confirmations still to be applied, or with an alert still open - whatever the run date
export async function loadPendingDrops() {
  let rows = [];
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const [a, b] = await Promise.all([
      sb.from("drop_confirmations").select("*").eq("applied_at", "").limit(500),
      sb.from("drop_confirmations").select("*").eq("alert_state", "open").limit(200),
    ]);
    if (a.error) throw a.error;
    if (b.error) throw b.error;
    const seen = new Set();
    rows = [...(a.data || []), ...(b.data || [])].filter((r) => (seen.has(r.id) ? false : seen.add(r.id))).map(fromRow);
  } else rows = localAll().filter((r) => !r.appliedAt || r.alertState === "open");
  return rows.filter((r) => !r.voidedAt);
}
