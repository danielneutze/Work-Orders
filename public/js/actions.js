// Everything that writes to the database lives here.
import {
  db, storage, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, increment, runTransaction, writeBatch, ref, uploadBytes, deleteObject,
} from "./fb.js";
import { S, personName } from "./store.js";
import { shrinkImage, fileType, safeName } from "./ui.js";
import { DEFAULT_TEAMS } from "./config.js";

const me = () => S.user.uid;
const myName = () => (S.profile && S.profile.name) || "Someone";

function jobNumber() {
  const d = new Date();
  const tag = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `WO-${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${tag}`;
}

export function checklistFrom(template) {
  if (!template) return null;
  return {
    name: template.name,
    items: (template.items || []).map((t) => (t.startsWith("#") ? { t: t.replace(/^#+\s*/, ""), h: true } : { t, d: false })),
  };
}

// ---------- Jobs ----------
export async function createJob(f) {
  const ref_ = doc(collection(db, "jobs"));
  const data = {
    number: jobNumber(),
    title: f.title, teamId: f.teamId, propertyId: f.propertyId || "",
    assigneeUid: f.assigneeUid || "", assigneeName: f.assigneeUid ? personName(f.assigneeUid) : "",
    due: f.due || "", priority: f.priority || "normal", notes: f.notes || "",
    status: "open",
    checklist: f.checklist || null,
    partsTotal: 0, minutesTotal: 0, filesCount: 0,
    requestId: f.requestId || "", requestPhotos: f.requestPhotos || [], requestedBy: f.requestedBy || "",
    createdAt: serverTimestamp(), createdBy: me(), createdByName: myName(),
    updatedAt: serverTimestamp(), completedAt: null,
  };
  await setDoc(ref_, data);
  return ref_.id;
}

export async function editJob(id, f) {
  await updateDoc(doc(db, "jobs", id), {
    title: f.title, teamId: f.teamId, propertyId: f.propertyId || "",
    assigneeUid: f.assigneeUid || "", assigneeName: f.assigneeUid ? personName(f.assigneeUid) : "",
    due: f.due || "", priority: f.priority || "normal", notes: f.notes || "",
    updatedAt: serverTimestamp(),
  });
}

export async function setStatus(id, status) {
  await updateDoc(doc(db, "jobs", id), {
    status, updatedAt: serverTimestamp(), completedAt: status === "done" ? serverTimestamp() : null,
  });
}

export async function setChecklist(id, checklist) {
  await updateDoc(doc(db, "jobs", id), { checklist, updatedAt: serverTimestamp() });
}

// Ticking one item reads the latest list first, so two people ticking at once don't overwrite each other.
export async function tickItem(jobId, index, done) {
  await runTransaction(db, async (tx) => {
    const r = doc(db, "jobs", jobId);
    const snap = await tx.get(r);
    if (!snap.exists()) return;
    const job = snap.data();
    if (!job.checklist) return;
    const items = job.checklist.items.slice();
    const it = items[index];
    if (!it || it.h) return;
    items[index] = done ? { t: it.t, d: true, by: me(), byName: myName(), at: Date.now() } : { t: it.t, d: false };
    const patch = { checklist: { ...job.checklist, items }, updatedAt: serverTimestamp() };
    if (done && job.status === "open") patch.status = "progress";
    tx.update(r, patch);
  });
}

export async function deleteJob(id) {
  await deleteDoc(doc(db, "jobs", id));
}

// ---------- Parts ----------
export async function addPart(jobId, { name, qty, cost }) {
  const q = Number(qty) || 1;
  const c = Math.round((Number(cost) || 0) * 100) / 100;
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "jobs", jobId, "parts")), { name, qty: q, cost: c, by: me(), byName: myName(), at: serverTimestamp() });
  batch.update(doc(db, "jobs", jobId), { partsTotal: increment(Math.round(q * c * 100) / 100), updatedAt: serverTimestamp() });
  await batch.commit();
}
export async function removePart(jobId, part) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "jobs", jobId, "parts", part.id));
  batch.update(doc(db, "jobs", jobId), { partsTotal: increment(-Math.round(part.qty * part.cost * 100) / 100), updatedAt: serverTimestamp() });
  await batch.commit();
}

// ---------- Files ----------
async function uploadOne(path, file) {
  const blob = await shrinkImage(file);
  const type = fileType(file, blob);
  if (!type) throw Object.assign(new Error("Only photos and PDFs can be uploaded."), { code: "type" });
  await uploadBytes(ref(storage, path), blob, { contentType: type });
  return type;
}
export async function uploadJobFile(jobId, file, kind) {
  const path = `jobs/${jobId}/${Date.now()}-${safeName(file.name)}`;
  const type = await uploadOne(path, file);
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "jobs", jobId, "files")), { path, name: file.name || "photo", type, kind, by: me(), byName: myName(), at: serverTimestamp() });
  batch.update(doc(db, "jobs", jobId), { filesCount: increment(1), updatedAt: serverTimestamp() });
  await batch.commit();
}
export async function removeJobFile(jobId, f) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "jobs", jobId, "files", f.id));
  batch.update(doc(db, "jobs", jobId), { filesCount: increment(-1), updatedAt: serverTimestamp() });
  await batch.commit();
  deleteObject(ref(storage, f.path)).catch(() => {});
}

// ---------- Time ----------
function entryBase(job) {
  return { jobId: job.id, jobNumber: job.number || "", jobTitle: job.title || "", teamId: job.teamId, propertyId: job.propertyId || "" };
}
export async function clockIn(job) {
  if (S.clock) await clockOut();
  await setDoc(doc(db, "clock", me()), { ...entryBase(job), start: Date.now() });
}
export async function clockOut() {
  const c = S.clock;
  if (!c) return;
  const end = Date.now();
  const minutes = Math.max(1, Math.round((end - c.start) / 60000));
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "time")), {
    uid: me(), name: myName(), jobId: c.jobId, jobNumber: c.jobNumber, jobTitle: c.jobTitle,
    teamId: c.teamId, propertyId: c.propertyId, start: c.start, end, minutes, manual: false, createdAt: serverTimestamp(),
  });
  batch.update(doc(db, "jobs", c.jobId), { minutesTotal: increment(minutes), updatedAt: serverTimestamp() });
  batch.delete(doc(db, "clock", me()));
  await batch.commit();
}
export async function addManualTime(job, { uid, date, from, to, note }) {
  const start = new Date(`${date}T${from}`).getTime();
  let end = new Date(`${date}T${to}`).getTime();
  if (end <= start) end += 24 * 3600 * 1000; // crossed midnight
  const minutes = Math.round((end - start) / 60000);
  if (!(minutes > 0 && minutes < 24 * 60)) throw new Error("Check the start and end times.");
  const who = uid || me();
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "time")), {
    uid: who, name: personName(who) || myName(), ...entryBase(job), start, end, minutes, manual: true,
    note: note || "", addedBy: me(), createdAt: serverTimestamp(),
  });
  batch.update(doc(db, "jobs", job.id), { minutesTotal: increment(minutes), updatedAt: serverTimestamp() });
  await batch.commit();
}
export async function removeTime(entry) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "time", entry.id));
  batch.update(doc(db, "jobs", entry.jobId), { minutesTotal: increment(-entry.minutes), updatedAt: serverTimestamp() });
  await batch.commit();
}

// ---------- Checklists, properties ----------
export async function saveChecklist(id, data) {
  const r = id ? doc(db, "checklists", id) : doc(collection(db, "checklists"));
  await setDoc(r, { ...data, updatedAt: serverTimestamp() });
}
export const deleteChecklist = (id) => deleteDoc(doc(db, "checklists", id));

export async function saveProperty(id, data) {
  const r = id ? doc(db, "properties", id) : doc(collection(db, "properties"));
  await setDoc(r, { ...data, updatedAt: serverTimestamp() });
}
export const deleteProperty = (id) => deleteDoc(doc(db, "properties", id));

// ---------- Requests ----------
export async function submitRequest({ propertyId, text, urgency, guests, files }) {
  const photos = [];
  for (const f of files || []) {
    const path = `requests/${me()}/${Date.now()}-${safeName(f.name)}`;
    await uploadOne(path, f);
    photos.push(path);
  }
  await addDoc(collection(db, "requests"), {
    by: me(), byName: myName(), propertyId, text, urgency, guests: !!guests, photos,
    status: "new", jobId: "", createdAt: serverTimestamp(),
  });
}
export async function acceptRequest(req, f) {
  const first = req.text.split(/\n/)[0].trim();
  const jobId = await createJob({
    title: f.title || (first.length > 70 ? first.slice(0, 67) + "…" : first),
    teamId: f.teamId, propertyId: req.propertyId, assigneeUid: f.assigneeUid, due: f.due,
    priority: req.urgency === "urgent" ? "urgent" : "normal",
    notes: `Request from ${req.byName}${req.guests ? " (guests staying)" : ""}:\n${req.text}${f.notes ? `\n\n${f.notes}` : ""}`,
    checklist: f.checklist || null,
    requestId: req.id, requestPhotos: req.photos || [], requestedBy: req.by,
  });
  await updateDoc(doc(db, "requests", req.id), { status: "accepted", jobId, handledBy: me(), handledAt: serverTimestamp() });
  return jobId;
}
export async function declineRequest(req, reason) {
  await updateDoc(doc(db, "requests", req.id), { status: "declined", reason: reason || "", handledBy: me(), handledAt: serverTimestamp() });
}

// ---------- People ----------
export async function setupTeams() {
  const batch = writeBatch(db);
  DEFAULT_TEAMS.forEach((t) => batch.set(doc(db, "teams", t.id), { name: t.name }, { merge: true }));
  await batch.commit();
}
export async function saveTeam(id, name) {
  const tid = id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team";
  await setDoc(doc(db, "teams", tid), { name }, { merge: true });
}
export async function invite({ key, name, role, teams }) {
  await setDoc(doc(db, "invites", key), { name, role, teams, createdAt: serverTimestamp(), by: me() });
}
export async function renameMe(name) { await updateDoc(doc(db, "users", me()), { name }); }
export async function removeInvite(key) { await deleteDoc(doc(db, "invites", key)); }
export async function updatePerson(uid, patch) {
  await updateDoc(doc(db, "users", uid), patch);
  const p = S.people.get(uid);
  const key = p && (p.phone || p.email);
  if (key && (patch.role || patch.teams)) {
    const inv = await getDoc(doc(db, "invites", key)).catch(() => null);
    if (inv && inv.exists()) await updateDoc(doc(db, "invites", key), { role: patch.role || p.role, teams: patch.teams || p.teams });
  }
}
