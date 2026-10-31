// Small helpers shared by every screen.

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function toMillis(t) {
  if (!t) return 0;
  if (typeof t === "number") return t;
  if (t.toMillis) return t.toMillis();
  if (t.seconds != null) return t.seconds * 1000;
  return new Date(t).getTime() || 0;
}

export function fmtDate(t) {
  const ms = toMillis(t);
  return ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
}
export function fmtDay(isoDate) {
  return isoDate ? new Date(isoDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
}
export function fmtTime(t) {
  const ms = toMillis(t);
  return ms ? new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
}
export function fmtStamp(t) {
  const ms = toMillis(t);
  return ms ? new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}
export function fmtMinutes(m) {
  m = Math.round(m || 0);
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h}h ${String(r).padStart(2, "0")}m` : `${r}m`;
}
export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// US numbers: "(555) 123-4567" -> "+15551234567". Anything starting with + is kept as typed.
export function normalizePhone(input) {
  const raw = String(input || "").trim();
  if (raw.startsWith("+")) return "+" + raw.slice(1).replace(/\D/g, "");
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return "";
}
export function prettyPhone(e164) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164 || "");
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164 || "";
}

export function toast(msg) {
  document.querySelectorAll(".toast").forEach((el) => el.remove());
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

export function errorText(e) {
  const code = (e && e.code) || "";
  if (code.includes("permission-denied")) return "You don't have permission to do that. Ask the owner to check your role and teams.";
  if (code.includes("unavailable")) return "No connection. Your change is saved on this phone and will send when you're back online.";
  if (code.includes("invalid-verification-code")) return "That code didn't match. Check the text and try again.";
  if (code.includes("code-expired")) return "That code expired. Tap Resend to get a new one.";
  if (code.includes("too-many-requests")) return "Too many tries. Wait a few minutes and try again.";
  if (code.includes("invalid-phone-number")) return "That phone number doesn't look right. Use a 10-digit US number.";
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Email or password is wrong.";
  if (code.includes("user-not-found")) return "No account with that email. Tap Create account.";
  if (code.includes("email-already-in-use")) return "That email already has an account. Tap Sign in instead.";
  if (code.includes("weak-password")) return "Use a password with at least 8 characters.";
  if (code.includes("storage/unauthorized")) return "Upload refused. Photos and PDFs under 20 MB only.";
  return (e && e.message) || "Something went wrong. Try again.";
}

// Bottom sheet with a form. onSubmit(formData, form) may throw to keep the sheet open.
export function sheet({ title, body, submitLabel = "Save", onSubmit, extra = "" }) {
  const layer = document.getElementById("layer");
  layer.innerHTML = `<div class="scrim" data-close-scrim>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="row between"><h2 class="sheet-title">${esc(title)}</h2>
        <button type="button" class="btn ghost" data-close aria-label="Close">✕</button></div>
      <form id="sheetForm" novalidate>${body}
        <p class="form-error" id="sheetError" hidden></p>
        <div class="row between sheet-actions">${extra || "<span></span>"}
          <div class="row"><button type="button" class="btn" data-close>Cancel</button>
          ${onSubmit ? `<button class="btn primary" type="submit" id="sheetSave">${esc(submitLabel)}</button>` : ""}</div></div>
      </form></div></div>`;
  const form = document.getElementById("sheetForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const btn = document.getElementById("sheetSave");
    const err = document.getElementById("sheetError");
    btn.disabled = true; err.hidden = true;
    try { await onSubmit(new FormData(form), form); closeSheet(); }
    catch (x) { err.textContent = errorText(x); err.hidden = false; btn.disabled = false; }
  });
  const first = form.querySelector("input:not([type=hidden]):not([type=checkbox]),select,textarea");
  if (first) setTimeout(() => first.focus(), 40);
  return form;
}
export function closeSheet() {
  document.getElementById("layer").innerHTML = "";
  document.dispatchEvent(new CustomEvent("sheetclosed"));
}

// Two-tap confirm for destructive buttons (the app frame can't use confirm()).
const armed = new Map();
export function confirmTap(btn, label, fn) {
  const key = btn.dataset.armKey || (btn.dataset.armKey = Math.random().toString(36).slice(2));
  if (armed.has(key)) { clearTimeout(armed.get(key)); armed.delete(key); fn(); return; }
  const old = btn.textContent;
  btn.textContent = label; btn.classList.add("armed");
  armed.set(key, setTimeout(() => { armed.delete(key); if (btn.isConnected) { btn.textContent = old; btn.classList.remove("armed"); } }, 4000));
}

// Shrink big phone photos before upload.
export async function shrinkImage(file) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || file.size < 900_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}

export function fileType(file, blob) {
  const t = (blob && blob.type) || file.type || "";
  if (/^image\//.test(t) || t === "application/pdf") return t;
  if (/\.pdf$/i.test(file.name)) return "application/pdf";
  if (/\.jpe?g$/i.test(file.name)) return "image/jpeg";
  if (/\.png$/i.test(file.name)) return "image/png";
  if (/\.(heic|heif)$/i.test(file.name)) return "image/heic";
  return "";
}

export const safeName = (n) => String(n || "file").replace(/[^\w.\-]+/g, "_").slice(-80);
