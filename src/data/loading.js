// Loading reports and line counts (load_reports / load_lines); local preview keeps them in this browser.
import { storageMode } from "./storage.js";
import { getSupabase } from "./supabaseClient.js";

const LR = "dk-load-reports", LL = "dk-load-lines";
const lget = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { return []; } };
const lset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } };
const repFromRow = (r) => ({ id: r.id, date: r.run_date, driver: r.driver, runNo: r.run_no, van: r.van, status: r.status, completedAt: r.completed_at, completedBy: r.completed_by, checked: r.checked || [], photoPaths: r.photo_paths || [], notes: r.notes || "", updatedAt: r.updated_at,
  shortLines: r.short_lines || [], alertState: r.alert_state || "", resolvedAt: r.resolved_at || "", resolvedBy: r.resolved_by || "", resolution: r.resolution || "", followups: r.followups || {} });
const lineFromRow = (r) => ({ reportId: r.report_id, itemKey: r.item_key, qtyNeeded: Number(r.qty_needed) || 0, qtyLoaded: Number(r.qty_loaded) || 0, loadedBy: r.loaded_by, loadedAt: r.loaded_at, boxed: !!r.boxed });

export const loadingReady = () => true;

// -> { reports: { id: report }, counts: { reportId: { itemKey: line } } }
export async function loadLoading(dates) {
  const ds = [...new Set(dates.filter(Boolean))];
  let reps = [], lines = [];
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const [a, b] = await Promise.all([
      sb.from("load_reports").select("*").in("run_date", ds),
      sb.from("load_lines").select("*").in("run_date", ds),
    ]);
    if (a.error) throw a.error;
    if (b.error) throw b.error;
    reps = (a.data || []).map(repFromRow);
    lines = (b.data || []).map(lineFromRow);
  } else {
    reps = lget(LR).filter((r) => ds.includes(r.date));
    lines = lget(LL).filter((l) => ds.includes(l.date));
  }
  const reports = {}, counts = {};
  reps.forEach((r) => (reports[r.id] = r));
  lines.forEach((l) => ((counts[l.reportId] = counts[l.reportId] || {})[l.itemKey] = l));
  return { reports, counts };
}

const ensureReport = async (sb, run) => {
  const { error } = await sb.from("load_reports").upsert({ id: run.key, run_date: run.date, driver: run.driver, run_no: run.runNo, van: run.van || "" }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
};

// record how many of a line are on the van (typed by the loader)
export async function setLoaded(run, item, qty, who, opts = {}) {
  const row = { report_id: run.key, item_key: item.key, run_date: run.date, driver: run.driver, qty_needed: item.qty, qty_loaded: qty, boxed: !!opts.boxed, loaded_by: who || "", loaded_at: new Date().toISOString() };
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    await ensureReport(sb, run);
    const { error } = await sb.from("load_lines").upsert(row, { onConflict: "report_id,item_key" });
    if (error) throw error;
  } else {
    const l = lget(LL).filter((x) => !(x.reportId === run.key && x.itemKey === item.key));
    l.push({ reportId: run.key, itemKey: item.key, date: run.date, qtyNeeded: item.qty, qtyLoaded: qty, boxed: !!opts.boxed, loadedBy: who || "", loadedAt: row.loaded_at });
    lset(LL, l);
    if (!lget(LR).some((r) => r.id === run.key)) lset(LR, [...lget(LR), { id: run.key, date: run.date, driver: run.driver, runNo: run.runNo, van: run.van, status: "open" }]);
  }
  return { reportId: run.key, itemKey: item.key, qtyNeeded: item.qty, qtyLoaded: qty, boxed: !!opts.boxed, loadedBy: who || "", loadedAt: row.loaded_at };
}
// accessory boxes for a job on this van
export const boxKey = (invId) => "boxes:" + invId;
export const setBoxes = (run, invId, n, who) => setLoaded(run, { key: boxKey(invId), qty: 0 }, n, who);

// close the report: the double-check list, photos of the loaded van, notes
export async function completeReport(run, { checked, photos, notes, who, shortLines = [] }) {
  const at = new Date().toISOString();
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    const paths = [];
    for (let n = 0; n < photos.length; n++) {
      const path = user.id + "/" + run.date + "-" + run.key.replace(/[^a-z0-9]+/gi, "-") + "-" + Date.now().toString(36) + "-" + (n + 1) + ".jpg";
      const up = await sb.storage.from("load-photos").upload(path, photos[n], { contentType: "image/jpeg", upsert: true });
      if (up.error) throw new Error("photo " + (n + 1) + ": " + up.error.message);
      paths.push(path);
    }
    const { error } = await sb.from("load_reports").upsert({ id: run.key, run_date: run.date, driver: run.driver, run_no: run.runNo, van: run.van || "", status: "complete", completed_at: at, completed_by: who || "", checked, photo_paths: paths, notes: notes || "", updated_at: at,
      short_lines: shortLines, alert_state: shortLines.length ? "open" : "", resolved_at: "", resolved_by: "", resolution: "" });
    if (error) throw error;
    return { id: run.key, status: "complete", completedAt: at, completedBy: who, checked, photoPaths: paths, notes, shortLines, alertState: shortLines.length ? "open" : "" };
  }
  const urls = [];
  for (const b of photos) urls.push(await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }));
  const rep = { id: run.key, date: run.date, driver: run.driver, runNo: run.runNo, van: run.van, status: "complete", completedAt: at, completedBy: who, checked, photoPaths: urls, notes, shortLines, alertState: shortLines.length ? "open" : "", resolvedAt: "", followups: {} };
  lset(LR, [...lget(LR).filter((r) => r.id !== run.key), rep]);
  return rep;
}

// office: open a closed report again (the counts stay; it needs closing again)
export async function reopenReport(id) {
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { error } = await sb.from("load_reports").update({ status: "open", completed_at: "", completed_by: "", checked: [], updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    return;
  }
  lset(LR, lget(LR).map((r) => (r.id === id ? { ...r, status: "open", completedAt: "", completedBy: "", checked: [] } : r)));
}

// office: wipe loading (one run, or everything) - counts and reports
export async function clearLoading(id) {
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    let a = sb.from("load_lines").delete(), b = sb.from("load_reports").delete();
    a = id ? a.eq("report_id", id) : a.neq("report_id", "");
    b = id ? b.eq("id", id) : b.neq("id", "");
    const r1 = await a; if (r1.error) throw r1.error;
    const r2 = await b; if (r2.error) throw r2.error;
    return;
  }
  lset(LL, id ? lget(LL).filter((l) => l.reportId !== id) : []);
  lset(LR, id ? lget(LR).filter((r) => r.id !== id) : []);
}

export async function loadPhotoUrl(path) {
  if (!path) return "";
  if (path.startsWith("data:")) return path;
  const sb = await getSupabase();
  const { data, error } = await sb.storage.from("load-photos").createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

// short loads (closed with items missing) from the last few weeks - for Delivery issues and the alerts
export async function loadShortLoads(days = 60) {
  const d = new Date(); d.setDate(d.getDate() - days);
  const from = d.toISOString().slice(0, 10);
  let reps;
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { data, error } = await sb.from("load_reports").select("*").eq("status", "complete").gte("run_date", from);
    if (error) throw error;
    reps = (data || []).map(repFromRow);
  } else reps = lget(LR).filter((r) => r.status === "complete" && r.date >= from);
  return reps.filter((r) => (r.shortLines || []).length);
}
// office: { alert_state, resolved_at, resolved_by, resolution, followups }
export async function updateReport(id, patch) {
  if (storageMode === "supabase") {
    const sb = await getSupabase();
    const { error } = await sb.from("load_reports").update(patch).eq("id", id);
    if (error) throw error;
    return;
  }
  const camel = { alert_state: "alertState", resolved_at: "resolvedAt", resolved_by: "resolvedBy", resolution: "resolution", followups: "followups" };
  const p = {}; Object.keys(patch).forEach((k) => (p[camel[k] || k] = patch[k]));
  lset(LR, lget(LR).map((r) => (r.id === id ? { ...r, ...p } : r)));
}
