import { useState, useEffect } from "react";
import ImportPlanner from "./modules/ImportPlanner.jsx";
import LoginScreen from "./modules/LoginScreen.jsx";
import { storageMode } from "./data/storage.js";
import { getSession, onAuthChange } from "./data/auth.js";

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
  return <ImportPlanner key={session.user.id} />;
}

export default function App() {
  return storageMode === "supabase" ? <AuthGate /> : <ImportPlanner />;
}
