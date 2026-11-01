// Submitting requests, "my requests", and the managers' request inbox.
import { S, myTeams, teamName, propName, isMgr, isOwner } from "../store.js";
import * as A from "../actions.js";
import { esc, fmtStamp, toast, errorText, sheet } from "../ui.js";
import { storage, ref, getDownloadURL } from "../fb.js";
import { jobForm, readJobForm, wireJobForm } from "./jobs.js";

const URG = { urgent: "Urgent", week: "This week", later: "Can wait" };
const urls = new Map();
let rerender = () => {};
export function setRerender(fn) { rerender = fn; }
function photoUrl(path) {
  if (urls.has(path)) return urls.get(path);
  urls.set(path, "");
  getDownloadURL(ref(storage, path)).then((u) => { urls.set(path, u); rerender(); }).catch(() => {});
  return "";
}

let draft = { urgency: "week" };

export function requestFormView() {
  const props = [...S.props.values()].sort((a, b) => a.name.localeCompare(b.name));
  return `<div><p class="eyebrow">Signed in as ${esc(S.profile.name)}</p><h2>Report a problem</h2></div>
    ${props.length ? `<form class="panel" data-form="request">
      <label class="lbl">Property<select class="in" id="rProp" name="propertyId" required>${props.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>
      <label class="lbl">Which team?<select class="in" id="rTeam" name="teamId">
        <option value="">Not sure</option>${[...S.teams.values()].sort((a, b) => a.name.localeCompare(b.name)).map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</select></label>
      <label class="lbl">What's wrong?<textarea class="in" id="rText" name="text" required placeholder="Describe the problem and where it is"></textarea></label>
      <fieldset class="lbl"><legend>How soon does it need fixing?</legend><div class="seg3">
        ${Object.entries({ later: "Can wait", week: "This week", urgent: "Urgent" }).map(([k, l]) => `<label class="opt ${k === "urgent" ? "opt-urgent" : ""}"><input type="radio" name="urgency" value="${k}" ${draft.urgency === k ? "checked" : ""}><span>${l}</span></label>`).join("")}
      </div></fieldset>
      <label class="check-row" for="rGuests"><span>Guests are staying there now</span><input type="checkbox" id="rGuests" name="guests"></label>
      <label class="lbl">Photos (optional)<input class="in" type="file" id="rFiles" name="files" accept="image/*" multiple></label>
      <button class="btn primary block" type="submit">Send request</button>
    </form>` : `<div class="empty"><p>No properties have been added yet. Check back soon.</p></div>`}
    ${myRequestsBlock()}`;
}

function myRequestsBlock() {
  const mine = [...S.myRequests.values()].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 20);
  if (!mine.length) return "";
  return `<section class="panel"><h3>My requests</h3><div class="rows">${mine.map((r) => {
    const st = r.status === "accepted" ? `<span class="pill s-progress">Scheduled</span>` : r.status === "declined" ? `<span class="pill s-done">Declined</span>` : `<span class="pill s-open">Sent</span>`;
    return `<div class="r"><span>${esc(r.text.split("\n")[0])}<small>${esc(propName(r.propertyId))}${r.teamId ? ` · ${esc(teamName(r.teamId))}` : ""} · ${fmtStamp(r.createdAt)}${r.reason ? ` · ${esc(r.reason)}` : ""}</small></span>${st}</div>`;
  }).join("")}</div></section>`;
}

// Managers see requests for their own teams plus ones with no team picked; the owner sees all.
function visibleRequests() {
  const mine = new Set(myTeams());
  return [...S.inbox.values()].filter((r) => isOwner() || !r.teamId || mine.has(r.teamId));
}
export const inboxCount = () => visibleRequests().length;

export function inboxView() {
  const reqs = visibleRequests().sort((a, b) => {
    const u = (b.urgency === "urgent") - (a.urgency === "urgent"); if (u) return u;
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  });
  let h = `<div class="row between"><div><p class="eyebrow">Owner and managers</p><h2>Requests${reqs.length ? ` <span class="count">${reqs.length} new</span>` : ""}</h2></div>
    <a class="btn sm" href="#/report">Submit one</a></div>`;
  if (!reqs.length) return h + `<div class="empty"><p>No new requests. People you add as Requesters (and your crew) can report problems, and they show up here.</p></div>`;
  return h + `<div class="list">${reqs.map((r) => `<article class="panel">
      <div class="row between small muted"><span>${esc(r.byName)} · ${fmtStamp(r.createdAt)}</span>
        <span class="pill ${r.urgency === "urgent" ? "urgent" : r.urgency === "week" ? "s-parts" : "s-done"}">${URG[r.urgency] || ""}</span></div>
      <p class="notes strong">${esc(r.text)}</p>
      <p class="muted small">${esc(propName(r.propertyId))} · ${r.teamId ? esc(teamName(r.teamId)) : "No team picked"}${r.guests ? " · Guests staying now" : ""}</p>
      ${(r.photos || []).length ? `<div class="files">${r.photos.map((p) => { const u = photoUrl(p); return `<div class="file">${u ? `<button class="thumb" data-act="zoom" data-src="${esc(u)}" aria-label="View photo"><img src="${esc(u)}" alt=""></button>` : `<div class="thumb"><span class="small muted">Loading…</span></div>`}</div>`; }).join("")}</div>` : ""}
      <div class="row"><button class="btn primary grow" data-act="accept" data-id="${esc(r.id)}">Make work order${r.teamId ? ` · ${esc(teamName(r.teamId))}` : ""}</button><button class="btn" data-act="decline" data-id="${esc(r.id)}">Decline</button></div>
    </article>`).join("")}</div>`;
}

export async function onRequestsClick(t) {
  const act = t.dataset.act, id = t.dataset.id;
  if (act === "accept") {
    const r = S.inbox.get(id); if (!r) return true;
    const first = r.text.split("\n")[0].trim();
    const f = sheet({ title: "Make work order", submitLabel: "Create job",
      body: jobForm({}, { teamId: myTeams().includes(r.teamId) ? r.teamId : "", title: first.length > 70 ? first.slice(0, 67) + "…" : first, propertyId: r.propertyId, priority: r.urgency === "urgent" ? "urgent" : "normal", notes: "" }),
      onSubmit: async (fd) => {
        const f = readJobForm(fd);
        const jobId = await A.acceptRequest(r, f);
        toast("Work order created");
        setTimeout(() => (location.hash = `#/job/${jobId}`), 0);
      } });
    wireJobForm(f);
    return true;
  }
  if (act === "decline") {
    const r = S.inbox.get(id); if (!r) return true;
    sheet({ title: "Decline request", submitLabel: "Decline", body: `<p class="muted">${esc(r.text.split("\n")[0])}</p>
      <label class="lbl">Reason (they'll see this)<input class="in" id="dReason" name="reason" placeholder="e.g. Already fixed, duplicate"></label>`,
      onSubmit: (fd) => A.declineRequest(r, String(fd.get("reason") || "").trim()) });
    return true;
  }
  return false;
}

export async function onRequestsChange(t) {
  if (t.name === "urgency") { draft.urgency = t.value; return true; }
  return false;
}

export async function onRequestsSubmit(form) {
  if (form.dataset.form !== "request") return false;
  const fd = new FormData(form);
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Sending…";
  try {
    await A.submitRequest({
      propertyId: fd.get("propertyId"), teamId: fd.get("teamId") || "", text: String(fd.get("text") || "").trim(), urgency: fd.get("urgency") || "week",
      guests: fd.get("guests") === "on", files: [...form.querySelector("#rFiles").files],
    });
    form.reset(); draft = { urgency: "week" };
    toast("Request sent. Thanks!");
  } catch (x) { toast(errorText(x)); }
  btn.disabled = false; btn.textContent = "Send request";
  return true;
}
