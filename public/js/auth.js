// Sign-in screens and first-time account setup.
import {
  auth, db, doc, getDoc, setDoc, serverTimestamp,
  RecaptchaVerifier, signInWithPhoneNumber, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut,
} from "./fb.js";
import { esc, normalizePhone, prettyPhone, errorText } from "./ui.js";
import { OWNER_EMAIL, BUSINESS_NAME } from "./config.js";

let mode = "phone";        // phone | code | email
let confirmation = null;
let phoneTyped = "";
let verifier = null;

export function renderSignIn(root, message = "") {
  root.innerHTML = `<div class="signin">
    <div class="signin-top">
      <img class="signin-logo" src="/logo.svg" alt="Minits">
      <h1 class="signin-title">${esc(BUSINESS_NAME)}</h1>
      <p class="signin-sub">${mode === "email" ? "Sign in with your email and password." : "Sign in with the phone number your manager added."}</p>
    </div>
    <div class="signin-form">${formFor(mode)}
      <p class="form-error" id="authError" ${message ? "" : "hidden"}>${esc(message)}</p>
      <div id="recaptcha"></div>
    </div></div>`;
  wire(root);
}

function formFor(m) {
  if (m === "code") return `<form id="codeForm">
      <label class="lbl" for="code">Code sent to ${esc(prettyPhone(phoneTyped))}</label>
      <input class="in big" id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
      <button class="btn primary block" type="submit">Sign in</button>
      <div class="row between"><button type="button" class="link" data-a="back">Change number</button><button type="button" class="link" data-a="resend">Resend code</button></div>
    </form>`;
  if (m === "email") return `<form id="emailForm">
      <label class="lbl" for="em">Email</label>
      <input class="in big" id="em" name="email" type="email" autocomplete="email" required>
      <label class="lbl" for="pw">Password</label>
      <input class="in big" id="pw" name="password" type="password" autocomplete="current-password" minlength="8" required>
      <button class="btn primary block" type="submit" data-v="in">Sign in</button>
      <div class="row between"><button type="button" class="link" data-a="create">Create account</button><button type="button" class="link" data-a="reset">Forgot password</button></div>
      <button type="button" class="link" data-a="phone">Use a phone number instead</button>
    </form>`;
  return `<form id="phoneForm">
      <label class="lbl" for="ph">Mobile number</label>
      <input class="in big" id="ph" name="phone" type="tel" autocomplete="tel" placeholder="(555) 123-4567" value="${esc(phoneTyped ? prettyPhone(phoneTyped) : "")}" required>
      <button class="btn primary block" type="submit" id="sendBtn">Text me a sign-in code</button>
      <button type="button" class="link" data-a="email">Sign in with email instead</button>
    </form>`;
}

function showError(root, e) {
  const el = root.querySelector("#authError");
  el.textContent = typeof e === "string" ? e : errorText(e);
  el.hidden = false;
}

async function sendCode(root) {
  const phone = normalizePhone(root.querySelector("#ph") ? root.querySelector("#ph").value : prettyPhone(phoneTyped));
  if (!phone) return showError(root, "Enter a 10-digit US phone number.");
  phoneTyped = phone;
  try {
    if (verifier) { try { verifier.clear(); } catch {} }
    verifier = new RecaptchaVerifier(auth, "recaptcha", { size: "invisible" });
    confirmation = await signInWithPhoneNumber(auth, phone, verifier);
    mode = "code";
    renderSignIn(root);
  } catch (e) { showError(root, e); }
}

function wire(root) {
  root.querySelector("#phoneForm")?.addEventListener("submit", (e) => { e.preventDefault(); e.submitter && (e.submitter.disabled = true); sendCode(root); });
  root.querySelector("#codeForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await confirmation.confirm(root.querySelector("#code").value.trim()); mode = "phone"; }
    catch (x) { showError(root, x); }
  });
  root.querySelector("#emailForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = root.querySelector("#em").value.trim().toLowerCase();
    const pw = root.querySelector("#pw").value;
    try { await signInWithEmailAndPassword(auth, email, pw); }
    catch (x) { showError(root, x); }
  });
  root.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", async () => {
    const a = b.dataset.a;
    if (a === "back" || a === "phone") { mode = "phone"; renderSignIn(root); }
    else if (a === "email") { mode = "email"; renderSignIn(root); }
    else if (a === "resend") { await sendCode(root); }
    else if (a === "create" || a === "reset") {
      const email = root.querySelector("#em").value.trim().toLowerCase();
      const pw = root.querySelector("#pw").value;
      if (!email) return showError(root, "Type your email first.");
      try {
        if (a === "reset") { await sendPasswordResetEmail(auth, email); showError(root, "Password reset email sent. Check your inbox."); }
        else {
          if (pw.length < 8) return showError(root, "Choose a password with at least 8 characters.");
          const cred = await createUserWithEmailAndPassword(auth, email, pw);
          await sendEmailVerification(cred.user);
        }
      } catch (x) { showError(root, x); }
    }
  }));
}

// After sign-in: find or create this person's profile.
// Returns { profile } or { blocked: "message", verify?: true }.
export async function ensureProfile(user) {
  const r = doc(db, "users", user.uid);
  const snap = await getDoc(r);
  if (snap.exists()) {
    const p = snap.data();
    if (p.active === false) return { blocked: "Your access has been turned off. Contact the owner if this is a mistake." };
    return { profile: p };
  }
  const email = (user.email || "").toLowerCase();
  const phone = user.phoneNumber || "";

  // Email accounts must confirm the address before they can join.
  if (email && !phone) {
    if (!user.emailVerified) {
      await user.reload();
      if (!auth.currentUser.emailVerified) return { blocked: `Check ${email} for a verification link, tap it, then come back and tap Continue.`, verify: true };
    }
    await auth.currentUser.getIdToken(true);
  }

  if (email && email === OWNER_EMAIL.toLowerCase()) {
    const profile = { name: "Owner", role: "owner", teams: [], phone, email, active: true, createdAt: serverTimestamp() };
    await setDoc(r, profile);
    return { profile };
  }

  for (const key of [phone, email].filter(Boolean)) {
    const inv = await getDoc(doc(db, "invites", key)).catch(() => null);
    if (inv && inv.exists()) {
      const i = inv.data();
      const profile = { name: i.name || "New member", role: i.role, teams: i.teams || [], phone, email, active: true, createdAt: serverTimestamp() };
      await setDoc(r, profile);
      return { profile };
    }
  }
  return { blocked: `${phone ? prettyPhone(phone) : email} isn't on the team yet. Ask the owner to add you, then tap Continue.` };
}

export function renderBlocked(root, message, verify) {
  root.innerHTML = `<div class="signin"><div class="signin-top"><h1 class="signin-title">Almost there</h1>
    <p class="signin-sub">${esc(message)}</p></div>
    <div class="signin-form">
      <button class="btn primary block" id="retry">Continue</button>
      ${verify ? `<button class="link" id="resendV">Resend verification email</button>` : ""}
      <button class="link" id="out">Sign out</button>
    </div></div>`;
  root.querySelector("#retry").onclick = () => location.reload();
  root.querySelector("#out").onclick = () => signOut(auth);
  const rv = root.querySelector("#resendV");
  if (rv) rv.onclick = async () => { try { await sendEmailVerification(auth.currentUser); rv.textContent = "Sent. Check your inbox."; } catch (e) { rv.textContent = errorText(e); } };
}

export { signOut };
