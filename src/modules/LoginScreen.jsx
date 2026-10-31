import { useState } from "react";
import { signIn } from "../data/auth.js";

const NAVY = "#0B1F3F";
const GOLD = "#F4B73E";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password || busy) return;
    setBusy(true);
    setError("");
    const err = await signIn(email.trim(), password);
    if (err) {
      setError(/invalid/i.test(err) ? "Wrong email or password - try again." : err);
      setBusy(false);
    }
    // on success the auth listener in App re-renders into the planner
  };

  const inp = {
    fontFamily: "inherit", fontSize: 15, padding: "11px 12px", borderRadius: 8,
    border: "1px solid #33466b", background: "#122b52", color: "#fff",
    width: "100%", boxSizing: "border-box", marginBottom: 12,
  };

  return (
    <div style={{ fontFamily: "Quicksand, sans-serif", background: NAVY, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap');`}</style>
      <div style={{ textAlign: "center", width: "100%", maxWidth: 320 }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: GOLD, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: NAVY, fontSize: 22, marginBottom: 12 }}>
          DK
        </div>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 19 }}>Deck Kingdom Ops</div>
        <div style={{ color: "#8fa0c0", fontSize: 13, fontWeight: 600, marginBottom: 18 }}>Sign in to continue</div>
        <input type="email" placeholder="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} style={inp} />
        <input
          type="password" placeholder="Password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={inp}
        />
        <button
          onClick={submit} disabled={busy}
          style={{ fontFamily: "inherit", fontSize: 15, fontWeight: 700, padding: "11px 0", borderRadius: 8, border: "1px solid " + GOLD, background: GOLD, color: NAVY, cursor: "pointer", width: "100%", opacity: busy ? 0.7 : 1 }}
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>
        {error && <div style={{ color: "#f2a6b1", fontSize: 13, fontWeight: 600, marginTop: 12 }}>{error}</div>}
        <div style={{ color: "#5a6a85", fontSize: 11.5, fontWeight: 600, marginTop: 16 }}>Accounts are set up by the office - no self sign-up.</div>
      </div>
    </div>
  );
}
