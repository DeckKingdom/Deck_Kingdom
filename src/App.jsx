import { useState, useEffect, Component } from "react";
import ImportPlanner from "./modules/ImportPlanner.jsx";
import LoginScreen from "./modules/LoginScreen.jsx";
import { storageMode } from "./data/storage.js";
import { getSession, onAuthChange, getMyAccess } from "./data/auth.js";
import DriverApp from "./modules/DriverApp.jsx";

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
  if (me.role === "driver") return <DriverApp me={{ fullName: me.full_name || "", driverName: me.driver_name || "" }} />;
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
  let localDriver = "";
  try { const q = new URLSearchParams(window.location.search); if (q.get("as") === "driver") localDriver = q.get("driver") || "Brian"; } catch (e) { /* ignore */ }
  return <ErrorBoundary>{storageMode === "supabase" ? <AuthGate /> : localDriver ? <DriverApp me={{ driverName: localDriver }} /> : <ImportPlanner />}</ErrorBoundary>;
}
