// Collapsible side navigation: grouped links to every layout, with the
// account / backup actions in the footer. The whole bar collapses to an
// icon rail, and each section can be shut or expanded on its own.
import { useState, useEffect } from "react";
import { NAVY, GOLD } from "../lib/core.js";
import { Icon } from "./crm/ui.jsx";

export const NAV_SECTIONS = [
  { title: "", items: [["home", "Home", "home"]] },
  {
    title: "Sales",
    items: [
      ["customers", "Customers", "users"],
      ["invoices", "Invoices", "doc"],
      ["schedule", "Schedule", "cal"],
    ],
  },
  {
    title: "Imports",
    items: [
      ["overview", "Overview", "grid"],
      ["shipments", "Shipments", "ship"],
      ["landed", "Landed Costs", "pound"],
      ["completion", "Completion", "flag"],
    ],
  },
  {
    title: "Stock & catalogue",
    items: [
      ["stock", "Stock", "layers"],
      ["catalogue", "Master Products", "tag"],
      ["collections", "Collections", "truck"],
      ["products", "Import Products", "box"],
    ],
  },
  { title: "System", items: [["activity", "Activity", "clock"]] },
];

export const TAB_LABELS = Object.fromEntries(NAV_SECTIONS.flatMap((s) => s.items.map(([t, l]) => [t, l])));

export default function Sidebar({ tab, setTab, open, footer }) {
  const [shut, setShut] = useState({});

  // never leave the active screen hidden inside a shut section
  useEffect(() => {
    const sec = NAV_SECTIONS.find((s) => s.title && s.items.some(([t]) => t === tab));
    if (sec && shut[sec.title]) setShut((x) => ({ ...x, [sec.title]: false }));
  }, [tab]);

  return (
    <aside
      className="no-print"
      style={{
        width: open ? 218 : 62,
        flex: "none",
        background: NAVY,
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "width .18s ease",
        boxShadow: "2px 0 8px rgba(11,31,63,0.25)",
        zIndex: 26,
      }}
    >
      <div style={{ padding: open ? "16px 14px 10px" : "16px 10px 10px", display: "flex", alignItems: "center", gap: 10, justifyContent: open ? "flex-start" : "center" }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: NAVY, fontSize: 17, flex: "none" }}>
          DK
        </div>
        {open && (
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 15.5, lineHeight: 1.15, whiteSpace: "nowrap" }}>Deck Kingdom</div>
            <div style={{ color: GOLD, fontSize: 12, fontWeight: 700 }}>Ops</div>
          </div>
        )}
      </div>

      <nav style={{ padding: "4px 10px", flex: 1 }}>
        {NAV_SECTIONS.map((sec, si) => (
          <div key={si} style={{ marginBottom: 6 }}>
            {sec.title &&
              (open ? (
                <button
                  onClick={() => setShut((x) => ({ ...x, [sec.title]: !x[sec.title] }))}
                  title={shut[sec.title] ? "Expand " + sec.title : "Collapse " + sec.title}
                  style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 700, color: "#5f729a", letterSpacing: 1, textTransform: "uppercase", padding: "10px 10px 5px" }}
                >
                  <span style={{ display: "inline-flex", transform: shut[sec.title] ? "none" : "rotate(90deg)", transition: "transform .15s ease" }}>
                    <Icon name="chevright" size={11} stroke="#5f729a" width={3} />
                  </span>
                  {sec.title}
                  {shut[sec.title] && sec.items.some(([t]) => t === tab) && (
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: GOLD, marginLeft: "auto" }} />
                  )}
                </button>
              ) : (
                <div style={{ height: 1, background: "#24375f", margin: "9px 6px" }} />
              ))}
            {open && sec.title && shut[sec.title] ? null : sec.items.map(([t, label, icon]) => {
              const on = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  title={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    width: "100%",
                    padding: open ? "9px 11px" : "9px 0",
                    justifyContent: open ? "flex-start" : "center",
                    borderRadius: 9,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 13.5,
                    fontWeight: 700,
                    background: on ? GOLD : "transparent",
                    color: on ? NAVY : "#cfd6e4",
                    marginBottom: 2,
                  }}
                >
                  <Icon name={icon} size={17} stroke={on ? NAVY : "#8fa0c0"} />
                  {open && <span style={{ whiteSpace: "nowrap" }}>{label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div style={{ padding: "10px 10px 14px", borderTop: "1px solid #24375f" }}>{footer(open)}</div>
    </aside>
  );
}
