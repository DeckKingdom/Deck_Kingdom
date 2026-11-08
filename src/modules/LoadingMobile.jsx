// Loading on a phone: pick a day, pick a van, count every line on (any order, part loads fine),
// then close the loading report - every line re-ticked as a second check, and photos of the van.
// Drivers see only their own runs; the warehouse sees every van.
import { useEffect, useState } from "react";
import { NAVY, GOLD, RED } from "../lib/core.js";
import { runsOn, loadState } from "../lib/loading.js";
import { loadLoading, setLoaded, completeReport } from "../data/loading.js";
import { shrinkPhoto } from "../data/drops.js";

const GREEN = "#28713e", BLUE = "#185FA5";
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const hm = (t) => (t ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
const cardS = { background: "#fff", border: "1px solid #e6e9ef", borderRadius: 14, padding: "14px 15px", marginBottom: 10 };
const field = { width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 16, padding: "12px 12px", borderRadius: 10, border: "1px solid #d5d9e0", background: "#fff", color: NAVY };
const label = { display: "block", fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: "#8593a8", margin: "14px 0 6px" };
const bigBtn = (on, bg = GREEN) => ({ width: "100%", border: "none", borderRadius: 12, padding: 15, fontFamily: "inherit", fontWeight: 800, fontSize: 17, background: on ? bg : "#e6e9ef", color: on ? "#fff" : "#8593a8", cursor: on ? "pointer" : "default" });
const tickBox = (on) => ({ width: 26, height: 26, flex: "none", borderRadius: 7, border: "2px solid " + (on ? GREEN : "#c4cbd6"), background: on ? GREEN : "#fff", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 15, boxSizing: "border-box" });
const runName = (r) => (r.van || "No van") + " · " + r.driver + (r.runNo ? " · Run " + r.runNo : "");

export default function LoadingMobile({ crm, driver, who, header, onBack, nav }) {
  const [day, setDay] = useState(null);
  const [runKey, setRunKey] = useState(null);
  const [data, setData] = useState(null); // { reports, counts }
  const [err, setErr] = useState("");
  const [n, setN] = useState(0);
  const dates = Array.from({ length: 7 }, (_, k) => { const d = new Date(); d.setDate(d.getDate() + k); return ymd(d); });
  useEffect(() => {
    let live = true;
    const pull = () => loadLoading(dates).then((d) => { if (live) { setData(d); setErr(""); } }).catch((e) => live && setErr(/load_|relation|column/.test(String(e && e.message)) ? "Loading isn't switched on yet — ask the office to run loading.sql." : "Couldn't reach the office system — check your signal and tap ↻."));
    pull();
    const t = setInterval(pull, 30000); // other loaders' counts turn up
    return () => { live = false; clearInterval(t); };
  }, [n]);
  const refresh = () => setN((x) => x + 1);
  const runsFor = (d) => (crm ? runsOn(crm, d, driver) : []);
  const stateOf = (r) => loadState(r, data && data.counts[r.key], data && data.reports[r.key]);

  if (runKey && day) {
    const run = runsFor(day).find((r) => r.key === runKey);
    if (!run) return <div>{header("Loading", () => setRunKey(null))}<div style={{ padding: 14 }}><div style={cardS}>This run isn't on the schedule any more.</div></div></div>;
    return <LoadRun run={run} data={data} who={who} header={header} err={err}
      onBack={() => { setRunKey(null); refresh(); }}
      onCount={(item, q) => setLoaded(run, item, q, who).then((row) => setData((d) => ({ ...d, counts: { ...d.counts, [run.key]: { ...(d.counts[run.key] || {}), [item.key]: row } } })))}
      onClosed={(rep) => setData((d) => ({ ...d, reports: { ...d.reports, [run.key]: { ...rep, id: run.key } } }))} />;
  }

  if (day) {
    const runs = runsFor(day);
    return (
      <div>
        {header(new Date(day + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) + " · loading", () => setDay(null))}
        {nav}
        <div style={{ padding: 14 }}>
          {err && <div style={{ ...cardS, borderColor: "#f4b9c1", background: "#fdf3f4", color: RED, fontWeight: 700 }}>{err}</div>}
          {runs.length === 0 && <div style={{ ...cardS, textAlign: "center", color: "#8593a8", fontWeight: 700 }}>No vans going out {driver ? "for you " : ""}this day.</div>}
          {runs.map((r) => {
            const st = stateOf(r);
            const rep = data && data.reports[r.key];
            const tone = st.complete ? GREEN : st.loaded || st.part ? "#a06d00" : NAVY;
            return (
              <button key={r.key} type="button" onClick={() => setRunKey(r.key)}
                style={{ ...cardS, width: "100%", textAlign: "left", fontFamily: "inherit", color: NAVY, cursor: "pointer", borderLeft: "6px solid " + tone, display: "block" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <b style={{ fontSize: 17, flex: 1 }}>{r.van || "No van"}</b>
                  <span style={{ fontSize: 12, fontWeight: 800, color: tone }}>{st.complete ? "✓ LOADED" : st.loaded || st.part ? "PART LOADED" : "NOT STARTED"}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#5a6a85", marginTop: 2 }}>{r.driver}{r.runNo ? " · Run " + r.runNo : ""} · {r.jobs.length} drop{r.jobs.length === 1 ? "" : "s"}{r.pickups.length ? " · " + r.pickups.length + " pick-up" + (r.pickups.length === 1 ? "" : "s") : ""}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#8593a8", marginTop: 4 }}>
                  {st.complete && rep && rep.completedAt ? "Closed by " + String(rep.completedBy || "").split("@")[0] + " at " + hm(rep.completedAt)
                    : st.loaded + " of " + st.total + " lines on" + (st.part ? " · " + st.part + " part" : "") + (st.allocated ? " · " + st.allocated + " on pick-ups" : "") + (st.unscheduled ? " · " + st.unscheduled + " pick-up not booked" : "")}
                </div>
                {!st.complete && st.total > 0 && <div style={{ height: 6, background: "#eef1f6", borderRadius: 4, marginTop: 8, overflow: "hidden" }}><div style={{ height: "100%", width: (100 * (st.loaded + st.allocated) / st.total) + "%", background: GOLD }} /></div>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      {header(driver ? "Load your van" : "Loading", onBack)}
      {nav}
      <div style={{ padding: 14 }}>
        {err && <div style={{ ...cardS, borderColor: "#f4b9c1", background: "#fdf3f4", color: RED, fontWeight: 700 }}>{err}</div>}
        <div style={{ fontSize: 13, fontWeight: 700, color: "#5a6a85", margin: "0 2px 10px" }}>Pick the day, then the van to load.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {dates.map((d, k) => {
            const runs = runsFor(d);
            const done = runs.filter((r) => stateOf(r).complete).length;
            const first = k === 0;
            const dd = new Date(d + "T00:00:00");
            return (
              <button key={d} type="button" onClick={() => setDay(d)}
                style={{ gridColumn: first ? "span 2" : undefined, minHeight: first ? 92 : 80, borderRadius: 16, border: "1px solid " + (first ? GOLD : "#e6e9ef"), background: first ? GOLD : "#fff", color: NAVY, fontFamily: "inherit", textAlign: "left", padding: "12px 14px", cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 800, fontSize: first ? 19 : 16 }}>{k === 0 ? "Today" : k === 1 ? "Tomorrow" : dd.toLocaleDateString("en-GB", { weekday: "long" })} ({runs.length} van{runs.length === 1 ? "" : "s"})</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: first ? NAVY : "#8593a8" }}>{dd.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{runs.length ? " · " + done + " loaded" : ""}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===== one van: count each line on =====
function LoadRun({ run, data, who, header, err, onBack, onCount, onClosed }) {
  const counts = (data && data.counts[run.key]) || {};
  const rep = data && data.reports[run.key];
  const st = loadState(run, counts, rep);
  const [counting, setCounting] = useState(null); // line being counted
  const [closing, setClosing] = useState(false);
  const [msg, setMsg] = useState("");
  const locked = st.complete && run.lines.length > 0;

  if (closing) return <CloseReport run={run} counts={counts} who={who} header={header} onBack={() => setClosing(false)} onClosed={(r) => { onClosed(r); setClosing(false); }} />;

  // group lines by job, last drop first (it goes on the van first)
  const groups = [];
  run.lines.forEach((x) => { let g = groups.find((y) => y.inv.id === x.inv.id); if (!g) groups.push((g = { inv: x.inv, customer: x.customer, lines: [] })); g.lines.push(x); });

  return (
    <div>
      {header(runName(run), onBack)}
      <div style={{ padding: 14 }}>
        {(err || msg) && <div style={{ ...cardS, borderColor: "#f4b9c1", background: "#fdf3f4", color: RED, fontWeight: 700 }}>{err || msg}</div>}
        <div style={{ ...cardS, background: locked ? "#f1faf4" : "#fff", borderColor: locked ? "#bfe3ca" : "#e6e9ef" }}>
          {locked ? (
            <div style={{ color: GREEN, fontWeight: 800 }}>✓ Loading report closed by {String(rep.completedBy || "").split("@")[0]} at {hm(rep.completedAt)} — the driver's deliveries are open. Ask the office to reopen it if something changes.</div>
          ) : (
            <>
              <div style={{ fontWeight: 800 }}>{st.loaded} of {st.total} lines on the van{st.allocated ? " · " + st.allocated + " coming on pick-ups" : ""}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5a6a85", marginTop: 3 }}>Tap a line and type how many you've put on. Load in any order — last drop first is listed first.</div>
              <div style={{ height: 6, background: "#eef1f6", borderRadius: 4, marginTop: 8, overflow: "hidden" }}><div style={{ height: "100%", width: (100 * (st.loaded + st.allocated) / Math.max(1, st.total)) + "%", background: GOLD }} /></div>
            </>
          )}
        </div>
        {run.lines.length === 0 && <div style={{ ...cardS, textAlign: "center", color: "#8593a8", fontWeight: 700 }}>Nothing to load on this run{run.pickups.length ? " — pick-ups only" : ""}.</div>}
        {groups.map((g) => (
          <div key={g.inv.id} style={cardS}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <b style={{ fontSize: 13, color: "#8593a8" }}>Drop {g.inv.dropNo || "—"}</b>
              <b style={{ fontSize: 16, flex: 1 }}>{g.customer}</b>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#8593a8" }}>#{g.inv.invNo}</span>
            </div>
            {g.lines.map((x) => {
              const c = counts[x.key], got = c ? c.qtyLoaded : 0;
              if (x.src) {
                const ok = x.src.scheduled;
                return (
                  <div key={x.key} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderTop: "1px solid #f3f5f8" }}>
                    <span style={{ ...tickBox(false), borderStyle: "dashed", borderColor: ok ? "#8fb3d9" : RED, color: ok ? BLUE : RED }}>{ok ? "↻" : "!"}</span>
                    <span style={{ flex: 1, fontSize: 14.5 }}>
                      <b>{x.qty}×</b> {x.line.description || x.line.code}{x.line.colour ? <span style={{ color: "#5a6a85" }}> · {x.line.colour}</span> : null}
                      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: ok ? BLUE : RED }}>
                        {ok ? "Comes on the " + (x.src.col.supplier || "supplier") + " pick-up COL-" + x.src.col.collectionNo + (x.src.col.collected ? " (collected)" : " · " + (x.src.col.driver || "") + " " + new Date(x.src.col.collectDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }))
                          : "On COL-" + x.src.col.collectionNo + " but the pick-up isn't booked — the office needs to give it a date and driver"}
                      </span>
                    </span>
                  </div>
                );
              }
              const full = got >= x.qty, part = got > 0 && !full;
              return (
                <button key={x.key} type="button" disabled={locked} onClick={() => setCounting(x)}
                  style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", border: "none", borderTop: "1px solid #f3f5f8", background: "none", fontFamily: "inherit", color: NAVY, textAlign: "left", fontSize: 14.5, padding: "10px 0", cursor: locked ? "default" : "pointer" }}>
                  <span style={{ ...tickBox(full), ...(part ? { borderColor: GOLD, background: "#fff6dd", color: "#a06d00" } : {}) }}>{full ? "✓" : part ? "½" : ""}</span>
                  <span style={{ flex: 1 }}><b>{x.qty}×</b> {x.line.description || x.line.code}{x.line.colour ? <span style={{ color: "#5a6a85" }}> · {x.line.colour}</span> : null}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: full ? GREEN : part ? "#a06d00" : "#aab3c2", whiteSpace: "nowrap" }}>{got} / {x.qty}</span>
                </button>
              );
            })}
          </div>
        ))}
        {!locked && run.lines.length > 0 && (
          <>
            <button type="button" disabled={!st.ready} onClick={() => setClosing(true)} style={{ ...bigBtn(st.ready, NAVY), marginTop: 6 }}>{st.ready ? "Close the loading report" : "🔒 Close the loading report"}</button>
            {!st.ready && <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, color: "#8593a8", textAlign: "center" }}>
              {[st.todo ? st.todo + " line" + (st.todo === 1 ? "" : "s") + " not loaded" : "", st.part ? st.part + " part loaded" : "", st.unscheduled ? st.unscheduled + " pick-up" + (st.unscheduled === 1 ? "" : "s") + " not booked" : ""].filter(Boolean).join(" · ")} — the report closes once everything's on or booked on a pick-up.
            </div>}
          </>
        )}
      </div>
      {counting && <CountSheet item={counting} current={counts[counting.key] ? counts[counting.key].qtyLoaded : null}
        onClose={() => setCounting(null)}
        onSave={(q) => { setCounting(null); setMsg(""); onCount(counting, q).catch(() => setMsg("Couldn't save that count — check your signal and try again.")); }} />}
    </div>
  );
}

// type the count - no "all" button, so it has to be counted
function CountSheet({ item, current, onClose, onSave }) {
  const [v, setV] = useState("");
  const q = v === "" ? null : Number(v);
  const over = q !== null && q > item.qty;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,31,63,.5)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", borderRadius: "18px 18px 0 0", padding: "18px 16px 26px", boxSizing: "border-box" }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>{item.line.description || item.line.code}{item.line.colour ? " · " + item.line.colour : ""}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#5a6a85", marginTop: 2 }}>{item.customer} · #{item.inv.invNo} · needs <b style={{ color: NAVY }}>{item.qty}</b>{current != null ? " · counted " + current + " so far" : ""}</div>
        <span style={label}>How many are on the van?</span>
        <input autoFocus inputMode="numeric" value={v} placeholder="Count them and type the number" onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))}
          style={{ ...field, fontSize: 26, fontWeight: 800, textAlign: "center", borderColor: over ? RED : "#d5d9e0" }} />
        {over && <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: RED }}>That's more than the {item.qty} on the job — check the count.</div>}
        {q !== null && !over && q < item.qty && <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: "#a06d00" }}>Part load — {item.qty - q} still to go on.</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={onClose} style={{ ...bigBtn(true, "#fff"), color: NAVY, border: "1px solid #d5d9e0", flex: 1 }}>Cancel</button>
          <button type="button" disabled={q === null || over} onClick={() => onSave(q)} style={{ ...bigBtn(q !== null && !over), flex: 2 }}>Save count</button>
        </div>
      </div>
    </div>
  );
}

// ===== close: second check of every line + photos of the loaded van =====
function CloseReport({ run, counts, who, header, onBack, onClosed }) {
  const [got, setGot] = useState({});
  const [photos, setPhotos] = useState([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const all = run.lines.every((x) => got[x.key]);
  const ok = all && photos.length > 0;
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true); setMsg("");
    try {
      const blobs = [];
      for (const p of photos) blobs.push(await shrinkPhoto(p.file));
      const checked = run.lines.map((x) => ({ key: x.key, qty: x.qty, loaded: x.src ? 0 : (counts[x.key] ? counts[x.key].qtyLoaded : 0), pickup: x.src ? "COL-" + x.src.col.collectionNo : "", text: x.line.description || x.line.code, job: x.inv.invNo }));
      const rep = await completeReport(run, { checked, photos: blobs, notes: notes.trim(), who });
      onClosed(rep);
    } catch (e) { setMsg("Couldn't close it — " + ((e && e.message) || e) + ". Check your signal and try again."); }
    setBusy(false);
  };
  return (
    <div>
      {header("Double-check · " + (run.van || run.driver), onBack)}
      <div style={{ padding: 14 }}>
        <div style={cardS}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Go round the van again and tick each line as you see it</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5a6a85", marginTop: 3 }}>This is the second check — don't tick from memory.</div>
          {run.lines.map((x) => {
            const on = !!got[x.key];
            return (
              <button key={x.key} type="button" onClick={() => setGot((g) => ({ ...g, [x.key]: !g[x.key] }))}
                style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", border: "none", borderBottom: "1px solid #f3f5f8", background: "none", fontFamily: "inherit", color: NAVY, textAlign: "left", fontSize: 14.5, padding: "10px 0", cursor: "pointer" }}>
                <span style={tickBox(on)}>{on ? "✓" : ""}</span>
                <span style={{ flex: 1 }}><b>{x.qty}×</b> {x.line.description || x.line.code}{x.line.colour ? <span style={{ color: "#5a6a85" }}> · {x.line.colour}</span> : null}
                  <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: x.src ? BLUE : "#8593a8" }}>{x.customer} · #{x.inv.invNo}{x.src ? " · on pick-up COL-" + x.src.col.collectionNo : ""}</span>
                </span>
              </button>
            );
          })}
          <span style={label}>Photos of the loaded van <span style={{ textTransform: "none", fontWeight: 600 }}>— at least one</span></span>
          {photos.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
              {photos.map((p, k) => (
                <div key={p.url} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: "1px solid #e6e9ef" }}>
                  <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <button type="button" onClick={() => setPhotos((l) => l.filter((_, i) => i !== k))} style={{ position: "absolute", top: 4, right: 4, width: 26, height: 26, borderRadius: 99, border: "none", background: "rgba(11,31,63,.75)", color: "#fff", fontWeight: 800 }}>×</button>
                </div>
              ))}
            </div>
          )}
          {photos.length < 10 && (
            <label style={{ ...field, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 54, cursor: "pointer", fontWeight: 800, borderStyle: "dashed", textAlign: "center" }}>
              <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) setPhotos((l) => [...l, { file: f, url: URL.createObjectURL(f) }]); e.target.value = ""; }} />
              📷 {photos.length ? "Add another photo (" + photos.length + ")" : "Take a photo of the loaded van"}
            </label>
          )}
          <span style={label}>Notes (optional)</span>
          <textarea style={{ ...field, minHeight: 60, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. trims strapped to the roof rack" />
          {msg && <div style={{ marginTop: 10, color: RED, fontWeight: 700 }}>{msg}</div>}
          <button type="button" disabled={!ok || busy} onClick={save} style={{ ...bigBtn(ok), marginTop: 14 }}>{busy ? "Closing…" : "Close the loading report"}</button>
          {!ok && <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, color: "#8593a8", textAlign: "center" }}>{!all ? "Tick every line again." : "Add a photo of the loaded van."}</div>}
          <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 600, color: "#8593a8", textAlign: "center" }}>Closing it opens the driver's deliveries for this run.</div>
        </div>
      </div>
    </div>
  );
}
