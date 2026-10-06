import { firebaseConfig } from "./firebase-config.js";
import { LANGUAGES, HELPER_NAMES, LEVELS, PASS_SCORE } from "./data.js";

window.__taalreisStarted = true;

const app = document.getElementById("app");
const syncStatus = document.getElementById("sync-status");
const LS_KEY = "taalreis-voortgang";

// ---------- Voortgang (localStorage + Firebase) ----------
let progress = loadLocal(); // { en: { 1: 3, 2: 2 }, ... }  -> sterren per level
let cloud = null; // { setDoc, docRef }

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveProgress() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(progress));
  } catch {}
  if (cloud) {
    cloud.setDoc(cloud.docRef, { progress, updatedAt: Date.now() }).catch(() => setSync("Opslaan mislukt", false));
  }
}

function setSync(text, ok) {
  syncStatus.textContent = text;
  syncStatus.className = ok ? "ok" : "";
}

// Voorkomt dat een trage of niet-werkende Firebase-verbinding de site laat hangen.
function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function initFirebase() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("JOUW")) {
    return; // geen Firebase ingesteld: alles blijft lokaal, geen melding nodig
  }
  try {
    const v = "10.14.1";
    const base = `https://www.gstatic.com/firebasejs/${v}/`;
    const [{ initializeApp }, authMod, fsMod] = await withTimeout(
      Promise.all([
        import(base + "firebase-app.js"),
        import(base + "firebase-auth.js"),
        import(base + "firebase-firestore.js"),
      ])
    );
    const fbApp = initializeApp(firebaseConfig);
    const auth = authMod.getAuth(fbApp);
    const cred = await withTimeout(authMod.signInAnonymously(auth));
    const db = fsMod.getFirestore(fbApp);
    const docRef = fsMod.doc(db, "users", cred.user.uid);
    const snap = await withTimeout(fsMod.getDoc(docRef));
    if (snap.exists()) {
      progress = mergeProgress(progress, snap.data().progress || {});
    }
    cloud = { setDoc: fsMod.setDoc, docRef };
    saveProgress();
    setSync("Opgeslagen in de cloud", true);
    // Alleen opnieuw tekenen op het begin- of levelscherm, niet midden in een les
    if (state.screen === "home" || state.screen === "levels") render();
  } catch (e) {
    console.error(e);
    setSync("Lokaal opgeslagen", false);
  }
}

function mergeProgress(a, b) {
  const out = {};
  for (const lang of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out[lang] = {};
    const la = a[lang] || {};
    const lb = b[lang] || {};
    for (const lvl of new Set([...Object.keys(la), ...Object.keys(lb)])) {
      out[lang][lvl] = Math.max(la[lvl] || 0, lb[lvl] || 0);
    }
  }
  return out;
}

function stars(lang, levelId) {
  return (progress[lang] && progress[lang][levelId]) || 0;
}

function isUnlocked(lang, levelId) {
  return levelId === 1 || stars(lang, levelId - 1) > 0;
}

// ---------- Hulpfuncties ----------
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’`´]/g, "'")
    .replace(/œ/g, "oe")
    .replace(/\s+/g, " ")
    .trim();
}

function speak(text, langCode) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = langCode;
  u.rate = 0.85;
  window.speechSynthesis.speak(u);
}

function starsHtml(n) {
  return "★".repeat(n) + "☆".repeat(3 - n);
}

// ---------- Staat ----------
const state = { screen: "home", lang: null, level: null, quiz: null };

function go(screen, extra = {}) {
  Object.assign(state, { screen }, extra);
  render();
  window.scrollTo(0, 0);
}

function render() {
  if (state.screen === "home") renderHome();
  else if (state.screen === "levels") renderLevels();
  else if (state.screen === "lesson") renderQuestion();
  else if (state.screen === "result") renderResult();
}

// ---------- Schermen ----------
function renderHome() {
  document.body.style.setProperty("--accent", "#6c5ce7");
  app.innerHTML = `
    <section class="hero">
      <h1>Taalreis 🌍</h1>
      <p>Leer nieuwe woordjes, level voor level. Kies een taal om te beginnen!</p>
    </section>
    <section class="lang-grid">
      ${Object.entries(LANGUAGES)
        .map(([code, l]) => {
          const done = LEVELS.filter((lv) => stars(code, lv.id) > 0).length;
          return `
          <button class="lang-card" data-lang="${code}" style="--card:${l.color}">
            <span class="flag">${l.flag}</span>
            <span class="lang-name">${l.name}</span>
            <span class="lang-sub">${done} van ${LEVELS.length} levels gehaald</span>
          </button>`;
        })
        .join("")}
    </section>`;
  app.querySelectorAll(".lang-card").forEach((b) =>
    b.addEventListener("click", () => go("levels", { lang: b.dataset.lang }))
  );
}

function renderLevels() {
  const l = LANGUAGES[state.lang];
  document.body.style.setProperty("--accent", l.color);
  app.innerHTML = `
    <button class="back" id="back">← Andere taal</button>
    <section class="hero small">
      <h1>${l.flag} ${l.name} voor beginners</h1>
      <p>Haal minstens ${PASS_SCORE} van de ${LEVELS[0].words.length} goed om het volgende level te openen.</p>
    </section>
    <section class="level-list">
      ${LEVELS.map((lv) => {
        const open = isUnlocked(state.lang, lv.id);
        const s = stars(state.lang, lv.id);
        return `
        <button class="level ${open ? "" : "locked"}" data-level="${lv.id}" ${open ? "" : "disabled"}>
          <span class="level-icon">${open ? lv.icon : "🔒"}</span>
          <span class="level-info">
            <strong>Level ${lv.id}: ${lv.title}</strong>
            <span class="level-stars">${open ? starsHtml(s) : "Haal eerst het vorige level"}</span>
          </span>
        </button>`;
      }).join("")}
    </section>`;
  document.getElementById("back").addEventListener("click", () => go("home"));
  app.querySelectorAll(".level:not(.locked)").forEach((b) =>
    b.addEventListener("click", () => startLesson(Number(b.dataset.level)))
  );
}

function startLesson(levelId) {
  const level = LEVELS.find((l) => l.id === levelId);
  const words = shuffle(level.words);
  const questions = words.map((w, i) => ({ word: w, type: i % 2 === 0 ? "choice" : "type" }));
  state.level = level;
  state.quiz = { questions: shuffle(questions), index: 0, score: 0, answered: false };
  go("lesson");
}

function renderQuestion() {
  const { quiz, lang, level } = state;
  const l = LANGUAGES[lang];
  const q = quiz.questions[quiz.index];
  const target = q.word[lang];
  const helper = q.word[l.helper];
  const progressPct = (quiz.index / quiz.questions.length) * 100;

  let body = "";
  if (q.type === "choice") {
    const others = shuffle(level.words.filter((w) => w !== q.word)).slice(0, 3);
    const options = shuffle([q.word, ...others]).map((w) => w[l.helper]);
    body = `
      <p class="prompt-label">Wat betekent dit in het ${HELPER_NAMES[l.helper]}?</p>
      <div class="word-big">${target} <button class="speak" id="speak" title="Uitspraak">🔊</button></div>
      <div class="options">
        ${options.map((o) => `<button class="option" data-answer="${o}">${o}</button>`).join("")}
      </div>`;
  } else {
    body = `
      <p class="prompt-label">Hoe zeg je dit in het ${l.name}?</p>
      <div class="word-big">${helper}</div>
      <form id="type-form" autocomplete="off">
        <input id="type-input" type="text" placeholder="Typ het woord…" autocapitalize="none" autocorrect="off" spellcheck="false" />
        <button class="primary" type="submit">Controleer</button>
      </form>`;
  }

  app.innerHTML = `
    <div class="lesson-top">
      <button class="back" id="quit">✕</button>
      <div class="bar"><div class="bar-fill" style="width:${progressPct}%"></div></div>
      <span class="counter">${quiz.index + 1}/${quiz.questions.length}</span>
    </div>
    <section class="card question">${body}<div id="feedback" class="feedback" aria-live="polite"></div></section>`;

  document.getElementById("quit").addEventListener("click", () => go("levels"));

  if (q.type === "choice") {
    document.getElementById("speak").addEventListener("click", () => speak(target, l.speech));
    app.querySelectorAll(".option").forEach((b) =>
      b.addEventListener("click", () => checkAnswer(b.dataset.answer === helper, helper, b))
    );
  } else {
    const input = document.getElementById("type-input");
    input.focus();
    document.getElementById("type-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (quiz.answered) return;
      checkAnswer(normalize(input.value) === normalize(target), target, null);
    });
  }
}

function checkAnswer(correct, right, clickedBtn) {
  const { quiz, lang } = state;
  if (quiz.answered) return;
  quiz.answered = true;
  if (correct) quiz.score++;

  app.querySelectorAll(".option").forEach((b) => {
    b.disabled = true;
    if (b.dataset.answer === right) b.classList.add("right");
  });
  if (clickedBtn && !correct) clickedBtn.classList.add("wrong");
  const input = document.getElementById("type-input");
  if (input) {
    input.disabled = true;
    input.classList.add(correct ? "right" : "wrong");
    document.querySelector("#type-form .primary").style.display = "none";
  }

  const last = quiz.index === quiz.questions.length - 1;
  document.getElementById("feedback").innerHTML = `
    <p class="${correct ? "good" : "bad"}">${correct ? "Goed zo! 🎉" : `Helaas. Het juiste antwoord is: <strong>${right}</strong>`}</p>
    <button class="primary" id="next">${last ? "Klaar" : "Volgende"}</button>`;
  const next = document.getElementById("next");
  next.focus();
  next.addEventListener("click", () => {
    quiz.answered = false;
    quiz.index++;
    if (quiz.index >= quiz.questions.length) finishLesson();
    else renderQuestion();
  });
  if (correct) speak(state.quiz.questions[quiz.index].word[lang], LANGUAGES[lang].speech);
}

function finishLesson() {
  const { quiz, lang, level } = state;
  const total = quiz.questions.length;
  const passed = quiz.score >= PASS_SCORE;
  let s = 0;
  if (passed) s = quiz.score === total ? 3 : quiz.score === total - 1 ? 2 : 1;
  if (!progress[lang]) progress[lang] = {};
  if (s > (progress[lang][level.id] || 0)) {
    progress[lang][level.id] = s;
    saveProgress();
  }
  quiz.stars = s;
  quiz.passed = passed;
  go("result");
}

function renderResult() {
  const { quiz, level, lang } = state;
  const total = quiz.questions.length;
  const nextLevel = LEVELS.find((l) => l.id === level.id + 1);
  app.innerHTML = `
    <section class="card result">
      <div class="big-emoji">${quiz.passed ? "🏆" : "💪"}</div>
      <h2>${quiz.passed ? "Level gehaald!" : "Bijna!"}</h2>
      <p class="score">${quiz.score} van ${total} goed</p>
      <p class="level-stars big">${starsHtml(quiz.stars)}</p>
      <p>${
        quiz.passed
          ? nextLevel
            ? `Level ${nextLevel.id} (${nextLevel.title}) is nu open.`
            : "Je hebt alle levels van deze taal gehaald. Knap!"
          : `Je hebt minstens ${PASS_SCORE} goede antwoorden nodig. Probeer het nog eens!`
      }</p>
      <div class="row">
        <button class="secondary" id="again">Opnieuw</button>
        ${quiz.passed && nextLevel ? `<button class="primary" id="go-next">Volgend level</button>` : ""}
        <button class="secondary" id="to-levels">Overzicht</button>
      </div>
    </section>`;
  document.getElementById("again").addEventListener("click", () => startLesson(level.id));
  document.getElementById("to-levels").addEventListener("click", () => go("levels"));
  const gn = document.getElementById("go-next");
  if (gn) gn.addEventListener("click", () => startLesson(nextLevel.id));
}

// ---------- Start ----------
render();
initFirebase();
