// Drivers' drop confirmations (photo + what was dropped). Supabase table drop_confirmations;
// without Supabase (local preview) they live in this browser.
import { storageMode } from "./storage.js";
import { getSupabase } from "./supabaseClient.js";

const LOCAL = "dk-drop-confirmations";
const localAll = () => { try { return JSON.parse(localStorage.getItem(LOCAL) || "[]"); } catch (e) { return []; } };
const fromRow = (r) => ({ id: r.id, at: r.at, driver: r.driver, kind: r.kind || "job", invoiceId: r.invoice_id || "", collectionId: r.collection_id || "", invNo: r.inv_no, date: r.delivery_date, items: r.items || [], photoPath: r.photo_path, notes: r.notes, lat: r.lat, lng: r.lng, appliedAt: r.applied_at || "", alertState: r.alert_state || "", alertBy: r.alert_by || "", followupInvNo: r.followup_inv_no || "", payment: r.payment || {} });

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
  const m = {};
  rows.forEach((r) => (m[dropKey(r)] = r));
  return m;
}

export async function saveDrop(conf, photoBlob) {
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    const path = user.id + "/" + conf.date + "-" + conf.id + ".jpg";
    const up = await sb.storage.from("drop-photos").upload(path, photoBlob, { contentType: "image/jpeg", upsert: false });
    if (up.error) throw new Error("photo: " + up.error.message);
    const ins = await sb.from("drop_confirmations").insert({ id: conf.id, user_id: user.id, driver: conf.driver, kind: conf.collectionId ? "collection" : "job", invoice_id: conf.invoiceId || "", collection_id: conf.collectionId || "", inv_no: String(conf.invNo || ""), delivery_date: conf.date, items: conf.items, photo_path: path, notes: conf.notes || "", payment: conf.payment || {}, lat: conf.lat ?? null, lng: conf.lng ?? null, accuracy_m: conf.acc ?? null });
    if (ins.error) throw new Error(ins.error.message);
    return { ...conf, photoPath: path, at: new Date().toISOString() };
  }
  const url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(photoBlob); });
  const saved = { ...conf, photoPath: url, at: new Date().toISOString() };
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
  const camel = { applied_at: "appliedAt", alert_state: "alertState", alert_by: "alertBy", followup_inv_no: "followupInvNo" };
  const p = {}; Object.keys(patch).forEach((k) => (p[camel[k] || k] = patch[k]));
  try { localStorage.setItem(LOCAL, JSON.stringify(localAll().map((r) => (ids.includes(r.id) ? { ...r, ...p } : r)))); } catch (e) { /* preview only */ }
}

// ===== run events: when a driver sets off on a run (driver_events) =====
const LOCAL_EV = "dk-driver-events";
const localEv = () => { try { return JSON.parse(localStorage.getItem(LOCAL_EV) || "[]"); } catch (e) { return []; } };
const evFromRow = (r) => ({ id: r.id, at: r.at, driver: r.driver, date: r.run_date, runNo: r.run_no, van: r.van, kind: r.kind, lat: r.lat, lng: r.lng });

export async function loadEvents(dates) {
  const ds = [...new Set(dates.filter(Boolean))];
  if (!ds.length) return [];
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { data, error } = await sb.from("driver_events").select("*").in("run_date", ds).order("at", { ascending: true });
    if (error) throw error;
    return (data || []).map(evFromRow);
  }
  return localEv().filter((r) => ds.includes(r.date));
}

export async function logEvent(ev) {
  const row = { ...ev, at: ev.at || new Date().toISOString() };
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from("driver_events").insert({ id: row.id, user_id: user.id, driver: row.driver || "", run_date: row.date, run_no: String(row.runNo || ""), van: row.van || "", kind: row.kind || "depart", lat: row.lat ?? null, lng: row.lng ?? null, accuracy_m: row.acc ?? null });
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
    return (data || []).map(fromRow);
  }
  return localAll().filter((r) => r.date >= from && r.date <= to);
}
export async function loadEventsRange(from, to) {
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { data, error } = await sb.from("driver_events").select("*").gte("run_date", from).lte("run_date", to).order("at", { ascending: true });
    if (error) throw error;
    return (data || []).map(evFromRow);
  }
  return localEv().filter((r) => r.date >= from && r.date <= to);
}
export async function loadFuelRange(fromIso, toIso) {
  if (storageMode !== "supabase") { try { return JSON.parse(localStorage.getItem("dk-fuel-local") || "[]"); } catch (e) { return []; } }
  const sb = await getSupabase();
  const { data, error } = await sb.from("fuel_logs").select("id, at, driver, van, amount, litres, mileage, lat, lng").gte("at", fromIso).lte("at", toIso).order("at", { ascending: true });
  if (error) throw error;
  return data || [];
}
