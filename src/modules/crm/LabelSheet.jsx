// Gang Parcel2Go 4x6 courier labels onto A4 sticker sheets — 4 per sheet,
// 99.1 x 139mm (Avery L7169, the stock in the office printer). Pick the
// downloaded label PDFs (any number; every page of each is used) and a new
// tab opens with one A4 PDF, each label scaled into its sticker position.
// Print it at 100% / "Actual size" — any "fit to page" shrink mis-aligns it.
import { useState } from "react";
import { Icon, btn } from "./ui.jsx";

const MM = 72 / 25.4; // pdf points per millimetre
const A4 = { w: 210 * MM, h: 297 * MM };
const LAB = { w: 99.1 * MM, h: 139 * MM };
const MX = (A4.w - 2 * LAB.w) / 2, MY = (A4.h - 2 * LAB.h) / 2;
const SLOTS = [ // top-left, top-right, bottom-left, bottom-right (pdf y runs up)
  { x: MX, y: MY + LAB.h }, { x: MX + LAB.w, y: MY + LAB.h },
  { x: MX, y: MY }, { x: MX + LAB.w, y: MY },
];

export async function buildSheetFromBuffers(buffers) {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  const pages = [];
  for (const b of buffers) {
    const src = await PDFDocument.load(b, { ignoreEncryption: true });
    const embedded = await out.embedPdf(src, src.getPageIndices());
    pages.push(...embedded);
  }
  for (let i = 0; i < pages.length; i += 4) {
    const page = out.addPage([A4.w, A4.h]);
    pages.slice(i, i + 4).forEach((ep, n) => {
      const s = Math.min(LAB.w / ep.width, LAB.h / ep.height);
      const w = ep.width * s, h = ep.height * s;
      page.drawPage(ep, { x: SLOTS[n].x + (LAB.w - w) / 2, y: SLOTS[n].y + (LAB.h - h) / 2, width: w, height: h });
    });
  }
  return out.save();
}

async function buildSheet(files) {
  const bufs = [];
  for (const f of files) bufs.push(await f.arrayBuffer());
  return buildSheetFromBuffers(bufs);
}

const b64buf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;

// base64 label PDFs (from p2g-ship with auto-pay on) -> one A4 sheet,
// straight into the print dialog via a hidden frame; a tab is the fallback
export async function printLabelPdfs(b64s) {
  const bytes = await buildSheetFromBuffers(b64s.map(b64buf));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  await new Promise((done) => {
    let printed = false;
    const fr = document.createElement("iframe");
    fr.style.cssText = "position:fixed;right:0;bottom:0;width:2px;height:2px;border:0;visibility:hidden";
    fr.src = url;
    fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); printed = true; } catch (e) { /* tab below */ } };
    document.body.appendChild(fr); // stays attached — removing it closes the print dialog
    setTimeout(() => { if (!printed) window.open(url, "_blank", "noopener"); done(); }, 2500);
  });
}

export function LabelSheetButton({ style }) {
  const [busy, setBusy] = useState(false);
  const pick = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "application/pdf,.pdf"; input.multiple = true;
    input.onchange = async () => {
      const files = [...(input.files || [])];
      if (!files.length) return;
      setBusy(true);
      try {
        const bytes = await buildSheet(files);
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        const win = window.open(url, "_blank", "noopener");
        if (!win) window.location.assign(url);
      } catch (e) { window.alert("Couldn't build the label sheet: " + ((e && e.message) || e)); }
      setBusy(false);
    };
    input.click();
  };
  return (
    <button style={style || btn} disabled={busy} onClick={pick}
      title={"Pick the 4×6 label PDFs downloaded from Parcel2Go and get one A4 sheet back, 4 labels per page in the 99.1×139mm sticker positions. Print it at 100% (Actual size)."}>
      <Icon name="doc" size={13} />{busy ? "Building…" : "Label sheet"}
    </button>
  );
}
