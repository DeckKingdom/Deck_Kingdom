// Bank statement parsing — Virgin Money business statements (PDF) and generic
// CSV exports — into one transaction shape:
//   { date: "YYYY-MM-DD", description, type, amount (signed: + in, - out), balance, seq }
// Debit vs credit is never read from the column it sits in (PDF columns drift):
// each row's running balance against the previous one decides the sign, which
// also proves the row was read correctly. Pure functions — no DOM, testable in node.

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, "0");
const money = (s) => Number(String(s).replace(/[£,\s]/g, ""));

// "03 Aug 26" / "03 Aug 2026" / "03/08/2026" / "2026-08-03" -> "2026-08-03"
export const parseDate = (s) => {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,4})\s+(\d{2,4})$/);
  if (m && MON[m[2].toLowerCase()]) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return y + "-" + pad(MON[m[2].toLowerCase()]) + "-" + pad(m[1]);
  }
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return y + "-" + pad(m[2]) + "-" + pad(m[1]); }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1] + "-" + m[2] + "-" + m[3] : "";
};

const TYPES = ["Direct Debit", "Standing Order", "Transfer", "Card", "Cash", "Cheque", "Unknown", "Charge", "Interest"];

// ===== PDF: text items with positions (pdf.js getTextContent) -> transactions =====
// pages: [[{ str, x, y }]] — y grows upwards (pdf space)
export function parseStatementItems(pages) {
  const out = [];
  let prevBal = null;
  let seq = 0;
  for (const items of pages) {
    // 1. group items into visual lines by y (2pt tolerance), left to right
    const lines = [];
    [...items].filter((it) => String(it.str || "").trim()).sort((a, z) => z.y - a.y || a.x - z.x).forEach((it) => {
      const l = lines.find((L) => Math.abs(L.y - it.y) <= 2);
      if (l) l.items.push(it); else lines.push({ y: it.y, items: [it] });
    });
    lines.forEach((l) => { l.items.sort((a, z) => a.x - z.x); l.text = l.items.map((i) => i.str.trim()).join(" ").replace(/\s+/g, " ").trim(); });
    // 2. dated rows carry amounts; undated text rows are wrapped description parts
    const dated = [], loose = [];
    lines.forEach((l) => {
      const m = l.text.match(/^(\d{1,2} [A-Za-z]{3,4} \d{2,4})\s+(.*)$/);
      if (m && parseDate(m[1])) dated.push({ y: l.y, date: parseDate(m[1]), rest: m[2], extra: [] });
      else loose.push(l);
    });
    // a wrapped description sits just above or below its row: give each loose line to the nearest dated row
    loose.forEach((l) => {
      if (/£/.test(l.text) || /^(Date|Account|Sort code|Statement|Page|Opening|Closing|Description)\b/i.test(l.text)) return;
      let best = null;
      dated.forEach((d) => { const dy = Math.abs(d.y - l.y); if (dy <= 14 && (!best || dy < best.dy)) best = { d, dy }; });
      if (best) best.d.extra.push({ y: l.y, text: l.text });
    });
    // 3. rows top to bottom
    dated.sort((a, z) => z.y - a.y).forEach((d) => {
      const amts = [...d.rest.matchAll(/£\s?([\d,]+\.\d{2})/g)].map((m) => money(m[1]));
      if (/opening balance/i.test(d.rest)) { if (amts.length) prevBal = amts[amts.length - 1]; return; }
      if (/closing balance/i.test(d.rest) || !amts.length) return;
      const balance = amts[amts.length - 1];
      const amt = amts.length >= 2 ? amts[0] : null;
      let body = d.rest.replace(/£\s?[\d,]+\.\d{2}/g, " ");
      let type = "";
      // the Type column is the last type word on the row ("Card 48, Evri Limited   Card")
      let at = -1;
      for (const t of TYPES) {
        const re = new RegExp("\\b" + t + "\\b", "gi");
        let m; while ((m = re.exec(body))) if (m.index > at) { at = m.index; type = t; }
      }
      if (at >= 0) body = body.slice(0, at) + " " + body.slice(at + type.length);
      const above = d.extra.filter((e) => e.y > d.y).sort((a, z) => z.y - a.y).map((e) => e.text);
      const below = d.extra.filter((e) => e.y < d.y).sort((a, z) => z.y - a.y).map((e) => e.text);
      const description = [...above, body, ...below].join(" ").replace(/\s+/g, " ").trim();
      let signed = null;
      if (amt !== null && prevBal !== null) {
        if (Math.abs(prevBal - amt - balance) < 0.011) signed = -amt;
        else if (Math.abs(prevBal + amt - balance) < 0.011) signed = amt;
      }
      if (signed === null && prevBal !== null) signed = Math.round((balance - prevBal) * 100) / 100; // amount unreadable: trust the balances
      prevBal = balance;
      if (signed === null || !signed) return;
      out.push({ date: d.date, description, type, amount: signed, balance, seq: seq++ });
    });
  }
  return out;
}

// ===== CSV: header names decide the columns =====
const splitCsv = (line) => {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
};
export function parseStatementCsv(text) {
  const rows = String(text || "").split(/\r?\n/).filter((l) => l.trim());
  const hi = rows.findIndex((r) => /date/i.test(r) && /(amount|debit|credit|paid in|paid out|money in|money out)/i.test(r));
  if (hi < 0) throw new Error("Couldn't find a header row with Date and Amount (or Debit/Credit) columns.");
  const H = splitCsv(rows[hi]).map((h) => h.toLowerCase());
  const col = (...res) => H.findIndex((h) => res.some((re) => re.test(h)));
  const cDate = col(/^date$/, /transaction date/, /date/);
  const cDesc = col(/desc/, /details/, /narrative/, /payee/, /reference/, /memo/);
  const cType = col(/^type$/, /transaction type/);
  const cAmt = col(/^amount/, /value/);
  const cOut = col(/debit/, /paid out/, /money out/, /withdraw/);
  const cIn = col(/credit/, /paid in/, /money in/, /deposit/);
  const cBal = col(/balance/);
  const out = [];
  rows.slice(hi + 1).forEach((r, i) => {
    const f = splitCsv(r);
    const date = parseDate(f[cDate]);
    if (!date) return;
    let amount = null;
    if (cAmt >= 0 && f[cAmt] !== "" && f[cAmt] !== undefined) amount = money(f[cAmt]);
    else { const o = cOut >= 0 ? money(f[cOut] || 0) : 0, n = cIn >= 0 ? money(f[cIn] || 0) : 0; amount = (n || 0) - Math.abs(o || 0); }
    if (!isFinite(amount) || !amount) return;
    out.push({ date, description: (cDesc >= 0 ? f[cDesc] : "") || "", type: cType >= 0 ? f[cType] || "" : "", amount: Math.round(amount * 100) / 100, balance: cBal >= 0 && f[cBal] !== "" ? money(f[cBal]) : null, seq: i });
  });
  // exports often list newest first: keep statement order oldest first
  if (out.length > 1 && out[0].date > out[out.length - 1].date) { out.reverse(); out.forEach((t, i) => (t.seq = i)); }
  return out;
}

// stable id: the same transaction from a PDF or a re-import lands on the same row
export async function txId(t) {
  const key = [t.date, t.amount.toFixed(2), t.balance === null || t.balance === undefined ? "" : Number(t.balance).toFixed(2), String(t.description || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 60)].join("|");
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(key));
  return "bt-" + [...new Uint8Array(buf)].slice(0, 10).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// browser: a File -> transactions (pdf.js is loaded only when a PDF arrives)
export async function readStatementFile(file) {
  if (/\.csv$/i.test(file.name) || /csv/.test(file.type)) return parseStatementCsv(await file.text());
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push(tc.items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] })));
  }
  return parseStatementItems(pages);
}
