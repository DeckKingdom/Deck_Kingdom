// Collections: goods picked up from UK suppliers by our vans. A collection
// note prints for the driver, the job shows on the delivery schedule, and
// on return the goods are committed to stock or assigned straight to a job.
import { useState, useMemo } from "react";
import { NAVY, GOLD, RED, prettyDate } from "../../lib/core.js";
import {
  blankCollection, blankCollectionItem, blankMovement, blankPick, nextNumber,
  skuIndex, gbp, VANS, today,
} from "../../lib/crmCore.js";
import { Icon, Chip, Modal, selectAllProps, sect, lbl, card, abtn, inp, btn, goldBtn } from "./ui.jsx";
import { printCollectionNote } from "./printDocs.js";

const navyBtn = { ...btn, background: "transparent", border: "1px solid #3a4f78", color: "#fff" };
const td = { padding: "6px 6px", borderBottom: "1px solid #f0f2f6", fontSize: 13 };

export const collectionStatus = (c) =>
  c.postedAt ? ["Posted to stock", "green"]
  : c.assignedInvoiceId ? ["Assigned to job", "green"]
  : c.collected ? ["Collected", "gold"]
  : c.collectDate ? ["Booked", "grey"]
  : ["Not booked", "red"];

export default function CollectionsScreen({ crm, updateCrm, askConfirm, selId, setSelId, openInvoice, me }) {
  const [search, setSearch] = useState("");
  const [assignPanel, setAssignPanel] = useState(false);
  const [assignQuery, setAssignQuery] = useState("");
  const [notice, setNotice] = useState("");

  const coll = (crm.collections || []).find((c) => c.id === selId) || null;
  const bySku = skuIndex(crm);
  const custById = useMemo(() => Object.fromEntries(crm.customers.map((c) => [c.id, c])), [crm.customers]);

  const setColl = (fn) =>
    updateCrm((c) => {
      const t = c.collections.find((x) => x.id === coll.id);
      if (t) fn(t, c);
      return c;
    });

  const newCollection = () => {
    const n = blankCollection();
    n.collectionNo = nextNumber(crm.collections || [], "collectionNo", crm.numbering.collection);
    n.raisedBy = me || "";
    updateCrm((c) => {
      c.collections.unshift(n);
      c.numbering.collection = (Number(n.collectionNo) || 0) + 1;
      return c;
    });
    setSelId(n.id);
  };

  const removeCollection = (c) =>
    askConfirm({
      message: "Delete collection COL-" + (c.collectionNo || "—") + " from " + (c.supplier || "supplier") + "?",
      confirmLabel: "Delete",
      danger: true,
      action: () => {
        updateCrm((x) => {
          x.collections = x.collections.filter((y) => y.id !== c.id);
          return x;
        });
        setSelId(null);
      },
    });

  const itemsValue = (c) => (c.items || []).reduce((t, it) => t + (Number(it.qty) || 0) * (Number(it.unitCost) || 0), 0);

  const postToStock = () => {
    const matched = (coll.items || []).filter((it) => bySku[(it.sku || "").trim().toLowerCase()]);
    const unmatched = (coll.items || []).filter((it) => !bySku[(it.sku || "").trim().toLowerCase()] && (Number(it.qty) || 0) > 0);
    askConfirm({
      message:
        "Commit COL-" + (coll.collectionNo || "—") + " to stock? " +
        matched.reduce((t, it) => t + (Number(it.qty) || 0), 0) + " pcs across " + matched.length + " SKUs will be added." +
        (unmatched.length ? " Not matched to a master SKU (skipped): " + unmatched.map((u) => u.sku || u.description).join(", ") + "." : ""),
      confirmLabel: "Commit to stock",
      action: () =>
        setColl((t, c) => {
          matched.forEach((it) => {
            const mp = c.masterProducts.find((p) => (p.sku || "").trim().toLowerCase() === (it.sku || "").trim().toLowerCase());
            if (!mp) return;
            const q = Number(it.qty) || 0;
            mp.stock = (mp.stock === "" || mp.stock === null ? 0 : Number(mp.stock)) + q;
            if (it.unitCost !== "" && it.unitCost !== null) mp.costGbp = Number(it.unitCost);
            c.movements.push({ ...blankMovement(), sku: mp.sku, mpId: mp.id, qty: q, unitCost: it.unitCost === "" ? "" : Number(it.unitCost), kind: "collection", ref: "COL-" + (t.collectionNo || ""), actor: me || "" });
          });
          t.postedAt = today();
          t.collected = true;
        }),
    });
  };

  const assignToJob = (invId) => {
    setColl((t, c) => {
      const inv = c.invoices.find((i) => i.id === invId);
      if (!inv) return;
      inv.picks = inv.picks || [];
      (t.items || []).forEach((it) => {
        inv.picks.push({
          ...blankPick(),
          sku: it.sku, description: it.description, colour: it.colour, qty: it.qty,
          batchRef: "COL-" + (t.collectionNo || ""), unitCost: it.unitCost, picked: true,
        });
      });
      t.assignedInvoiceId = invId;
      t.collected = true;
    });
    setAssignPanel(false);
  };

  const tryPrint = () => {
    if (!printCollectionNote(coll)) setNotice("Printing is blocked in the design preview — it works on the live site.");
  };

  // ===== list =====
  if (!coll) {
    const q = search.trim().toLowerCase();
    const sorted = [...(crm.collections || [])].sort((a, b) => (Number(b.collectionNo) || 0) - (Number(a.collectionNo) || 0));
    const rows = q ? sorted.filter((c) => [String(c.collectionNo || ""), c.supplier, c.postcode, c.van].some((v) => String(v || "").toLowerCase().includes(q))) : sorted;
    return (
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "18px 22px" }}>
        <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 320 }}>
            <span style={{ position: "absolute", left: 11, top: 10 }}><Icon name="search" /></span>
            <input style={{ ...inp, paddingLeft: 34 }} placeholder="Search supplier, COL #, postcode…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span style={{ fontSize: 12, color: "#5a6a85", fontWeight: 700 }}>{(crm.collections || []).length} collections</span>
          <span style={{ flex: 1 }} />
          <button style={goldBtn} onClick={newCollection}><Icon name="plus" stroke={NAVY} />New collection</button>
        </div>
        <div style={card}>
          {rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 10px", color: "#5a6a85", fontWeight: 600 }}>
              No collections yet — raise one when a van needs to pick goods up from a UK supplier.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>{["COL #", "Supplier", "Postcode", "Collect", "Van", "Items", "Value £", "Status", ""].map((h, i) => (
                <th key={i} style={{ textAlign: i === 5 || i === 6 ? "right" : "left", fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "8px 7px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {rows.map((c) => {
                  const [label, tone] = collectionStatus(c);
                  return (
                    <tr key={c.id} onClick={() => setSelId(c.id)} style={{ cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f8fb")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <td style={{ ...td, fontWeight: 700, color: "#185FA5" }}>COL-{c.collectionNo || "—"}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{c.supplier || "—"}</td>
                      <td style={td}>{c.postcode}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{c.collectDate ? prettyDate(c.collectDate) + (c.collectTime ? " " + c.collectTime : "") : "—"}</td>
                      <td style={td}>{c.van || "—"}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{(c.items || []).length}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{itemsValue(c) ? itemsValue(c).toLocaleString("en-GB", { minimumFractionDigits: 2 }) : "—"}</td>
                      <td style={td}><Chip tone={tone}>{label}</Chip></td>
                      <td style={{ ...td, textAlign: "right" }}><button style={abtn} onClick={(e) => { e.stopPropagation(); setSelId(c.id); }}><Icon name="pen" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ===== editor =====
  const [statusLabel, statusTone] = collectionStatus(coll);
  const locked = Boolean(coll.postedAt || coll.assignedInvoiceId);
  const assignedInv = crm.invoices.find((i) => i.id === coll.assignedInvoiceId);

  const field = (k, label, props = {}, style = {}) => (
    <div>
      <span style={lbl}>{label}</span>
      <input style={{ ...inp, ...style }} value={coll[k] === null ? "" : coll[k]} {...props} {...selectAllProps}
        onChange={(e) => setColl((t) => (t[k] = e.target.value))} />
    </div>
  );

  const setItem = (iid, k, v) =>
    setColl((t) => {
      const it = t.items.find((y) => y.id === iid);
      if (!it) return;
      it[k] = v;
      if (k === "sku") {
        const mp = bySku[String(v || "").trim().toLowerCase()];
        if (mp) {
          it.description = mp.name;
          if (mp.colour) it.colour = mp.colour;
          if (mp.costGbp !== "" && mp.costGbp !== null) it.unitCost = Number(mp.costGbp);
        }
      }
    });

  const aq = assignQuery.trim().toLowerCase();
  const assignable = crm.invoices
    .filter((i) => !aq || [String(i.invNo || ""), (custById[i.customerId] || {}).name].some((v) => String(v || "").toLowerCase().includes(aq)))
    .slice(0, 12);

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "18px 22px" }}>
      <button style={{ ...btn, marginBottom: 12 }} onClick={() => setSelId(null)}><Icon name="back" stroke={NAVY} />All collections</button>

      {notice && (
        <div style={{ ...card, borderColor: GOLD, background: "#fff8e6", display: "flex", gap: 10, alignItems: "center", fontWeight: 600, fontSize: 13 }}>
          <span style={{ flex: 1 }}>{notice}</span>
          <button style={abtn} onClick={() => setNotice("")}><Icon name="x" /></button>
        </div>
      )}

      <div style={{ background: "linear-gradient(135deg,#0B1F3F 0%,#13294f 100%)", borderRadius: 14, padding: "16px 22px", color: "#fff", marginBottom: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 19 }}>Collection COL-{coll.collectionNo || "—"}</h2>
            <Chip tone={statusTone}>{statusLabel}</Chip>
            {assignedInv && (
              <button onClick={() => openInvoice(assignedInv.id)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, color: GOLD, padding: 0 }}>
                → Invoice #{assignedInv.invNo}
              </button>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: "#aeb9cf", fontWeight: 600, marginTop: 5 }}>
            Raised {prettyDate(coll.date)}{coll.raisedBy ? " by " + coll.raisedBy.split("@")[0] : ""}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={navyBtn} onClick={tryPrint}><Icon name="doc" stroke="#fff" />Collection note</button>
          {!locked && (
            <>
              <button style={{ ...goldBtn }} onClick={postToStock}><Icon name="box" stroke={NAVY} />Commit to stock</button>
              <button style={navyBtn} onClick={() => { setAssignQuery(""); setAssignPanel(true); }}><Icon name="doc" stroke="#fff" />Assign to job</button>
            </>
          )}
          <button style={{ ...navyBtn, border: "1px dashed #3a4f78", color: "#8fa0c0" }} onClick={() => removeCollection(coll)}><Icon name="bin" stroke="#8fa0c0" />Delete</button>
        </div>
      </div>

      <div style={card}>
        <p style={sect}>Supplier &amp; collection</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
          {field("supplier", "Supplier")}
          {field("contact", "Contact")}
          {field("phone", "Phone")}
          {field("address", "Address")}
          {field("town", "Town")}
          {field("postcode", "Postcode")}
          {field("collectDate", "Collect date", { type: "date" })}
          {field("collectTime", "Time", { placeholder: "e.g. 10:00" })}
          <div>
            <span style={lbl}>Van</span>
            <input style={inp} list="dk-vans" value={coll.van} onChange={(e) => setColl((t) => (t.van = e.target.value))} />
            <datalist id="dk-vans">{VANS.map((v) => <option key={v} value={v} />)}</datalist>
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700, marginTop: 12 }}>
          <input type="checkbox" checked={coll.collected} disabled={locked} onChange={(e) => setColl((t) => (t.collected = e.target.checked))} />
          Collected — goods are back at the warehouse
        </label>
      </div>

      <div style={card}>
        <p style={sect}>Items {locked && <Chip tone="grey" style={{ marginLeft: 6 }}>locked — already {coll.postedAt ? "in stock" : "on the job"}</Chip>}</p>
        <datalist id="dk-skus-col">
          {(crm.masterProducts || []).filter((p) => p.active !== false && p.sku).map((p) => (
            <option key={p.id} value={p.sku}>{p.name + (p.colour ? " · " + p.colour : "")}</option>
          ))}
        </datalist>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 620 }}>
            <thead><tr>{["SKU", "Description", "Colour", "Qty", "Unit cost £", "Line £", ""].map((h, i) => (
              <th key={i} style={{ textAlign: i >= 3 && i <= 5 ? "right" : "left", fontSize: 10.5, fontWeight: 700, color: "#8593a8", letterSpacing: 0.4, textTransform: "uppercase", padding: "7px 6px", borderBottom: "2px solid #e6e9ef", whiteSpace: "nowrap" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {(coll.items || []).map((it) => (
                <tr key={it.id}>
                  <td style={{ ...td, width: 150 }}><input style={{ ...inp, fontWeight: 700, fontSize: 12.5 }} list="dk-skus-col" disabled={locked} value={it.sku} onChange={(e) => setItem(it.id, "sku", e.target.value)} /></td>
                  <td style={{ ...td, minWidth: 170 }}><input style={inp} disabled={locked} value={it.description} onChange={(e) => setItem(it.id, "description", e.target.value)} /></td>
                  <td style={{ ...td, width: 110 }}><input style={inp} disabled={locked} value={it.colour} onChange={(e) => setItem(it.id, "colour", e.target.value)} /></td>
                  <td style={{ ...td, width: 66 }}><input style={{ ...inp, textAlign: "right" }} inputMode="decimal" disabled={locked} value={it.qty} onChange={(e) => setItem(it.id, "qty", e.target.value)} /></td>
                  <td style={{ ...td, width: 92 }}><input style={{ ...inp, textAlign: "right" }} inputMode="decimal" disabled={locked} value={it.unitCost} onChange={(e) => setItem(it.id, "unitCost", e.target.value)} /></td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap", width: 86 }}>{((Number(it.qty) || 0) * (Number(it.unitCost) || 0)).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                  <td style={{ ...td, width: 34, textAlign: "right" }}>
                    {!locked && (
                      <button style={{ ...abtn, border: "none" }} title="Remove" onClick={() => setColl((t) => (t.items = t.items.filter((y) => y.id !== it.id)))}>
                        <Icon name="x" stroke={RED} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!locked && (
          <button style={{ ...btn, width: "100%", justifyContent: "center", borderStyle: "dashed", color: "#5a6a85", marginTop: 8 }}
            onClick={() => setColl((t) => t.items.push(blankCollectionItem()))}>
            <Icon name="plus" />Add item
          </button>
        )}
        <div style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "flex-end", marginTop: 12, fontSize: 13.5, fontWeight: 700 }}>
          Purchase value: <span style={{ background: GOLD + "33", border: "1px solid " + GOLD, borderRadius: 8, padding: "4px 12px" }}>{gbp(itemsValue(coll))}</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <span style={lbl}>Notes for the driver</span>
          <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={coll.notes} onChange={(e) => setColl((t) => (t.notes = e.target.value))} />
        </div>
      </div>

      {assignPanel && (
        <Modal title="Assign this collection to a job" onClose={() => setAssignPanel(false)} width={520}>
          <p style={{ fontSize: 13, color: "#5a6a85", fontWeight: 600, marginTop: 0 }}>
            The items go onto the invoice's pick list at their purchase cost (batch COL-{coll.collectionNo || "—"}), so the
            job cost uses what you actually paid. Stock is not changed.
          </p>
          <input style={inp} autoFocus placeholder="Search invoice # or customer…" value={assignQuery} onChange={(e) => setAssignQuery(e.target.value)} />
          <div style={{ border: "1px solid #e6e9ef", borderRadius: 9, marginTop: 8, maxHeight: 260, overflowY: "auto" }}>
            {assignable.map((i) => (
              <button key={i.id} onClick={() => assignToJob(i.id)}
                style={{ display: "block", width: "100%", textAlign: "left", background: "#fff", border: "none", borderBottom: "1px solid #f0f2f6", padding: "9px 12px", fontFamily: "inherit", fontSize: 13.5, cursor: "pointer" }}>
                <b>#{i.invNo || "—"}</b> <span style={{ color: "#5a6a85", fontWeight: 600 }}>{(custById[i.customerId] || {}).name || "no customer"} · {prettyDate(i.date)}</span>
              </button>
            ))}
            {!assignable.length && <div style={{ padding: 12, fontSize: 12.5, fontWeight: 600, color: "#8593a8" }}>No matching invoices.</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
