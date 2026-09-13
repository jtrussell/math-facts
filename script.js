(function () {
const $ = (id) => document.getElementById(id);
const TARGET = 50;
const MILESTONES = [5, 15, 35];
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const GOOD_WORDS = ["Yes!", "Nailed it!", "Correct!", "Boom!", "You got it!", "Nice one!", "Exactly!"];
const MILESTONE_WORDS = { 5: "5 points — great start!", 15: "15 — you're rolling!", 35: "35 — almost there!" };

// ---------- State ----------
const defaults = {
  mult: true,
  div: true,
  facts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  mode: "survival",
};
let settings = load("twelve.settings", defaults);
let bests = load("twelve.bests", { streak: 0, time: null });
let run = freshRun();
let problem = null;
let lastKey = null;
let locked = false;
let pendingNext = null;
let timerHandle = null;

function freshRun() {
  return { score: 0, streak: 0, startTime: null, elapsed: 0, milestones: [], done: false };
}
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    return { ...fallback, ...JSON.parse(raw) };
  } catch (e) { return { ...fallback }; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage unavailable */ }
}

// ---------- Helpers ----------
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function fmtTime(ms) {
  if (ms == null) return "—";
  const total = Math.floor(ms / 100);
  const tenths = total % 10;
  const secs = Math.floor(total / 10) % 60;
  const mins = Math.floor(total / 600);
  return `${mins}:${String(secs).padStart(2, "0")}.${tenths}`;
}

// ---------- Problem generation ----------
function universes() {
  const products = new Set();
  const quotients = new Set();
  for (const n of settings.facts) {
    quotients.add(n);
    for (let k = 1; k <= 12; k++) products.add(n * k);
  }
  return { products: [...products], quotients: [...quotients] };
}

function makeProblem() {
  const types = [];
  if (settings.mult) types.push("mult");
  if (settings.div) types.push("div");
  let p, tries = 0;
  do {
    const type = pick(types);
    const n = pick(settings.facts);
    const k = rand(1, 12);
    if (type === "mult") {
      const [a, b] = Math.random() < 0.5 ? [n, k] : [k, n];
      p = { type, a, b, op: "×", answer: a * b, key: `m${a}x${b}` };
    } else {
      p = { type, a: n * k, b: k, op: "÷", answer: n, key: `d${n * k}/${k}` };
    }
  } while (p.key === lastKey && tries++ < 12);
  lastKey = p.key;

  const u = universes();
  let pool = (p.type === "mult" ? u.products : u.quotients).filter((v) => v !== p.answer);
  if (p.type === "div" && pool.length < 2) {
    // Only one quotient selected: pad with the other 1..12 quotients.
    for (let q = 1; q <= 12; q++) if (q !== p.answer && !pool.includes(q)) pool.push(q);
  }
  let d = 1;
  while (pool.length < 2) {
    if (p.answer - d > 0 && !pool.includes(p.answer - d)) pool.push(p.answer - d);
    if (!pool.includes(p.answer + d)) pool.push(p.answer + d);
    d++;
  }
  // Bias distractors toward values near the right answer so they're plausible.
  pool.sort((x, y) => Math.abs(x - p.answer) - Math.abs(y - p.answer));
  const near = shuffle(pool.slice(0, Math.min(pool.length, 8)));
  p.options = shuffle([p.answer, near[0], near[1]]);
  return p;
}

// ---------- Rendering ----------
const el = {
  modeChip: $("modeChip"), streakBox: $("streakBox"), streakVal: $("streakVal"),
  scoreBox: $("scoreBox"), scoreVal: $("scoreVal"), timerBox: $("timerBox"), timerVal: $("timerVal"),
  progress: $("progress"), progressFill: $("progressFill"),
  problem: $("problem"), answers: $("answers"), feedback: $("feedback"),
  drawer: $("drawer"), scrim: $("scrim"), overlay: $("overlay"),
  ovTitle: $("ovTitle"), ovBig: $("ovBig"), ovSub: $("ovSub"), ovBtn: $("ovBtn"),
  toast: $("toast"), facts: $("facts"), opsNote: $("opsNote"), factsNote: $("factsNote"),
  bestStreak: $("bestStreak"), bestTime: $("bestTime"),
};

function renderHeader() {
  const m = settings.mode;
  el.modeChip.textContent = m === "practice" ? "Practice" : m === "survival" ? "Survival" : "Timed Challenge";
  el.streakBox.hidden = m !== "survival";
  el.scoreBox.hidden = m !== "timed";
  el.timerBox.hidden = m !== "timed";
  el.progress.hidden = m !== "timed";
  el.streakVal.textContent = run.streak;
  el.scoreVal.textContent = run.score;
  el.timerVal.textContent = fmtTime(run.elapsed);
  el.progressFill.style.width = `${Math.min(100, (run.score / TARGET) * 100)}%`;
  el.progress.querySelectorAll(".progress-tick").forEach((t) => {
    t.classList.toggle("hit", run.milestones.includes(Number(t.dataset.m)));
  });
}

function renderProblem() {
  el.problem.innerHTML = `${problem.a}<span class="op">${problem.op}</span>${problem.b}`;
  el.problem.classList.remove("pop");
  void el.problem.offsetWidth;
  el.problem.classList.add("pop");
  el.answers.innerHTML = "";
  problem.options.forEach((v, i) => {
    const b = document.createElement("button");
    b.className = "answer";
    b.id = `answer-${i}`;
    b.textContent = v;
    b.dataset.value = v;
    b.addEventListener("click", () => onAnswer(b, v));
    el.answers.appendChild(b);
  });
  el.feedback.textContent = "";
  el.feedback.className = "feedback";
  locked = false;
}

function renderDrawer() {
  document.querySelectorAll(".mode-opt").forEach((b) => b.classList.toggle("on", b.dataset.mode === settings.mode));
  $("op-mult").classList.toggle("on", settings.mult);
  $("op-div").classList.toggle("on", settings.div);
  el.facts.querySelectorAll(".fact").forEach((b) => b.classList.toggle("on", settings.facts.includes(Number(b.dataset.n))));
  el.bestStreak.textContent = bests.streak;
  el.bestTime.textContent = fmtTime(bests.time);
}

function nextProblem() {
  problem = makeProblem();
  renderProblem();
}

// ---------- Game flow ----------
function onAnswer(btn, value) {
  if (locked || run.done) return;
  locked = true;
  const mode = settings.mode;
  const correct = value === problem.answer;
  el.answers.querySelectorAll(".answer").forEach((b) => (b.disabled = true));

  if (mode === "timed" && run.startTime == null) {
    run.startTime = performance.now();
    startTimer();
  }

  if (correct) {
    btn.classList.add("correct");
    el.feedback.textContent = pick(GOOD_WORDS);
    el.feedback.className = "feedback good";
    if (mode === "survival") {
      run.streak += 1;
      if (run.streak > bests.streak) { bests.streak = run.streak; save("twelve.bests", bests); }
    } else if (mode === "timed") {
      run.score += 1;
      for (const m of MILESTONES) {
        if (run.score >= m && !run.milestones.includes(m)) {
          run.milestones.push(m);
          showToast(MILESTONE_WORDS[m]);
          confettiBurst(60);
        }
      }
      if (run.score >= TARGET) { finishTimed(); renderHeader(); return; }
    }
    renderHeader();
    pendingNext = setTimeout(nextProblem, 450);
  } else {
    btn.classList.add("wrong");
    el.answers.querySelectorAll(".answer").forEach((b) => {
      if (Number(b.dataset.value) === problem.answer) b.classList.add("reveal");
    });
    el.feedback.textContent = `Not quite — ${problem.a} ${problem.op} ${problem.b} = ${problem.answer}`;
    el.feedback.className = "feedback bad";
    if (mode === "survival") {
      pendingNext = setTimeout(gameOver, 1100);
    } else if (mode === "timed") {
      run.score = Math.max(0, run.score - 3);
      renderHeader();
      pendingNext = setTimeout(nextProblem, 1300);
    } else {
      pendingNext = setTimeout(nextProblem, 1300);
    }
  }
}

function gameOver() {
  run.done = true;
  const s = run.streak;
  const isBest = s > 0 && s >= bests.streak;
  el.ovTitle.textContent = s === 0 ? "Oops, first one!" : isBest ? "New record streak!" : "Streak over";
  el.ovBig.textContent = s;
  el.ovSub.textContent = s === 1 ? "1 in a row. Shake it off and go again." : `${s} in a row. Best ever: ${bests.streak}.`;
  el.ovBtn.textContent = "Try again";
  el.overlay.hidden = false;
  el.ovBtn.focus();
}

function finishTimed() {
  run.done = true;
  stopTimer();
  run.elapsed = performance.now() - run.startTime;
  const isBest = bests.time == null || run.elapsed < bests.time;
  if (isBest) { bests.time = run.elapsed; save("twelve.bests", bests); }
  el.ovTitle.textContent = isBest ? "New fastest time!" : "You made it to 50!";
  el.ovBig.textContent = fmtTime(run.elapsed);
  el.ovSub.textContent = isBest ? "That's your best ever." : `Best ever: ${fmtTime(bests.time)}.`;
  el.ovBtn.textContent = "Race again";
  el.overlay.hidden = false;
  el.ovBtn.focus();
  confettiBurst(220);
  setTimeout(() => confettiBurst(160), 500);
  setTimeout(() => confettiBurst(120), 1000);
}

function resetRun() {
  clearTimeout(pendingNext);
  stopTimer();
  run = freshRun();
  el.overlay.hidden = true;
  renderHeader();
  nextProblem();
}

function startTimer() {
  stopTimer();
  timerHandle = setInterval(() => {
    run.elapsed = performance.now() - run.startTime;
    el.timerVal.textContent = fmtTime(run.elapsed);
  }, 100);
}
function stopTimer() {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
}

el.ovBtn.addEventListener("click", resetRun);

// ---------- Toast ----------
let toastHandle = null;
function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  clearTimeout(toastHandle);
  toastHandle = setTimeout(() => el.toast.classList.remove("show"), 1800);
}

// ---------- Confetti ----------
const canvas = $("confetti");
const ctx = canvas.getContext("2d");
let particles = [];
let raf = null;
const COLORS = ["#FF7A1A", "#21A465", "#5B4BDB", "#FFC53D", "#2FB5D9", "#E5484D"];
function sizeCanvas() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener("resize", sizeCanvas);
sizeCanvas();

function confettiBurst(count) {
  if (REDUCED) return;
  const W = window.innerWidth, H = window.innerHeight;
  for (let i = 0; i < count; i++) {
    const fromLeft = Math.random() < 0.5;
    particles.push({
      x: fromLeft ? -10 : W + 10,
      y: H * (0.3 + Math.random() * 0.4),
      vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 9),
      vy: -(8 + Math.random() * 10),
      w: 6 + Math.random() * 8,
      h: 8 + Math.random() * 10,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: pick(COLORS),
      life: 160 + Math.random() * 60,
    });
  }
  if (!raf) raf = requestAnimationFrame(tick);
}
function tick() {
  const W = window.innerWidth, H = window.innerHeight;
  ctx.clearRect(0, 0, W, H);
  for (const p of particles) {
    p.vy += 0.35;
    p.vx *= 0.985;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.life -= 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 40));
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
  particles = particles.filter((p) => p.life > 0 && p.y < H + 40);
  if (particles.length) raf = requestAnimationFrame(tick);
  else { raf = null; ctx.clearRect(0, 0, W, H); }
}

// ---------- Drawer & settings ----------
function openDrawer() { el.drawer.classList.add("open"); el.scrim.classList.add("open"); renderDrawer(); }
function closeDrawer() { el.drawer.classList.remove("open"); el.scrim.classList.remove("open"); }
$("closeDrawer").addEventListener("click", closeDrawer);
el.scrim.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDrawer();
  if (e.key.toLowerCase() === "s" && !el.drawer.classList.contains("open")) openDrawer();
});

function warn(noteEl, msg, target) {
  noteEl.textContent = msg;
  noteEl.classList.add("warn");
  if (target) { target.classList.remove("shake"); void target.offsetWidth; target.classList.add("shake"); }
  setTimeout(() => { noteEl.classList.remove("warn"); noteEl.textContent = noteEl.dataset.default; }, 1600);
}
el.opsNote.dataset.default = el.opsNote.textContent;
el.factsNote.dataset.default = el.factsNote.textContent;

function commitSettings({ resetsRun }) {
  save("twelve.settings", settings);
  renderDrawer();
  if (resetsRun) resetRun();
  else { clearTimeout(pendingNext); renderHeader(); if (!run.done) nextProblem(); }
}

document.querySelectorAll(".mode-opt").forEach((b) => {
  b.addEventListener("click", () => {
    if (settings.mode === b.dataset.mode) return;
    settings.mode = b.dataset.mode;
    commitSettings({ resetsRun: true });
  });
});

document.querySelectorAll(".op-toggle").forEach((b) => {
  b.addEventListener("click", () => {
    const op = b.dataset.op;
    const other = op === "mult" ? "div" : "mult";
    if (settings[op] && !settings[other]) { warn(el.opsNote, "Keep at least one operation on.", b); return; }
    settings[op] = !settings[op];
    commitSettings({ resetsRun: false });
  });
});

for (let n = 1; n <= 12; n++) {
  const b = document.createElement("button");
  b.className = "fact";
  b.id = `fact-${n}`;
  b.dataset.n = n;
  b.textContent = n;
  b.addEventListener("click", () => {
    const on = settings.facts.includes(n);
    if (on && settings.facts.length === 1) { warn(el.factsNote, "Keep at least one number selected.", b); return; }
    settings.facts = on ? settings.facts.filter((x) => x !== n) : [...settings.facts, n].sort((a, c) => a - c);
    commitSettings({ resetsRun: false });
  });
  el.facts.appendChild(b);
}
$("allFacts").addEventListener("click", () => {
  settings.facts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  commitSettings({ resetsRun: false });
});
$("resetBests").addEventListener("click", () => {
  bests = { streak: 0, time: null };
  save("twelve.bests", bests);
  renderDrawer();
});

// ---------- Swipe detection ----------
let swipe = null;
let suppressClick = false;
document.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  swipe = { x: e.clientX, y: e.clientY, t: performance.now(), inDrawer: el.drawer.contains(e.target) };
}, { passive: true });
document.addEventListener("pointerup", (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  const dt = performance.now() - swipe.t;
  const s = swipe; swipe = null;
  if (Math.hypot(dx, dy) > 12) {
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 80);
  }
  if (dt > 900 || Math.abs(dy) > Math.abs(dx) * 0.8) return;
  const open = el.drawer.classList.contains("open");
  if (!open && dx < -70) openDrawer();
  else if (open && dx > 70 && s.inDrawer) closeDrawer();
}, { passive: true });
document.addEventListener("pointercancel", () => (swipe = null));
document.addEventListener("click", (e) => {
  if (suppressClick) { e.stopPropagation(); e.preventDefault(); }
}, true);

// ---------- Boot ----------
function boot() {
  if (!settings.mult && !settings.div) settings.mult = true;
  if (!settings.facts || !settings.facts.length) settings.facts = [...defaults.facts];
  renderDrawer();
  renderHeader();
  nextProblem();
}
boot();
})();
