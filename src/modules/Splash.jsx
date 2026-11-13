// The greeting screen that covers the data load — no blank page, no day cards
// popping from 0 to 1 as the book lands. Shown solid while nothing has
// loaded; once everything's in, it fades away and the app appears fully
// formed with the right numbers already on it. Used by the office app and
// the phone app alike.
const NAVY = "#0B1F3F";
const GOLD = "#F4B73E";

export const greetingWord = (d = new Date()) => {
  const h = d.getHours();
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
};

export default function Splash({ name = "", fade = false }) {
  return (
    <div aria-hidden={fade} style={{ position: "fixed", inset: 0, zIndex: 2000, background: NAVY, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "Quicksand, sans-serif", opacity: fade ? 0 : 1, transition: "opacity .5s ease", pointerEvents: fade ? "none" : "auto" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap');@keyframes dk-splash-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}@keyframes dk-splash-slide{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}`}</style>
      <div style={{ width: 76, height: 76, borderRadius: 20, background: GOLD, color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 31, letterSpacing: 0.5, animation: "dk-splash-pulse 1.6s ease-in-out infinite", boxShadow: "0 14px 40px rgba(0,0,0,.35)" }}>DK</div>
      <div style={{ color: "#fff", fontWeight: 800, fontSize: 25, marginTop: 6 }}>{greetingWord()}{name ? ", " + name : ""}</div>
      <div style={{ color: "#8ea0bd", fontWeight: 600, fontSize: 14 }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
      <div style={{ width: 150, height: 4, borderRadius: 99, background: "rgba(255,255,255,.14)", overflow: "hidden", marginTop: 10 }}>
        <div style={{ width: "42%", height: "100%", borderRadius: 99, background: GOLD, animation: "dk-splash-slide 1.15s ease-in-out infinite" }} />
      </div>
      <div style={{ color: "#5a6f92", fontWeight: 700, fontSize: 11.5, letterSpacing: 2.5, textTransform: "uppercase", marginTop: 6 }}>Deck Kingdom Ops</div>
    </div>
  );
}
