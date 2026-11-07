// Collapsible side navigation: grouped links to every layout, with the
// account / backup actions in the footer. The whole bar collapses to an
// icon rail, and each section can be shut or expanded on its own.
import { useState, useEffect } from "react";
import { NAVY, GOLD } from "../lib/core.js";
import { Icon } from "./crm/ui.jsx";

export const NAV_SECTIONS = [
  // 4th value true = a "+" next to the link that creates a new record
  { title: "", items: [["home", "Home", "home"], ["customers", "Customers", "users", true]] },
  {
    title: "Sales",
    items: [
      ["invoices", "Invoices", "doc", true],
      ["quotes", "Quotes", "tag", true],
      ["samples", "Samples", "leaf", true],
    ],
  },
  { title: "", items: [["schedule", "Delivery Schedule", "cal"], ["issues", "Delivery issues", "warn"]] },
  {
    title: "Purchasing",
    items: [
      ["collections", "Collections", "truck", true],
      ["suppliers", "Suppliers", "box", true],
      ["purchases", "Purchases", "pound", true],
    ],
  },
  {
    title: "Imports",
    items: [
      ["overview", "Overview", "grid", "shipment"],
      ["landed", "Landed Costs", "pound"],
      ["completion", "Completion", "flag"],
    ],
  },
  {
    title: "Stock",
    items: [
      ["stock", "Stock", "layers"],
      ["products", "Products", "box"],
    ],
  },
  { title: "Fleet", items: [["vans", "Vans", "truck", true], ["tracking", "Driver tracking", "pin"], ["completions", "Completions", "flag"]] },
  { title: "System", items: [["activity", "Activity", "clock"], ["users", "Users & access", "lock"]] },
];

export const TAB_LABELS = { ...Object.fromEntries(NAV_SECTIONS.flatMap((s) => s.items.map(([t, l]) => [t, l]))), shipments: "Shipment", tasks: "Tasks" };

// canNew(t): optional — whether this login can add that kind of record (some need a manager)
export default function Sidebar({ tab, setTab, open, footer, onNew, canNew, onToggle, allow, phone, badges = {} }) {
  const ok = allow || (() => true);
  const sections = NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter(([t]) => ok(t)) })).filter((s) => s.items.length);
  const [shut, setShut] = useState({});

  // never leave the active screen hidden inside a shut section
  useEffect(() => {
    const sec = sections.find((s) => s.title && s.items.some(([t]) => t === tab));
    if (sec && shut[sec.title]) setShut((x) => ({ ...x, [sec.title]: false }));
  }, [tab]);

  // phones: the menu is a drawer over the page, opened from the header's menu button
  if (phone && !open) return null;
  return (
    <>
    {phone && <div className="no-print" onClick={onToggle} style={{ position: "fixed", inset: 0, background: "rgba(11,31,63,.45)", zIndex: 59 }} />}
    <aside
      className="no-print"
      style={{
        width: phone ? 264 : open ? 218 : 62,
        maxWidth: phone ? "82vw" : undefined,
        flex: "none",
        background: NAVY,
        position: phone ? "fixed" : "sticky",
        left: 0,
        top: 0,
        height: phone ? "100dvh" : "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "width .18s ease",
        boxShadow: "2px 0 8px rgba(11,31,63,0.25)",
        zIndex: phone ? 60 : 26,
      }}
    >
      <div style={{ padding: open ? "16px 10px 10px 14px" : "16px 10px 10px", display: "flex", alignItems: "center", gap: 9, justifyContent: open ? "flex-start" : "center" }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: NAVY, fontSize: 17, flex: "none" }}>
          DK
        </div>
        {open && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.15, whiteSpace: "nowrap" }}>Deck Kingdom</div>
            {/* the menu button sits on the "Ops" line so it never covers the name */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 20 }}>
              <span style={{ color: GOLD, fontSize: 12, fontWeight: 700 }}>Ops</span>
              {onToggle && (
                <button onClick={onToggle} title={phone ? "Close the menu" : "Collapse the menu"}
                  style={{ width: 26, height: 20, borderRadius: 6, border: "1px solid #33466b", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flex: "none" }}>
                  <Icon name="menu" size={13} stroke="#cfd6e4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {!open && onToggle && (
        <button onClick={onToggle} title="Expand the menu"
          style={{ width: 36, height: 30, margin: "0 auto 4px", borderRadius: 8, border: "1px solid #33466b", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flex: "none" }}>
          <Icon name="menu" size={16} stroke="#cfd6e4" />
        </button>
      )}

      <nav style={{ padding: "4px 10px", flex: 1 }}>
        {sections.map((sec, si) => (
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
            {open && sec.title && shut[sec.title] ? null : sec.items.map(([t, label, icon, canAdd]) => {
              // a shipment is opened from the Overview, so Overview stays lit
              const on = tab === t || (t === "overview" && tab === "shipments");
              return (
                <div key={t} style={{ position: "relative" }}>
                <button
                  onClick={() => setTab(t)}
                  title={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    width: "100%",
                    padding: open ? "9px 11px" : "9px 0",
                    justifyContent: open ? "flex-start" : "center",
                    borderRadius: 8,
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
                  <span style={{ position: "relative", display: "inline-flex" }}>
                    <Icon name={icon} size={17} stroke={on ? NAVY : "#8fa0c0"} />
                    {!open && badges[t] > 0 && <span style={{ position: "absolute", top: -4, right: -6, width: 9, height: 9, borderRadius: 99, background: "#e5394f", border: "2px solid " + NAVY }} />}
                  </span>
                  {open && <span style={{ whiteSpace: "nowrap" }}>{label}</span>}
                  {open && badges[t] > 0 && <span title={badges[t] + " live"} style={{ marginLeft: "auto", minWidth: 20, height: 20, padding: "0 6px", borderRadius: 99, background: "#e5394f", color: "#fff", fontSize: 11.5, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{badges[t]}</span>}
                </button>
                {open && canAdd && onNew && (!canNew || canNew(t)) && (
                  <button
                    onClick={() => onNew(t)}
                    title={"New " + (typeof canAdd === "string" ? canAdd : label.replace(/s$/, "").toLowerCase())}
                    style={{
                      position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                      width: 24, height: 24, borderRadius: 8, padding: 0, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "1px solid " + (on ? NAVY : "#3a4f78"), background: on ? "#ffffff55" : "transparent",
                    }}
                  >
                    <Icon name="plus" size={13} stroke={on ? NAVY : GOLD} width={2.6} />
                  </button>
                )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      <div style={{ padding: "10px 10px 14px", borderTop: "1px solid #24375f" }}>{footer(open)}</div>
    </aside>
    </>
  );
}
