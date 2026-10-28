// Shared CRM UI: icon set, workflow toggles, chips, field styles.
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
  borderRadius: 7, background: "#fff", color: NAVY, width: "100%", boxSizing: "border-box",
};
export const btn = {
  fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, padding: "9px 14px", borderRadius: 9,
  border: "1px solid #d5d9e0", background: "#fff", color: NAVY, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6,
};
export const goldBtn = { ...btn, background: GOLD, borderColor: GOLD };

export const sect = { fontSize: 11.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.6, textTransform: "uppercase", margin: "0 0 10px" };
export const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 };
export const card = { background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, padding: "16px 18px", marginBottom: 14 };
export const Modal = ({ title, onClose, children, width = 560 }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(11,31,63,0.45)", zIndex: 60, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto" }}
    onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div style={{ background: "#fff", borderRadius: 14, padding: "18px 20px", width: "100%", maxWidth: width, boxShadow: "0 18px 50px rgba(11,31,63,0.35)" }}>
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
