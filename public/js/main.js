// App start-up, navigation and screen switching.
import { auth, onAuthStateChanged } from "./fb.js";
import { S, onChange, startAll, stopAll, isMgr, isOwner, isStaff, closeJobDetail } from "./store.js";
import { renderSignIn, ensureProfile, renderBlocked, signOut } from "./auth.js";
import { esc, fmtClock, toast, errorText, closeSheet } from "./ui.js";
import { ROLES } from "./config.js";
import * as Jobs from "./views/jobs.js";
import * as Time from "./views/time.js";
import * as Req from "./views/requests.js";
import * as Admin from "./views/admin.js";

const root = document.getElementById("root");
let shell = null; // { main, nav }

// ---------- Screens ----------
function routes() {
  if (!isStaff()) return [{ k: "report", label: "Report", icon: "alert" }];
  const r = [
    { k: "jobs", label: "Jobs", icon: "wrench" },
    { k: "time", label: "Time", icon: "clock" },
  ];
  if (isMgr()) r.push({ k: "inbox", label: "Requests", icon: "inbox", badge: S.inbox.size });
  else r.push({ k: "report", label: "Report", icon: "alert" });
  r.push({ k: "more", label: "More", icon: "menu" });
  return r;
}

function current() {
  const h = location.hash.replace(/^#\/?/, "");
  if (h.startsWith("job/")) return { view: "job", id: h.slice(4) };
  return { view: h || (isStaff() ? "jobs" : "report") };
}

function moreView() {
  const p = S.profile;
  return `<div><p class="eyebrow">${esc(ROLES[p.role] || "")}</p><h2>${esc(p.name)}</h2></div>
    <nav class="menu" aria-label="More">
      <a href="#/properties">Properties</a>
      <a href="#/checklists">Checklists</a>
      ${isOwner() ? `<a href="#/team">Team and people</a>` : ""}
      ${!isMgr() ? "" : `<a href="#/report">Submit a request</a>`}
    </nav>
    <section class="panel"><p class="muted small">Add this app to your home screen: in Safari tap Share, then "Add to Home Screen". In Chrome tap ⋮, then "Add to Home screen".</p></section>
    <div class="row"><button class="btn grow" data-act="rename">Change my name</button><button class="btn grow" id="signOut">Sign out</button></div>`;
}

function screen() {
  const r = current();
  if (r.view !== "job") closeJobDetail();
  if (!isStaff()) return Req.requestFormView() + `<button class="btn block" id="signOut">Sign out</button>`;
  switch (r.view) {
    case "job": return Jobs.jobView(r.id);
    case "time": return Time.timeView();
    case "inbox": return isMgr() ? Req.inboxView() : Jobs.jobsView();
    case "report": return Req.requestFormView();
    case "checklists": return Admin.checklistsView();
    case "properties": return Admin.propertiesView();
    case "team": return Admin.teamView();
    case "more": return moreView();
    default: return Jobs.jobsView();
  }
}

const ICONS = {
  wrench: `<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>`,
  clock: `<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M10 2.5h4"/>`,
  inbox: `<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>`,
  alert: `<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>`,
  menu: `<path d="M4 7h16M4 12h16M4 17h16"/>`,
};

function navHtml() {
  const r = current();
  const active = r.view === "job" ? "jobs" : ["properties", "checklists", "team"].includes(r.view) ? "more" : r.view;
  const items = routes();
  if (items.length < 2) return "";
  return `<div class="in" style="grid-template-columns:repeat(${items.length},1fr)">${items.map((i) => `<a href="#/${i.k}" ${active === i.k || (!r.view && i.k === items[0].k) ? `aria-current="page"` : ""}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[i.icon]}</svg>
    ${esc(i.label)}${i.badge ? `<span class="badge">${i.badge}</span>` : ""}</a>`).join("")}</div>`;
}

// ---------- Rendering ----------
let pending = false;
function typing() {
  const a = document.activeElement;
  return a && shell && shell.main.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox" && a.type !== "radio" && a.type !== "file";
}
function render(force) {
  if (!shell) return;
  if (!force && typing()) { pending = true; return; }
  pending = false;
  shell.main.innerHTML = screen();
  shell.nav.innerHTML = navHtml();
  shell.nav.hidden = !shell.nav.innerHTML;
  const so = document.getElementById("signOut");
  if (so) so.onclick = () => { stopAll(); Admin.stopAdmin(); signOut(auth); };
}
[Jobs, Time, Req, Admin].forEach((m) => m.setRerender(() => render()));
onChange(() => render());
document.addEventListener("focusout", () => setTimeout(() => { if (pending && !typing()) render(); }, 0));
window.addEventListener("hashchange", () => { closeSheet(); render(true); window.scrollTo(0, 0); });

// Running clocks tick every second without re-rendering the page.
setInterval(() => document.querySelectorAll("[data-since]").forEach((el) => { el.textContent = fmtClock(Date.now() - Number(el.dataset.since)); }), 1000);

// ---------- Events (one listener each, routed to the screen modules) ----------
document.addEventListener("click", async (e) => {
  const closer = e.target.closest("[data-close]");
  if (closer) { closeSheet(); return; }
  const scrim = e.target.closest("[data-close-scrim]");
  if (scrim && e.target === scrim) { closeSheet(); return; }
  const t = e.target.closest("[data-act]");
  if (!t || t.tagName === "INPUT") return;
  for (const h of [Jobs.onJobsClick, Time.onTimeClick, Req.onRequestsClick, Admin.onAdminClick]) {
    if (await h(t, e)) return;
  }
});
document.addEventListener("change", async (e) => {
  for (const h of [Jobs.onJobsChange, Req.onRequestsChange]) if (await h(e.target)) return;
});
document.addEventListener("submit", async (e) => {
  if (e.target.id === "sheetForm" || !shell || !shell.main.contains(e.target)) return;
  e.preventDefault();
  for (const h of [Jobs.onJobsSubmit, Req.onRequestsSubmit]) if (await h(e.target)) return;
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

// ---------- Start ----------
function mountShell() {
  root.innerHTML = `<header class="top"><div class="top-in"><span class="brand">Work Orders</span><span class="grow"></span><span class="who">${esc(S.profile.name)}</span></div></header>
    <main id="main" aria-live="polite"></main><nav class="tabs" id="nav" aria-label="Sections"></nav>`;
  shell = { main: document.getElementById("main"), nav: document.getElementById("nav") };
}

onAuthStateChanged(auth, async (user) => {
  shell = null; stopAll(); Admin.stopAdmin(); closeSheet();
  S.user = user; S.profile = null;
  if (!user) { renderSignIn(root); return; }
  root.innerHTML = `<div class="signin"><p class="signin-sub">Loading…</p></div>`;
  try {
    const res = await ensureProfile(user);
    if (res.blocked) { renderBlocked(root, res.blocked, res.verify); return; }
    S.profile = res.profile;
    mountShell();
    startAll();
    if (!location.hash) location.hash = isStaff() ? "#/jobs" : "#/report";
    render(true);
  } catch (e) {
    console.error(e);
    renderBlocked(root, errorText(e));
  }
});
