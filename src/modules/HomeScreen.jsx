// Home: the landing screen — live snapshot of both modules and big
// jump-off tiles into every layout.
import { NAVY, GOLD, RED, addMonths, prettyDate, STATUS_COLOURS } from "../lib/core.js";
import { invoiceTotals, gbp, isPaid, today, stockValuation, daysUntil } from "../lib/crmCore.js";
import { Icon, Chip, card, sect } from "./crm/ui.jsx";

const Tile = ({ icon, label, note, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 11,
      border: "1px solid #e6e9ef", background: "#fff", cursor: "pointer", fontFamily: "inherit",
      textAlign: "left", width: "100%",
    }}
    onMouseEnter={(e) => (e.currentTarget.style.borderColor = GOLD)}
    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e6e9ef")}
  >
    <div style={{ width: 38, height: 38, borderRadius: 10, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
      <Icon name={icon} size={18} stroke={GOLD} />
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 700, fontSize: 14.5, color: NAVY }}>{label}</div>
      <div style={{ fontSize: 12, color: "#5a6a85", fontWeight: 600, marginTop: 1 }}>{note}</div>
    </div>
  </button>
);

const Stat = ({ value, label, tone }) => (
  <div style={{ padding: "10px 16px", textAlign: "center", borderLeft: "1px solid #ffffff22" }}>
    <b style={{ display: "block", fontSize: 17, color: tone || GOLD }}>{value}</b>
    <span style={{ fontSize: 10.5, fontWeight: 700, color: "#aeb9cf", letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</span>
  </div>
);

export default function HomeScreen({ data, crm, setTab, addShipment, newInvoice }) {
  const tod = today();

  // imports snapshot
  const live = data.shipments.filter((s) => s.status !== "Paid");
  const byStatus = {};
  live.forEach((s) => (byStatus[s.status] = (byStatus[s.status] || 0) + 1));
  const inbound = data.shipments
    .filter((s) => ["Confirmed", "In production", "Shipped"].includes(s.status) && s.orderDate)
    .map((s) => ({ s, eta: addMonths(s.orderDate, 3) }))
    .sort((a, b) => a.eta.localeCompare(b.eta));
  const nextIn = inbound[0];

  // sales snapshot
  const invs = crm ? crm.invoices : null;
  const todays = invs ? invs.filter((i) => i.deliveryDate === tod && !i.deliveryCompleted).length : null;
  const pending = invs ? invs.filter((i) => !i.deliveryDate && !i.deliveryCompleted).length : null;
  const awaiting = invs ? invs.filter((i) => !isPaid(i)) : null;
  const owed = awaiting ? awaiting.reduce((t, i) => t + invoiceTotals(i).total, 0) : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";

  return (
    <div style={{ maxWidth: 1140, margin: "0 auto", padding: "18px 22px" }}>
      {/* hero */}
      <div style={{ background: "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", borderRadius: 14, padding: "22px 24px", color: "#fff", marginBottom: 16, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ minWidth: 200 }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>{greeting} — here's where things stand</h2>
          <div style={{ fontSize: 13, color: "#aeb9cf", fontWeight: 600, marginTop: 5 }}>
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", background: "#ffffff14", border: "1px solid #ffffff22", borderRadius: 12, overflow: "hidden" }}>
          <Stat value={todays === null ? "…" : todays} label="Deliveries today" />
          <Stat value={pending === null ? "…" : pending} label="Jobs to book in" tone={pending ? "#f2a6b1" : GOLD} />
          <Stat value={awaiting === null ? "…" : gbp(owed)} label="Awaiting payment" />
          <Stat value={live.length} label="Live shipments" />
        </div>
        <div style={{ display: "flex", gap: 8, flexBasis: "100%", marginTop: 4, flexWrap: "wrap" }}>
          <button onClick={newInvoice} style={{ fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, padding: "9px 14px", borderRadius: 9, border: "1px solid " + GOLD, background: GOLD, color: NAVY, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="plus" stroke={NAVY} />New invoice
          </button>
          <button onClick={addShipment} style={{ fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, padding: "9px 14px", borderRadius: 9, border: "1px solid #3a4f78", background: "transparent", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="plus" stroke="#fff" />New shipment
          </button>
          <button onClick={() => setTab("schedule")} style={{ fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, padding: "9px 14px", borderRadius: 9, border: "1px solid #3a4f78", background: "transparent", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="cal" stroke="#fff" />Today's runs
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        {/* sales */}
        <div style={{ ...card, marginBottom: 0 }}>
          <p style={sect}>Sales &amp; deliveries</p>
          <div style={{ display: "grid", gap: 8 }}>
            <Tile icon="users" label="Customers" note={crm ? crm.customers.length.toLocaleString("en-GB") + " accounts" : "Loading…"} onClick={() => setTab("customers")} />
            <Tile icon="doc" label="Invoices" note={crm ? crm.invoices.length.toLocaleString("en-GB") + " raised" + (awaiting && awaiting.length ? " · " + awaiting.length + " awaiting payment" : "") : "Loading…"} onClick={() => setTab("invoices")} />
            <Tile icon="cal" label="Delivery Schedule" note={crm ? (todays ? todays + " out today" : "Nothing out today") + (pending ? " · " + pending + " to book in" : "") : "Loading…"} onClick={() => setTab("schedule")} />
            <Tile icon="truck" label="Vans" note={crm ? (() => {
              const due = (crm.vans || []).flatMap((v) => [v.insuranceRenewal, v.motDue, v.taxDue].map(daysUntil).filter((d) => d !== null && d <= 30));
              return (crm.vans || []).length + " vans" + (due.length ? " · " + due.length + " renewal" + (due.length > 1 ? "s" : "") + " due soon" : "");
            })() : "Loading…"} onClick={() => setTab("vans")} />
          </div>
        </div>

        {/* imports */}
        <div style={{ ...card, marginBottom: 0 }}>
          <p style={sect}>Imports</p>
          <div style={{ display: "grid", gap: 8 }}>
            <Tile icon="ship" label="Shipments" note={live.length ? live.length + " live — " + Object.entries(byStatus).map(([k, v]) => v + " " + k.toLowerCase()).join(", ") : "No live shipments"} onClick={() => setTab("shipments")} />
            <Tile icon="grid" label="Overview" note={nextIn ? "Next in: " + nextIn.s.name + " ~ " + prettyDate(nextIn.eta) : "All shipment summaries"} onClick={() => setTab("overview")} />
            <Tile icon="pound" label="Landed Costs" note="Cost per piece, landed in GBP" onClick={() => setTab("landed")} />
            <Tile icon="flag" label="Completion" note="Payments, FX and final totals" onClick={() => setTab("completion")} />
          </div>
        </div>

        {/* catalogue */}
        <div style={{ ...card, marginBottom: 0 }}>
          <p style={sect}>Catalogue</p>
          <div style={{ display: "grid", gap: 8 }}>
            <Tile icon="layers" label="Stock" note={crm ? (() => { const v = stockValuation(crm); return v.units.toLocaleString("en-GB") + " units · " + gbp(v.costValue) + " at cost"; })() : "Loading…"} onClick={() => setTab("stock")} />
            <Tile icon="tag" label="Master Products" note={crm ? (crm.masterProducts || []).length.toLocaleString("en-GB") + " SKUs — stock, costs, kits" : "Loading…"} onClick={() => setTab("catalogue")} />
            <Tile icon="truck" label="Collections" note={crm ? ((crm.collections || []).filter((c) => !c.postedAt && !c.assignedInvoiceId).length || "No") + " open supplier pick-ups" : "Loading…"} onClick={() => setTab("collections")} />
            <Tile icon="box" label="Import Products" note={data.products.length + " factory products"} onClick={() => setTab("products")} />
            <Tile icon="clock" label="Activity" note="Who changed what, and when" onClick={() => setTab("activity")} />
          </div>
          {nextIn && (
            <div style={{ marginTop: 12, background: "#f8f9fb", border: "1px solid #e6e9ef", borderRadius: 10, padding: "10px 13px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#8593a8", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>Inbound</div>
              {inbound.slice(0, 3).map(({ s, eta }) => (
                <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, fontWeight: 600, padding: "4px 0" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: STATUS_COLOURS[s.status] || GOLD, flex: "none" }} />
                  <span style={{ fontWeight: 700 }}>{s.name}</span>
                  <span style={{ color: "#5a6a85" }}>{s.status}</span>
                  <span style={{ marginLeft: "auto", color: "#5a6a85" }}>~ {prettyDate(eta)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ height: 30 }} />
    </div>
  );
}
