// Turn printable paperwork (HTML) into a PDF file, and hand it to WhatsApp.
// The PDF libraries load only when first used, so they don't slow the app down.

const A4_PX = 794; // A4 width at 96dpi

export async function htmlToPdfFile(html, fileName) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]).catch(() => {
    // the chunk from the build this tab loaded is gone (ops was updated since)
    throw new Error("ops has been updated since this page loaded — refresh the page and try again");
  });
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: A4_PX + "px", height: "1200px", border: "0" });
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    doc.open();
    doc.write(html.replace("</head>", "<style>body{padding:0!important;background:#fff} .pdfpage{width:" + A4_PX + "px;padding:26px 30px;box-sizing:border-box;background:#fff}</style></head>"));
    doc.close();
    await new Promise((r) => setTimeout(r, 150));
    if (doc.fonts && doc.fonts.ready) await Promise.race([doc.fonts.ready, new Promise((r) => setTimeout(r, 2500))]);
    const pages = [...doc.querySelectorAll(".pdfpage")];
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const W = 210, H = 297;
    let first = true;
    for (const el of pages) {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", windowWidth: A4_PX, useCORS: true, logging: false });
      // one A4 page per paper; anything longer carries on over extra pages
      const pageHpx = Math.floor(canvas.width * (H / W));
      for (let y = 0; y < canvas.height; y += pageHpx) {
        const h = Math.min(pageHpx, canvas.height - y);
        if (h < 40 && y > 0) break; // a sliver of white
        const slice = document.createElement("canvas");
        slice.width = canvas.width; slice.height = h;
        slice.getContext("2d").drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        if (!first) pdf.addPage();
        first = false;
        pdf.addImage(slice.toDataURL("image/jpeg", 0.88), "JPEG", 0, 0, W, (h / canvas.width) * W);
      }
    }
    const blob = pdf.output("blob");
    return new File([blob], fileName, { type: "application/pdf" });
  } finally {
    frame.remove();
  }
}

// Send a file over WhatsApp. Where the device can share files (phones, tablets, Windows with the
// WhatsApp app), the share sheet opens with the PDF attached. Otherwise the PDF is downloaded and
// the driver's chat opens with the message, ready to attach it.
// Returns "shared" | "cancelled" | "downloaded".
export async function shareToWhatsApp(file, text, phone) {
  if (navigator.canShare && navigator.share) {
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return "shared";
      }
    } catch (e) {
      if (e && e.name === "AbortError") return "cancelled";
      // not allowed here (e.g. took too long after the click) — fall back below
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  const chat = document.createElement("a");
  chat.href = "whatsapp://send?" + (phone ? "phone=" + phone + "&" : "") + "text=" + encodeURIComponent(text + "\n\n(" + file.name + " attached)");
  chat.click();
  return "downloaded";
}
