// Runs in the office app: when a driver confirms a full drop (or a full supplier pick-up) the job is
// marked delivered (stock taken out as usual) / the pick-up marked collected. Short confirmations
// are left for someone to check on the delivery schedule. Each confirmation is applied once, so
// un-ticking a job afterwards sticks.
import { useEffect, useRef } from "react";
import { loadDrops, dropFull, markApplied } from "../../data/drops.js";
import { applyInvoiceStockDeduction, today } from "../../lib/crmCore.js";
import { addDays } from "../../lib/core.js";

export function useDropSync({ crm, updateCrm, me, enabled }) {
  const crmRef = useRef(crm), updRef = useRef(updateCrm);
  crmRef.current = crm; updRef.current = updateCrm;
  useEffect(() => {
    if (!enabled) return;
    let live = true, busy = false;
    const run = async () => {
      const c0 = crmRef.current;
      if (!c0 || busy) return;
      busy = true;
      try {
        const t = today();
        const dates = [-3, -2, -1, 0, 1].map((n) => addDays(t, n));
        const m = await loadDrops(dates);
        const todo = Object.values(m).filter((r) => !r.appliedAt && dropFull(r));
        if (!live || !todo.length) return;
        const ids = [];
        updRef.current((c) => {
          todo.forEach((r) => {
            if (r.collectionId) {
              const col = (c.collections || []).find((x) => x.id === r.collectionId);
              if (col && !col.collected) col.collected = true;
            } else {
              const inv = (c.invoices || []).find((x) => x.id === r.invoiceId);
              if (inv && !inv.deliveryCompleted) { inv.deliveryCompleted = true; applyInvoiceStockDeduction(inv, c, true, me || r.driver || "driver"); }
            }
            ids.push(r.id);
          });
          return c;
        });
        await markApplied(ids);
      } catch (e) {
        /* table not there yet / offline: try again next time */
      } finally { busy = false; }
    };
    const first = setTimeout(run, 4000);
    const timer = setInterval(run, 90000);
    return () => { live = false; clearTimeout(first); clearInterval(timer); };
  }, [enabled]);
}
