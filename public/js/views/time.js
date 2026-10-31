// "My time": the running clock and this week's entries.
import { S } from "../store.js";
import * as A from "../actions.js";
import { esc, fmtMinutes, fmtClock, fmtTime, toast, errorText } from "../ui.js";

let weekOffset = 0;
let rerender = () => {};
export function setRerender(fn) { rerender = fn; }

function weekStart(offset) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow + offset * 7);
  return d;
}

export function timeView() {
  const start = weekStart(weekOffset);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  const entries = [...S.myTime.values()].filter((e) => e.start >= start.getTime() && e.start < end.getTime()).sort((a, b) => b.start - a.start);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  const perDay = days.map((d) => entries.filter((e) => new Date(e.start).toDateString() === d.toDateString()).reduce((a, e) => a + e.minutes, 0));
  const total = perDay.reduce((a, b) => a + b, 0);
  const max = Math.max(60, ...perDay);
  const c = S.clock;

  let h = `<div><p class="eyebrow">${weekOffset === 0 ? "This week" : `Week of ${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}</p><h2>My time</h2></div>`;
  h += c ? `<section class="clockcard"><p class="live"><span class="dot"></span>On the clock since ${fmtTime(c.start)}</p>
      <p class="big mono" data-since="${c.start}">${fmtClock(Date.now() - c.start)}</p>
      <p><a href="#/job/${esc(c.jobId)}">${esc(c.jobNumber)} · ${esc(c.jobTitle)}</a></p>
      <button class="btn light block" data-act="clock-out-t">Clock out</button></section>`
    : `<section class="panel"><p class="muted">You're not clocked in. Open a job and tap <strong>Clock in on this job</strong>.</p><a class="btn" href="#/jobs">Go to jobs</a></section>`;

  h += `<section class="panel"><div class="row between"><h3>Hours</h3><b class="num big2">${(total / 60).toFixed(1)} hrs</b></div>
    <div class="bars" role="img" aria-label="Hours per day this week">${days.map((d, i) => `<div class="barcol"><span class="small num">${perDay[i] ? (perDay[i] / 60).toFixed(1) : ""}</span><i style="height:${Math.round((perDay[i] / max) * 90)}px" class="${d.toDateString() === new Date().toDateString() ? "now" : ""}"></i><span class="small">${"MTWTFSS"[i]}</span></div>`).join("")}</div>
    <div class="row between"><button class="btn sm" data-act="week" data-v="-1">← Earlier</button>${weekOffset < 0 ? `<button class="btn sm" data-act="week" data-v="1">Later →</button>` : ""}</div></section>`;

  h += entries.length ? `<section class="panel"><div class="rows">${entries.map((e) => `<div class="r"><span><a href="#/job/${esc(e.jobId)}">${esc(e.jobNumber)} · ${esc(e.jobTitle)}</a>
      <small>${new Date(e.start).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${fmtTime(e.start)}–${fmtTime(e.end)}${e.manual ? " · added by hand" : ""}</small></span><b class="num">${fmtMinutes(e.minutes)}</b></div>`).join("")}</div></section>`
    : `<div class="empty"><p>No time logged this week.</p></div>`;
  return h;
}

export async function onTimeClick(t) {
  if (t.dataset.act === "week") { weekOffset = Math.min(0, weekOffset + Number(t.dataset.v)); rerender(); return true; }
  if (t.dataset.act === "clock-out-t") { try { await A.clockOut(); toast("Clocked out. Time saved to the job."); } catch (x) { toast(errorText(x)); } return true; }
  return false;
}
