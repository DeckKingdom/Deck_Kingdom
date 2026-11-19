// The lock screen in front of the whole app (office and driver screens alike),
// plus the little toggle that turns it on or off for the device it's tapped on.
// Locks on a cold open and when the app's been in the background a while;
// unlocking is the phone's own Face ID / fingerprint / passcode sheet.
import { useEffect, useRef, useState } from "react";
import { lockSupported, lockEnrolled, enrolLock, verifyLock, disableLock } from "../lib/appLock.js";
import { signOut } from "../data/auth.js";

const RELOCK_MS = 5 * 60_000; // background longer than this and it locks again

export default function AppLock({ children }) {
  const [locked, setLocked] = useState(() => lockSupported() && lockEnrolled());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const away = useRef(0);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) { away.current = Date.now(); return; }
      if (away.current && Date.now() - away.current > RELOCK_MS && lockSupported() && lockEnrolled()) { setErr(""); setLocked(true); }
      away.current = 0;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const tryUnlock = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      if (await verifyLock()) setLocked(false);
    } catch (e) {
      setErr(/NotAllowed|AbortError/i.test(String(e && e.name)) ? "Didn't go through — give it another try." : String((e && e.message) || e));
    }
    setBusy(false);
  };

  return (
    <>
      {children}
      {locked && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "linear-gradient(160deg,#0B1F3F 0%,#13294f 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Quicksand, sans-serif" }}>
          <div style={{ textAlign: "center", maxWidth: 340, width: "100%" }}>
            <div style={{ width: 54, height: 54, borderRadius: 14, background: "#F4B73E", color: "#0B1F3F", fontWeight: 800, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>DK</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 19, marginBottom: 4 }}>Deck Kingdom Ops</div>
            <div style={{ color: "#aeb9cf", fontWeight: 600, fontSize: 13, marginBottom: 22 }}>Locked on this device</div>
            <button type="button" onClick={tryUnlock} disabled={busy}
              style={{ width: "100%", border: "none", borderRadius: 12, padding: "14px 0", fontFamily: "inherit", fontWeight: 800, fontSize: 16, background: "#F4B73E", color: "#0B1F3F", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
              {busy ? "Checking…" : "Unlock with Face ID"}
            </button>
            {err && <div style={{ color: "#f3b6c0", fontWeight: 700, fontSize: 12.5, marginTop: 10 }}>{err}</div>}
            <button type="button" onClick={() => signOut().then(() => window.location.reload())}
              style={{ marginTop: 18, border: "none", background: "none", color: "#8ea2c4", fontFamily: "inherit", fontWeight: 700, fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}>
              Sign out instead
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// sidebar-footer variant for the office app: same switch, office styling
export function FaceIdSidebarBtn({ open, styleOf, icon }) {
  const [on, setOn] = useState(() => lockSupported() && lockEnrolled());
  if (!lockSupported()) return null;
  const flip = async () => {
    if (on) { disableLock(); setOn(false); return; }
    try { await enrolLock("Deck Kingdom Ops"); setOn(true); } catch { /* cancelled — leave it off */ }
  };
  return (
    <button onClick={flip} title={on ? "Face ID lock is on for this device — click to turn it off" : "Ask for Face ID / fingerprint when the app opens on this device"} style={styleOf(open)}>
      {icon}
      {open && (on ? "Face ID · on" : "Face ID lock")}
    </button>
  );
}

// the on/off switch, shown only where the device can actually do it
export function FaceIdToggle({ style }) {
  const [on, setOn] = useState(() => lockSupported() && lockEnrolled());
  const [note, setNote] = useState("");
  if (!lockSupported()) return null;
  const flip = async () => {
    setNote("");
    if (on) { disableLock(); setOn(false); setNote("Face ID lock is off on this device."); return; }
    try {
      await enrolLock("Deck Kingdom Ops");
      setOn(true);
      setNote("On — this device now asks for Face ID when the app opens.");
    } catch (e) {
      setNote(/NotAllowed|AbortError/i.test(String(e && e.name)) ? "Cancelled — nothing changed." : "Couldn't set it up: " + String((e && e.message) || e));
    }
  };
  return (
    <div style={style}>
      <button type="button" onClick={flip}
        style={{ width: "100%", border: "1px solid #d5d9e0", background: "#fff", borderRadius: 12, padding: 12, fontFamily: "inherit", fontWeight: 700, color: on ? "#1f7a3a" : "#5a6a85", cursor: "pointer" }}>
        {on ? "🔓 Turn off Face ID lock" : "🔒 Turn on Face ID lock"}
      </button>
      {note && <div style={{ fontSize: 12, fontWeight: 700, color: "#5a6a85", marginTop: 6, textAlign: "center" }}>{note}</div>}
    </div>
  );
}
