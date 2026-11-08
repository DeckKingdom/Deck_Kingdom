// Loading (desktop): every van going out on a day, how far its loading has got, and the loading
// report. Counts can be entered here too; closing still needs the double-check and a photo.
import { useEffect, useMemo, useState } from "react";
import { NAVY, GOLD, RED, prettyDateTime } from "../../lib/core.js";
import { ListHero, HeroStat, Chip, card, sect, lbl, inp, btn, goldBtn, Modal, Icon } from "./ui.jsx";
import { runsOn, loadState } from "../../lib/loading.js";
import { loadLoading, setLoaded, completeReport, reopenReport, clearLoading, loadPhotoUrl } from "../../data/loading.js";
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
        <HeroStat label="Loading closed" value={data ? closed + " / " + runs.length : "…"} tone={data && runs.length && closed === runs.length ? "#8be3a3" : undefined} />
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
          const tone = st.complete ? GREEN : st.unscheduled ? RED : st.loaded || st.part ? "#a06d00" : NAVY;
          return (
            <button key={r.key} onClick={() => setOpenKey(r.key)}
              style={{ ...card, margin: 0, textAlign: "left", fontFamily: "inherit", color: NAVY, cursor: "pointer", borderTop: "5px solid " + tone }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <b style={{ fontSize: 17, flex: 1 }}>{r.van || "No van"}</b>
                <Chip tone={st.complete ? "green" : st.unscheduled ? "red" : st.loaded || st.part ? "amber" : "grey"}>{st.complete ? "Loaded ✓" : st.loaded || st.part ? "Part loaded" : "Not started"}</Chip>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#5a6a85", marginTop: 2 }}>{r.driver}{r.runNo ? " · Run " + r.runNo : ""} · {r.jobs.length} drop{r.jobs.length === 1 ? "" : "s"}{r.pickups.length ? " · " + r.pickups.length + " pick-up" + (r.pickups.length === 1 ? "" : "s") : ""}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#8593a8", marginTop: 6 }}>
                {st.complete && rep && rep.completedAt ? "Closed by " + String(rep.completedBy || "").split("@")[0] + " at " + hm(rep.completedAt) + ((rep.photoPaths || []).length ? " · " + rep.photoPaths.length + " photo" + (rep.photoPaths.length === 1 ? "" : "s") : "")
                  : st.loaded + " of " + st.total + " lines on" + (st.part ? " · " + st.part + " part" : "") + (st.allocated ? " · " + st.allocated + " on pick-ups" : "")}
              </div>
              {st.unscheduled > 0 && <div style={{ fontSize: 12.5, fontWeight: 800, color: RED, marginTop: 4 }}>{st.unscheduled} line{st.unscheduled === 1 ? "" : "s"} on a pick-up with no date / driver</div>}
              {!st.complete && st.total > 0 && <div style={{ height: 6, background: "#eef1f6", borderRadius: 4, marginTop: 8, overflow: "hidden" }}><div style={{ height: "100%", width: (100 * (st.loaded + st.allocated) / st.total) + "%", background: GOLD }} /></div>}
            </button>
          );
        })}
      </div>

      {cur && <RunReport run={cur} data={data} me={me} canEdit={canEdit} canManage={canManage} onClose={() => setOpenKey(null)} onChanged={() => setN((x) => x + 1)}
        setCount={(item, q) => setLoaded(cur, item, q, me).then((row) => setData((d) => ({ ...d, counts: { ...d.counts, [cur.key]: { ...(d.counts[cur.key] || {}), [item.key]: row } } })))}
        openInvoice={openInvoice} openCollection={openCollection} />}
    </div>
  );
}

function RunReport({ run, data, me, canEdit, canManage, onClose, onChanged, setCount, openInvoice, openCollection }) {
  const counts = (data && data.counts[run.key]) || {};
  const rep = data && data.reports[run.key];
  const st = loadState(run, counts, rep);
  const locked = st.complete && run.lines.length > 0;
  const [edit, setEdit] = useState({});
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [photos, setPhotos] = useState({});
  useEffect(() => { (rep && rep.photoPaths || []).forEach((p) => loadPhotoUrl(p).then((u) => setPhotos((m) => ({ ...m, [p]: u }))).catch(() => {})); }, [rep && rep.completedAt]);
  const act = async (fn) => { setBusy(true); setMsg(""); try { await fn(); onChanged(); } catch (e) { setMsg(String((e && e.message) || e)); } setBusy(false); };
  return (
    <Modal title={<span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>Loading report · {run.van || "No van"} <Chip>{run.driver}{run.runNo ? " · Run " + run.runNo : ""}</Chip>{st.complete ? <Chip tone="green">Closed</Chip> : <Chip tone="amber">Open</Chip>}</span>} onClose={onClose} width={980} z={80}>
      {locked && rep && (
        <div style={{ background: "#f1faf4", border: "1px solid #bfe3ca", borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
          <div style={{ color: GREEN, fontWeight: 800, fontSize: 14 }}>✓ Loaded and double-checked by {String(rep.completedBy || "").split("@")[0]} · {prettyDateTime(rep.completedAt)}</div>
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
                  <td style={td}>{x.line.description || x.line.code}{x.line.colour ? <span style={{ color: "#5a6a85" }}> · {x.line.colour}</span> : null}</td>
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
      {msg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: RED }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
        {!locked && <span style={{ fontSize: 12.5, fontWeight: 700, color: st.ready ? GREEN : "#8593a8" }}>{st.ready ? "Everything's on or booked on a pick-up — ready to close." : [st.todo && st.todo + " not loaded", st.part && st.part + " part loaded", st.unscheduled && st.unscheduled + " pick-up not booked"].filter(Boolean).join(" · ")}</span>}
        <span style={{ flex: 1 }} />
        {canManage && (rep || Object.keys(counts).length > 0) && <button style={{ ...btn, color: RED }} disabled={busy} onClick={() => act(() => clearLoading(run.key))} title="Wipe the counts and the report for this run">Clear loading</button>}
        {locked && canEdit && <button style={{ ...btn, color: RED, borderColor: "#ecc4cb" }} disabled={busy} onClick={() => act(() => reopenReport(run.key))} title="The driver's deliveries lock again until it's closed again">Reopen report</button>}
        {!locked && canEdit && run.lines.length > 0 && <button style={{ ...goldBtn, color: NAVY, opacity: st.ready ? 1 : 0.45 }} disabled={!st.ready} onClick={() => setClosing(true)}>Double-check & close</button>}
        <button style={btn} onClick={onClose}>Close</button>
      </div>
      {closing && <CloseModal run={run} counts={counts} me={me} onClose={() => setClosing(false)} onDone={() => { setClosing(false); onChanged(); }} />}
    </Modal>
  );
}

function CloseModal({ run, counts, me, onClose, onDone }) {
  const [got, setGot] = useState({});
  const [files, setFiles] = useState([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const all = run.lines.every((x) => got[x.key]);
  const ok = all && files.length > 0;
  return (
    <Modal title={"Double-check · " + (run.van || run.driver)} onClose={() => !busy && onClose()} width={640} z={90}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#5a6a85", marginBottom: 8 }}>Go round the van and tick each line as you see it — then add a photo of the loaded van.</div>
      <div style={{ maxHeight: "44vh", overflowY: "auto" }}>
        {run.lines.map((x) => (
          <label key={x.key} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f0f2f6", fontSize: 13.5, cursor: "pointer" }}>
            <input type="checkbox" checked={!!got[x.key]} onChange={() => setGot((g) => ({ ...g, [x.key]: !g[x.key] }))} style={{ width: 18, height: 18 }} />
            <b>{x.qty}×</b> <span style={{ flex: 1 }}>{x.line.description || x.line.code}{x.line.colour ? " · " + x.line.colour : ""} <span style={{ color: x.src ? BLUE : "#8593a8", fontSize: 12 }}>· {x.customer}{x.src ? " · pick-up COL-" + x.src.col.collectionNo : ""}</span></span>
          </label>
        ))}
      </div>
      <span style={{ ...lbl, marginTop: 12 }}>Photos of the loaded van</span>
      <input type="file" accept="image/*" multiple onChange={(e) => setFiles([...files, ...Array.from(e.target.files || [])])} />
      {files.length > 0 && <div style={{ fontSize: 12.5, fontWeight: 700, color: GREEN, marginTop: 4 }}>{files.length} photo{files.length === 1 ? "" : "s"} added</div>}
      <span style={{ ...lbl, marginTop: 12 }}>Notes</span>
      <input style={inp} value={notes} onChange={(e) => setNotes(e.target.value)} />
      {msg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: RED }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button style={btn} disabled={busy} onClick={onClose}>Cancel</button>
        <button style={{ ...goldBtn, color: NAVY, opacity: ok ? 1 : 0.45 }} disabled={!ok || busy} onClick={async () => {
          setBusy(true); setMsg("");
          try {
            const blobs = []; for (const f of files) blobs.push(await shrinkPhoto(f));
            const checked = run.lines.map((x) => ({ key: x.key, qty: x.qty, loaded: x.src ? 0 : (counts[x.key] ? counts[x.key].qtyLoaded : 0), pickup: x.src ? "COL-" + x.src.col.collectionNo : "", text: x.line.description || x.line.code, job: x.inv.invNo }));
            await completeReport(run, { checked, photos: blobs, notes: notes.trim(), who: me });
            onDone();
          } catch (e) { setMsg("Couldn't close it — " + ((e && e.message) || e)); }
          setBusy(false);
        }}>{busy ? "Closing…" : "Close the loading report"}</button>
      </div>
    </Modal>
  );
}

const td = { padding: "8px 10px", verticalAlign: "middle" };
const tdR = { ...td, textAlign: "right" };
