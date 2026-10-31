// Checklists, properties, and team setup.
import { S, isOwner, isMgr, myTeams, teamName, propName } from "../store.js";
import * as A from "../actions.js";
import { esc, toast, errorText, sheet, closeSheet, confirmTap, normalizePhone, prettyPhone } from "../ui.js";
import { ROLES } from "../config.js";
import { db, collection, onSnapshot } from "../fb.js";

let rerender = () => {};
export function setRerender(fn) { rerender = fn; }

// ---------------- Checklists ----------------
export function checklistsView() {
  const ls = [...S.lists.values()].sort((a, b) => a.name.localeCompare(b.name));
  let h = `<div class="row between"><h2>Checklists</h2>${isMgr() ? `<button class="btn primary" data-act="new-list">+ New checklist</button>` : ""}</div>
    <p class="muted">Reusable steps for turnovers, inspections and repairs. Attach one to a job and the crew checks items off on site.</p>`;
  if (!ls.length) return h + `<div class="empty"><p>No checklists yet.${isMgr() ? " Tap New checklist and paste in the one you already use." : ""}</p></div>`;
  return h + `<div class="list">${ls.map((l) => {
    const n = (l.items || []).filter((t) => !t.startsWith("#")).length;
    return `<div class="panel row between"><div class="minw0"><strong>${esc(l.name)}</strong>
      <div class="muted small">${l.teamId ? esc(teamName(l.teamId)) : "Any team"} · ${l.propertyId ? esc(propName(l.propertyId)) : "Any property"} · ${n} step${n === 1 ? "" : "s"}</div></div>
      ${isMgr() ? `<button class="btn sm" data-act="edit-list" data-id="${esc(l.id)}">Edit</button>` : ""}</div>`;
  }).join("")}</div>`;
}

function listSheet(id) {
  const l = id ? S.lists.get(id) : {};
  const props = [...S.props.values()].sort((a, b) => a.name.localeCompare(b.name));
  const form = sheet({
    title: id ? "Edit checklist" : "New checklist",
    body: `<label class="lbl">Name<input class="in" id="lName" name="name" required value="${esc(l.name || "")}" placeholder="e.g. Standard turnover"></label>
      <div class="grid2"><label class="lbl">Team<select class="in" id="lTeam" name="teamId"><option value="">Any team</option>${myTeams().map((t) => `<option value="${esc(t)}" ${t === l.teamId ? "selected" : ""}>${esc(teamName(t))}</option>`).join("")}</select></label>
      <label class="lbl">Property<select class="in" id="lProp" name="propertyId"><option value="">Any property</option>${props.map((p) => `<option value="${esc(p.id)}" ${p.id === l.propertyId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label></div>
      <label class="lbl">Steps<span class="hint">One step per line. Start a line with # for a section, like "# Kitchen".</span>
      <textarea class="in tall" id="lItems" name="items" required placeholder="# Kitchen&#10;Run dishwasher and empty&#10;Wipe counters&#10;# Bathrooms&#10;Restock toilet paper">${esc((l.items || []).join("\n"))}</textarea></label>
      <label class="lbl">Or load a .txt / .csv file<input class="in" type="file" id="lFile" accept=".txt,.csv,text/plain,text/csv"></label>`,
    onSubmit: (fd) => A.saveChecklist(id, {
      name: String(fd.get("name")).trim(), teamId: fd.get("teamId") || "", propertyId: fd.get("propertyId") || "",
      items: String(fd.get("items")).split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
    }),
    extra: id ? `<button type="button" class="btn danger" data-act="del-list" data-id="${esc(id)}">Delete</button>` : "",
  });
  form.querySelector("#lFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const lines = (await f.text()).split(/\r?\n/).map((s) => s.replace(/^["\s]+|["\s,]+$/g, "").replace(/^(\d+[.)]|[-*•☐□]|\[ ?\])\s*/, "").trim()).filter(Boolean);
    const ta = form.querySelector("#lItems");
    ta.value = (ta.value.trim() ? ta.value.trim() + "\n" : "") + lines.join("\n");
    const nm = form.querySelector("#lName"); if (!nm.value) nm.value = f.name.replace(/\.[^.]+$/, "");
  });
}

// ---------------- Properties ----------------
export function propertiesView() {
  const ps = [...S.props.values()].sort((a, b) => a.name.localeCompare(b.name));
  let h = `<div class="row between"><h2>Properties</h2>${isMgr() ? `<button class="btn primary" data-act="new-prop">+ Add property</button>` : ""}</div>`;
  if (!ps.length) return h + `<div class="empty"><p>Add each rental and site you service. Jobs, checklists and costs are tracked per property.</p></div>`;
  return h + `<div class="list">${ps.map((p) => {
    let open = 0; S.jobs.forEach((j) => { if (j.propertyId === p.id && j.status !== "done") open++; });
    return `<div class="panel"><div class="row between"><div class="minw0"><strong>${esc(p.name)}</strong>${p.address ? `<div class="muted small">${esc(p.address)}</div>` : ""}</div>
      ${isMgr() ? `<button class="btn sm" data-act="edit-prop" data-id="${esc(p.id)}">Edit</button>` : ""}</div>
      <div class="muted small">${open} open job${open === 1 ? "" : "s"}</div>
      ${p.info ? `<details><summary>Property info</summary><p class="notes">${esc(p.info)}</p></details>` : ""}</div>`;
  }).join("")}</div>`;
}

function propSheet(id) {
  const p = id ? S.props.get(id) : {};
  sheet({
    title: id ? "Edit property" : "Add property",
    body: `<label class="lbl">Name<input class="in" id="prName" name="name" required value="${esc(p.name || "")}" placeholder="e.g. Lakeview Cabin"></label>
      <label class="lbl">Address<input class="in" id="prAddr" name="address" value="${esc(p.address || "")}"></label>
      <label class="lbl">Property info for the crew<span class="hint">Water shutoff, breaker box, filter sizes, appliance models, paint colors. Everyone on the crew can read this, so leave out door codes.</span>
      <textarea class="in tall" id="prInfo" name="info">${esc(p.info || "")}</textarea></label>`,
    onSubmit: (fd) => A.saveProperty(id, { name: String(fd.get("name")).trim(), address: String(fd.get("address") || "").trim(), info: String(fd.get("info") || "").trim() }),
    extra: id && isOwner() ? `<button type="button" class="btn danger" data-act="del-prop" data-id="${esc(id)}">Delete</button>` : "",
  });
}

// ---------------- Team (owner) ----------------
let invites = new Map();
let inviteUnsub = null;
function watchInvites() {
  if (inviteUnsub || !isOwner()) return;
  inviteUnsub = onSnapshot(collection(db, "invites"), (snap) => {
    invites = new Map(snap.docs.map((d) => [d.id, d.data()]));
    rerender();
  }, () => {});
}
export function stopAdmin() { if (inviteUnsub) { inviteUnsub(); inviteUnsub = null; } }

export function teamView() {
  if (!isOwner()) return `<div class="empty"><p>Only the owner can manage the team.</p></div>`;
  watchInvites();
  const teams = [...S.teams.values()].sort((a, b) => a.name.localeCompare(b.name));
  const people = [...S.people.values()].sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.name.localeCompare(b.name)));
  const joinedKeys = new Set(people.flatMap((p) => [p.phone, p.email].filter(Boolean)));
  const pending = [...invites.entries()].filter(([k]) => !joinedKeys.has(k));

  let h = `<div class="row between"><h2>Team</h2><button class="btn primary" data-act="invite" ${teams.length ? "" : "disabled"}>+ Add person</button></div>`;
  h += `<section class="panel"><div class="row between"><h3>Teams</h3><button class="link" data-act="new-team">+ New team</button></div>
    ${teams.length ? `<div class="chips wrap">${teams.map((t) => { const n = people.filter((p) => (p.teams || []).includes(t.id)).length; return `<span class="chip static">${esc(t.name)} · ${n}</span>`; }).join("")}</div>`
      : `<p class="muted">No teams yet.</p><button class="btn primary" data-act="setup-teams">Set up Maintenance, Construction, Ranch and Mechanic shop</button>`}</section>`;

  h += `<section class="panel"><h3>People</h3><div class="rows">${people.map((p) => `<div class="r"><span>${esc(p.name)}${p.active === false ? ` <span class="pill s-done">Off</span>` : ""}
      <small>${esc(ROLES[p.role] || p.role)} · ${p.role === "owner" ? "All teams" : (p.teams || []).map(teamName).join(", ") || "No team"} · ${esc(p.phone ? prettyPhone(p.phone) : p.email || "")}</small></span>
      ${p.role !== "owner" ? `<button class="btn sm" data-act="edit-person" data-id="${esc(p.id)}">Edit</button>` : ""}</div>`).join("")}</div></section>`;

  if (pending.length) h += `<section class="panel"><h3>Waiting to sign in</h3><div class="rows">${pending.map(([k, i]) => `<div class="r"><span>${esc(i.name)}
      <small>${esc(ROLES[i.role] || i.role)} · ${(i.teams || []).map(teamName).join(", ") || "No team"} · ${esc(k.startsWith("+") ? prettyPhone(k) : k)}</small></span>
      <button class="btn ghost sm" data-act="del-invite" data-id="${esc(k)}">Cancel</button></div>`).join("")}</div>
    <p class="muted small">Send them the app's web address. They sign in with this phone number or email and land on their team automatically.</p></section>`;

  h += `<section class="panel"><h3>What each role can do</h3><dl class="roles">
    <dt>Owner</dt><dd>Everything, including the team list and deleting records.</dd>
    <dt>Manager</dt><dd>Creates and assigns jobs for their teams, edits checklists and properties, handles requests.</dd>
    <dt>Tech</dt><dd>Works their team's jobs: checklists, time, parts, photos.</dd>
    <dt>Requester</dt><dd>Only submits requests and sees the status of their own.</dd></dl></section>`;
  return h;
}

function personFields(cur = {}) {
  const teams = [...S.teams.values()].sort((a, b) => a.name.localeCompare(b.name));
  return `<label class="lbl">Role<select class="in" id="peRole" name="role">${["tech", "manager", "requester"].map((r) => `<option value="${r}" ${cur.role === r ? "selected" : ""}>${ROLES[r]}</option>`).join("")}</select></label>
    <fieldset class="lbl"><legend>Teams</legend><div class="checks">${teams.map((t) => `<label class="check-inline"><input type="checkbox" name="teams" value="${esc(t.id)}" ${(cur.teams || []).includes(t.id) ? "checked" : ""}> ${esc(t.name)}</label>`).join("")}</div>
    <span class="hint">Requesters don't need a team.</span></fieldset>`;
}

export async function onAdminClick(t) {
  const act = t.dataset.act, id = t.dataset.id;
  try {
    switch (act) {
      case "new-list": listSheet(null); return true;
      case "edit-list": listSheet(id); return true;
      case "del-list": confirmTap(t, "Tap again to delete", () => A.deleteChecklist(id).then(closeSheet).catch((x) => toast(errorText(x)))); return true;
      case "new-prop": propSheet(null); return true;
      case "edit-prop": propSheet(id); return true;
      case "del-prop": confirmTap(t, "Tap again to delete", () => A.deleteProperty(id).then(closeSheet).catch((x) => toast(errorText(x)))); return true;
      case "setup-teams": await A.setupTeams(); toast("Teams created"); return true;
      case "new-team": sheet({ title: "New team", body: `<label class="lbl">Team name<input class="in" id="tmName" name="name" required></label>`, onSubmit: (fd) => A.saveTeam(null, String(fd.get("name")).trim()) }); return true;
      case "invite": sheet({
        title: "Add person", submitLabel: "Add",
        body: `<label class="lbl">Name<input class="in" id="peName" name="name" required></label>
          <label class="lbl">Mobile number<input class="in" id="pePhone" name="phone" type="tel" placeholder="(555) 123-4567"></label>
          <label class="lbl">Or email<input class="in" id="peEmail" name="email" type="email" placeholder="Only if they won't use a phone"></label>
          ${personFields({ role: "tech" })}`,
        onSubmit: async (fd) => {
          const phone = normalizePhone(fd.get("phone"));
          const email = String(fd.get("email") || "").trim().toLowerCase();
          if (!phone && !email) throw new Error("Enter a 10-digit mobile number or an email.");
          const role = fd.get("role");
          const teams = role === "requester" ? [] : fd.getAll("teams");
          if (role !== "requester" && !teams.length) throw new Error("Pick at least one team.");
          await A.invite({ key: phone || email, name: String(fd.get("name")).trim(), role, teams });
          toast("Added. They can sign in now.");
        },
      }); return true;
      case "edit-person": {
        const p = S.people.get(id);
        sheet({
          title: `Edit ${p.name}`, body: `<label class="lbl">Name<input class="in" id="pnName" name="name" required value="${esc(p.name)}"></label>${personFields(p)}
            <label class="check-row" for="peActive"><span>Can sign in</span><input type="checkbox" id="peActive" name="active" ${p.active !== false ? "checked" : ""}></label>`,
          onSubmit: async (fd) => {
            const role = fd.get("role");
            const teams = role === "requester" ? [] : fd.getAll("teams");
            await A.updatePerson(id, { name: String(fd.get("name")).trim(), role, teams, active: fd.get("active") === "on" });
          },
        }); return true;
      }
      case "rename": sheet({ title: "Your name", body: `<label class="lbl">Name the crew sees<input class="in" id="myName" name="name" required value="${esc(S.profile.name)}"></label>`,
        onSubmit: async (fd) => { const name = String(fd.get("name")).trim(); await A.renameMe(name); S.profile.name = name; document.querySelector(".who") && (document.querySelector(".who").textContent = name); rerender(); } }); return true;
      case "del-invite": confirmTap(t, "Cancel?", () => A.removeInvite(id).catch((x) => toast(errorText(x)))); return true;
    }
  } catch (x) { toast(errorText(x)); return true; }
  return false;
}
