// Bulk sample jobs shared by the Samples screen and Home:
// print every waiting ticket, and email a follow-up group in one go (Gmail compose,
// customers in Bcc so they don't see each other), then tick them off.
import { today, sampleStatus, sampleEmailSettings } from "../../lib/crmCore.js";
import { printSampleSlips } from "./printDocs.js";

export const SAMPLE_GROUPS = {
  send: "To send",
  first: "Follow-up due",
  second: "2nd follow-up due",
};

export const samplesIn = (crm, status) => (crm.samples || []).filter((x) => sampleStatus(x, crm) === status);

const custOf = (crm) => {
  const by = {};
  (crm.customers || []).forEach((c) => (by[c.id] = c));
  return (smp) => by[smp.customerId];
};

const fill = (text, vals) => String(text || "").replace(/\{(\w+)\}/g, (m, k) => (vals[k] !== undefined ? vals[k] : m));

// emails for a group: who has an address, who doesn't
export const groupEmails = (crm, list) => {
  const cof = custOf(crm);
  const seen = new Set(), to = [], missing = [];
  list.forEach((smp) => {
    const c = cof(smp);
    const e = String((c && c.email) || "").trim().toLowerCase();
    if (e && e.includes("@")) { if (!seen.has(e)) { seen.add(e); to.push(e); } } else missing.push(smp);
  });
  return { to, missing };
};

// one Gmail compose with everyone in Bcc; "{name}" becomes "there" as it's going to several people
export const gmailFollowUp = (crm, list, stage) => {
  const cfg = sampleEmailSettings(crm);
  const t = stage === "second" ? cfg.second : cfg.first;
  const vals = { name: "there", code: cfg.code || "[CODE]", offer: cfg.offer || "" };
  const { to, missing } = groupEmails(crm, list);
  const url = "https://mail.google.com/mail/?view=cm&fs=1&bcc=" + encodeURIComponent(to.join(",")) +
    "&su=" + encodeURIComponent(fill(t.subject, vals)) + "&body=" + encodeURIComponent(fill(t.body, vals));
  return { url, to, missing, needsCode: stage === "second" && !cfg.code };
};

// Print all waiting tickets, then offer to mark them sent
export function printAllToSend(crm, updateCrm, askConfirm, notice) {
  const list = samplesIn(crm, SAMPLE_GROUPS.send);
  if (!list.length) return;
  if (!printSampleSlips(list, custOf(crm))) {
    notice && notice("Printing is blocked here — allow pop-ups for ops.deckkingdom.co.uk and try again.");
    return;
  }
  askConfirm({
    message: "Mark these " + list.length + " sample request" + (list.length === 1 ? "" : "s") + " as sent today (Evri unless already set)?",
    confirmLabel: "Mark as sent",
    action: () =>
      updateCrm((c) => {
        const ids = new Set(list.map((x) => x.id));
        c.samples.forEach((x) => {
          if (!ids.has(x.id) || x.dispatchedDate) return;
          x.dispatchedDate = today();
          if (!x.dispatchMethod) x.dispatchMethod = "Evri";
        });
        return c;
      }),
  });
}

// Email a follow-up group, then offer to tick them off
export function emailFollowUpGroup(crm, updateCrm, askConfirm, stage, notice) {
  const list = samplesIn(crm, stage === "second" ? SAMPLE_GROUPS.second : SAMPLE_GROUPS.first);
  if (!list.length) return;
  const g = gmailFollowUp(crm, list, stage);
  if (g.needsCode) {
    notice && notice("Set the discount code first — Samples → the cog next to + → Follow-up emails.");
    return;
  }
  if (g.to.length) window.open(g.url, "_blank", "noopener");
  const noEmail = g.missing.length ? " " + g.missing.length + " have no email address — call those instead." : "";
  askConfirm({
    message: (g.to.length ? "Gmail is open with " + g.to.length + " customer" + (g.to.length === 1 ? "" : "s") + " in Bcc." : "None of these have an email address.") + noEmail +
      " Once it's sent, mark all " + list.length + " as " + (stage === "second" ? "2nd follow-up done" : "followed up") + " today?",
    confirmLabel: "Mark done",
    action: () =>
      updateCrm((c) => {
        const ids = new Set(list.map((x) => x.id));
        c.samples.forEach((x) => {
          if (!ids.has(x.id)) return;
          if (stage === "second") x.followedUp2Date = today();
          else { x.followedUp = true; x.followedUpDate = today(); }
        });
        return c;
      }),
  });
}
