// Loading (desktop): every van going out on a day, how far its loading has got, and the loading
// report. Counts can be entered here too. Whoever loads submits it with photos; a different person
// double-checks the van, and only then do the driver's deliveries open.
import { useEffect, useMemo, useState } from "react";
import { NAVY, GOLD, RED, prettyDateTime } from "../../lib/core.js";
import { ListHero, HeroStat, Chip, card, sect, lbl, inp, btn, goldBtn, Modal, Icon } from "./ui.jsx";
import { runsOn, loadState, shortLinesOf, canCheck, shortName } from "../../lib/loading.js";
import { loadLoading, setLoaded, setBoxes, boxKey, completeReport, checkReport, reopenReport, clearLoading, loadPhotoUrl } from "../../data/loading.js";
import { shrinkPhoto } from "../../data/drops.js";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const shift = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
const dayLabel = (s) => new Date(s + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const hm = (t) => (t ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
const GREEN = "#28713e", BLUE = "#185FA5";

export default function LoadingScreen({ crm, me, canEdit, canManage, openInvoice, openCollection }) {
  const [date, setDate] = useState(() => { try { const s = sessionStorage.getItem("dk-load-day"); if (s) return s; } catch (e) { /* */ } return ymd(new Date()); });
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [n, setN] = useState(0);
  const [openKey, setOpenKey] = useState(null);
  useEffect(() => { try { sessionStorage.setItem("dk-load-day", date); } catch (e) { /* */ } }, [date]);
  useEffect(() => {
    let live = true;
    setData(null);
    const pull = () => loadLoading([date]).then((d) => { if (live) { setData(d); setErr(""); } }).catch((e) => live && setErr(/load_|relation|column/.test(String(e && e.message)) ? "Run loading.sql in Supabase to switch loading on." : String((e && e.message) || e)));
    pull();
    const t = setInterval(pull, 30000);
    return () => { live = false; clearInterval(t); };
  }, [date, n]);
  const runs = useMemo(() => runsOn(crm, date), [crm, date]);
  const states = runs.map((r) => ({ r, st: loadState(r, data && data.counts[r.key], data && data.reports[r.key]) }));
  const closed = states.filter((x) => x.st.complete).length;
  const cur = openKey && runs.find((r) => r.key === openKey);

  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "18px 18px 40px" }}>
      <ListHero title="Loading" sub={dayLabel(date) + " · the driver's deliveries open once a van's loading report is closed"}>
        <HeroStat label="Vans going out" value={runs.length} />
        <HeroStat label="Waiting for a double-check" value={data ? states.filter((x) => x.st.submitted).length : "…"} tone={data && states.some((x) => x.st.submitted && canCheck(data.reports[x.r.key], me)) ? "#9cc8f5" : undefined} />
        <HeroStat label="Loaded & checked" value={data ? closed + " / " + runs.length : "…"} tone={data && runs.length && closed === runs.length ? "#8be3a3" : undefined} />
        <HeroStat label="Lines still to load" value={data ? states.reduce((t, x) => t + x.st.todo + x.st.part, 0) : "…"} />
        <HeroStat label="Pick-ups not booked" value={data ? states.reduce((t, x) => t + x.st.unscheduled, 0) : "…"} tone={data && states.some((x) => x.st.unscheduled) ? "#ff9aa8" : undefined} />
      </ListHero>

      <div style={{ ...card, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "12px 16px" }}>
        <button style={btn} onClick={() => setDate(shift(date, -1))} title="Day before"><Icon name="chevleft" /></button>
        <input type="date" style={{ ...inp, width: 170 }} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button style={btn} onClick={() => setDate(shift(date, 1))} title="Day after"><Icon name="chevright" /></button>
        <button style={{ ...btn, background: date === ymd(new Date()) ? NAVY : "#fff", color: date === ymd(new Date()) ? "#fff" : NAVY }} onClick={() => setDate(ymd(new Date()))}>Today</button>
        <button style={btn} onClick={() => setDate(shift(ymd(new Date()), 1))}>Tomorrow</button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: "#8593a8", fontWeight: 600 }}>Updates every 30 seconds · the warehouse loads from their phones</span>
      </div>

      {err && <div style={{ ...card, borderColor: "#f4d78f", background: "#fff8e6", color: "#6b5305", fontWeight: 700 }}>{err}</div>}
      {runs.length === 0 && <div style={{ ...card, textAlign: "center", color: "#8593a8", fontWeight: 600 }}>No vans on the schedule for {dayLabel(date)}.</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
        {states.map(({ r, st }) => {
          const rep = data && data.reports[r.key];
          const short = st.complete && rep && (rep.shortLines || []).length;
          const tone = st.submitted ? BLUE : short ? RED : st.complete ? GREEN : st.unscheduled ? RED : st.loaded || st.part ? "#a06d00" : NAVY;
          return (
            <button key={r.key} onClick={() => setOpenKey(r.key)}
              style={{ ...card, margin: 0, textAlign: "left", fontFamily: "inherit", color: NAVY, cursor: "pointer", borderTop: "5px solid " + tone }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <b style={{ fontSize: 17, flex: 1 }}>{r.van || "No van"}</b>
                <Chip tone={st.submitted ? "blue" : short ? "red" : st.complete ? "green" : st.unscheduled ? "red" : st.loaded || st.part ? "amber" : "grey"}>{st.submitted ? (canCheck(rep, me) ? "👀 Check needed" : "Waiting for a check") : short ? "Went out short ⚠" : st.complete ? "Loaded & checked ✓" : st.loaded || st.part ? "Part loaded" : "Not started"}</Chip>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#5a6a85", marginTop: 2 }}>{r.driver}{r.runNo ? " · Run " + r.runNo : ""} · {r.jobs.length} drop{r.jobs.length === 1 ? "" : "s"}{r.pickups.length ? " · " + r.pickups.length + " pick-up" + (r.pickups.length === 1 ? "" : "s") : ""}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#8593a8", marginTop: 6 }}>
                {(st.complete || st.submitted) && rep && rep.completedAt ? "Loaded by " + shortName(rep.completedBy) + " at " + hm(rep.completedAt) + (rep.checkedBy ? " · checked by " + shortName(rep.checkedBy) : st.submitted ? " · not checked yet" : "") + ((rep.photoPaths || []).length ? " · " + rep.photoPaths.length + " photo" + (rep.photoPaths.length === 1 ? "" : "s") : "")
                  : st.loaded + " of " + st.total + " lines on" + (st.part ? " · " + st.part + " part" : "") + (st.allocated ? " · " + st.allocated + " on pick-ups" : "")}
              </div>
              {(short > 0 || (st.submitted && (rep.shortLines || []).length > 0)) && <div style={{ fontSize: 12.5, fontWeight: 800, color: RED, marginTop: 4 }}>⚠ {(rep.shortLines || []).length} line{(rep.shortLines || []).length === 1 ? "" : "s"} missing — see Delivery issues</div>}
              {!st.complete && !st.submitted && rep && rep.sentBack && <div style={{ fontSize: 12.5, fontWeight: 800, color: RED, marginTop: 4 }}>↩ Sent back: {rep.sentBack}</div>}
              {!st.complete && st.unscheduled > 0 && <div style={{ fontSize: 12.5, fontWeight: 800, color: RED, marginTop: 4 }}>{st.unscheduled} line{st.unscheduled === 1 ? "" : "s"} on a pick-up with no date / driver</div>}
              {!st.complete && st.total > 0 && <div style={{ height: 6, background: "#eef1f6", borderRadius: 4, marginTop: 8, overflow: "hidden" }}><div style={{ height: "100%", width: (100 * (st.loaded + st.allocated) / st.total) + "%", background: GOLD }} /></div>}
            </button>
          );
        })}
      </div>

      {cur && <RunReport run={cur} data={data} me={me} canEdit={canEdit} canManage={canManage} onClose={() => setOpenKey(null)} onChanged={() => setN((x) => x + 1)}
        setBoxCount={(invId, b) => setBoxes(cur, invId, b, me).then((row) => setData((d) => ({ ...d, counts: { ...d.counts, [cur.key]: { ...(d.counts[cur.key] || {}), [boxKey(invId)]: row } } })))}
        setCount={(item, q) => setLoaded(cur, item, q, me, { boxed: !!((data && data.counts[cur.key] || {})[item.key] || {}).boxed }).then((row) => setData((d) => ({ ...d, counts: { ...d.counts, [cur.key]: { ...(d.counts[cur.key] || {}), [item.key]: row } } })))}
        openInvoice={openInvoice} openCollection={openCollection} />}
    </div>
  );
}

function RunReport({ run, data, me, canEdit, canManage, onClose, onChanged, setCount, setBoxCount, openInvoice, openCollection }) {
  const counts = (data && data.counts[run.key]) || {};
  const rep = data && data.reports[run.key];
  const st = loadState(run, counts, rep);
  const locked = (st.complete || st.submitted) && run.lines.length > 0;
  const [edit, setEdit] = useState({});
  const [closing, setClosing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [photos, setPhotos] = useState({});
  useEffect(() => { (rep && rep.photoPaths || []).forEach((p) => loadPhotoUrl(p).then((u) => setPhotos((m) => ({ ...m, [p]: u }))).catch(() => {})); }, [rep && rep.completedAt]);
  const act = async (fn) => { setBusy(true); setMsg(""); try { await fn(); onChanged(); } catch (e) { setMsg(String((e && e.message) || e)); } setBusy(false); };
  return (
    <Modal title={<span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>Loading report · {run.van || "No van"} <Chip>{run.driver}{run.runNo ? " · Run " + run.runNo : ""}</Chip>{st.complete ? <Chip tone="green">Checked</Chip> : st.submitted ? <Chip tone="blue">Waiting for a check</Chip> : <Chip tone="amber">Open</Chip>}</span>} onClose={onClose} width={980} z={80}>
      {locked && rep && (
        <div style={{ background: st.submitted ? "#eef5fd" : "#f1faf4", border: "1px solid " + (st.submitted ? "#c6dcf3" : "#bfe3ca"), borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
          <div style={{ color: st.submitted ? BLUE : GREEN, fontWeight: 800, fontSize: 14 }}>{st.submitted ? "Loaded by " + shortName(rep.completedBy) + " · " + prettyDateTime(rep.completedAt) + " — waiting for someone else to double-check the van" : "✓ Loaded by " + shortName(rep.completedBy) + " · " + prettyDateTime(rep.completedAt) + (rep.checkedBy ? " — double-checked by " + shortName(rep.checkedBy) + " · " + prettyDateTime(rep.checkedAt) : "")}</div>
          {(rep.shortLines || []).length > 0 && (
            <div style={{ marginTop: 6, color: RED, fontWeight: 800, fontSize: 13 }}>⚠ Went out short: {rep.shortLines.map((m) => m.missing + "× " + m.text + " (#" + m.invNo + ")").join(", ")}{rep.resolvedAt ? " · sorted" + (rep.resolution ? " — " + rep.resolution : "") : " · live on Delivery issues"}</div>
          )}
          {rep.notes && <div style={{ fontSize: 13, fontWeight: 600, color: "#5a6a85", marginTop: 3 }}>{rep.notes}</div>}
          {(rep.photoPaths || []).length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {rep.photoPaths.map((p) => <a key={p} href={photos[p]} target="_blank" rel="noopener noreferrer" style={{ width: 90, height: 90, borderRadius: 8, overflow: "hidden", border: "1px solid #d5e8db", background: "#fff", display: "block" }}>{photos[p] && <img src={photos[p]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}</a>)}
            </div>
          )}
        </div>
      )}
      <div style={{ maxHeight: "56vh", overflowY: "auto", border: "1px solid #eef1f6", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "#8593a8", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", textAlign: "left", background: "#f8f9fb", position: "sticky", top: 0 }}>
              {["Drop", "Job", "Item", "Needed", "On the van", "Status", "Counted by"].map((h, k) => <th key={h} style={{ padding: "9px 10px", fontWeight: 700, textAlign: k === 3 || k === 4 ? "right" : "left" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {run.lines.length === 0 && <tr><td colSpan={7} style={{ padding: 18, textAlign: "center", color: "#8593a8", fontWeight: 600 }}>Nothing to load on this run.</td></tr>}
            {run.lines.map((x) => {
              const c = counts[x.key], got = c ? c.qtyLoaded : 0;
              const full = got >= x.qty;
              return (
                <tr key={x.key} style={{ borderTop: "1px solid #f0f2f6" }}>
                  <td style={td}>{x.inv.dropNo || "—"}</td>
                  <td style={td}><button className="dk-title-link" onClick={() => openInvoice(x.inv.id)} style={{ fontWeight: 700, color: NAVY }}>{x.customer}</button> <span style={{ color: "#8593a8", fontSize: 12 }}>#{x.inv.invNo}</span></td>
                  <td style={td}>{x.line.description || x.line.code}{x.line.colour ? <span style={{ color: "#5a6a85" }}> · {x.line.colour}</span> : null}{c && c.boxed ? <span style={{ color: "#8a5a00", fontWeight: 700, fontSize: 12 }}> · 📦 in box</span> : null}</td>
                  <td style={tdR}>{x.qty}</td>
                  <td style={tdR}>
                    {x.src ? <span style={{ color: "#aab3c2" }}>—</span>
                      : !locked && canEdit ? (
                        <input inputMode="numeric" value={edit[x.key] !== undefined ? edit[x.key] : c ? String(got) : ""} placeholder="0"
                          onChange={(e) => setEdit((m) => ({ ...m, [x.key]: e.target.value.replace(/[^\d]/g, "") }))}
                          onBlur={() => { const v = edit[x.key]; if (v === undefined) return; const q = Math.min(x.qty, Number(v) || 0); setEdit((m) => { const n = { ...m }; delete n[x.key]; return n; }); if (v !== "" && (!c || q !== got)) setCount(x, q).catch((e) => setMsg(String(e.message || e))); }}
                          style={{ ...inp, width: 70, textAlign: "right", padding: "5px 8px" }} />
                      ) : <b>{got}</b>}
                  </td>
                  <td style={td}>
                    {x.src ? (x.src.scheduled
                      ? <button className="dk-title-link" onClick={() => openCollection(x.src.col.id)} style={{ color: BLUE, fontWeight: 700, fontSize: 12.5 }}>On pick-up COL-{x.src.col.collectionNo}{x.src.col.collected ? " · collected" : ""}</button>
                      : <span style={{ color: RED, fontWeight: 800, fontSize: 12.5 }}>COL-{x.src.col.collectionNo} not booked — give it a date & driver</span>)
                      : full ? <Chip tone="green">Loaded</Chip> : got > 0 ? <Chip tone="amber">{x.qty - got} to go</Chip> : <Chip>Not loaded</Chip>}
                  </td>
                  <td style={{ ...td, color: "#8593a8", fontSize: 12 }}>{c ? String(c.loadedBy || "").split("@")[0] + " " + hm(c.loadedAt) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {run.jobs.some((j) => !j.deliveryCompleted) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "#5a6a85" }}>📦 Accessory boxes:</span>
          {run.jobs.filter((j) => !j.deliveryCompleted).map((j) => {
            const nb = counts[boxKey(j.id)] ? counts[boxKey(j.id)].qtyLoaded : 0;
            const name = (run.lines.find((x) => x.inv.id === j.id) || {}).customer || "#" + j.invNo;
            return (
              <span key={j.id} style={{ display: "inline-flex", gap: 6, alignItems: "center", border: "1px solid #e6e9ef", borderRadius: 8, padding: "3px 8px", fontSize: 12.5, fontWeight: 700 }}>
                {name}
                {!locked && canEdit && <button style={{ ...btn, padding: "1px 8px" }} disabled={nb <= 0} onClick={() => setBoxCount(j.id, nb - 1).catch((e) => setMsg(String(e.message || e)))}>−</button>}
                <b>{nb}</b>
                {!locked && canEdit && <button style={{ ...btn, padding: "1px 8px" }} onClick={() => setBoxCount(j.id, nb + 1).catch((e) => setMsg(String(e.message || e)))}>+</button>}
              </span>
            );
          })}
        </div>
      )}
      {msg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: RED }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
        {!locked && <span style={{ fontSize: 12.5, fontWeight: 700, color: st.ready ? GREEN : "#8593a8" }}>{st.ready ? "Everything's on or booked on a pick-up — ready to close." : [st.todo && st.todo + " not loaded", st.part && st.part + " part loaded", st.unscheduled && st.unscheduled + " pick-up not booked"].filter(Boolean).join(" · ")}</span>}
        <span style={{ flex: 1 }} />
        {canManage && (rep || Object.keys(counts).length > 0) && <button style={{ ...btn, color: RED }} disabled={busy} onClick={() => act(() => clearLoading(run.key))} title="Wipe the counts and the report for this run">Clear loading</button>}
        {locked && canEdit && <button style={{ ...btn, color: RED, borderColor: "#ecc4cb" }} disabled={busy} onClick={() => act(() => reopenReport(run.key))} title="The driver's deliveries lock again until it's submitted and checked again">Reopen report</button>}
        {st.submitted && !canCheck(rep, me) && <span style={{ fontSize: 12.5, fontWeight: 700, color: "#8593a8" }}>You loaded this one — someone else has to check it</span>}
        {st.submitted && canCheck(rep, me) && <button style={{ ...goldBtn, background: BLUE, borderColor: BLUE, color: "#fff" }} onClick={() => setChecking(true)}>👀 Double-check the van</button>}
        {!locked && canEdit && run.lines.length > 0 && <button style={st.ready ? { ...goldBtn, color: NAVY } : { ...btn, color: "#8a5a00", borderColor: "#e7c46a", background: "#fff6dd", fontWeight: 800 }} onClick={() => setClosing(true)}>{st.ready ? "Submit loading report" : "⚠ Submit with items missing"}</button>}
        <button style={btn} onClick={onClose}>Close</button>
      </div>
      {closing && <CloseModal run={run} counts={counts} me={me} onClose={() => setClosing(false)} onDone={() => { setClosing(false); onChanged(); }} />}
      {checking && rep && <CheckModal run={run} counts={counts} rep={rep} me={me} onClose={() => setChecking(false)} onDone={() => { setChecking(false); onChanged(); }} />}
    </Modal>
  );
}

function CloseModal({ run, counts, me, onClose, onDone }) {
  const [got, setGot] = useState({});
  const [files, setFiles] = useState([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const short = shortLinesOf(run, counts);
  const missingAll = new Set(short.filter((m) => !m.loaded).map((m) => m.key));
  const toCheck = run.lines.filter((x) => !missingAll.has(x.key));
  const boxRows = [...new Map(run.lines.map((x) => [x.inv.id, x])).values()].map((x) => ({ key: boxKey(x.inv.id), x, n: counts[boxKey(x.inv.id)] ? counts[boxKey(x.inv.id)].qtyLoaded : 0 })).filter((b) => b.n > 0);
  const reasonOk = !short.length || notes.trim().length >= 3;
  const ok = files.length > 0 && reasonOk;
  return (
    <Modal title={"Submit loading · " + (run.van || run.driver)} onClose={() => !busy && onClose()} width={640} z={90}>
      {short.length > 0 && (
        <div style={{ background: "#fdf3f4", border: "1px solid #f4b9c1", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
          <div style={{ color: RED, fontWeight: 800 }}>⚠ This van is going out short — the office gets an alert to raise a job or post the parts</div>
          {short.map((m) => <div key={m.key} style={{ fontSize: 12.5, fontWeight: 600, marginTop: 3 }}><b>{m.missing}×</b> {m.text}{m.colour ? " · " + m.colour : ""} <span style={{ color: RED }}>· {m.customer} #{m.invNo} · {m.why}</span></div>)}
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, color: "#5a6a85", marginBottom: 8 }}>Add photos of the loaded van. Someone else then double-checks it before the driver's deliveries open.</div>
      <span style={{ ...lbl, marginTop: 12 }}>Photos of the loaded van <span style={{ color: RED, textTransform: "none" }}>— required</span></span>
      <input type="file" accept="image/*" multiple onChange={(e) => setFiles([...files, ...Array.from(e.target.files || [])])} />
      {files.length > 0 && <div style={{ fontSize: 12.5, fontWeight: 700, color: GREEN, marginTop: 4 }}>{files.length} photo{files.length === 1 ? "" : "s"} added</div>}
      <span style={{ ...lbl, marginTop: 12 }}>{short.length ? <>Why is it going out short? <span style={{ color: RED, textTransform: "none" }}>— required</span></> : "Notes"}</span>
      <input style={inp} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={short.length ? "e.g. boards out of stock - due Thursday" : ""} />
      {!ok && <div style={{ fontSize: 12.5, fontWeight: 700, color: "#8593a8", marginTop: 6 }}>{!files.length ? "Add a photo of the loaded van." : "Say why it's going out short."}</div>}
      {msg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: RED }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button style={btn} disabled={busy} onClick={onClose}>Cancel</button>
        <button style={{ ...goldBtn, color: NAVY, opacity: ok ? 1 : 0.45 }} disabled={!ok || busy} onClick={async () => {
          setBusy(true); setMsg("");
          try {
            const blobs = []; for (const f of files) blobs.push(await shrinkPhoto(f));
            const checked = run.lines.map((x) => ({ key: x.key, qty: x.qty, loaded: x.src ? 0 : (counts[x.key] ? counts[x.key].qtyLoaded : 0), boxed: !!(counts[x.key] && counts[x.key].boxed), pickup: x.src ? "COL-" + x.src.col.collectionNo : "", text: x.line.description || x.line.code, job: x.inv.invNo }))
              .concat(boxRows.map((b) => ({ key: b.key, boxes: b.n, text: b.n + " accessory box" + (b.n === 1 ? "" : "es"), job: b.x.inv.invNo })));
            await completeReport(run, { checked, photos: blobs, notes: notes.trim(), who: me, shortLines: short });
            onDone();
          } catch (e) { setMsg("Couldn't close it — " + ((e && e.message) || e)); }
          setBusy(false);
        }}>{busy ? "Submitting…" : short.length ? "⚠ Submit — going out short" : "Submit for double-check"}</button>
      </div>
    </Modal>
  );
}

function CheckModal({ run, counts, rep, me, onClose, onDone }) {
  const [got, setGot] = useState({});
  const [back, setBack] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const short = rep.shortLines || [];
  const missingAll = new Set(short.filter((m) => !m.loaded).map((m) => m.key));
  const toCheck = run.lines.filter((x) => !missingAll.has(x.key));
  const boxRows = [...new Map(run.lines.map((x) => [x.inv.id, x])).values()].map((x) => ({ key: boxKey(x.inv.id), x, n: counts[boxKey(x.inv.id)] ? Number(counts[boxKey(x.inv.id)].qtyLoaded) || 0 : 0 })).filter((b) => b.n > 0);
  const all = toCheck.every((x) => got[x.key]) && boxRows.every((b) => got[b.key]);
  const go = async (fn) => { setBusy(true); setMsg(""); try { await fn(); onDone(); } catch (e) { setMsg("Couldn't save — " + ((e && e.message) || e)); } setBusy(false); };
  const line = (key, body) => (
    <label key={key} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f0f2f6", fontSize: 13.5, cursor: "pointer" }}>
      <input type="checkbox" checked={!!got[key]} onChange={() => setGot((g) => ({ ...g, [key]: !g[key] }))} style={{ width: 18, height: 18 }} />{body}
    </label>
  );
  return (
    <Modal title={"Double-check · " + (run.van || run.driver)} onClose={() => !busy && onClose()} width={640} z={90}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#5a6a85", marginBottom: 8 }}>Loaded by <b>{shortName(rep.completedBy)}</b> at {hm(rep.completedAt)}. Go round the van and tick each line as you see it.</div>
      {short.length > 0 && <div style={{ background: "#fdf3f4", border: "1px solid #f4b9c1", borderRadius: 10, padding: "8px 12px", marginBottom: 8, fontSize: 12.5, fontWeight: 700, color: RED }}>⚠ Going out short: {short.map((m) => m.missing + "× " + m.text).join(", ")}</div>}
      <div style={{ maxHeight: "44vh", overflowY: "auto" }}>
        {toCheck.map((x) => { const pt = short.find((m) => m.key === x.key); return line(x.key, <><b>{pt ? pt.loaded + " of " + x.qty : x.qty}×</b> <span style={{ flex: 1 }}>{x.line.description || x.line.code}{x.line.colour ? " · " + x.line.colour : ""} <span style={{ color: x.src ? BLUE : "#8593a8", fontSize: 12 }}>· {x.customer}{x.src ? " · pick-up COL-" + x.src.col.collectionNo : ""}{counts[x.key] && counts[x.key].boxed ? " · 📦 in box" : ""}</span></span></>); })}
        {boxRows.map((b) => line(b.key, <><b>{b.n}×</b> <span style={{ flex: 1 }}>📦 accessory box{b.n === 1 ? "" : "es"} <span style={{ color: "#8593a8", fontSize: 12 }}>· {b.x.customer}</span></span></>))}
      </div>
      {back !== null && (
        <>
          <span style={{ ...lbl, marginTop: 12 }}>What's wrong? <span style={{ color: RED, textTransform: "none" }}>— required</span></span>
          <input autoFocus style={inp} value={back} onChange={(e) => setBack(e.target.value)} placeholder="e.g. only 18 slatted cladding on, not 20" />
        </>
      )}
      {msg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: RED }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
        {back === null ? <button style={{ ...btn, color: RED, borderColor: "#ecc4cb" }} onClick={() => setBack("")}>✗ Something's wrong — send back</button>
          : <button style={{ ...btn, background: RED, borderColor: RED, color: "#fff", opacity: back.trim().length >= 3 ? 1 : 0.45 }} disabled={back.trim().length < 3 || busy} onClick={() => go(() => reopenReport(run.key, shortName(me) + ": " + back.trim()))}>Send back to the loader</button>}
        <span style={{ flex: 1 }} />
        <button style={btn} disabled={busy} onClick={onClose}>Cancel</button>
        {back === null && <button style={{ ...goldBtn, color: NAVY, opacity: all ? 1 : 0.45 }} disabled={!all || busy} onClick={() => go(() => checkReport(run.key, me))}>{busy ? "Saving…" : "✓ Van checked — it's right"}</button>}
      </div>
    </Modal>
  );
}

const td = { padding: "8px 10px", verticalAlign: "middle" };
const tdR = { ...td, textAlign: "right" };
