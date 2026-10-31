// Live data from Firestore, kept in memory. Screens read from S and re-render on change.
import { db, collection, doc, onSnapshot, query, where } from "./fb.js";

export const S = {
  user: null,          // Firebase auth user
  profile: null,       // users/{uid} doc: { name, role, teams, ... }
  teams: new Map(),
  props: new Map(),
  people: new Map(),   // uid -> profile (staff only)
  lists: new Map(),    // checklist templates
  jobs: new Map(),
  clock: null,         // my running clock, or null
  inbox: new Map(),    // new requests (managers)
  myRequests: new Map(),
  myTime: new Map(),   // my time entries
  ready: false,
};

let unsubs = [];
let changeHandler = () => {};
let renderQueued = false;
export function onChange(fn) { changeHandler = fn; }
function changed() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => { renderQueued = false; changeHandler(); });
}

export const role = () => (S.profile && S.profile.role) || "";
export const isOwner = () => role() === "owner";
export const isMgr = () => role() === "owner" || role() === "manager";
export const isStaff = () => ["owner", "manager", "tech"].includes(role());
export const myTeams = () => (isOwner() ? [...S.teams.keys()] : (S.profile && S.profile.teams) || []);
export const canManageTeam = (t) => isOwner() || (role() === "manager" && myTeams().includes(t));
export const teamName = (id) => (S.teams.get(id) || {}).name || "No team";
export const propName = (id) => (S.props.get(id) || {}).name || "No property";
export const personName = (uid) => (uid && S.people.get(uid) && S.people.get(uid).name) || (uid && S.user && uid === S.user.uid ? (S.profile && S.profile.name) || "You" : "");

function listen(q, target, after) {
  const pending = { first: true };
  const u = onSnapshot(q, (snap) => {
    if (target instanceof Map) {
      snap.docChanges().forEach((c) => {
        if (c.type === "removed") target.delete(c.doc.id);
        else target.set(c.doc.id, { id: c.doc.id, ...c.doc.data() });
      });
    }
    if (after) after(snap);
    pending.first = false;
    changed();
  }, (err) => { console.warn("listener error", err.code, err.message); changed(); });
  unsubs.push(u);
}

export function stopAll() {
  unsubs.forEach((u) => { try { u(); } catch {} });
  unsubs = [];
  stopJobs();
  closeJobDetail();
  for (const k of ["teams", "props", "people", "lists", "jobs", "inbox", "myRequests", "myTime"]) S[k] = new Map();
  S.clock = null; S.ready = false;
}

export function startAll() {
  stopAll();
  const uid = S.user.uid;
  listen(collection(db, "teams"), S.teams);
  listen(collection(db, "properties"), S.props);
  listen(query(collection(db, "requests"), where("by", "==", uid)), S.myRequests);
  if (isStaff()) {
    listen(collection(db, "users"), S.people);
    listen(collection(db, "checklists"), S.lists);
    listen(doc(db, "clock", uid), null, (snap) => { S.clock = snap.exists() ? snap.data() : null; });
    listen(query(collection(db, "time"), where("uid", "==", uid)), S.myTime);
    restartJobs();
  }
  if (isMgr()) listen(query(collection(db, "requests"), where("status", "==", "new")), S.inbox);
  setTimeout(() => { S.ready = true; changed(); }, 400);
}

// Jobs: the owner sees everything; everyone else gets one listener per team they're on.
let jobUnsubs = [];
let jobMaps = [];
function restartJobs() {
  jobUnsubs.forEach((u) => u());
  jobUnsubs = []; jobMaps = [];
  const queries = isOwner()
    ? [collection(db, "jobs")]
    : myTeams().map((t) => query(collection(db, "jobs"), where("teamId", "==", t)));
  queries.forEach((q) => {
    const m = new Map(); jobMaps.push(m);
    const u = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((c) => {
        if (c.type === "removed") m.delete(c.doc.id);
        else m.set(c.doc.id, { id: c.doc.id, ...c.doc.data() });
      });
      S.jobs = new Map(jobMaps.flatMap((x) => [...x]));
      changed();
    }, (err) => { console.warn("jobs listener", err.code); changed(); });
    jobUnsubs.push(u);
  });
}
function stopJobs() { jobUnsubs.forEach((u) => u()); jobUnsubs = []; jobMaps = []; }

// Per-job details (parts, files, time), opened while a job screen is showing.
let detail = { id: null, unsubs: [], parts: new Map(), files: new Map(), time: new Map() };
export function jobDetail(jobId) {
  const job = S.jobs.get(jobId);
  if (detail.id === jobId || !job) return detail;
  closeJobDetail();
  detail = { id: jobId, unsubs: [], parts: new Map(), files: new Map(), time: new Map() };
  const sub = (q, m) => detail.unsubs.push(onSnapshot(q, (snap) => {
    snap.docChanges().forEach((c) => {
      if (c.type === "removed") m.delete(c.doc.id); else m.set(c.doc.id, { id: c.doc.id, ...c.doc.data() });
    });
    changed();
  }, (err) => console.warn("detail listener", err.code)));
  sub(collection(db, "jobs", jobId, "parts"), detail.parts);
  sub(collection(db, "jobs", jobId, "files"), detail.files);
  sub(query(collection(db, "time"), where("jobId", "==", jobId), where("teamId", "==", job.teamId)), detail.time);
  return detail;
}
export function closeJobDetail() {
  detail.unsubs.forEach((u) => u());
  detail = { id: null, unsubs: [], parts: new Map(), files: new Map(), time: new Map() };
}
