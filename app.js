// Taalreis: schermen, vragen en voortgang.
// Gebruikt data.js (LANGUAGES, HELPER_NAMES, SECTIONS, LEVELS, passScore).

const root = document.getElementById("app");
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
  // De Firebase-gegevens worden los geladen, zodat de site ook werkt als dat bestand ontbreekt
  let firebaseConfig;
  try {
    ({ firebaseConfig } = await import("./firebase-config.js"));
  } catch (e) {
    return; // geen config of geen webserver: alles blijft lokaal
  }
  if (!firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("JOUW")) {
    return;
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

// Het eerste level is open; elk volgend level opent als het vorige is gehaald.
// Zo opent een nieuw blok vanzelf als je het laatste level van het vorige blok haalt.
function isUnlocked(lang, levelId) {
  return levelId === LEVELS[0].id || stars(lang, levelId - 1) > 0;
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

// Maakt antwoorden vergelijkbaar: hoofdletters, accenten, leestekens en apostroffen tellen niet mee
function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/['’`´]/g, "")
    .replace(/[.,!?¿¡;:"“”]/g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function speak(text, langCode) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = langCode;
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
  } catch {}
}

function starsHtml(n) {
  return "★".repeat(n) + "☆".repeat(3 - n);
}

function sectionOf(level) {
  return SECTIONS.find((s) => s.id === level.sectionId);
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
  root.innerHTML = `
    <section class="hero">
      <h1>Taalreis 🌍</h1>
      <p>Leer nieuwe talen, van woordjes tot hele gesprekken. Kies een taal om te beginnen!</p>
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
  root.querySelectorAll(".lang-card").forEach((b) =>
    b.addEventListener("click", () => go("levels", { lang: b.dataset.lang }))
  );
}

function renderLevels() {
  const lang = state.lang;
  const l = LANGUAGES[lang];
  document.body.style.setProperty("--accent", l.color);

  const blocks = SECTIONS.map((s, si) => {
    const lvls = LEVELS.filter((lv) => lv.sectionId === s.id);
    const open = isUnlocked(lang, lvls[0].id);
    const done = lvls.filter((lv) => stars(lang, lv.id) > 0).length;
    if (!open) {
      const prev = SECTIONS[si - 1];
      return `
      <section class="block locked">
        <h2 class="block-title">🔒 Blok ${si + 1}: ${s.title}</h2>
        <p class="block-sub">Haal eerst alle levels van het blok ${prev ? prev.title : "ervoor"}.</p>
      </section>`;
    }
    return `
      <section class="block">
        <h2 class="block-title">${s.icon} Blok ${si + 1}: ${s.title}</h2>
        <p class="block-sub">${done} van ${lvls.length} levels gehaald · ${s.description}</p>
        <div class="level-list">
          ${lvls
            .map((lv) => {
              const unlocked = isUnlocked(lang, lv.id);
              return `
            <button class="level ${unlocked ? "" : "locked"}" data-level="${lv.id}" ${unlocked ? "" : "disabled"}>
              <span class="level-icon">${unlocked ? lv.icon : "🔒"}</span>
              <span class="level-info">
                <strong>Level ${lv.id}: ${lv.title}</strong>
                <span class="level-stars">${unlocked ? starsHtml(stars(lang, lv.id)) : "Haal eerst het vorige level"}</span>
              </span>
            </button>`;
            })
            .join("")}
        </div>
      </section>`;
  }).join("");

  root.innerHTML = `
    <button class="back" id="back">← Andere taal</button>
    <section class="hero small">
      <h1>${l.flag} ${l.name} leren</h1>
      <p>Haal minstens 75% goed om het volgende level te openen. Het wordt steeds moeilijker!</p>
    </section>
    ${blocks}`;
  document.getElementById("back").addEventListener("click", () => go("home"));
  root.querySelectorAll(".level:not(.locked)").forEach((b) =>
    b.addEventListener("click", () => startLesson(Number(b.dataset.level)))
  );
}

// ---------- Les opbouwen ----------
function startLesson(levelId) {
  const level = LEVELS.find((lv) => lv.id === levelId);
  const lang = state.lang;
  let questions;

  if (level.kind === "words") {
    questions = shuffle(level.items).map((item, i) => ({
      item,
      type: i % 2 === 0 ? "choice" : "type",
      speak: item[lang],
    }));
  } else if (level.kind === "sentences") {
    const mix = level.mix || ["choice", "build"];
    questions = shuffle(level.items).map((item, i) => ({
      item,
      type: mix[i % mix.length],
      speak: item[lang],
    }));
  } else {
    // Gesprekken: de volgorde blijft zoals in het gesprek
    questions = level.items.map((item) => ({ item, type: "reply", speak: item.reply[lang] }));
  }

  state.level = level;
  state.quiz = { questions, index: 0, score: 0, answered: false, log: [] };
  go("lesson");
}

function frame(inner, cardClass = "") {
  const { quiz } = state;
  const pct = (quiz.index / quiz.questions.length) * 100;
  root.innerHTML = `
    <div class="lesson-top">
      <button class="back" id="quit">✕</button>
      <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
      <span class="counter">${quiz.index + 1}/${quiz.questions.length}</span>
    </div>
    <section class="card question ${cardClass}">${inner}<div id="feedback" class="feedback" aria-live="polite"></div></section>`;
  document.getElementById("quit").addEventListener("click", () => go("levels"));
}

function renderQuestion() {
  const q = state.quiz.questions[state.quiz.index];
  if (q.type === "choice") qChoice(q);
  else if (q.type === "type") qType(q);
  else if (q.type === "build") qBuild(q);
  else qReply(q);
}

function bigClass() {
  return state.level.kind === "words" ? "" : "sentence";
}

// Meerkeuze: lees het woord of de zin en kies de betekenis
function qChoice(q) {
  const { lang, level } = state;
  const l = LANGUAGES[lang];
  const target = q.item[lang];
  const helper = q.item[l.helper];
  const others = shuffle(level.items.filter((w) => w !== q.item)).slice(0, 3);
  const options = shuffle([q.item, ...others]).map((w) => ({ text: w[l.helper], right: w === q.item }));
  const long = level.kind !== "words";

  frame(`
    <p class="prompt-label">Wat betekent dit in het ${HELPER_NAMES[l.helper]}?</p>
    <div class="word-big ${bigClass()}"><span id="prompt-text">${esc(target)}</span> <button class="speak" id="speak" title="Uitspraak">🔊</button></div>
    <div class="options ${long ? "long" : ""}">
      ${options.map((o, i) => `<button class="option" data-i="${i}" ${o.right ? 'data-right="1"' : ""}>${esc(o.text)}</button>`).join("")}
    </div>`);

  document.getElementById("speak").addEventListener("click", () => speak(target, l.speech));
  root.querySelectorAll(".option").forEach((b) =>
    b.addEventListener("click", () => checkAnswer(options[Number(b.dataset.i)].right, helper, b))
  );
}

// Typen: lees de vertaling en typ het woord of de zin
function qType(q) {
  const { lang } = state;
  const l = LANGUAGES[lang];
  const target = q.item[lang];
  const helper = q.item[l.helper];

  frame(`
    <p class="prompt-label">Hoe zeg je dit in het ${l.name}?</p>
    <div class="word-big ${bigClass()}"><span id="prompt-text">${esc(helper)}</span></div>
    <form id="type-form" autocomplete="off">
      <input id="type-input" type="text" placeholder="Typ het ${state.level.kind === "words" ? "woord" : "antwoord"}…" autocapitalize="none" autocorrect="off" spellcheck="false" />
      <button class="primary" type="submit">Controleer</button>
    </form>`);

  const input = document.getElementById("type-input");
  input.focus();
  document.getElementById("type-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (state.quiz.answered) return;
    checkAnswer(normalize(input.value) === normalize(target), target, null);
  });
}

// Zin bouwen: tik de woorden in de goede volgorde (met extra woorden die er niet bij horen)
function qBuild(q) {
  const { lang, level } = state;
  const l = LANGUAGES[lang];
  const target = q.item[lang];
  const helper = q.item[l.helper];
  const tokens = target.split(" ");
  const have = new Set(tokens.map(normalize));

  const seen = new Set();
  const pool = level.items
    .filter((it) => it !== q.item)
    .flatMap((it) => it[lang].split(" "))
    .filter((t) => {
      const n = normalize(t);
      if (!n || have.has(n) || seen.has(n)) return false;
      seen.add(n);
      return true;
    });
  const extra = shuffle(pool).slice(0, level.distractors || 0);

  const bank = shuffle([...tokens, ...extra].map((t, id) => ({ id, t })));
  const chosen = [];

  frame(`
    <p class="prompt-label">Zet de zin in het ${l.name} in de goede volgorde</p>
    <div class="word-big sentence"><span id="prompt-text">${esc(helper)}</span></div>
    <div id="answer-line" class="answer-line"></div>
    <div id="bank" class="bank"></div>
    <button class="primary" id="check" disabled>Controleer</button>`);

  const line = document.getElementById("answer-line");
  const bankEl = document.getElementById("bank");
  const checkBtn = document.getElementById("check");

  function draw() {
    line.innerHTML = chosen
      .map((c) => `<button class="chip chosen" data-id="${c.id}">${esc(c.t)}</button>`)
      .join("");
    bankEl.innerHTML = bank
      .map((c) => `<button class="chip ${chosen.includes(c) ? "used" : ""}" data-id="${c.id}" ${chosen.includes(c) ? "disabled" : ""}>${esc(c.t)}</button>`)
      .join("");
    checkBtn.disabled = chosen.length === 0;
    line.querySelectorAll(".chip").forEach((b) =>
      b.addEventListener("click", () => {
        if (state.quiz.answered) return;
        const i = chosen.findIndex((c) => c.id === Number(b.dataset.id));
        if (i >= 0) chosen.splice(i, 1);
        draw();
      })
    );
    bankEl.querySelectorAll(".chip:not(.used)").forEach((b) =>
      b.addEventListener("click", () => {
        if (state.quiz.answered) return;
        chosen.push(bank.find((c) => c.id === Number(b.dataset.id)));
        draw();
      })
    );
  }
  draw();

  checkBtn.addEventListener("click", () => {
    if (state.quiz.answered || chosen.length === 0) return;
    const given = chosen.map((c) => c.t).join(" ");
    checkAnswer(normalize(given) === normalize(target), target, null);
  });
}

// Gesprek: de ander zegt iets, jij kiest het goede antwoord
function qReply(q) {
  const { lang, level, quiz } = state;
  const l = LANGUAGES[lang];
  const it = q.item;
  const others = shuffle(level.items.filter((x) => x !== it)).slice(0, 3);
  const options = shuffle([it, ...others]).map((x) => ({
    text: x.reply[lang],
    tr: x.reply[l.helper],
    right: x === it,
  }));
  const bubbles = quiz.log.map((m) => `<div class="bubble ${m.who}">${esc(m.text)}</div>`).join("");

  frame(
    `
    <div class="chat">
      ${bubbles}
      <div class="bubble them current">
        <span id="prompt-text">${esc(it.say[lang])}</span>
        <button class="speak small" id="speak" title="Uitspraak">🔊</button>
        <div class="tr">${esc(it.say[l.helper])}</div>
      </div>
    </div>
    <p class="prompt-label">Wat zeg jij?</p>
    <div class="options long">
      ${options
        .map(
          (o, i) =>
            `<button class="option" data-i="${i}" ${o.right ? 'data-right="1"' : ""}><span>${esc(o.text)}</span><span class="tr">${esc(o.tr)}</span></button>`
        )
        .join("")}
    </div>
    <button class="hint-btn" id="hint" type="button">💡 Vertaling aan/uit</button>`,
    level.showHint ? "show-hint" : ""
  );

  document.getElementById("speak").addEventListener("click", () => speak(it.say[lang], l.speech));
  document.getElementById("hint").addEventListener("click", () =>
    document.querySelector(".card.question").classList.toggle("show-hint")
  );
  root.querySelectorAll(".option").forEach((b) =>
    b.addEventListener("click", () => {
      const o = options[Number(b.dataset.i)];
      checkAnswer(o.right, it.reply[lang], b, `Dat betekent: ${it.reply[l.helper]}`);
    })
  );
}

function checkAnswer(correct, right, clickedBtn, note) {
  const { quiz, lang } = state;
  if (quiz.answered) return;
  quiz.answered = true;
  if (correct) quiz.score++;
  const q = quiz.questions[quiz.index];

  root.querySelectorAll(".option").forEach((b) => {
    b.disabled = true;
    if (b.dataset.right) b.classList.add("right");
  });
  if (clickedBtn && !correct) clickedBtn.classList.add("wrong");

  const input = document.getElementById("type-input");
  if (input) {
    input.disabled = true;
    input.classList.add(correct ? "right" : "wrong");
    document.querySelector("#type-form .primary").style.display = "none";
  }

  const line = document.getElementById("answer-line");
  if (line) {
    line.classList.add(correct ? "right" : "wrong");
    root.querySelectorAll(".chip").forEach((b) => (b.disabled = true));
    document.getElementById("check").style.display = "none";
  }

  if (q.type === "reply") {
    quiz.log.push({ who: "them", text: q.item.say[lang] }, { who: "you", text: q.item.reply[lang] });
    const hint = document.getElementById("hint");
    if (hint) hint.style.display = "none";
  }

  const last = quiz.index === quiz.questions.length - 1;
  document.getElementById("feedback").innerHTML = `
    <p class="${correct ? "good" : "bad"}">${correct ? "Goed zo! 🎉" : `Helaas. Het juiste antwoord is: <strong>${esc(right)}</strong>`}</p>
    ${note ? `<p class="note">${esc(note)}</p>` : ""}
    <button class="primary" id="next">${last ? "Klaar" : "Volgende"}</button>`;
  const next = document.getElementById("next");
  next.focus();
  next.addEventListener("click", () => {
    quiz.answered = false;
    quiz.index++;
    if (quiz.index >= quiz.questions.length) finishLesson();
    else {
      renderQuestion();
      window.scrollTo(0, 0);
    }
  });
  if (correct) speak(q.speak, LANGUAGES[lang].speech);
}

function finishLesson() {
  const { quiz, lang, level } = state;
  const total = quiz.questions.length;
  const passed = quiz.score >= passScore(level);
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
  const { quiz, level } = state;
  const total = quiz.questions.length;
  const nextLevel = LEVELS.find((lv) => lv.id === level.id + 1);
  const newBlock = nextLevel && nextLevel.sectionId !== level.sectionId ? sectionOf(nextLevel) : null;

  let message;
  if (!quiz.passed) {
    message = `Je hebt minstens ${passScore(level)} goede antwoorden nodig. Probeer het nog eens!`;
  } else if (newBlock) {
    message = `Het hele blok ${sectionOf(level).title} is gehaald! Nieuw blok open: ${newBlock.icon} ${newBlock.title}.`;
  } else if (nextLevel) {
    message = `Level ${nextLevel.id} (${nextLevel.title}) is nu open.`;
  } else {
    message = "Je hebt alle blokken van deze taal gehaald. Knap!";
  }

  root.innerHTML = `
    <section class="card result">
      <div class="big-emoji">${quiz.passed ? (newBlock ? "🎉" : "🏆") : "💪"}</div>
      <h2>${quiz.passed ? "Level gehaald!" : "Bijna!"}</h2>
      <p class="score">${quiz.score} van ${total} goed</p>
      <p class="level-stars big">${starsHtml(quiz.stars)}</p>
      <p>${message}</p>
      <div class="row">
        <button class="secondary" id="again">Opnieuw</button>
        ${quiz.passed && nextLevel ? `<button class="primary" id="go-next">${newBlock ? "Naar het nieuwe blok" : "Volgend level"}</button>` : ""}
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
