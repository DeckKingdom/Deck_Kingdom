import { useState, useEffect, Component } from "react";
import ImportPlanner from "./modules/ImportPlanner.jsx";
import LoginScreen from "./modules/LoginScreen.jsx";
import { storageMode } from "./data/storage.js";
import { getSession, onAuthChange, getMyAccess, getSessionEmail } from "./data/auth.js";
import DriverApp from "./modules/DriverApp.jsx";
import { phoneAppParams } from "./modules/DriverPicker.jsx";

function AuthGate() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      try {
        setSession(await getSession());
        unsub = await onAuthChange(setSession);
      } catch (e) {
        setSession(null);
      }
    })();
    return () => unsub();
  }, []);

  if (session === undefined)
    return <div style={{ fontFamily: "Quicksand, sans-serif", background: "#0B1F3F", minHeight: "100vh" }} />;
  if (!session) return <LoginScreen />;
  return <Routed key={session.user.id} />;
}

// drivers get the phone screen with their runs and the fuel log; everyone else the office app
function Routed() {
  const [me, setMe] = useState(undefined);
  useEffect(() => {
    getMyAccess().then((p) => setMe(p || { role: "none" })).catch(() => setMe({ role: "none" }));
  }, []);
  if (me === undefined) return <div style={{ fontFamily: "Quicksand, sans-serif", background: "#0B1F3F", minHeight: "100vh" }} />;
  if (me.role === "driver") return <DriverApp me={{ fullName: me.full_name || "", driverName: me.driver_name || "", email: getSessionEmail() || "" }} />;
  // warehouse on a phone: the loading app for every van (?full=1 opens the whole system)
  const phone = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 760px)").matches;
  if (me.role === "warehouse" && phone && !/[?&]full=1/.test(window.location.search)) return <DriverApp warehouse me={{ fullName: me.full_name || "", email: getSessionEmail() || "" }} />;
  // admin / manager: the driver screen as any driver (or the loading app) - for runs, loading and testing
  const pa = (me.role === "admin" || me.role === "manager") ? phoneAppParams() : null;
  if (pa) {
    const myName = me.driver_name || (me.full_name || "").split(" ")[0] || "";
    return <DriverApp key={pa.app + ":" + (pa.driver || "")} warehouse={pa.app === "loading"} switcher={{ current: pa, myName }} me={{ fullName: me.full_name || "", driverName: pa.driver || "", email: getSessionEmail() || "" }} />;
  }
  return <ImportPlanner />;
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ fontFamily: "Quicksand, sans-serif", padding: 40, textAlign: "center", color: "#0B1F3F" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap');`}</style>
        <p style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>Something went wrong on this screen</p>
        <p style={{ fontSize: 13.5, color: "#5a6a85", marginBottom: 6 }}>Your data is safe — this is a display error. Refresh to carry on, and send Claude this message:</p>
        <code style={{ display: "inline-block", background: "#f3f5f8", border: "1px solid #e6e9ef", borderRadius: 8, padding: "8px 12px", fontSize: 12, maxWidth: 640, overflowWrap: "anywhere", marginBottom: 16 }}>
          {String(this.state.error && (this.state.error.message || this.state.error))}
        </code>
        <br />
        <button onClick={() => window.location.reload()} style={{ fontFamily: "inherit", fontSize: 14, fontWeight: 700, padding: "9px 18px", borderRadius: 8, border: "1px solid #F4B73E", background: "#F4B73E", color: "#0B1F3F", cursor: "pointer" }}>
          Refresh
        </button>
      </div>
    );
  }
}

export default function App() {
  // local/offline version: ?as=driver&driver=Brian previews the driver phone screen
  let localDriver = "", localWarehouse = false;
  try { const q = new URLSearchParams(window.location.search); if (q.get("as") === "driver") localDriver = q.get("driver") || "Brian"; if (q.get("as") === "warehouse") localWarehouse = true; } catch (e) { /* ignore */ }
  const pa = storageMode === "supabase" ? null : phoneAppParams();
  if (pa) return <ErrorBoundary><DriverApp warehouse={pa.app === "loading"} switcher={{ current: pa, myName: "Jon" }} me={{ fullName: "Jon", driverName: pa.driver || "", email: "jon" }} /></ErrorBoundary>;
  return <ErrorBoundary>{storageMode === "supabase" ? <AuthGate /> : localDriver ? <DriverApp me={{ driverName: localDriver }} /> : localWarehouse ? <DriverApp warehouse me={{ fullName: "Warehouse" }} /> : <ImportPlanner />}</ErrorBoundary>;
}
