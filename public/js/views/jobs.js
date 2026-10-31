// Jobs list, job screen, and the new/edit job form.
import { S, isMgr, isOwner, myTeams, canManageTeam, teamName, propName, jobDetail } from "../store.js";
import * as A from "../actions.js";
import { esc, money, fmtDate, fmtDay, fmtStamp, fmtMinutes, fmtClock, fmtTime, today, toast, errorText, sheet, closeSheet, confirmTap } from "../ui.js";
import { storage, ref, getDownloadURL } from "../fb.js";

export const STATUS = [
  { k: "open", label: "Open", cls: "s-open" },
  { k: "progress", label: "In progress", cls: "s-progress" },
  { k: "parts", label: "Need parts", cls: "s-parts" },
  { k: "done", label: "Done", cls: "s-done" },
];
const ST = Object.fromEntries(STATUS.map((s) => [s.k, s]));

const view = { filter: "mine", team: "" };
const urls = new Map();
let rerender = () => {};
export function setRerender(fn) { rerender = fn; }

function fileUrl(path) {
  if (urls.has(path)) return urls.get(path);
  urls.set(path, "");
  getDownloadURL(ref(storage, path)).then((u) => { urls.set(path, u); rerender(); }).catch(() => urls.set(path, "error"));
  return "";
}

// ---------------- List ----------------
export function jobsView() {
  const uid = S.user.uid;
  const teams = myTeams();
  let all = [...S.jobs.values()];
  if (view.team) all = all.filter((j) => j.teamId === view.team);
  const open = all.filter((j) => j.status !== "done");
  const mine = open.filter((j) => j.assigneeUid === uid);
  const list = view.filter === "mine" ? mine : view.filter === "done" ? all.filter((j) => j.status === "done") : open;
  list.sort((a, b) => {
    if (view.filter === "done") return (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0);
    const u = (b.priority === "urgent") - (a.priority === "urgent"); if (u) return u;
    const ad = a.due || "9999", bd = b.due || "9999"; if (ad !== bd) return ad < bd ? -1 : 1;
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  });
  const late = open.filter((j) => j.due && j.due < today()).length;

  let h = `<div class="row between"><div><p class="eyebrow">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</p><h2>Jobs</h2></div>
    <button class="btn primary" data-act="new-job" ${teams.length ? "" : "disabled"}>+ New job</button></div>`;
  h += clockBanner();
  if (!teams.length) {
    return h + `<div class="empty">${isOwner() ? `<p>Start on the <a href="#/team">Team</a> screen: set up your teams and add your crew.</p>` : `<p>You aren't on a team yet. Ask the owner to add you to one.</p>`}</div>`;
  }
  h += `<div class="row wrap"><div class="chips" role="group" aria-label="Show">
    ${[["mine", `Mine · ${mine.length}`], ["open", `All open · ${open.length}`], ["done", "Done"]].map(([k, l]) => `<button class="chip" data-act="filter" data-v="${k}" aria-pressed="${view.filter === k}">${l}</button>`).join("")}</div>
    ${teams.length > 1 ? `<select class="in sm" id="teamFilter" aria-label="Team"><option value="">All teams</option>${teams.map((t) => `<option value="${esc(t)}" ${view.team === t ? "selected" : ""}>${esc(teamName(t))}</option>`).join("")}</select>` : ""}</div>`;
  if (late) h += `<p class="warn-line">${late} open job${late > 1 ? "s are" : " is"} past due.</p>`;
  if (!S.ready && !list.length) h += `<div class="empty"><p>Loading jobs…</p></div>`;
  else if (!list.length) h += `<div class="empty"><p>${view.filter === "mine" ? "Nothing assigned to you right now. Check All open." : view.filter === "done" ? "No finished jobs yet." : "No open jobs. Tap New job when something needs doing."}</p></div>`;
  else h += `<div class="list">${list.map(card).join("")}</div>`;
  return h;
}

function card(j) {
  const st = ST[j.status] || ST.open;
  const items = (j.checklist?.items || []).filter((i) => !i.h);
  const done = items.filter((i) => i.d).length;
  const late = j.status !== "done" && j.due && j.due < today();
  return `<a class="ticket ${st.cls}" href="#/job/${esc(j.id)}">
    <div class="t-head"><span class="mono muted">${esc(j.number)}</span>
      <span class="row tight">${j.priority === "urgent" ? `<span class="pill urgent">Urgent</span>` : ""}<span class="pill ${st.cls}">${st.label}</span></span></div>
    <div class="t-title">${esc(j.title)}</div>
    <div class="t-meta"><span>${esc(propName(j.propertyId))}</span>
      ${j.assigneeName ? `<span>→ ${esc(j.assigneeName)}</span>` : `<span class="warn">Unassigned</span>`}
      ${j.due ? `<span class="${late ? "overdue" : ""}">${late ? "Overdue · " : "Due "}${fmtDay(j.due)}</span>` : ""}
      ${myTeams().length > 1 ? `<span>${esc(teamName(j.teamId))}</span>` : ""}</div>
    ${items.length || j.minutesTotal || j.partsTotal ? `<div class="t-meta">
      ${items.length ? `<span><span class="meter"><i style="width:${Math.round((done / items.length) * 100)}%"></i></span>${done}/${items.length}</span>` : ""}
      ${j.minutesTotal ? `<span>${fmtMinutes(j.minutesTotal)} labor</span>` : ""}
      ${j.partsTotal ? `<span>${money.format(j.partsTotal)} parts</span>` : ""}</div>` : ""}</a>`;
}

function clockBanner() {
  const c = S.clock;
  if (!c) return "";
  return `<a class="clockbar" href="#/job/${esc(c.jobId)}"><span class="dot"></span><span class="grow">On the clock · ${esc(c.jobTitle)}</span><span class="mono" data-since="${c.start}">${fmtClock(Date.now() - c.start)}</span></a>`;
}

// ---------------- Job screen ----------------
export function jobView(id) {
  const j = S.jobs.get(id);
  if (!j) return `<a href="#/jobs" class="btn ghost">← Jobs</a><div class="empty"><p>${S.ready ? "This job was deleted, or you don't have access to it." : "Loading…"}</p></div>`;
  const d = jobDetail(id);
  const st = ST[j.status] || ST.open;
  const p = S.props.get(j.propertyId) || {};
  const mgr = canManageTeam(j.teamId);
  const onThis = S.clock && S.clock.jobId === id;

  let h = `<div class="row between"><a href="#/jobs" class="btn ghost">← Jobs</a>${mgr ? `<button class="btn sm" data-act="edit-job" data-id="${esc(id)}">Edit</button>` : ""}</div>
    <div><span class="mono muted">${esc(j.number)} · ${esc(teamName(j.teamId))}</span>${j.priority === "urgent" ? ` <span class="pill urgent">Urgent</span>` : ""}
    <h2 class="job-title">${esc(j.title)}</h2></div>
    ${onThis ? `<div class="clockbar"><span class="dot"></span><span class="grow">You're on the clock for this job</span><span class="mono" data-since="${S.clock.start}">${fmtClock(Date.now() - S.clock.start)}</span>
        <button class="btn sm light" data-act="clock-out">Clock out</button></div>`
      : j.status !== "done" ? `<button class="btn primary block" data-act="clock-in" data-id="${esc(id)}">${S.clock ? "Switch my clock to this job" : "Clock in on this job"}</button>` : ""}
    <div class="seg" role="group" aria-label="Status">${STATUS.map((s) => `<button class="${s.cls}" data-act="status" data-id="${esc(id)}" data-v="${s.k}" aria-pressed="${j.status === s.k}">${s.label}</button>`).join("")}</div>
    <section class="panel"><dl class="facts">
      <div><dt>Property</dt><dd>${esc(p.name || "None")}${p.address ? `<div class="muted small">${esc(p.address)}</div>` : ""}</dd></div>
      <div><dt>Assigned to</dt><dd>${esc(j.assigneeName || "Unassigned")}</dd></div>
      <div><dt>Due</dt><dd class="${j.status !== "done" && j.due && j.due < today() ? "overdue" : ""}">${j.due ? fmtDay(j.due) : "No date"}</dd></div>
      <div><dt>Status</dt><dd><span class="pill ${st.cls}">${st.label}</span></dd></div></dl>
      ${j.notes ? `<div><h3>Notes</h3><p class="notes">${esc(j.notes)}</p></div>` : ""}
      ${p.info ? `<details><summary>Property info</summary><p class="notes">${esc(p.info)}</p></details>` : ""}
      ${(j.requestPhotos || []).length ? `<div><h3>Photos from the request</h3><div class="files">${j.requestPhotos.map((path) => thumb({ path, type: "image/jpeg", name: "Request photo" })).join("")}</div></div>` : ""}
      <p class="muted small">Created ${fmtStamp(j.createdAt)} by ${esc(j.createdByName || "")}${j.completedAt ? ` · Finished ${fmtStamp(j.completedAt)}` : ""}</p></section>`;

  h += checklistSection(j, mgr);
  h += timeSection(j, d, mgr);
  h += partsSection(j, d, mgr);
  h += filesSection(j, d, mgr);
  if (mgr) h += `<div class="row end"><button class="btn danger" data-act="del-job" data-id="${esc(id)}">Delete job</button></div>`;
  return h;
}

function checklistSection(j, mgr) {
  let h = `<section class="panel"><div class="row between"><h3>Checklist</h3>`;
  if (!j.checklist) {
    h += `</div>`;
    const lists = [...S.lists.values()].filter((l) => !l.teamId || l.teamId === j.teamId);
    if (lists.length && mgr) h += `<div class="row"><select class="in grow" id="attachSel">${lists.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join("")}</select><button class="btn" data-act="attach" data-id="${esc(j.id)}">Add</button></div>`;
    else h += `<p class="muted">No checklist on this job.</p>`;
    return h + `</section>`;
  }
  const items = j.checklist.items || [];
  const real = items.filter((i) => !i.h), dn = real.filter((i) => i.d).length;
  h += `<span class="muted small">${dn} of ${real.length}</span></div>
    <div class="bar"><i style="width:${real.length ? Math.round((dn / real.length) * 100) : 0}%"></i></div>
    <div><strong>${esc(j.checklist.name)}</strong></div><div>`;
  h += items.map((it, i) => it.h ? `<div class="check-h">${esc(it.t)}</div>` :
    `<label class="check ${it.d ? "done" : ""}"><input type="checkbox" data-act="tick" data-id="${esc(j.id)}" data-i="${i}" ${it.d ? "checked" : ""}>
      <span class="ct"><span>${esc(it.t)}</span>${it.d ? `<small>${esc(it.byName || "")} · ${fmtStamp(it.at)}</small>` : ""}</span></label>`).join("");
  h += `</div>${mgr ? `<button class="link" data-act="detach" data-id="${esc(j.id)}">Remove checklist</button>` : ""}</section>`;
  return h;
}

function timeSection(j, d, mgr) {
  const rows = [...d.time.values()].sort((a, b) => b.start - a.start);
  const total = rows.reduce((a, r) => a + (r.minutes || 0), 0);
  return `<section class="panel"><div class="row between"><h3>Time on this job</h3><button class="link" data-act="add-time" data-id="${esc(j.id)}">+ Add time</button></div>
    ${rows.length ? `<div class="rows">${rows.map((r) => `<div class="r"><span>${esc(r.name)}<small>${fmtDate(r.start)} · ${fmtTime(r.start)}–${fmtTime(r.end)}${r.manual ? " · added by hand" : ""}${r.note ? ` · ${esc(r.note)}` : ""}</small></span>
      <span class="row tight"><b class="num">${fmtMinutes(r.minutes)}</b>${mgr || r.uid === S.user.uid ? `<button class="btn ghost sm" data-act="del-time" data-tid="${esc(r.id)}" aria-label="Remove time entry">✕</button>` : ""}</span></div>`).join("")}
      <div class="r total"><span>Total labor</span><b class="num">${fmtMinutes(total)}</b></div></div>` : `<p class="muted">No time logged yet. Clock in when you start, or add time by hand.</p>`}</section>`;
}

function partsSection(j, d, mgr) {
  const parts = [...d.parts.values()].sort((a, b) => (a.at?.seconds || 0) - (b.at?.seconds || 0));
  const total = parts.reduce((a, p) => a + p.qty * p.cost, 0);
  return `<section class="panel"><h3>Parts &amp; materials</h3>
    ${parts.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Each</th><th class="r">Total</th><th></th></tr></thead><tbody>
      ${parts.map((p) => `<tr><td>${esc(p.name)}<div class="muted small">${esc(p.byName)} · ${fmtDate(p.at)}</div></td><td class="r">${p.qty}</td><td class="r">${money.format(p.cost)}</td><td class="r">${money.format(p.qty * p.cost)}</td>
        <td class="r">${mgr || p.by === S.user.uid ? `<button class="btn ghost sm" data-act="del-part" data-pid="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">✕</button>` : ""}</td></tr>`).join("")}
      </tbody><tfoot><tr><td colspan="3">Parts total</td><td class="r">${money.format(total)}</td><td></td></tr></tfoot></table></div>` : `<p class="muted">Nothing logged yet.</p>`}
    <form class="addpart" data-form="part" data-id="${esc(j.id)}">
      <label class="lbl grow2">Item<input class="in" id="pName" name="name" required placeholder="e.g. Toilet flapper" autocomplete="off"></label>
      <label class="lbl">Qty<input class="in" id="pQty" name="qty" type="number" inputmode="decimal" step="any" min="0" value="1" required></label>
      <label class="lbl">Each $<input class="in" id="pCost" name="cost" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00"></label>
      <button class="btn" type="submit">Add</button></form></section>`;
}

function thumb(f, removable, jobId) {
  const isImg = (f.type || "").startsWith("image/");
  const url = fileUrl(f.path);
  const inner = isImg ? (url && url !== "error" ? `<img src="${esc(url)}" alt="" loading="lazy">` : `<span class="muted small">${url === "error" ? "Unavailable" : "Loading…"}</span>`) : `<span class="doc">PDF</span>`;
  const open = url && url !== "error" ? (isImg ? `<button class="thumb" data-act="zoom" data-src="${esc(url)}" aria-label="View photo">${inner}</button>` : `<a class="thumb" href="${esc(url)}" target="_blank" rel="noopener">${inner}</a>`) : `<div class="thumb">${inner}</div>`;
  return `<div class="file">${open}<div class="fmeta"><span>${f.kind ? `<span class="tag">${esc(f.kind)}</span><br>` : ""}${esc(f.byName || f.name || "")}</span>
    ${removable ? `<button class="btn ghost sm" data-act="del-file" data-fid="${esc(f.id)}" aria-label="Remove file">✕</button>` : ""}</div></div>`;
}

function filesSection(j, d, mgr) {
  const files = [...d.files.values()].sort((a, b) => (a.at?.seconds || 0) - (b.at?.seconds || 0));
  const group = (k) => files.filter((f) => f.kind === k);
  const block = (k, label) => {
    const fs = group(k);
    return fs.length ? `<div><p class="lbl">${label}</p><div class="files">${fs.map((f) => thumb(f, mgr || f.by === S.user.uid, j.id)).join("")}</div></div>` : "";
  };
  return `<section class="panel"><h3>Photos &amp; invoices</h3>
    <div class="uploads">
      ${["before", "after", "invoice"].map((k) => `<label class="btn sm"><input type="file" hidden data-act="upload" data-id="${esc(j.id)}" data-kind="${k}" accept="${k === "invoice" ? "image/*,application/pdf" : "image/*"}" ${k === "invoice" ? "multiple" : "multiple"}>+ ${k === "invoice" ? "Invoice / receipt" : k[0].toUpperCase() + k.slice(1)}</label>`).join("")}
    </div>
    ${files.length ? block("before", "Before") + block("after", "After") + block("invoice", "Invoices & receipts") + block("photo", "Other photos") : `<p class="muted">Take a before photo when you start and an after photo when you finish.</p>`}
  </section>`;
}

// ---------------- New / edit form ----------------
export function jobForm(j = {}, preset = {}) {
  const teams = myTeams().filter((t) => !j.teamId || true);
  const team = j.teamId || preset.teamId || (view.team || teams[0] || "");
  const staffFor = (t) => [...S.people.values()].filter((p) => p.active !== false && p.role !== "requester" && (p.role === "owner" || (p.teams || []).includes(t)));
  const props = [...S.props.values()].sort((a, b) => a.name.localeCompare(b.name));
  const lists = [...S.lists.values()].sort((a, b) => a.name.localeCompare(b.name));
  return `<label class="lbl">What needs doing<input class="in" id="jTitle" name="title" required value="${esc(j.title || preset.title || "")}" placeholder="e.g. Turnover clean, leaking faucet"></label>
    <div class="grid2"><label class="lbl">Team<select class="in" id="jTeam" name="teamId" required>${teams.map((t) => `<option value="${esc(t)}" ${t === team ? "selected" : ""}>${esc(teamName(t))}</option>`).join("")}</select></label>
    <label class="lbl">Property<select class="in" id="jProp" name="propertyId"><option value="">None</option>${props.map((p) => `<option value="${esc(p.id)}" ${p.id === (j.propertyId || preset.propertyId) ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label></div>
    <div class="grid2"><label class="lbl">Assigned to<select class="in" id="jWho" name="assigneeUid"><option value="">Unassigned</option>
      ${staffFor(team).map((p) => `<option value="${esc(p.id)}" ${p.id === j.assigneeUid ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
    <label class="lbl">Due date<input class="in" id="jDue" type="date" name="due" value="${esc(j.due || preset.due || "")}"></label></div>
    <div class="grid2"><label class="lbl">Priority<select class="in" id="jPri" name="priority"><option value="normal">Normal</option><option value="urgent" ${(j.priority || preset.priority) === "urgent" ? "selected" : ""}>Urgent</option></select></label>
    ${j.id ? "<span></span>" : `<label class="lbl">Checklist<select class="in" id="jList" name="listId"><option value="">None</option>${lists.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join("")}</select></label>`}</div>
    <label class="lbl">Notes<textarea class="in" id="jNotes" name="notes" placeholder="What's wrong, access instructions, what you found">${esc(j.notes || preset.notes || "")}</textarea></label>`;
}
export function readJobForm(fd) {
  const tpl = fd.get("listId") ? S.lists.get(fd.get("listId")) : null;
  return {
    title: String(fd.get("title") || "").trim(), teamId: fd.get("teamId"), propertyId: fd.get("propertyId"),
    assigneeUid: fd.get("assigneeUid"), due: fd.get("due"), priority: fd.get("priority"),
    notes: String(fd.get("notes") || "").trim(), checklist: A.checklistFrom(tpl),
  };
}
// Refresh the assignee list when the team changes.
export function wireJobForm(form) {
  const teamSel = form.querySelector("#jTeam"), who = form.querySelector("#jWho");
  if (!teamSel || !who) return;
  teamSel.addEventListener("change", () => {
    const t = teamSel.value;
    const staff = [...S.people.values()].filter((p) => p.active !== false && p.role !== "requester" && (p.role === "owner" || (p.teams || []).includes(t)));
    who.innerHTML = `<option value="">Unassigned</option>` + staff.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  });
}

// ---------------- Events ----------------
export async function onJobsClick(t, e) {
  const act = t.dataset.act, id = t.dataset.id;
  const route = location.hash.match(/^#\/job\/(.+)$/);
  const jobId = route && route[1];
  try {
    switch (act) {
      case "filter": view.filter = t.dataset.v; rerender(); return true;
      case "new-job": {
        const f = sheet({ title: "New job", body: jobForm(), submitLabel: "Create job", onSubmit: async (fd) => {
          const nid = await A.createJob(readJobForm(fd)); setTimeout(() => (location.hash = `#/job/${nid}`), 0);
        } });
        wireJobForm(f); return true;
      }
      case "edit-job": {
        const j = S.jobs.get(id);
        const f = sheet({ title: "Edit job", body: jobForm(j), onSubmit: async (fd) => A.editJob(id, readJobForm(fd)) });
        wireJobForm(f); return true;
      }
      case "status": if (S.jobs.get(id)?.status !== t.dataset.v) await A.setStatus(id, t.dataset.v); return true;
      case "attach": { const l = S.lists.get(document.getElementById("attachSel").value); if (l) await A.setChecklist(id, A.checklistFrom(l)); return true; }
      case "detach": confirmTap(t, "Tap again to remove", () => A.setChecklist(id, null).catch((x) => toast(errorText(x)))); return true;
      case "clock-in": await A.clockIn(S.jobs.get(id)); toast("Clocked in"); return true;
      case "clock-out": await A.clockOut(); toast("Clocked out. Time saved to the job."); return true;
      case "add-time": {
        const j = S.jobs.get(id);
        const mgr = canManageTeam(j.teamId);
        const staff = [...S.people.values()].filter((p) => p.active !== false && p.role !== "requester" && (p.role === "owner" || (p.teams || []).includes(j.teamId)));
        sheet({ title: "Add time", submitLabel: "Add time", body: `
          ${mgr ? `<label class="lbl">Who<select class="in" id="tWho" name="uid">${staff.map((p) => `<option value="${esc(p.id)}" ${p.id === S.user.uid ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>` : ""}
          <label class="lbl">Date<input class="in" type="date" id="tDate" name="date" value="${today()}" required></label>
          <div class="grid2"><label class="lbl">Start<input class="in" type="time" id="tFrom" name="from" required></label><label class="lbl">End<input class="in" type="time" id="tTo" name="to" required></label></div>
          <label class="lbl">Note (optional)<input class="in" id="tNote" name="note" placeholder="e.g. forgot to clock in"></label>`,
          onSubmit: (fd) => A.addManualTime(j, { uid: fd.get("uid"), date: fd.get("date"), from: fd.get("from"), to: fd.get("to"), note: fd.get("note") }) });
        return true;
      }
      case "del-time": {
        const d = jobDetail(jobId); const r = d.time.get(t.dataset.tid);
        if (r) confirmTap(t, "Remove?", () => A.removeTime(r).catch((x) => toast(errorText(x))));
        return true;
      }
      case "del-part": { const d = jobDetail(jobId); const p = d.parts.get(t.dataset.pid); if (p) await A.removePart(jobId, p); return true; }
      case "del-file": {
        const d = jobDetail(jobId); const f = d.files.get(t.dataset.fid);
        if (f) confirmTap(t, "Remove?", () => A.removeJobFile(jobId, f).catch((x) => toast(errorText(x))));
        return true;
      }
      case "zoom": document.getElementById("layer").innerHTML = `<div class="lightbox" data-close><img src="${esc(t.dataset.src)}" alt="Job photo"></div>`; return true;
      case "del-job": confirmTap(t, "Tap again to delete", async () => {
        try { await A.deleteJob(id); location.hash = "#/jobs"; toast("Job deleted"); } catch (x) { toast(errorText(x)); }
      }); return true;
    }
  } catch (x) { toast(errorText(x)); return true; }
  return false;
}

export async function onJobsChange(t) {
  if (t.id === "teamFilter") { view.team = t.value; rerender(); return true; }
  if (t.dataset.act === "tick") {
    try { await A.tickItem(t.dataset.id, +t.dataset.i, t.checked); } catch (x) { toast(errorText(x)); t.checked = !t.checked; }
    return true;
  }
  if (t.dataset.act === "upload") {
    const files = [...t.files]; if (!files.length) return true;
    toast(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
    for (const f of files) {
      try { await A.uploadJobFile(t.dataset.id, f, t.dataset.kind); } catch (x) { toast(errorText(x)); }
    }
    t.value = "";
    toast("Upload finished");
    return true;
  }
  return false;
}

export async function onJobsSubmit(form) {
  if (form.dataset.form !== "part") return false;
  const fd = new FormData(form);
  const name = String(fd.get("name") || "").trim();
  if (!name) return true;
  try {
    await A.addPart(form.dataset.id, { name, qty: fd.get("qty"), cost: fd.get("cost") });
    form.reset(); document.activeElement && document.activeElement.blur();
  } catch (x) { toast(errorText(x)); }
  return true;
}
