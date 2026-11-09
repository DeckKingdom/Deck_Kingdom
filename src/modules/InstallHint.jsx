// "Add DK Ops to your home screen" - shown once on phones until it's installed or dismissed.
import { useEffect, useState } from "react";

const KEY = "dk-install-hint";
export const isStandalone = () => {
  try { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch (e) { return false; }
};
let deferred = null;
if (typeof window !== "undefined") window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; });

export default function InstallHint() {
  const [show, setShow] = useState(false);
  const [, bump] = useState(0);
  useEffect(() => {
    let seen = "";
    try { seen = localStorage.getItem(KEY) || ""; } catch (e) { /* */ }
    const phone = window.matchMedia && window.matchMedia("(max-width: 760px)").matches;
    if (phone && !isStandalone() && !seen) {
      // shows for 20s so it never sits over a button for long; comes back next visit until dismissed
      const t = setTimeout(() => setShow(true), 2500), t2 = setTimeout(() => setShow(false), 22500);
      return () => { clearTimeout(t); clearTimeout(t2); };
    }
  }, []);
  useEffect(() => { const f = () => bump((n) => n + 1); window.addEventListener("beforeinstallprompt", f); return () => window.removeEventListener("beforeinstallprompt", f); }, []);
  if (!show) return null;
  const close = () => { try { localStorage.setItem(KEY, "1"); } catch (e) { /* */ } setShow(false); };
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return (
    <div style={{ position: "fixed", left: 10, right: 10, bottom: 12, zIndex: 500, background: "#0B1F3F", color: "#fff", borderRadius: 14, padding: "12px 14px", boxShadow: "0 10px 30px rgba(0,0,0,.35)", fontFamily: "Quicksand, sans-serif", display: "flex", gap: 12, alignItems: "center" }}>
      <img src="/icons/icon-192.png" alt="" style={{ width: 42, height: 42, borderRadius: 10, flex: "none" }} />
      <div style={{ flex: 1, fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>
        <b style={{ fontSize: 14.5 }}>Install DK Ops as an app</b><br />
        {deferred ? "Opens full screen from your home screen." : ios ? <>In Safari tap <b>Share</b> (the square with an arrow) then <b>Add to Home Screen</b>.</> : <>Tap the browser menu <b>⋮</b> then <b>Install app</b> / <b>Add to Home screen</b>.</>}
      </div>
      {deferred && <button type="button" onClick={() => { deferred.prompt(); deferred.userChoice.finally(() => { deferred = null; close(); }); }} style={{ border: "none", background: "#F4B73E", color: "#0B1F3F", borderRadius: 10, padding: "9px 12px", fontFamily: "inherit", fontWeight: 800, cursor: "pointer" }}>Install</button>}
      <button type="button" onClick={close} aria-label="Dismiss" style={{ border: "none", background: "transparent", color: "#aeb9cf", fontSize: 20, fontWeight: 800, cursor: "pointer", padding: 4 }}>×</button>
    </div>
  );
}
