// Face ID / fingerprint app lock. Uses the phone's own secure hardware
// (WebAuthn platform authenticator) as a local "is it really you" check:
// enrolment stores a credential id on THIS device only, and unlocking asks
// the phone to verify the person — Face ID, fingerprint, or the device
// passcode as the fallback (the phone decides, we never see any of it).
// It's a screen gate in front of the app, not a change to sign-in: the
// session stays signed in underneath, same as a banking app's biometric lock.
const KEY = "dk-applock"; // JSON { credId, since } on the device that turned it on

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

const rec = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };

// can this device do it at all? (secure context + a platform authenticator API)
export const lockSupported = () =>
  typeof window !== "undefined" && !!window.PublicKeyCredential && !!(navigator.credentials && navigator.credentials.create) && window.isSecureContext;

export const lockEnrolled = () => !!rec();

export async function enrolLock(label) {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Deck Kingdom Ops", id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: label || "deck-kingdom", displayName: label || "Deck Kingdom" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60_000,
      attestation: "none",
    },
  });
  localStorage.setItem(KEY, JSON.stringify({ credId: b64(cred.rawId), since: Date.now() }));
}

export async function verifyLock() {
  const r = rec();
  if (!r) return true; // nothing enrolled — nothing to pass
  const a = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: "public-key", id: unb64(r.credId), transports: ["internal"] }],
      userVerification: "required",
      timeout: 60_000,
    },
  });
  return !!a;
}

export const disableLock = () => { try { localStorage.removeItem(KEY); } catch { /* fine */ } };
