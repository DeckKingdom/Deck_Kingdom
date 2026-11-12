// One person in a record at a time. While a screen shows a record for editing,
// this hook claims its lock and keeps it warm; if someone else already holds it,
// it returns their email (so the screen goes view-only with a banner) and keeps
// checking every few seconds until they leave.
import { useState, useEffect } from "react";
import { claimLock, releaseLock } from "../../data/locks.js";

export function useLock(key) {
  const [holder, setHolder] = useState(""); // someone ELSE's email, or "" when it's ours
  useEffect(() => {
    setHolder("");
    if (!key) return;
    let stop = false, t;
    const tick = async () => {
      const r = await claimLock(key);
      if (stop) return;
      setHolder(r.ok ? "" : r.holder || "someone");
      t = setTimeout(tick, r.ok ? 20_000 : 6_000); // heartbeat our lock, or watch for theirs to free
    };
    tick();
    const bye = () => releaseLock(key);
    window.addEventListener("pagehide", bye);
    return () => { stop = true; clearTimeout(t); window.removeEventListener("pagehide", bye); releaseLock(key); };
  }, [key]);
  return holder;
}
