// Loading on a phone: pick a day, pick a van, count every line on (any order, part loads fine),
// photograph the van and submit the loading report. Someone else (another loader, the office or the
// driver) then goes round the van ticking every line - only then do the driver's deliveries open.
// Accessories packed in boxes: count them as boxed and log how many boxes each job has.
// A van that goes out short can still be submitted, with a reason - the office gets a short-load alert.
// Drivers see only their own runs; the warehouse sees every van.
import { useEffect, useState } from "react";
import { NAVY, GOLD, RED } from "../lib/core.js";
import { runsOn, loadState, shortLinesOf, canCheck, shortName } from "../lib/loading.js";
import { loadLoading, setLoaded, setBoxes, boxKey, completeReport, checkReport, reopenReport, loadPhotoUrl } from "../data/loading.js";
import { shrinkPhoto } from "../data/drops.js";

const GREEN = "#28713e", BLUE = "#185FA5", AMBER = "#a06d00";
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
      onBack={() => { setRunKey(null); refresh(); }} onChanged={refresh}
      onCount={(item, q, boxed) => setLoaded(run, item, q, who, { boxed }).then((row) => setData((d) => ({ ...d, counts: { ...d.counts, [run.key]: { ...(d.counts[run.key] || {}), [item.key]: row } } })))}
      onBoxes={(invId, b) => setBoxes(run, invId, b, who).then((row) => setData((d) => ({ ...d, counts: { ...d.counts, [run.key]: { ...(d.counts[run.key] || {}), [boxKey(invId)]: row } } })))}
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
            const short = st.complete && rep && (rep.shortLines || []).length;
            const chk = st.submitted && canCheck(rep, who);
            const tone = short ? RED : st.complete ? GREEN : st.submitted ? BLUE : st.loaded || st.part ? AMBER : NAVY;
            return (
              <button key={r.key} type="button" onClick={() => setRunKey(r.key)}
                style={{ ...cardS, width: "100%", textAlign: "left", fontFamily: "inherit", color: NAVY, cursor: "pointer", borderLeft: "6px solid " + tone, display: "block" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <b style={{ fontSize: 17, flex: 1 }}>{r.van || "No van"}</b>
                  <span style={{ fontSize: 12, fontWeight: 800, color: tone }}>{st.submitted ? (chk ? "👀 CHECK NEEDED" : "WAITING FOR A CHECK") : short ? "⚠ WENT OUT SHORT" : st.complete ? "✓ LOADED & CHECKED" : st.loaded || st.part ? "PART LOADED" : "NOT STARTED"}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#5a6a85", marginTop: 2 }}>{r.driver}{r.runNo ? " · Run " + r.runNo : ""} · {r.jobs.length} drop{r.jobs.length === 1 ? "" : "s"}{r.pickups.length ? " · " + r.pickups.length + " pick-up" + (r.pickups.length === 1 ? "" : "s") : ""}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#8593a8", marginTop: 4 }}>
                  {st.submitted ? "Loaded by " + shortName(rep.completedBy) + " at " + hm(rep.completedAt) + (chk ? " — tap to double-check it" : " — someone else needs to double-check it") : st.complete && rep && rep.completedAt ? "Loaded by " + shortName(rep.completedBy) + (rep.checkedBy ? " · checked by " + shortName(rep.checkedBy) : "") + (short ? " · " + short + " line" + (short === 1 ? "" : "s") + " missing" : "")
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
            const toCheck = runs.filter((r) => canCheck(data && data.reports[r.key], who)).length;
            const first = k === 0;
            const dd = new Date(d + "T00:00:00");
            return (
              <button key={d} type="button" onClick={() => setDay(d)}
                style={{ gridColumn: first ? "span 2" : undefined, minHeight: first ? 92 : 80, borderRadius: 16, border: "1px solid " + (first ? GOLD : "#e6e9ef"), background: first ? GOLD : "#fff", color: NAVY, fontFamily: "inherit", textAlign: "left", padding: "12px 14px", cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 800, fontSize: first ? 19 : 16 }}>{k === 0 ? "Today" : k === 1 ? "Tomorrow" : dd.toLocaleDateString("en-GB", { weekday: "long" })} ({runs.length} van{runs.length === 1 ? "" : "s"})</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: first ? NAVY : "#8593a8" }}>{dd.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{runs.length ? " · " + done + " loaded" : ""}{toCheck ? <b style={{ color: BLUE }}> · {toCheck} to check</b> : null}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===== one van: count each line on =====
function LoadRun({ run, data, who, header, err, onBack, onChanged, onCount, onBoxes, onClosed }) {
  const counts = (data && data.counts[run.key]) || {};
  const rep = data && data.reports[run.key];
  const st = loadState(run, counts, rep);
  const [counting, setCounting] = useState(null); // line being counted
  const [closing, setClosing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState("");
  const locked = (st.complete || st.submitted) && run.lines.length > 0;
  const mayCheck = canCheck(rep, who);

  if (closing) return <SubmitReport run={run} counts={counts} who={who} header={header} onBack={() => setClosing(false)} onClosed={(r) => { onClosed(r); setClosing(false); }} />;
  if (checking && rep) return <CheckReport run={run} counts={counts} rep={{ ...rep, id: run.key }} who={who} header={header} onBack={() => setChecking(false)} onDone={() => { setChecking(false); onChanged(); }} />;

  // group lines by job, last drop first (it goes on the van first)
  const groups = [];
  run.lines.forEach((x) => { let g = groups.find((y) => y.inv.id === x.inv.id); if (!g) groups.push((g = { inv: x.inv, customer: x.customer, lines: [] })); g.lines.push(x); });

  return (
    <div>
      {header(runName(run), onBack)}
      <div style={{ padding: 14 }}>
        {(err || msg) && <div style={{ ...cardS, borderColor: "#f4b9c1", background: "#fdf3f4", color: RED, fontWeight: 700 }}>{err || msg}</div>}
        {!locked && rep && rep.sentBack && <div style={{ ...cardS, borderColor: "#f4b9c1", background: "#fdf3f4", color: RED, fontWeight: 800 }}>↩ Sent back after the double-check — {rep.sentBack}. Fix the counts and submit again.</div>}
        {st.submitted && rep && (
          <div style={{ ...cardS, background: "#eef5fd", borderColor: "#c6dcf3" }}>
            <div style={{ color: BLUE, fontWeight: 800 }}>Loaded by {shortName(rep.completedBy)} at {hm(rep.completedAt)} — waiting for a double-check</div>
            {mayCheck ? (
              <>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5a6a85", marginTop: 3 }}>Go round the van and tick every line as you see it. The driver's deliveries open once you confirm.</div>
                <button type="button" onClick={() => setChecking(true)} style={{ ...bigBtn(true, BLUE), marginTop: 10 }}>👀 Double-check this van</button>
              </>
            ) : <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5a6a85", marginTop: 3 }}>You loaded it, so someone else has to check it — another loader, the office or the driver.</div>}
            {(rep.shortLines || []).length > 0 && <div style={{ marginTop: 8, color: RED, fontWeight: 800, fontSize: 13.5 }}>⚠ Going out short — {rep.shortLines.length} line{rep.shortLines.length === 1 ? "" : "s"} missing. The office has been alerted.</div>}
          </div>
        )}
        <div style={{ ...cardS, display: st.submitted ? "none" : "block", background: locked ? "#f1faf4" : "#fff", borderColor: locked ? "#bfe3ca" : "#e6e9ef" }}>
          {locked ? (
            <>
              <div style={{ color: GREEN, fontWeight: 800 }}>✓ Loaded by {shortName(rep.completedBy)}{rep.checkedBy ? " and double-checked by " + shortName(rep.checkedBy) + " at " + hm(rep.checkedAt) : ""} — the driver's deliveries are open. Ask the office to reopen it if something changes.</div>
              {(rep.shortLines || []).length > 0 && <div style={{ marginTop: 8, color: RED, fontWeight: 800, fontSize: 13.5 }}>⚠ Went out short — {rep.shortLines.length} line{rep.shortLines.length === 1 ? "" : "s"} missing. The office has been alerted.</div>}
            </>
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
                  <span style={{ fontSize: 13, fontWeight: 800, color: full ? GREEN : part ? AMBER : "#aab3c2", whiteSpace: "nowrap", textAlign: "right" }}>{got} / {x.qty}{c && c.boxed ? <span style={{ display: "block", fontSize: 11, color: "#8a5a00" }}>📦 in box</span> : null}</span>
                </button>
              );
            })}
            <BoxRow n={counts[boxKey(g.inv.id)] ? counts[boxKey(g.inv.id)].qtyLoaded : 0} locked={locked}
              onSet={(b) => { setMsg(""); onBoxes(g.inv.id, b).catch(() => setMsg("Couldn't save the box count — check your signal and try again.")); }} />
          </div>
        ))}
        {!locked && run.lines.length > 0 && (
          <>
            <button type="button" onClick={() => setClosing(true)} style={{ ...bigBtn(true, st.ready ? NAVY : AMBER), marginTop: 6 }}>{st.ready ? "Submit the loading report" : "⚠ Submit with items missing"}</button>
            {!st.ready && <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, color: AMBER, textAlign: "center" }}>
              {[st.todo ? st.todo + " line" + (st.todo === 1 ? "" : "s") + " not loaded" : "", st.part ? st.part + " part loaded" : "", st.unscheduled ? st.unscheduled + " pick-up" + (st.unscheduled === 1 ? "" : "s") + " not booked" : ""].filter(Boolean).join(" · ")} — finish loading if you can. If the van has to go short, submit it with a reason and the office will sort the missing parts.
            </div>}
          </>
        )}
      </div>
      {counting && <CountSheet item={counting} current={counts[counting.key] ? counts[counting.key].qtyLoaded : null}
        onClose={() => setCounting(null)}
        boxed={!!(counts[counting.key] && counts[counting.key].boxed)}
        onSave={(q, bx) => { setCounting(null); setMsg(""); onCount(counting, q, bx).catch(() => setMsg("Couldn't save that count — check your signal and try again.")); }} />}
    </div>
  );
}

// how many accessory boxes this job has on the van
function BoxRow({ n, locked, onSet }) {
  const b = (on) => ({ width: 40, height: 40, borderRadius: 10, border: "1px solid #d5d9e0", background: "#fff", color: on ? NAVY : "#c4cbd6", fontFamily: "inherit", fontWeight: 900, fontSize: 20, cursor: on ? "pointer" : "default" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0 2px", borderTop: "1px solid #f3f5f8" }}>
      <span style={{ fontSize: 20 }}>📦</span>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>Accessory boxes<span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "#8593a8" }}>Screws, clips, fixings etc. packed together</span></span>
      {!locked && <button type="button" disabled={n <= 0} onClick={() => onSet(n - 1)} style={b(n > 0)}>−</button>}
      <b style={{ minWidth: 26, textAlign: "center", fontSize: 18, color: n ? NAVY : "#aab3c2" }}>{n}</b>
      {!locked && <button type="button" onClick={() => onSet(n + 1)} style={b(true)}>+</button>}
    </div>
  );
}

// type the count - no "all" button, so it has to be counted
function CountSheet({ item, current, boxed: wasBoxed, onClose, onSave }) {
  const [v, setV] = useState("");
  const [boxed, setBoxed] = useState(!!wasBoxed);
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
        {q !== null && !over && q < item.qty && <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: AMBER }}>Part load — {item.qty - q} still to go on.</div>}
        <button type="button" onClick={() => setBoxed((x) => !x)} style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", marginTop: 12, padding: "11px 12px", borderRadius: 10, border: "1px solid " + (boxed ? "#e7c46a" : "#d5d9e0"), background: boxed ? "#fff6dd" : "#fff", fontFamily: "inherit", color: NAVY, fontWeight: 700, fontSize: 14.5, textAlign: "left", cursor: "pointer" }}>
          <span style={{ ...tickBox(boxed), ...(boxed ? { borderColor: GOLD, background: GOLD, color: NAVY } : {}) }}>{boxed ? "✓" : ""}</span>
          📦 Packed in an accessory box
        </button>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={onClose} style={{ ...bigBtn(true, "#fff"), color: NAVY, border: "1px solid #d5d9e0", flex: 1 }}>Cancel</button>
          <button type="button" disabled={q === null || over} onClick={() => onSave(q, boxed)} style={{ ...bigBtn(q !== null && !over), flex: 2 }}>Save count</button>
        </div>
      </div>
    </div>
  );
}

// ===== submit: the loader's photos (+ a reason if it's short) - no re-tick, a second person does that =====
function SubmitReport({ run, counts, who, header, onBack, onClosed }) {
  const [photos, setPhotos] = useState([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const short = shortLinesOf(run, counts);
  const reasonOk = !short.length || notes.trim().length >= 3;
  const ok = photos.length > 0 && reasonOk;
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true); setMsg("");
    try {
      const blobs = [];
      for (const p of photos) blobs.push(await shrinkPhoto(p.file));
      const rep = await completeReport(run, { checked: checkedList(run, counts), photos: blobs, notes: notes.trim(), who, shortLines: short });
      onClosed(rep);
    } catch (e) { setMsg("Couldn't submit it — " + ((e && e.message) || e) + ". Check your signal and try again."); }
    setBusy(false);
  };
  return (
    <div>
      {header("Submit loading · " + (run.van || run.driver), onBack)}
      <div style={{ padding: 14 }}>
        {short.length > 0 && <ShortCard short={short} />}
        <div style={cardS}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Photograph the loaded van</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5a6a85", marginTop: 3 }}>Then someone else — another loader, the office or the driver — goes round the van to double-check it before the driver can set off.</div>
          <span style={label}>Photos of the loaded van <span style={{ textTransform: "none", fontWeight: 600, color: RED }}>— required, at least one</span></span>
          <PhotoPicker photos={photos} setPhotos={setPhotos} />
          <span style={label}>{short.length ? <>Why is it going out short? <span style={{ textTransform: "none", fontWeight: 600, color: RED }}>— required</span></> : "Notes (optional)"}</span>
          <textarea style={{ ...field, minHeight: 60, resize: "vertical", borderColor: short.length && !reasonOk ? "#f4b9c1" : "#d5d9e0" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={short.length ? "e.g. boards out of stock - due Thursday" : "e.g. trims strapped to the roof rack"} />
          {msg && <div style={{ marginTop: 10, color: RED, fontWeight: 700 }}>{msg}</div>}
          <button type="button" disabled={!ok || busy} onClick={save} style={{ ...bigBtn(ok, short.length ? AMBER : GREEN), marginTop: 14 }}>{busy ? "Submitting…" : short.length ? "⚠ Submit — van going out short" : "Submit for double-check"}</button>
          {!ok && <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, color: "#8593a8", textAlign: "center" }}>{!photos.length ? "Add a photo of the loaded van." : "Say why it's going out short."}</div>}
        </div>
      </div>
    </div>
  );
}

// ===== double-check: a different person ticks every line as they see it on the van =====
function CheckReport({ run, counts, rep, who, header, onBack, onDone }) {
  const [got, setGot] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [back, setBack] = useState(null); // reason text when sending it back
  const [urls, setUrls] = useState({});
  useEffect(() => { (rep.photoPaths || []).forEach((p) => loadPhotoUrl(p).then((u) => setUrls((m) => ({ ...m, [p]: u }))).catch(() => {})); }, [rep.id]);
  const short = rep.shortLines || [];
  const missingAll = new Set(short.filter((m) => !m.loaded).map((m) => m.key));
  const toCheck = run.lines.filter((x) => !missingAll.has(x.key)).map((x) => ({ x, part: short.find((m) => m.key === x.key) }));
  const boxRows = boxRowsOf(run, counts);
  const all = toCheck.every((t) => got[t.x.key]) && boxRows.every((b) => got[b.key]);
  const act = async (fn) => { setBusy(true); setMsg(""); try { await fn(); onDone(); } catch (e) { setMsg("Couldn't save — " + ((e && e.message) || e)); } setBusy(false); };
  const row = (key, on, body) => (
    <button key={key} type="button" onClick={() => setGot((g) => ({ ...g, [key]: !g[key] }))}
      style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", border: "none", borderBottom: "1px solid #f3f5f8", background: "none", fontFamily: "inherit", color: NAVY, textAlign: "left", fontSize: 14.5, padding: "10px 0", cursor: "pointer" }}>
      <span style={tickBox(on)}>{on ? "✓" : ""}</span><span style={{ flex: 1 }}>{body}</span>
    </button>
  );
  return (
    <div>
      {header("Double-check · " + (run.van || run.driver), onBack)}
      <div style={{ padding: 14 }}>
        <div style={{ ...cardS, background: "#eef5fd", borderColor: "#c6dcf3" }}>
          <div style={{ fontWeight: 800, color: BLUE }}>Loaded by {shortName(rep.completedBy)} at {hm(rep.completedAt)}</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5a6a85", marginTop: 3 }}>Go round the van and tick each line as you see it — don't tick from the list.</div>
          {(rep.photoPaths || []).length > 0 && <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>{rep.photoPaths.map((p) => <a key={p} href={urls[p]} target="_blank" rel="noopener noreferrer" style={{ width: 64, height: 64, borderRadius: 8, overflow: "hidden", background: "#dfe7f1", display: "block" }}>{urls[p] && <img src={urls[p]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}</a>)}</div>}
          {rep.notes && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: "#6b5305" }}>Loader's note: {rep.notes}</div>}
        </div>
        {short.length > 0 && <ShortCard short={short} checked />}
        <div style={cardS}>
          {toCheck.map(({ x, part }) => row(x.key, !!got[x.key], <>
            <b>{part ? part.loaded + " of " + x.qty : x.qty}×</b> {x.line.description || x.line.code}{x.line.colour ? <span style={{ color: "#5a6a85" }}> · {x.line.colour}</span> : null}
            <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: x.src ? BLUE : part ? AMBER : "#8593a8" }}>{x.customer} · #{x.inv.invNo}{x.src ? " · on pick-up COL-" + x.src.col.collectionNo + " (not on the van yet)" : ""}{counts[x.key] && counts[x.key].boxed ? " · 📦 in a box" : ""}{part ? " · part load" : ""}</span>
          </>))}
          {boxRows.map((b) => row(b.key, !!got[b.key], <>
            <b>{b.n}×</b> 📦 accessory box{b.n === 1 ? "" : "es"}
            <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#8593a8" }}>{b.x.customer} · #{b.x.inv.invNo}</span>
          </>))}
          {toCheck.length + boxRows.length === 0 && <div style={{ padding: "10px 0", fontSize: 13.5, fontWeight: 700, color: "#8593a8" }}>Nothing on the van to check.</div>}
          {msg && <div style={{ marginTop: 10, color: RED, fontWeight: 700 }}>{msg}</div>}
          {back === null ? (
            <>
              <button type="button" disabled={!all || busy} onClick={() => act(() => checkReport(rep.id || run.key, who))} style={{ ...bigBtn(all), marginTop: 14 }}>{busy ? "Saving…" : "✓ Van checked — it's right"}</button>
              {!all && <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, color: "#8593a8", textAlign: "center" }}>Tick every line as you find it on the van.</div>}
              <button type="button" onClick={() => setBack("")} style={{ ...bigBtn(true, "#fff"), color: RED, border: "1px solid #f4b9c1", marginTop: 10, fontSize: 15 }}>✗ Something's wrong — send it back</button>
            </>
          ) : (
            <>
              <span style={label}>What's wrong? <span style={{ textTransform: "none", fontWeight: 600, color: RED }}>— required</span></span>
              <textarea autoFocus style={{ ...field, minHeight: 60 }} value={back} onChange={(e) => setBack(e.target.value)} placeholder="e.g. only 18 slatted cladding on, not 20" />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="button" onClick={() => setBack(null)} style={{ ...bigBtn(true, "#fff"), color: NAVY, border: "1px solid #d5d9e0", flex: 1, fontSize: 15 }}>Cancel</button>
                <button type="button" disabled={back.trim().length < 3 || busy} onClick={() => act(() => reopenReport(rep.id || run.key, shortName(who) + ": " + back.trim()))} style={{ ...bigBtn(back.trim().length >= 3, RED), flex: 2, fontSize: 15 }}>Send back to the loader</button>
              </div>
            </>
          )}
          <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: "#8593a8", textAlign: "center" }}>Confirming opens the driver's deliveries for this run.</div>
        </div>
      </div>
    </div>
  );
}

function ShortCard({ short, checked }) {
  return (
    <div style={{ ...cardS, borderColor: "#f4b9c1", background: "#fdf3f4" }}>
      <div style={{ fontWeight: 800, fontSize: 16, color: RED }}>⚠ This van is going out short</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5a6a85", marginTop: 3 }}>{checked ? "The office has been alerted to raise a job or post the missing parts." : "The office gets an alert with this list so they can raise a job or post the missing parts."}</div>
      {short.map((m) => (
        <div key={m.key} style={{ padding: "8px 0", borderTop: "1px solid #f4dfe2", fontSize: 14 }}>
          <b>{m.missing}×</b> {m.text}{m.colour ? <span style={{ color: "#5a6a85" }}> · {m.colour}</span> : null}
          <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: RED }}>{m.customer} · #{m.invNo} · {m.why}{m.loaded ? " (" + m.loaded + " of " + m.qty + " on)" : ""}</span>
        </div>
      ))}
    </div>
  );
}

function PhotoPicker({ photos, setPhotos }) {
  return (
    <>
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
    </>
  );
}

const boxRowsOf = (run, counts) => [...new Map(run.lines.map((x) => [x.inv.id, x])).values()]
  .map((x) => ({ key: boxKey(x.inv.id), x, n: counts[boxKey(x.inv.id)] ? Number(counts[boxKey(x.inv.id)].qtyLoaded) || 0 : 0 })).filter((b) => b.n > 0);
const checkedList = (run, counts) => run.lines.map((x) => ({ key: x.key, qty: x.qty, loaded: x.src ? 0 : (counts[x.key] ? counts[x.key].qtyLoaded : 0), boxed: !!(counts[x.key] && counts[x.key].boxed), pickup: x.src ? "COL-" + x.src.col.collectionNo : "", text: x.line.description || x.line.code, job: x.inv.invNo }))
  .concat(boxRowsOf(run, counts).map((b) => ({ key: b.key, boxes: b.n, text: b.n + " accessory box" + (b.n === 1 ? "" : "es"), job: b.x.inv.invNo })));
