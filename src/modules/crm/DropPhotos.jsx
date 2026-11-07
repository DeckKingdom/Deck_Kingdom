// All the photos a driver took at a drop / pick-up: a big one and thumbnails to switch between.
import { useEffect, useState } from "react";
import { photosOf, dropPhotoUrl } from "../../data/drops.js";

export default function DropPhotos({ conf, height = 340 }) {
  const paths = photosOf(conf);
  const [urls, setUrls] = useState({});
  const [cur, setCur] = useState(0);
  useEffect(() => {
    let live = true;
    paths.forEach((p) => dropPhotoUrl(p).then((u) => live && setUrls((m) => ({ ...m, [p]: u }))).catch(() => live && setUrls((m) => ({ ...m, [p]: "x" }))));
    return () => { live = false; };
  }, [conf.id]);
  if (!paths.length) return <div style={box(160)}><span style={note}>No photo</span></div>;
  const big = urls[paths[Math.min(cur, paths.length - 1)]];
  return (
    <div>
      <div style={box(Math.min(220, height))}>
        {big && big !== "x" ? <a href={big} target="_blank" rel="noopener noreferrer"><img src={big} alt="" style={{ display: "block", maxWidth: "100%", maxHeight: height }} /></a>
          : <span style={note}>{big === "x" ? "Photo not available" : "Loading photo…"}</span>}
      </div>
      {paths.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {paths.map((p, n) => (
            <button key={p} onClick={() => setCur(n)} title={"Photo " + (n + 1)}
              style={{ width: 54, height: 54, padding: 0, borderRadius: 8, overflow: "hidden", cursor: "pointer", border: "2px solid " + (n === cur ? "#185FA5" : "#e6e9ef"), background: "#f3f5f8" }}>
              {urls[p] && urls[p] !== "x" ? <img src={urls[p]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
            </button>
          ))}
          <span style={{ ...note, alignSelf: "center" }}>{paths.length} photos</span>
        </div>
      )}
    </div>
  );
}
const box = (min) => ({ borderRadius: 10, border: "1px solid #e6e9ef", background: "#f8f9fb", minHeight: min, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" });
const note = { fontSize: 12.5, color: "#8593a8", fontWeight: 600 };
