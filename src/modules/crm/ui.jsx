// Shared CRM UI: icon set, workflow toggles, chips, field styles.
import { useState, useMemo, useRef, useEffect } from "react";
import { NAVY, GOLD } from "../../lib/core.js";

const PATHS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5L21 21" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5" /></>,
  phone: <path d="M5 3h4l2 5-2.5 1.5a12 12 0 006 6L16 13l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z" />,
  mob: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  note: <path d="M6 2h9l4 4v16H6zM15 2v4h4M9 12h7M9 16h5" />,
  doc: <path d="M6 2h9l4 4v16H6zM15 2v4h4M9 12h7M9 16h7" />,
  wrench: <path d="M14.7 6.3a4 4 0 00-5.2 5.2L4 17l3 3 5.5-5.5a4 4 0 005.2-5.2l-2.6 2.6-2.4-.6-.6-2.4z" />,
  print: <><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>,
  pen: <path d="M4 20l1-4L17 4l3 3L8 19zM14 7l3 3" />,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="M15 5l-7 7 7 7" />,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4" /></>,
  truck: <><path d="M1 6h13v10H1zM14 10h4l4 4v2h-8z" /><circle cx="6" cy="18.5" r="2" /><circle cx="17" cy="18.5" r="2" /></>,
  box: <path d="M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8" />,
  ready: <><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M9 4h6M9 13l2.5 2.5L16 11" /></>,
  link: <path d="M10 14l4-4M7.5 11.5l-2 2a3.5 3.5 0 105 5l2-2M16.5 12.5l2-2a3.5 3.5 0 10-5-5l-2 2" />,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.8l-5.3 2.8 1.1-5.8-4.3-4.1 5.9-.8z" />,
  cam: <><rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="12" cy="13.5" r="3.5" /><path d="M8.5 7L10 4.5h4L15.5 7" /></>,
  share: <><circle cx="6" cy="12" r="2.5" /><circle cx="17.5" cy="5.5" r="2.5" /><circle cx="17.5" cy="18.5" r="2.5" /><path d="M8.3 10.7l6.9-4M8.3 13.3l6.9 4" /></>,
  leaf: <path d="M5 19C5 9.5 12.5 4.5 20 4.5 20 13 15 19 5 19zM5 19c3-5.5 7-8.5 11-10.5" />,
  pinPlus: <><path d="M9.5 21s-6-5.3-6-9.6a6 6 0 0112 0c0 4.3-6 9.6-6 9.6z" /><circle cx="9.5" cy="11.4" r="2" /><path d="M19 2.5v6M16 5.5h6" /></>,
  docPlus: <><path d="M13 21H5V2h8l4 4v6M13 2v4h4M8 11h6M8 15h3" /><path d="M18 14.5v7M14.5 18h7" /></>,
  warn: <><path d="M12 3.5L22 20.5H2z" /><path d="M12 10v4.5M12 17.6v.1" /></>,
  wa: <><path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1112 20.5a8.4 8.4 0 01-4.2-1.1z" /><path d="M9 8.5c0 3.5 2.5 6.5 6.5 6.5l1-1.5-2-1-1 .8c-1-.5-2-1.5-2.5-2.5l.8-1-1-2z" /></>,
  bin: <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.5 4.5l2 2M17.5 17.5l2 2M19.5 4.5l-2 2M6.5 17.5l-2 2" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  home: <path d="M3 11l9-8 9 8M5 9.5V21h14V9.5M9.5 21v-6h5v6" />,
  grid: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>,
  ship: <><path d="M3 15h18l-2.5 5h-13z" /><path d="M6 15v-5h12v5M12 10V5M12 5h4.5L12 8.5" /></>,
  pound: <><circle cx="12" cy="12" r="9" /><path d="M9 16.5h6.5M9.5 16.5c1.2-1.6 1.3-5.2.6-6.8a2.6 2.6 0 015-1M8.5 12.5h5" /></>,
  flag: <path d="M5 21V4M5 4h13l-2.5 4L18 12H5" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5" /><circle cx="17.5" cy="9" r="2.6" /><path d="M17 14.6c2.6.5 4.5 2.3 4.5 5.4" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  chevleft: <path d="M14.5 6l-6 6 6 6" />,
  chevright: <path d="M9.5 6l6 6-6 6" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
  refresh: <path d="M4 12a8 8 0 0113.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 01-13.7 5.6L4 15M4 20v-5h5" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  tag: <><path d="M3 12V3h9l9 9-8.5 8.5L3 12z" /><circle cx="7.8" cy="7.8" r="1.6" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5M3 18l9 5 9-5" /></>,
  logout: <path d="M9 21H4V3h5M15 16l4-4-4-4M19 12H9" />,
};

export const Icon = ({ name, size = 15, stroke = "#5a6a85", width = 2 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: "block", flex: "none" }}
    fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
    {PATHS[name] || null}
  </svg>
);

// Workflow toggle circle: done = navy fill with gold icon, not done = grey outline.
export const Tg = ({ on, title, icon, onClick, na }) => (
  <button
    type="button"
    title={title + (on ? " ✓" : na ? " — n/a" : " — not yet")}
    onClick={onClick}
    style={{
      width: 30, height: 30, borderRadius: 999, display: "inline-flex", alignItems: "center",
      justifyContent: "center", cursor: onClick ? "pointer" : "default", padding: 0,
      border: "1.5px solid " + (on ? NAVY : na ? GOLD : "#d5d9e0"),
      background: on ? NAVY : na ? GOLD : "#fff",
      flex: "none",
    }}
  >
    <Icon name={icon} stroke={on ? GOLD : na ? NAVY : "#aab3c2"} />
  </button>
);

export const Chip = ({ tone = "grey", children, style }) => {
  const tones = {
    grey: { background: "#f0f2f6", border: "1px solid #e6e9ef", color: "#5a6a85" },
    green: { background: "#3FA55C22", border: "1px solid #bfe3ca", color: "#28713e" },
    amber: { background: "#E8912D22", border: "1px solid #f0d0a8", color: "#a05f10" },
    gold: { background: "#F4B73E33", border: "1px solid #F4B73E", color: "#9a7408" },
    red: { background: "#C8102E18", border: "1px solid #ecc4cb", color: "#C8102E" },
    blue: { background: "#2D6CDF18", border: "1px solid #c3d4f3", color: "#2251a8" },
    navy: { background: "#ffffff18", border: "1px solid #ffffff2e", color: "#cfd6e4" },
  };
  return (
    <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap", ...tones[tone], ...style }}>
      {children}
    </span>
  );
};

export const inp = {
  fontFamily: "inherit", fontSize: 14, padding: "7px 9px", border: "1px solid #d5d9e0",
  borderRadius: 8, background: "#fff", color: NAVY, width: "100%", boxSizing: "border-box",
};
export const btn = {
  fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, padding: "9px 14px", borderRadius: 8,
  border: "1px solid #d5d9e0", background: "#fff", color: NAVY, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6,
};
export const goldBtn = { ...btn, background: GOLD, borderColor: GOLD };

export const sect = { fontSize: 11.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.6, textTransform: "uppercase", margin: "0 0 10px" };
export const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 };
export const card = { background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, padding: "16px 18px", marginBottom: 14 };
// Select-all on entry: clicking into a field highlights its whole contents so
// typing replaces it. The browser re-places the caret on the mouse-up that
// follows focus, so that first mouse-up is swallowed; a second click still
// positions the cursor normally.
export const selectAllProps = {
  // keeps the browser's own autofill/address pop-up off these fields —
  // Chrome ignores "off" for address-shaped fields but honours this token
  autoComplete: "one-time-code",
  spellCheck: false,
  onFocus: (e) => {
    e.target.select();
    e.target.dataset.dkSel = "1";
  },
  onMouseUp: (e) => {
    if (e.currentTarget.dataset.dkSel) {
      delete e.currentTarget.dataset.dkSel;
      e.preventDefault();
    }
  },
};

// FileMaker-style type-ahead from app data (not browser autofill): the list
// only appears once you TYPE, and reduces with each keystroke; just focusing
// or selecting the field shows nothing (ArrowDown opens it on demand).
// Arrow keys highlight, Enter picks (then the modal's Enter-to-next advances),
// clicking picks, blur applies the field's formatter.
export function SuggestInput({ value, onChange, options = [], format, inputStyle, listWidth, cols, ...props }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const inputRef = useRef(null);
  const [rect, setRect] = useState(null);

  // the list is fixed to the viewport so scrollable tables/modals can't clip it
  const syncRect = () => {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
  };

  const optVal = (o) => (typeof o === "string" ? o : o.value);
  const optLabel = (o) => (typeof o === "string" ? o : o.label === undefined ? o.value : o.label);

  const filtered = useMemo(() => {
    const q = String(value || "").trim().toLowerCase();
    if (!q) return options.slice(0, 300);
    const starts = [];
    const contains = [];
    for (const o of options) {
      const lv = optVal(o).toLowerCase();
      const ll = optLabel(o).toLowerCase();
      if (lv.startsWith(q) || ll.startsWith(q)) starts.push(o);
      else if (lv.includes(q) || ll.includes(q)) contains.push(o);
      if (starts.length + contains.length >= 300) break;
    }
    return [...starts, ...contains];
  }, [value, options]);

  const pick = (o) => {
    onChange(optVal(o));
    setOpen(false);
    setHi(-1);
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        style={{ ...inp, ...inputStyle }}
        value={value === null || value === undefined ? "" : value}
        autoComplete="one-time-code"
        spellCheck={false}
        {...props}
        onFocus={(e) => { selectAllProps.onFocus(e); setOpen(false); setHi(-1); syncRect(); }}
        onMouseUp={selectAllProps.onMouseUp}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(-1); syncRect(); }}
        onBlur={(e) => {
          setTimeout(() => setOpen(false), 120);
          if (format) onChange(format(e.target.value));
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); syncRect(); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, -1)); }
          else if (e.key === "Escape") { setOpen(false); setHi(-1); e.stopPropagation(); }
          else if (e.key === "Enter") {
            if (open && hi >= 0 && filtered[hi]) pick(filtered[hi]);
            else setOpen(false);
            // not prevented: the modal's Enter-to-next moves focus on
          }
        }}
      />
      {open && filtered.length > 0 && rect && (
        <div style={(() => {
          const width = Math.min(Math.max(rect.width, listWidth || 460), typeof window !== "undefined" ? window.innerWidth - 16 : 600);
          const left = Math.max(8, Math.min(rect.left, (typeof window !== "undefined" ? window.innerWidth : 1200) - width - 8));
          return { position: "fixed", left, top: rect.bottom + 3, width, zIndex: 90, background: "#fff", border: "1px solid #d5d9e0", borderRadius: 8, maxHeight: cols ? 320 : 218, overflowY: "auto", boxShadow: "0 10px 26px rgba(11,31,63,0.22)" };
        })()}>
          {filtered.map((o, i) => (
            <div key={optVal(o)} onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setHi(i)}
              style={{ padding: "6px 11px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", background: i === hi ? GOLD : i % 2 && o.cells ? "#fafbfc" : "#fff", color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                ...(o.cells && cols ? { display: "grid", gridTemplateColumns: cols, gap: 12, alignItems: "center" } : {}) }}>
              {o.cells && cols
                ? o.cells.map((c, j) => <span key={j} style={{ overflow: "hidden", textOverflow: "ellipsis", ...(c.style || {}) }}>{c.text}</span>)
                : optLabel(o)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Enter moves to the next field (FileMaker style); the last field lands on the
// save button (className "dk-save"), so a second Enter saves.
export const enterToNext = (e) => {
  if (e.key !== "Enter") return;
  const t = e.target;
  if (t.tagName === "TEXTAREA" || t.type === "checkbox" || t.tagName === "BUTTON") return;
  const els = [...e.currentTarget.querySelectorAll("input:not([disabled]):not([type=checkbox]), select:not([disabled]), textarea:not([disabled]), button.dk-save")];
  const i = els.indexOf(t);
  if (i >= 0) {
    e.preventDefault();
    if (els[i + 1]) els[i + 1].focus();
  }
};

export const Modal = ({ title, onClose, children, width = 560, z = 60 }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(11,31,63,0.45)", zIndex: z, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto" }}
    onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div onKeyDown={enterToNext} style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", width: "100%", maxWidth: width, boxShadow: "0 18px 50px rgba(11,31,63,0.35)" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <b style={{ fontSize: 16, color: NAVY }}>{title}</b>
        <span style={{ flex: 1 }} />
        <button onClick={onClose} style={{ ...abtn, border: "none" }} title="Close"><Icon name="x" /></button>
      </div>
      {children}
    </div>
  </div>
);

export const abtn = {
  width: 30, height: 30, borderRadius: 8, border: "1px solid #d5d9e0", background: "#fff",
  display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flex: "none",
};

// ===== list pages: one shared look =====
// Navy banner like the record pages: title, a line of context, the "+" action, and the key numbers.
export const HERO_BG = "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)";
export const ListHero = ({ title, sub, action, children }) => (
  <div style={{ background: HERO_BG, borderRadius: 12, padding: "18px 22px", color: "#fff", marginBottom: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: children ? 14 : 0, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 21 }}>{title}</h2>
        {sub && <div style={{ fontSize: 12.5, color: "#aeb9cf", fontWeight: 600, marginTop: 3 }}>{sub}</div>}
      </div>
      <span style={{ flex: 1 }} />
      {action}
    </div>
    {children && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{children}</div>}
  </div>
);
export const heroTile = { flex: "1 1 160px", minWidth: 150, background: "#ffffff1c", border: "1px solid #ffffff30", borderRadius: 12, padding: "11px 14px" };
export const heroLab = { fontSize: 10.5, fontWeight: 700, color: "#aeb9cf", letterSpacing: 0.5, textTransform: "uppercase" };
export const heroSub = { fontSize: 11.5, fontWeight: 600, color: "#aeb9cf", marginTop: 2 };
export const HeroStat = ({ label, value, sub, tone, onClick, style, children }) => {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} style={{ ...heroTile, textAlign: "left", fontFamily: "inherit", color: "#fff", cursor: onClick ? "pointer" : "default", ...style }}>
      <div style={heroLab}>{label}</div>
      {value !== undefined && <div style={{ fontSize: 21, fontWeight: 700, color: tone || GOLD, marginTop: 2 }}>{value}</div>}
      {sub && <div style={heroSub}>{sub}</div>}
      {children}
    </Tag>
  );
};
// the gold "+" in a list banner
export const HeroAdd = ({ title, onClick, disabled }) => (
  <button title={title} onClick={onClick} disabled={disabled}
    style={{ width: 38, height: 38, borderRadius: 8, border: "none", background: GOLD, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, padding: 0, flex: "none" }}>
    <Icon name="plus" stroke={NAVY} size={17} />
  </button>
);
// status filter pills, all the same width
export const FilterPills = ({ options, value, onPick, counts = {}, labels = {}, badge = () => "#E8912D" }) => (
  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
    {options.map((f) => {
      const on = value === f, n = counts[f];
      return (
        <button key={f} onClick={() => onPick(f)}
          style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "6px 11px", minWidth: 112, justifyContent: "center", borderRadius: 999, cursor: "pointer", border: "1px solid " + (on ? NAVY : "#d5d9e0"), background: on ? NAVY : "#fff", color: on ? "#fff" : "#5a6a85", display: "inline-flex", gap: 6, alignItems: "center" }}>
          {labels[f] || f}
          {n ? <span style={{ background: badge(f), color: "#fff", borderRadius: 99, fontSize: 10.5, padding: "0 6px", lineHeight: "16px" }}>{n}</span> : null}
        </button>
      );
    })}
  </div>
);
// search box used at the top of every list card
export const SearchBox = ({ value, onChange, placeholder, width = 340 }) => (
  <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: width }}>
    <span style={{ position: "absolute", left: 11, top: 10 }}><Icon name="search" /></span>
    <input style={{ ...inp, paddingLeft: 34, paddingRight: 34 }} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    {value && <button title="Clear" onClick={() => onChange("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 24, height: 24, borderRadius: 999, border: "none", background: "#eef1f6", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><Icon name="x" size={12} /></button>}
  </div>
);

// red "check this job" marker for risky payments; nothing once someone has checked it
export const RiskChip = ({ inv, style }) => {
  const f = inv && inv.riskFlag;
  if (!f || inv.riskChecked) return null;
  return (
    <span title={(f === "manual" ? "Flagged high risk by hand" : "Payment risk from the website: " + f) + (inv.riskNote ? " — " + inv.riskNote : "") + ". Check before dispatch."}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "#C8102E", color: "#fff", whiteSpace: "nowrap", ...style }}>
      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5L22 20.5H2z" /><path d="M12 10v4.5M12 17.6v.1" /></svg>
      {f === "elevated" ? "Risk" : "High risk"}
    </span>
  );
};

// website refund / cancellation marker on a job
export const WebStatusChip = ({ inv, style }) => {
  const w = (inv && inv.webStatus) || "";
  if (!w) return null;
  const part = w === "partial refund";
  return (
    <span title={part ? "Part refunded on the website — check the delivery" : "Refunded / cancelled on the website — off the schedule and out of sales"}
      style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
        background: part ? "#fdf3dc" : "#eef1f6", color: part ? "#8a5a00" : "#5a6a85", border: "1px solid " + (part ? "#f4d78f" : "#d5d9e0"), ...style }}>
      {part ? "Part refunded" : w === "refunded" ? "Refunded" : "Cancelled"}
    </span>
  );
};

// Placeholder for a feature that's planned but not built yet: a dashed "Soon" pill
// whose hover note says what it will do and what it needs — so it isn't forgotten.
export const Soon = ({ label = "Soon", icon, note, style }) => {
  const [at, setAt] = useState(null);
  return (
    <span onMouseEnter={(e) => setAt(e.currentTarget.getBoundingClientRect())} onMouseLeave={() => setAt(null)}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "1.5px dashed #b8c0cc", borderRadius: 999, padding: "3px 10px", fontSize: 11.5, fontWeight: 700, color: "#8593a8", background: "#f7f9fc", cursor: "help", whiteSpace: "nowrap", ...style }}>
      {icon && <Icon name={icon} stroke="#8593a8" size={12} />}
      {label}
      {label && label !== "Soon" && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".04em", color: "#9a7408", background: "#F4B73E33", borderRadius: 999, padding: "0 6px" }}>SOON</span>}
      {at && (
        <span style={{ position: "fixed", left: Math.max(8, Math.min(at.left, window.innerWidth - 330)), top: at.top > 160 ? undefined : at.bottom + 6, bottom: at.top > 160 ? window.innerHeight - at.top + 6 : undefined,
          zIndex: 120, width: 310, whiteSpace: "normal", background: NAVY, color: "#fff", borderRadius: 12, padding: "9px 12px", fontSize: 12, fontWeight: 600, lineHeight: 1.45, boxShadow: "0 10px 30px rgba(11,31,63,.3)", pointerEvents: "none", textAlign: "left" }}>
          <b style={{ color: "#F4B73E", display: "block", marginBottom: 2 }}>Planned — not built yet</b>{note}
        </span>
      )}
    </span>
  );
};

// true on phone-width screens (and updates when the window is resized)
export const usePhone = (max = 760) => {
  const q = "(max-width: " + max + "px)";
  const [on, setOn] = useState(() => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(q).matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener ? m.addEventListener("change", f) : m.addListener(f);
    return () => (m.removeEventListener ? m.removeEventListener("change", f) : m.removeListener(f));
  }, [q]);
  return on;
};

// ===== date picking (FileMaker-style calendar instead of the browser's own) =====
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
const parseYmd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d.getTime()) ? null : d; };
export const ukDate = (s) => { const d = parseYmd(s); return d ? pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear() : ""; };
// "4/11/26", "04/11/2026", "4.11.2026", "4 11" (this year) -> yyyy-mm-dd
export const parseUkDate = (t) => {
  const m = /^\s*(\d{1,2})[\/.\-\s](\d{1,2})(?:[\/.\-\s](\d{2,4}))?\s*$/.exec(String(t || ""));
  if (!m) return null;
  let y = m[3] ? Number(m[3]) : new Date().getFullYear();
  if (y < 100) y += 2000;
  const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
  return d.getDate() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 ? ymd(d) : null;
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// the calendar itself, floating next to whatever opened it (anchor = getBoundingClientRect())
export function CalendarPop({ value, anchor, onPick, onClose, clear = true }) {
  const sel = parseYmd(value);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [view, setView] = useState(() => { const b = sel || today; return new Date(b.getFullYear(), b.getMonth(), 1); });
  const box = useRef(null);
  useEffect(() => {
    const down = (e) => { if (box.current && !box.current.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down, true);
    document.addEventListener("touchstart", down, true);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down, true); document.removeEventListener("touchstart", down, true); document.removeEventListener("keydown", key); };
  }, [onClose]);
  const W = 252, H = 286;
  const vw = window.innerWidth, vh = window.innerHeight;
  const r = anchor || { left: vw / 2 - W / 2, right: vw / 2 + W / 2, top: vh / 2 - H / 2, bottom: vh / 2 - H / 2 };
  const left = Math.max(8, Math.min(r.left, vw - W - 8));
  const top = r.bottom + 4 + H < vh ? r.bottom + 4 : Math.max(8, r.top - H - 4);
  // 6 weeks, Monday first
  const first = new Date(view);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, k) => { const d = new Date(start); d.setDate(start.getDate() + k); return d; });
  const step = (n) => setView((v) => new Date(v.getFullYear(), v.getMonth() + n, 1));
  const pick = (d) => { onPick(ymd(d)); onClose(); };
  const navB = { width: 28, height: 28, border: "none", background: "transparent", cursor: "pointer", borderRadius: 7, color: NAVY, fontSize: 15, fontWeight: 800, padding: 0, fontFamily: "inherit" };
  return (
    <div ref={box} onMouseDown={(e) => e.stopPropagation()}
      style={{ position: "fixed", left, top, width: W, zIndex: 400, background: "#fff", border: "1px solid #d5d9e0", borderRadius: 12, boxShadow: "0 12px 32px rgba(11,31,63,.25)", padding: "8px 10px 10px", fontFamily: "Quicksand, sans-serif", color: NAVY, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
        <button type="button" style={navB} onClick={() => step(-1)} title="Previous month">◀</button>
        <b style={{ flex: 1, textAlign: "center", fontSize: 14 }}>{MONTHS[view.getMonth()]} {view.getFullYear()}</b>
        <button type="button" style={navB} onClick={() => step(1)} title="Next month">▶</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, textAlign: "center" }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d} style={{ fontSize: 11, fontWeight: 700, color: "#8593a8", padding: "3px 0" }}>{d}</span>
        ))}
        {days.map((d) => {
          const other = d.getMonth() !== view.getMonth();
          const isSel = sel && d.getTime() === sel.getTime();
          const isToday = d.getTime() === today.getTime();
          return (
            <button key={d.getTime()} type="button" onClick={() => pick(d)}
              style={{ height: 30, border: isToday && !isSel ? "1.5px solid " + NAVY : "1.5px solid transparent", borderRadius: 7, cursor: "pointer", padding: 0, fontFamily: "inherit",
                fontSize: 13, fontWeight: isSel || isToday ? 800 : 600, background: isSel ? GOLD : "transparent", color: isSel ? NAVY : other ? "#b8c0cc" : NAVY }}
              onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#eef1f6"; }} onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, borderTop: "1px solid #eef0f4", paddingTop: 7 }}>
        <button type="button" onClick={() => pick(today)} style={{ ...navB, width: "auto", fontSize: 12.5, fontWeight: 700, padding: "0 6px", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 12, border: "1.5px solid " + NAVY, borderRadius: 3, display: "inline-block" }} />Today: {pad2(today.getDate())}/{pad2(today.getMonth() + 1)}/{today.getFullYear()}
        </button>
        <span style={{ flex: 1 }} />
        {clear && value && <button type="button" onClick={() => { onPick(""); onClose(); }} style={{ ...navB, width: "auto", fontSize: 12.5, fontWeight: 700, color: "#8593a8", padding: "0 6px" }}>Clear</button>}
      </div>
    </div>
  );
}

// drop-in for <input type="date">: same value (yyyy-mm-dd) and onChange(e) with e.target.value,
// shows dd/mm/yyyy, opens the calendar when clicked, and you can still type a date
export function DateInput({ value, onChange, style, disabled, title, placeholder = "dd/mm/yyyy", clear = true }) {
  const [open, setOpen] = useState(null); // anchor rect
  const [text, setText] = useState(null); // while typing
  const wrap = useRef(null);
  const emit = (v) => onChange && onChange({ target: { value: v }, currentTarget: { value: v } });
  const commit = () => {
    if (text === null) return;
    const t = text.trim();
    if (!t) emit("");
    else { const v = parseUkDate(t); if (v) emit(v); }
    setText(null);
  };
  const st = style || {};
  return (
    <span ref={wrap} style={{ position: "relative", display: st.width === "100%" || !st.width ? "block" : "inline-block", width: st.width, maxWidth: st.maxWidth, flex: st.flex }}>
      <input type="text" inputMode="numeric" value={text !== null ? text : ukDate(value)} placeholder={placeholder} disabled={disabled} title={title}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => !disabled && wrap.current && setOpen(wrap.current.getBoundingClientRect())}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { commit(); setOpen(null); e.currentTarget.blur(); } if (e.key === "Escape") { setText(null); setOpen(null); } }}
        style={{ ...st, width: "100%", boxSizing: "border-box", paddingRight: Number(st.fontSize) && Number(st.fontSize) < 12.5 ? 24 : 30, cursor: disabled ? "default" : "text" }} />
      <span onMouseDown={(e) => { e.preventDefault(); if (!disabled && wrap.current) setOpen((o) => (o ? null : wrap.current.getBoundingClientRect())); }}
        style={{ position: "absolute", right: Number(st.fontSize) && Number(st.fontSize) < 12.5 ? 5 : 8, top: "50%", transform: "translateY(-50%)", display: "inline-flex", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1 }}>
        <Icon name="cal" size={Number(st.fontSize) && Number(st.fontSize) < 12.5 ? 13 : 15} stroke={NAVY} />
      </span>
      {open && !disabled && <CalendarPop value={value} anchor={open} clear={clear} onPick={(v) => { setText(null); emit(v); }} onClose={() => setOpen(null)} />}
    </span>
  );
}
