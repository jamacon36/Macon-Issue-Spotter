"use strict";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const KEY = "issuespotter.v1";
let DATA = [], store = load(), view = { name: "home" }, timerId = null;
let subject = localStorage.getItem("is.subject") || "All";

function load() { try { return Object.assign({ attempts: [], drafts: {} }, JSON.parse(localStorage.getItem(KEY))); } catch { return { attempts: [], drafts: {} }; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { } }
const score = r => r.reduce((a, x) => a + (x.s === "caught" ? 1 : x.s === "partial" ? .5 : 0), 0) / (r.length || 1);
const byId = id => DATA.find(q => q.id === id);
const lastAttempt = id => [...store.attempts].reverse().find(a => a.qid === id);
const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const label = q => `${q.exam} · Q${q.number} · ${q.subject || "?"}`;

function pool() { return DATA.filter(q => subject === "All" || q.subject === subject); }
function pickNext() {
  const p = pool(); if (!p.length) return null;
  const unseen = p.filter(q => !lastAttempt(q.id));
  if (unseen.length) return unseen[Math.floor(Math.random() * unseen.length)];
  return [...p].sort((a, b) => score(lastAttempt(a.id).results) - score(lastAttempt(b.id).results) || lastAttempt(a.id).ts - lastAttempt(b.id).ts)[0];
}

function go(name, extra = {}) { clearInterval(timerId); view = { name, ...extra }; render(); window.scrollTo(0, 0); }
function setHeader(t, back) { $("#title").textContent = t; $("#back").hidden = !back; }

function render() {
  const f = { home, drill, reveal, progress }[view.name]; f();
}

function home() {
  setHeader("Issue Spotter", false);
  const subs = [...new Set(DATA.map(q => q.subject).filter(Boolean))];
  const main = ["Contracts", "Torts", "Criminal Law"], rest = subs.filter(s => !main.includes(s));
  const count = s => DATA.filter(q => s === "All" || q.subject === s).length;
  const done = s => new Set(store.attempts.filter(a => s === "All" || a.subject === s).map(a => a.qid)).size;
  const chip = s => `<button class="chip ${subject === s ? "on" : ""}" data-sub="${esc(s)}">${esc(s)} <span class="small">${done(s)}/${count(s)}</span></button>`;
  const p = pool(), nextQ = pickNext();
  $("#app").innerHTML = `
    <h2>Subject</h2>
    <div class="chips">${chip("All")}${main.filter(s => subs.includes(s)).map(chip).join("")}
      <button class="chip" disabled title="No Civil Procedure content loaded yet">Civil Procedure · no content</button></div>
    ${rest.length ? `<details><summary>Other subjects (full bar exam)</summary><div class="chips">${rest.map(chip).join("")}</div></details>` : ""}
    <button class="primary" id="start" ${nextQ ? "" : "disabled"}>Start next question</button>
    <p class="mute small">Unseen questions first, then the ones you've scored lowest on. ${p.length} in this pool.</p>
    <h2>Browse</h2>${browse(p)}`;
  $("#app").querySelectorAll("[data-sub]").forEach(b => b.onclick = () => { subject = b.dataset.sub; localStorage.setItem("is.subject", subject); home(); });
  $("#start")?.addEventListener("click", () => go("drill", { id: nextQ.id }));
  $("#app").querySelectorAll("[data-q]").forEach(b => b.onclick = () => go("drill", { id: b.dataset.q }));
}
function browse(p) {
  const exams = [...new Set(p.map(q => q.exam))];
  return exams.map(e => `<details><summary>${esc(e)}</summary>${p.filter(q => q.exam === e).map(q => {
    const a = lastAttempt(q.id);
    return `<div class="card row"><div><b>Q${q.number}</b> ${esc(q.subject)} <span class="mute small">${q.issues.length} issues</span></div>
      <div>${a ? `<span class="small mute">${Math.round(score(a.results) * 100)}%</span> ` : ""}<button class="ghost" data-q="${q.id}">${a ? "Retry" : "Start"}</button></div></div>`;
  }).join("")}</details>`).join("");
}

function drill() {
  const q = byId(view.id); if (!q) return go("home");
  setHeader(label(q), true); $("#back").onclick = () => go("home");
  const t0 = Date.now();
  $("#app").innerHTML = `
    <div class="row"><span class="mute small">What issues do you spot, and what's the rule for each?</span><span class="timer" id="timer">0:00</span></div>
    <div class="card facts">${q.facts.split("\n\n").map(p => `<p>${esc(p)}</p>`).join("")}</div>
    <textarea id="notes" placeholder="Jot the issues you see (optional — it's mostly for you)…">${esc(store.drafts[q.id] || "")}</textarea>
    <button class="primary" id="reveal">Reveal answer key</button>`;
  $("#notes").oninput = e => { store.drafts[q.id] = e.target.value; save(); };
  timerId = setInterval(() => { const el = $("#timer"); if (el) el.textContent = fmt(Math.floor((Date.now() - t0) / 1000)); }, 1000);
  $("#reveal").onclick = () => go("reveal", { id: q.id, secs: Math.floor((Date.now() - t0) / 1000), results: q.issues.map(i => ({ n: i.name, s: null })) });
}

function reveal() {
  const q = byId(view.id); if (!q) return go("home");
  setHeader("Answer key", true); $("#back").onclick = () => go("drill", { id: q.id });
  const R = view.results;
  const tags = `<span class="tag ${q.confidence === "high" ? "" : "warn"}">AI draft · ${esc(q.confidence)}</span>` +
    (q.keyQuality === "facts-only" ? `<span class="tag warn">built from facts</span>` : "");
  $("#app").innerHTML = `
    <div class="mute small">${esc(label(q))} ${tags}</div>
    ${store.drafts[q.id] ? `<details><summary>Your notes</summary><div class="card ans">${esc(store.drafts[q.id])}</div></details>` : ""}
    ${q.notes ? `<details><summary>Reviewer notes on this key</summary><div class="card small">${esc(q.notes)}</div></details>` : ""}
    <p class="mute small">Mark each issue: did you catch it?</p>
    ${q.issues.map((i, k) => `<div class="card issue" id="i${k}">
      <div class="name">${k + 1}. ${esc(i.name)}${i.priority === "major" ? '<span class="tag major">major</span>' : ""}</div>
      <div class="seg" data-k="${k}"><button class="caught">✓ Caught</button><button class="partial">~ Partial</button><button class="missed">✗ Missed</button></div>
      <div class="rule"><b>Rule:</b> ${esc(i.rule)}</div>
      <details><summary>Key facts &amp; analysis</summary>
        <ul class="kf">${(i.keyFacts || []).map(f => `<li>${esc(f)}</li>`).join("")}</ul>
        <div class="small">${esc(i.analysis)}</div>
        ${i.foundIn ? `<div class="mute small">Student answers that addressed it: ${i.foundIn.length ? i.foundIn.join(", ") : "neither"}</div>` : ""}
      </details></div>`).join("")}
    <details><summary>How two passing students answered</summary>
      ${q.answers.map(a => `<details><summary>Answer ${esc(a.label)}</summary><div class="ans">${esc(a.text)}</div></details>`).join("")}
    </details>
    <div class="card row"><span>Score</span><span class="score" id="sc">–</span></div>
    <button class="primary" id="save">Save &amp; finish</button>`;
  const paint = () => {
    $("#app").querySelectorAll(".seg").forEach(sg => sg.querySelectorAll("button").forEach(b => b.classList.toggle("on", R[sg.dataset.k].s === b.className.split(" ")[0])));
    const rated = R.filter(r => r.s).length;
    $("#sc").textContent = rated ? Math.round(score(R.map(r => ({ s: r.s || "missed" }))) * 100) + "%" : "–";
  };
  $("#app").querySelectorAll(".seg").forEach(sg => sg.querySelectorAll("button").forEach(b => b.onclick = () => { R[sg.dataset.k].s = b.className.split(" ")[0]; paint(); }));
  paint();
  $("#save").onclick = () => {
    const results = R.map(r => ({ n: r.n, s: r.s || "missed" }));
    store.attempts.push({ qid: q.id, subject: q.subject, ts: Date.now(), secs: view.secs, results });
    delete store.drafts[q.id]; save();
    summary(q, results);
  };
}
function summary(q, results) {
  setHeader("Done", false);
  const n = s => results.filter(r => r.s === s).length, nxt = pickNext();
  $("#app").innerHTML = `<div class="card"><div class="score">${Math.round(score(results) * 100)}%</div>
    <div>${n("caught")} caught · ${n("partial")} partial · ${n("missed")} missed</div>
    ${n("missed") ? `<h3 style="margin-top:12px">Missed</h3><ul>${results.filter(r => r.s === "missed").map(r => `<li>${esc(r.n)}</li>`).join("")}</ul>` : ""}</div>
    <button class="primary" id="n">Next question</button><button class="ghost" id="h" style="width:100%">Home</button>`;
  $("#n").onclick = () => go("drill", { id: nxt.id }); $("#h").onclick = () => go("home");
}

function progress() {
  setHeader("Progress", false);
  const A = store.attempts;
  if (!A.length) { $("#app").innerHTML = `<div class="card">No attempts yet. Do a question and your stats show up here.</div>` + dataTools(); wireTools(); return; }
  const subs = [...new Set(A.map(a => a.subject))];
  const pct = list => Math.round(list.reduce((s, a) => s + score(a.results), 0) / list.length * 100);
  const missed = {};
  A.forEach(a => a.results.forEach(r => { if (r.s !== "caught") { const k = a.qid + "|" + r.n; missed[k] = missed[k] || { qid: a.qid, n: r.n, c: 0, last: 0 }; missed[k].c += r.s === "missed" ? 1 : .5; missed[k].last = a.ts; } }));
  // an issue you later caught fully stops counting as weak
  A.forEach(a => a.results.forEach(r => { const m = missed[a.qid + "|" + r.n]; if (m && r.s === "caught" && a.ts > m.last) delete missed[a.qid + "|" + r.n]; }));
  const weak = Object.values(missed).sort((a, b) => b.c - a.c).slice(0, 12);
  $("#app").innerHTML = `
    <div class="card row"><div><div class="mute small">Overall catch rate</div><div class="score">${pct(A)}%</div></div><div class="mute small">${A.length} attempts<br>${new Set(A.map(a => a.qid)).size} questions</div></div>
    <h2>By subject</h2>${subs.map(s => { const l = A.filter(a => a.subject === s); return `<div class="card"><div class="row"><b>${esc(s)}</b><span>${pct(l)}% <span class="mute small">(${l.length})</span></span></div><div class="bar"><i style="width:${pct(l)}%"></i></div></div>`; }).join("")}
    <h2>Weak spots</h2>${weak.length ? weak.map(w => { const q = byId(w.qid); return `<div class="card row"><div>${esc(w.n)}<div class="mute small">${q ? esc(label(q)) : ""}</div></div>${q ? `<button class="ghost" data-q="${q.id}">Retry</button>` : ""}</div>`; }).join("") : `<div class="card mute">Nothing outstanding 🎉</div>`}
    ${dataTools()}`;
  $("#app").querySelectorAll("[data-q]").forEach(b => b.onclick = () => go("drill", { id: b.dataset.q }));
  wireTools();
}
const dataTools = () => `<h2>Your data</h2><div class="card"><p class="mute small">Progress lives only in this browser. Export a backup now and then.</p>
  <button class="ghost" id="exp">Export backup</button> <button class="ghost" id="imp">Import</button><input type="file" id="file" accept="application/json" hidden></div>`;
function wireTools() {
  $("#exp").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(store)], { type: "application/json" })); a.download = "issue-spotter-backup.json"; a.click(); };
  $("#imp").onclick = () => $("#file").click();
  $("#file").onchange = async e => { try { const j = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(j.attempts)) throw 0; store = Object.assign({ attempts: [], drafts: {} }, j); save(); progress(); } catch { alert("That file doesn't look like a backup."); } };
}

document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
fetch("patterns.json").then(r => r.json()).then(d => { DATA = d; render(); }).catch(() => { $("#app").innerHTML = '<div class="card">Could not load questions.</div>'; });
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => { });
