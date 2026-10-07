console.log('Quiz-site app.js versie 2026-10-05-e (zelfde naam toegestaan, verdienlijst in sitebeheer)');
// ---------- Accounts (gebruikersnaam + wachtwoord) ----------
//
// Een profiel is nu een echt account. Onder water is dat een Firebase-account met
// e-mail/wachtwoord; het e-mailadres is intern (uid@quizzzzz.app) en je ziet het nooit.
// Inloggen gaat met je gebruikersnaam: we zoeken je uid op en loggen daarmee in.
// Je kunt per apparaat maximaal 2 accounts registreren (een verwijderd account telt weer niet mee).
const ACCOUNT_DOMEIN = '@quizzzzz.app';
const ACCOUNT_UID_SLEUTEL = 'quizAccountUid';
const ACCOUNT_APPARAAT_SLEUTEL = 'quizAccountOpDitApparaat';
const MAX_ACCOUNTS_PER_APPARAAT = 2;

// Op dit apparaat bewaren we een lijstje met de accounts die hier zijn gemaakt of gebruikt.
// (Vroeger stond hier alleen '1'; dat tellen we als één account.)
function apparaatAccounts() {
  const w = localStorage.getItem(ACCOUNT_APPARAAT_SLEUTEL);
  if (!w) return [];
  try {
    const lijst = JSON.parse(w);
    if (Array.isArray(lijst)) return lijst.filter(Boolean).map(String);
  } catch (e) {}
  return ['?'];
}
function bewaarApparaatAccounts(lijst) {
  if (lijst.length) localStorage.setItem(ACCOUNT_APPARAAT_SLEUTEL, JSON.stringify(lijst));
  else localStorage.removeItem(ACCOUNT_APPARAAT_SLEUTEL);
}
function apparaatIsVol() { return apparaatAccounts().length >= MAX_ACCOUNTS_PER_APPARAAT; }
function voegApparaatAccountToe(uid) {
  const lijst = apparaatAccounts();
  if (lijst.indexOf(uid) !== -1) return;
  const q = lijst.indexOf('?');
  if (q !== -1) lijst[q] = uid; else lijst.push(uid);
  bewaarApparaatAccounts(lijst);
}
function verwijderApparaatAccount(uid) {
  let lijst = apparaatAccounts();
  if (lijst.indexOf(uid) !== -1) lijst = lijst.filter(x => x !== uid);
  else if (lijst.indexOf('?') !== -1) lijst.splice(lijst.indexOf('?'), 1);
  bewaarApparaatAccounts(lijst);
}
// ---------- Bezoekmodus (alleen sitebeheer) ----------
// Bezoek je als sitebeheer een profiel, dan laden we alles van die persoon op dit apparaat
// (munten, bezit, quizzen, poppetje...). Alles wat je dan doet, wordt bij die persoon opgeslagen.
// Jouw eigen gegevens staan veilig in een reserve-kopie tot je op "Stoppen" drukt.
const BEZOEK_SLEUTEL = 'beheerBezoek';
const BEZOEK_BACKUP_SLEUTEL = 'beheerBezoekBackup';
function bezoekInfo() {
  try { const v = JSON.parse(localStorage.getItem(BEZOEK_SLEUTEL) || 'null'); return v && v.uid ? v : null; } catch (e) { return null; }
}
function bezoekUid() { const b = bezoekInfo(); return b ? b.uid : ''; }

// Deze gegevens horen bij je account en worden online bewaard (accountData/<uid>).
const ACCOUNT_DATA_SLEUTELS = ['quizAppMunten', 'eigenQuizzen', 'quizAppGekochteBoxen', 'quizAppWielLaatsteDraai', 'quizAppWielLaatsteResultaat', 'quizAppWielVandaag'];
// Alles wat bij uitloggen van dit apparaat verdwijnt (staat online veilig bij je account).
const ACCOUNT_LOKALE_SLEUTELS = ['makerNaam', 'profielDier', 'profielAccessoires', 'quizAppBezitDieren', 'quizAppBezitAccessoires',
  'quizAppBezitAantallen', 'quizAppChatGelezen', 'quizAppChatStijl', 'beheerTijdGezien', ACCOUNT_UID_SLEUTEL].concat(ACCOUNT_DATA_SLEUTELS);

function maakAccountEmail(uid) { return String(uid).toLowerCase() + ACCOUNT_DOMEIN; }
function isSpelerAccount(u) { return !!u && !u.isAnonymous && typeof u.email === 'string' && u.email.slice(-ACCOUNT_DOMEIN.length) === ACCOUNT_DOMEIN; }
function isBeheerAccount(u) { return !!u && !u.isAnonymous && !isSpelerAccount(u); }
function accountUid() { return localStorage.getItem(ACCOUNT_UID_SLEUTEL); }
function wisLokaalAccount() { ACCOUNT_LOKALE_SLEUTELS.forEach(k => localStorage.removeItem(k)); }

// Wijzigingen in munten, quizzen enz. gaan automatisch (na een korte pauze) naar je account.
const origineleSetItem = Storage.prototype.setItem;
let accountSyncTimer = null;
Storage.prototype.setItem = function (sleutel, waarde) {
  origineleSetItem.call(this, sleutel, waarde);
  if (this === window.localStorage && ACCOUNT_DATA_SLEUTELS.indexOf(sleutel) !== -1) {
    clearTimeout(accountSyncTimer);
    accountSyncTimer = setTimeout(syncAccountData, 1500);
  }
};

function syncAccountData() {
  clearTimeout(accountSyncTimer);
  if (accountWordtVerwijderd) return Promise.resolve();
  const bezoekDoel = bezoekUid();
  const u = bezoekDoel ? { uid: bezoekDoel } : auth.currentUser;
  if (bezoekDoel) { if (!auth.currentUser) return Promise.resolve(); }
  else if (!isSpelerAccount(u) || u.uid !== accountUid()) return Promise.resolve();
  const data = {};
  ACCOUNT_DATA_SLEUTELS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null && v.length <= 100000) data[k] = v;
  });
  return db.ref('accountData/' + u.uid).update(data).catch(() => {});
}

// Haalt je online gegevens op. Geeft true als er iets op dit apparaat is veranderd.
function haalAccountData(uid, vervangAlles) {
  return db.ref('accountData/' + uid).once('value').then(snap => {
    const d = snap.val() || {};
    let veranderd = false;
    ACCOUNT_DATA_SLEUTELS.forEach(k => {
      if (typeof d[k] === 'string') {
        if (localStorage.getItem(k) !== d[k]) { origineleSetItem.call(localStorage, k, d[k]); veranderd = true; }
      } else if (vervangAlles) {
        localStorage.removeItem(k);
      }
    });
    return veranderd;
  });
}
let accountDataGehaald = false;

// ---------- Sitebeheer (echt inloggen via Firebase Authentication) ----------
//
// De beheerder logt in met een e-mailadres + wachtwoord dat in de Firebase
// Console staat (Authentication -> Users), niet in deze broncode. Zie de
// readme voor hoe je dat account daar aanmaakt. Firebase onthoudt het
// ingelogd zijn automatisch, dus na een herlaadbeurt blijft de beheerder
// ingelogd tot er bewust wordt uitgelogd.

let sitebeheerActief = false;
// Is je gewone account aan sitebeheer gekoppeld? (Dan is dit je uid, anders null.)
let beheerGekoppeldUid = null;
// Tijdens het verwijderen van een account mag niets meer teruggeschreven worden naar Firebase.
let accountWordtVerwijderd = false;

// Het koppelen gebeurt via een tweede, losse Firebase-verbinding ("beheer"). Zo kun je met het
// sitebeheer-wachtwoord een koppeling maken zonder dat je eigen account wordt uitgelogd.
let beheerApp = null;
function beheerAuthApp() {
  if (!beheerApp) {
    try { beheerApp = firebase.app('beheer'); } catch (e) { beheerApp = firebase.initializeApp(firebaseConfig, 'beheer'); }
  }
  return beheerApp;
}
function beheerInloggenLos(email, ww) {
  const a = beheerAuthApp().auth();
  return a.signInWithEmailAndPassword(email, ww).then(res => {
    if (isSpelerAccount(res.user)) return a.signOut().then(() => { throw { code: 'geen-beheer' }; });
    return res.user;
  });
}
function beheerUitloggenLos() { return beheerApp ? beheerApp.auth().signOut().catch(() => {}) : Promise.resolve(); }
function schrijfBeheerKoppeling(uid) { return beheerAuthApp().database().ref('beheerders/' + uid).set(true); }
function beheerFoutTekst(err) {
  const c = err && err.code;
  if (c === 'geen-beheer') return 'Dat is geen sitebeheer-account. Gebruik het e-mailadres uit Firebase (Authentication > Users).';
  if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-email' || c === 'auth/invalid-login-credentials') return 'Onjuist e-mailadres of wachtwoord van sitebeheer.';
  return accountFoutTekst(err);
}
function herlaadBeheerSchermen() {
  if (document.getElementById('scherm-speelbare-quizzen').classList.contains('actief')) laadOpenbareQuizzen();
  if (document.getElementById('scherm-quizmaken').classList.contains('actief')) laadEigenQuizzen();
}
function zetBeheerGekoppeld(uid) {
  beheerGekoppeldUid = uid; sitebeheerActief = true;
  werkSitebeheerKnopBij(); werkAccountStatusBij(); herlaadBeheerSchermen();
}
function zetBeheerLosgekoppeld() {
  beheerGekoppeldUid = null; sitebeheerActief = isBeheerAccount(auth.currentUser);
  werkSitebeheerKnopBij(); werkAccountStatusBij(); herlaadBeheerSchermen();
}
function controleerBeheerKoppeling(gebruiker) {
  if (!isSpelerAccount(gebruiker) || beheerGekoppeldUid === gebruiker.uid) return;
  db.ref('beheerders/' + gebruiker.uid).once('value').then(snap => {
    if (snap.val() === true && auth.currentUser && auth.currentUser.uid === gebruiker.uid) zetBeheerGekoppeld(gebruiker.uid);
  }).catch(() => {});
}

// Voor gewone spelers gebruiken we anonieme Firebase-authenticatie. Daardoor
// krijgt iedere browser een eigen veilige Firebase-ID zonder dat er een wachtwoord
// nodig is. Die ID koppelen we aan de gekozen gebruikersnaam voor vrienden/chat.
let socialeAuthFout = '';
let socialeAuthPogingen = 0;
// Firebase herstelt een bewaarde login pas een moment NA het laden van de pagina. Tot die tijd is
// auth.currentUser leeg. Meldden we ons dan meteen anoniem aan, dan werd je echte account
// vervangen door een nieuw anoniem account en werd je bij elke herlaadbeurt uitgelogd.
// Daarom wachten we eerst tot Firebase heeft laten weten wie er is ingelogd.
const authKlaar = new Promise(klaar => {
  let gedaan = false;
  const stop = auth.onAuthStateChanged(() => { if (!gedaan) { gedaan = true; klaar(); } });
  setTimeout(() => { if (!gedaan) { gedaan = true; klaar(); } }, 8000);
  void stop;
});
function zorgVoorSocialeGebruiker() {
  if (typeof auth === 'undefined') return Promise.resolve(null);
  return authKlaar.then(() => {
    if (auth.currentUser) return auth.currentUser;
    return meldAnoniemAan();
  });
}
function meldAnoniemAan() {
  return auth.signInAnonymously().then(res => {
    socialeAuthFout = '';
    return res && res.user ? res.user : auth.currentUser;
  }).catch(err => {
    // Niet meer stil negeren: zonder deze aanmelding werken vrienden en chat niet.
    socialeAuthFout = (err && err.code) || 'onbekend';
    console.error('Anoniem aanmelden bij Firebase mislukt:', err);
    if (socialeAuthPogingen++ < 3) setTimeout(zorgVoorSocialeGebruiker, 3000);
    return null;
  });
}

// Uitleg voor als vrienden/chat niet kunnen werken omdat er geen (anoniem) account is.
function socialeVerbindingsMelding() {
  if (socialeAuthFout === 'auth/operation-not-allowed' || socialeAuthFout === 'auth/admin-restricted-operation') {
    return 'Vrienden en chat werken nog niet: zet in Firebase bij Authentication > Sign-in method de provider "Anoniem" aan.';
  }
  if (socialeAuthFout === 'auth/unauthorized-domain') {
    return 'Vrienden en chat werken niet: zet het domein van deze website in Firebase bij Authentication > Instellingen > Geautoriseerde domeinen.';
  }
  return 'Je bent nog niet verbonden met vrienden en chat' + (socialeAuthFout ? ' (' + socialeAuthFout + ')' : '') + '. Controleer je internet en probeer het zo nog eens.';
}

const sitebeheerOverlayEl = document.getElementById('sitebeheer-overlay');
const inputSitebeheerEmailEl = document.getElementById('input-sitebeheer-email');
const inputSitebeheerWachtwoordEl = document.getElementById('input-sitebeheer-wachtwoord');
const sitebeheerFoutmeldingEl = document.getElementById('sitebeheer-foutmelding');
const btnSitebeheerEl = document.getElementById('btn-sitebeheer');
const btnSitebeheerBevestigenEl = document.getElementById('btn-sitebeheer-bevestigen');

function wilKoppelen() { return isSpelerAccount(auth.currentUser) && auth.currentUser.uid === accountUid(); }

function openSitebeheerOverlay() {
  const uitleg = document.getElementById('sitebeheer-uitleg');
  if (uitleg) uitleg.textContent = wilKoppelen()
    ? 'Vul het e-mailadres en wachtwoord van sitebeheer in. Je blijft ingelogd met je eigen account; dat account wordt dan aan sitebeheer gekoppeld.'
    : 'Log in met het beheerdersaccount. Daarna kun je bij "Speelbare quizzen" quizzen uit die lijst verwijderen.';
  btnSitebeheerBevestigenEl.textContent = wilKoppelen() ? 'Koppelen' : 'Inloggen';
  sitebeheerFoutmeldingEl.textContent = '';
  inputSitebeheerEmailEl.value = '';
  inputSitebeheerWachtwoordEl.value = '';
  sitebeheerOverlayEl.classList.add('actief');
  inputSitebeheerEmailEl.focus();
}

function sluitSitebeheerOverlay() {
  sitebeheerOverlayEl.classList.remove('actief');
}

function werkSitebeheerKnopBij() {
  if (typeof werkBeheerNavBij === 'function') werkBeheerNavBij();
  try {
    werkProfielPoppetjeWeergaveBij(); werkProfielOverlayNaamBij(); werkBlokkadeLuisteraarBij(); renderVrienden();
    if (huidigChatUid) werkChatBeheerBij();
  } catch (e) { /* de rest van de site is nog aan het laden */ }
  if (sitebeheerActief) {
    btnSitebeheerEl.classList.add('actief');
    btnSitebeheerEl.textContent = '🔓 Sitebeheer actief';
  } else {
    btnSitebeheerEl.classList.remove('actief');
    btnSitebeheerEl.textContent = '⚙ Sitebeheer';
  }
}

btnSitebeheerEl.addEventListener('click', () => {
  if (sitebeheerActief) {
    if (beheerGekoppeldUid) {
      // Gekoppeld aan je eigen account: nogmaals klikken haalt de koppeling weg (je blijft ingelogd).
      if (!confirm('Je account is gekoppeld aan sitebeheer. Wil je die koppeling weghalen?')) return;
      db.ref('beheerders/' + beheerGekoppeldUid).remove().then(zetBeheerLosgekoppeld).catch(() => alert('Loskoppelen is niet gelukt.'));
      return;
    }
    // Direct als beheerder ingelogd: nogmaals klikken logt meteen uit.
    auth.signOut();
    return;
  }
  openSitebeheerOverlay();
});

document.getElementById('btn-sitebeheer-annuleren').addEventListener('click', () => {
  sluitSitebeheerOverlay();
});

function probeerSitebeheerInloggen() {
  const email = inputSitebeheerEmailEl.value.trim();
  const wachtwoord = inputSitebeheerWachtwoordEl.value;
  const koppelen = wilKoppelen();
  const knopTekst = koppelen ? 'Koppelen' : 'Inloggen';

  if (!email || !wachtwoord) {
    sitebeheerFoutmeldingEl.textContent = 'Vul e-mailadres en wachtwoord in.';
    return;
  }

  sitebeheerFoutmeldingEl.textContent = '';
  btnSitebeheerBevestigenEl.disabled = true;
  btnSitebeheerBevestigenEl.textContent = 'Bezig...';
  const klaar = () => { btnSitebeheerBevestigenEl.disabled = false; btnSitebeheerBevestigenEl.textContent = knopTekst; };

  if (koppelen) {
    // Gewoon account: wachtwoord controleren met een losse verbinding en je account koppelen.
    const uid = auth.currentUser.uid;
    beheerInloggenLos(email, wachtwoord)
      .then(() => schrijfBeheerKoppeling(uid))
      .then(() => { zetBeheerGekoppeld(uid); sluitSitebeheerOverlay(); })
      .catch(err => { sitebeheerFoutmeldingEl.textContent = beheerFoutTekst(err); })
      .then(() => beheerUitloggenLos())
      .then(klaar);
    return;
  }

  auth.signInWithEmailAndPassword(email, wachtwoord)
    .then(() => {
      // sitebeheerActief wordt automatisch gezet via onAuthStateChanged hieronder.
      sluitSitebeheerOverlay();
    })
    .catch(() => {
      sitebeheerFoutmeldingEl.textContent = 'Inloggen mislukt: onjuist e-mailadres of wachtwoord.';
    })
    .then(klaar);
}

btnSitebeheerBevestigenEl.addEventListener('click', probeerSitebeheerInloggen);

[inputSitebeheerEmailEl, inputSitebeheerWachtwoordEl].forEach(veld => {
  veld.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      probeerSitebeheerInloggen();
    }
  });
});

auth.onAuthStateChanged(gebruiker => {
  if (beheerGekoppeldUid && (!gebruiker || gebruiker.uid !== beheerGekoppeldUid)) beheerGekoppeldUid = null;
  sitebeheerActief = isBeheerAccount(gebruiker) || (isSpelerAccount(gebruiker) && beheerGekoppeldUid === gebruiker.uid);
  werkSitebeheerKnopBij();
  controleerBeheerKoppeling(gebruiker);
  if (typeof werkVakSlotjesBij === 'function') werkVakSlotjesBij();
  // Is de online sessie een ander account dan wat dit apparaat denkt (bijv. uitgelogd of
  // beheerder ingelogd)? Dan loggen we lokaal netjes uit: je gegevens staan veilig online.
  const lokaalUid = accountUid();
  if (lokaalUid && gebruiker && gebruiker.uid !== lokaalUid && !bezoekUid()) {
    wisLokaalAccount();
    accountDataGehaald = false;
    if (typeof werkProfielBadgeBij === 'function') { werkProfielBadgeBij(); werkVakSlotjesBij(); werkMuntenWeergaveBij(); }
  }
  // Ingelogd account: haal de nieuwste munten/quizzen op en stuur lokale gegevens door.
  if (isSpelerAccount(gebruiker) && gebruiker.uid === accountUid() && !accountDataGehaald) {
    accountDataGehaald = true;
    accountIsVerdwenen().then(weg => {
      if (weg) { verwijderdAccountOpruimen(); return null; }
      return haalAccountData(gebruiker.uid, false).then(veranderd => {
        if (veranderd && typeof werkMuntenWeergaveBij === 'function') werkMuntenWeergaveBij();
        return syncAccountData();
      });
    }).catch(() => {});
  }
  if (gebruiker && !gebruiker.isAnonymous) {
    // Beheerder-account: niets extra's nodig.
  } else if (!gebruiker) {
    zorgVoorSocialeGebruiker();
  }
  if (typeof laadSocialeGegevens === 'function') laadSocialeGegevens();
  if (document.getElementById('scherm-speelbare-quizzen').classList.contains('actief')) {
    laadOpenbareQuizzen();
  }
  if (document.getElementById('scherm-quizmaken').classList.contains('actief')) {
    laadEigenQuizzen();
  }
});

zorgVoorSocialeGebruiker();

// ---------- Naam van de quizmaker (verplicht, eenmalig, niet meer te wijzigen) ----------
//
// Voordat iemand een quiz kan maken, moet die zijn/haar naam invullen. Deze
// naam wordt lokaal onthouden (localStorage) en bij elke quiz die diegene
// maakt als "makerNaam" opgeslagen in Firebase. Uit privacy wordt de naam
// op de site NIET getoond aan gewone bezoekers; alleen sitebeheer (ingelogd)
// ziet bij Speelbare quizzen wie een quiz heeft gemaakt.
// De maker zelf kan zijn/haar naam achteraf niet wijzigen.

const MAKER_NAAM_SLEUTEL = 'makerNaam';
const PROFIEL_DIER_SLEUTEL = 'profielDier';

function huidigeMakerNaam() {
  return localStorage.getItem(MAKER_NAAM_SLEUTEL);
}

function huidigProfielDier() {
  const opgeslagen = localStorage.getItem(PROFIEL_DIER_SLEUTEL) || '';
  if (opgeslagen || !localStorage.getItem(MAKER_NAAM_SLEUTEL)) return opgeslagen;
  // Wel een profiel maar nog geen poppetje opgeslagen (bijv. een ouder profiel): pak je eerste dier
  // en onthoud dat meteen, zodat je profielpoppetje nooit leeg blijft.
  const eerste = (haalBezitDieren().filter(d => geldigDier(d))[0]) || '';
  if (eerste) localStorage.setItem(PROFIEL_DIER_SLEUTEL, eerste);
  return eerste;
}

// Een profiel bestaat zodra er een gebruikersnaam is. Het poppetje komt er
// idealiiter gelijk bij, maar is geen harde eis: heb je (nog) geen enkel
// poppetje in bezit (bijv. omdat je ze allemaal verkocht hebt), dan kun je
// nog steeds een profiel hebben en later alsnog een poppetje kiezen zodra je
// er weer een hebt.
function heeftProfiel() {
  // Je hebt een profiel als je een naam hebt EN bent ingelogd met een account
  // (de beheerder heeft een eigen inlog en hoeft geen speler-account).
  return !!huidigeMakerNaam() && (!!accountUid() || sitebeheerActief);
}

// Onthoudt welk poppetje net gekozen is op het profiel-maken-scherm, vóórdat
// er op "Profiel aanmaken" geklikt is.
let profielGekozenDier = '';

// Onthoudt wat er moet gebeuren zodra het profiel is aangemaakt (welk scherm
// tonen en welke gegevens erbij laden), zodat "Quiz maken", "Winkel",
// "Dierenverzameling" en "Geluksrad" na het aanmaken van een profiel meteen
// verdergaan naar waar de bezoeker eigenlijk heen wilde.
let naProfielActie = null;

// Bouwt een poppetje-kiezer (alleen dieren die je al bezit, zonder accessoires)
// in het meegegeven element. Heb je nog geen enkel poppetje in bezit, dan komt
// er gewoon een uitleg te staan in plaats van een lege/onbruikbare kiezer.
// onKiezen(dier) wordt aangeroepen zodra er op een poppetje geklikt wordt.
function bouwPoppetjeKiezer(containerEl, huidigeWaarde, onKiezen) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  const bezitDieren = haalBezitDieren();

  if (!bezitDieren.length) {
    const hint = document.createElement('p');
    hint.className = 'kiezer-hint';
    hint.textContent = 'Je hebt nog geen enkel poppetje om te kiezen. Verdien of win er eerst één (bijv. bij de Winkel of het Geluksrad).';
    containerEl.appendChild(hint);
    return;
  }

  bezitDieren.forEach(dier => {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'dier-knop';
    knop.innerHTML = poppetjeSvg(dier, {});
    knop.dataset.dier = dier;
    knop.classList.toggle('gekozen', dier === huidigeWaarde);
    knop.setAttribute('aria-label', 'Kies ' + dier + ' als profielfoto');
    knop.addEventListener('click', () => {
      onKiezen(dier);
      containerEl.querySelectorAll('.dier-knop').forEach(k => k.classList.toggle('gekozen', k.dataset.dier === dier));
    });
    containerEl.appendChild(knop);
  });
}

// Bouwt de poppetje-kiezer op het profiel-maken-scherm.
function bouwProfielDierenKiezer() {
  const kiezerEl = document.getElementById('profiel-dieren-kiezer');
  bouwPoppetjeKiezer(kiezerEl, profielGekozenDier, (dier) => { profielGekozenDier = dier; });
}

// Werkt de badge rechtsboven bij: toont poppetje + naam als er een profiel
// is, anders een knop om er een aan te maken.
function werkProfielBadgeBij() {
  const poppetjeEl = document.getElementById('profiel-badge-poppetje');
  const tekstEl = document.getElementById('profiel-badge-tekst');
  if (heeftProfiel()) {
    poppetjeEl.textContent = huidigProfielDier();
    tekstEl.textContent = huidigeMakerNaam();
  } else {
    poppetjeEl.textContent = '';
    tekstEl.textContent = '🔑 Inloggen';
  }
}

// Opent het profiel-maken-scherm. Is er al een naam maar nog geen poppetje
// (bijv. van vóór deze functie bestond), dan staat de naam alvast klaar en
// hoeft alleen nog een poppetje gekozen te worden.
function openProfielMakenScherm() {
  inputMakerNaamEl.value = huidigeMakerNaam() || '';
  naamInvullenFoutmeldingEl.textContent = '';
  ['input-login-naam', 'input-login-wachtwoord', 'input-reg-wachtwoord', 'input-reg-wachtwoord2'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('login-foutmelding').textContent = '';
  document.getElementById('poppetje-foutmelding').textContent = '';
  document.getElementById('account-apparaat-melding').hidden = true;
  document.getElementById('reg-wachtwoord-velden').hidden = !!sitebeheerActief;
  document.getElementById('reg-beheer-keuze').hidden = !!sitebeheerActief;
  document.getElementById('reg-is-beheer').checked = false;
  document.getElementById('reg-beheer-velden').hidden = true;
  ['input-reg-beheer-email', 'input-reg-beheer-ww'].forEach(id => { document.getElementById(id).value = ''; });
  profielGekozenDier = geldigDier(huidigProfielDier());
  bouwProfielDierenKiezer();
  zetAccountTab(sitebeheerActief ? 'registreren' : 'inloggen');
  toonScherm('scherm-naam-invullen');
}

// Zorgt dat een schermwissel alleen doorgaat als er al een profiel is; is er
// nog geen profiel, dan wordt eerst het profiel-maken-scherm getoond en gaat
// het na het aanmaken automatisch verder naar "actie".
function metProfielVereist(actie) {
  if (heeftProfiel()) {
    actie();
  } else {
    naProfielActie = actie;
    openProfielMakenScherm();
  }
}

// Tekst veilig in innerHTML zetten (namen en titels komen van gebruikers).
function escapeHtml(tekst) {
  return String(tekst == null ? '' : tekst)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Tekst " · Door <naam>" achter een quiz. Uit privacy alleen voor sitebeheer;
// voor gewone bezoekers is dit altijd leeg.
function doorTekstVoorMaker(makerNaam) {
  if (!sitebeheerActief) return '';
  return makerNaam ? ' · Door ' + escapeHtml(makerNaam) : ' · Door: naam onbekend';
}

// Zet de naam van de maker automatisch bij ALLE quizzen die op dit apparaat
// zijn gemaakt en nog geen naam hebben (bijv. quizzen van vóórdat de naam werd
// ingevuld). Zo staat de naam ook bij oudere quizzen in "Speelbare quizzen".
// Deze functie geeft altijd een Promise terug die nooit faalt.
function koppelMakerNaamAanEigenQuizzen() {
  const naam = huidigeMakerNaam();
  if (!naam) return Promise.resolve();

  let eigenQuizzen = [];
  try {
    eigenQuizzen = JSON.parse(localStorage.getItem('eigenQuizzen') || '[]');
  } catch (e) {
    return Promise.resolve();
  }

  return Promise.all(
    eigenQuizzen.filter(q => !q.gedeeldVan).map(q =>
      db.ref('quizzen/' + q.code).once('value').then(snapshot => {
        // Alleen bijwerken als de quiz nog bestaat en nog geen naam heeft
        // (anders zouden we een verwijderde quiz per ongeluk opnieuw aanmaken).
        if (snapshot.child('titel').exists()) {
          const uid = accountUid();
          const stappen = [];
          if (!snapshot.child('makerNaam').val()) stappen.push(db.ref('quizzen/' + q.code + '/makerNaam').set(naam));
          if (uid && !snapshot.child('makerUid').val()) stappen.push(db.ref('quizzen/' + q.code + '/makerUid').set(uid));
          return Promise.all(stappen);
        }
      }).catch(() => {})
    )
  ).catch(() => {});
}

const inputMakerNaamEl = document.getElementById('input-maker-naam');
const naamInvullenFoutmeldingEl = document.getElementById('naam-invullen-foutmelding');

// Welke tab (inloggen / registreren / poppetje kiezen) zie je op het account-scherm?
function zetAccountTab(welke) {
  document.getElementById('account-inloggen-blok').hidden = welke !== 'inloggen';
  document.getElementById('account-registreren-blok').hidden = welke !== 'registreren';
  document.getElementById('account-poppetje-blok').hidden = welke !== 'poppetje';
  document.getElementById('account-keuze').hidden = welke === 'poppetje';
  document.getElementById('tab-account-inloggen').classList.toggle('actief', welke === 'inloggen');
  document.getElementById('tab-account-registreren').classList.toggle('actief', welke === 'registreren');
  document.getElementById('account-kop').textContent = welke === 'poppetje' ? 'Kies je poppetje' : (welke === 'registreren' ? 'Registreren' : 'Inloggen');
}

function accountFoutTekst(err) {
  const c = err && err.code;
  if (/permission_denied/i.test(String((err && (err.code || err.message)) || ''))) {
    return 'Firebase weigert dit (PERMISSION_DENIED). Plak de nieuwste regels uit firebase-rules.json in Firebase bij Realtime Database > Regels en klik op Publiceren.';
  }
  if (c === 'auth/weak-password') return 'Dat wachtwoord is te zwak. Gebruik minstens 6 tekens.';
  if (c === 'auth/operation-not-allowed') return 'Inloggen met wachtwoord staat nog niet aan in Firebase (Authentication > Sign-in method > E-mail/wachtwoord).';
  if (c === 'auth/network-request-failed') return 'Geen internet. Probeer het opnieuw.';
  if (c === 'auth/too-many-requests') return 'Je hebt het te vaak geprobeerd. Wacht even en probeer het opnieuw.';
  if (c === 'auth/email-already-in-use' || c === 'auth/credential-already-in-use') return 'Er bestaat al een account voor dit apparaat. Probeer in te loggen.';
  if (err && err.message && !c) return err.message;
  return 'Het is niet gelukt' + (c ? ' (' + c + ')' : '') + '. Probeer het opnieuw.';
}

let registratieNaam = '';

// Stap 1 van registreren: gebruikersnaam + wachtwoord. Daarna kies je een poppetje.
function bevestigMakerNaam() {
  const naam = inputMakerNaamEl.value.trim();
  const fout = naamInvullenFoutmeldingEl;
  fout.textContent = '';
  if (!naam) { fout.textContent = 'Vul een gebruikersnaam in.'; return; }

  // De beheerder heeft een eigen inlog: alleen een naam kiezen, geen wachtwoord.
  if (sitebeheerActief) {
    controleerGebruikersnaamVrij(naam).then(vrij => {
      if (!vrij) { fout.textContent = 'Deze naam is al in gebruik. Kies een andere naam.'; return; }
      registratieNaam = naam;
      profielGekozenDier = geldigDier(huidigProfielDier());
      bouwProfielDierenKiezer();
      zetAccountTab('poppetje');
    });
    return;
  }

  const ww = document.getElementById('input-reg-wachtwoord').value;
  const ww2 = document.getElementById('input-reg-wachtwoord2').value;
  if (ww.length < 6) { fout.textContent = 'Het wachtwoord moet minstens 6 tekens hebben.'; return; }
  if (ww !== ww2) { fout.textContent = 'De twee wachtwoorden zijn niet hetzelfde.'; return; }
  if (apparaatIsVol()) {
    fout.textContent = 'Op dit apparaat zijn al ' + MAX_ACCOUNTS_PER_APPARAAT + ' accounts gemaakt. Log in met je gebruikersnaam en wachtwoord, of verwijder eerst een account.';
    return;
  }

  // Wil je ook sitebeheer zijn? Dan controleren we eerst het sitebeheer-wachtwoord.
  const wilBeheer = !!document.getElementById('reg-is-beheer').checked;
  const beheerEmail = wilBeheer ? document.getElementById('input-reg-beheer-email').value.trim() : '';
  const beheerWw = wilBeheer ? document.getElementById('input-reg-beheer-ww').value : '';
  if (wilBeheer && (!beheerEmail || !beheerWw)) { fout.textContent = 'Vul het e-mailadres en wachtwoord van sitebeheer in.'; return; }

  const knop = document.getElementById('btn-naam-bevestigen');
  knop.disabled = true;
  let gebruiker = null, naamVastgelegd = false, gekoppeld = false;
  (wilBeheer ? beheerInloggenLos(beheerEmail, beheerWw).catch(err => { throw new Error(beheerFoutTekst(err)); }) : Promise.resolve())
  .then(() => controleerGebruikersnaamVrij(naam)).then(vrij => {
    if (!vrij) throw new Error('Deze naam is al in gebruik. Kies een andere naam.');
    return zorgVoorSocialeGebruiker();
  }).then(user => {
    if (!user) throw new Error('Geen verbinding met de server. Probeer het zo nog eens.');
    // Hangt er nog een half gemaakt account aan deze browser (eerdere poging die halverwege mislukte)?
    // Dan loggen we daar netjes uit en beginnen we opnieuw.
    if (!user.isAnonymous) {
      if (isBeheerAccount(user)) throw new Error('Je bent als sitebeheer ingelogd. Log eerst uit bij Sitebeheer.');
      return auth.signOut().then(() => zorgVoorSocialeGebruiker());
    }
    return user;
  }).then(user => {
    if (!user) throw new Error('Geen verbinding met de server. Probeer het zo nog eens.');
    gebruiker = user;
    // Stap 1: de naam vastleggen (nog als anoniem account, met dezelfde uid).
    return naamRegistreer(user.uid, normaliseerGebruikersnaam(naam));
  }).then(() => {
    naamVastgelegd = true;
    // Stap 2: het anonieme account wordt een echt account: je uid blijft hetzelfde.
    const bewijs = firebase.auth.EmailAuthProvider.credential(maakAccountEmail(gebruiker.uid), ww);
    return gebruiker.linkWithCredential(bewijs);
  }).then(() => { gekoppeld = true; return gebruiker.getIdToken(true); })
    .then(() => {
      voegApparaatAccountToe(gebruiker.uid);
      localStorage.setItem(ACCOUNT_UID_SLEUTEL, gebruiker.uid);
      localStorage.setItem(MAKER_NAAM_SLEUTEL, naam);
      registratieNaam = naam;
      return registreerSociaalProfiel();
    })
    .then(() => {
      if (!wilBeheer) return;
      return schrijfBeheerKoppeling(gebruiker.uid).then(() => zetBeheerGekoppeld(gebruiker.uid)).catch(err => {
        alert('Je account is gemaakt, maar koppelen aan sitebeheer is niet gelukt: ' + accountFoutTekst(err) + ' Probeer het later opnieuw met de knop Sitebeheer onderaan.');
      });
    })
    .then(() => {
      syncAccountData();
      werkProfielBadgeBij();
      werkVakSlotjesBij();
      profielGekozenDier = geldigDier(huidigProfielDier());
      bouwProfielDierenKiezer();
      zetAccountTab('poppetje');
    })
    .catch(err => {
      fout.textContent = accountFoutTekst(err);
      // Mislukt het koppelen, dan geven we de naam weer vrij zodat je het opnieuw kunt proberen.
      if (naamVastgelegd && !gekoppeld && gebruiker) {
        naamVrijgeven(gebruiker.uid, normaliseerGebruikersnaam(naam));
      }
    })
    .then(() => { knop.disabled = false; return beheerUitloggenLos(); });
}

// Stap 2: poppetje gekozen -> profiel klaar.
document.getElementById('btn-poppetje-klaar').addEventListener('click', () => {
  const fout = document.getElementById('poppetje-foutmelding');
  fout.textContent = '';
  if (haalBezitDieren().length && !profielGekozenDier) { fout.textContent = 'Kies een poppetje als profielfoto.'; return; }
  rondProfielAanmakenAf(registratieNaam || huidigeMakerNaam());
});

document.getElementById('tab-account-inloggen').addEventListener('click', () => {
  document.getElementById('account-apparaat-melding').hidden = true;
  zetAccountTab('inloggen');
});
document.getElementById('tab-account-registreren').addEventListener('click', () => {
  const melding = document.getElementById('account-apparaat-melding');
  if (apparaatIsVol() && !sitebeheerActief) {
    melding.textContent = 'Op dit apparaat zijn al ' + MAX_ACCOUNTS_PER_APPARAAT + ' accounts gemaakt. Je kunt hier geen derde account registreren. Log in met je gebruikersnaam en wachtwoord, of verwijder eerst een account.';
    melding.hidden = false;
    zetAccountTab('inloggen');
    return;
  }
  melding.hidden = true;
  zetAccountTab('registreren');
});

// ---- Inloggen ----
// Zet profiel, bezit en munten van het account op dit apparaat.
function zetLokaalAccountVanOnline(user) {
  return Promise.all([db.ref('gebruikers/' + user.uid).once('value'), haalAccountData(user.uid, true).catch(() => false)]).then(([snap]) => {
    const p = snap.val();
    if (!p || !p.gebruikersnaam) throw new Error('Dit account heeft geen profiel meer.');
    const data = {};
    ACCOUNT_DATA_SLEUTELS.forEach(k => { data[k] = localStorage.getItem(k); });
    wisLokaalAccount();
    ACCOUNT_DATA_SLEUTELS.forEach(k => { if (data[k] !== null) origineleSetItem.call(localStorage, k, data[k]); });
    localStorage.setItem(MAKER_NAAM_SLEUTEL, p.gebruikersnaam);
    if (p.dier) localStorage.setItem(PROFIEL_DIER_SLEUTEL, p.dier);
    if (p.accessoires) localStorage.setItem(PROFIEL_ACCESSOIRES_SLEUTEL, JSON.stringify(p.accessoires));
    const b = p.bezit || {};
    const dieren = [], accessoires = [], aantallen = {};
    Object.entries(b.dieren || {}).forEach(([item, n]) => { if (geldigDier(item) && Number(n) > 0) { dieren.push(item); aantallen['dier:' + item] = Number(n); } });
    Object.entries(b.accessoires || {}).forEach(([item, n]) => { if (ACCESSOIRES[item] && Number(n) > 0) { accessoires.push(item); aantallen['accessoire:' + item] = Number(n); } });
    if (dieren.length) localStorage.setItem(BEZIT_DIEREN_SLEUTEL, JSON.stringify(dieren));
    if (accessoires.length) localStorage.setItem(BEZIT_ACCESSOIRES_SLEUTEL, JSON.stringify(accessoires));
    if (Object.keys(aantallen).length) slaBezitAantallenOp(aantallen);
    localStorage.setItem(ACCOUNT_UID_SLEUTEL, user.uid);
    // Inloggen telt als account op dit apparaat, maar blokkeert nooit het inloggen zelf.
    voegApparaatAccountToe(user.uid);
  });
}

function probeerAccountInloggen() {
  const naam = document.getElementById('input-login-naam').value.trim();
  const ww = document.getElementById('input-login-wachtwoord').value;
  const fout = document.getElementById('login-foutmelding');
  const knop = document.getElementById('btn-inloggen');
  fout.textContent = '';
  if (!naam || !ww) { fout.textContent = 'Vul je gebruikersnaam en wachtwoord in.'; return; }
  knop.disabled = true;
  zorgVoorSocialeGebruiker().then(user => {
    if (!user) throw new Error('Geen verbinding met de server. Probeer het zo nog eens.');
    return naamUids(normaliseerGebruikersnaam(naam));
  }).then(uids => {
    if (!uids.length) throw { code: 'geen-account' };
    // Meerdere accounts met dezelfde naam? Het wachtwoord bepaalt welk account het is.
    let laatsteFout = null;
    const probeer = i => {
      if (i >= uids.length) throw laatsteFout || { code: 'geen-account' };
      return auth.signInWithEmailAndPassword(maakAccountEmail(uids[i]), ww).then(res => res.user).catch(err => {
        const c = err && err.code;
        if (c === 'auth/wrong-password' || c === 'auth/invalid-credential' || c === 'auth/invalid-login-credentials' || c === 'auth/user-not-found') {
          laatsteFout = err;
          return probeer(i + 1);
        }
        throw err;
      });
    };
    return probeer(0);
  }).then(user => zetLokaalAccountVanOnline(user).catch(err => auth.signOut().then(() => { throw err; })))
    .then(() => location.reload())
    .catch(err => {
      knop.disabled = false;
      const c = err && err.code;
      if (c === 'geen-account' || c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-login-credentials') {
        fout.textContent = 'Onjuiste gebruikersnaam of wachtwoord.';
      } else {
        fout.textContent = accountFoutTekst(err);
      }
    });
}
document.getElementById('btn-inloggen').addEventListener('click', probeerAccountInloggen);
['input-login-naam', 'input-login-wachtwoord'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') probeerAccountInloggen(); });
});
['input-reg-wachtwoord', 'input-reg-wachtwoord2'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') bevestigMakerNaam(); });
});

// ---------- Gebruikersnamen (meerdere accounts mogen dezelfde naam hebben) ----------
// Wie wie is, bepaalt het wachtwoord: bij inloggen proberen we elk account met die naam.
// Nieuwe namen staan in namen/<naam>/<uid> = true. Oude accounts staan nog in
// gebruikersnamen/<naam> = <uid> (die blijven werken).
function naamRegistreer(uid, zoeknaam) {
  return db.ref('namen/' + naamSleutel(zoeknaam) + '/' + uid).set(true);
}
function naamVrijgeven(uid, zoeknaam) {
  const k = naamSleutel(zoeknaam);
  return Promise.all([
    db.ref('namen/' + k + '/' + uid).remove().catch(() => {}),
    db.ref('gebruikersnamen/' + k).transaction(v => (v === uid ? null : v)).catch(() => {})
  ]);
}
function naamUids(zoeknaam) {
  const k = naamSleutel(zoeknaam);
  return Promise.all([
    db.ref('namen/' + k).once('value').catch(() => null),
    db.ref('gebruikersnamen/' + k).once('value').catch(() => null)
  ]).then(([nieuw, oud]) => {
    const uids = [];
    if (nieuw && nieuw.val() && typeof nieuw.val() === 'object') Object.keys(nieuw.val()).forEach(u => uids.push(u));
    if (oud && typeof oud.val() === 'string' && uids.indexOf(oud.val()) === -1) uids.push(oud.val());
    return uids;
  });
}

// Geeft true als de naam nog vrij is of van dit account is. Lukt de controle niet
// (geen internet of nog niet verbonden), dan blokkeren we niet en gaat het zoals eerder.
function controleerGebruikersnaamVrij(naam) {
  // Dezelfde naam mag vaker voorkomen: het wachtwoord bepaalt welk account het is.
  return Promise.resolve(true);
}

function rondProfielAanmakenAf(naam) {
  localStorage.setItem(MAKER_NAAM_SLEUTEL, naam);
  if (profielGekozenDier) {
    localStorage.setItem(PROFIEL_DIER_SLEUTEL, profielGekozenDier);
  }
  registreerSociaalProfiel();
  werkProfielBadgeBij();
  werkVakSlotjesBij();

  const actie = naProfielActie;
  naProfielActie = null;

  if (actie) {
    actie();
  } else {
    toonScherm('scherm-quizmaken');
    laadEigenQuizzen();
  }
  // Eerst de naam bij bestaande quizzen zetten (voor het geval er al oudere
  // quizzen van dit apparaat bestaan zonder naam).
  koppelMakerNaamAanEigenQuizzen();
}

document.getElementById('btn-naam-bevestigen').addEventListener('click', bevestigMakerNaam);
document.getElementById('reg-is-beheer').addEventListener('change', e => {
  document.getElementById('reg-beheer-velden').hidden = !e.target.checked;
});

inputMakerNaamEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    bevestigMakerNaam();
  }
});

// ---------- Navigatie tussen schermen ----------

function toonScherm(id) {
  document.querySelectorAll('.scherm').forEach(el => el.classList.remove('actief'));
  document.getElementById(id).classList.add('actief');
}

document.getElementById('btn-naar-quizmaken').addEventListener('click', () => {
  metProfielVereist(() => {
    toonScherm('scherm-quizmaken');
    laadEigenQuizzen();
  });
});

document.getElementById('btn-naar-speelbaar').addEventListener('click', () => {
  toonScherm('scherm-speelbare-quizzen');
  laadOpenbareQuizzen();
});

document.getElementById('btn-naar-meedoen').addEventListener('click', () => {
  toonScherm('scherm-meedoen');
});

document.getElementById('btn-naar-dierentuin').addEventListener('click', () => {
  metProfielVereist(() => {
    toonScherm('scherm-dierenverzameling');
    werkMuntenWeergaveBij();
    bouwVerzamelingKiezer();
  });
});

document.querySelectorAll('[data-terug-naar]').forEach(knop => {
  knop.addEventListener('click', () => {
    const doel = knop.getAttribute('data-terug-naar');
    toonScherm(doel);
    if (doel === 'scherm-quizmaken') {
      laadEigenQuizzen();
    }
  });
});

// Terug-knop op het bewerkformulier gaat terug naar waar we vandaan kwamen:
// "Mijn quizzen" normaal, of "Speelbare quizzen" als sitebeheer een openbare
// quiz van iemand anders aan het aanpassen was.
document.getElementById('btn-nieuwe-quiz-terug').addEventListener('click', () => {
  const bestemming = huidigeBewerkTerugScherm || 'scherm-quizmaken';
  huidigeBewerkCode = null;
  huidigeBewerkTerugScherm = 'scherm-quizmaken';
  toonScherm(bestemming);
  if (bestemming === 'scherm-beheer-bezoek') {
    laadBezoekQuizzen();
  } else if (bestemming === 'scherm-speelbare-quizzen') {
    laadOpenbareQuizzen();
  } else {
    laadEigenQuizzen();
  }
});

// ---------- Omslagfoto's (standaard-galerij + eigen upload) ----------

function maakStandaardOmslag(embleem, label, kleurVan, kleurNaar) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${kleurVan}"/>
          <stop offset="100%" stop-color="${kleurNaar}"/>
        </linearGradient>
      </defs>
      <rect width="480" height="270" fill="url(#g)"/>
      <circle cx="70" cy="45" r="2" fill="#ffe9a8" opacity="0.85"/>
      <circle cx="135" cy="215" r="1.6" fill="#ffe9a8" opacity="0.7"/>
      <circle cx="405" cy="38" r="1.8" fill="#ffe9a8" opacity="0.8"/>
      <circle cx="425" cy="205" r="2.2" fill="#ffe9a8" opacity="0.6"/>
      <circle cx="55" cy="185" r="1.4" fill="#ffe9a8" opacity="0.6"/>
      <circle cx="350" cy="230" r="1.5" fill="#ffe9a8" opacity="0.6"/>
      <text x="240" y="145" font-size="92" text-anchor="middle" dominant-baseline="middle">${embleem}</text>
      <text x="240" y="222" font-size="22" font-family="system-ui, sans-serif" font-weight="700" fill="#fff8e1" text-anchor="middle" opacity="0.9">${label}</text>
    </svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

const STANDAARD_OMSLAGEN = [
  { id: 'trofee', url: maakStandaardOmslag('🏆', 'Algemene kennis', '#1c2456', '#05081c') },
  { id: 'gloeilamp', url: maakStandaardOmslag('💡', 'Weetjes', '#2a1c40', '#0a0620') },
  { id: 'wereldbol', url: maakStandaardOmslag('🌍', 'Aardrijkskunde', '#0d2a3a', '#04101c') },
  { id: 'boek', url: maakStandaardOmslag('📚', 'Schoolquiz', '#1a1230', '#050816') },
  { id: 'sterren', url: maakStandaardOmslag('✨', 'Sterrenquiz', '#141a3c', '#03050f') },
  { id: 'vraagteken', url: maakStandaardOmslag('❓', 'Mysterie', '#241638', '#060310') }
];

let geselecteerdeOmslagUrl = STANDAARD_OMSLAGEN[0].url;

const omslagPreviewImg = document.getElementById('omslag-preview-img');
const omslagGalerijEl = document.getElementById('omslag-galerij');

function toonOmslagPreview(url) {
  geselecteerdeOmslagUrl = url;
  omslagPreviewImg.src = url;
}

function bouwOmslagGalerij(actieveUrl) {
  omslagGalerijEl.innerHTML = '';
  STANDAARD_OMSLAGEN.forEach(optie => {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'omslag-optie' + (optie.url === actieveUrl ? ' geselecteerd' : '');
    knop.innerHTML = `<img src="${optie.url}" alt="${optie.id}">`;
    knop.addEventListener('click', () => {
      toonOmslagPreview(optie.url);
      omslagGalerijEl.querySelectorAll('.omslag-optie').forEach(el => el.classList.remove('geselecteerd'));
      knop.classList.add('geselecteerd');
    });
    omslagGalerijEl.appendChild(knop);
  });
}

function leesEnVerkleinAfbeelding(bestand) {
  return new Promise((resolve, reject) => {
    const lezer = new FileReader();
    lezer.onload = () => {
      const img = new Image();
      img.onload = () => {
        const doelBreedte = 480;
        const doelHoogte = 270;
        const canvas = document.createElement('canvas');
        canvas.width = doelBreedte;
        canvas.height = doelHoogte;
        const ctx = canvas.getContext('2d');

        const schaal = Math.max(doelBreedte / img.width, doelHoogte / img.height);
        const geschaaldeBreedte = img.width * schaal;
        const geschaaldeHoogte = img.height * schaal;
        const x = (doelBreedte - geschaaldeBreedte) / 2;
        const y = (doelHoogte - geschaaldeHoogte) / 2;
        ctx.drawImage(img, x, y, geschaaldeBreedte, geschaaldeHoogte);

        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => reject(new Error('Kon de afbeelding niet lezen.'));
      img.src = lezer.result;
    };
    lezer.onerror = () => reject(new Error('Kon het bestand niet lezen.'));
    lezer.readAsDataURL(bestand);
  });
}

document.getElementById('btn-omslag-uploaden').addEventListener('click', () => {
  document.getElementById('input-omslag-bestand').click();
});

document.getElementById('input-omslag-bestand').addEventListener('change', (e) => {
  const bestand = e.target.files[0];
  if (!bestand) return;

  leesEnVerkleinAfbeelding(bestand)
    .then(dataUrl => {
      toonOmslagPreview(dataUrl);
      omslagGalerijEl.querySelectorAll('.omslag-optie').forEach(el => el.classList.remove('geselecteerd'));
    })
    .catch(err => {
      document.getElementById('quizmaken-foutmelding').textContent = 'Foto uploaden mislukt: ' + err.message;
    })
    .finally(() => {
      e.target.value = '';
    });
});



const vragenContainer = document.getElementById('vragen-container');
const sjabloonVraagBlok = document.getElementById('sjabloon-vraag-blok');

// Als dit null is, wordt er een nieuwe quiz gemaakt. Anders wordt de quiz
// met deze code bewerkt en overschreven in plaats van dat er een nieuwe
// code wordt aangemaakt.
let huidigeBewerkCode = null;

// Naar welk scherm we teruggaan na het opslaan/annuleren van het bewerkformulier.
// Normaal 'scherm-quizmaken' (Mijn quizzen), maar als sitebeheer een quiz
// aanpast vanuit "Speelbare quizzen", dan 'scherm-speelbare-quizzen'.
let huidigeBewerkTerugScherm = 'scherm-quizmaken';

// Is de quiz die nu bewerkt wordt geblokkeerd door sitebeheer? Zo ja, dan kan
// "openbaar" niet aangevinkt worden totdat sitebeheer de quiz deblokkeert.
let huidigeBewerkGeblokkeerd = false;

// Tijd per vraag bij live hosten (wekker), in seconden. De keuzeopties (10/15/
// 20/25/30) staan in de <select id="input-tijdslimiet"> in index.html. Oudere
// quizzen zonder dit veld gebruiken de standaardwaarde hieronder.
const TIJDSLIMIET_STANDAARD = 20;

// ---------- Hulpfuncties voor vragen (meerdere goede antwoorden, 2 of 4 opties) ----------
//
// Een vraag wordt overal in de app in dit formaat gebruikt:
//   { vraag: "...", antwoorden: [...2 of 4 stuks...], goedAntwoorden: [1, 3, ...] }
// Oudere quizzen (gemaakt vóór deze functie) hebben nog een los veld
// `goedAntwoord` (één getal) in plaats van `goedAntwoorden` (een lijst).
// normaliseerVraag() zorgt dat de rest van de app altijd met `goedAntwoorden` werkt.

function normaliseerVraag(vraag) {
  let goedAntwoorden = vraag.goedAntwoorden;
  if (!goedAntwoorden) {
    goedAntwoorden = vraag.goedAntwoord ? [vraag.goedAntwoord] : [];
  }
  // Oudere vragen (gemaakt vóór punten instelbaar waren) hebben geen `punten`
  // veld; die tellen gewoon als 1000, zoals voorheen altijd het geval was.
  const punten = (typeof vraag.punten === 'number' && vraag.punten >= 0) ? vraag.punten : 1000;
  return {
    vraag: vraag.vraag,
    antwoorden: vraag.antwoorden || [],
    goedAntwoorden: goedAntwoorden,
    afbeelding: vraag.afbeelding || '',
    punten: punten
  };
}

// Zet een getal om naar een leesbare tekst met duizendtal-punten (Nederlandse notatie),
// bijv. 1000000 -> "1.000.000". Wordt gebruikt om het puntenveld mooi te tonen.
function formatPunten(getal) {
  return getal.toLocaleString('nl-NL');
}

// Leest het puntenveld van een vraagblok. Haalt eerst alles weg wat geen cijfer is
// (dus ook duizendtal-punten of -komma's die iemand zelf intypt, bijv. "1.000.000"),
// zodat grote aantallen punten nooit per ongeluk als ongeldig worden gezien en stil
// terugvallen op de standaardwaarde.
function leesPuntenWaarde(blokEl) {
  const ruweTekst = blokEl.querySelector('.veld-punten').value;
  const cijfers = ruweTekst.replace(/[^\d]/g, '');
  if (!cijfers) return 1000; // leeg veld: terugvallen op de standaardwaarde
  const getal = parseInt(cijfers, 10);
  return (Number.isFinite(getal) && getal >= 0) ? getal : 1000;
}

// Zet een getal netjes geformatteerd in het puntenveld van een vraagblok.
function zetPuntenWaarde(blokEl, getal) {
  const veilig = Math.max(0, getal);
  blokEl.querySelector('.veld-punten').value = formatPunten(veilig);
}

// Vergelijkt twee lijsten met antwoordnummers zonder rekening te houden met volgorde.
function setsGelijk(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  const aSorted = [...a].sort();
  const bSorted = [...b].sort();
  return aSorted.every((waarde, i) => waarde === bSorted[i]);
}

// Toont/verbergt de antwoord-invoerrijen 3 en 4 in een vraagblok, afhankelijk
// van of er 2 of 4 antwoorden gekozen zijn. Bij verbergen worden die velden
// ook geleegd zodat ze niet per ongeluk meegestuurd worden.
function werkAantalAntwoordenZichtbaarheidBij(blokEl, aantal) {
  const rijen = blokEl.querySelectorAll('.antwoord-invoer-rij');
  rijen.forEach((rij, i) => {
    if (i < aantal) {
      rij.classList.remove('verborgen');
    } else {
      rij.classList.add('verborgen');
      rij.querySelector('.veld-antwoord').value = '';
      rij.querySelector('.veld-goed-vinkje').checked = false;
    }
  });
}

// Foto bij een vraag: verhouding blijft behouden (niet bijsnijden), maximaal
// 800 px breed/hoog zodat de quiz niet te zwaar wordt in Firebase.
function leesEnVerkleinVraagFoto(bestand) {
  return new Promise((resolve, reject) => {
    const lezer = new FileReader();
    lezer.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxAfmeting = 800;
        const schaal = Math.min(1, maxAfmeting / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * schaal));
        canvas.height = Math.max(1, Math.round(img.height * schaal));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; // doorzichtige png's krijgen een witte achtergrond
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => reject(new Error('Kon de afbeelding niet lezen.'));
      img.src = lezer.result;
    };
    lezer.onerror = () => reject(new Error('Kon het bestand niet lezen.'));
    lezer.readAsDataURL(bestand);
  });
}

// Zet (of verwijdert, bij lege url) de foto van één vraagblok in het formulier.
function zetVraagFoto(blokEl, url) {
  blokEl._afbeelding = url || '';
  const previewEl = blokEl.querySelector('.vraag-foto-preview');
  const verwijderKnop = blokEl.querySelector('.btn-vraag-foto-verwijderen');
  const kiesKnop = blokEl.querySelector('.btn-vraag-foto-kiezen');
  if (url) {
    previewEl.src = url;
    previewEl.hidden = false;
    verwijderKnop.hidden = false;
    kiesKnop.textContent = 'Andere foto uploaden';
  } else {
    previewEl.removeAttribute('src');
    previewEl.hidden = true;
    verwijderKnop.hidden = true;
    kiesKnop.textContent = 'Foto uploaden';
  }
}

function vernummerVraagBlokken() {
  const blokken = vragenContainer.querySelectorAll('.vraag-blok');
  blokken.forEach((blok, index) => {
    blok.querySelector('.vraag-blok-titel').textContent = 'Vraag ' + (index + 1);
  });
}

function voegVraagBlokToe(vraagData) {
  const kloon = sjabloonVraagBlok.content.cloneNode(true);
  const blokEl = kloon.querySelector('.vraag-blok');

  if (vraagData) {
    const genormaliseerd = normaliseerVraag(vraagData);
    const aantalAntwoorden = genormaliseerd.antwoorden.length === 2 ? 2 : 4;

    blokEl.querySelector('.veld-vraag').value = genormaliseerd.vraag;
    blokEl.querySelector('.veld-aantal-antwoorden').value = String(aantalAntwoorden);
    zetPuntenWaarde(blokEl, genormaliseerd.punten);

    const antwoordVelden = blokEl.querySelectorAll('.veld-antwoord');
    const goedVinkjes = blokEl.querySelectorAll('.veld-goed-vinkje');
    antwoordVelden.forEach((veld, i) => {
      veld.value = genormaliseerd.antwoorden[i] || '';
    });
    goedVinkjes.forEach((vinkje, i) => {
      vinkje.checked = genormaliseerd.goedAntwoorden.includes(i + 1);
    });

    werkAantalAntwoordenZichtbaarheidBij(blokEl, aantalAntwoorden);
    zetVraagFoto(blokEl, genormaliseerd.afbeelding);
  } else {
    werkAantalAntwoordenZichtbaarheidBij(blokEl, 4);
    zetVraagFoto(blokEl, '');
  }

  const vraagFotoBestandEl = blokEl.querySelector('.veld-vraag-foto-bestand');
  blokEl.querySelector('.btn-vraag-foto-kiezen').addEventListener('click', () => {
    vraagFotoBestandEl.click();
  });
  blokEl.querySelector('.btn-vraag-foto-verwijderen').addEventListener('click', () => {
    zetVraagFoto(blokEl, '');
  });
  vraagFotoBestandEl.addEventListener('change', (e) => {
    const bestand = e.target.files[0];
    if (!bestand) return;
    leesEnVerkleinVraagFoto(bestand)
      .then(dataUrl => {
        zetVraagFoto(blokEl, dataUrl);
      })
      .catch(err => {
        document.getElementById('quizmaken-foutmelding').textContent = 'Foto uploaden mislukt: ' + err.message;
      })
      .finally(() => {
        e.target.value = '';
      });
  });

  // Punten-stappenteller: +/- knoppen tellen in stappen van 50 op/af, en het veld
  // wordt na het typen automatisch netjes geformatteerd (bijv. "1.000.000").
  const stapGrootte = 50;
  blokEl.querySelector('.btn-punten-min').addEventListener('click', () => {
    zetPuntenWaarde(blokEl, leesPuntenWaarde(blokEl) - stapGrootte);
  });
  blokEl.querySelector('.btn-punten-plus').addEventListener('click', () => {
    zetPuntenWaarde(blokEl, leesPuntenWaarde(blokEl) + stapGrootte);
  });
  const puntenVeld = blokEl.querySelector('.veld-punten');
  puntenVeld.addEventListener('input', () => {
    // Laat tijdens het typen alleen cijfers en punten toe.
    const schoon = puntenVeld.value.replace(/[^\d.]/g, '');
    if (schoon !== puntenVeld.value) puntenVeld.value = schoon;
  });
  puntenVeld.addEventListener('blur', () => {
    zetPuntenWaarde(blokEl, leesPuntenWaarde(blokEl));
  });

  blokEl.querySelector('.veld-aantal-antwoorden').addEventListener('change', (e) => {
    werkAantalAntwoordenZichtbaarheidBij(blokEl, parseInt(e.target.value, 10));
  });

  blokEl.querySelector('.btn-verwijder-vraag').addEventListener('click', () => {
    const aantalBlokken = vragenContainer.querySelectorAll('.vraag-blok').length;
    if (aantalBlokken <= 1) {
      document.getElementById('quizmaken-foutmelding').textContent = 'Een quiz heeft minstens 1 vraag nodig.';
      return;
    }
    blokEl.remove();
    vernummerVraagBlokken();
  });

  vragenContainer.appendChild(blokEl);
  vernummerVraagBlokken();
}

document.getElementById('btn-vraag-toevoegen').addEventListener('click', () => {
  voegVraagBlokToe();
});

// De keuze "mag alleen gespeeld worden" hoort bij het openbaar maken: pas zichtbaar
// als "Deze quiz openbaar maken" aan staat.
function werkSoloOptieZichtbaarheidBij() {
  document.getElementById('solo-optie-rij').hidden = !document.getElementById('input-openbaar').checked;
}

document.getElementById('input-openbaar').addEventListener('change', werkSoloOptieZichtbaarheidBij);

// Is deze quiz geblokkeerd door sitebeheer? Dan mag "openbaar" niet aangevinkt
// worden: het vinkje wordt uitgezet en op slot gezet, en er komt een melding.
function werkGeblokkeerdZichtbaarheidBij() {
  const openbaarCheckbox = document.getElementById('input-openbaar');
  const melding = document.getElementById('geblokkeerd-melding');
  openbaarCheckbox.disabled = huidigeBewerkGeblokkeerd;
  melding.hidden = !huidigeBewerkGeblokkeerd;
  if (huidigeBewerkGeblokkeerd) {
    openbaarCheckbox.checked = false;
  }
  werkSoloOptieZichtbaarheidBij();
}

document.getElementById('btn-toevoegen-quiz').addEventListener('click', () => {
  huidigeBewerkCode = null;
  huidigeBewerkTerugScherm = 'scherm-quizmaken';
  huidigeBewerkGeblokkeerd = false;
  document.getElementById('input-titel').value = '';
  vragenContainer.innerHTML = '';
  document.getElementById('quizmaken-foutmelding').textContent = '';
  document.getElementById('nieuwe-quiz-titel-kop').textContent = 'Nieuwe quiz';
  document.getElementById('btn-quiz-opslaan').textContent = 'Quiz opslaan';
  document.getElementById('input-openbaar').checked = false;
  document.getElementById('input-solo-toegestaan').checked = true;
  document.getElementById('input-tijdslimiet').value = String(TIJDSLIMIET_STANDAARD);
  werkGeblokkeerdZichtbaarheidBij();
  bouwOmslagGalerij(STANDAARD_OMSLAGEN[0].url);
  toonOmslagPreview(STANDAARD_OMSLAGEN[0].url);
  voegVraagBlokToe();
  toonScherm('scherm-nieuwe-quiz');
});

function startBewerkenVanQuiz(code, terugScherm) {
  db.ref('quizzen/' + code).once('value').then(snapshot => {
    const quizData = snapshot.val();
    if (!quizData) {
      alert('Deze quiz kon niet gevonden worden (misschien is hij verwijderd).');
      return;
    }

    huidigeBewerkCode = code;
    huidigeBewerkTerugScherm = terugScherm || 'scherm-quizmaken';
    huidigeBewerkGeblokkeerd = !!quizData.geblokkeerd;
    document.getElementById('input-titel').value = quizData.titel;
    vragenContainer.innerHTML = '';
    document.getElementById('quizmaken-foutmelding').textContent = '';
    document.getElementById('input-openbaar').checked = !!quizData.openbaar;
    // Oudere quizzen hebben deze keuze nog niet: die tellen als "alleen spelen mag".
    document.getElementById('input-solo-toegestaan').checked = quizData.soloToegestaan !== false;
    // Oudere quizzen hebben nog geen tijdslimiet: die vallen terug op de standaardwaarde.
    document.getElementById('input-tijdslimiet').value = String(quizData.tijdslimiet || TIJDSLIMIET_STANDAARD);
    werkGeblokkeerdZichtbaarheidBij();
    const huidigeOmslag = quizData.afbeelding || STANDAARD_OMSLAGEN[0].url;
    bouwOmslagGalerij(huidigeOmslag);
    toonOmslagPreview(huidigeOmslag);
    quizData.vragen.forEach(vraag => voegVraagBlokToe(vraag));
    document.getElementById('nieuwe-quiz-titel-kop').textContent = 'Quiz bewerken';
    document.getElementById('btn-quiz-opslaan').textContent = 'Wijzigingen opslaan';
    toonScherm('scherm-nieuwe-quiz');
  });
}

// ---------- Quiz opslaan ----------

function genereerCode() {
  const tekens = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // zonder verwarrende tekens zoals O/0, I/1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += tekens.charAt(Math.floor(Math.random() * tekens.length));
  }
  return code;
}

document.getElementById('btn-quiz-opslaan').addEventListener('click', () => {
  const titel = document.getElementById('input-titel').value.trim();
  const foutmelding = document.getElementById('quizmaken-foutmelding');
  foutmelding.textContent = '';

  if (!titel) {
    foutmelding.textContent = 'Vul een titel in.';
    return;
  }

  const blokken = vragenContainer.querySelectorAll('.vraag-blok');
  if (blokken.length === 0) {
    foutmelding.textContent = 'Voeg minstens 1 vraag toe.';
    return;
  }

  const vragen = [];

  for (const blok of blokken) {
    const vraagTekst = blok.querySelector('.veld-vraag').value.trim();
    const aantalAntwoorden = parseInt(blok.querySelector('.veld-aantal-antwoorden').value, 10);
    const antwoordVelden = Array.from(blok.querySelectorAll('.veld-antwoord')).slice(0, aantalAntwoorden);
    const antwoorden = antwoordVelden.map(veld => veld.value.trim());
    const goedVinkjes = Array.from(blok.querySelectorAll('.veld-goed-vinkje')).slice(0, aantalAntwoorden);
    const goedAntwoorden = goedVinkjes
      .map((vinkje, i) => vinkje.checked ? i + 1 : null)
      .filter(i => i !== null);
    const punten = leesPuntenWaarde(blok);

    if (!vraagTekst || antwoorden.some(a => !a)) {
      foutmelding.textContent = 'Vul bij elke vraag de vraagtekst en alle antwoorden in.';
      return;
    }
    if (goedAntwoorden.length === 0) {
      foutmelding.textContent = 'Vink bij elke vraag minstens 1 goed antwoord aan.';
      return;
    }

    const vraagData = {
      vraag: vraagTekst,
      antwoorden: antwoorden,
      goedAntwoorden: goedAntwoorden,
      punten: punten
    };
    if (blok._afbeelding) {
      vraagData.afbeelding = blok._afbeelding;
    }
    vragen.push(vraagData);
  }

  // Een geblokkeerde quiz kan nooit openbaar opgeslagen worden, ook niet als het
  // vinkje via de browser (buiten het formulier om) toch aan zou staan.
  const isOpenbaar = huidigeBewerkGeblokkeerd ? false : document.getElementById('input-openbaar').checked;
  const soloToegestaan = document.getElementById('input-solo-toegestaan').checked;
  const tijdslimiet = parseInt(document.getElementById('input-tijdslimiet').value, 10) || TIJDSLIMIET_STANDAARD;

  if (huidigeBewerkCode) {
    // Bestaande quiz bijwerken: zelfde code, alleen titel + vragen + omslag + openbaar overschrijven.
    const code = huidigeBewerkCode;
    const terugScherm = huidigeBewerkTerugScherm;

    const updateData = { titel: titel, vragen: vragen, afbeelding: geselecteerdeOmslagUrl, openbaar: isOpenbaar, soloToegestaan: soloToegestaan, tijdslimiet: tijdslimiet, doorBeheerVerwijderd: false, geblokkeerd: huidigeBewerkGeblokkeerd };

    // Is dit jouw eigen quiz? Dan zorgen we dat jouw naam erbij staat.
    // (Bij sitebeheer die andermans quiz aanpast blijft de naam van de maker staan.)
    const isEigenQuiz = JSON.parse(localStorage.getItem('eigenQuizzen') || '[]').some(q => q.code === code && !q.gedeeldVan);
    if (isEigenQuiz && huidigeMakerNaam()) {
      updateData.makerNaam = huidigeMakerNaam();
    }

    db.ref('quizzen/' + code).update(updateData)
      .then(() => {
        const eigenQuizzen = JSON.parse(localStorage.getItem('eigenQuizzen') || '[]');
        const bijgewerkteLijst = eigenQuizzen.map(q =>
          q.code === code ? Object.assign({}, q, { code: code, titel: titel, aantalVragen: vragen.length, afbeelding: geselecteerdeOmslagUrl, openbaar: isOpenbaar }) : q
        );
        localStorage.setItem('eigenQuizzen', JSON.stringify(bijgewerkteLijst));

        huidigeBewerkCode = null;
        huidigeBewerkTerugScherm = 'scherm-quizmaken';
        toonScherm(terugScherm);
        if (terugScherm === 'scherm-beheer-bezoek') {
          laadBezoekQuizzen();
        } else if (terugScherm === 'scherm-speelbare-quizzen') {
          laadOpenbareQuizzen();
        } else {
          laadEigenQuizzen();
        }
      })
      .catch(err => {
        foutmelding.textContent = 'Opslaan mislukt: ' + err.message;
      });
    return;
  }

  const code = genereerCode();

  const quizData = {
    titel: titel,
    vragen: vragen,
    afbeelding: geselecteerdeOmslagUrl,
    openbaar: isOpenbaar,
    soloToegestaan: soloToegestaan,
    tijdslimiet: tijdslimiet,
    geblokkeerd: false,
    makerNaam: huidigeMakerNaam() || '',
    makerUid: accountUid() || (auth.currentUser ? auth.currentUser.uid : ''),
    aangemaaktOp: Date.now()
  };

  db.ref('quizzen/' + code).set(quizData)
    .then(() => {
      // Titel + code lokaal onthouden zodat "Mijn quizzen" ze kan tonen
      const eigenQuizzen = JSON.parse(localStorage.getItem('eigenQuizzen') || '[]');
      eigenQuizzen.push({ code: code, titel: titel, aantalVragen: vragen.length, afbeelding: geselecteerdeOmslagUrl, openbaar: isOpenbaar });
      localStorage.setItem('eigenQuizzen', JSON.stringify(eigenQuizzen));

      document.getElementById('code-weergave').textContent = code;
      toonScherm('scherm-quiz-klaar');
    })
    .catch(err => {
      foutmelding.textContent = 'Opslaan mislukt: ' + err.message;
    });
});

document.getElementById('btn-nu-hosten').addEventListener('click', () => {
  const code = document.getElementById('code-weergave').textContent;
  startHostenVanQuiz(code);
});

// ---------- Eigen quizzen tonen (overzicht) ----------

function laadEigenQuizzen() {
  const lijstEl = document.getElementById('lijst-eigen-quizzen');

  const eigenQuizzen = JSON.parse(localStorage.getItem('eigenQuizzen') || '[]');

  if (eigenQuizzen.length === 0) {
    lijstEl.innerHTML = '<p>Je hebt nog geen quiz gemaakt.</p>';
    return;
  }

  lijstEl.innerHTML = '<p>Bezig met laden...</p>';

  // Voor elke eigen quiz de actuele gegevens uit Firebase ophalen, zodat we
  // weten of de quiz nog "openbaar" is en of sitebeheer hem heeft weggehaald.
  koppelMakerNaamAanEigenQuizzen().then(() => Promise.all(
    eigenQuizzen.map(quiz =>
      db.ref('quizzen/' + quiz.code).once('value').then(snapshot => ({
        quiz: quiz,
        liveData: snapshot.val()
      }))
    )
  )).then(resultaten => {
    lijstEl.innerHTML = '';

    // Gedeelde quizzen die de ander inmiddels heeft verwijderd, halen we ook uit jouw lijst.
    const verdwenen = resultaten.filter(r => !r.liveData && r.quiz.gedeeldVan).map(r => r.quiz.code);
    resultaten = resultaten.filter(r => verdwenen.indexOf(r.quiz.code) === -1);
    const behouden = eigenQuizzen.filter(q => verdwenen.indexOf(q.code) === -1);

    // Lokale lijst bijwerken als de "openbaar"-status inmiddels afwijkt
    // (bijv. omdat sitebeheer de quiz heeft weggehaald bij openbaar).
    let lijstIsGewijzigd = false;
    const bijgewerkteEigenQuizzen = behouden.map(q => {
      const resultaat = resultaten.find(r => r.quiz.code === q.code);
      if (resultaat && resultaat.liveData && resultaat.liveData.openbaar !== q.openbaar) {
        lijstIsGewijzigd = true;
        return Object.assign({}, q, { openbaar: resultaat.liveData.openbaar });
      }
      return q;
    });
    if (lijstIsGewijzigd || verdwenen.length) {
      localStorage.setItem('eigenQuizzen', JSON.stringify(bijgewerkteEigenQuizzen));
    }

    resultaten.forEach(({ quiz, liveData }) => {
      const actueelOpenbaar = liveData ? !!liveData.openbaar : quiz.openbaar;
      const actueelGeblokkeerd = !!(liveData && liveData.geblokkeerd);
      const makerNaam = (liveData && liveData.makerNaam) || '';
      // Een quiz kan ook door een vriend aangepast zijn: toon altijd de nieuwste gegevens.
      const titelNu = (liveData && liveData.titel) || quiz.titel;
      const aantalNu = (liveData && liveData.vragen) ? liveData.vragen.length : quiz.aantalVragen;
      const afbeeldingNu = (liveData && liveData.afbeelding) || quiz.afbeelding;

      const item = document.createElement('div');
      item.className = 'quiz-item';

      if (actueelGeblokkeerd) {
        const melding = document.createElement('div');
        melding.className = 'quiz-beheer-melding quiz-beheer-melding-geblokkeerd';
        melding.textContent = '🔒 Deze quiz is geblokkeerd door sitebeheer en kan niet openbaar gezet worden.';
        item.appendChild(melding);
      }

      if (liveData && liveData.doorBeheerVerwijderd) {
        const melding = document.createElement('div');
        melding.className = 'quiz-beheer-melding';

        const meldingTekst = document.createElement('span');
        meldingTekst.textContent = 'Uw quiz is weggehaald bij openbaar.';

        const meldingSluiten = document.createElement('button');
        meldingSluiten.type = 'button';
        meldingSluiten.className = 'quiz-beheer-melding-sluiten';
        meldingSluiten.textContent = 'OK';
        meldingSluiten.addEventListener('click', () => {
          db.ref('quizzen/' + quiz.code + '/doorBeheerVerwijderd').remove()
            .then(() => melding.remove())
            .catch(err => alert('Melding weghalen mislukt: ' + err.message));
        });

        melding.appendChild(meldingTekst);
        melding.appendChild(meldingSluiten);
        item.appendChild(melding);
      }

      const afbeelding = document.createElement('img');
      afbeelding.className = 'quiz-item-afbeelding';
      afbeelding.src = afbeeldingNu || STANDAARD_OMSLAGEN[0].url;
      afbeelding.alt = titelNu;

      const body = document.createElement('div');
      body.className = 'quiz-item-body';

      const info = document.createElement('div');
      info.className = 'quiz-item-info';
      info.innerHTML = `<strong>${escapeHtml(titelNu)}</strong><span>${aantalNu} vraag/vragen${quiz.gedeeldVan ? ' · Gedeeld door ' + escapeHtml(quiz.gedeeldVan) : ''}${doorTekstVoorMaker(makerNaam)}${actueelOpenbaar ? ' · Openbaar' : ''}${actueelGeblokkeerd ? ' · Geblokkeerd' : ''}</span>`;

      const knoppen = document.createElement('div');
      knoppen.className = 'quiz-item-knoppen';

      const speelKnop = document.createElement('button');
      speelKnop.className = 'btn-spelen';
      speelKnop.textContent = 'Spelen';
      speelKnop.addEventListener('click', () => {
        // Je eigen quiz mag je altijd ook alleen spelen.
        toonSpeelKeuze(quiz.code, titelNu, true, 'scherm-quizmaken');
      });

      const aanpassenKnop = document.createElement('button');
      aanpassenKnop.className = 'btn-aanpassen-quiz';
      aanpassenKnop.textContent = 'Aanpassen';
      aanpassenKnop.addEventListener('click', () => {
        startBewerkenVanQuiz(quiz.code);
      });

      const verwijderKnop = document.createElement('button');
      verwijderKnop.className = 'btn-verwijderen-quiz';
      verwijderKnop.textContent = quiz.gedeeldVan ? 'Uit mijn lijst' : 'Verwijderen';
      verwijderKnop.addEventListener('click', () => {
        // Een quiz die een vriend met je gedeeld heeft, haal je alleen uit je eigen lijst;
        // de quiz zelf blijft bestaan voor jullie allebei.
        if (quiz.gedeeldVan) {
          if (!confirm('"' + titelNu + '" uit je lijst halen? De quiz blijft bestaan voor ' + quiz.gedeeldVan + '.')) return;
          localStorage.setItem('eigenQuizzen', JSON.stringify(eigenQuizzen.filter(q => q.code !== quiz.code)));
          laadEigenQuizzen();
          return;
        }
        const zekerWeten = confirm('Weet je zeker dat je "' + quiz.titel + '" wilt verwijderen? Dit kan niet ongedaan gemaakt worden.');
        if (!zekerWeten) return;

        db.ref('quizzen/' + quiz.code).remove()
          .then(() => db.ref('sessies/' + quiz.code).remove())
          .then(() => {
            const bijgewerkteLijst = eigenQuizzen.filter(q => q.code !== quiz.code);
            localStorage.setItem('eigenQuizzen', JSON.stringify(bijgewerkteLijst));
            laadEigenQuizzen();
          })
          .catch(err => {
            alert('Verwijderen mislukt: ' + err.message);
          });
      });

      knoppen.appendChild(speelKnop);
      knoppen.appendChild(aanpassenKnop);
      knoppen.appendChild(verwijderKnop);

      body.appendChild(info);
      body.appendChild(knoppen);
      item.appendChild(afbeelding);
      item.appendChild(body);
      lijstEl.appendChild(item);
    });
  }).catch(err => {
    lijstEl.innerHTML = '<p>Laden van je quizzen mislukt: ' + err.message + '</p>';
  });
}

// ---------- Speelbare quizzen tonen (openbaar gemaakt door anderen) ----------

// Onthoudt de laatst opgehaalde openbare quizzen (zodat de zoekbalk kan
// filteren zonder steeds opnieuw bij Firebase te hoeven ophalen).
let laatsteOpenbareQuizzenData = []; // [[code, quiz], ...]

// Bouwt één quiz-kaartje op voor "Speelbare quizzen". Gebruikt door
// renderOpenbareQuizzenLijst voor elke quiz die (na filteren) getoond wordt.
function bouwOpenbareQuizItemEl(code, quiz) {
        const item = document.createElement('div');
        item.className = 'quiz-item';

        const afbeelding = document.createElement('img');
        afbeelding.className = 'quiz-item-afbeelding';
        afbeelding.src = quiz.afbeelding || STANDAARD_OMSLAGEN[0].url;
        afbeelding.alt = quiz.titel;

        const body = document.createElement('div');
        body.className = 'quiz-item-body';

        const info = document.createElement('div');
        info.className = 'quiz-item-info';
        const aantalVragen = (quiz.vragen || []).length;
        const makerNaam = quiz.makerNaam || '';
        const doorTekst = doorTekstVoorMaker(makerNaam);
        const codeTekst = sitebeheerActief ? ' · Code ' + escapeHtml(code) : '';
        info.innerHTML = `<strong>${escapeHtml(quiz.titel)}</strong><span>${aantalVragen} vraag/vragen${doorTekst}${codeTekst}</span>`;

        const knoppen = document.createElement('div');
        knoppen.className = 'quiz-item-knoppen';

        const speelKnop = document.createElement('button');
        speelKnop.className = 'btn-spelen';
        speelKnop.textContent = 'Spelen';
        speelKnop.addEventListener('click', () => {
          // Alleen spelen mag als de maker dat heeft toegestaan (of als het je eigen quiz is).
          const soloMag = quiz.soloToegestaan !== false || isEigenQuizCode(code);
          toonSpeelKeuze(code, quiz.titel, soloMag, 'scherm-speelbare-quizzen');
        });

        knoppen.appendChild(speelKnop);

        if (sitebeheerActief) {
          const aanpassenKnop = document.createElement('button');
          aanpassenKnop.className = 'btn-aanpassen-quiz';
          aanpassenKnop.textContent = 'Aanpassen';
          aanpassenKnop.addEventListener('click', () => {
            startBewerkenVanQuiz(code, 'scherm-speelbare-quizzen');
          });
          knoppen.appendChild(aanpassenKnop);

          const blokkeerKnop = document.createElement('button');
          blokkeerKnop.className = 'btn-blokkeren-quiz';
          blokkeerKnop.textContent = 'Blokkeren';
          blokkeerKnop.addEventListener('click', () => {
            const zekerWeten = confirm('Weet je zeker dat je "' + quiz.titel + '" wilt blokkeren? De quiz gaat direct offline en de maker kan hem niet meer openbaar zetten totdat je hem weer deblokkeert.');
            if (!zekerWeten) return;

            db.ref('quizzen/' + code).update({ openbaar: false, geblokkeerd: true })
              .then(() => {
                laadOpenbareQuizzen();
              })
              .catch(err => {
                alert('Blokkeren mislukt: ' + err.message);
              });
          });
          knoppen.appendChild(blokkeerKnop);

          const verwijderKnop = document.createElement('button');
          verwijderKnop.className = 'btn-verwijderen-quiz';
          verwijderKnop.textContent = 'Verwijderen';
          verwijderKnop.addEventListener('click', () => {
            const zekerWeten = confirm('Weet je zeker dat je "' + quiz.titel + '" wilt verwijderen uit Speelbare quizzen? De quiz zelf blijft bestaan voor de maker, hij verdwijnt alleen uit deze lijst.');
            if (!zekerWeten) return;

            db.ref('quizzen/' + code).update({ openbaar: false, doorBeheerVerwijderd: true })
              .then(() => {
                laadOpenbareQuizzen();
              })
              .catch(err => {
                alert('Verwijderen mislukt: ' + err.message);
              });
          });
          knoppen.appendChild(verwijderKnop);
        }

  body.appendChild(info);
  body.appendChild(knoppen);
  item.appendChild(afbeelding);
  item.appendChild(body);
  return item;
}

// Toont de huidige "laatsteOpenbareQuizzenData", gefilterd op de zoekbalk
// (zoekt op titel, hoofdletterongevoelig, op elk deel van de titel).
// Wordt aangeroepen na elke keer laden én bij elke toetsaanslag in de zoekbalk.
function renderOpenbareQuizzenLijst() {
  const lijstEl = document.getElementById('lijst-openbare-quizzen');
  const zoekVeldEl = document.getElementById('input-zoek-speelbare-quizzen');
  const zoekterm = ((zoekVeldEl && zoekVeldEl.value) || '').trim().toLowerCase();

  lijstEl.innerHTML = '';

  if (laatsteOpenbareQuizzenData.length === 0) {
    lijstEl.innerHTML = '<p>Er zijn nog geen openbare quizzen. Zet je eigen quiz op openbaar om hem hier te laten verschijnen.</p>';
    return;
  }

  const gefilterd = zoekterm
    ? laatsteOpenbareQuizzenData.filter(([, quiz]) => (quiz.titel || '').toLowerCase().includes(zoekterm))
    : laatsteOpenbareQuizzenData;

  if (gefilterd.length === 0) {
    lijstEl.innerHTML = '<p>Geen quizzen gevonden voor "' + escapeHtml((zoekVeldEl && zoekVeldEl.value.trim()) || '') + '".</p>';
    return;
  }

  gefilterd.forEach(([code, quiz]) => {
    lijstEl.appendChild(bouwOpenbareQuizItemEl(code, quiz));
  });
}

function laadOpenbareQuizzen() {
  const lijstEl = document.getElementById('lijst-openbare-quizzen');
  lijstEl.innerHTML = '<p>Bezig met laden...</p>';

  koppelMakerNaamAanEigenQuizzen()
    .then(() => db.ref('quizzen').orderByChild('openbaar').equalTo(true).once('value'))
    .then(snapshot => {
      const data = snapshot.val();
      laatsteOpenbareQuizzenData = data ? Object.entries(data) : [];
      renderOpenbareQuizzenLijst();
    })
    .catch(err => {
      lijstEl.innerHTML = '<p>Laden van openbare quizzen mislukt: ' + err.message + '</p>';
    });
}

// Live filteren terwijl je typt (zoekt op titel, zowel als gewone bezoeker
// als sitebeheer — de zoekbalk staat altijd boven "Speelbare quizzen").
const inputZoekSpeelbareQuizzenEl = document.getElementById('input-zoek-speelbare-quizzen');
if (inputZoekSpeelbareQuizzenEl) {
  inputZoekSpeelbareQuizzenEl.addEventListener('input', renderOpenbareQuizzenLijst);
}

// ================================================================
//  LIVE QUIZ: hosten, meedoen, spelen en scorebord
// ================================================================
//
// Structuur in Firebase:
//   quizzen/<code>            -> titel, vragen, aangemaaktOp  (al bestond)
//   sessies/<code>            -> status, huidigeVraagIndex, spelers, antwoorden
//     status: 'wachtkamer' | 'vraag' | 'resultaat' | 'scorebord' | 'afgelopen'
//       vraag     -> spelers antwoorden (daarna zien ze alleen een groot laadteken)
//       resultaat -> host: het goede antwoord + hoeveel spelers het goed hadden;
//                    spelers: goed/fout met het goede antwoord eronder
//                    (punten worden op dit moment geteld)
//       scorebord -> alleen het scorebord, zonder vraag en antwoord
//     spelers/<spelerId>      -> naam, dier (emoji), accessoires (boven/gezicht/hoek), score, totaleReactietijd
//     antwoorden/<vraagIndex>/<spelerId> -> antwoordIndexen (lijst), reactietijdMs
//
// Een vraag kan 2 of 4 antwoorden hebben en 1 of meerdere daarvan kunnen goed
// zijn (zie goedAntwoorden in normaliseerVraag hierboven). Een speler moet
// precies de goede antwoorden aanvinken (niet meer, niet minder) om de vraag
// goed te hebben.
//
// Puntentelling: een goed antwoord levert 1000 punten op. Bij een gelijke
// stand wint degene die (opgeteld over de vragen) het snelst klikte.

let huidigeSessieRef = null;
let huidigeRol = null; // 'host' of 'speler'
let huidigeSessieCode = null;
let huidigeQuizVragen = [];
let huidigeQuizTitel = '';
let huidigeQuizTijdslimiet = TIJDSLIMIET_STANDAARD;
let huidigeVraagIndexHost = -1;
let huidigeSpelerId = null;

// Wekker per vraag (alleen zichtbaar bij de quizmaster tijdens live hosten).
// Loopt de tijd af, dan gaat de host automatisch door naar het resultaat
// (hetzelfde als zelf op "Doorgaan" klikken).
let hostTimerInterval = null;
let hostTimerVoorVraagGestartOp = null;
let resultaatWordtBerekend = false;

let laatstGetoondeVraagIndexSpeler = -1;
let vraagGetoondOpSpeler = 0;
let spelerHeeftGeantwoord = false;
let spelerGeselecteerdeAntwoorden = [];
let huidigeStatusSpeler = '';
let muntenToegekendVoorSessie = null; // sessiecode waarvoor deze speler al munten voor winnen kreeg (voorkomt dubbel toekennen)

// ---------- Poppetje: een dier + accessoires (hoeden, brillen, hartjes, ...) ----------
// De tekeningen zelf (dieren, hoeden, brillen, ...) staan in poppetjes.js. Dat bestand
// levert DIEREN, ACCESSOIRE_GROEPEN, geldigeAccessoires() en poppetjeSvg().

let kiezerTab = 'dieren'; // 'dieren' of 'accessoires' (welk tabblad open staat in de wachtkamer)
let huidigePoppetje = { dier: '', accessoires: {} }; // wat deze speler nu heeft gekozen

function willekeurigDier() {
  const bezit = haalBezitDieren();
  return bezit[Math.floor(Math.random() * bezit.length)];
}

// Geeft het dier terug als het een geldig dier uit de lijst is, anders ''.
function geldigDier(dier) {
  return DIEREN.indexOf(dier) !== -1 ? dier : '';
}

// Maakt het poppetje: het getekende dier met de accessoires er passend op.
// De grootte volgt de lettergrootte van het element waar hij in komt te staan.
function maakPoppetje(dier, accessoires) {
  const poppetje = document.createElement('span');
  poppetje.className = 'poppetje';
  poppetje.innerHTML = poppetjeSvg(geldigDier(dier), accessoires);
  return poppetje;
}

// Bouwt de knoppen in de wachtkamer, afhankelijk van het open tabblad.
function bouwKiezer() {
  const kiezerEl = document.getElementById('dieren-kiezer');
  kiezerEl.innerHTML = '';

  const opDieren = kiezerTab === 'dieren';
  kiezerEl.classList.toggle('accessoires', !opDieren);
  document.getElementById('tab-dieren').classList.toggle('actief', opDieren);
  document.getElementById('tab-dieren').setAttribute('aria-selected', String(opDieren));
  document.getElementById('tab-accessoires').classList.toggle('actief', !opDieren);
  document.getElementById('tab-accessoires').setAttribute('aria-selected', String(!opDieren));

  const bezitDieren = haalBezitDieren();
  const bezitAccessoires = haalBezitAccessoires();
  const totaalDierenCatalogus = DIEREN.length;
  const totaalAccCatalogus = ACCESSOIRE_GROEPEN.reduce((n, g) => n + g.items.length, 0);

  if (opDieren) {
    bezitDieren.forEach(dier => {
      const knop = document.createElement('button');
      knop.type = 'button';
      knop.className = 'dier-knop';
      knop.innerHTML = poppetjeSvg(dier, {});
      knop.dataset.dier = dier;
      knop.setAttribute('aria-label', 'Kies ' + dier);
      knop.addEventListener('click', () => kiesDier(dier));
      kiezerEl.appendChild(knop);
    });
  } else {
    // Bij elk accessoire zie je meteen hoe het op jouw dier staat.
    const voorbeeldDier = huidigePoppetje.dier || bezitDieren[0];
    ACCESSOIRE_GROEPEN.forEach(groep => {
      const items = groep.items.filter(emoji => bezitAccessoires.indexOf(emoji) !== -1);
      if (!items.length) return; // deze hele groep nog niet in bezit

      const kop = document.createElement('div');
      kop.className = 'kiezer-groep-titel';
      kop.textContent = groep.titel;
      kiezerEl.appendChild(kop);

      items.forEach(emoji => {
        const voorbeeld = {};
        voorbeeld[groep.plek] = emoji;
        const knop = document.createElement('button');
        knop.type = 'button';
        knop.className = 'dier-knop';
        knop.innerHTML = poppetjeSvg(voorbeeldDier, voorbeeld);
        knop.dataset.plek = groep.plek;
        knop.dataset.acc = emoji;
        knop.setAttribute('aria-label', 'Kies ' + ACCESSOIRES[emoji].naam);
        knop.addEventListener('click', () => kiesAccessoire(groep.plek, emoji));
        kiezerEl.appendChild(knop);
      });
    });

    const wegKnop = document.createElement('button');
    wegKnop.type = 'button';
    wegKnop.className = 'kiezer-weg-knop';
    wegKnop.textContent = 'Alle accessoires weghalen';
    wegKnop.addEventListener('click', verwijderAlleAccessoires);
    kiezerEl.appendChild(wegKnop);
  }

  if (bezitDieren.length < totaalDierenCatalogus || bezitAccessoires.length < totaalAccCatalogus) {
    const hint = document.createElement('p');
    hint.className = 'kiezer-hint';
    hint.textContent = '🎁 Meer dieren en accessoires vind je in de winkel (mysterieboxen)!';
    kiezerEl.appendChild(hint);
  }

  toonGekozenPoppetje(huidigePoppetje);
}

document.getElementById('tab-dieren').addEventListener('click', () => {
  kiezerTab = 'dieren';
  bouwKiezer();
});
document.getElementById('tab-accessoires').addEventListener('click', () => {
  kiezerTab = 'accessoires';
  bouwKiezer();
});

// ---------- Dierenverzameling: de hele catalogus bekijken, ook buiten een quiz om ----------
// Dit scherm laat zowel de dieren/accessoires zien die je al hebt, als de rest van de
// catalogus (grijs met een slotje), zodat je ook zonder in een quiz te zitten kunt zien
// welke poppetjes er allemaal bestaan. Klik je op iets dat je al hebt, dan verkoop je het
// (na een bevestigingsvraag) voor VERKOOP_PRIJS munten; grijze (nog niet in bezit) knoppen
// doen niks.

let kiezerTabVerzameling = 'dieren'; // 'dieren', 'boven' (hoeden), 'gezicht' (brillen) of 'hoek' (extra)
const VERKOOP_PRIJS = 5;

// De tabbladen (Dieren, Hoeden, Brillen, Extra) worden in bouwVerzamelingKiezer() zelf gemaakt,
// op dezelfde manier als in "Poppetje wijzigen".

// Verkoopt een dier uit je bezit. Je laatste dier mag je niet verkopen: haalBezitDieren()
// valt anders terug op de gratis standaarddieren zodra je bezit leeg is, en dan zou je
// oneindig munten kunnen "verdienen" door steeds hetzelfde teruggekregen dier te verkopen.
function verkoopDier(dier) {
  const bezit = haalBezitDieren();
  const index = bezit.indexOf(dier);
  if (index === -1) return;
  if (bezit.length <= 1) {
    alert('Je kunt je laatste dier niet verkopen.');
    return;
  }
  if (!confirm('Dit dier verkopen voor ' + VERKOOP_PRIJS + ' munten? Je bent hem dan kwijt.')) return;

  bezit.splice(index, 1);
  localStorage.setItem(BEZIT_DIEREN_SLEUTEL, JSON.stringify(bezit));
  geefMunten(VERKOOP_PRIJS);
  bouwVerzamelingKiezer();
}

// Zelfde idee als verkoopDier(), maar dan voor een accessoire.
function verkoopAccessoire(emoji) {
  const bezit = haalBezitAccessoires();
  const index = bezit.indexOf(emoji);
  if (index === -1) return;
  if (bezit.length <= 1) {
    alert('Je kunt je laatste accessoire niet verkopen.');
    return;
  }
  const naam = (ACCESSOIRES[emoji] && ACCESSOIRES[emoji].naam) || 'dit accessoire';
  if (!confirm('"' + naam + '" verkopen voor ' + VERKOOP_PRIJS + ' munten? Je bent het dan kwijt.')) return;

  bezit.splice(index, 1);
  localStorage.setItem(BEZIT_ACCESSOIRES_SLEUTEL, JSON.stringify(bezit));
  geefMunten(VERKOOP_PRIJS);
  bouwVerzamelingKiezer();
}

// (bouwVerzamelingKiezer() staat verderop in dit bestand.)

// Toont het gekozen poppetje groot boven de tekst en markeert de gekozen knoppen.
// `speler` is het speler-object uit de sessie (met dier en accessoires).
function toonGekozenPoppetje(speler) {
  speler = speler || {};
  const dier = geldigDier(speler.dier);
  const acc = geldigeAccessoires(speler.accessoires);
  huidigePoppetje = { dier: dier, accessoires: acc };

  const grootEl = document.getElementById('speler-wachtkamer-dier');
  grootEl.innerHTML = '';
  if (dier) grootEl.appendChild(maakPoppetje(dier, acc));

  document.querySelectorAll('#dieren-kiezer .dier-knop').forEach(knop => {
    if (knop.dataset.dier) {
      knop.classList.toggle('gekozen', knop.dataset.dier === dier);
    } else if (knop.dataset.acc) {
      knop.classList.toggle('gekozen', acc[knop.dataset.plek] === knop.dataset.acc);
    }
  });
}

// Mag deze speler nu nog iets aan zijn poppetje veranderen?
// Alleen in de wachtkamer (en alleen als je nog meedoet), anders zou een
// verwijderde speler per ongeluk weer verschijnen.
function magPoppetjeWijzigen() {
  return huidigeRol === 'speler' && huidigeStatusSpeler === 'wachtkamer' &&
    !!huidigeSessieCode && !!huidigeSpelerId;
}

function spelerRef() {
  return db.ref('sessies/' + huidigeSessieCode + '/spelers/' + huidigeSpelerId);
}

// De speler kiest een dier: opslaan bij de speler in de sessie.
function kiesDier(dier) {
  if (!magPoppetjeWijzigen() || !geldigDier(dier) || haalBezitDieren().indexOf(dier) === -1) return;

  toonGekozenPoppetje({ dier: dier, accessoires: huidigePoppetje.accessoires });
  spelerRef().child('dier').set(dier);
}

// De speler kiest een accessoire. Nog eens op hetzelfde tikken haalt het weer weg.
function kiesAccessoire(plek, emoji) {
  if (!magPoppetjeWijzigen()) return;
  const groep = ACCESSOIRE_GROEPEN.find(g => g.plek === plek);
  if (!groep || groep.items.indexOf(emoji) === -1 || haalBezitAccessoires().indexOf(emoji) === -1) return;

  const acc = Object.assign({}, huidigePoppetje.accessoires);
  const ref = spelerRef().child('accessoires').child(plek);
  if (acc[plek] === emoji) {
    delete acc[plek];
    ref.remove();
  } else {
    acc[plek] = emoji;
    ref.set(emoji);
  }
  toonGekozenPoppetje({ dier: huidigePoppetje.dier, accessoires: acc });
}

function verwijderAlleAccessoires() {
  if (!magPoppetjeWijzigen()) return;
  toonGekozenPoppetje({ dier: huidigePoppetje.dier, accessoires: {} });
  spelerRef().child('accessoires').remove();
}

// ================================================================
//  MUNTEN EN MYSTERIEBOXEN (winkel)
// ================================================================
//
// Er zijn geen echte accounts voor gewone spelers, dus net als de naam
// (zie hierboven) worden munten en "bezit" (welke dieren/accessoires je
// hebt) lokaal onthouden per browser/apparaat (localStorage). Iedereen
// begint gratis met de hond, de kat en de zonnebril (STANDAARD_DIEREN /
// STANDAARD_ACCESSOIRES in poppetjes.js). De rest zit verstopt in
// mysterieboxen die sitebeheer ontwerpt (naam, prijs, inhoud) en die je met
// munten koopt in de Winkel; alles wat erin zit krijg en houd je voorgoed.
// Munten verdien je bij een live quiz ("Met mensen") met een top 3-plek
// (1e: 30, 2e: 20, 3e: 10) of door alleen een quiz helemaal goed te spelen (30). Boxen staan in Firebase onder "mysterieboxen" — zie readme.md
// voor de bijbehorende regel die daar nog voor toegevoegd moet worden.

const MUNTEN_SLEUTEL = 'quizAppMunten';
const BEZIT_DIEREN_SLEUTEL = 'quizAppBezitDieren';
const BEZIT_ACCESSOIRES_SLEUTEL = 'quizAppBezitAccessoires';
// Welke mysterieboxen (op id) deze speler ooit heeft gekocht — lokaal onthouden, zodat
// we in de winkel kunnen laten zien "✅ Al eerder gekocht" en iemand niet per ongeluk
// nog een keer munten uitgeeft aan een box die hij al heeft.
const GEKOCHTE_BOXEN_SLEUTEL = 'quizAppGekochteBoxen';
// Munten bij een live quiz ("Met mensen"): 1e, 2e en 3e plek. De rest krijgt niets.
const MUNTEN_LIVE_PER_PLEK = [30, 20, 10];
// Munten als je alleen speelt ("Zonder mensen") en alles goed hebt.
const MUNTEN_SOLO_ALLES_GOED = 5;

// ---- Verdienlijst (door sitebeheer in te stellen) ----
// Per soort een lijst regels "vanaf N vragen -> M munten". Geldt de regel met het hoogste N dat
// niet groter is dan het aantal vragen van de quiz. Staat in Firebase onder instellingen/verdienlijst.
const VERDIEN_SOORTEN = [
  { id: 'solo',  titel: '🎮 Alleen spelen (alles goed)' },
  { id: 'plek1', titel: '🥇 Met mensen: 1e plek' },
  { id: 'plek2', titel: '🥈 Met mensen: 2e plek' },
  { id: 'plek3', titel: '🥉 Met mensen: 3e plek' }
];
const VERDIEN_STANDAARD = {
  solo:  [{ vanaf: 1, munten: MUNTEN_SOLO_ALLES_GOED }],
  plek1: [{ vanaf: 1, munten: MUNTEN_LIVE_PER_PLEK[0] }],
  plek2: [{ vanaf: 1, munten: MUNTEN_LIVE_PER_PLEK[1] }],
  plek3: [{ vanaf: 1, munten: MUNTEN_LIVE_PER_PLEK[2] }]
};
let verdienLijst = JSON.parse(JSON.stringify(VERDIEN_STANDAARD));

function schoonVerdienRegels(lijst) {
  const regels = Array.isArray(lijst) ? lijst : Object.keys(lijst || {}).map(k => lijst[k]);
  return regels
    .map(r => ({ vanaf: parseInt(r && r.vanaf, 10), munten: parseInt(r && r.munten, 10) }))
    .filter(r => r.vanaf >= 1 && r.munten >= 0)
    .sort((a, b) => a.vanaf - b.vanaf);
}

function zetVerdienLijstUitData(data) {
  if (!data || typeof data !== 'object') { verdienLijst = JSON.parse(JSON.stringify(VERDIEN_STANDAARD)); return; }
  const nieuw = {};
  VERDIEN_SOORTEN.forEach(z => { nieuw[z.id] = schoonVerdienRegels(data[z.id]); });
  verdienLijst = nieuw;
}

// Hoeveel munten levert deze soort op bij een quiz met zoveel vragen? (0 = niets)
function muntenVoor(soort, aantalVragen) {
  const regels = verdienLijst[soort] || [];
  let gevonden = 0;
  regels.forEach(r => { if (r.vanaf <= aantalVragen) gevonden = r.munten; });
  return gevonden;
}

// Iedereen leest de verdienlijst live mee; sitebeheer past hem aan.
try {
  db.ref('instellingen/verdienlijst').on('value', snap => { zetVerdienLijstUitData(snap.val()); if (typeof vulVerdienEditor === 'function') vulVerdienEditor(false); }, () => {});
} catch (e) {}

function haalMunten() {
  return parseInt(localStorage.getItem(MUNTEN_SLEUTEL) || '0', 10) || 0;
}

// Werkt overal op de pagina de weergegeven munten bij (klasse "munten-aantal").
function werkMuntenWeergaveBij() {
  const aantal = haalMunten();
  document.querySelectorAll('.munten-aantal').forEach(el => { el.textContent = String(aantal); });
}

function zetMunten(nieuwAantal) {
  localStorage.setItem(MUNTEN_SLEUTEL, String(Math.max(0, nieuwAantal)));
  werkMuntenWeergaveBij();
}

function geefMunten(aantal) {
  zetMunten(haalMunten() + aantal);
}

function haalBezitDieren() {
  const opgeslagen = JSON.parse(localStorage.getItem(BEZIT_DIEREN_SLEUTEL) || 'null');
  return Array.isArray(opgeslagen) && opgeslagen.length ? opgeslagen : STANDAARD_DIEREN.slice();
}

function haalBezitAccessoires() {
  const opgeslagen = JSON.parse(localStorage.getItem(BEZIT_ACCESSOIRES_SLEUTEL) || 'null');
  return Array.isArray(opgeslagen) && opgeslagen.length ? opgeslagen : STANDAARD_ACCESSOIRES.slice();
}

// Laatst opgehaalde volledige lijst mysterieboxen (ongefilterd), gebruikt om in het
// bewerkformulier te kunnen tonen in hoeveel andere kisten een dier/accessoire al zit.
let alleMysterieboxenCache = {};

// Datum (YYYY-MM-DD) van vandaag, voor vergelijking met box.vanafDatum. Puur op datumtekst
// vergelijken voorkomt gedoe met tijdzones/uren.
function huidigeDatumTekst() {
  const nu = new Date();
  return nu.getFullYear() + '-' + String(nu.getMonth() + 1).padStart(2, '0') + '-' + String(nu.getDate()).padStart(2, '0');
}

// Is deze kist nog niet te koop omdat de ingestelde "vanaf"-datum in de toekomst ligt?
function boxIsNogNietTeKoop(box) {
  return !!(box && box.vanafDatum && box.vanafDatum > huidigeDatumTekst());
}

// Is deze kist automatisch offline gegaan omdat de ingestelde "offline vanaf"-datum
// al bereikt of gepasseerd is?
function boxIsAutomatischOffline(box) {
  return !!(box && box.totDatum && box.totDatum <= huidigeDatumTekst());
}

// Nette weergave van een YYYY-MM-DD datum, bijv. "5 oktober 2026".
function formatBoxDatum(datumTekst) {
  if (!datumTekst) return '';
  const datum = new Date(datumTekst + 'T00:00:00');
  if (isNaN(datum.getTime())) return datumTekst;
  return datum.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function haalGekochteBoxen() {
  const opgeslagen = JSON.parse(localStorage.getItem(GEKOCHTE_BOXEN_SLEUTEL) || 'null');
  return Array.isArray(opgeslagen) ? opgeslagen : [];
}

function voegGekochteBoxToe(boxId) {
  const gekocht = haalGekochteBoxen();
  if (gekocht.indexOf(boxId) === -1) {
    gekocht.push(boxId);
    localStorage.setItem(GEKOCHTE_BOXEN_SLEUTEL, JSON.stringify(gekocht));
  }
}

// Voegt de inhoud van een gekochte box toe aan wat de speler al heeft (geen dubbelen).
function voegBezitToe(dieren, accessoires) {
  const huidigeDieren = haalBezitDieren();
  const huidigeAccessoires = haalBezitAccessoires();
  (dieren || []).forEach(d => { if (DIEREN.indexOf(d) !== -1 && huidigeDieren.indexOf(d) === -1) huidigeDieren.push(d); });
  (accessoires || []).forEach(a => { if (ACCESSOIRES[a] && huidigeAccessoires.indexOf(a) === -1) huidigeAccessoires.push(a); });
  localStorage.setItem(BEZIT_DIEREN_SLEUTEL, JSON.stringify(huidigeDieren));
  localStorage.setItem(BEZIT_ACCESSOIRES_SLEUTEL, JSON.stringify(huidigeAccessoires));
}

document.getElementById('btn-naar-winkel').addEventListener('click', () => {
  metProfielVereist(() => {
    toonScherm('scherm-winkel');
    laadWinkelBoxen();
  });
});

document.getElementById('btn-naar-wiel').addEventListener('click', () => {
  metProfielVereist(() => {
    toonScherm('scherm-wiel');
    laadGeluksrad();
  });
});

// ---------- Mysterieboxen laden en tonen ----------

function bouwBoxKaartHtml(boxId, box) {
  const aantalItems = (box.dieren || []).length + (box.accessoires || []).length;
  const isOffline = !!box.offline;
  const nogNietTeKoop = boxIsNogNietTeKoop(box);
  const automatischOffline = boxIsAutomatischOffline(box);
  // Geldt voor iedereen die deze kaart ziet: sitebeheer ziet ook offline/nog-niet-te-koop
  // kisten (en kan ze hier niet per ongeluk kopen); spelers zien een teaser-kist (zie
  // laadWinkelBoxen) ook zonder dat ze hem al kunnen kopen.
  const nietTeKoop = isOffline || nogNietTeKoop || automatischOffline;
  const genoegMunten = !nietTeKoop && haalMunten() >= (box.prijs || 0);
  const algemeenAlGekocht = haalGekochteBoxen().indexOf(boxId) !== -1;
  let html = '<div class="quiz-item-body">' +
    '<div class="quiz-item-info"><strong>🎁 ' + escapeHtml(box.naam || 'Mysteriebox') + '</strong>' +
    '<span>' + (box.prijs || 0) + ' munten · ' + aantalItems + ' verrassing(en) erin</span>';
  if (algemeenAlGekocht) {
    html += '<span class="box-al-gekocht">✅ Al eerder gekocht</span>';
  }
  if (sitebeheerActief) {
    html += '<span class="box-aantal-gekocht">🛒 ' + (box.aantalGekocht || 0) + 'x gekocht (door alle spelers)</span>';
    if (isOffline) {
      html += '<span class="box-status box-status-offline">🔒 Offline — alleen jij ziet deze kist</span>';
    } else if (automatischOffline) {
      html += '<span class="box-status box-status-offline">🔒 Automatisch offline sinds ' + escapeHtml(formatBoxDatum(box.totDatum)) + '</span>';
    } else if (nogNietTeKoop) {
      html += '<span class="box-status box-status-vanaf">⏳ Te koop vanaf ' + escapeHtml(formatBoxDatum(box.vanafDatum)) +
        (box.teaserZichtbaar ? ' · spelers zien alvast dat hij eraan komt' : ' · nog helemaal onzichtbaar voor spelers') + '</span>';
    } else if (box.vanafDatum || box.totDatum) {
      // Kist is nu gewoon te koop, maar heeft een vanaf- en/of tot-datum ingesteld:
      // laat de hele looptijd zien, niet alleen de tot-datum.
      let looptijdTekst;
      if (box.vanafDatum && box.totDatum) {
        looptijdTekst = 'Te koop van ' + formatBoxDatum(box.vanafDatum) + ' tot ' + formatBoxDatum(box.totDatum);
      } else if (box.vanafDatum) {
        looptijdTekst = 'Te koop sinds ' + formatBoxDatum(box.vanafDatum);
      } else {
        looptijdTekst = 'Te koop tot ' + formatBoxDatum(box.totDatum);
      }
      html += '<span class="box-status box-status-vanaf">📅 ' + escapeHtml(looptijdTekst) + '</span>';
    }
  } else if (nogNietTeKoop) {
    // Spelers zien deze kaart bij een nog-niet-te-koop kist alleen als sitebeheer
    // "teaserZichtbaar" heeft aangezet (zie het filteren in laadWinkelBoxen). Is er ook
    // een "tot"-datum ingesteld, dan laten we spelers meteen zien tot wanneer de kist
    // er dan zal zijn, niet alleen wanneer hij begint.
    const teaserTekst = box.totDatum
      ? 'Binnenkort — te koop van ' + formatBoxDatum(box.vanafDatum) + ' tot ' + formatBoxDatum(box.totDatum)
      : 'Binnenkort — te koop vanaf ' + formatBoxDatum(box.vanafDatum);
    html += '<span class="box-status box-status-vanaf">⏳ ' + escapeHtml(teaserTekst) + '</span>';
  } else if (box.totDatum) {
    // Kist is nu gewoon te koop en heeft een tot-datum: laat spelers ook zien tot
    // wanneer ze hem nog kunnen kopen.
    html += '<span class="box-status box-status-vanaf">⏳ Nog te koop tot ' + escapeHtml(formatBoxDatum(box.totDatum)) + '</span>';
  }
  html += '</div>' +
    '<div class="quiz-item-knoppen">' +
    '<button class="btn btn-primary btn-koop-box" data-box="' + boxId + '"' + (genoegMunten ? '' : ' disabled') + '>' +
    (nietTeKoop ? 'Nog niet te koop' : (genoegMunten ? 'Kopen' : 'Niet genoeg munten')) + '</button>';
  if (sitebeheerActief) {
    const offlineKnopTekst = isOffline ? '📶 Online zetten' : '📴 Offline halen';
    html += '<button type="button" class="btn-aanpassen-quiz btn-aanpassen-box" data-box="' + boxId + '">Aanpassen</button>' +
      '<button type="button" class="btn-blokkeren-quiz btn-offline-box' + (isOffline ? ' is-geblokkeerd' : '') + '" data-box="' + boxId + '">' + offlineKnopTekst + '</button>' +
      '<button type="button" class="btn-verwijderen-quiz btn-verwijderen-box" data-box="' + boxId + '">Verwijderen</button>';
  }
  html += '</div></div>';
  return html;
}

// Onthoudt of het overzicht "kisten die nog komen" open of ingeklapt staat.
let komendeKistenOverzichtOpen = false;

// Alleen voor sitebeheer: inklapbaar overzicht van kisten met een "te koop vanaf"-datum
// die nog in de toekomst ligt, op datum gesorteerd (eerstkomende bovenaan).
function toonKomendeKistenOverzicht(alleBoxen) {
  const lijstEl = document.getElementById('winkel-boxen-lijst');
  let overzichtEl = document.getElementById('winkel-komende-kisten-overzicht');

  if (!sitebeheerActief) {
    if (overzichtEl) overzichtEl.remove();
    return;
  }

  const komendeKisten = Object.keys(alleBoxen)
    .map(boxId => alleBoxen[boxId])
    .filter(boxIsNogNietTeKoop)
    .sort((a, b) => (a.vanafDatum || '').localeCompare(b.vanafDatum || ''));

  if (!komendeKisten.length) {
    if (overzichtEl) overzichtEl.remove();
    return;
  }

  if (!overzichtEl) {
    overzichtEl = document.createElement('div');
    overzichtEl.id = 'winkel-komende-kisten-overzicht';
    overzichtEl.className = 'sitebeheer-makers';
    lijstEl.parentNode.insertBefore(overzichtEl, lijstEl);
  }

  const rijenHtml = komendeKisten.map(box => {
    const offlineNotitie = box.offline ? ' · staat daarnaast ook nog handmatig offline' : '';
    const teaserNotitie = box.teaserZichtbaar ? ' · 👀 spelers zien hem al' : ' · 🙈 nog onzichtbaar voor spelers';
    const totNotitie = box.totDatum ? (' · daarna automatisch offline op ' + escapeHtml(formatBoxDatum(box.totDatum))) : '';
    return '<div class="sitebeheer-maker-rij">' +
      '<div class="sitebeheer-maker-naam-rij"><strong>🎁 ' + escapeHtml(box.naam || 'Mysteriebox') + '</strong>' +
      '<span class="sitebeheer-maker-telling">' + (box.prijs || 0) + ' munten</span></div>' +
      '<span class="sitebeheer-maker-telling">⏳ Te koop vanaf ' + escapeHtml(formatBoxDatum(box.vanafDatum)) + totNotitie + teaserNotitie + offlineNotitie + '</span>' +
      '</div>';
  }).join('');

  overzichtEl.innerHTML =
    '<details class="sitebeheer-makers-details"' + (komendeKistenOverzichtOpen ? ' open' : '') + '>' +
    '<summary>🔜 Kisten die nog komen (' + komendeKisten.length + ')</summary>' +
    rijenHtml +
    '</details>';

  const detailsEl = overzichtEl.querySelector('details');
  detailsEl.addEventListener('toggle', () => {
    komendeKistenOverzichtOpen = detailsEl.open;
  });
}

// Onthoudt welke groepen in de winkel open of dicht staan (blijft zo tot je de pagina herlaadt).
const winkelGroepOpen = { online: true, komt: true, gepland: true, offline: false };

// Deelt een kist in bij precies één groep:
//   offline  = handmatig offline gehaald, of automatisch offline door de "tot"-datum
//   komt     = nog niet te koop, maar spelers zien al dat hij eraan komt
//   gepland  = nog niet te koop, nog onzichtbaar voor spelers (alleen sitebeheer ziet hem)
//   online   = nu te koop (met of zonder datum)
function winkelGroepVanBox(box) {
  if (box.offline || boxIsAutomatischOffline(box)) return 'offline';
  if (boxIsNogNietTeKoop(box)) return box.teaserZichtbaar ? 'komt' : 'gepland';
  return 'online';
}

const WINKEL_GROEPEN = [
  { id: 'online',  icoon: '🟢', titel: 'Nu te koop',
    uitleg: 'Deze kisten staan online. Kisten met een datum laten zien tot wanneer je ze kunt kopen.',
    sorteer: (a, b) => (a.totDatum || '9999').localeCompare(b.totDatum || '9999') || String(a.naam || '').localeCompare(String(b.naam || '')) },
  { id: 'komt',    icoon: '👀', titel: 'Komt binnenkort',
    uitleg: 'Nog niet te koop, maar spelers zien al dat deze kisten eraan komen. Op datum gesorteerd.',
    sorteer: (a, b) => (a.vanafDatum || '').localeCompare(b.vanafDatum || '') },
  { id: 'gepland', icoon: '📅', titel: 'Gepland met datum (nog onzichtbaar)',
    uitleg: 'Alleen jij ziet deze kisten. Ze gaan online op de ingestelde datum. Op datum gesorteerd.',
    sorteer: (a, b) => (a.vanafDatum || '').localeCompare(b.vanafDatum || ''), alleenBeheer: true },
  { id: 'offline', icoon: '📴', titel: 'Offline',
    uitleg: 'Handmatig offline gehaald of automatisch offline gegaan door de einddatum. Alleen jij ziet deze kisten.',
    sorteer: (a, b) => String(a.naam || '').localeCompare(String(b.naam || '')), alleenBeheer: true }
];

function laadWinkelBoxen() {
  werkMuntenWeergaveBij();
  document.getElementById('btn-winkel-nieuwe-box').style.display = sitebeheerActief ? 'block' : 'none';
  const lijstEl = document.getElementById('winkel-boxen-lijst');
  const geenBoxenEl = document.getElementById('winkel-geen-boxen');
  lijstEl.classList.add('winkel-secties');
  lijstEl.innerHTML = '<p class="subtitel">Boxen laden...</p>';
  geenBoxenEl.style.display = 'none';

  db.ref('mysterieboxen').once('value').then(snapshot => {
    const alleBoxen = snapshot.val() || {};
    alleMysterieboxenCache = alleBoxen;
    // Het oude uitklapblok "Kisten die nog komen" is vervangen door de groepen hieronder.
    const oudOverzicht = document.getElementById('winkel-komende-kisten-overzicht');
    if (oudOverzicht) oudOverzicht.remove();

    // Gewone spelers zien alleen "Nu te koop" en "Komt binnenkort". Offline, automatisch
    // offline en nog-onzichtbare kisten blijven voor hen verborgen.
    const boxen = {};
    const perGroep = { online: [], komt: [], gepland: [], offline: [] };
    Object.keys(alleBoxen).forEach(boxId => {
      const box = alleBoxen[boxId];
      if (!box) return;
      const groep = winkelGroepVanBox(box);
      if (!sitebeheerActief && (groep === 'offline' || groep === 'gepland')) return;
      boxen[boxId] = box;
      perGroep[groep].push(Object.assign({}, box, { _id: boxId }));
    });

    lijstEl.innerHTML = '';
    const totaal = Object.keys(boxen).length;
    geenBoxenEl.style.display = totaal ? 'none' : 'block';

    WINKEL_GROEPEN.forEach(groep => {
      const items = perGroep[groep.id].sort(groep.sorteer);
      if (!items.length) return;
      const details = document.createElement('details');
      details.className = 'winkel-groep winkel-groep-' + groep.id;
      details.open = !!winkelGroepOpen[groep.id];
      const summary = document.createElement('summary');
      summary.innerHTML = '<span class="winkel-groep-titel">' + groep.icoon + ' ' + escapeHtml(groep.titel) +
        '</span><span class="winkel-groep-aantal">' + items.length + '</span>';
      details.appendChild(summary);
      const uitleg = document.createElement('p');
      uitleg.className = 'winkel-groep-uitleg';
      uitleg.textContent = groep.uitleg;
      details.appendChild(uitleg);
      const raster = document.createElement('div');
      raster.className = 'quizzen-grid winkel-groep-raster';
      items.forEach(box => {
        const kaart = document.createElement('div');
        kaart.className = 'quiz-item';
        kaart.innerHTML = bouwBoxKaartHtml(box._id, box);
        raster.appendChild(kaart);
      });
      details.appendChild(raster);
      details.addEventListener('toggle', () => { winkelGroepOpen[groep.id] = details.open; });
      lijstEl.appendChild(details);
    });

    lijstEl.querySelectorAll('.btn-koop-box').forEach(knop => {
      knop.addEventListener('click', () => koopMysteriebox(knop.dataset.box));
    });
    lijstEl.querySelectorAll('.btn-aanpassen-box').forEach(knop => {
      knop.addEventListener('click', () => openBoxBewerken(knop.dataset.box, boxen[knop.dataset.box]));
    });
    lijstEl.querySelectorAll('.btn-verwijderen-box').forEach(knop => {
      knop.addEventListener('click', () => verwijderMysteriebox(knop.dataset.box));
    });
    lijstEl.querySelectorAll('.btn-offline-box').forEach(knop => {
      knop.addEventListener('click', () => zetBoxOffline(knop.dataset.box, !boxen[knop.dataset.box].offline));
    });
  }).catch(() => {
    lijstEl.innerHTML = '<p class="subtitel">De boxen konden niet geladen worden.</p>';
  });
}

// Zet een kist offline (alleen sitebeheer ziet hem dan nog) of weer online.
function zetBoxOffline(boxId, offline) {
  db.ref('mysterieboxen/' + boxId + '/offline').set(!!offline).then(laadWinkelBoxen).catch(() => {
    alert('Dit is niet gelukt. Probeer het opnieuw.');
  });
}

function koopMysteriebox(boxId) {
  db.ref('mysterieboxen/' + boxId).once('value').then(snapshot => {
    const box = snapshot.val();
    if (!box) {
      alert('Deze mysteriebox bestaat niet meer.');
      laadWinkelBoxen();
      return;
    }
    if (!sitebeheerActief && (box.offline || boxIsNogNietTeKoop(box) || boxIsAutomatischOffline(box))) {
      alert('Deze mysteriebox is nu niet te koop.');
      laadWinkelBoxen();
      return;
    }
    if (haalMunten() < (box.prijs || 0)) {
      alert('Je hebt niet genoeg munten voor deze box.');
      return;
    }

    zetMunten(haalMunten() - (box.prijs || 0));
    voegBezitToe(box.dieren, box.accessoires);
    voegGekochteBoxToe(boxId);
    // Telt voor sitebeheer bij hoeveel spelers deze box al gekocht is (transaction,
    // want meerdere spelers kunnen tegelijk kopen).
    db.ref('mysterieboxen/' + boxId + '/aantalGekocht').transaction(huidig => (huidig || 0) + 1);

    const gekregenNamen = [].concat(
      (box.dieren || []).filter(d => DIER_TEKENINGEN[d]),
      (box.accessoires || []).filter(a => ACCESSOIRES[a]).map(a => ACCESSOIRES[a].naam)
    );
    alert('🎉 Je hebt "' + (box.naam || 'Mysteriebox') + '" geopend! Je hebt nu ook: ' + gekregenNamen.join(', '));

    laadWinkelBoxen();
  });
}

function verwijderMysteriebox(boxId) {
  if (!confirm('Deze mysteriebox definitief verwijderen? Spelers die hem al gekocht hebben, houden gewoon wat ze al kregen.')) return;
  db.ref('mysterieboxen/' + boxId).remove().then(laadWinkelBoxen).catch(() => {
    alert('Verwijderen is niet gelukt. Controleer Firebase (regel voor mysterieboxen) en probeer het opnieuw.');
  });
}

document.getElementById('btn-winkel-nieuwe-box').addEventListener('click', () => openBoxBewerken(null, null));

// ---------- Mysteriebox ontwerpen (alleen sitebeheer) ----------

let bewerkteBoxId = null;
let bewerkteBoxOffline = false;
let boxGeselecteerdeDieren = [];
let boxGeselecteerdeAccessoires = [];

const boxBewerkenOverlayEl = document.getElementById('box-bewerken-overlay');
const inputBoxNaamEl = document.getElementById('input-box-naam');
const inputBoxPrijsEl = document.getElementById('input-box-prijs');
const inputBoxVanafEl = document.getElementById('input-box-vanaf');
const inputBoxTotEl = document.getElementById('input-box-tot');
const inputBoxTeaserEl = document.getElementById('input-box-teaser');
const boxBewerkenFoutmeldingEl = document.getElementById('box-bewerken-foutmelding');

// Telt in hoeveel andere kisten (dus niet de kist die nu bewerkt wordt) een bepaald
// dier of accessoire al zit, zodat sitebeheer dat ziet als een getalletje op de knop.
function telGebruikInAndereBoxen(soort, waarde) {
  let aantal = 0;
  Object.keys(alleMysterieboxenCache).forEach(boxId => {
    if (boxId === bewerkteBoxId) return;
    const andereBox = alleMysterieboxenCache[boxId];
    if (andereBox && Array.isArray(andereBox[soort]) && andereBox[soort].indexOf(waarde) !== -1) {
      aantal++;
    }
  });
  return aantal;
}

// Bouwt de kiesknoppen voor élk dier en élk accessoire uit de hele catalogus
// (niet alleen wat de sitebeheerder zelf al bezit): sitebeheer ontwerpt hier
// immers juist de boxen waarmee andere spelers nieuwe dingen kunnen winnen.
function bouwBoxItemsKiezer() {
  const dierenEl = document.getElementById('box-items-dieren');
  dierenEl.innerHTML = '';
  DIEREN.forEach(dier => {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'dier-knop';
    knop.innerHTML = poppetjeSvg(dier, {});
    const gebruiktIn = telGebruikInAndereBoxen('dieren', dier);
    if (gebruiktIn > 0) {
      knop.innerHTML += '<span class="dier-knop-badge" title="Zit al in ' + gebruiktIn + ' andere kist(en)">' + gebruiktIn + '</span>';
    }
    knop.classList.toggle('gekozen', boxGeselecteerdeDieren.indexOf(dier) !== -1);
    knop.setAttribute('aria-label', 'Kies ' + dier);
    knop.addEventListener('click', () => {
      const i = boxGeselecteerdeDieren.indexOf(dier);
      if (i === -1) boxGeselecteerdeDieren.push(dier); else boxGeselecteerdeDieren.splice(i, 1);
      knop.classList.toggle('gekozen');
    });
    dierenEl.appendChild(knop);
  });

  const accEl = document.getElementById('box-items-accessoires');
  accEl.innerHTML = '';
  const voorbeeldDier = DIEREN[0];
  ACCESSOIRE_GROEPEN.forEach(groep => {
    groep.items.forEach(emoji => {
      const voorbeeld = {};
      voorbeeld[groep.plek] = emoji;
      const knop = document.createElement('button');
      knop.type = 'button';
      knop.className = 'dier-knop';
      knop.innerHTML = poppetjeSvg(voorbeeldDier, voorbeeld);
      knop.title = ACCESSOIRES[emoji].naam;
      const gebruiktIn = telGebruikInAndereBoxen('accessoires', emoji);
      if (gebruiktIn > 0) {
        knop.innerHTML += '<span class="dier-knop-badge" title="Zit al in ' + gebruiktIn + ' andere kist(en)">' + gebruiktIn + '</span>';
      }
      knop.setAttribute('aria-label', 'Kies ' + ACCESSOIRES[emoji].naam);
      knop.classList.toggle('gekozen', boxGeselecteerdeAccessoires.indexOf(emoji) !== -1);
      knop.addEventListener('click', () => {
        const i = boxGeselecteerdeAccessoires.indexOf(emoji);
        if (i === -1) boxGeselecteerdeAccessoires.push(emoji); else boxGeselecteerdeAccessoires.splice(i, 1);
        knop.classList.toggle('gekozen');
      });
      accEl.appendChild(knop);
    });
  });
}

function openBoxBewerken(boxId, box) {
  bewerkteBoxId = boxId;
  bewerkteBoxOffline = box ? !!box.offline : false;
  boxGeselecteerdeDieren = (box && box.dieren) ? box.dieren.slice() : [];
  boxGeselecteerdeAccessoires = (box && box.accessoires) ? box.accessoires.slice() : [];

  document.getElementById('box-bewerken-titel').textContent = boxId ? 'Mysteriebox aanpassen' : 'Nieuwe mysteriebox';
  inputBoxNaamEl.value = box ? (box.naam || '') : '';
  inputBoxPrijsEl.value = box ? (box.prijs || 0) : 100;
  inputBoxVanafEl.value = box ? (box.vanafDatum || '') : '';
  inputBoxTotEl.value = box ? (box.totDatum || '') : '';
  inputBoxTeaserEl.checked = box ? !!box.teaserZichtbaar : false;
  boxBewerkenFoutmeldingEl.textContent = '';
  document.getElementById('btn-box-verwijderen').style.display = boxId ? 'inline-block' : 'none';

  bouwBoxItemsKiezer();
  boxBewerkenOverlayEl.classList.add('actief');
}

document.getElementById('btn-box-annuleren').addEventListener('click', () => {
  boxBewerkenOverlayEl.classList.remove('actief');
});

document.getElementById('btn-box-verwijderen').addEventListener('click', () => {
  if (!bewerkteBoxId) return;
  const boxId = bewerkteBoxId;
  boxBewerkenOverlayEl.classList.remove('actief');
  verwijderMysteriebox(boxId);
});

document.getElementById('btn-box-opslaan').addEventListener('click', () => {
  const naam = inputBoxNaamEl.value.trim();
  const prijs = parseInt(inputBoxPrijsEl.value, 10) || 0;

  if (!naam) {
    boxBewerkenFoutmeldingEl.textContent = 'Vul een naam voor de box in.';
    return;
  }
  if (prijs < 0) {
    boxBewerkenFoutmeldingEl.textContent = 'De prijs kan niet negatief zijn.';
    return;
  }
  if (!boxGeselecteerdeDieren.length && !boxGeselecteerdeAccessoires.length) {
    boxBewerkenFoutmeldingEl.textContent = 'Kies minstens één dier of accessoire voor in de box.';
    return;
  }
  if (inputBoxVanafEl.value && inputBoxTotEl.value && inputBoxTotEl.value <= inputBoxVanafEl.value) {
    boxBewerkenFoutmeldingEl.textContent = '"Automatisch offline vanaf" moet na "Te koop vanaf" liggen.';
    return;
  }

  const boxData = {
    naam: naam,
    prijs: prijs,
    dieren: boxGeselecteerdeDieren,
    accessoires: boxGeselecteerdeAccessoires,
    vanafDatum: inputBoxVanafEl.value || null,
    totDatum: inputBoxTotEl.value || null,
    teaserZichtbaar: !!inputBoxTeaserEl.checked,
    offline: bewerkteBoxOffline
  };

  const ref = bewerkteBoxId ? db.ref('mysterieboxen/' + bewerkteBoxId) : db.ref('mysterieboxen').push();
  ref.set(boxData).then(() => {
    boxBewerkenOverlayEl.classList.remove('actief');
    laadWinkelBoxen();
  }).catch(() => {
    boxBewerkenFoutmeldingEl.textContent = 'Opslaan is niet gelukt. Probeer het opnieuw.';
  });
});

// ---------- Geluksrad (1x per dag gratis draaien voor munten) ----------
// Rad staat in Firebase onder "geluksrad/segmenten" (een array), naast mysterieboxen —
// zie readme.md voor de bijbehorende Firebase-regel. Is er nog niets ingesteld door
// sitebeheer, dan gebruiken we STANDAARD_WIEL_SEGMENTEN zodat het rad meteen werkt.

const WIEL_LAATSTE_DRAAI_SLEUTEL = 'quizAppWielLaatsteDraai';
const WIEL_LAATSTE_RESULTAAT_SLEUTEL = 'quizAppWielLaatsteResultaat';
// Hoeveel volle rondes het rad draait vóór het bij het gekozen vak uitkomt (voor het effect).
const WIEL_EXTRA_RONDES = 5;
// Moet gelijk zijn aan de transition-duration van .wiel-schijf in style.css (in ms).
const WIEL_DRAAI_DUUR_MS = 4200;
// Kleuren voor de vakken, worden cyclisch gebruikt (zoals in het voorbeeldplaatje van een geluksrad).
const WIEL_KLEUREN = ['#f2c14e', '#3fc6f0', '#e0459a', '#8b3fe0', '#f0524a', '#f2933e', '#39c98f', '#4a6bf0'];

const STANDAARD_WIEL_SEGMENTEN = [
  { naam: '5 munten', type: 'munten', munten: 5, kans: 3 },
  { naam: '10 munten', type: 'munten', munten: 10, kans: 3 },
  { naam: '2 munten', type: 'munten', munten: 2, kans: 4 },
  { naam: '20 munten', type: 'munten', munten: 20, kans: 2 },
  { naam: '🐶', type: 'dier', dier: '🐶', kans: 1 },
  { naam: '5 munten', type: 'munten', munten: 5, kans: 3 },
  { naam: '50 munten', type: 'munten', munten: 50, kans: 1 },
  { naam: '10 munten', type: 'munten', munten: 10, kans: 3 },
  { naam: '🐱', type: 'dier', dier: '🐱', kans: 1 },
  { naam: '100 munten', type: 'munten', munten: 100, kans: 1 }
];

let wielSegmentenCache = STANDAARD_WIEL_SEGMENTEN;
let wielSegmentenMetHoek = [];
let wielHuidigeRotatie = 0;
let wielDraaitNu = false;

// Zet de rauwe segmenten (naam/munten/kans) om naar segmenten met een startHoek en
// breedteHoek (in graden, 0° = boven bij de wijzer, met de klok mee) op basis van de
// "kans"-gewichten. Een groter vak = een hoger gewicht = vaker gewonnen.
function berekenWielHoeken(segmenten) {
  const totaalKans = segmenten.reduce((som, s) => som + (s.kans > 0 ? s.kans : 0), 0);
  let cursor = 0;
  return segmenten.map((s, i) => {
    const gewicht = s.kans > 0 ? s.kans : 1;
    const breedte = totaalKans > 0 ? (gewicht / totaalKans) * 360 : (360 / segmenten.length);
    const metHoek = {
      naam: s.naam, type: s.type || 'munten', munten: s.munten, dier: s.dier, accessoire: s.accessoire,
      kans: s.kans, kleur: WIEL_KLEUREN[i % WIEL_KLEUREN.length], startHoek: cursor, breedteHoek: breedte
    };
    cursor += breedte;
    return metHoek;
  });
}

// Kiest een vak, met precies dezelfde kansverhouding als de grootte van de vakken op het rad.
function kiesGewogenWielSegment(segmentenMetHoek) {
  const totaal = segmentenMetHoek.reduce((som, s) => som + s.breedteHoek, 0);
  let r = Math.random() * totaal;
  for (let i = 0; i < segmentenMetHoek.length; i++) {
    if (r < segmentenMetHoek[i].breedteHoek) return segmentenMetHoek[i];
    r -= segmentenMetHoek[i].breedteHoek;
  }
  return segmentenMetHoek[segmentenMetHoek.length - 1];
}

// Bouwt de SVG-taart van het rad op basis van de segmenten-met-hoek.
function bouwWielSvg(segmentenMetHoek) {
  const cx = 140, cy = 140, r = 132;
  const naarPunt = (hoekGraden) => {
    const rad = (hoekGraden - 90) * Math.PI / 180; // -90 zodat 0° boven is
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  let paden = '';
  let labels = '';
  segmentenMetHoek.forEach(s => {
    const start = naarPunt(s.startHoek);
    const eind = naarPunt(s.startHoek + s.breedteHoek);
    const grootBoog = s.breedteHoek > 180 ? 1 : 0;
    paden += '<path d="M ' + cx + ' ' + cy + ' L ' + start[0].toFixed(1) + ' ' + start[1].toFixed(1) +
      ' A ' + r + ' ' + r + ' 0 ' + grootBoog + ' 1 ' + eind[0].toFixed(1) + ' ' + eind[1].toFixed(1) + ' Z" fill="' + s.kleur + '" stroke="#0b1029" stroke-width="2"></path>';
    if (s.breedteHoek > 8) {
      const midHoek = s.startHoek + s.breedteHoek / 2;
      const labelPunt = naarPunt(midHoek);
      const labelX = cx + (labelPunt[0] - cx) * 0.62;
      const labelY = cy + (labelPunt[1] - cy) * 0.62;
      labels += '<text x="' + labelX.toFixed(1) + '" y="' + labelY.toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" font-size="15" font-weight="700" fill="#0b1029">' + escapeHtml(s.naam) + '</text>';
    }
  });
  return '<svg viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg">' + paden + labels + '</svg>';
}

// Werkt de knop-tekst en de statusregel onder het rad bij, afhankelijk van of er vandaag
// al gedraaid is.
// ---- Extra draaien (cadeau van sitebeheer) ----
// Staat online bij het account (accountData/<uid>/wielExtraDraaien), NIET in de gewone
// synchronisatie, zodat een apparaat dat nog "0" heeft het cadeau niet kan overschrijven.
let wielExtraAantal = 0;
let wielExtraRef = null;
function wielExtraUid() {
  const b = bezoekUid();
  if (b) return b;
  const u = auth.currentUser;
  return (u && isSpelerAccount(u) && u.uid === accountUid()) ? u.uid : '';
}
function luisterNaarWielExtra() {
  if (wielExtraRef) { wielExtraRef.off(); wielExtraRef = null; }
  wielExtraAantal = 0;
  const uid = wielExtraUid();
  if (!uid) return;
  wielExtraRef = db.ref('accountData/' + uid + '/wielExtraDraaien');
  wielExtraRef.on('value', snap => {
    const n = parseInt(snap.val(), 10);
    wielExtraAantal = n > 0 ? n : 0;
    werkWielStatusBij();
  }, () => {});
}
function stopWielExtraLuisteren() {
  if (wielExtraRef) { wielExtraRef.off(); wielExtraRef = null; }
}

// Alles wat je vandaag aan het rad won (gewone draai + extra draaien), als lijst.
function wielVandaagLijst() {
  const vandaag = huidigeDatumTekst();
  try {
    const v = JSON.parse(localStorage.getItem('quizAppWielVandaag') || 'null');
    if (v && v.datum === vandaag && Array.isArray(v.lijst)) return v.lijst;
  } catch (e) {}
  const oud = localStorage.getItem(WIEL_LAATSTE_RESULTAAT_SLEUTEL);
  return (localStorage.getItem(WIEL_LAATSTE_DRAAI_SLEUTEL) === vandaag && oud) ? [oud] : [];
}
function voegWielWinstToe(naam) {
  const lijst = wielVandaagLijst().slice();
  lijst.push(naam);
  localStorage.setItem('quizAppWielVandaag', JSON.stringify({ datum: huidigeDatumTekst(), lijst: lijst }));
}
function wielWinstHtml() {
  const lijst = wielVandaagLijst();
  if (!lijst.length) return '';
  return lijst.map((naam, i) => (i === 0 ? '🎉 Vandaag gewonnen: ' : '➕ Extra draai gewonnen: ') + escapeHtml(naam)).join('<br>');
}

function werkWielStatusBij() {
  const knopEl = document.getElementById('btn-wiel-draaien');
  const statusEl = document.getElementById('wiel-status');
  const resultaatEl = document.getElementById('wiel-resultaat');
  const vandaag = huidigeDatumTekst();
  const alGedraaidVandaag = localStorage.getItem(WIEL_LAATSTE_DRAAI_SLEUTEL) === vandaag;
  const extraTekst = wielExtraAantal > 0
    ? '🎁 Sitebeheer gaf je ' + wielExtraAantal + ' extra ' + (wielExtraAantal === 1 ? 'draai' : 'draaien') + '! '
    : '';

  if (alGedraaidVandaag && wielExtraAantal <= 0) {
    knopEl.disabled = true;
    statusEl.textContent = '⏳ Je hebt vandaag al gedraaid. Kom morgen terug voor een nieuwe beurt!';
  } else {
    knopEl.disabled = wielDraaitNu;
    statusEl.textContent = wielDraaitNu ? '' : extraTekst + 'Klik op de knop in het midden van het rad om te draaien!';
  }
  if (!wielDraaitNu) resultaatEl.innerHTML = alGedraaidVandaag ? wielWinstHtml() : '';
}

function laadGeluksrad() {
  werkMuntenWeergaveBij();
  luisterNaarWielExtra();
  document.getElementById('btn-wiel-aanpassen').style.display = sitebeheerActief ? 'inline-block' : 'none';
  wielHuidigeRotatie = 0;
  const schijfEl = document.getElementById('wiel-schijf');
  schijfEl.style.transition = 'none';
  schijfEl.style.transform = 'rotate(0deg)';

  db.ref('geluksrad/segmenten').once('value').then(snapshot => {
    const opgeslagen = snapshot.val();
    wielSegmentenCache = (Array.isArray(opgeslagen) && opgeslagen.length >= 2) ? opgeslagen : STANDAARD_WIEL_SEGMENTEN;
    wielSegmentenMetHoek = berekenWielHoeken(wielSegmentenCache);
    schijfEl.innerHTML = bouwWielSvg(wielSegmentenMetHoek);
    // Forceer een reflow zodat de volgende draai-transitie weer gewoon animeert
    // (na het instant terugzetten naar 0° hierboven).
    void schijfEl.offsetWidth;
    schijfEl.style.transition = '';
    werkWielStatusBij();
  }).catch(() => {
    wielSegmentenCache = STANDAARD_WIEL_SEGMENTEN;
    wielSegmentenMetHoek = berekenWielHoeken(wielSegmentenCache);
    schijfEl.innerHTML = bouwWielSvg(wielSegmentenMetHoek);
    werkWielStatusBij();
  });
}

function draaiRad() {
  if (wielDraaitNu) return;
  const vandaag = huidigeDatumTekst();
  const alGedraaidVandaag = localStorage.getItem(WIEL_LAATSTE_DRAAI_SLEUTEL) === vandaag;
  if (!wielSegmentenMetHoek.length) return;
  if (!alGedraaidVandaag) { startWielDraai(vandaag, false); return; }
  // Vandaag al gedraaid: alleen met een extra draai van sitebeheer.
  const uid = wielExtraUid();
  if (!uid || wielExtraAantal <= 0) return;
  wielDraaitNu = true;
  werkWielStatusBij();
  db.ref('accountData/' + uid + '/wielExtraDraaien').transaction(huidig => {
    const n = parseInt(huidig, 10);
    return n > 0 ? String(n - 1) : undefined;   // niets meer over: afbreken
  }).then(res => {
    wielDraaitNu = false;
    if (!res.committed) { wielExtraAantal = 0; werkWielStatusBij(); return; }
    startWielDraai(vandaag, true);
  }).catch(() => { wielDraaitNu = false; werkWielStatusBij(); });
}

function startWielDraai(vandaag, isExtra) {
  wielDraaitNu = true;
  werkWielStatusBij();

  const gekozenSegment = kiesGewogenWielSegment(wielSegmentenMetHoek);
  const marge = Math.min(wielSegmentenMetHoek.length > 1 ? gekozenSegment.breedteHoek * 0.15 : 0, 10);
  const speling = Math.max(gekozenSegment.breedteHoek - marge * 2, 0.01);
  const doelHoek = gekozenSegment.startHoek + marge + Math.random() * speling;

  const huidigeBasis = ((wielHuidigeRotatie % 360) + 360) % 360;
  let extra = (360 - doelHoek) - huidigeBasis;
  extra = ((extra % 360) + 360) % 360;
  wielHuidigeRotatie += WIEL_EXTRA_RONDES * 360 + extra;

  document.getElementById('wiel-schijf').style.transform = 'rotate(' + wielHuidigeRotatie + 'deg)';

  setTimeout(() => {
    wielDraaitNu = false;
    // Een extra draai verandert niets aan je dagelijkse beurt.
    if (!isExtra) {
      localStorage.setItem(WIEL_LAATSTE_DRAAI_SLEUTEL, vandaag);
      localStorage.setItem(WIEL_LAATSTE_RESULTAAT_SLEUTEL, gekozenSegment.naam);
      localStorage.setItem('quizAppWielVandaag', JSON.stringify({ datum: vandaag, lijst: [gekozenSegment.naam] }));
    } else {
      // Extra draai: komt er gewoon bij te staan onder "Vandaag gewonnen".
      voegWielWinstToe(gekozenSegment.naam);
    }
    if (gekozenSegment.type === 'dier' && gekozenSegment.dier) {
      voegBezitToe([gekozenSegment.dier], []);
    } else if (gekozenSegment.type === 'accessoire' && gekozenSegment.accessoire) {
      voegBezitToe([], [gekozenSegment.accessoire]);
    } else if (gekozenSegment.munten) {
      geefMunten(gekozenSegment.munten);
    }
    werkWielStatusBij();
  }, WIEL_DRAAI_DUUR_MS);
}

document.getElementById('btn-wiel-draaien').addEventListener('click', draaiRad);

// ---------- Geluksrad aanpassen (alleen sitebeheer) ----------

const wielBewerkenOverlayEl = document.getElementById('wiel-bewerken-overlay');
const wielSegmentenLijstEl = document.getElementById('wiel-segmenten-lijst');
const sjabloonWielSegmentRij = document.getElementById('sjabloon-wiel-segment-rij');
const wielBewerkenFoutmeldingEl = document.getElementById('wiel-bewerken-foutmelding');

// Vult de dier- en accessoire-keuzelijst van één rij met de hele catalogus (net als bij
// het maken van een mysteriebox: ook de dieren/accessoires die niet standaard te kiezen zijn).
function vulWielDierAccessoireSelects(rij) {
  const dierSelectEl = rij.querySelector('.wiel-segment-dier');
  DIEREN.forEach(dier => {
    const optie = document.createElement('option');
    optie.value = dier;
    optie.textContent = dier;
    dierSelectEl.appendChild(optie);
  });

  const accSelectEl = rij.querySelector('.wiel-segment-accessoire');
  ACCESSOIRE_GROEPEN.forEach(groep => {
    groep.items.forEach(emoji => {
      const optie = document.createElement('option');
      optie.value = emoji;
      optie.textContent = emoji + ' ' + ACCESSOIRES[emoji].naam;
      accSelectEl.appendChild(optie);
    });
  });
}

// Laat bij een rij alleen het invoerveld zien dat bij het gekozen type hoort
// (munten-aantal, dier-keuze of accessoire-keuze).
function werkWielSegmentTypeWeergaveBij(rij) {
  const type = rij.querySelector('.wiel-segment-type').value;
  rij.querySelector('.wiel-segment-munten').style.display = type === 'munten' ? '' : 'none';
  rij.querySelector('.wiel-segment-dier').style.display = type === 'dier' ? '' : 'none';
  rij.querySelector('.wiel-segment-accessoire').style.display = type === 'accessoire' ? '' : 'none';
}

function voegWielSegmentRijToe(segment) {
  const kloon = sjabloonWielSegmentRij.content.cloneNode(true);
  const rij = kloon.querySelector('.wiel-segment-rij');
  const type = segment ? (segment.type || 'munten') : 'munten';

  vulWielDierAccessoireSelects(rij);

  rij.querySelector('.wiel-segment-type').value = type;
  rij.querySelector('.wiel-segment-naam').value = segment ? (segment.naam || '') : '';
  rij.querySelector('.wiel-segment-munten').value = segment ? (segment.munten || 0) : 10;
  if (segment && segment.dier) rij.querySelector('.wiel-segment-dier').value = segment.dier;
  if (segment && segment.accessoire) rij.querySelector('.wiel-segment-accessoire').value = segment.accessoire;
  rij.querySelector('.wiel-segment-kans').value = segment ? (segment.kans || 1) : 1;

  werkWielSegmentTypeWeergaveBij(rij);
  rij.querySelector('.wiel-segment-type').addEventListener('change', () => werkWielSegmentTypeWeergaveBij(rij));
  rij.querySelector('.wiel-segment-verwijderen').addEventListener('click', () => rij.remove());
  wielSegmentenLijstEl.appendChild(kloon);
}

function openGeluksradBewerken() {
  wielSegmentenLijstEl.innerHTML = '';
  wielBewerkenFoutmeldingEl.textContent = '';
  wielSegmentenCache.forEach(segment => voegWielSegmentRijToe(segment));
  wielBewerkenOverlayEl.classList.add('actief');
}

document.getElementById('btn-wiel-aanpassen').addEventListener('click', openGeluksradBewerken);

document.getElementById('btn-wiel-segment-toevoegen').addEventListener('click', () => {
  voegWielSegmentRijToe(null);
});

document.getElementById('btn-wiel-annuleren').addEventListener('click', () => {
  wielBewerkenOverlayEl.classList.remove('actief');
});

document.getElementById('btn-wiel-opslaan').addEventListener('click', () => {
  const rijen = wielSegmentenLijstEl.querySelectorAll('.wiel-segment-rij');
  const segmenten = [];
  let fout = '';

  rijen.forEach(rij => {
    if (fout) return;
    const type = rij.querySelector('.wiel-segment-type').value;
    const naamRuw = rij.querySelector('.wiel-segment-naam').value.trim();
    const kans = parseInt(rij.querySelector('.wiel-segment-kans').value, 10);
    if (isNaN(kans) || kans < 1) { fout = 'Vul bij elk vak een kans van minstens 1 in.'; return; }

    if (type === 'dier') {
      const dier = rij.querySelector('.wiel-segment-dier').value;
      if (!dier) { fout = 'Kies bij elk "dier"-vak welk dier het is.'; return; }
      segmenten.push({ naam: naamRuw || dier, type: 'dier', dier: dier, kans: kans });
    } else if (type === 'accessoire') {
      const accessoire = rij.querySelector('.wiel-segment-accessoire').value;
      if (!accessoire) { fout = 'Kies bij elk "accessoire"-vak welk accessoire het is.'; return; }
      segmenten.push({ naam: naamRuw || accessoire, type: 'accessoire', accessoire: accessoire, kans: kans });
    } else {
      const munten = parseInt(rij.querySelector('.wiel-segment-munten').value, 10);
      if (isNaN(munten) || munten < 0) { fout = 'Vul bij elk "munten"-vak een geldig aantal munten in (0 of meer).'; return; }
      segmenten.push({ naam: naamRuw || (munten + ' munten'), type: 'munten', munten: munten, kans: kans });
    }
  });

  if (!fout && segmenten.length < 2) {
    fout = 'Voeg minstens 2 vakken toe aan het rad.';
  }
  if (fout) {
    wielBewerkenFoutmeldingEl.textContent = fout;
    return;
  }

  db.ref('geluksrad/segmenten').set(segmenten).then(() => {
    wielBewerkenOverlayEl.classList.remove('actief');
    laadGeluksrad();
  }).catch(() => {
    wielBewerkenFoutmeldingEl.textContent = 'Opslaan is niet gelukt. Probeer het opnieuw.';
  });
});

// Toont de foto van een vraag (of verbergt het plaatje als er geen foto is).
function toonVraagFoto(imgId, url) {
  const imgEl = document.getElementById(imgId);
  if (url) {
    imgEl.src = url;
    imgEl.hidden = false;
  } else {
    imgEl.removeAttribute('src');
    imgEl.hidden = true;
  }
}

// Zet het/de goede antwoord(en) in het groot op het scherm.
// prefix is 'host' of 'speler' (bepaalt welke elementen gevuld worden).
function renderGroteAntwoorden(prefix, vraag) {
  document.getElementById(prefix + '-antwoord-label').textContent =
    vraag.goedAntwoorden.length > 1 ? 'De goede antwoorden' : 'Het goede antwoord';

  const containerEl = document.getElementById(prefix + '-antwoord-groot');
  containerEl.innerHTML = '';
  vraag.goedAntwoorden.forEach(nummer => {
    const optie = document.createElement('div');
    optie.className = 'antwoord-optie goed antwoord-groot';
    optie.textContent = vraag.antwoorden[nummer - 1];
    containerEl.appendChild(optie);
  });
}

function stopSessieListener() {
  if (huidigeSessieRef) {
    huidigeSessieRef.off();
    huidigeSessieRef = null;
  }
  stopHostTimer();
}

function luisterNaarSessie(code) {
  stopSessieListener();
  huidigeSessieRef = db.ref('sessies/' + code);
  huidigeSessieRef.on('value', snapshot => {
    const sessie = snapshot.val();
    if (!sessie) {
      // De sessie bestaat niet meer, bijv. omdat de quizmaster is gestopt/weggegaan.
      if (huidigeRol === 'speler') {
        stopSessieListener();
        huidigeRol = null;
        toonScherm('scherm-speler-host-weg');
      }
      return;
    }
    if (huidigeRol === 'host') {
      renderSessieVoorHost(sessie);
    } else if (huidigeRol === 'speler') {
      renderSessieVoorSpeler(sessie);
    }
  });
}

function renderScorebordLijst(containerId, spelers, eigenSpelerId) {
  const lijstEl = document.getElementById(containerId);
  lijstEl.innerHTML = '';

  const gesorteerdeSpelers = Object.entries(spelers || {}).sort((a, b) => {
    const scoreA = (a[1].score) || 0;
    const scoreB = (b[1].score) || 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    const tijdA = (a[1].totaleReactietijd) || 0;
    const tijdB = (b[1].totaleReactietijd) || 0;
    return tijdA - tijdB; // sneller (lagere tijd) wint bij gelijke stand
  });

  gesorteerdeSpelers.forEach(([spelerId, speler], index) => {
    const rij = document.createElement('div');
    rij.className = 'scorebord-rij' + (spelerId === eigenSpelerId ? ' eigen' : '');

    const plek = document.createElement('div');
    plek.className = 'scorebord-plek';
    plek.textContent = '#' + (index + 1);

    const naam = document.createElement('div');
    naam.className = 'scorebord-naam';
    naam.textContent = speler.naam;

    const score = document.createElement('div');
    score.className = 'scorebord-score';
    score.textContent = formatPunten(speler.score || 0) + ' pt';

    rij.appendChild(plek); // 1e, 2e, 3e plek enz. blijven gewoon staan
    const dier = geldigDier(speler.dier);
    if (dier) {
      const dierEl = document.createElement('div');
      dierEl.className = 'scorebord-dier';
      dierEl.appendChild(maakPoppetje(dier, speler.accessoires));
      rij.appendChild(dierEl);
    }
    rij.appendChild(naam);
    rij.appendChild(score);
    lijstEl.appendChild(rij);
  });
}

// ---------- Hosten (de maker van de quiz speelt hem live) ----------

function startHostenVanQuiz(code) {
  db.ref('quizzen/' + code).once('value').then(snapshot => {
    const quizData = snapshot.val();
    if (!quizData) {
      alert('Deze quiz kon niet gevonden worden (misschien is hij verwijderd).');
      return;
    }

    huidigeQuizVragen = (quizData.vragen || []).map(normaliseerVraag);
    huidigeQuizTitel = quizData.titel;
    huidigeQuizTijdslimiet = quizData.tijdslimiet || TIJDSLIMIET_STANDAARD;
    huidigeSessieCode = code;
    huidigeRol = 'host';
    huidigeVraagIndexHost = -1;

    const nieuweSessie = {
      status: 'wachtkamer',
      huidigeVraagIndex: -1,
      spelers: {},
      antwoorden: {}
    };

    const sessieRef = db.ref('sessies/' + code);
    sessieRef.set(nieuweSessie).then(() => {
      // Als de host de pagina sluit of de verbinding verliest, wordt de sessie
      // automatisch verwijderd. Spelers krijgen dit meteen te zien (zie luisterNaarSessie).
      sessieRef.onDisconnect().remove();

      document.getElementById('host-wachtkamer-titel').textContent = huidigeQuizTitel;
      document.getElementById('host-wachtkamer-code').textContent = code;
      toonScherm('scherm-host-wachtkamer');
      luisterNaarSessie(code);
    });
  });
}

// ---------- Wekker per vraag (alleen bij de quizmaster) ----------
//
// `vraagGestartOp` staat al in de sessie (wordt gezet zodra een vraag begint).
// De host telt daarvandaan zelf af; zo blijft de klok kloppen ook als het
// scherm om een andere reden opnieuw tekent (bijv. een speler antwoordt).
// Loopt de tijd af, dan gaat de host automatisch door naar het resultaat —
// hetzelfde als zelf op "Doorgaan" klikken, wat ook eerder mag.

function stopHostTimer() {
  if (hostTimerInterval) {
    clearInterval(hostTimerInterval);
    hostTimerInterval = null;
  }
  hostTimerVoorVraagGestartOp = null;
  const timerEl = document.getElementById('host-vraag-timer');
  if (timerEl) timerEl.hidden = true;
}

function werkHostTimerWeergaveBij(secondenOver) {
  const OMTREK = 283; // 2 * pi * 45 (zelfde als stroke-dasharray in de CSS)
  const fractie = huidigeQuizTijdslimiet > 0 ? secondenOver / huidigeQuizTijdslimiet : 0;
  document.getElementById('host-vraag-timer-getal').textContent = String(secondenOver);
  document.getElementById('host-vraag-timer-vulling')
    .style.setProperty('--doel', String(Math.round(OMTREK * (1 - fractie))));
  document.getElementById('host-vraag-timer').classList.toggle('bijna-om', secondenOver <= 5);
}

function startHostTimerAlsNodig(sessie) {
  const gestartOp = sessie.vraagGestartOp;
  if (!huidigeQuizTijdslimiet || !gestartOp) {
    stopHostTimer();
    return;
  }
  // Loopt de klok al voor deze vraag? Dan niet opnieuw beginnen bij elke
  // hertekening (bijv. omdat een speler net geantwoord heeft).
  if (hostTimerVoorVraagGestartOp === gestartOp) return;

  stopHostTimer();
  hostTimerVoorVraagGestartOp = gestartOp;
  document.getElementById('host-vraag-timer').hidden = false;

  const tick = () => {
    const verstrekenMs = Date.now() - gestartOp;
    const secondenOver = Math.max(0, Math.ceil((huidigeQuizTijdslimiet * 1000 - verstrekenMs) / 1000));
    werkHostTimerWeergaveBij(secondenOver);
    if (secondenOver <= 0) {
      stopHostTimer();
      berekenScoresEnToonResultaat();
    }
  };

  tick();
  hostTimerInterval = setInterval(tick, 250);
}

function renderSessieVoorHost(sessie) {
  huidigeVraagIndexHost = sessie.huidigeVraagIndex;
  const spelers = sessie.spelers || {};
  const aantalSpelers = Object.keys(spelers).length;

  // De wekker loopt alleen tijdens een vraag; bij elke andere status stoppen.
  if (sessie.status !== 'vraag') stopHostTimer();

  if (sessie.status === 'wachtkamer') {
    document.getElementById('host-wachtkamer-aantal').textContent = aantalSpelers + ' speler(s) aanwezig';

    const lijstEl = document.getElementById('host-wachtkamer-spelerslijst');
    lijstEl.innerHTML = '';
    Object.entries(spelers).forEach(([spelerId, speler]) => {
      const chip = document.createElement('div');
      chip.className = 'speler-chip';
      chip.title = 'Klik om ' + speler.naam + ' te verwijderen';
      const chipDier = geldigDier(speler.dier);
      if (chipDier) {
        const chipDierEl = document.createElement('span');
        chipDierEl.className = 'speler-chip-dier';
        chipDierEl.appendChild(maakPoppetje(chipDier, speler.accessoires));
        chip.appendChild(chipDierEl);
      }
      const chipNaamEl = document.createElement('span');
      chipNaamEl.className = 'speler-chip-naam';
      chipNaamEl.textContent = speler.naam;
      chip.appendChild(chipNaamEl);
      const chipKruisEl = document.createElement('span');
      chipKruisEl.className = 'speler-chip-kruis';
      chipKruisEl.innerHTML = '&times;';
      chip.appendChild(chipKruisEl);
      chip.addEventListener('click', () => {
        db.ref('sessies/' + huidigeSessieCode + '/spelers/' + spelerId).remove();
        db.ref('sessies/' + huidigeSessieCode + '/antwoorden').once('value').then(antwoordenSnapshot => {
          const antwoorden = antwoordenSnapshot.val() || {};
          Object.keys(antwoorden).forEach(vraagIndex => {
            if (antwoorden[vraagIndex] && antwoorden[vraagIndex][spelerId]) {
              db.ref('sessies/' + huidigeSessieCode + '/antwoorden/' + vraagIndex + '/' + spelerId).remove();
            }
          });
        });
      });
      lijstEl.appendChild(chip);
    });

    toonScherm('scherm-host-wachtkamer');
  }

  if (sessie.status === 'vraag') {
    const vraag = huidigeQuizVragen[sessie.huidigeVraagIndex];

    document.getElementById('host-voortgang-weergave').textContent =
      'Vraag ' + (sessie.huidigeVraagIndex + 1) + ' van ' + huidigeQuizVragen.length +
      ' · ' + vraag.punten + (vraag.punten === 1 ? ' punt' : ' punten');
    document.getElementById('host-vraag-weergave').textContent = vraag.vraag;
    toonVraagFoto('host-vraag-foto', vraag.afbeelding);

    const antwoordenEl = document.getElementById('host-antwoorden-weergave');
    antwoordenEl.innerHTML = '';
    vraag.antwoorden.forEach(tekst => {
      const optie = document.createElement('div');
      optie.className = 'antwoord-optie';
      optie.textContent = tekst;
      antwoordenEl.appendChild(optie);
    });

    const antwoordenVoorVraag = (sessie.antwoorden && sessie.antwoorden[sessie.huidigeVraagIndex]) || {};
    const aantalGeantwoord = Object.keys(antwoordenVoorVraag).length;
    const tellerEl = document.getElementById('host-antwoord-teller');
    tellerEl.classList.add('laad-rij');
    tellerEl.innerHTML = '<span class="laad-spinner"></span>' +
      aantalGeantwoord + ' van ' + aantalSpelers + ' spelers hebben geantwoord';

    toonScherm('scherm-host-vraag');

    // Heeft iedereen al geantwoord? Dan hoeft er niet meer gewacht te worden
    // op de wekker: automatisch door naar het resultaat (geen knop meer nodig
    // bij de vraag zelf). Zonder spelers (bijv. net allemaal verwijderd) wacht
    // de vraag gewoon op de wekker, in plaats van meteen door te schieten.
    if (aantalSpelers > 0 && aantalGeantwoord >= aantalSpelers) {
      stopHostTimer();
      berekenScoresEnToonResultaat();
    } else {
      startHostTimerAlsNodig(sessie);
    }
  }

  if (sessie.status === 'resultaat') {
    const vraag = huidigeQuizVragen[sessie.huidigeVraagIndex];
    const antwoordenVoorVraag = (sessie.antwoorden && sessie.antwoorden[sessie.huidigeVraagIndex]) || {};
    const gegeven = Object.entries(antwoordenVoorVraag).filter(([spelerId]) => spelers[spelerId]);
    const aantalGeantwoord = gegeven.length;
    const aantalGoed = gegeven
      .filter(([, a]) => setsGelijk(a.antwoordIndexen || [], vraag.goedAntwoorden)).length;
    const aantalFout = aantalGeantwoord - aantalGoed;
    const aantalGeen = Math.max(0, aantalSpelers - aantalGeantwoord);

    document.getElementById('host-resultaat-voortgang').textContent =
      'Vraag ' + (sessie.huidigeVraagIndex + 1) + ' van ' + huidigeQuizVragen.length;
    document.getElementById('host-resultaat-vraag').textContent = vraag.vraag;
    renderGroteAntwoorden('host', vraag);

    // Kop met een passende reactie
    let kop;
    if (aantalSpelers > 0 && aantalGoed === aantalSpelers) {
      kop = aantalSpelers === 1 ? '🎉 Goed gedaan!' : '🎉 Iedereen had het goed!';
    } else if (aantalGoed === 0) {
      kop = '😬 Niemand had het goed';
    } else if (aantalGoed * 2 >= aantalSpelers) {
      kop = '👏 Best goed gedaan!';
    } else {
      kop = '🤔 Dat was een lastige!';
    }
    document.getElementById('host-resultaat-kop').textContent = kop;

    // Ring: hoeveel van de spelers het goed had
    const OMTREK = 377; // 2 * pi * 60 (zelfde als stroke-dasharray in de CSS)
    const fractie = aantalSpelers > 0 ? aantalGoed / aantalSpelers : 0;
    const ringEl = document.getElementById('host-resultaat-ring');
    ringEl.style.setProperty('--doel', String(Math.round(OMTREK * (1 - fractie))));
    ringEl.classList.toggle('leeg', aantalGoed === 0);

    document.getElementById('host-resultaat-aantal').textContent = aantalGoed + '/' + aantalSpelers;
    document.getElementById('host-resultaat-telling').textContent =
      aantalGoed + ' van ' + aantalSpelers + (aantalSpelers === 1 ? ' speler' : ' spelers') +
      (aantalGoed === 1 ? ' had' : ' hadden') + ' het goed';

    document.getElementById('host-resultaat-chip-goed').textContent = '✔ ' + aantalGoed + ' goed';
    document.getElementById('host-resultaat-chip-fout').textContent = '✗ ' + aantalFout + ' fout';
    const geenChipEl = document.getElementById('host-resultaat-chip-geen');
    geenChipEl.textContent = '⏳ ' + aantalGeen + ' niet geantwoord';
    geenChipEl.hidden = aantalGeen === 0;

    toonScherm('scherm-host-resultaat');
  }

  if (sessie.status === 'scorebord' || sessie.status === 'afgelopen') {
    document.getElementById('host-scorebord-titel').textContent =
      sessie.status === 'afgelopen' ? 'Eindstand 🏆' : 'Scorebord';

    renderScorebordLijst('host-scorebord-lijst', spelers, null);

    const isLaatsteVraag = sessie.huidigeVraagIndex + 1 >= huidigeQuizVragen.length;
    const volgendeKnop = document.getElementById('btn-host-volgende-vraag');
    volgendeKnop.style.display = sessie.status === 'afgelopen' ? 'none' : 'block';
    volgendeKnop.textContent = isLaatsteVraag ? 'Bekijk eindstand' : 'Volgende vraag';

    toonScherm('scherm-host-scorebord');
  }
}

document.getElementById('btn-host-start-quiz').addEventListener('click', () => {
  db.ref('sessies/' + huidigeSessieCode).update({
    huidigeVraagIndex: 0,
    status: 'vraag',
    vraagGestartOp: Date.now()
  });
});

// Stap 1 (na de vraag): punten tellen en de spelers laten zien of ze het goed hadden.
// Gebeurt automatisch — er is geen "Doorgaan"-knop meer bij de vraag zelf:
// zodra iedereen geantwoord heeft (zie renderSessieVoorHost) of zodra de
// wekker afloopt (zie startHostTimerAlsNodig). De vergrendeling voorkomt dat
// punten dubbel geteld worden als dat toevallig tegelijk gebeurt.
function berekenScoresEnToonResultaat() {
  if (resultaatWordtBerekend) return Promise.resolve();
  resultaatWordtBerekend = true;
  const sessieRef = db.ref('sessies/' + huidigeSessieCode);
  return sessieRef.once('value').then(snapshot => {
    const sessie = snapshot.val();
    // Alleen tellen zolang de vraag nog loopt (voorkomt dubbel punten geven).
    if (!sessie || sessie.status !== 'vraag') return;

    const vraagIndex = sessie.huidigeVraagIndex;
    const vraag = huidigeQuizVragen[vraagIndex];
    const antwoordenVoorVraag = (sessie.antwoorden && sessie.antwoorden[vraagIndex]) || {};
    const spelers = sessie.spelers || {};

    const updates = {};
    Object.keys(antwoordenVoorVraag).forEach(spelerId => {
      if (!spelers[spelerId]) return; // speler is inmiddels weg
      const antwoord = antwoordenVoorVraag[spelerId];
      const gekozenIndexen = antwoord.antwoordIndexen || [];
      if (setsGelijk(gekozenIndexen, vraag.goedAntwoorden)) {
        const huidigeScore = spelers[spelerId].score || 0;
        const huidigeTijd = spelers[spelerId].totaleReactietijd || 0;
        updates['spelers/' + spelerId + '/score'] = huidigeScore + (typeof vraag.punten === 'number' ? vraag.punten : 1000);
        updates['spelers/' + spelerId + '/totaleReactietijd'] = huidigeTijd + (antwoord.reactietijdMs || 0);
      }
    });
    updates['status'] = 'resultaat';

    return sessieRef.update(updates);
  }).finally(() => {
    resultaatWordtBerekend = false;
  });
}

// Stap 2: het scorebord (zonder vraag en antwoord).
document.getElementById('btn-host-naar-scorebord').addEventListener('click', () => {
  db.ref('sessies/' + huidigeSessieCode).update({ status: 'scorebord' });
});

document.getElementById('btn-host-volgende-vraag').addEventListener('click', () => {
  const volgende = huidigeVraagIndexHost + 1;
  const sessieRef = db.ref('sessies/' + huidigeSessieCode);

  if (volgende < huidigeQuizVragen.length) {
    sessieRef.update({
      huidigeVraagIndex: volgende,
      status: 'vraag',
      vraagGestartOp: Date.now()
    });
  } else {
    sessieRef.update({ status: 'afgelopen' });
  }
});

document.getElementById('btn-host-afronden').addEventListener('click', () => {
  if (huidigeSessieCode) {
    db.ref('sessies/' + huidigeSessieCode).remove();
  }
  stopSessieListener();
  huidigeRol = null;
  toonScherm('scherm-algemeen');
});

document.getElementById('btn-host-verlaat-wachtkamer').addEventListener('click', () => {
  if (huidigeSessieCode) {
    db.ref('sessies/' + huidigeSessieCode).remove();
  }
  stopSessieListener();
  huidigeRol = null;
  toonScherm('scherm-algemeen');
});

// ---------- Meedoen aan quiz (speler) ----------

document.getElementById('btn-ga-naar-quiz').addEventListener('click', () => {
  const code = document.getElementById('input-code').value.trim().toUpperCase();
  const naam = document.getElementById('input-speler-naam').value.trim();
  const foutmelding = document.getElementById('meedoen-foutmelding');
  foutmelding.textContent = '';

  if (!code) {
    foutmelding.textContent = 'Vul een code in.';
    return;
  }
  if (!naam) {
    foutmelding.textContent = 'Vul je naam in.';
    return;
  }

  db.ref('quizzen/' + code).once('value')
    .then(snapshot => {
      const quizData = snapshot.val();
      if (!quizData) {
        foutmelding.textContent = 'Geen quiz gevonden met deze code.';
        return;
      }

      return db.ref('sessies/' + code).once('value').then(sessieSnapshot => {
        const sessie = sessieSnapshot.val();

        if (!sessie) {
          foutmelding.textContent = 'Deze quiz is nog niet gestart. Vraag de quizmaster om op "Spelen" te klikken op zijn/haar laptop.';
          return;
        }
        if (sessie.status !== 'wachtkamer') {
          foutmelding.textContent = 'Deze quiz is al begonnen, je kan er nu niet meer bij.';
          return;
        }

        huidigeQuizVragen = (quizData.vragen || []).map(normaliseerVraag);
        huidigeQuizTitel = quizData.titel;
        huidigeSessieCode = code;
        huidigeRol = 'speler';
        huidigeSpelerId = 'speler-' + Math.random().toString(36).slice(2, 10);
        laatstGetoondeVraagIndexSpeler = -1;
        muntenToegekendVoorSessie = null; // nieuwe sessie: nog geen munten toegekend

        // Iedereen begint met een willekeurig dier; in de wachtkamer kun je een ander kiezen.
        const startDier = willekeurigDier();

        return db.ref('sessies/' + code + '/spelers/' + huidigeSpelerId)
          .set({ naam: naam, dier: startDier, score: 0, totaleReactietijd: 0 })
          .then(() => {
            huidigeStatusSpeler = 'wachtkamer';
            kiezerTab = 'dieren';
            bouwKiezer();
            toonGekozenPoppetje({ dier: startDier });
            document.getElementById('speler-wachtkamer-naam').textContent = naam;
            document.getElementById('input-code').value = '';
            toonScherm('scherm-speler-wachtkamer');
            luisterNaarSessie(code);
          });
      });
    })
    .catch(err => {
      foutmelding.textContent = 'Er ging iets mis: ' + err.message;
    });
});

document.getElementById('btn-speler-verlaat-wachtkamer').addEventListener('click', () => {
  if (huidigeSessieCode && huidigeSpelerId) {
    db.ref('sessies/' + huidigeSessieCode + '/spelers/' + huidigeSpelerId).remove();
  }
  stopSessieListener();
  huidigeRol = null;
  toonScherm('scherm-algemeen');
});

document.getElementById('btn-speler-terug-naar-start').addEventListener('click', () => {
  stopSessieListener();
  huidigeRol = null;
  toonScherm('scherm-algemeen');
});

document.getElementById('btn-speler-verwijderd-terug').addEventListener('click', () => {
  toonScherm('scherm-algemeen');
});

document.getElementById('btn-speler-host-weg-terug').addEventListener('click', () => {
  toonScherm('scherm-algemeen');
});

function renderSessieVoorSpeler(sessie) {
  const spelers = sessie.spelers || {};
  huidigeStatusSpeler = sessie.status;

  if (huidigeSpelerId && !spelers[huidigeSpelerId]) {
    // De host heeft deze speler uit de sessie verwijderd.
    stopSessieListener();
    huidigeRol = null;
    toonScherm('scherm-speler-verwijderd');
    return;
  }

  if (sessie.status === 'wachtkamer') {
    toonGekozenPoppetje(spelers[huidigeSpelerId]);
    toonScherm('scherm-speler-wachtkamer');
  }

  if (sessie.status === 'vraag') {
    if (sessie.huidigeVraagIndex !== laatstGetoondeVraagIndexSpeler) {
      laatstGetoondeVraagIndexSpeler = sessie.huidigeVraagIndex;
      vraagGetoondOpSpeler = Date.now();
      spelerHeeftGeantwoord = false;
      spelerGeselecteerdeAntwoorden = [];
    }

    const vraag = huidigeQuizVragen[sessie.huidigeVraagIndex];
    const eigenAntwoorden = (sessie.antwoorden && sessie.antwoorden[sessie.huidigeVraagIndex]) || {};
    const eigenAntwoord = eigenAntwoorden[huidigeSpelerId];

    if (eigenAntwoord) {
      // Al geantwoord: alleen een groot laadteken. Of het goed was, ziet de
      // speler pas als de quizmaster doorklikt (status 'resultaat').
      toonScherm('scherm-speler-antwoord-verzonden');
    } else {
      document.getElementById('speler-voortgang-weergave').textContent =
        'Vraag ' + (sessie.huidigeVraagIndex + 1) + ' van ' + huidigeQuizVragen.length +
        ' · ' + vraag.punten + (vraag.punten === 1 ? ' punt' : ' punten');
      document.getElementById('speler-vraag-weergave').textContent = vraag.vraag;
      toonVraagFoto('speler-vraag-foto', vraag.afbeelding);

      // Bij precies 1 goed antwoord werkt het net als vroeger: 1 tik = meteen
      // versturen. Alleen als er meerdere antwoorden goed kunnen zijn, moet de
      // speler eerst aanvinken en daarna bewust op "Antwoord versturen" klikken
      // (anders is het niet uit te drukken welke combinatie bedoeld is).
      const meerdereGoedMogelijk = vraag.goedAntwoorden.length > 1;

      const verstuurKnop = document.getElementById('btn-speler-antwoord-versturen');
      const instructieEl = document.getElementById('speler-vraag-instructie');
      const antwoordenEl = document.getElementById('speler-antwoorden-weergave');
      antwoordenEl.innerHTML = '';

      const verstuurAntwoord = (indexen) => {
        if (spelerHeeftGeantwoord || huidigeStatusSpeler !== 'vraag') return;
        spelerHeeftGeantwoord = true;
        const reactietijdMs = Date.now() - vraagGetoondOpSpeler;
        db.ref('sessies/' + huidigeSessieCode + '/antwoorden/' + sessie.huidigeVraagIndex + '/' + huidigeSpelerId)
          .set({ antwoordIndexen: indexen, reactietijdMs: reactietijdMs });
      };

      if (meerdereGoedMogelijk) {
        instructieEl.textContent = 'Tik op alle antwoorden die je goed denkt dat zijn en klik daarna op "Antwoord versturen".';
        verstuurKnop.style.display = '';
        verstuurKnop.disabled = spelerGeselecteerdeAntwoorden.length === 0;

        vraag.antwoorden.forEach((tekst, index) => {
          const antwoordIndex = index + 1;
          const optie = document.createElement('div');
          optie.className = 'antwoord-optie' + (spelerGeselecteerdeAntwoorden.includes(antwoordIndex) ? ' geselecteerd' : '');
          optie.textContent = tekst;

          optie.addEventListener('click', () => {
            if (spelerHeeftGeantwoord) return;

            const positie = spelerGeselecteerdeAntwoorden.indexOf(antwoordIndex);
            if (positie === -1) {
              spelerGeselecteerdeAntwoorden.push(antwoordIndex);
            } else {
              spelerGeselecteerdeAntwoorden.splice(positie, 1);
            }
            optie.classList.toggle('geselecteerd');
            verstuurKnop.disabled = spelerGeselecteerdeAntwoorden.length === 0;
          });

          antwoordenEl.appendChild(optie);
        });

        verstuurKnop.onclick = () => {
          if (spelerGeselecteerdeAntwoorden.length === 0) return;
          verstuurAntwoord(spelerGeselecteerdeAntwoorden.slice());
        };
      } else {
        instructieEl.textContent = 'Tik op het antwoord dat je goed denkt dat is.';
        verstuurKnop.style.display = 'none';
        verstuurKnop.onclick = null;

        vraag.antwoorden.forEach((tekst, index) => {
          const antwoordIndex = index + 1;
          const optie = document.createElement('div');
          optie.className = 'antwoord-optie';
          optie.textContent = tekst;

          optie.addEventListener('click', () => {
            verstuurAntwoord([antwoordIndex]);
          });

          antwoordenEl.appendChild(optie);
        });
      }

      toonScherm('scherm-speler-vraag');
    }
  }

  if (sessie.status === 'resultaat') {
    const vraag = huidigeQuizVragen[sessie.huidigeVraagIndex];
    const antwoordenVraag = (sessie.antwoorden && sessie.antwoorden[sessie.huidigeVraagIndex]) || {};
    const eigenAntwoord = antwoordenVraag[huidigeSpelerId];
    const resultaatEl = document.getElementById('speler-resultaat-tekst');

    if (!eigenAntwoord) {
      resultaatEl.className = 'groot-resultaat fout';
      resultaatEl.textContent = 'Geen antwoord ✗';
    } else if (setsGelijk(eigenAntwoord.antwoordIndexen || [], vraag.goedAntwoorden)) {
      resultaatEl.className = 'groot-resultaat goed';
      resultaatEl.textContent = 'Goed! ✔';
    } else {
      resultaatEl.className = 'groot-resultaat fout';
      resultaatEl.textContent = 'Fout ✗';
    }

    renderGroteAntwoorden('speler', vraag);
    toonScherm('scherm-speler-resultaat');
  }

  if (sessie.status === 'scorebord' || sessie.status === 'afgelopen') {
    document.getElementById('speler-scorebord-titel').textContent =
      sessie.status === 'afgelopen' ? 'Eindstand 🏆' : 'Scorebord';

    let scorebordBericht = sessie.status === 'afgelopen' ? 'Bedankt voor het meespelen!' : '';

    // Won je deze live quiz? Dan krijg je eenmalig munten (voor de winkel).
    if (sessie.status === 'afgelopen' && muntenToegekendVoorSessie !== huidigeSessieCode) {
      muntenToegekendVoorSessie = huidigeSessieCode;
      const eindstand = Object.entries(spelers || {}).sort((a, b) => {
        const scoreA = a[1].score || 0, scoreB = b[1].score || 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (a[1].totaleReactietijd || 0) - (b[1].totaleReactietijd || 0);
      });
      const mijnPlek = eindstand.findIndex(regel => regel[0] === huidigeSpelerId);
      if (mijnPlek !== -1 && mijnPlek < MUNTEN_LIVE_PER_PLEK.length) {
        const verdiend = muntenVoor('plek' + (mijnPlek + 1), huidigeQuizVragen.length);
        const medaille = ['🥇', '🥈', '🥉'][mijnPlek];
        if (verdiend > 0) {
          geefMunten(verdiend);
          scorebordBericht = medaille + ' Je bent ' + (mijnPlek + 1) + 'e geworden: +' + verdiend + ' munten! Bekijk de winkel voor mysterieboxen.';
        } else {
          scorebordBericht = medaille + ' Je bent ' + (mijnPlek + 1) + 'e geworden!';
        }
      }
    }
    document.getElementById('speler-scorebord-bericht').textContent = scorebordBericht;

    renderScorebordLijst('speler-scorebord-lijst', spelers, huidigeSpelerId);

    const scorebordStatusEl = document.getElementById('speler-scorebord-status');
    if (sessie.status === 'afgelopen') {
      scorebordStatusEl.classList.remove('laad-rij');
      scorebordStatusEl.textContent = '';
    } else {
      scorebordStatusEl.classList.add('laad-rij');
      scorebordStatusEl.innerHTML = '<span class="laad-spinner"></span>Wacht tot de quizmaster verdergaat...';
    }

    document.getElementById('btn-speler-terug-naar-start').style.display =
      sessie.status === 'afgelopen' ? 'block' : 'none';

    toonScherm('scherm-speler-scorebord');
  }
}

// ================================================================
//  SPELEN: met mensen (live, met quizmaster) of zonder mensen (alleen)
// ================================================================

function isEigenQuizCode(code) {
  try {
    return JSON.parse(localStorage.getItem('eigenQuizzen') || '[]').some(q => q.code === code);
  } catch (e) {
    return false;
  }
}

const speelKeuzeOverlayEl = document.getElementById('speelkeuze-overlay');
const btnSpeelKeuzeAlleenEl = document.getElementById('btn-speelkeuze-alleen');
const speelKeuzeAlleenUitlegEl = document.getElementById('speelkeuze-alleen-uitleg');
const SPEELKEUZE_ALLEEN_STANDAARD_UITLEG = 'Speel de quiz zelf, zonder quizmaster.';

let speelKeuze = null; // { code, terugScherm }

function toonSpeelKeuze(code, titel, soloToegestaan, terugScherm) {
  speelKeuze = { code: code, terugScherm: terugScherm };
  document.getElementById('speelkeuze-quiztitel').textContent = titel || '';

  btnSpeelKeuzeAlleenEl.disabled = !soloToegestaan;
  speelKeuzeAlleenUitlegEl.textContent = soloToegestaan
    ? SPEELKEUZE_ALLEEN_STANDAARD_UITLEG
    : 'De maker heeft niet toegestaan dat je deze quiz alleen speelt.';

  speelKeuzeOverlayEl.classList.add('actief');
}

function sluitSpeelKeuze() {
  speelKeuzeOverlayEl.classList.remove('actief');
}

document.getElementById('btn-speelkeuze-mensen').addEventListener('click', () => {
  if (!speelKeuze) return;
  const code = speelKeuze.code;
  sluitSpeelKeuze();
  startHostenVanQuiz(code);
});

btnSpeelKeuzeAlleenEl.addEventListener('click', () => {
  if (!speelKeuze || btnSpeelKeuzeAlleenEl.disabled) return;
  const { code, terugScherm } = speelKeuze;
  sluitSpeelKeuze();
  startSoloVanQuiz(code, terugScherm);
});

document.getElementById('btn-speelkeuze-annuleren').addEventListener('click', sluitSpeelKeuze);

// Klik naast het venster (op de donkere achtergrond) sluit het ook.
speelKeuzeOverlayEl.addEventListener('click', (e) => {
  if (e.target === speelKeuzeOverlayEl) sluitSpeelKeuze();
});

// ---------- Alleen spelen (zonder quizmaster, niets hiervan gaat via Firebase-sessies) ----------

let soloCode = null;
let soloTitel = '';
let soloVragen = [];
let soloIndex = 0;
let soloAantalGoed = 0;
let soloTerugScherm = 'scherm-speelbare-quizzen';
let soloHeeftGeantwoord = false;
let soloGeselecteerdeAntwoorden = [];

function startSoloVanQuiz(code, terugScherm) {
  db.ref('quizzen/' + code).once('value').then(snapshot => {
    const quizData = snapshot.val();
    if (!quizData) {
      alert('Deze quiz kon niet gevonden worden (misschien is hij verwijderd).');
      return;
    }
    // Nog een keer controleren (de maker kan het net hebben uitgezet).
    if (quizData.soloToegestaan === false && !isEigenQuizCode(code)) {
      alert('De maker heeft niet toegestaan dat deze quiz alleen gespeeld wordt.');
      return;
    }

    const vragen = (quizData.vragen || []).map(normaliseerVraag);
    if (vragen.length === 0) {
      alert('Deze quiz heeft geen vragen.');
      return;
    }

    soloCode = code;
    soloTitel = quizData.titel || '';
    soloVragen = vragen;
    soloIndex = 0;
    soloAantalGoed = 0;
    soloTerugScherm = terugScherm || 'scherm-speelbare-quizzen';
    toonSoloVraag();
  }).catch(err => {
    alert('Quiz starten mislukt: ' + err.message);
  });
}

function toonSoloVraag() {
  const vraag = soloVragen[soloIndex];
  soloHeeftGeantwoord = false;
  soloGeselecteerdeAntwoorden = [];

  document.getElementById('solo-voortgang').textContent =
    'Vraag ' + (soloIndex + 1) + ' van ' + soloVragen.length;
  document.getElementById('solo-vraag-weergave').textContent = vraag.vraag;
  toonVraagFoto('solo-vraag-foto', vraag.afbeelding);

  const meerdereGoedMogelijk = vraag.goedAntwoorden.length > 1;
  const verstuurKnop = document.getElementById('btn-solo-antwoord-versturen');
  const instructieEl = document.getElementById('solo-vraag-instructie');
  const antwoordenEl = document.getElementById('solo-antwoorden-weergave');
  antwoordenEl.innerHTML = '';

  if (meerdereGoedMogelijk) {
    instructieEl.textContent = 'Tik op alle antwoorden die je goed denkt dat zijn en klik daarna op "Antwoord versturen".';
    verstuurKnop.style.display = '';
    verstuurKnop.disabled = true;

    vraag.antwoorden.forEach((tekst, index) => {
      const antwoordIndex = index + 1;
      const optie = document.createElement('div');
      optie.className = 'antwoord-optie';
      optie.textContent = tekst;
      optie.addEventListener('click', () => {
        if (soloHeeftGeantwoord) return;
        const positie = soloGeselecteerdeAntwoorden.indexOf(antwoordIndex);
        if (positie === -1) {
          soloGeselecteerdeAntwoorden.push(antwoordIndex);
        } else {
          soloGeselecteerdeAntwoorden.splice(positie, 1);
        }
        optie.classList.toggle('geselecteerd');
        verstuurKnop.disabled = soloGeselecteerdeAntwoorden.length === 0;
      });
      antwoordenEl.appendChild(optie);
    });

    verstuurKnop.onclick = () => {
      if (soloGeselecteerdeAntwoorden.length === 0) return;
      verstuurSoloAntwoord(soloGeselecteerdeAntwoorden.slice());
    };
  } else {
    instructieEl.textContent = 'Tik op het antwoord dat je goed denkt dat is.';
    verstuurKnop.style.display = 'none';
    verstuurKnop.onclick = null;

    vraag.antwoorden.forEach((tekst, index) => {
      const optie = document.createElement('div');
      optie.className = 'antwoord-optie';
      optie.textContent = tekst;
      optie.addEventListener('click', () => {
        verstuurSoloAntwoord([index + 1]);
      });
      antwoordenEl.appendChild(optie);
    });
  }

  toonScherm('scherm-solo-vraag');
}

function verstuurSoloAntwoord(indexen) {
  if (soloHeeftGeantwoord) return;
  soloHeeftGeantwoord = true;

  const vraag = soloVragen[soloIndex];
  const goed = setsGelijk(indexen, vraag.goedAntwoorden);
  if (goed) soloAantalGoed++;

  const resultaatEl = document.getElementById('solo-resultaat-tekst');
  resultaatEl.className = 'groot-resultaat ' + (goed ? 'goed' : 'fout');
  resultaatEl.textContent = goed ? 'Goed! ✔' : 'Fout ✗';
  renderGroteAntwoorden('solo', vraag);

  const isLaatsteVraag = soloIndex + 1 >= soloVragen.length;
  document.getElementById('btn-solo-volgende').textContent =
    isLaatsteVraag ? 'Bekijk resultaat' : 'Volgende vraag';

  toonScherm('scherm-solo-resultaat');
}

document.getElementById('btn-solo-volgende').addEventListener('click', () => {
  if (soloIndex + 1 < soloVragen.length) {
    soloIndex++;
    toonSoloVraag();
  } else {
    toonSoloEinde();
  }
});

function toonSoloEinde() {
  const totaal = soloVragen.length;
  const OMTREK = 377; // zelfde als stroke-dasharray in de CSS
  const fractie = totaal > 0 ? soloAantalGoed / totaal : 0;

  document.getElementById('solo-einde-titel').textContent = soloTitel;

  let kop;
  if (soloAantalGoed === totaal) {
    kop = '🏆 Perfect!';
  } else if (soloAantalGoed * 2 >= totaal) {
    kop = '👏 Goed gedaan!';
  } else {
    kop = '💪 Blijf oefenen!';
  }
  document.getElementById('solo-einde-kop').textContent = kop;

  const ringEl = document.getElementById('solo-einde-ring');
  ringEl.style.setProperty('--doel', String(Math.round(OMTREK * (1 - fractie))));
  ringEl.classList.toggle('leeg', soloAantalGoed === 0);

  document.getElementById('solo-einde-aantal').textContent = soloAantalGoed + '/' + totaal;
  let eindTekst = 'Je had ' + soloAantalGoed + ' van de ' + totaal + (totaal === 1 ? ' vraag' : ' vragen') + ' goed';
  if (totaal > 0 && soloAantalGoed === totaal) {
    const verdiendSolo = muntenVoor('solo', totaal);
    if (verdiendSolo > 0) {
      geefMunten(verdiendSolo);
      eindTekst += ' — 🎉 +' + verdiendSolo + ' munten!';
    }
  }
  document.getElementById('solo-einde-tekst').textContent = eindTekst;

  toonScherm('scherm-solo-einde');
}

function verlaatSoloQuiz() {
  soloVragen = [];
  toonScherm('scherm-algemeen');
}

document.getElementById('btn-solo-stoppen').addEventListener('click', verlaatSoloQuiz);
document.getElementById('btn-solo-terug').addEventListener('click', verlaatSoloQuiz);

document.getElementById('btn-solo-opnieuw').addEventListener('click', () => {
  soloIndex = 0;
  soloAantalGoed = 0;
  toonSoloVraag();
});


// ================================================================
// SITEBEHEER: al eerder gemaakte eigen poppetjes/accessoires laden
// ----------------------------------------------------------------
// Poppetjes maken uit een emoji kan niet meer (er zijn nu genoeg vaste dieren
// en accessoires). Wat eerder gemaakt is en in Firebase staat, blijft gewoon
// werken en wordt hier nog geladen.
// ================================================================

function laadAangepasteCatalogus() {
  return db.ref('aangepastePoppetjes').once('value').then(snapshot => {
    Object.keys(AANGEPASTE_POPPETJES).forEach(k => verwijderAangepastPoppetjeUitCatalogus(k));
    Object.keys(AANGEPASTE_ACCESSOIRES).forEach(k => verwijderAangepastAccessoireUitCatalogus(k));
    const data = snapshot.val() || {};
    Object.entries(data.dieren || {}).forEach(([id,item]) => registreerAangepastPoppetje(id,item));
    Object.entries(data.accessoires || {}).forEach(([id,item]) => registreerAangepastAccessoire(id,item));
  }).catch(() => {});
}

bouwKiezer();
laadAangepasteCatalogus().then(() => { bouwKiezer(); bouwVerzamelingKiezer(); werkMuntenWeergaveBij(); werkProfielBadgeBij(); });
werkMuntenWeergaveBij();

// ---------- Bij het openen van de site: naam bij eigen quizzen zetten ----------
koppelMakerNaamAanEigenQuizzen();

// ---------- Profiel: badge, slotjes op de vakken en het profiel-overlay ----------

// Zet een 🔒 op de vakken die pas werken met een profiel, zolang er nog
// geen profiel is aangemaakt.
function werkVakSlotjesBij() {
  const opSlot = !heeftProfiel();
  ['btn-naar-quizmaken', 'btn-naar-winkel', 'btn-naar-dierentuin', 'btn-naar-wiel'].forEach(id => {
    document.getElementById(id).classList.toggle('vak-op-slot', opSlot);
  });
  document.getElementById('profiel-vereist-hint').style.display = opSlot ? '' : 'none';
  werkAccountStatusBij();
}

// Duidelijke statuskaart op het startscherm: ben je ingelogd of niet, en waar zijn Uitloggen / Verwijderen.
function werkAccountStatusBij() {
  const uit = document.getElementById('account-status-uit');
  if (!uit) return;
  const ingelogd = heeftProfiel();
  uit.hidden = ingelogd;   // alleen zichtbaar als je NIET bent ingelogd
  const kaart = document.getElementById('account-status');
  if (kaart) kaart.hidden = ingelogd;
  if (!ingelogd) {
    const oud = huidigeMakerNaam();
    document.getElementById('account-status-oud').textContent = oud
      ? 'Je profiel \"' + oud + '\" is van vóór de accounts en heeft nog geen wachtwoord. Klik op Registreren en maak er een account van.'
      : '';
  }
}

const PROFIEL_ACCESSOIRES_SLEUTEL = 'profielAccessoires';

function huidigeProfielAccessoires() {
  try {
    return geldigeAccessoires(JSON.parse(localStorage.getItem(PROFIEL_ACCESSOIRES_SLEUTEL) || '{}'));
  } catch (e) {
    return {};
  }
}

function slaProfielAccessoiresOp(accessoires) {
  localStorage.setItem(PROFIEL_ACCESSOIRES_SLEUTEL, JSON.stringify(geldigeAccessoires(accessoires)));
}

function profielPoppetjeHtml() {
  const dier = geldigDier(huidigProfielDier());
  if (!dier) return '';
  return poppetjeSvg(dier, huidigeProfielAccessoires());
}

function werkProfielPoppetjeWeergaveBij() {
  const overlayPoppetjeEl = document.getElementById('profiel-overlay-poppetje');
  const badgePoppetjeEl = document.getElementById('profiel-badge-poppetje');

  const beheerLogo = sitebeheerActief && !bezoekUid();
  if (heeftProfiel() && (beheerLogo || geldigDier(huidigProfielDier()))) {
    const svg = beheerLogo ? BEHEER_LOGO_HTML : profielPoppetjeHtml();
    overlayPoppetjeEl.innerHTML = svg;
    badgePoppetjeEl.innerHTML = svg;
  } else {
    overlayPoppetjeEl.innerHTML = '';
    badgePoppetjeEl.innerHTML = '';
  }
}

// Werkt de badge rechtsboven bij.
// Met een bestaand profiel zie je hier alleen je poppetje/gezichtje.
function werkProfielBadgeBij() {
  const poppetjeEl = document.getElementById('profiel-badge-poppetje');
  const tekstEl = document.getElementById('profiel-badge-tekst');

  if (heeftProfiel()) {
    tekstEl.textContent = '';
    werkProfielPoppetjeWeergaveBij();
  } else {
    poppetjeEl.innerHTML = '';
    tekstEl.textContent = '👤';
  }
}

const profielOverlayEl = document.getElementById('profiel-overlay');
const PE_TAB_NAMEN = { boven: 'Hoeden', gezicht: 'Brillen', hoek: 'Extra' };
const PE_TAB_ICONEN = { dieren: '🐶', boven: '🎩', gezicht: '👓', hoek: '✨' };
let peTab = 'dieren';
let peLaatsteGetoondeTab = '';

function openPoppetjeEditor() {
  peTab = 'dieren';
  peLaatsteGetoondeTab = '';
  document.getElementById('poppetje-editor').classList.add('actief');
  document.body.classList.add('chat-open');
  bouwPoppetjeEditor();
}

function sluitPoppetjeEditor() {
  document.getElementById('poppetje-editor').classList.remove('actief');
  if (!document.getElementById('chat-overlay').classList.contains('actief')) document.body.classList.remove('chat-open');
  werkProfielPoppetjeWeergaveBij();
}

// Oude naam blijft bestaan, want andere plekken in de code sluiten hiermee de kiezer.
function sluitProfielPoppetjeKiezer() { sluitPoppetjeEditor(); }

function peKaart(svg, label, gekozen, onKlik) {
  const knop = document.createElement('button');
  knop.type = 'button';
  knop.className = 'pe-kaart' + (gekozen ? ' gekozen' : '');
  const plaat = document.createElement('div');
  plaat.className = 'pe-kaart-plaat';
  plaat.innerHTML = svg;
  knop.appendChild(plaat);
  if (label) {
    const l = document.createElement('div');
    l.className = 'pe-kaart-label';
    l.textContent = label;
    knop.appendChild(l);
  }
  if (gekozen) {
    const vink = document.createElement('span');
    vink.className = 'pe-vink';
    vink.textContent = '✓';
    knop.appendChild(vink);
  }
  knop.addEventListener('click', onKlik);
  return knop;
}

// Zet je gekozen poppetje + accessoires ook online, zodat je vrienden het zien
// (vriendenlijst, chat, zoekresultaten).
function syncProfielPoppetje() {
  const gebruiker = profielFirebaseGebruiker();
  if (!gebruiker || !heeftProfiel()) return Promise.resolve();
  return db.ref(SOCIAAL_PROFIEL_PAD + '/' + gebruiker.uid).update({
    dier: geldigDier(huidigProfielDier()) || '',
    accessoires: huidigeProfielAccessoires(),
    laatstOnline: firebase.database.ServerValue.TIMESTAMP
  }).catch(err => { console.error('Profielpoppetje opslaan online mislukt:', err); });
}

function peNaLetter() {
  werkProfielBadgeBij();
  werkProfielPoppetjeWeergaveBij();
  bouwPoppetjeEditor();
  syncProfielPoppetje();
}

function bouwPoppetjeEditor() {
  const bezitDieren = haalBezitDieren();
  const bezitAcc = haalBezitAccessoires();
  const dier = geldigDier(huidigProfielDier()) || bezitDieren[0] || DIEREN[0];
  const acc = huidigeProfielAccessoires();

  // Groot voorbeeld + chips met wat je nu aan hebt
  document.getElementById('pe-voorbeeld-poppetje').innerHTML = poppetjeSvg(dier, acc);
  const chips = document.getElementById('pe-chips');
  chips.innerHTML = '';
  let aantalChips = 0;
  ACCESSOIRE_GROEPEN.forEach(groep => {
    const emoji = acc[groep.plek];
    if (!emoji) return;
    aantalChips++;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pe-chip';
    chip.textContent = PE_TAB_ICONEN[groep.plek] + ' ' + ((ACCESSOIRES[emoji] && ACCESSOIRES[emoji].naam) || 'accessoire') + '  ✕';
    chip.title = 'Weghalen';
    chip.addEventListener('click', () => {
      const nieuw = Object.assign({}, huidigeProfielAccessoires());
      delete nieuw[groep.plek];
      slaProfielAccessoiresOp(nieuw);
      peNaLetter();
    });
    chips.appendChild(chip);
  });
  if (!aantalChips) {
    const leeg = document.createElement('span');
    leeg.className = 'pe-chips-leeg';
    leeg.textContent = 'Nog geen accessoires aan';
    chips.appendChild(leeg);
  }

  // Tabbladen
  const tabs = document.getElementById('pe-tabs');
  tabs.innerHTML = '';
  const tabLijst = [{ id: 'dieren', naam: 'Dieren' }].concat(ACCESSOIRE_GROEPEN.map(g => ({ id: g.plek, naam: PE_TAB_NAMEN[g.plek] || g.titel })));
  tabLijst.forEach(t => {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'pe-tab' + (t.id === peTab ? ' actief' : '');
    knop.innerHTML = '<span class="pe-tab-icoon">' + PE_TAB_ICONEN[t.id] + '</span><span>' + t.naam + '</span>';
    knop.addEventListener('click', () => { peTab = t.id; bouwPoppetjeEditor(); });
    tabs.appendChild(knop);
  });

  // Inhoud van het gekozen tabblad
  const inhoud = document.getElementById('pe-inhoud');
  const oudeScroll = (peLaatsteGetoondeTab === peTab) ? inhoud.scrollTop : 0;
  peLaatsteGetoondeTab = peTab;
  inhoud.innerHTML = '';
  const raster = document.createElement('div');
  raster.className = 'pe-raster';
  const hint = document.createElement('p');
  hint.className = 'pe-hint';

  if (peTab === 'dieren') {
    bezitDieren.forEach(d => {
      raster.appendChild(peKaart(poppetjeSvg(d, acc), '', d === dier, () => {
        localStorage.setItem(PROFIEL_DIER_SLEUTEL, d);
        peNaLetter();
      }));
    });
    hint.textContent = 'Je hebt ' + bezitDieren.length + ' van de ' + DIEREN.length + ' dieren. Meer dieren krijg je in de Winkel en bij het Geluksrad.';
  } else {
    const groep = ACCESSOIRE_GROEPEN.find(g => g.plek === peTab);
    if (groep) {
      const items = groep.items.filter(i => bezitAcc.indexOf(i) !== -1);
      const zonder = Object.assign({}, acc);
      delete zonder[groep.plek];
      raster.appendChild(peKaart(poppetjeSvg(dier, zonder), 'Geen', !acc[groep.plek], () => {
        const nieuw = Object.assign({}, huidigeProfielAccessoires());
        delete nieuw[groep.plek];
        slaProfielAccessoiresOp(nieuw);
        peNaLetter();
      }));
      items.forEach(emoji => {
        const proef = Object.assign({}, acc);
        proef[groep.plek] = emoji;
        raster.appendChild(peKaart(poppetjeSvg(dier, proef), (ACCESSOIRES[emoji] && ACCESSOIRES[emoji].naam) || '', acc[groep.plek] === emoji, () => {
          const nieuw = Object.assign({}, huidigeProfielAccessoires());
          if (nieuw[groep.plek] === emoji) delete nieuw[groep.plek]; else nieuw[groep.plek] = emoji;
          slaProfielAccessoiresOp(nieuw);
          peNaLetter();
        }));
      });
      hint.textContent = 'Je hebt ' + items.length + ' van de ' + groep.items.length + ' items in "' + groep.titel + '". Meer krijg je in de Winkel en bij het Geluksrad.';
    }
  }
  inhoud.appendChild(raster);
  inhoud.appendChild(hint);
  inhoud.scrollTop = oudeScroll;
}

document.getElementById('btn-profiel-poppetje-wijzigen').addEventListener('click', openPoppetjeEditor);
document.getElementById('btn-pe-terug').addEventListener('click', sluitPoppetjeEditor);
document.getElementById('btn-pe-klaar').addEventListener('click', sluitPoppetjeEditor);

document.getElementById('btn-profiel-badge').addEventListener('click', () => {
  if (heeftProfiel()) {
    werkProfielOverlayNaamBij();
    document.getElementById('btn-profiel-poppetje-wijzigen').hidden = !!(sitebeheerActief && !bezoekUid());
    werkProfielPoppetjeWeergaveBij();
    sluitProfielPoppetjeKiezer();
    profielOverlayEl.classList.add('actief');
  } else {
    naProfielActie = null;
    openProfielMakenScherm();
  }
});

document.getElementById('btn-profiel-overlay-sluiten').addEventListener('click', () => {
  profielOverlayEl.classList.remove('actief');
  sluitProfielPoppetjeKiezer();
});

werkProfielBadgeBij();
werkVakSlotjesBij();

document.getElementById('btn-status-inloggen').addEventListener('click', () => {
  naProfielActie = null; openProfielMakenScherm(); zetAccountTab('inloggen');
});
document.getElementById('btn-status-registreren').addEventListener('click', () => {
  naProfielActie = null; openProfielMakenScherm(); zetAccountTab('registreren');
});

// ================================================================
// VRIENDEN, CHAT EN DUBBELE VERZAMELING
// ================================================================

const BEZIT_AANTALLEN_SLEUTEL = 'quizAppBezitAantallen';
const SOCIAAL_PROFIEL_PAD = 'gebruikers';

// Firebase-sleutels mogen geen punt bevatten, dus die vervangen we ook.
function naamSleutel(zoeknaam) {
  return encodeURIComponent(zoeknaam).replace(/\./g, '%2E');
}

function normaliseerGebruikersnaam(naam) {
  return String(naam || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function profielFirebaseGebruiker() {
  const bz = bezoekInfo();
  if (bz && typeof auth !== 'undefined' && auth.currentUser) return { uid: bz.uid, isAnonymous: false, email: maakAccountEmail(bz.uid), bezoek: true };
  return typeof auth !== 'undefined' ? auth.currentUser : null;
}

function huidigeBezitAantallen() {
  let data = {};
  try { data = JSON.parse(localStorage.getItem(BEZIT_AANTALLEN_SLEUTEL) || '{}') || {}; } catch (e) {}
  const dieren = haalBezitDierenBasisVoorAantal();
  const accessoires = haalBezitAccessoiresBasisVoorAantal();
  dieren.forEach(item => { if (!Number.isInteger(data['dier:' + item]) || data['dier:' + item] < 1) data['dier:' + item] = 1; });
  accessoires.forEach(item => { if (!Number.isInteger(data['accessoire:' + item]) || data['accessoire:' + item] < 1) data['accessoire:' + item] = 1; });
  return data;
}

function haalBezitDierenBasisVoorAantal() {
  const opgeslagen = JSON.parse(localStorage.getItem(BEZIT_DIEREN_SLEUTEL) || 'null');
  return Array.isArray(opgeslagen) && opgeslagen.length ? opgeslagen : STANDAARD_DIEREN.slice();
}

function haalBezitAccessoiresBasisVoorAantal() {
  const opgeslagen = JSON.parse(localStorage.getItem(BEZIT_ACCESSOIRES_SLEUTEL) || 'null');
  return Array.isArray(opgeslagen) && opgeslagen.length ? opgeslagen : STANDAARD_ACCESSOIRES.slice();
}

function slaBezitAantallenOp(data) {
  localStorage.setItem(BEZIT_AANTALLEN_SLEUTEL, JSON.stringify(data || {}));
}

function aantalVan(type, item) {
  const data = huidigeBezitAantallen();
  return Math.max(0, Number(data[type + ':' + item] || 0));
}

function pasAantalAan(type, item, delta) {
  const data = huidigeBezitAantallen();
  const sleutel = type + ':' + item;
  const nieuw = Math.max(0, (Number(data[sleutel]) || 0) + delta);
  if (nieuw > 0) data[sleutel] = nieuw;
  else delete data[sleutel];
  slaBezitAantallenOp(data);
  return nieuw;
}

function onlineBezitObject() {
  const data = huidigeBezitAantallen();
  const dieren = {};
  const accessoires = {};
  Object.keys(data).forEach(k => {
    const [type, ...rest] = k.split(':');
    const item = rest.join(':');
    if (type === 'dier') dieren[item] = data[k];
    if (type === 'accessoire') accessoires[item] = data[k];
  });
  return { dieren, accessoires };
}

function syncSociaalBezit() {
  const gebruiker = profielFirebaseGebruiker();
  if (accountWordtVerwijderd || !gebruiker || !heeftProfiel()) return Promise.resolve();
  return db.ref(SOCIAAL_PROFIEL_PAD + '/' + gebruiker.uid + '/bezit').set(onlineBezitObject()).catch(() => {});
}

function registreerSociaalProfiel() {
  const gebruiker = profielFirebaseGebruiker();
  if (accountWordtVerwijderd || !gebruiker || gebruiker.bezoek || !heeftProfiel()) return Promise.resolve();
  // Heeft sitebeheer je naam of poppetje veranderd? Neem dat dan eerst over.
  return db.ref(SOCIAAL_PROFIEL_PAD + '/' + gebruiker.uid).once('value')
    .then(snap => { neemBeheerWijzigingOver(snap.val()); }, () => {})
    .then(() => registreerSociaalProfielNu());
}

function registreerSociaalProfielNu() {
  const gebruiker = profielFirebaseGebruiker();
  if (accountWordtVerwijderd || !gebruiker || gebruiker.bezoek || !heeftProfiel()) return Promise.resolve();
  const naam = huidigeMakerNaam();
  const zoeknaam = normaliseerGebruikersnaam(naam);
  const dier = geldigDier(huidigProfielDier()) || '';
  const accessoires = huidigeProfielAccessoires ? huidigeProfielAccessoires() : {};
  return naamRegistreer(gebruiker.uid, zoeknaam).then(() => {
    return db.ref(SOCIAAL_PROFIEL_PAD + '/' + gebruiker.uid).update({
      gebruikersnaam: naam,
      gebruikersnaamZoek: zoeknaam,
      dier: dier,
      accessoires: accessoires,
      laatstOnline: firebase.database.ServerValue.TIMESTAMP
    });
  }).then(() => syncSociaalBezit()).catch(err => {
    console.error('Profiel registreren mislukt:', err);
  });
}

function laadOnlineBezitVoorEigenProfiel() {
  const gebruiker = profielFirebaseGebruiker();
  if (!gebruiker || !heeftProfiel()) return;
  db.ref(SOCIAAL_PROFIEL_PAD + '/' + gebruiker.uid + '/bezit').on('value', snap => {
    const data = snap.val();
    if (!data) { syncSociaalBezit(); return; }
    const aantallen = {};
    const dieren = [];
    const accessoires = [];
    Object.entries(data.dieren || {}).forEach(([item, aantal]) => {
      if (geldigDier(item) && Number(aantal) > 0) { dieren.push(item); aantallen['dier:' + item] = Number(aantal); }
    });
    Object.entries(data.accessoires || {}).forEach(([item, aantal]) => {
      if (ACCESSOIRES[item] && Number(aantal) > 0) { accessoires.push(item); aantallen['accessoire:' + item] = Number(aantal); }
    });
    if (dieren.length) localStorage.setItem(BEZIT_DIEREN_SLEUTEL, JSON.stringify(dieren));
    if (accessoires.length) localStorage.setItem(BEZIT_ACCESSOIRES_SLEUTEL, JSON.stringify(accessoires));
    if (Object.keys(aantallen).length) slaBezitAantallenOp(aantallen);
    werkMuntenWeergaveBij();
    bouwVerzamelingKiezer();
  }, () => {});
}

// ---------- Bestaat het account nog in Firebase? ----------
// Is het account uit Firebase gehaald (Authentication of de database), dan moet het ook van de site
// verdwijnen: je wordt uitgelogd en er wordt niets meer teruggeschreven.
let accountWeg = false;
let accountGecontroleerdUid = null;
let accountControleBezig = false;

function accountIsVerdwenen() {   // geeft een belofte: true = het account bestaat niet meer
  const lokaal = accountUid();
  const u = auth.currentUser;
  const naam = huidigeMakerNaam();
  if (!lokaal || !naam || !u || u.uid !== lokaal || u.isAnonymous) return Promise.resolve(false);
  return u.reload().then(() => Promise.all([
    db.ref('gebruikers/' + lokaal + '/gebruikersnaam').once('value'),
    naamUids(normaliseerGebruikersnaam(naam))
  ])).then(res => !res[0].exists() && res[1].indexOf(lokaal) === -1).catch(err => {
    const c = err && err.code;
    return c === 'auth/user-not-found' || c === 'auth/user-token-expired' || c === 'auth/invalid-user-token' || c === 'auth/user-disabled';
  });
}

function ruimOverblijfselsOp(uid, naam) {
  if (!uid) return Promise.resolve();
  const sleutel = naam ? naamSleutel(normaliseerGebruikersnaam(naam)) : null;
  return Promise.all([
    db.ref('vrienden/' + uid).once('value').catch(() => null),
    sleutel ? db.ref('gebruikersnamen/' + sleutel).once('value').catch(() => null) : null
  ]).then(res => {
    const kern = {};
    kern['gebruikers/' + uid] = null; kern['accountData/' + uid] = null; kern['beheerders/' + uid] = null;
    if (res[1] && res[1].val() === uid) kern['gebruikersnamen/' + sleutel] = null;
    if (sleutel) kern['namen/' + sleutel + '/' + uid] = null;
    const vrienden = {};
    const lijst = res[0] && res[0].val() ? Object.keys(res[0].val()) : [];
    lijst.forEach(f => { vrienden['vrienden/' + f + '/' + uid] = null; vrienden['vrienden/' + uid + '/' + f] = null; vrienden['chats/' + chatIdVoor(uid, f)] = null; });
    return db.ref().update(kern).catch(() => {}).then(() => (lijst.length ? db.ref().update(vrienden).catch(() => {}) : null));
  }).catch(() => {});
}

function verwijderdAccountOpruimen() {
  if (accountWeg) return;
  accountWeg = true;
  accountWordtVerwijderd = true;   // vanaf nu schrijft de site niets meer terug
  clearTimeout(accountSyncTimer);
  const uid = accountUid();
  const naam = huidigeMakerNaam();
  verwijderApparaatAccount(uid);   // dit account telt niet meer mee: je mag weer een nieuw account maken
  // Wat er in de database nog van dit account over is, ruimen we op (maximaal 5 seconden proberen),
  // zodat je gebruikersnaam niet voor altijd bezet blijft.
  const opgeruimd = Promise.race([ruimOverblijfselsOp(uid, naam), new Promise(klaar => setTimeout(klaar, 5000))]);
  wisLokaalAccount();
  opgeruimd.then(() => {
    const u = auth.currentUser;
    // Haal ook de login zelf uit Firebase Authentication (lukt dit niet, dan blijft die onschuldig achter).
    return (u && !u.isAnonymous) ? u.delete().catch(() => {}) : null;
  }).then(() => auth.signOut()).catch(() => {}).then(() => {
    alert('Dit account bestaat niet meer (het is uit Firebase verwijderd). Je bent uitgelogd.');
    location.reload();
  });
}

function controleerAccountBestaat() {
  if (accountWeg || accountWordtVerwijderd || accountControleBezig || !accountUid()) return;
  const scherm = document.getElementById('scherm-naam-invullen');
  if (scherm && scherm.classList.contains('actief')) return;   // je bent net aan het inloggen of registreren
  accountControleBezig = true;
  accountIsVerdwenen().then(weg => { if (weg) verwijderdAccountOpruimen(); }).catch(() => {}).then(() => { accountControleBezig = false; });
}
setInterval(controleerAccountBestaat, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) controleerAccountBestaat(); });
window.addEventListener('focus', controleerAccountBestaat);

function laadSocialeGegevens() {
  if (!auth || !auth.currentUser) return;
  const lokaal = accountUid();
  if (lokaal && accountGecontroleerdUid !== lokaal && !accountWeg) {
    // Eerst kijken of het account nog bestaat; anders zou het hieronder weer worden teruggeschreven.
    if (accountControleBezig) return;
    accountControleBezig = true;
    accountIsVerdwenen().then(weg => {
      accountControleBezig = false;
      if (weg) { verwijderdAccountOpruimen(); return; }
      accountGecontroleerdUid = lokaal;
      laadSocialeGegevens();
    }).catch(() => { accountControleBezig = false; });
    return;
  }
  if (accountWeg) return;
  if (heeftProfiel()) {
    registreerSociaalProfiel();
    laadOnlineBezitVoorEigenProfiel();
    laadVriendenEnVerzoeken();
  }
}

// Overridden inventory getters: dezelfde API als de oude code, maar nu met
// unieke items in de lijst en aantallen apart opgeslagen.
function haalBezitDieren() { return haalBezitDierenBasisVoorAantal(); }
function haalBezitAccessoires() { return haalBezitAccessoiresBasisVoorAantal(); }

function voegBezitToe(dieren, accessoires) {
  const aantallen = huidigeBezitAantallen();
  const huidigeDieren = haalBezitDierenBasisVoorAantal();
  const huidigeAccessoires = haalBezitAccessoiresBasisVoorAantal();
  (dieren || []).forEach(d => {
    if (!geldigDier(d)) return;
    if (huidigeDieren.indexOf(d) === -1) huidigeDieren.push(d);
    const sleutel = 'dier:' + d;
    aantallen[sleutel] = (Number(aantallen[sleutel]) || 0) + 1;
  });
  (accessoires || []).forEach(a => {
    if (!ACCESSOIRES[a]) return;
    if (huidigeAccessoires.indexOf(a) === -1) huidigeAccessoires.push(a);
    const sleutel = 'accessoire:' + a;
    aantallen[sleutel] = (Number(aantallen[sleutel]) || 0) + 1;
  });
  localStorage.setItem(BEZIT_DIEREN_SLEUTEL, JSON.stringify(huidigeDieren));
  localStorage.setItem(BEZIT_ACCESSOIRES_SLEUTEL, JSON.stringify(huidigeAccessoires));
  slaBezitAantallenOp(aantallen);
  syncSociaalBezit();
  werkMuntenWeergaveBij();
  bouwVerzamelingKiezer();
}

function verwijderEenUitBezit(type, item) {
  const aantallen = huidigeBezitAantallen();
  const sleutel = type + ':' + item;
  const nieuw = Math.max(0, (Number(aantallen[sleutel]) || 0) - 1);
  if (nieuw > 0) aantallen[sleutel] = nieuw;
  else delete aantallen[sleutel];
  if (type === 'dier') {
    const lijst = haalBezitDierenBasisVoorAantal().filter(x => x !== item);
    if (nieuw > 0) lijst.push(item);
    localStorage.setItem(BEZIT_DIEREN_SLEUTEL, JSON.stringify([...new Set(lijst)]));
  } else {
    const lijst = haalBezitAccessoiresBasisVoorAantal().filter(x => x !== item);
    if (nieuw > 0) lijst.push(item);
    localStorage.setItem(BEZIT_ACCESSOIRES_SLEUTEL, JSON.stringify([...new Set(lijst)]));
  }
  slaBezitAantallenOp(aantallen);
  syncSociaalBezit();
}

function verkoopDier(dier) {
  const aantal = aantalVan('dier', dier);
  if (aantal <= 0) return;
  if (aantal === 1 && haalBezitDieren().length <= 1) { alert('Je kunt je laatste dier niet verkopen.'); return; }
  if (!confirm('Eén exemplaar van dit dier verkopen voor ' + VERKOOP_PRIJS + ' munten?')) return;
  verwijderEenUitBezit('dier', dier);
  geefMunten(VERKOOP_PRIJS);
  bouwVerzamelingKiezer();
}

function verkoopAccessoire(emoji) {
  const aantal = aantalVan('accessoire', emoji);
  if (aantal <= 0) return;
  if (aantal === 1 && haalBezitAccessoires().length <= 1) { alert('Je kunt je laatste accessoire niet verkopen.'); return; }
  const naam = ACCESSOIRES[emoji] ? ACCESSOIRES[emoji].naam : 'dit accessoire';
  if (!confirm('Eén exemplaar van "' + naam + '" verkopen voor ' + VERKOOP_PRIJS + ' munten?')) return;
  verwijderEenUitBezit('accessoire', emoji);
  geefMunten(VERKOOP_PRIJS);
  bouwVerzamelingKiezer();
}

function openVerzamelItemActies(type, item) {
  const aantal = aantalVan(type, item);
  if (!aantal) return;
  const titel = type === 'dier' ? item : ((ACCESSOIRES[item] && ACCESSOIRES[item].naam) || item);
  const naarVriend = prompt('Wat wil je doen met ' + titel + '?\nTyp VERKOOP om 1 exemplaar te verkopen, of typ STUUR om 1 exemplaar naar een vriend te sturen.');
  if (!naarVriend) return;
  if (naarVriend.trim().toLowerCase() === 'verkoop') {
    type === 'dier' ? verkoopDier(item) : verkoopAccessoire(item);
  } else if (naarVriend.trim().toLowerCase() === 'stuur') {
    openVriendStuurOverlay(type, item);
  }
}

// Vervangt de verzameling-renderer zodat dubbele exemplaren zichtbaar zijn als 2, 3, ...
// De accessoires staan verdeeld over de tabbladen Hoeden, Brillen en Extra, net als bij "Poppetje wijzigen".
const VERZ_TAB_NAMEN = { boven: 'Hoeden', gezicht: 'Brillen', hoek: 'Extra' };
const VERZ_TAB_ICONEN = { dieren: '🐶', boven: '🎩', gezicht: '👓', hoek: '✨' };

function bouwVerzamelingKiezer() {
  const kiezerEl = document.getElementById('verzameling-kiezer');
  if (!kiezerEl) return;
  kiezerEl.innerHTML = '';

  // Tabbladen
  const tabLijst = [{ id: 'dieren', naam: 'Dieren' }].concat(
    ACCESSOIRE_GROEPEN.map(g => ({ id: g.plek, naam: VERZ_TAB_NAMEN[g.plek] || g.titel }))
  );
  if (!tabLijst.some(t => t.id === kiezerTabVerzameling)) kiezerTabVerzameling = 'dieren';
  const tabsEl = document.getElementById('verzameling-tabs');
  if (tabsEl) {
    tabsEl.innerHTML = '';
    tabLijst.forEach(t => {
      const tabKnop = document.createElement('button');
      tabKnop.type = 'button';
      tabKnop.className = 'pe-tab' + (t.id === kiezerTabVerzameling ? ' actief' : '');
      tabKnop.setAttribute('role', 'tab');
      tabKnop.setAttribute('aria-selected', String(t.id === kiezerTabVerzameling));
      tabKnop.innerHTML = '<span class="pe-tab-icoon">' + (VERZ_TAB_ICONEN[t.id] || '✨') + '</span><span>' + t.naam + '</span>';
      tabKnop.addEventListener('click', () => { kiezerTabVerzameling = t.id; bouwVerzamelingKiezer(); });
      tabsEl.appendChild(tabKnop);
    });
  }

  const opDieren = kiezerTabVerzameling === 'dieren';
  const groep = opDieren ? null : ACCESSOIRE_GROEPEN.find(g => g.plek === kiezerTabVerzameling);
  kiezerEl.classList.toggle('accessoires', !opDieren);

  const bezit = opDieren ? haalBezitDieren() : haalBezitAccessoires();
  const catalogus = opDieren ? DIEREN.slice() : (groep ? groep.items.slice() : []);

  const telling = document.createElement('p');
  telling.className = 'verzameling-telling';
  const aantalInBezit = catalogus.filter(item => bezit.indexOf(item) !== -1).length;
  telling.textContent = aantalInBezit + ' van de ' + catalogus.length + (opDieren ? ' dieren' : ' items in "' + ((groep && (VERZ_TAB_NAMEN[groep.plek] || groep.titel)) || '') + '"') + ' in bezit';
  kiezerEl.appendChild(telling);

  catalogus.forEach(item => {
    const heeft = bezit.indexOf(item) !== -1;
    const aantal = aantalVan(opDieren ? 'dier' : 'accessoire', item);
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'dier-knop verzameling-item' + (heeft ? ' in-bezit' : ' niet-in-bezit');
    if (opDieren) {
      knop.innerHTML = heeft ? poppetjeSvg(item, {}) : '<span class="verzameling-slot">🔒</span>';
    } else {
      const voorbeeldDier = geldigDier(huidigProfielDier()) || bezit[0] || DIEREN[0];
      const acc = {};
      if (groep) acc[groep.plek] = item;
      knop.innerHTML = heeft ? poppetjeSvg(voorbeeldDier, acc) : '<span class="verzameling-slot">🔒</span>';
    }
    if (heeft) {
      const badge = document.createElement('span');
      badge.className = 'dier-knop-badge';
      badge.textContent = String(aantal);
      badge.title = aantal + ' exemplaar' + (aantal === 1 ? '' : 's');
      knop.appendChild(badge);
      knop.addEventListener('click', () => openVerzamelItemActies(opDieren ? 'dier' : 'accessoire', item));
      knop.title = aantal > 1 ? 'Klik: 1 verkopen of 1 naar een vriend sturen' : 'Klik: verkopen of naar een vriend sturen';
    }
    kiezerEl.appendChild(knop);
  });
}

// ---------------- Vrienden ----------------

let socialeVrienden = {};
let socialeVerzoeken = {};
let socialeZoekTimer = null;
let huidigChatUid = '';
let huidigGroepId = '';             // is dit gevuld, dan is de open chat een groepschat
let socialeGroepen = {};          // id -> { naam, maker, leden }
let groepOngelezen = {};          // id -> aantal ongelezen berichten
let groepIndexRef = null;
let groepRefs = {};               // id -> ref van de groep
let groepOngelezenQueries = {};   // id -> luisteraar voor nieuwe berichten
let groepLuisteraarUid = '';
let beheerdeGroepId = '';         // groep in het beheervenster
let huidigChatNaam = '';
let chatBerichtenQuery = null;      // de open chat (zodat we hem netjes kunnen stoppen)
let chatWaarschuwingQuery = null;   // waarschuwingen van sitebeheer in de open chat
let chatWaarschuwingen = [];        // [{ key, b }]
let chatLaatsteSnap = null;         // laatste berichten-momentopname (om opnieuw te tekenen)
let chatOngelezen = {};             // vriend-uid -> aantal ongelezen berichten
let chatOngelezenQueries = {};      // vriend-uid -> luisteraar voor ongelezen berichten
const CHAT_GELEZEN_SLEUTEL = 'quizAppChatGelezen';
let vriendenRef = null;
let verzoekenRef = null;
let vriendenLuisteraarUid = '';

function chatIdVoor(a, b) { return [a, b].sort().join('_'); }

function veiligeChatTekst(tekst) { return String(tekst || '').trim().slice(0, 500); }

function laadVriendenEnVerzoeken() {
  const gebruiker = profielFirebaseGebruiker();
  if (!gebruiker || !heeftProfiel()) return;   // ook in bezoekmodus: sitebeheer leest dan de vrienden van het bezochte account
  if (vriendenLuisteraarUid === gebruiker.uid) return; // luistert al (live)
  // Ander account (bijv. na inloggen als beheerder): oude luisteraars netjes stoppen.
  if (vriendenRef) vriendenRef.off();
  if (verzoekenRef) verzoekenRef.off();
  Object.keys(chatOngelezenQueries).forEach(fuid => { chatOngelezenQueries[fuid].off(); });
  chatOngelezenQueries = {}; chatOngelezen = {};
  vriendenLuisteraarUid = gebruiker.uid;
  laadGroepen(gebruiker.uid);

  vriendenRef = db.ref('vrienden/' + gebruiker.uid);
  vriendenRef.on('value', snap => {
    socialeVrienden = snap.val() || {};
    // Is de vriend met wie je net chat weggehaald (ook door de ander)? Dan sluit de chat.
    if (huidigChatUid && !socialeVrienden[huidigChatUid]) sluitChat();
    synchroniseerChatOngelezen();
    renderVrienden();
    zorgVoorBeheerVrienden();
  });
  verzoekenRef = db.ref('vriendschapsverzoeken/' + gebruiker.uid);
  verzoekenRef.on('value', snap => {
    socialeVerzoeken = snap.val() || {};
    renderVrienden();
  });
}

// ---------------- Ongelezen berichten (het cijfertje bij de chat) ----------------

function laadChatGelezen() {
  try { return JSON.parse(localStorage.getItem(CHAT_GELEZEN_SLEUTEL) || '{}') || {}; } catch (e) { return {}; }
}

function zetChatGelezen(chatId, tijd) {
  if (!tijd) return;
  const alle = laadChatGelezen();
  if ((Number(alle[chatId]) || 0) >= tijd) return;
  alle[chatId] = tijd;
  try { localStorage.setItem(CHAT_GELEZEN_SLEUTEL, JSON.stringify(alle)); } catch (e) {}
}

function totaalOngelezenChatBerichten() {
  const vrienden = Object.keys(chatOngelezen).reduce((som, uid) => som + (socialeVrienden[uid] ? (chatOngelezen[uid] || 0) : 0), 0);
  const groepen = Object.keys(groepOngelezen).reduce((som, id) => som + (socialeGroepen[id] ? (groepOngelezen[id] || 0) : 0), 0);
  return vrienden + groepen;
}

// Luistert bij elke vriend naar nieuwe berichten en telt wat je nog niet hebt gelezen.
function synchroniseerChatOngelezen() {
  const gebruiker = profielFirebaseGebruiker();
  if (!gebruiker) return;
  Object.keys(chatOngelezenQueries).forEach(fuid => {
    if (!socialeVrienden[fuid]) {
      chatOngelezenQueries[fuid].off();
      delete chatOngelezenQueries[fuid];
      delete chatOngelezen[fuid];
    }
  });
  Object.keys(socialeVrienden).forEach(fuid => {
    if (chatOngelezenQueries[fuid]) return;
    const chatId = chatIdVoor(gebruiker.uid, fuid);
    const query = db.ref('chats/' + chatId + '/berichten').limitToLast(50);
    chatOngelezenQueries[fuid] = query;
    query.on('value', snap => {
      let nieuwste = 0;
      let aantal = 0;
      const gelezenAlles = laadChatGelezen();
      let gelezen = Number(gelezenAlles[chatId]) || 0;
      const eersteKeer = gelezenAlles[chatId] === undefined;
      snap.forEach(c => {
        const b = c.val() || {};
        const t = Number(b.tijd) || 0;
        if (t > nieuwste) nieuwste = t;
        if (b.uid !== gebruiker.uid && t > gelezen && !(sitebeheerActief && geblokkeerdDoorMij[b.uid])) aantal++;
      });
      // Nog nooit naar deze chat gekeken op dit apparaat? Dan is alles wat er al staat niet nieuw.
      if (eersteKeer) { zetChatGelezen(chatId, nieuwste || 1); if (nieuwste) { aantal = 0; gelezen = nieuwste; } }
      const chatIsOpen = huidigChatUid === fuid && document.getElementById('chat-overlay').classList.contains('actief');
      if (chatIsOpen) { zetChatGelezen(chatId, nieuwste); aantal = 0; }
      chatOngelezen[fuid] = aantal;
      renderVrienden();
    }, err => { console.error('Ongelezen berichten tellen mislukt:', err); });
  });
}

// Wordt aangeroepen zodra de open chat berichten binnenkrijgt: alles is dan gelezen.
function markeerChatGelezen(snap) {
  const gebruiker = profielFirebaseGebruiker();
  if (!gebruiker || (!huidigChatUid && !huidigGroepId)) return;
  let nieuwste = 0;
  snap.forEach(c => { const t = Number((c.val() || {}).tijd) || 0; if (t > nieuwste) nieuwste = t; });
  if (huidigGroepId) {
    zetChatGelezen('groep_' + huidigGroepId, nieuwste);
    if (groepOngelezen[huidigGroepId]) { groepOngelezen[huidigGroepId] = 0; renderVrienden(); }
    return;
  }
  zetChatGelezen(chatIdVoor(gebruiker.uid, huidigChatUid), nieuwste);
  if (chatOngelezen[huidigChatUid]) {
    chatOngelezen[huidigChatUid] = 0;
    renderVrienden();
  }
}

// Zoeken werkt net als bij quizzen: live terwijl je typt, hoofdletterongevoelig
// en op elk deel van de naam. De lijst met namen wordt één keer opgehaald en
// daarna in de browser gefilterd.
let socialeNamenCache = null;
let socialeNamenTijd = 0;
let socialeNamenLaadt = null;
let socialeZoekToken = 0;

function laadSocialeNamen(forceer) {
  const vers = socialeNamenCache && (Date.now() - socialeNamenTijd < 60000);
  if (!forceer && vers) return Promise.resolve(socialeNamenCache);
  if (socialeNamenLaadt) return socialeNamenLaadt;
  socialeNamenLaadt = Promise.all([db.ref('gebruikersnamen').once('value'), db.ref('namen').once('value').catch(() => null)]).then(([oud, nieuw]) => {
    const lijst = [];
    const gezien = {};
    const voeg = (sleutel, uid) => {
      if (typeof uid !== 'string' || gezien[sleutel + '|' + uid]) return;
      gezien[sleutel + '|' + uid] = true;
      let zoek = sleutel;
      try { zoek = decodeURIComponent(sleutel); } catch (e) {}
      lijst.push({ zoek: zoek, uid: uid });
    };
    oud.forEach(c => { voeg(c.key, c.val()); });
    if (nieuw) nieuw.forEach(c => { Object.keys(c.val() || {}).forEach(u => voeg(c.key, u)); });
    socialeNamenCache = lijst;
    socialeNamenTijd = Date.now();
    socialeNamenLaadt = null;
    return lijst;
  }).catch(err => { socialeNamenLaadt = null; throw err; });
  return socialeNamenLaadt;
}

function zoekGebruikersOpNaam(zoekterm, forceer) {
  const q = normaliseerGebruikersnaam(zoekterm);
  const resultatenEl = document.getElementById('vrienden-zoekresultaten');
  if (!resultatenEl) return;
  const token = ++socialeZoekToken;
  if (!q) { resultatenEl.innerHTML = '<p class="subtitel">Typ een naam (of een stukje van een naam) om te zoeken.</p>'; return; }
  resultatenEl.innerHTML = '<p class="subtitel">Zoeken...</p>';
  const eigenUid = profielFirebaseGebruiker() && profielFirebaseGebruiker().uid;

  laadSocialeNamen(forceer).then(lijst => {
    if (token !== socialeZoekToken) return null;
    const treffers = lijst
      .filter(n => n.uid !== eigenUid && n.zoek.includes(q))
      .sort((x, y) => (x.zoek.startsWith(q) ? 0 : 1) - (y.zoek.startsWith(q) ? 0 : 1) || x.zoek.localeCompare(y.zoek))
      .slice(0, 20);
    if (!treffers.length) {
      resultatenEl.innerHTML = '<p class="subtitel">Geen gebruiker gevonden voor "' + escapeHtml(String(zoekterm).trim()) + '".</p>';
      return null;
    }
    return Promise.all(treffers.map(t => Promise.all([
      db.ref(SOCIAAL_PROFIEL_PAD + '/' + t.uid).once('value'),
      eigenUid ? db.ref('vriendschapsverzoeken/' + t.uid + '/' + eigenUid).once('value').catch(() => null) : Promise.resolve(null),
      laadBeheerStatus(t.uid)
    ]).then(([profielSnap, verzoekSnap]) => ({
      uid: t.uid, p: profielSnap.val(), verstuurd: !!(verzoekSnap && verzoekSnap.exists())
    })))).then(resultaten => {
      if (token !== socialeZoekToken) return;
      resultatenEl.innerHTML = '';
      let gevonden = 0;
      resultaten.forEach(r => {
        const p = r.p;
        if (!p || !p.gebruikersnaam) return;
        gevonden++;
        const rij = document.createElement('div');
        rij.className = 'vriend-zoekresultaat';
        const pop = document.createElement('div');
        pop.className = 'vriend-mini-poppetje';
        if (isBeheerUid(r.uid)) pop.innerHTML = BEHEER_LOGO_HTML;
        else if (geldigDier(p.dier)) pop.innerHTML = poppetjeSvg(p.dier, geldigeAccessoires(p.accessoires));
        const naam = document.createElement('strong');
        vulWeergaveNaam(naam, r.uid, p.gebruikersnaam);
        const knop = document.createElement('button');
        knop.className = 'btn btn-secondary';
        knop.type = 'button';
        if (socialeVrienden[r.uid] || isBeheerUid(r.uid)) {
          knop.textContent = '✓ Vriend';
          knop.disabled = true;
        } else if (socialeVerzoeken[r.uid]) {
          knop.className = 'btn btn-primary';
          knop.textContent = '✓ Accepteren';
          knop.addEventListener('click', () => { knop.disabled = true; accepteerVriendschapsverzoek(r.uid, socialeVerzoeken[r.uid]); });
        } else if (r.verstuurd) {
          knop.textContent = '✓ Verzoek gestuurd';
          knop.disabled = true;
        } else {
          knop.textContent = '➕ Vriendschapsverzoek';
          knop.addEventListener('click', () => stuurVriendschapsverzoek(r.uid, p.gebruikersnaam));
        }
        rij.append(pop, naam, knop);
        resultatenEl.appendChild(rij);
      });
      if (!gevonden) resultatenEl.innerHTML = '<p class="subtitel">Geen gebruiker gevonden voor "' + escapeHtml(String(zoekterm).trim()) + '".</p>';
    });
  }).catch(err => {
    console.error('Gebruikers zoeken mislukt:', err);
    if (token !== socialeZoekToken) return;
    resultatenEl.innerHTML = '<p class="foutmelding">Zoeken lukt nu niet. Controleer of de nieuwste Firebase-regels zijn gepubliceerd.</p>';
  });
}

function stuurVriendschapsverzoek(toUid, naam) {
  const gebruiker = profielFirebaseGebruiker();
  if (!gebruiker) { alert('Je profiel is nog niet verbonden.'); return; }
  // Jezelf toevoegen kan niet. (Een ander apparaat met een andere naam is een ander profiel: dat mag wel.)
  if (toUid === gebruiker.uid) { alert('Je kunt jezelf niet als vriend toevoegen.'); return; }
  db.ref('vriendschapsverzoeken/' + toUid + '/' + gebruiker.uid).set({
    uid: gebruiker.uid,
    gebruikersnaam: huidigeMakerNaam(),
    naamOntvanger: naam,
    tijd: firebase.database.ServerValue.TIMESTAMP
  }).then(() => {
    alert('Vriendschapsverzoek verstuurd naar ' + naam + '.');
    zoekGebruikersOpNaam(document.getElementById('input-zoek-vrienden').value);
  }).catch(err => {
    console.error('Vriendschapsverzoek versturen mislukt:', err);
    const code = err && err.code ? ' (' + err.code + ')' : '';
    alert('Het vriendschapsverzoek kon niet worden verstuurd' + code + '. Controleer of de nieuwste Firebase-regels zijn gepubliceerd en of Anonieme aanmelding aan staat.');
  });
}

function accepteerVriendschapsverzoek(fromUid, verzoek) {
  const gebruiker = profielFirebaseGebruiker();
  if (!gebruiker) return;
  if (fromUid === gebruiker.uid) return; // jezelf kun je niet accepteren
  const updates = {};
  updates['vrienden/' + gebruiker.uid + '/' + fromUid] = { gebruikersnaam: verzoek.gebruikersnaam || 'Vriend', sinds: firebase.database.ServerValue.TIMESTAMP };
  updates['vrienden/' + fromUid + '/' + gebruiker.uid] = { gebruikersnaam: huidigeMakerNaam(), sinds: firebase.database.ServerValue.TIMESTAMP };
  updates['vriendschapsverzoeken/' + gebruiker.uid + '/' + fromUid] = null;
  db.ref().update(updates).catch(err => {
    console.error('Vriendschapsverzoek accepteren mislukt:', err);
    const code = err && err.code ? ' (' + err.code + ')' : '';
    alert('Accepteren is mislukt' + code + '. Controleer of de nieuwste Firebase-regels zijn gepubliceerd.');
  });
}

// Haalt een vriend uit je lijst. Bij de ander verdwijn jij dan ook uit de lijst.
// (De regels staan dat toe: je mag jezelf uit de lijst van een vriend halen.)
function verwijderVriend(fuid, naam) {
  const gebruiker = profielFirebaseGebruiker();
  if (!gebruiker) { alert('Je profiel is nog niet verbonden. Probeer het zo nog eens.'); return; }
  if (!confirm(naam + ' uit je vrienden halen?\n\nJullie staan dan niet meer in elkaars lijst. Wil je later weer vrienden zijn, dan stuur je opnieuw een vriendschapsverzoek.')) return;
  const updates = {};
  updates['vrienden/' + gebruiker.uid + '/' + fuid] = null;
  updates['vrienden/' + fuid + '/' + gebruiker.uid] = null;
  db.ref().update(updates).then(() => {
    if (huidigChatUid === fuid) sluitChat();
  }).catch(err => {
    console.error('Vriend verwijderen mislukt:', err);
    const code = err && err.code ? ' (' + err.code + ')' : '';
    alert(naam + ' kon niet worden verwijderd' + code + '. Controleer je internet en of de nieuwste Firebase-regels zijn gepubliceerd.');
  });
}

function updateVriendenBadge() {
  const badge = document.getElementById('vrienden-badge-aantal');
  if (!badge) return;
  const berichten = totaalOngelezenChatBerichten();
  const totaal = berichten;   // alleen nieuwe berichten, geen vriendschapsverzoeken
  badge.textContent = totaal > 99 ? '99+' : String(totaal);
  badge.title = berichten + ' nieuw(e) bericht(en)';
  badge.hidden = totaal === 0;
}

function renderVrienden() {
  const lijst = document.getElementById('vrienden-lijst');
  const verzoeken = document.getElementById('vrienden-verzoeken');
  if (!lijst || !verzoeken) return;
  lijst.innerHTML = '';
  Object.entries(socialeVrienden)
    .sort((x, y) => (chatOngelezen[y[0]] || 0) - (chatOngelezen[x[0]] || 0))
    .forEach(([uid, info]) => {
      const rij = document.createElement('div');
      rij.className = 'vriend-rij';
      const naam = document.createElement('strong');
      maakWeergaveNaam(naam, uid, info.gebruikersnaam || 'Vriend');
      if (sitebeheerActief && geblokkeerdDoorMij[uid]) {
        const blok = document.createElement('small');
        blok.className = 'beheer-echte-naam';
        blok.textContent = '🚫 Geblokkeerd';
        naam.appendChild(blok);
      }
      const chat = document.createElement('button');
      chat.type = 'button'; chat.className = 'btn btn-secondary chat-knop'; chat.textContent = '💬 Chat';
      const ongelezen = chatOngelezen[uid] || 0;
      if (ongelezen > 0) {
        const badge = document.createElement('span');
        badge.className = 'chat-knop-badge';
        badge.textContent = ongelezen > 99 ? '99+' : String(ongelezen);
        badge.title = ongelezen + ' nieuw(e) bericht(en)';
        chat.appendChild(badge);
      }
      chat.addEventListener('click', () => openChat(uid, info.gebruikersnaam || 'Vriend'));
      const weg = document.createElement('button');
      weg.type = 'button'; weg.className = 'btn btn-secondary vriend-verwijder-knop';
      weg.textContent = '🗑'; weg.title = 'Uit mijn vrienden halen';
      weg.hidden = isBeheerUid(uid);
      weg.setAttribute('aria-label', (info.gebruikersnaam || 'Vriend') + ' uit mijn vrienden halen');
      weg.addEventListener('click', () => verwijderVriend(uid, info.gebruikersnaam || 'Vriend'));
      const knoppen = document.createElement('div');
      knoppen.className = 'vriend-knoppen';
      knoppen.append(chat, weg);
      rij.append(maakMiniPoppetje(uid, 'vriend-mini-poppetje'), naam, knoppen); lijst.appendChild(rij);
    });
  if (!Object.keys(socialeVrienden).length) lijst.innerHTML = '<p class="subtitel">Je hebt nog geen vrienden.</p>';

  verzoeken.innerHTML = '';
  Object.entries(socialeVerzoeken).forEach(([uid, verzoek]) => {
    const rij = document.createElement('div');
    rij.className = 'vriend-rij';
    const naam = document.createElement('strong');
    maakWeergaveNaam(naam, uid, verzoek.gebruikersnaam || 'Gebruiker');
    const knop = document.createElement('button');
    knop.type = 'button'; knop.className = 'btn btn-primary'; knop.textContent = '✓ Accepteren';
    knop.addEventListener('click', () => accepteerVriendschapsverzoek(uid, verzoek));
    rij.append(maakMiniPoppetje(uid, 'vriend-mini-poppetje'), naam, knop); verzoeken.appendChild(rij);
  });
  if (!Object.keys(socialeVerzoeken).length) verzoeken.innerHTML = '<p class="subtitel">Geen nieuwe verzoeken.</p>';
  if (bezoekUid()) {   // bezoekmodus: alles zien, niets veranderen
    document.querySelectorAll('#vrienden-lijst .vriend-verwijder-knop, #vrienden-verzoeken .btn').forEach(e => e.remove());
    const toev = document.getElementById('btn-vrienden-toevoegen'); if (toev) toev.hidden = true;
    const pan = document.getElementById('vrienden-toevoegen-paneel'); if (pan) pan.hidden = true;
  }
  renderGroepen();
  updateVriendenBadge();
}

// ---------------- Chat (beeldvullend, met stijl en poppetjes) ----------------

const CHAT_STIJL_SLEUTEL = 'quizAppChatStijl';

function chatEmojiPatroon(emoji, basis) {
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'>" +
    "<text x='8' y='40' font-size='30' opacity='.28'>" + emoji + "</text>" +
    "<text x='54' y='84' font-size='24' opacity='.22'>" + emoji + "</text></svg>";
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '"), ' + basis;
}

const CHAT_ACHTERGRONDEN = [
  { id: 'nacht',    naam: 'Nacht',       css: '#090d20' },
  { id: 'sterren',  naam: 'Sterren',     css: 'radial-gradient(#fff 1px, transparent 1.6px) 0 0 / 64px 64px, radial-gradient(#ffe9a8 1px, transparent 1.6px) 32px 32px / 64px 64px, linear-gradient(180deg, #0b1030, #2a1a5e)' },
  { id: 'zonsondergang', naam: 'Zonsondergang', css: 'linear-gradient(160deg, #ff9a76, #ff5f8f 50%, #6d4fc2)' },
  { id: 'oceaan',   naam: 'Oceaan',      css: 'linear-gradient(160deg, #00c6ff, #0072ff)' },
  { id: 'bos',      naam: 'Bos',         css: 'linear-gradient(160deg, #134e5e, #71b280)' },
  { id: 'snoep',    naam: 'Snoep',       css: 'linear-gradient(160deg, #ff9ccf, #c471f5)' },
  { id: 'zon',      naam: 'Zonnig',      css: 'linear-gradient(160deg, #f6d365, #fda085)' },
  { id: 'regenboog', naam: 'Regenboog',  css: 'linear-gradient(160deg, #ff6b6b, #feca57, #48dbfb, #a06bff)' },
  { id: 'stippen',  naam: 'Stippen',     css: 'radial-gradient(rgba(255,255,255,.28) 3px, transparent 3.5px) 0 0 / 28px 28px, linear-gradient(160deg, #ff6b6b, #feca57)' },
  { id: 'ruit',     naam: 'Ruiten',      css: 'repeating-linear-gradient(45deg, rgba(255,255,255,.09) 0 14px, transparent 14px 28px), linear-gradient(160deg, #1e3c72, #2a5298)' },
  { id: 'pootjes',  naam: 'Pootjes',     css: chatEmojiPatroon('🐾', 'linear-gradient(160deg, #3a2a6a, #6d4fc2)') },
  { id: 'hartjes',  naam: 'Hartjes',     css: chatEmojiPatroon('💖', 'linear-gradient(160deg, #ff7eb3, #ff758c)') },
  { id: 'vlinders', naam: 'Vlinders',    css: chatEmojiPatroon('🦋', 'linear-gradient(160deg, #56ccf2, #2f80ed)') }
];

const CHAT_VAK_KLEUREN = ['#6d4fc2', '#8e44ad', '#1f6feb', '#0aa5c0', '#0f9d58', '#f6c945', '#ff9800', '#e91e63', '#e53935', '#ffffff', '#2b2b45', '#111111'];
const CHAT_VAK_STANDAARD = { eigenVak: '#ffffff', vriendVak: '#111111' };   // jouw vakjes wit, die van de ander zwart

let chatStijlPaneelOpen = false;
let chatPoppetjeTab = 'dieren';
let chatGekozenPoppetje = null; // { soort, item }

function laadChatStijlen() {
  try { return JSON.parse(localStorage.getItem(CHAT_STIJL_SLEUTEL) || '{}') || {}; } catch (e) { return {}; }
}

function geldigeHex(hex) {
  return /^#[0-9a-f]{6}$/i.test(String(hex || '')) ? String(hex) : '';
}

function chatStijlId(gebruiker) {
  if (huidigGroepId) return 'groep_' + huidigGroepId;
  return (gebruiker && huidigChatUid) ? chatIdVoor(gebruiker.uid, huidigChatUid) : '';
}

function huidigeChatStijl() {
  const gebruiker = profielFirebaseGebruiker();
  const alle = laadChatStijlen();
  const stijl = (gebruiker && chatStijlId(gebruiker) && alle[chatStijlId(gebruiker)]) || {};
  return {
    achtergrond: stijl.achtergrond || 'nacht',
    eigenVak: geldigeHex(stijl.eigenVak) || CHAT_VAK_STANDAARD.eigenVak,
    vriendVak: geldigeHex(stijl.vriendVak) || CHAT_VAK_STANDAARD.vriendVak
  };
}

function slaChatStijlOp(deel) {
  const gebruiker = profielFirebaseGebruiker();
  if (!gebruiker || !chatStijlId(gebruiker)) return;
  const alle = laadChatStijlen();
  const id = chatStijlId(gebruiker);
  alle[id] = Object.assign({}, huidigeChatStijl(), deel);
  try { localStorage.setItem(CHAT_STIJL_SLEUTEL, JSON.stringify(alle)); } catch (e) {}
  pasChatStijlToe();
}

function hexIsDonker(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}

function hexNaarRgba(hex, alpha) {
  const n = parseInt(String(hex).slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}

function pasChatStijlToe() {
  const scherm = document.getElementById('chat-overlay');
  const stijl = huidigeChatStijl();
  const achtergrond = CHAT_ACHTERGRONDEN.find(x => x.id === stijl.achtergrond) || CHAT_ACHTERGRONDEN[0];
  scherm.style.setProperty('--chat-achtergrond', achtergrond.css);
  // De tekst in een vakje wordt vanzelf licht of donker, zodat je hem altijd kunt lezen.
  scherm.style.setProperty('--chat-eigen-vak', hexNaarRgba(stijl.eigenVak, 0.94));
  scherm.style.setProperty('--chat-eigen-tekst', hexIsDonker(stijl.eigenVak) ? '#ffffff' : '#1a1a2e');
  scherm.style.setProperty('--chat-ander-vak', hexNaarRgba(stijl.vriendVak, 0.94));
  scherm.style.setProperty('--chat-ander-tekst', hexIsDonker(stijl.vriendVak) ? '#ffffff' : '#1a1a2e');
  bouwChatStijlKiezers();
}

function bouwChatVakRij(container, sleutel, huidig) {
  if (!container) return;
  container.innerHTML = '';
  CHAT_VAK_KLEUREN.forEach(kleur => {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'chat-kleur-keuze' + (kleur.toLowerCase() === String(huidig).toLowerCase() ? ' actief' : '');
    knop.style.background = kleur;
    knop.title = kleur;
    knop.addEventListener('click', () => slaChatStijlOp({ [sleutel]: kleur }));
    container.appendChild(knop);
  });
  const eigen = document.createElement('input');
  eigen.type = 'color';
  eigen.className = 'chat-kleur-eigen';
  eigen.title = 'Eigen kleur';
  eigen.value = geldigeHex(huidig) || '#6d4fc2';
  eigen.addEventListener('change', () => slaChatStijlOp({ [sleutel]: eigen.value }));
  container.appendChild(eigen);
}

function bouwChatStijlKiezers() {
  const stijl = huidigeChatStijl();
  const bg = document.getElementById('chat-achtergronden');
  if (!bg) return;
  bg.innerHTML = '';
  CHAT_ACHTERGRONDEN.forEach(x => {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'chat-achtergrond-keuze' + (x.id === stijl.achtergrond ? ' actief' : '');
    knop.style.background = x.css;
    knop.title = x.naam;
    knop.addEventListener('click', () => slaChatStijlOp({ achtergrond: x.id }));
    bg.appendChild(knop);
  });
  bouwChatVakRij(document.getElementById('chat-vak-eigen'), 'eigenVak', stijl.eigenVak);
  bouwChatVakRij(document.getElementById('chat-vak-vriend'), 'vriendVak', stijl.vriendVak);
}

function chatDierVoorAccessoire() {
  return geldigDier(huidigProfielDier()) ? huidigProfielDier() : (haalBezitDieren()[0] || DIEREN[0]);
}

function chatPoppetjeSvgVoor(soort, item) {
  if (soort === 'dier') return poppetjeSvg(item, {});
  const acc = {};
  const groep = ACCESSOIRE_GROEPEN.find(g => g.items.indexOf(item) !== -1);
  if (groep) acc[groep.plek] = item;
  else if (ACCESSOIRES[item] && ACCESSOIRES[item].plek) acc[ACCESSOIRES[item].plek] = item;
  return poppetjeSvg(chatDierVoorAccessoire(), acc);
}

function chatPoppetjeNaam(soort, item) {
  if (soort === 'dier') return item;
  return (ACCESSOIRES[item] && ACCESSOIRES[item].naam) || item;
}

function chatPoppetjeGeldig(soort, item) {
  return soort === 'dier' ? !!geldigDier(item) : (soort === 'accessoire' && !!ACCESSOIRES[item]);
}

// ---------------- Een bericht beantwoorden (zoals in WhatsApp) ----------------
let chatAntwoord = null;   // { key, uid, naam, tekst } van het bericht waarop je antwoordt

function berichtSamenvatting(b) {
  let t = String(b.tekst || '').trim();
  if (!t && b.type === 'quiz') t = '📝 ' + (b.titel || 'Quiz');
  if (!t && b.type === 'munten') t = '🪙 ' + (b.bedrag || 0) + ' munten';
  if (!t) t = 'Bericht';
  return t.length > 100 ? t.slice(0, 100) + '…' : t;
}

function bouwAntwoordBalk() {
  if (document.getElementById('chat-antwoord-balk')) return;
  const invoer = document.querySelector('#chat-overlay .chat-invoer');
  if (!invoer) return;
  const balk = document.createElement('div');
  balk.id = 'chat-antwoord-balk';
  balk.className = 'chat-antwoord-balk';
  balk.hidden = true;
  const inhoud = document.createElement('div');
  inhoud.className = 'chat-antwoord-inhoud';
  const naam = document.createElement('strong');
  naam.id = 'chat-antwoord-naam';
  const tekst = document.createElement('span');
  tekst.id = 'chat-antwoord-tekst';
  inhoud.append(naam, tekst);
  const sluit = document.createElement('button');
  sluit.type = 'button'; sluit.className = 'chat-antwoord-sluit'; sluit.textContent = '✕';
  sluit.title = 'Antwoord annuleren'; sluit.setAttribute('aria-label', 'Antwoord annuleren');
  sluit.addEventListener('click', stopAntwoord);
  balk.append(inhoud, sluit);
  invoer.before(balk);
}

function zetAntwoord(key, b) {
  if (chatGeblokkeerd()) return;
  const g = profielFirebaseGebruiker();
  const eigen = g && b.uid === g.uid;
  chatAntwoord = { key: key, uid: b.uid || '', naam: eigen ? 'Jij' : (b.gebruikersnaam || huidigChatNaam || 'Gebruiker'), tekst: berichtSamenvatting(b) };
  bouwAntwoordBalk();
  const naamEl = document.getElementById('chat-antwoord-naam');
  if (eigen) naamEl.textContent = 'Jij'; else maakWeergaveNaam(naamEl, b.uid, chatAntwoord.naam);
  document.getElementById('chat-antwoord-tekst').textContent = chatAntwoord.tekst;
  document.getElementById('chat-antwoord-balk').hidden = false;
  const input = document.getElementById('chat-input');
  if (input) input.focus();
}

function stopAntwoord() {
  chatAntwoord = null;
  const balk = document.getElementById('chat-antwoord-balk');
  if (balk) balk.hidden = true;
}

// Het geciteerde bericht bovenaan een antwoord. Klik erop om naar het origineel te springen.
function maakAntwoordCitaat(a) {
  const g = profielFirebaseGebruiker();
  const eigen = g && a.uid === g.uid;
  const c = document.createElement('div');
  c.className = 'chat-citaat';
  const naam = document.createElement('strong');
  if (eigen) naam.textContent = bezoekUid() ? (huidigeMakerNaam() || 'Gebruiker') : 'Jij'; else maakWeergaveNaam(naam, a.uid, a.naam || 'Gebruiker');
  const tekst = document.createElement('span');
  tekst.textContent = String(a.tekst || '');
  c.append(naam, tekst);
  c.addEventListener('click', () => {
    const lijst = document.getElementById('chat-berichten');
    const doel = Array.prototype.find.call(lijst.children, el => el.dataset.key === a.key);
    if (!doel) return;
    doel.scrollIntoView({ block: 'center', behavior: 'smooth' });
    doel.classList.add('chat-bericht-licht');
    setTimeout(() => doel.classList.remove('chat-bericht-licht'), 1400);
  });
  return c;
}

// ---------------- Emoties sturen in de chat ----------------
const CHAT_EMOTIES = ['😀','😃','😄','😁','😆','😅','😂','🤣','🙂','😉','😊','😇','🥰','😍','🤩','😘','😋','😜','🤪','😎',
  '🤗','🤔','🤭','😐','😴','🥱','😮','😲','😳','🥺','😢','😭','😤','😠','😡','🤯','🥳','😱','🤒','🤕',
  '❤️','🧡','💛','💚','💙','💜','🖤','💔','💖','💯','👍','👎','👏','🙌','🙏','💪','👋','🤝','✌️','🤞',
  '🔥','⭐','🎉','🎁','🏆','✅','❌','❗','❓','💤','🎂','🌈'];

function bouwChatEmojiPaneel() {
  if (document.getElementById('chat-emoji-paneel')) return;
  const invoer = document.querySelector('#chat-overlay .chat-invoer');
  if (!invoer) return;
  const paneel = document.createElement('div');
  paneel.id = 'chat-emoji-paneel';
  paneel.className = 'chat-paneel chat-emoji-paneel';
  paneel.hidden = true;
  const titel = document.createElement('p');
  titel.className = 'chat-paneel-titel';
  titel.textContent = 'Kies een emotie';
  const raster = document.createElement('div');
  raster.className = 'chat-emoji-raster';
  CHAT_EMOTIES.forEach(e => {
    const k = document.createElement('button');
    k.type = 'button'; k.className = 'chat-emoji-keuze'; k.textContent = e;
    k.setAttribute('aria-label', e);
    k.addEventListener('click', () => voegEmojiToe(e));
    raster.appendChild(k);
  });
  paneel.append(titel, raster);
  invoer.before(paneel);

  const knop = document.createElement('button');
  knop.id = 'btn-chat-emoji'; knop.type = 'button'; knop.className = 'chat-poppetje-knop';
  knop.title = 'Emotie sturen';
  const plaatje = document.createElement('span');
  plaatje.className = 'chat-poppetje-knop-plaatje'; plaatje.textContent = '😊';
  knop.appendChild(plaatje);
  document.getElementById('chat-input').before(knop);
  knop.addEventListener('click', () => {
    const open = paneel.hidden;
    ['chat-stijl-paneel', 'chat-poppetjes-paneel', 'chat-quiz-paneel', 'chat-munten-paneel'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });
    paneel.hidden = !open;
  });
  // Opent een ander paneel? Dan gaat dit dicht.
  ['btn-chat-stijl', 'btn-chat-poppetje', 'btn-chat-quiz', 'btn-chat-munten'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => { paneel.hidden = true; });
  });
}

function voegEmojiToe(e) {
  const input = document.getElementById('chat-input');
  if (!input || input.disabled) return;
  const van = input.selectionStart != null ? input.selectionStart : input.value.length;
  const tot = input.selectionEnd != null ? input.selectionEnd : van;
  const nieuw = input.value.slice(0, van) + e + input.value.slice(tot);
  if (nieuw.length > 500) return;
  input.value = nieuw;
  const pos = van + e.length;
  try { input.setSelectionRange(pos, pos); } catch (x) {}
}

// Een bericht met alleen emoji's laten we groot zien.
function isAlleenEmoji(tekst) {
  const t = String(tekst || '').trim();
  return !!t && t.length <= 24 && /^(?:\p{Extended_Pictographic}|\u200d|\ufe0f|\s)+$/u.test(t);
}

// ---------------- Beheerder-weergave ----------------
// Is iemand sitebeheer? Dan is het profielplaatje een instellingen-logo, heet hij "Beheerder"
// en staat zijn eigen naam er in het klein onder. Gewone mensen kunnen gewoon met hem chatten,
// maar hij kan hen ook blokkeren.
const BEHEER_LOGO_HTML = '<svg class="beheer-logo-svg" viewBox="0 0 100 100" aria-hidden="true">' +
  '<circle cx="50" cy="50" r="46" fill="#16204a" stroke="#f0c04d" stroke-width="5"/>' +
  '<text x="50" y="50" dy=".35em" text-anchor="middle" font-size="54">⚙️</text></svg>';
let beheerCache = {};          // uid -> { waarde: true/false, tijd }
let beheerLaden = {};
let geblokkeerdDoorMij = {};   // (alleen sitebeheer) uid -> true
let ikBenGeblokkeerd = {};     // beheerder-uid -> true/false (voor de chat die nu open is)
let blokkadeRef = null, blokkadeUid = '';
let chatBlokRef = null;

// Mensen hoeven geen verzoek te sturen aan sitebeheer: iedereen is automatisch vrienden met
// elke beheerder (aan beide kanten), zodat je meteen kunt chatten.
let beheerVriendenBezig = false;
let beheerVriendenGeprobeerd = {};
function zorgVoorBeheerVrienden() {
  const g = profielFirebaseGebruiker();
  if (!g || sitebeheerActief || !heeftProfiel() || beheerVriendenBezig) return;
  beheerVriendenBezig = true;
  db.ref('beheerders').once('value').then(snap => {
    const uids = [];
    snap.forEach(c => { if (c.val() === true && c.key !== g.uid) uids.push(c.key); });
    uids.forEach(u => { beheerCache[u] = { waarde: true, tijd: Date.now() }; });
    const nieuw = uids.filter(u => !socialeVrienden[u] && !beheerVriendenGeprobeerd[g.uid + u]);
    return Promise.all(nieuw.map(u => {
      beheerVriendenGeprobeerd[g.uid + u] = true;
      return db.ref(SOCIAAL_PROFIEL_PAD + '/' + u + '/gebruikersnaam').once('value').then(ns => {
        const up = {};
        up['vrienden/' + g.uid + '/' + u] = { gebruikersnaam: ns.val() || 'Beheerder', sinds: firebase.database.ServerValue.TIMESTAMP };
        up['vrienden/' + u + '/' + g.uid] = { gebruikersnaam: huidigeMakerNaam(), sinds: firebase.database.ServerValue.TIMESTAMP };
        return db.ref().update(up);
      });
    }));
  }).catch(err => { console.error('Vrienden met sitebeheer maken mislukt:', err); })
    .then(() => { beheerVriendenBezig = false; renderVrienden(); });
}

function isBeheerUid(uid) {
  const g = profielFirebaseGebruiker();
  if (g && uid === g.uid) return !!sitebeheerActief && !g.bezoek;
  const c = beheerCache[uid];
  return !!(c && c.waarde);
}

function laadBeheerStatus(uid) {
  if (!uid) return Promise.resolve(false);
  const g = profielFirebaseGebruiker();
  if (g && uid === g.uid) return Promise.resolve(!!sitebeheerActief && !g.bezoek);
  const c = beheerCache[uid];
  if (c && Date.now() - c.tijd < 60000) return Promise.resolve(c.waarde);
  if (beheerLaden[uid]) return beheerLaden[uid];
  beheerLaden[uid] = db.ref('beheerders/' + uid).once('value')
    .then(snap => snap.val() === true)
    .catch(() => false)
    .then(waarde => { beheerCache[uid] = { waarde: waarde, tijd: Date.now() }; delete beheerLaden[uid]; return waarde; });
  return beheerLaden[uid];
}

// Zet de naam in een element: gewoon de naam, of "Beheerder" met de echte naam klein eronder.
function vulWeergaveNaam(el, uid, naam) {
  el.textContent = '';
  if (isBeheerUid(uid)) {
    el.appendChild(document.createTextNode('Beheerder'));
    if (naam) {
      const klein = document.createElement('small');
      klein.className = 'beheer-echte-naam';
      klein.textContent = naam;
      el.appendChild(klein);
    }
  } else {
    el.textContent = naam;
  }
}

function maakWeergaveNaam(el, uid, naam) {
  vulWeergaveNaam(el, uid, naam);
  laadBeheerStatus(uid).then(() => { if (el.isConnected !== false) vulWeergaveNaam(el, uid, naam); });
  return el;
}

function werkProfielOverlayNaamBij() {
  const el = document.getElementById('profiel-overlay-naam');
  if (!el) return;
  const naam = huidigeMakerNaam();
  if (sitebeheerActief && !bezoekUid()) vulWeergaveNaam(el, (profielFirebaseGebruiker() || {}).uid, naam);
  else el.textContent = 'Ingelogd als ' + naam;
}

// Is er in de open chat een beheerder (jij of de ander)? Dan staat er bovenin een waarschuwing.
function chatMetBeheerder() {
  return !!huidigChatUid && (!!sitebeheerActief || isBeheerUid(huidigChatUid));
}

function chatGeblokkeerd() {
  return !!huidigChatUid && !!ikBenGeblokkeerd[huidigChatUid];
}

function werkChatBeheerBij() {
  const overlay = document.getElementById('chat-overlay');
  if (!overlay) return;
  bouwChatEmojiPaneel();
  bouwAntwoordBalk();
  let melding = document.getElementById('chat-beheer-melding');
  if (!melding) {
    melding = document.createElement('div');
    melding.id = 'chat-beheer-melding';
    melding.className = 'chat-beheer-melding';
    document.getElementById('chat-berichten').before(melding);
  }
  const geblokkeerd = chatGeblokkeerd();
  const bezoek = !!bezoekUid();   // sitebeheer leest mee: alleen kijken
  melding.textContent = bezoek ? '👁 Je leest mee in het account van ' + (huidigeMakerNaam() || '') + '. Je kunt hier niets versturen.'
    : (geblokkeerd ? '🚫 Je bent geblokkeerd. Je kunt geen berichten meer sturen.' : '⚠️Dit is alleen voor belangrijke dingen⚠️');
  melding.classList.toggle('geblokkeerd', geblokkeerd || bezoek);
  melding.hidden = !(bezoek || geblokkeerd || chatMetBeheerder());

  // Blokkeerknop: alleen voor sitebeheer, en alleen bij gewone gebruikers
  let knop = document.getElementById('btn-chat-blokkeer');
  if (!knop) {
    knop = document.createElement('button');
    knop.id = 'btn-chat-blokkeer';
    knop.type = 'button';
    knop.className = 'chat-kop-knop';
    knop.addEventListener('click', wisselBlokkade);
    document.getElementById('btn-chat-stijl').before(knop);
  }
  const kanBlokkeren = !!sitebeheerActief && !bezoek && !!huidigChatUid && !isBeheerUid(huidigChatUid);
  knop.hidden = !kanBlokkeren;
  const isGeblokkeerd = !!geblokkeerdDoorMij[huidigChatUid];
  knop.textContent = isGeblokkeerd ? '✅' : '🚫';
  knop.title = isGeblokkeerd ? 'Deblokkeren' : 'Blokkeren';

  // Waarschuwingsknop: alleen voor sitebeheer (ook tijdens meelezen)
  let wknop = document.getElementById('btn-chat-waarschuwing');
  if (!wknop) {
    wknop = document.createElement('button');
    wknop.id = 'btn-chat-waarschuwing';
    wknop.type = 'button';
    wknop.className = 'chat-kop-knop';
    wknop.textContent = '⚠️';
    wknop.title = 'Waarschuwing geven';
    wknop.addEventListener('click', stuurChatWaarschuwing);
    document.getElementById('btn-chat-stijl').before(wknop);
  }
  wknop.hidden = !sitebeheerActief || !huidigChatUid;

  // Geblokkeerd: het schrijfvak staat uit
  const input = document.getElementById('chat-input');
  ['chat-input', 'btn-chat-sturen', 'btn-chat-poppetje', 'btn-chat-quiz', 'btn-chat-munten', 'btn-chat-emoji'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = geblokkeerd || bezoek;
  });
  if (input) input.placeholder = bezoek ? 'Alleen meelezen' : (geblokkeerd ? 'Je bent geblokkeerd' : 'Typ een bericht...');
}

// ---------------- Waarschuwing van sitebeheer in de chat ----------------
// Sitebeheer kan in elke chat (ook als hij meeleest bij een bezocht profiel) een waarschuwing
// plaatsen. Die staat als opvallend rood kaartje in de chat en is voor beide kanten zichtbaar.
// Ze staan apart van de gewone berichten (chats/<id>/waarschuwingen), zodat de bestaande
// chatregels precies hetzelfde blijven. Alleen sitebeheer mag hier schrijven.
function maakChatWaarschuwing(key, b) {
  const kaart = document.createElement('div');
  kaart.className = 'chat-waarschuwing';
  kaart.dataset.key = key;
  const titel = document.createElement('div');
  titel.className = 'chat-waarschuwing-titel';
  titel.textContent = '⚠️ Waarschuwing van sitebeheer';
  const tekst = document.createElement('div');
  tekst.className = 'chat-waarschuwing-tekst';
  tekst.textContent = b.tekst || '';
  kaart.append(titel, tekst);
  if (sitebeheerActief) {
    const weg = document.createElement('button');
    weg.type = 'button';
    weg.className = 'chat-bericht-verwijder chat-waarschuwing-weg';
    weg.title = 'Waarschuwing verwijderen';
    weg.setAttribute('aria-label', 'Waarschuwing verwijderen');
    weg.textContent = '🗑';
    weg.addEventListener('click', () => {
      const ref = chatWaarschuwingenRef();
      if (!ref || !confirm('Deze waarschuwing verwijderen?')) return;
      ref.child(key).remove().catch(err => {
        alert('Verwijderen is mislukt' + (err && err.code ? ' (' + err.code + ')' : '') + '. Controleer of de nieuwste Firebase-regels zijn gepubliceerd.');
      });
    });
    kaart.appendChild(weg);
  }
  return kaart;
}

function stuurChatWaarschuwing() {
  const echt = auth.currentUser;   // altijd het echte sitebeheer-account, ook in bezoekmodus
  const ref = chatWaarschuwingenRef();
  if (!echt || !ref || !sitebeheerActief) return;
  const tekst = veiligeChatTekst(prompt('Waarschuwing voor beide kanten van deze chat.\n\nWat wil je zeggen? (max. 500 tekens)', ''));
  if (!tekst) return;
  ref.push().set({ uid: echt.uid, tekst: tekst, tijd: firebase.database.ServerValue.TIMESTAMP }).catch(err => {
    alert('De waarschuwing kon niet worden geplaatst' + (err && err.code ? ' (' + err.code + ')' : '') + '. Controleer of de nieuwste Firebase-regels zijn gepubliceerd.');
  });
}

function wisselBlokkade() {
  const g = profielFirebaseGebruiker();
  const uid = huidigChatUid;
  if (!g || !uid || !sitebeheerActief || isBeheerUid(uid)) return;
  const blokkeer = !geblokkeerdDoorMij[uid];
  if (blokkeer && !confirm(huidigChatNaam + ' blokkeren?\n\nJe ziet geen berichten meer van deze persoon en hij/zij kan jou niets meer sturen. Je kunt dit altijd weer ongedaan maken.')) return;
  const ref = db.ref('geblokkeerd/' + g.uid + '/' + uid);
  (blokkeer ? ref.set(true) : ref.remove()).catch(err => {
    const code = err && err.code ? ' (' + err.code + ')' : '';
    alert('Blokkeren is niet gelukt' + code + '. Controleer of de nieuwste Firebase-regels zijn gepubliceerd.');
  });
}

// Sitebeheer luistert live naar de eigen blokkadelijst.
function werkBlokkadeLuisteraarBij() {
  const g = profielFirebaseGebruiker();
  const uid = (g && sitebeheerActief && !g.bezoek) ? g.uid : '';
  if (uid === blokkadeUid) return;
  if (blokkadeRef) { blokkadeRef.off(); blokkadeRef = null; }
  blokkadeUid = uid;
  geblokkeerdDoorMij = {};
  if (!uid) return;
  blokkadeRef = db.ref('geblokkeerd/' + uid);
  blokkadeRef.on('value', snap => {
    geblokkeerdDoorMij = snap.val() || {};
    werkChatBeheerBij();
    renderVrienden();
    if ((huidigChatUid || huidigGroepId) && document.getElementById('chat-overlay').classList.contains('actief')) laadChatBerichten();
    updateVriendenBadge();
  }, () => {});
}

// In de chat met een beheerder: kijk live of die jou heeft geblokkeerd.
function volgBlokkadeInChat(uid) {
  if (chatBlokRef) { chatBlokRef.off(); chatBlokRef = null; }
  const g = profielFirebaseGebruiker();
  if (!g || !uid) return;
  laadBeheerStatus(uid).then(isBeheer => {
    if (huidigChatUid !== uid) return;
    werkChatBeheerBij();
    if (!isBeheer) return;
    chatBlokRef = db.ref('geblokkeerd/' + uid + '/' + g.uid);
    chatBlokRef.on('value', snap => {
      ikBenGeblokkeerd[uid] = snap.val() === true;
      werkChatBeheerBij();
    }, () => {});
  });
}

// ---------------- Profielpoppetjes (bij de naam in chat en vriendenlijst) ----------------

let chatProfielCache = {};      // uid -> { dier, accessoires } (van een ander)
let chatProfielLaden = {};

function poppetjeHtmlVoorUid(uid) {
  if (isBeheerUid(uid)) return BEHEER_LOGO_HTML;
  const gebruiker = profielFirebaseGebruiker();
  if (gebruiker && uid === gebruiker.uid) return profielPoppetjeHtml();
  const p = chatProfielCache[uid];
  if (p && geldigDier(p.dier)) return poppetjeSvg(p.dier, geldigeAccessoires(p.accessoires));
  return '';
}

function maakMiniPoppetje(uid, klasse) {
  const el = document.createElement('div');
  el.className = klasse;
  el.dataset.uid = uid;
  el.innerHTML = poppetjeHtmlVoorUid(uid) || '<span class="mini-poppetje-leeg">👤</span>';
  Promise.all([laadChatProfiel(uid), laadBeheerStatus(uid)]).then(() => {
    const html = poppetjeHtmlVoorUid(uid);
    if (html && el.isConnected !== false) el.innerHTML = html;
  });
  return el;
}

function laadChatProfiel(uid) {
  if (!uid) return Promise.resolve(null);
  const oud = chatProfielCache[uid];
  if (oud && oud.dier && Date.now() - (oud.tijd || 0) < 30000) return Promise.resolve(oud);
  if (chatProfielLaden[uid]) return chatProfielLaden[uid];
  chatProfielLaden[uid] = db.ref(SOCIAAL_PROFIEL_PAD + '/' + uid).once('value').then(snap => {
    const p = snap.val() || {};
    delete chatProfielLaden[uid];
    if (geldigDier(p.dier)) chatProfielCache[uid] = { dier: p.dier, accessoires: p.accessoires || {}, tijd: Date.now() };
    return chatProfielCache[uid] || null;
  }).catch(() => { delete chatProfielLaden[uid]; return null; });
  return chatProfielLaden[uid];
}

// De naam boven een bericht, met het profielpoppetje ervoor.
function maakChatWie(eigen, b) {
  const gebruiker = profielFirebaseGebruiker();
  const uid = eigen ? (gebruiker && gebruiker.uid) : (b.uid || huidigChatUid);
  const wie = document.createElement('span');
  wie.className = 'chat-bericht-naam';
  wie.appendChild(maakMiniPoppetje(uid, 'chat-bericht-poppetje'));
  const t = document.createElement('span');
  if (eigen) t.textContent = bezoekUid() ? (huidigeMakerNaam() || 'Gebruiker') : 'Jij';
  else maakWeergaveNaam(t, uid, b.gebruikersnaam || huidigChatNaam || 'Gebruiker');
  wie.appendChild(t);
  return wie;
}

function openChat(uid, naam) {
  huidigChatUid = uid; huidigChatNaam = naam; huidigGroepId = '';
  document.body.classList.remove('groep-chat');
  document.getElementById('btn-chat-groep').hidden = true;
  const overlay = document.getElementById('chat-overlay');
  maakWeergaveNaam(document.getElementById('chat-titel'), uid, naam);
  const kopPop = document.getElementById('chat-kop-poppetje');
  kopPop.innerHTML = poppetjeHtmlVoorUid(uid) || '<span class="mini-poppetje-leeg">👤</span>';
  Promise.all([laadChatProfiel(uid), laadBeheerStatus(uid)]).then(() => { if (huidigChatUid === uid) kopPop.innerHTML = poppetjeHtmlVoorUid(uid) || kopPop.innerHTML; });
  chatStijlPaneelOpen = false;
  document.getElementById('chat-stijl-paneel').hidden = true;
  document.getElementById('chat-poppetjes-paneel').hidden = true;
  document.getElementById('chat-munten-paneel').hidden = true;
  document.getElementById('chat-quiz-paneel').hidden = true;
  document.getElementById('chat-munten-paneel').hidden = true;
  bouwChatEmojiPaneel();
  document.getElementById('chat-emoji-paneel').hidden = true;
  stopAntwoord();
  chatGekozenPoppetje = null;
  document.getElementById('chat-poppetje-knop-plaatje').innerHTML =
    geldigDier(huidigProfielDier()) ? poppetjeSvg(huidigProfielDier(), {}) : '👤';
  overlay.classList.add('actief');
  document.body.classList.add('chat-open');
  pasChatStijlToe();
  werkChatBeheerBij();
  volgBlokkadeInChat(uid);
  laadChatBerichten();
}

function sluitChat() {
  if (chatBerichtenQuery) { chatBerichtenQuery.off(); chatBerichtenQuery = null; }
  if (chatWaarschuwingQuery) { chatWaarschuwingQuery.off(); chatWaarschuwingQuery = null; }
  chatLaatsteSnap = null; chatWaarschuwingen = [];
  if (chatBlokRef) { chatBlokRef.off(); chatBlokRef = null; }
  stopAntwoord();
  document.getElementById('chat-overlay').classList.remove('actief');
  document.body.classList.remove('chat-open');
  document.body.classList.remove('groep-chat');
  document.getElementById('btn-chat-groep').hidden = true;
  huidigChatUid = '';
  huidigGroepId = '';
}

function chatBerichtenRef() {
  const gebruiker = profielFirebaseGebruiker();
  if (gebruiker && huidigGroepId) return db.ref('groepsberichten/' + huidigGroepId);
  if (!gebruiker || !huidigChatUid) return null;
  return db.ref('chats/' + chatIdVoor(gebruiker.uid, huidigChatUid) + '/berichten');
}

function chatWaarschuwingenRef() {
  const gebruiker = profielFirebaseGebruiker();
  if (huidigGroepId) return null;
  if (!gebruiker || !huidigChatUid) return null;
  return db.ref('chats/' + chatIdVoor(gebruiker.uid, huidigChatUid) + '/waarschuwingen');
}

function laadChatBerichten() {
  const gebruiker = profielFirebaseGebruiker();
  const ref = chatBerichtenRef();
  if (!gebruiker || !ref) return;
  if (chatBerichtenQuery) chatBerichtenQuery.off();
  if (chatWaarschuwingQuery) { chatWaarschuwingQuery.off(); chatWaarschuwingQuery = null; }
  chatLaatsteSnap = null; chatWaarschuwingen = [];
  chatBerichtenQuery = ref.limitToLast(100);
  chatBerichtenQuery.on('value', snap => {
    markeerChatGelezen(snap);
    chatLaatsteSnap = snap;
    tekenChatBerichten();
  });
  const wRef = chatWaarschuwingenRef();
  if (wRef) {
    chatWaarschuwingQuery = wRef.limitToLast(20);
    chatWaarschuwingQuery.on('value', snap => {
      chatWaarschuwingen = [];
      snap.forEach(c => { chatWaarschuwingen.push({ key: c.key, b: c.val() || {} }); });
      tekenChatBerichten();
    }, () => {});
  }
}

function tekenChatBerichten() {
  const gebruiker = profielFirebaseGebruiker();
  const snap = chatLaatsteSnap;
  const lijst = document.getElementById('chat-berichten');
  if (!gebruiker || !snap || !lijst) return;
  const onderaan = lijst.scrollHeight - lijst.scrollTop - lijst.clientHeight < 80 || !lijst.childElementCount;
  lijst.innerHTML = '';
  const items = [];
  snap.forEach(child => { items.push({ soort: 'bericht', key: child.key, b: child.val() || {} }); });
  chatWaarschuwingen.forEach(w => { items.push({ soort: 'waarschuwing', key: w.key, b: w.b }); });
  const tijdVan = it => (typeof it.b.tijd === 'number' ? it.b.tijd : Number.MAX_SAFE_INTEGER);
  items.sort((x, y) => tijdVan(x) - tijdVan(y));
  items.forEach(it => {
    const b = it.b, key = it.key;
    if (it.soort === 'waarschuwing') { lijst.appendChild(maakChatWaarschuwing(key, b)); return; }
    const eigen = b.uid === gebruiker.uid;
    if (!eigen && sitebeheerActief && geblokkeerdDoorMij[b.uid]) return;
    if (b.type === 'poppetje' || b.type === 'quiz' || b.type === 'munten') {
      const el = b.type === 'poppetje' ? maakChatPoppetjeBericht(key, b, eigen, gebruiker)
        : (b.type === 'quiz' ? maakChatQuizBericht(key, b, eigen, gebruiker) : maakChatMuntenBericht(key, b, eigen, gebruiker));
      el.dataset.key = key;
      if (huidigGroepId) {
        const voor = document.createElement('div');
        voor.className = 'chat-quiz-sub';
        voor.textContent = b.aan ? ('🎯 Voor ' + (b.aan === gebruiker.uid ? 'jou' : groepLidNaam(b.aan))) : '🎁 Voor iedereen';
        el.insertBefore(voor, el.children[1] || null);
      }
      lijst.appendChild(el);
      if (b.type === 'munten' && eigen) betaalMuntenTerugAlsNodig(key, b);
      return;
    }
    const p = document.createElement('div');
    p.className = 'chat-bericht' + (eigen ? ' eigen' : '') + (isAlleenEmoji(b.tekst) ? ' alleen-emoji' : '');
    const wie = maakChatWie(eigen, b);
    const tekst = document.createElement('span');
    tekst.className = 'chat-bericht-tekst';
    tekst.textContent = b.tekst || '';
    p.dataset.key = key;
    p.append(maakChatBerichtKop(wie, key, b, eigen));
    if (b.antwoordOp && typeof b.antwoordOp === 'object') p.appendChild(maakAntwoordCitaat(b.antwoordOp));
    p.appendChild(tekst);
    lijst.appendChild(p);
  });
  if (bezoekUid()) lijst.querySelectorAll('button:not(.chat-waarschuwing-weg)').forEach(k => k.remove());   // alleen kijken
  if (onderaan) lijst.scrollTop = lijst.scrollHeight;
}

// Kopregel van een bericht: naam, en bij je eigen berichten een 🗑-knop om het te verwijderen.
function maakChatBerichtKop(wie, key, b, eigen) {
  const kop = document.createElement('div');
  kop.className = 'chat-bericht-kop';
  kop.appendChild(wie);
  const acties = document.createElement('span');
  acties.className = 'chat-bericht-acties';
  kop.appendChild(acties);
  const antwoordKnop = document.createElement('button');
  antwoordKnop.type = 'button';
  antwoordKnop.className = 'chat-bericht-verwijder chat-bericht-antwoord';
  antwoordKnop.title = 'Beantwoorden';
  antwoordKnop.setAttribute('aria-label', 'Beantwoorden');
  antwoordKnop.textContent = '↩';
  antwoordKnop.addEventListener('click', () => zetAntwoord(key, b));
  acties.appendChild(antwoordKnop);
  if (eigen && b.status !== 'bezig') {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'chat-bericht-verwijder';
    knop.title = 'Bericht verwijderen';
    knop.setAttribute('aria-label', 'Bericht verwijderen');
    knop.textContent = '🗑';
    knop.addEventListener('click', () => verwijderChatBericht(key, b));
    acties.appendChild(knop);
  }
  return kop;
}

function verwijderChatBericht(key, b) {
  const ref = chatBerichtenRef();
  if (!ref) return;
  const vraag = ((b.type === 'poppetje' || b.type === 'munten') && b.status === 'open')
    ? 'Dit cadeau intrekken en het bericht verwijderen?'
    : 'Dit bericht verwijderen?';
  if (!confirm(vraag)) return;
  const klaarVoor = (b.type === 'munten' && (b.status === 'open' || b.status === 'geweigerd'))
    ? wijzigChatPoppetjeStatus(key, 'geweigerd').then(() => betaalMuntenTerugAlsNodig(key, b, true))
    : Promise.resolve();
  klaarVoor.then(() => ref.child(key).remove()).catch(err => {
    const code = err && err.code ? ' (' + err.code + ')' : '';
    alert('Verwijderen is mislukt' + code + '. Controleer of de nieuwste Firebase-regels zijn gepubliceerd.');
  });
}

function maakChatPoppetjeBericht(key, b, eigen, gebruiker) {
  const kaart = document.createElement('div');
  kaart.className = 'chat-bericht chat-poppetje-bericht' + (eigen ? ' eigen' : '');
  const geldig = chatPoppetjeGeldig(b.soort, b.item);
  const wie = maakChatWie(eigen, b);
  const plaatje = document.createElement('div');
  plaatje.className = 'chat-poppetje-plaatje';
  if (geldig) plaatje.innerHTML = chatPoppetjeSvgVoor(b.soort, b.item);
  const label = document.createElement('div');
  label.className = 'chat-poppetje-label';
  const naam = geldig ? chatPoppetjeNaam(b.soort, b.item) : 'onbekend poppetje';
  label.textContent = '🎁 ' + (eigen ? 'Je stuurt ' : 'Cadeau: ') + naam;
  kaart.append(maakChatBerichtKop(wie, key, b, eigen), plaatje, label);

  const status = document.createElement('div');
  status.className = 'chat-poppetje-status';
  if (b.status === 'geaccepteerd') {
    status.textContent = '✓ Geaccepteerd';
  } else if (b.status === 'geweigerd') {
    status.textContent = '✕ Geweigerd';
  } else if (b.status === 'mislukt') {
    status.textContent = 'Niet gelukt: dit poppetje is er niet meer';
  } else if (b.status === 'bezig') {
    status.textContent = 'Bezig...';
  } else if (magCadeauAccepteren(b, gebruiker) && geldig) {
    const ja = document.createElement('button');
    ja.type = 'button'; ja.className = 'btn btn-primary'; ja.textContent = '✓ Accepteren';
    ja.addEventListener('click', () => { ja.disabled = true; accepteerChatPoppetje(key, b); });
    const nee = document.createElement('button');
    nee.type = 'button'; nee.className = 'btn btn-secondary'; nee.textContent = '✕ Weigeren';
    nee.addEventListener('click', () => { nee.disabled = true; wijzigChatPoppetjeStatus(key, 'geweigerd'); });
    if (b.aan) status.append(ja, nee); else status.append(ja);   // een cadeau "voor iedereen" kun je niet voor de rest weigeren
  } else if (eigen) {
    const wacht = document.createElement('span');
    wacht.textContent = '⏳ Wacht op acceptatie';
    const annuleer = document.createElement('button');
    annuleer.type = 'button'; annuleer.className = 'btn btn-secondary'; annuleer.textContent = 'Terugtrekken';
    annuleer.addEventListener('click', () => { annuleer.disabled = true; wijzigChatPoppetjeStatus(key, 'geweigerd'); });
    status.append(wacht, annuleer);
  }
  kaart.appendChild(status);
  return kaart;
}

function wijzigChatPoppetjeStatus(key, status) {
  const ref = chatBerichtenRef();
  if (!ref) return Promise.resolve();
  return ref.child(key).child('status').transaction(v => (v === 'open' ? status : v)).catch(() => {});
}

// Ontvanger accepteert: de verzender heeft er dan één minder, de ontvanger één erbij.
function accepteerChatPoppetje(key, b) {
  const gebruiker = profielFirebaseGebruiker();
  const ref = chatBerichtenRef();
  if (!gebruiker || !ref) return;
  if (!magCadeauAccepteren(b, gebruiker) || (!huidigGroepId && b.uid !== huidigChatUid) || !chatPoppetjeGeldig(b.soort, b.item)) return;
  const pad = b.soort === 'dier' ? 'dieren/' : 'accessoires/';
  const vanRef = db.ref(SOCIAAL_PROFIEL_PAD + '/' + b.uid + '/bezit/' + pad + b.item);
  const naarRef = db.ref(SOCIAAL_PROFIEL_PAD + '/' + gebruiker.uid + '/bezit/' + pad + b.item);
  const statusRef = ref.child(key).child('status');
  let geclaimd = false;
  statusRef.transaction(v => {
    if (v === 'open') { geclaimd = true; return 'bezig'; }
    geclaimd = false;
    return v;
  }).then(res => {
    if (!res.committed || !geclaimd) throw new Error('al-afgehandeld');
    let genoeg = false;
    return vanRef.transaction(v => {
      const n = Number(v) || 0;
      if (n > 0) { genoeg = true; return n - 1; }
      genoeg = false;
      return v;
    }).then(r => {
      if (!r.committed || !genoeg) return statusRef.set('mislukt');
      return naarRef.transaction(v => (Number(v) || 0) + 1).then(() => statusRef.set('geaccepteerd'));
    });
  }).catch(err => {
    if (err && err.message === 'al-afgehandeld') return;
    console.error('Poppetje accepteren mislukt:', err);
    statusRef.transaction(v => (v === 'bezig' ? 'open' : v)).catch(() => {});
    const code = err && err.code ? ' (' + err.code + ')' : '';
    alert('Accepteren is mislukt' + code + '. Controleer of de nieuwste Firebase-regels zijn gepubliceerd.');
  });
}



// ================================================================
// GROEPEN: een groepschat met meerdere vrienden
// Firebase: groepen/<id> { naam, maker, tijd, leden: { uid: naam } },
//           gebruikerGroepen/<uid>/<id> = true (welke groepen ik heb),
//           groepsberichten/<id>/<berichtId> (zoals een gewone chat).
// ================================================================

// Het plaatje van een groep: het gekozen poppetje, of 👥 als er geen is gekozen.
function groepPoppetjeHtml(g) {
  if (g && geldigDier(g.dier)) return poppetjeSvg(g.dier, geldigeAccessoires(g.accessoires || {}));
  return '👥';
}

function groepIsBeheerder(g, uid) {
  return !!g && !!uid && (g.maker === uid || !!(g.beheerders && g.beheerders[uid]));
}

function stopGroep(id) {
  if (groepRefs[id]) { groepRefs[id].off(); delete groepRefs[id]; }
  if (groepOngelezenQueries[id]) { groepOngelezenQueries[id].off(); delete groepOngelezenQueries[id]; }
  delete groepOngelezen[id];
}

function verdwijnGroepLokaal(id) {
  delete socialeGroepen[id];
  stopGroep(id);
  if (huidigGroepId === id) sluitChat();
  if (beheerdeGroepId === id) document.getElementById('groep-overlay').classList.remove('actief');
  renderVrienden();
}

function laadGroepen(uid) {
  if (groepLuisteraarUid === uid) return;
  if (groepIndexRef) { groepIndexRef.off(); groepIndexRef = null; }
  Object.keys(groepRefs).concat(Object.keys(groepOngelezenQueries)).forEach(stopGroep);
  socialeGroepen = {}; groepOngelezen = {};
  groepLuisteraarUid = uid;
  groepIndexRef = db.ref('gebruikerGroepen/' + uid);
  groepIndexRef.on('value', snap => {
    const ids = Object.keys(snap.val() || {});
    Object.keys(groepRefs).forEach(id => { if (ids.indexOf(id) < 0) verdwijnGroepLokaal(id); });
    ids.forEach(id => {
      if (groepRefs[id]) return;
      const r = db.ref('groepen/' + id);
      groepRefs[id] = r;
      r.on('value', s => {
        const v = s.val();
        if (!v) {
          if (!bezoekUid()) db.ref('gebruikerGroepen/' + uid + '/' + id).remove().catch(() => {});
          verdwijnGroepLokaal(id);
          return;
        }
        if (!v.leden || !v.leden[uid]) { verdwijnGroepLokaal(id); return; }
        socialeGroepen[id] = v;
        luisterGroepOngelezen(id, uid);
        if (huidigGroepId === id) { huidigChatNaam = v.naam; document.getElementById('chat-titel').textContent = '👥 ' + v.naam; document.getElementById('chat-kop-poppetje').innerHTML = groepPoppetjeHtml(v); werkGroepAanBij(); }
        if (beheerdeGroepId === id && document.getElementById('groep-overlay').classList.contains('actief')) bouwGroepBeheer();
        renderVrienden();
      }, () => verdwijnGroepLokaal(id));   // geen toegang meer (bijv. uit de groep gehaald)
    });
    renderVrienden();
  }, () => {});
}

function luisterGroepOngelezen(id, uid) {
  if (groepOngelezenQueries[id]) return;
  const sleutel = 'groep_' + id;
  const query = db.ref('groepsberichten/' + id).limitToLast(50);
  groepOngelezenQueries[id] = query;
  query.on('value', snap => {
    let nieuwste = 0, aantal = 0;
    const gelezenAlles = laadChatGelezen();
    const gelezen = Number(gelezenAlles[sleutel]) || 0;
    const eersteKeer = gelezenAlles[sleutel] === undefined;
    snap.forEach(c => {
      const b = c.val() || {};
      const t = Number(b.tijd) || 0;
      if (t > nieuwste) nieuwste = t;
      if (b.uid !== uid && t > gelezen && !(sitebeheerActief && geblokkeerdDoorMij[b.uid])) aantal++;
    });
    if (eersteKeer) { zetChatGelezen(sleutel, nieuwste || 1); aantal = 0; }
    const open = huidigGroepId === id && document.getElementById('chat-overlay').classList.contains('actief');
    if (open) { zetChatGelezen(sleutel, nieuwste); aantal = 0; }
    groepOngelezen[id] = aantal;
    renderVrienden();
  }, () => {});
}

function renderGroepen() {
  const lijst = document.getElementById('groepen-lijst');
  if (!lijst) return;
  lijst.innerHTML = '';
  const ids = Object.keys(socialeGroepen)
    .sort((x, y) => (groepOngelezen[y] || 0) - (groepOngelezen[x] || 0) || String(socialeGroepen[x].naam).localeCompare(String(socialeGroepen[y].naam), 'nl'));
  ids.forEach(id => {
    const g = socialeGroepen[id];
    const rij = document.createElement('div');
    rij.className = 'vriend-rij';
    const plaatje = document.createElement('span');
    plaatje.className = 'vriend-mini-poppetje'; plaatje.setAttribute('aria-hidden', 'true'); plaatje.innerHTML = groepPoppetjeHtml(g);
    const naam = document.createElement('strong');
    naam.textContent = g.naam;
    const sub = document.createElement('small');
    sub.className = 'beheer-echte-naam';
    const n = Object.keys(g.leden || {}).length;
    sub.textContent = ' ' + n + (n === 1 ? ' lid' : ' leden');
    naam.appendChild(sub);
    const chat = document.createElement('button');
    chat.type = 'button'; chat.className = 'btn btn-secondary chat-knop'; chat.textContent = '💬 Chat';
    const ongelezen = groepOngelezen[id] || 0;
    if (ongelezen > 0) {
      const badge = document.createElement('span');
      badge.className = 'chat-knop-badge';
      badge.textContent = ongelezen > 99 ? '99+' : String(ongelezen);
      chat.appendChild(badge);
    }
    chat.addEventListener('click', () => openGroepChat(id));
    const knoppen = document.createElement('div');
    knoppen.className = 'vriend-knoppen';
    knoppen.appendChild(chat);
    rij.append(plaatje, naam, knoppen);
    lijst.appendChild(rij);
  });
  if (!ids.length) lijst.innerHTML = '<p class="subtitel">Je zit nog in geen enkele groep.</p>';
  const nieuw = document.getElementById('btn-groep-nieuw');
  if (nieuw) nieuw.hidden = !!bezoekUid();
}

function openGroepChat(id) {
  const g = socialeGroepen[id];
  if (!g) return;
  huidigChatUid = ''; huidigGroepId = id; huidigChatNaam = g.naam;
  if (chatBlokRef) { chatBlokRef.off(); chatBlokRef = null; }
  document.getElementById('chat-titel').textContent = '👥 ' + g.naam;
  document.getElementById('chat-kop-poppetje').innerHTML = groepPoppetjeHtml(g);
  chatStijlPaneelOpen = false;
  ['chat-stijl-paneel', 'chat-poppetjes-paneel', 'chat-quiz-paneel', 'chat-munten-paneel', 'chat-emoji-paneel'].forEach(pid => {
    const el = document.getElementById(pid); if (el) el.hidden = true;
  });
  bouwChatEmojiPaneel();
  stopAntwoord();
  chatGekozenPoppetje = null;
  groepOntvanger = '';
  document.body.classList.add('groep-chat');
  document.getElementById('btn-chat-groep').hidden = false;
  document.getElementById('chat-overlay').classList.add('actief');
  document.body.classList.add('chat-open');
  pasChatStijlToe();
  werkChatBeheerBij();
  laadChatBerichten();
}

// ---- Groep maken ----
function openGroepMaken() {
  if (bezoekUid()) return;
  beheerdeGroepId = '';
  document.getElementById('groep-titel').textContent = 'Nieuwe groep';
  document.getElementById('groep-maak-blok').hidden = false;
  document.getElementById('groep-beheer-blok').hidden = true;
  document.getElementById('input-groep-naam').value = '';
  document.getElementById('groep-foutmelding').textContent = '';
  const lijst = document.getElementById('groep-maak-vrienden');
  lijst.innerHTML = '';
  const vrienden = Object.entries(socialeVrienden);
  vrienden.forEach(([uid, info]) => {
    const rij = document.createElement('label');
    rij.className = 'vriend-rij groep-kies-rij';
    const vink = document.createElement('input');
    vink.type = 'checkbox'; vink.value = uid;
    const naam = document.createElement('strong');
    maakWeergaveNaam(naam, uid, info.gebruikersnaam || 'Vriend');
    if (isBeheerUid(uid)) { const m = document.createElement('small'); m.className = 'beheer-echte-naam'; m.textContent = ' ⚙ Sitebeheer'; naam.appendChild(m); }
    rij.append(vink, maakMiniPoppetje(uid, 'vriend-mini-poppetje'), naam);
    lijst.appendChild(rij);
  });
  if (!vrienden.length) lijst.innerHTML = '<p class="subtitel">Je hebt nog geen vrienden om toe te voegen.</p>';
  document.getElementById('btn-groep-maken').disabled = false;
  document.getElementById('groep-overlay').classList.add('actief');
}

function maakGroepAan() {
  const gebruiker = profielFirebaseGebruiker();
  const fout = document.getElementById('groep-foutmelding');
  fout.textContent = '';
  if (!gebruiker || bezoekUid()) return;
  const naam = veiligeChatTekst(document.getElementById('input-groep-naam').value).slice(0, 30);
  if (!naam) { fout.textContent = 'Geef de groep een naam.'; return; }
  const gekozen = Array.from(document.querySelectorAll('#groep-maak-vrienden input:checked')).map(i => i.value).filter(u => socialeVrienden[u]);
  if (!gekozen.length) { fout.textContent = 'Kies minstens één vriend.'; return; }
  if (gekozen.length > 49) { fout.textContent = 'Een groep kan maximaal 50 leden hebben.'; return; }
  const leden = {};
  leden[gebruiker.uid] = huidigeMakerNaam() || 'Ik';
  gekozen.forEach(u => { leden[u] = String(socialeVrienden[u].gebruikersnaam || 'Vriend'); });
  const id = db.ref('groepen').push().key;
  const knop = document.getElementById('btn-groep-maken');
  knop.disabled = true;
  db.ref('groepen/' + id).set({ naam: naam, maker: gebruiker.uid, tijd: firebase.database.ServerValue.TIMESTAMP, leden: leden })
    .then(() => {
      const upd = {};
      Object.keys(leden).forEach(u => { upd['gebruikerGroepen/' + u + '/' + id] = true; });
      return db.ref().update(upd);
    })
    .then(() => {
      knop.disabled = false;
      document.getElementById('groep-overlay').classList.remove('actief');
    })
    .catch(err => {
      knop.disabled = false;
      const code = err && err.code ? ' (' + err.code + ')' : '';
      fout.textContent = 'Groep maken is mislukt' + code + '. Controleer of de nieuwste Firebase-regels zijn gepubliceerd.';
    });
}

// ---- Groep beheren (leden bekijken, toevoegen, verwijderen, verlaten) ----
function openGroepBeheer(id) {
  if (!socialeGroepen[id]) return;
  beheerdeGroepId = id;
  document.getElementById('groep-maak-blok').hidden = true;
  document.getElementById('groep-beheer-blok').hidden = false;
  groepFotoConcept = null; groepFotoTab = 'dieren';
  document.getElementById('input-groep-hernoem').value = socialeGroepen[id].naam || '';
  document.getElementById('groep-hernoem-fout').textContent = '';
  bouwGroepBeheer();
  document.getElementById('groep-overlay').classList.add('actief');
}

function bouwGroepBeheer() {
  const g = socialeGroepen[beheerdeGroepId];
  const gebruiker = profielFirebaseGebruiker();
  if (!g || !gebruiker) return;
  const ikBenEchteMaker = g.maker === gebruiker.uid;
  const ikBenMaker = (ikBenEchteMaker || !!sitebeheerActief) && !bezoekUid();   // sitebeheer mag in elke groep waar hij in zit alles
  const ikBenBeheerder = (groepIsBeheerder(g, gebruiker.uid) || !!sitebeheerActief) && !bezoekUid();
  const alleen = !!bezoekUid();
  document.getElementById('groep-hernoem-blok').hidden = !ikBenBeheerder;
  document.getElementById('groep-foto-blok').hidden = !ikBenBeheerder;
  if (ikBenBeheerder) bouwGroepFoto(g);
  document.getElementById('groep-titel').textContent = '👥 ' + g.naam;
  const ledenEl = document.getElementById('groep-leden-lijst');
  ledenEl.innerHTML = '';
  Object.keys(g.leden || {}).sort((a, b) => (a === g.maker ? -1 : b === g.maker ? 1 : String(g.leden[a]).localeCompare(String(g.leden[b]), 'nl'))).forEach(uid => {
    const rij = document.createElement('div');
    rij.className = 'vriend-rij';
    const naam = document.createElement('strong');
    maakWeergaveNaam(naam, uid, (socialeVrienden[uid] && socialeVrienden[uid].gebruikersnaam) || String(g.leden[uid] || 'Lid'));
    const lidIsBeheerder = !!(g.beheerders && g.beheerders[uid]);
    if (uid === g.maker) { const m = document.createElement('small'); m.className = 'beheer-echte-naam'; m.textContent = ' 👑 maker'; naam.appendChild(m); }
    else if (isBeheerUid(uid)) { const m = document.createElement('small'); m.className = 'beheer-echte-naam'; m.textContent = ' ⚙ Sitebeheer'; naam.appendChild(m); }
    else if (lidIsBeheerder) { const m = document.createElement('small'); m.className = 'beheer-echte-naam'; m.textContent = ' ⭐ beheerder'; naam.appendChild(m); }
    if (uid === gebruiker.uid) { const m = document.createElement('small'); m.className = 'beheer-echte-naam'; m.textContent = ' (jij)'; naam.appendChild(m); }
    rij.append(maakMiniPoppetje(uid, 'vriend-mini-poppetje'), naam);
    if (ikBenMaker && uid !== g.maker) {
      const ster = document.createElement('button');
      ster.type = 'button'; ster.className = 'btn btn-secondary';
      ster.textContent = lidIsBeheerder ? '⭐ Geen beheerder meer' : '⭐ Beheerder maken';
      ster.addEventListener('click', () => { ster.disabled = true; zetGroepBeheerder(beheerdeGroepId, uid, !lidIsBeheerder); });
      rij.appendChild(ster);
    }
    // Maker mag iedereen verwijderen; een beheerder alleen gewone leden.
    if (uid !== gebruiker.uid && uid !== g.maker && (ikBenMaker || (ikBenBeheerder && !lidIsBeheerder))) {
      const weg = document.createElement('button');
      weg.type = 'button'; weg.className = 'btn btn-secondary'; weg.textContent = '✕ Verwijderen';
      weg.addEventListener('click', () => { weg.disabled = true; verwijderGroepLid(beheerdeGroepId, uid); });
      rij.appendChild(weg);
    }
    ledenEl.appendChild(rij);
  });
  const toevBlok = document.getElementById('groep-toevoegen-blok');
  toevBlok.hidden = !ikBenBeheerder;
  const toevLijst = document.getElementById('groep-toevoegen-lijst');
  toevLijst.innerHTML = '';
  if (ikBenBeheerder) {
    const kandidaten = Object.entries(socialeVrienden).filter(([uid]) => !(g.leden || {})[uid]);
    kandidaten.forEach(([uid, info]) => {
      const rij = document.createElement('div');
      rij.className = 'vriend-rij';
      const naam = document.createElement('strong');
      maakWeergaveNaam(naam, uid, info.gebruikersnaam || 'Vriend');
      if (isBeheerUid(uid)) { const m = document.createElement('small'); m.className = 'beheer-echte-naam'; m.textContent = ' ⚙ Sitebeheer'; naam.appendChild(m); }
      const plus = document.createElement('button');
      plus.type = 'button'; plus.className = 'btn btn-primary'; plus.textContent = '➕ Toevoegen';
      plus.addEventListener('click', () => { plus.disabled = true; voegGroepLidToe(beheerdeGroepId, uid, String(info.gebruikersnaam || 'Vriend')); });
      rij.append(maakMiniPoppetje(uid, 'vriend-mini-poppetje'), naam, plus);
      toevLijst.appendChild(rij);
    });
    if (!kandidaten.length) toevLijst.innerHTML = '<p class="subtitel">Al je vrienden zitten al in deze groep.</p>';
    if (Object.keys(g.leden || {}).length >= 50) toevLijst.innerHTML = '<p class="subtitel">Een groep kan maximaal 50 leden hebben.</p>';
  }
  document.getElementById('btn-groep-verlaten').hidden = alleen || ikBenEchteMaker;
  document.getElementById('btn-groep-verwijderen').hidden = !ikBenMaker;
}

function groepFoutMelding(err, wat) {
  const code = err && err.code ? ' (' + err.code + ')' : '';
  alert(wat + ' is niet gelukt' + code + '. Controleer of de nieuwste Firebase-regels zijn gepubliceerd.');
}

function voegGroepLidToe(id, uid, naam) {
  const g = socialeGroepen[id];
  if (!g || !socialeVrienden[uid] || Object.keys(g.leden || {}).length >= 50) return;
  const upd = {};
  upd['groepen/' + id + '/leden/' + uid] = naam;
  db.ref().update(upd)
    .then(() => db.ref('gebruikerGroepen/' + uid + '/' + id).set(true))
    .catch(err => groepFoutMelding(err, 'Toevoegen'));
}

let groepFotoConcept = null;   // { groepId, dier, acc } = wat je nu aan het kiezen bent
let groepFotoTab = 'dieren';

function bouwGroepFoto(g) {
  if (!groepFotoConcept || groepFotoConcept.groepId !== beheerdeGroepId) {
    groepFotoConcept = {
      groepId: beheerdeGroepId,
      dier: geldigDier(g.dier) ? g.dier : '',
      acc: geldigeAccessoires(g.accessoires || {})
    };
  }
  const k = groepFotoConcept;
  const bezitDieren = haalBezitDieren().filter(d => geldigDier(d));
  const bezitAcc = haalBezitAccessoires();
  document.getElementById('groep-foto-voorbeeld').innerHTML = k.dier ? poppetjeSvg(k.dier, k.acc) : '👥';

  const tabs = document.getElementById('groep-foto-tabs');
  tabs.innerHTML = '';
  [{ id: 'dieren', naam: 'Dieren' }].concat(ACCESSOIRE_GROEPEN.map(gr => ({ id: gr.plek, naam: PE_TAB_NAMEN[gr.plek] || gr.titel }))).forEach(t => {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'pe-tab' + (t.id === groepFotoTab ? ' actief' : '');
    knop.innerHTML = '<span class="pe-tab-icoon">' + PE_TAB_ICONEN[t.id] + '</span><span>' + t.naam + '</span>';
    knop.addEventListener('click', () => { groepFotoTab = t.id; bouwGroepFoto(socialeGroepen[beheerdeGroepId] || g); });
    tabs.appendChild(knop);
  });

  const raster = document.getElementById('groep-foto-raster');
  raster.innerHTML = '';
  const opnieuw = () => bouwGroepFoto(socialeGroepen[beheerdeGroepId] || g);
  if (groepFotoTab === 'dieren') {
    bezitDieren.forEach(d => {
      raster.appendChild(peKaart(poppetjeSvg(d, k.acc), '', d === k.dier, () => { k.dier = d; opnieuw(); }));
    });
    if (!bezitDieren.length) raster.innerHTML = '<p class="subtitel">Je hebt nog geen dieren.</p>';
  } else {
    const groep = ACCESSOIRE_GROEPEN.find(gr => gr.plek === groepFotoTab);
    if (groep) {
      const basis = k.dier || bezitDieren[0] || '';
      const zonder = Object.assign({}, k.acc); delete zonder[groep.plek];
      raster.appendChild(peKaart(basis ? poppetjeSvg(basis, zonder) : '🚫', 'Geen', !k.acc[groep.plek], () => { delete k.acc[groep.plek]; opnieuw(); }));
      groep.items.filter(i => bezitAcc.indexOf(i) !== -1).forEach(emoji => {
        const proef = Object.assign({}, k.acc); proef[groep.plek] = emoji;
        raster.appendChild(peKaart(basis ? poppetjeSvg(basis, proef) : emoji, (ACCESSOIRES[emoji] && ACCESSOIRES[emoji].naam) || '', k.acc[groep.plek] === emoji, () => { k.acc[groep.plek] = emoji; opnieuw(); }));
      });
    }
  }
}

function zetGroepFoto(dier, accessoires) {
  const id = beheerdeGroepId;
  const g = socialeGroepen[id];
  const gebruiker = profielFirebaseGebruiker();
  const fout = document.getElementById('groep-foto-fout');
  fout.textContent = '';
  if (!g || !gebruiker || bezoekUid() || !(groepIsBeheerder(g, gebruiker.uid) || sitebeheerActief)) return;
  const acc = geldigeAccessoires(accessoires || {});
  const upd = {};
  upd['groepen/' + id + '/dier'] = dier && geldigDier(dier) ? dier : null;
  upd['groepen/' + id + '/accessoires'] = (dier && Object.keys(acc).length) ? acc : null;
  db.ref().update(upd).then(() => { fout.textContent = dier ? '✓ Groepsfoto opgeslagen' : '✓ Groepsfoto weggehaald'; }).catch(err => {
    const code = err && err.code ? ' (' + err.code + ')' : '';
    fout.textContent = 'Foto aanpassen is mislukt' + code + '. Controleer of de nieuwste Firebase-regels zijn gepubliceerd.';
  });
}

function zetGroepBeheerder(id, uid, wordt) {
  const gebruiker = profielFirebaseGebruiker();
  const g = socialeGroepen[id];
  if (!gebruiker || !g || (g.maker !== gebruiker.uid && !sitebeheerActief) || uid === g.maker || !(g.leden || {})[uid]) return;
  (wordt ? db.ref('groepen/' + id + '/beheerders/' + uid).set(true) : db.ref('groepen/' + id + '/beheerders/' + uid).remove())
    .catch(err => groepFoutMelding(err, 'Beheerder wijzigen'));
}

function hernoemGroep() {
  const gebruiker = profielFirebaseGebruiker();
  const g = socialeGroepen[beheerdeGroepId];
  const fout = document.getElementById('groep-hernoem-fout');
  fout.textContent = '';
  if (!gebruiker || !g || !(groepIsBeheerder(g, gebruiker.uid) || sitebeheerActief) || bezoekUid()) return;
  const naam = veiligeChatTekst(document.getElementById('input-groep-hernoem').value).slice(0, 30);
  if (!naam) { fout.textContent = 'Geef de groep een naam.'; return; }
  if (naam === g.naam) return;
  const knop = document.getElementById('btn-groep-hernoem');
  knop.disabled = true;
  db.ref('groepen/' + beheerdeGroepId + '/naam').set(naam)
    .then(() => { knop.disabled = false; fout.textContent = '✓ Naam aangepast'; })
    .catch(err => {
      knop.disabled = false;
      const code = err && err.code ? ' (' + err.code + ')' : '';
      fout.textContent = 'Aanpassen is mislukt' + code + '. Controleer of de nieuwste Firebase-regels zijn gepubliceerd.';
    });
}

function verwijderGroepLid(id, uid) {
  const g = socialeGroepen[id];
  if (!g || !confirm('Dit lid uit de groep halen?')) return;
  const upd = {};
  upd['gebruikerGroepen/' + uid + '/' + id] = null;
  const wasBeheerder = !!(g.beheerders && g.beheerders[uid]);
  db.ref().update(upd)
    .then(() => (wasBeheerder ? db.ref('groepen/' + id + '/beheerders/' + uid).remove() : null))
    .then(() => db.ref('groepen/' + id + '/leden/' + uid).remove())
    .catch(err => groepFoutMelding(err, 'Verwijderen'));
}

function verlaatGroep(id) {
  const gebruiker = profielFirebaseGebruiker();
  const g = socialeGroepen[id];
  if (!gebruiker || !g || bezoekUid()) return;
  if (!confirm('De groep "' + g.naam + '" verlaten?')) return;
  const wasBeheerder = !!(g.beheerders && g.beheerders[gebruiker.uid]);
  Promise.resolve(wasBeheerder ? db.ref('groepen/' + id + '/beheerders/' + gebruiker.uid).remove() : null)
    .then(() => db.ref('groepen/' + id + '/leden/' + gebruiker.uid).remove())
    .then(() => db.ref('gebruikerGroepen/' + gebruiker.uid + '/' + id).remove())
    .then(() => verdwijnGroepLokaal(id))
    .catch(err => groepFoutMelding(err, 'Verlaten'));
}

function verwijderGroep(id) {
  const gebruiker = profielFirebaseGebruiker();
  const g = socialeGroepen[id];
  if (!gebruiker || !g || (g.maker !== gebruiker.uid && !sitebeheerActief) || bezoekUid()) return;
  if (!confirm('De groep "' + g.naam + '" voor iedereen verwijderen, met alle berichten?')) return;
  const upd = {};
  Object.keys(g.leden || {}).forEach(u => { upd['gebruikerGroepen/' + u + '/' + id] = null; });
  db.ref().update(upd)
    .then(() => db.ref('groepsberichten/' + id).remove())
    .then(() => db.ref('groepen/' + id).remove())
    .then(() => verdwijnGroepLokaal(id))
    .catch(err => groepFoutMelding(err, 'Verwijderen'));
}

document.getElementById('btn-groep-nieuw').addEventListener('click', openGroepMaken);
document.getElementById('btn-groep-maken').addEventListener('click', maakGroepAan);
document.getElementById('btn-groep-sluiten').addEventListener('click', () => {
  document.getElementById('groep-overlay').classList.remove('actief');
});
document.getElementById('btn-chat-groep').addEventListener('click', () => { if (huidigGroepId) openGroepBeheer(huidigGroepId); });
document.getElementById('btn-groep-foto-opslaan').addEventListener('click', () => {
  const k = groepFotoConcept;
  if (!k || !k.dier) { document.getElementById('groep-foto-fout').textContent = 'Kies eerst een dier.'; return; }
  zetGroepFoto(k.dier, k.acc);
});
document.getElementById('btn-groep-foto-weg').addEventListener('click', () => { groepFotoConcept = { groepId: beheerdeGroepId, dier: '', acc: {} }; zetGroepFoto(null, {}); });
document.getElementById('btn-groep-hernoem').addEventListener('click', hernoemGroep);
document.getElementById('input-groep-hernoem').addEventListener('keydown', e => { if (e.key === 'Enter') hernoemGroep(); });
document.getElementById('btn-groep-verlaten').addEventListener('click', () => verlaatGroep(beheerdeGroepId));
document.getElementById('btn-groep-verwijderen').addEventListener('click', () => verwijderGroep(beheerdeGroepId));


// ---- Cadeaus (poppetjes, quizzen, munten) in een groep: je kiest aan welk lid je ze stuurt ----
let groepOntvanger = '';
function groepLidNaam(uid) {
  const g = socialeGroepen[huidigGroepId];
  return (socialeVrienden[uid] && socialeVrienden[uid].gebruikersnaam) || (g && g.leden && g.leden[uid]) || 'lid';
}
// In een groep mag een cadeau "voor iedereen" zijn: dan kan elk ander lid het accepteren (wie het eerst is).
function magCadeauAccepteren(b, gebruiker) {
  if (!gebruiker || b.uid === gebruiker.uid) return false;
  if (b.aan) return b.aan === gebruiker.uid;
  return !!huidigGroepId;
}
function chatOntvanger() { return huidigGroepId ? groepOntvanger : huidigChatUid; }
function chatOntvangerNaam() { return huidigGroepId ? (groepOntvanger ? groepLidNaam(groepOntvanger) : 'de groep') : huidigChatNaam; }
function chatOntvangerGeldig() {
  if (huidigGroepId) {
    const g = socialeGroepen[huidigGroepId];
    const gebruiker = profielFirebaseGebruiker();
    if (!g || !gebruiker) return false;
    return !groepOntvanger || !!(groepOntvanger !== gebruiker.uid && g.leden && g.leden[groepOntvanger]);
  }
  return !!socialeVrienden[huidigChatUid];
}
function ontvangerFoutTekst(wat) {
  return huidigGroepId ? 'Kies een geldig lid om ' + wat + ' naar te sturen.' : 'Je kunt alleen ' + wat + ' naar vrienden sturen.';
}
function werkGroepAanBij() {
  const balk = document.getElementById('chat-groep-aan');
  const keuze = document.getElementById('select-groep-aan');
  if (!balk || !keuze) return;
  const open = ['chat-poppetjes-paneel', 'chat-quiz-paneel', 'chat-munten-paneel'].some(id => { const p = document.getElementById(id); return p && !p.hidden; });
  balk.hidden = !(huidigGroepId && open);
  if (!huidigGroepId) return;
  const g = socialeGroepen[huidigGroepId];
  const gebruiker = profielFirebaseGebruiker();
  if (!g || !gebruiker) return;
  const uids = Object.keys(g.leden || {}).filter(u => u !== gebruiker.uid);
  if (groepOntvanger && uids.indexOf(groepOntvanger) < 0) groepOntvanger = '';
  keuze.innerHTML = '';
  const iedereen = document.createElement('option');
  iedereen.value = ''; iedereen.textContent = '🎁 Voor iedereen (wie het eerst accepteert)';
  if (!groepOntvanger) iedereen.selected = true;
  keuze.appendChild(iedereen);
  uids.forEach(u => {
    const o = document.createElement('option');
    o.value = u; o.textContent = groepLidNaam(u);
    if (u === groepOntvanger) o.selected = true;
    keuze.appendChild(o);
  });
  const qn = document.getElementById('chat-quiz-naam'); if (qn) qn.textContent = chatOntvangerNaam();
  const mn = document.getElementById('chat-munten-naam'); if (mn) mn.textContent = chatOntvangerNaam();
  if (typeof werkChatKeuzeBij === 'function') werkChatKeuzeBij();
}
document.getElementById('select-groep-aan').addEventListener('change', e => { groepOntvanger = e.target.value; werkGroepAanBij(); });
['chat-poppetjes-paneel', 'chat-quiz-paneel', 'chat-munten-paneel'].forEach(id => {
  new MutationObserver(werkGroepAanBij).observe(document.getElementById(id), { attributes: true, attributeFilter: ['hidden'] });
});

// ---------------- Munten sturen in de chat ----------------
// Het bedrag gaat meteen van de verzender af (zo kun je niet meer sturen dan je hebt).
// Accepteert de ontvanger, dan krijgt hij de munten. Weigert hij, of trekt de verzender het
// terug, dan krijgt de verzender ze automatisch terug (één keer, zodra hij de chat opent).
const muntenTerugbetaaldLokaal = {};

function toggleMuntenPaneel() {
  const paneel = document.getElementById('chat-munten-paneel');
  const open = paneel.hidden;
  ['chat-stijl-paneel', 'chat-poppetjes-paneel', 'chat-quiz-paneel'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });
  const emoji = document.getElementById('chat-emoji-paneel'); if (emoji) emoji.hidden = true;
  paneel.hidden = !open;
  if (open) {
    document.getElementById('chat-munten-naam').textContent = chatOntvangerNaam() || 'je vriend';
    document.getElementById('chat-munten-saldo').textContent = String(haalMunten());
    document.getElementById('chat-munten-aantal').value = '';
    document.getElementById('chat-munten-aantal').focus();
  }
}

function verstuurChatMunten() {
  const gebruiker = profielFirebaseGebruiker();
  const ref = chatBerichtenRef();
  if (!gebruiker || !ref) { alert(socialeVerbindingsMelding()); return; }
  if (bezoekUid()) return;
  if (chatGeblokkeerd()) { werkChatBeheerBij(); return; }
  if (!chatOntvangerGeldig()) { alert(ontvangerFoutTekst('munten')); return; }
  const invoer = document.getElementById('chat-munten-aantal');
  const bedrag = Math.floor(Number(invoer.value));
  if (!(bedrag >= 1) || bedrag > 100000) { alert('Vul een aantal munten in (minstens 1).'); return; }
  if (bedrag > haalMunten()) { alert('Je hebt maar ' + haalMunten() + ' munten.'); return; }
  const knop = document.getElementById('btn-chat-munten-verzenden');
  knop.disabled = true;
  zetMunten(haalMunten() - bedrag);   // het bedrag is nu "onderweg"
  ref.push().set({
    uid: gebruiker.uid,
    gebruikersnaam: huidigeMakerNaam(),
    type: 'munten',
    bedrag: bedrag,
    aan: chatOntvanger() || null,
    status: 'open',
    tekst: '🪙 ' + bedrag + ' munten',
    tijd: firebase.database.ServerValue.TIMESTAMP
  }).then(() => {
    knop.disabled = false;
    invoer.value = '';
    document.getElementById('chat-munten-paneel').hidden = true;
  }).catch(err => {
    knop.disabled = false;
    geefMunten(bedrag);   // niet verstuurd: je krijgt je munten terug
    const code = err && err.code ? ' (' + err.code + ')' : '';
    alert('Versturen is mislukt' + code + '. Controleer of de nieuwste Firebase-regels zijn gepubliceerd.');
  });
}

function maakChatMuntenBericht(key, b, eigen, gebruiker) {
  const kaart = document.createElement('div');
  kaart.className = 'chat-bericht chat-poppetje-bericht chat-munten-bericht' + (eigen ? ' eigen' : '');
  const wie = maakChatWie(eigen, b);
  const plaatje = document.createElement('div');
  plaatje.className = 'chat-poppetje-plaatje';
  plaatje.textContent = '🪙';
  plaatje.style.fontSize = '3rem';
  const label = document.createElement('div');
  label.className = 'chat-poppetje-label';
  const bedrag = Number(b.bedrag) || 0;
  label.textContent = '🎁 ' + (eigen ? 'Je stuurt ' : 'Cadeau: ') + bedrag + ' munten';
  kaart.append(maakChatBerichtKop(wie, key, b, eigen), plaatje, label);

  const status = document.createElement('div');
  status.className = 'chat-poppetje-status';
  if (b.status === 'geaccepteerd') {
    status.textContent = '✓ Geaccepteerd';
  } else if (b.status === 'geweigerd') {
    status.textContent = eigen ? '✕ Geweigerd — je munten zijn terug' : '✕ Geweigerd';
  } else if (b.status === 'mislukt') {
    status.textContent = 'Niet gelukt';
  } else if (b.status === 'bezig') {
    status.textContent = 'Bezig...';
  } else if (magCadeauAccepteren(b, gebruiker) && bedrag >= 1) {
    const ja = document.createElement('button');
    ja.type = 'button'; ja.className = 'btn btn-primary'; ja.textContent = '✓ Accepteren';
    ja.addEventListener('click', () => { ja.disabled = true; accepteerChatMunten(key, b); });
    const nee = document.createElement('button');
    nee.type = 'button'; nee.className = 'btn btn-secondary'; nee.textContent = '✕ Weigeren';
    nee.addEventListener('click', () => { nee.disabled = true; wijzigChatPoppetjeStatus(key, 'geweigerd'); });
    if (b.aan) status.append(ja, nee); else status.append(ja);   // een cadeau "voor iedereen" kun je niet voor de rest weigeren
  } else if (eigen) {
    const wacht = document.createElement('span');
    wacht.textContent = '⏳ Wacht op acceptatie';
    const annuleer = document.createElement('button');
    annuleer.type = 'button'; annuleer.className = 'btn btn-secondary'; annuleer.textContent = 'Terugtrekken';
    annuleer.addEventListener('click', () => { annuleer.disabled = true; wijzigChatPoppetjeStatus(key, 'geweigerd'); });
    status.append(wacht, annuleer);
  }
  kaart.appendChild(status);
  return kaart;
}

// Ontvanger accepteert: de munten komen bij hem erbij (bij de verzender waren ze al af).
function accepteerChatMunten(key, b) {
  const gebruiker = profielFirebaseGebruiker();
  const ref = chatBerichtenRef();
  if (!gebruiker || !ref || bezoekUid()) return;
  const bedrag = Math.floor(Number(b.bedrag));
  if (!magCadeauAccepteren(b, gebruiker) || (!huidigGroepId && b.uid !== huidigChatUid) || !(bedrag >= 1)) return;
  const statusRef = ref.child(key).child('status');
  let geclaimd = false;
  statusRef.transaction(v => {
    if (v === 'open') { geclaimd = true; return 'bezig'; }
    geclaimd = false;
    return v;
  }).then(res => {
    if (!res.committed || !geclaimd) return null;
    geefMunten(bedrag);
    return statusRef.set('geaccepteerd');
  }).catch(err => {
    console.error('Munten accepteren mislukt:', err);
    statusRef.transaction(v => (v === 'bezig' ? 'open' : v)).catch(() => {});
    const code = err && err.code ? ' (' + err.code + ')' : '';
    alert('Accepteren is mislukt' + code + '. Controleer of de nieuwste Firebase-regels zijn gepubliceerd.');
  });
}

// Verzender krijgt de munten van een geweigerd/teruggetrokken bericht precies één keer terug.
function betaalMuntenTerugAlsNodig(key, b, nu) {
  const ref = chatBerichtenRef();
  if (!ref || bezoekUid() || b.type !== 'munten' || b.status !== 'geweigerd' || b.terugbetaald) return Promise.resolve();
  const gebruiker = profielFirebaseGebruiker();
  if (!gebruiker || b.uid !== gebruiker.uid) return Promise.resolve();
  const slot = (huidigGroepId || huidigChatUid) + '/' + key;
  if (muntenTerugbetaaldLokaal[slot]) return Promise.resolve();
  muntenTerugbetaaldLokaal[slot] = true;
  const bedrag = Math.floor(Number(b.bedrag));
  if (!(bedrag >= 1)) return Promise.resolve();
  let geclaimd = false;
  return ref.child(key).child('terugbetaald').transaction(v => {
    if (!v) { geclaimd = true; return true; }
    geclaimd = false;
    return v;
  }).then(res => {
    if (res.committed && geclaimd) geefMunten(bedrag);
  }).catch(() => { delete muntenTerugbetaaldLokaal[slot]; });
}

function verstuurChatBericht() {
  const gebruiker = profielFirebaseGebruiker();
  const input = document.getElementById('chat-input');
  const tekst = veiligeChatTekst(input.value);
  if (!tekst) return;
  if (bezoekUid()) return;   // meelezen mag, namens iemand anders schrijven niet
  if (chatGeblokkeerd()) { werkChatBeheerBij(); return; }
  const ref = chatBerichtenRef();
  if (!gebruiker || !ref) { alert(socialeVerbindingsMelding()); zorgVoorSocialeGebruiker(); return; }
  const antwoord = chatAntwoord ? { key: chatAntwoord.key, uid: chatAntwoord.uid, naam: chatAntwoord.naam === 'Jij' ? huidigeMakerNaam() : chatAntwoord.naam, tekst: chatAntwoord.tekst } : null;
  input.value = '';
  stopAntwoord();
  const nieuwBericht = { uid: gebruiker.uid, gebruikersnaam: huidigeMakerNaam(), tekst: tekst, tijd: firebase.database.ServerValue.TIMESTAMP };
  if (antwoord) nieuwBericht.antwoordOp = antwoord;
  ref.push().set(nieuwBericht).catch(err => {
    input.value = tekst;
    if (antwoord) { chatAntwoord = antwoord; chatAntwoord.naam = antwoord.uid === gebruiker.uid ? 'Jij' : antwoord.naam; bouwAntwoordBalk(); document.getElementById('chat-antwoord-naam').textContent = chatAntwoord.naam; document.getElementById('chat-antwoord-tekst').textContent = antwoord.tekst; document.getElementById('chat-antwoord-balk').hidden = false; }
    const code = err && err.code ? ' (' + err.code + ')' : '';
    alert('Het bericht kon niet worden verstuurd' + code + '. Controleer of de nieuwste Firebase-regels zijn gepubliceerd en of Anoniem aanmelden aan staat.');
  });
}

// Aantal exemplaren dat je nog echt kunt sturen (niet al onderweg in open verzoeken).
function chatBeschikbaarAantal(soort, item) {
  return aantalVan(soort, item) - (chatOpenAangeboden[soort + ':' + item] || 0);
}
let chatOpenAangeboden = {};

function bouwChatPoppetjesLijst() {
  const lijst = document.getElementById('chat-poppetjes-lijst');
  if (!lijst) return;
  lijst.innerHTML = '';
  const opDieren = chatPoppetjeTab === 'dieren';
  const soort = opDieren ? 'dier' : 'accessoire';
  const bezit = opDieren ? haalBezitDieren() : haalBezitAccessoires();
  if (!bezit.length) { lijst.innerHTML = '<p class="subtitel">Je hebt hier nog niets van.</p>'; return; }
  bezit.forEach(item => {
    const beschikbaar = chatBeschikbaarAantal(soort, item);
    const laatste = aantalVan(soort, item) <= 1 && bezit.length <= 1;
    const knop = document.createElement('button');
    knop.type = 'button';
    const gekozen = chatGekozenPoppetje && chatGekozenPoppetje.soort === soort && chatGekozenPoppetje.item === item;
    knop.className = 'dier-knop verzameling-item in-bezit' + (gekozen ? ' gekozen' : '');
    knop.innerHTML = chatPoppetjeSvgVoor(soort, item);
    const badge = document.createElement('span');
    badge.className = 'dier-knop-badge';
    badge.textContent = String(Math.max(0, beschikbaar));
    knop.appendChild(badge);
    if (beschikbaar < 1 || laatste) {
      knop.disabled = true;
      knop.classList.add('niet-in-bezit');
      knop.title = laatste ? 'Je laatste kun je niet versturen' : 'Al onderweg';
    } else {
      knop.title = chatPoppetjeNaam(soort, item);
      knop.addEventListener('click', () => {
        chatGekozenPoppetje = { soort, item };
        bouwChatPoppetjesLijst();
        werkChatKeuzeBij();
      });
    }
    lijst.appendChild(knop);
  });
}

function werkChatKeuzeBij() {
  const tekst = document.getElementById('chat-poppetjes-keuze');
  const knop = document.getElementById('btn-chat-poppetje-verzenden');
  if (chatGekozenPoppetje) {
    tekst.textContent = chatPoppetjeNaam(chatGekozenPoppetje.soort, chatGekozenPoppetje.item) + ' → ' + chatOntvangerNaam();
    knop.disabled = false;
  } else {
    tekst.textContent = 'Kies een poppetje om te versturen';
    knop.disabled = true;
  }
}

function zetChatTab(tab) {
  chatPoppetjeTab = tab;
  document.getElementById('chat-tab-dieren').classList.toggle('actief', tab === 'dieren');
  document.getElementById('chat-tab-accessoires').classList.toggle('actief', tab === 'accessoires');
  bouwChatPoppetjesLijst();
}

function togglePoppetjesPaneel() {
  const paneel = document.getElementById('chat-poppetjes-paneel');
  const open = paneel.hidden;
  paneel.hidden = !open;
  if (open) {
    document.getElementById('chat-stijl-paneel').hidden = true;
    document.getElementById('chat-quiz-paneel').hidden = true;
    document.getElementById('chat-munten-paneel').hidden = true;
    chatGekozenPoppetje = null;
    // Tel open verzoeken van mij, zodat je niet meer aanbiedt dan je hebt.
    const gebruiker = profielFirebaseGebruiker();
    const ref = chatBerichtenRef();
    chatOpenAangeboden = {};
    if (gebruiker && ref) {
      ref.limitToLast(100).once('value').then(snap => {
        snap.forEach(c => {
          const m = c.val() || {};
          if (m.type === 'poppetje' && m.uid === gebruiker.uid && m.status === 'open') {
            const s = m.soort + ':' + m.item;
            chatOpenAangeboden[s] = (chatOpenAangeboden[s] || 0) + 1;
          }
        });
        bouwChatPoppetjesLijst(); werkChatKeuzeBij();
      }).catch(() => { bouwChatPoppetjesLijst(); werkChatKeuzeBij(); });
    }
    bouwChatPoppetjesLijst(); werkChatKeuzeBij();
  }
}

function verstuurChatPoppetje() {
  const gebruiker = profielFirebaseGebruiker();
  const ref = chatBerichtenRef();
  const keuze = chatGekozenPoppetje;
  if (!gebruiker || !ref || !keuze) return;
  if (chatGeblokkeerd()) { werkChatBeheerBij(); return; }
  if (!chatOntvangerGeldig()) { alert(ontvangerFoutTekst('poppetjes')); return; }
  if (!chatPoppetjeGeldig(keuze.soort, keuze.item) || chatBeschikbaarAantal(keuze.soort, keuze.item) < 1) {
    alert('Je hebt dit poppetje niet (meer).'); return;
  }
  const tekst = '🎁 ' + chatPoppetjeNaam(keuze.soort, keuze.item);
  ref.push().set({
    uid: gebruiker.uid,
    gebruikersnaam: huidigeMakerNaam(),
    type: 'poppetje',
    soort: keuze.soort,
    item: keuze.item,
    aan: chatOntvanger() || null,
    status: 'open',
    tekst: tekst,
    tijd: firebase.database.ServerValue.TIMESTAMP
  }).then(() => {
    chatGekozenPoppetje = null;
    document.getElementById('chat-poppetjes-paneel').hidden = true;
  }).catch(err => {
    const code = err && err.code ? ' (' + err.code + ')' : '';
    alert('Versturen is mislukt' + code + '. Controleer of de nieuwste Firebase-regels zijn gepubliceerd.');
  });
}

// ---------------- Quiz sturen in de chat ----------------

function eigenQuizLijst() {
  try { return JSON.parse(localStorage.getItem('eigenQuizzen') || '[]') || []; } catch (e) { return []; }
}

// Zet een quiz die een vriend deelt bij "Mijn quizzen". Het is dezelfde quiz (zelfde code):
// aanpassingen zie je allebei.
function voegGedeeldeQuizToe(code, quizData, vanNaam) {
  const lijst = eigenQuizLijst();
  if (lijst.some(q => q.code === code)) return false;
  lijst.push({
    code: code,
    titel: quizData.titel,
    aantalVragen: (quizData.vragen || []).length,
    afbeelding: quizData.afbeelding || STANDAARD_OMSLAGEN[0].url,
    openbaar: !!quizData.openbaar,
    gedeeldVan: vanNaam || 'een vriend'
  });
  localStorage.setItem('eigenQuizzen', JSON.stringify(lijst));
  return true;
}

function gaNaarMijnQuizzen() {
  sluitChat();
  document.getElementById('vrienden-overlay').classList.remove('actief');
  toonScherm('scherm-quizmaken');
  laadEigenQuizzen();
}

function toggleQuizPaneel() {
  const paneel = document.getElementById('chat-quiz-paneel');
  const open = paneel.hidden;
  paneel.hidden = !open;
  if (!open) return;
  document.getElementById('chat-stijl-paneel').hidden = true;
  document.getElementById('chat-poppetjes-paneel').hidden = true;
  chatGekozenPoppetje = null;
  document.getElementById('chat-quiz-naam').textContent = chatOntvangerNaam();
  bouwChatQuizLijst();
}

function bouwChatQuizLijst() {
  const lijst = document.getElementById('chat-quiz-lijst');
  lijst.innerHTML = '';
  const quizzen = eigenQuizLijst();
  if (!quizzen.length) {
    lijst.innerHTML = '<p class="subtitel">Je hebt nog geen quizzen. Maak er eerst een bij "Quiz maken".</p>';
    return;
  }
  quizzen.forEach(q => {
    const rij = document.createElement('div');
    rij.className = 'chat-quiz-rij';
    const plaat = document.createElement('img');
    plaat.className = 'chat-quiz-plaat';
    plaat.src = q.afbeelding || STANDAARD_OMSLAGEN[0].url;
    plaat.alt = '';
    const info = document.createElement('div');
    info.className = 'chat-quiz-info';
    const titel = document.createElement('strong');
    titel.textContent = q.titel || 'Quiz';
    const sub = document.createElement('span');
    sub.textContent = (q.aantalVragen || 0) + ' vraag/vragen';
    info.append(titel, sub);
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'btn btn-primary';
    knop.textContent = '📤 Sturen';
    knop.addEventListener('click', () => { knop.disabled = true; verstuurChatQuiz(q); });
    rij.append(plaat, info, knop);
    lijst.appendChild(rij);
  });
}

function verstuurChatQuiz(q) {
  const gebruiker = profielFirebaseGebruiker();
  const ref = chatBerichtenRef();
  if (!gebruiker || !ref) return;
  if (chatGeblokkeerd()) { werkChatBeheerBij(); return; }
  if (!chatOntvangerGeldig()) { alert(ontvangerFoutTekst('quizzen')); return; }
  db.ref('quizzen/' + q.code + '/titel').once('value').then(snap => {
    if (!snap.exists()) throw new Error('Deze quiz bestaat niet meer.');
    return ref.push().set({
      uid: gebruiker.uid,
      gebruikersnaam: huidigeMakerNaam(),
      type: 'quiz',
      code: q.code,
      titel: snap.val(),
      aantalVragen: q.aantalVragen || 0,
      aan: chatOntvanger() || null,
      status: 'open',
      tekst: '📝 ' + snap.val(),
      tijd: firebase.database.ServerValue.TIMESTAMP
    });
  }).then(() => {
    document.getElementById('chat-quiz-paneel').hidden = true;
  }).catch(err => {
    const code = err && err.code ? ' (' + err.code + ')' : '';
    alert((err && err.message && !err.code ? err.message : 'Versturen is mislukt' + code + '. Controleer of de nieuwste Firebase-regels zijn gepubliceerd.'));
    bouwChatQuizLijst();
  });
}

function maakChatQuizBericht(key, b, eigen, gebruiker) {
  const kaart = document.createElement('div');
  kaart.className = 'chat-bericht chat-poppetje-bericht chat-quiz-bericht' + (eigen ? ' eigen' : '');
  const wie = maakChatWie(eigen, b);
  const icoon = document.createElement('div');
  icoon.className = 'chat-quiz-icoon';
  icoon.textContent = '📝';
  const label = document.createElement('div');
  label.className = 'chat-poppetje-label';
  label.textContent = (eigen ? 'Je stuurt de quiz ' : 'Quiz: ') + (b.titel || 'Quiz');
  const sub = document.createElement('div');
  sub.className = 'chat-quiz-sub';
  sub.textContent = (b.aantalVragen || 0) + ' vraag/vragen · jullie kunnen hem allebei aanpassen';
  kaart.append(maakChatBerichtKop(wie, key, b, eigen), icoon, label, sub);

  const status = document.createElement('div');
  status.className = 'chat-poppetje-status';
  const bendOntvanger = magCadeauAccepteren(b, gebruiker);
  if (b.status === 'geaccepteerd') {
    const ok = document.createElement('span');
    ok.textContent = '✓ Geaccepteerd';
    status.appendChild(ok);
    if (bendOntvanger && b.code) {
      const naar = document.createElement('button');
      naar.type = 'button'; naar.className = 'btn btn-primary';
      if (isEigenQuizCode(b.code)) {
        naar.textContent = '📝 Naar Mijn quizzen';
        naar.addEventListener('click', gaNaarMijnQuizzen);
      } else {
        naar.textContent = '➕ Toevoegen aan Mijn quizzen';
        naar.addEventListener('click', () => {
          naar.disabled = true;
          db.ref('quizzen/' + b.code).once('value').then(snap => {
            const q = snap.val();
            if (!q || !q.titel) { alert('Deze quiz bestaat niet meer.'); return; }
            voegGedeeldeQuizToe(b.code, q, b.gebruikersnaam);
            gaNaarMijnQuizzen();
          }).catch(() => { naar.disabled = false; alert('Toevoegen is mislukt.'); });
        });
      }
      status.appendChild(naar);
    }
  } else if (b.status === 'geweigerd') {
    status.textContent = '✕ Geweigerd';
  } else if (b.status === 'mislukt') {
    status.textContent = 'Niet gelukt: deze quiz bestaat niet meer';
  } else if (b.status === 'bezig') {
    status.textContent = 'Bezig...';
  } else if (bendOntvanger && b.code) {
    const ja = document.createElement('button');
    ja.type = 'button'; ja.className = 'btn btn-primary'; ja.textContent = '✓ Accepteren';
    ja.addEventListener('click', () => { ja.disabled = true; accepteerChatQuiz(key, b); });
    const nee = document.createElement('button');
    nee.type = 'button'; nee.className = 'btn btn-secondary'; nee.textContent = '✕ Weigeren';
    nee.addEventListener('click', () => { nee.disabled = true; wijzigChatPoppetjeStatus(key, 'geweigerd'); });
    if (b.aan) status.append(ja, nee); else status.append(ja);   // een cadeau "voor iedereen" kun je niet voor de rest weigeren
  } else if (eigen) {
    const wacht = document.createElement('span');
    wacht.textContent = '⏳ Wacht op acceptatie';
    const annuleer = document.createElement('button');
    annuleer.type = 'button'; annuleer.className = 'btn btn-secondary'; annuleer.textContent = 'Terugtrekken';
    annuleer.addEventListener('click', () => { annuleer.disabled = true; wijzigChatPoppetjeStatus(key, 'geweigerd'); });
    status.append(wacht, annuleer);
  }
  kaart.appendChild(status);
  return kaart;
}

// Ontvanger accepteert: de quiz komt ook bij zijn eigen quizzen te staan en hij kan hem aanpassen.
function accepteerChatQuiz(key, b) {
  const gebruiker = profielFirebaseGebruiker();
  const ref = chatBerichtenRef();
  if (!gebruiker || !ref) return;
  if (!magCadeauAccepteren(b, gebruiker) || (!huidigGroepId && b.uid !== huidigChatUid) || !b.code) return;
  const statusRef = ref.child(key).child('status');
  let geclaimd = false;
  statusRef.transaction(v => {
    if (v === 'open') { geclaimd = true; return 'bezig'; }
    geclaimd = false;
    return v;
  }).then(res => {
    if (!res.committed || !geclaimd) throw new Error('al-afgehandeld');
    return db.ref('quizzen/' + b.code).once('value');
  }).then(snap => {
    const q = snap.val();
    if (!q || !q.titel) return statusRef.set('mislukt');
    voegGedeeldeQuizToe(b.code, q, b.gebruikersnaam);
    return statusRef.set('geaccepteerd');
  }).catch(err => {
    if (err && err.message === 'al-afgehandeld') return;
    console.error('Quiz accepteren mislukt:', err);
    statusRef.transaction(v => (v === 'bezig' ? 'open' : v)).catch(() => {});
    const code = err && err.code ? ' (' + err.code + ')' : '';
    alert('Accepteren is mislukt' + code + '. Probeer het opnieuw.');
  });
}

function openVriendStuurOverlay(type, item) {
  const lijst = document.getElementById('stuur-vriend-lijst');
  const overlay = document.getElementById('stuur-vriend-overlay');
  if (!lijst || !overlay) return;
  lijst.innerHTML = '';
  Object.entries(socialeVrienden).forEach(([uid, info]) => {
    const knop = document.createElement('button');
    knop.type = 'button'; knop.className = 'btn btn-secondary stuur-vriend-knop';
    knop.textContent = '🎁 ' + (info.gebruikersnaam || 'Vriend');
    knop.addEventListener('click', () => verstuurItemNaarVriend(uid, info.gebruikersnaam || 'Vriend', type, item));
    lijst.appendChild(knop);
  });
  if (!Object.keys(socialeVrienden).length) lijst.innerHTML = '<p class="subtitel">Je moet eerst vrienden hebben.</p>';
  overlay.dataset.type = type; overlay.dataset.item = item; overlay.classList.add('actief');
}

function verstuurItemNaarVriend(toUid, naam, type, item) {
  const gebruiker = profielFirebaseGebruiker();
  if (!gebruiker) return;
  if (!socialeVrienden[toUid]) { alert('Je kunt alleen items naar vrienden sturen.'); return; }
  if (aantalVan(type, item) < 1) { alert('Je hebt dit item niet meer.'); return; }
  const pad = type === 'dier' ? 'dieren/' : 'accessoires/';
  const fromRef = db.ref(SOCIAAL_PROFIEL_PAD + '/' + gebruiker.uid + '/bezit/' + pad + item);
  const toRef = db.ref(SOCIAAL_PROFIEL_PAD + '/' + toUid + '/bezit/' + pad + item);
  fromRef.transaction(v => { const n = Number(v) || 0; return n > 0 ? n - 1 : v; }).then(result => {
    if (!result.committed || Number(result.snapshot.val() || 0) < 0) throw new Error('geen exemplaar');
    return toRef.transaction(v => (Number(v) || 0) + 1);
  }).then(() => {
    verwijderEenUitBezit(type, item);
    sluitStuurVriendOverlay();
    alert('🎁 Verstuurd naar ' + naam + '!');
  }).catch(() => alert('Versturen is mislukt. Probeer opnieuw.'));
}

function sluitStuurVriendOverlay() {
  document.getElementById('stuur-vriend-overlay').classList.remove('actief');
}

// ---------------- Gebruikersnaam wijzigen ----------------

function wijzigGebruikersnaam(nieuweNaamRaw) {
  const gebruiker = profielFirebaseGebruiker();
  const nieuweNaam = String(nieuweNaamRaw || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  const oudeNaam = huidigeMakerNaam() || '';
  if (!nieuweNaam) return Promise.reject(new Error('Vul een gebruikersnaam in.'));
  if (nieuweNaam === oudeNaam) return Promise.resolve(false);
  if (!gebruiker) return Promise.reject(new Error('Je profiel is nog niet verbonden. Probeer het over een paar seconden opnieuw.'));
  if (gebruiker.bezoek) return Promise.reject(new Error('Je bekijkt nu het profiel van iemand anders. Druk eerst op Stoppen met bezoeken om je eigen naam te wijzigen.'));

  const nieuweZoek = normaliseerGebruikersnaam(nieuweNaam);
  const oudeZoek = normaliseerGebruikersnaam(oudeNaam);

  // Stap 1: de nieuwe naam vastleggen (dezelfde naam als een ander mag).
  const reserveer = nieuweZoek === oudeZoek
    ? Promise.resolve()
    : naamRegistreer(gebruiker.uid, nieuweZoek).catch(err => { if (err && !err.stap) err.stap = 'namen'; throw err; });

  return reserveer
    // Stap 2: online profiel bijwerken.
    .then(() => db.ref(SOCIAAL_PROFIEL_PAD + '/' + gebruiker.uid).update({
      gebruikersnaam: nieuweNaam,
      gebruikersnaamZoek: nieuweZoek
    }).catch(err => { if (err && !err.stap) err.stap = SOCIAAL_PROFIEL_PAD + '/' + gebruiker.uid; throw err; }))
    // Stap 3: de oude naam vrijgeven, zodat een ander hem weer kan kiezen.
    .then(() => {
      if (oudeZoek && oudeZoek !== nieuweZoek) {
        return naamVrijgeven(gebruiker.uid, oudeZoek);
      }
    })
    .then(() => {
      localStorage.setItem(MAKER_NAAM_SLEUTEL, nieuweNaam);
      socialeNamenCache = null;

      // Stap 4: je naam in de vriendenlijsten van je vrienden bijwerken.
      const updates = {};
      Object.keys(socialeVrienden || {}).forEach(fuid => {
        updates['vrienden/' + fuid + '/' + gebruiker.uid + '/gebruikersnaam'] = nieuweNaam;
      });
      if (Object.keys(updates).length) db.ref().update(updates).catch(() => {});

      // Stap 5: de naam bij je eigen quizzen bijwerken.
      let eigenQuizzen = [];
      try { eigenQuizzen = JSON.parse(localStorage.getItem('eigenQuizzen') || '[]'); } catch (e) {}
      eigenQuizzen.filter(q => !q.gedeeldVan).forEach(q => {
        db.ref('quizzen/' + q.code).once('value').then(snap => {
          if (!snap.child('titel').exists()) return;
          const huidig = snap.child('makerNaam').val();
          if (!huidig || huidig === oudeNaam) return db.ref('quizzen/' + q.code + '/makerNaam').set(nieuweNaam);
        }).catch(() => {});
      });
      return true;
    });
}

function sluitNaamWijzigenPaneel() {
  const paneel = document.getElementById('profiel-naam-wijzigen-paneel');
  if (paneel) paneel.hidden = true;
  const fout = document.getElementById('profiel-naam-foutmelding');
  if (fout) fout.textContent = '';
}

document.getElementById('btn-profiel-naam-wijzigen').addEventListener('click', () => {
  const paneel = document.getElementById('profiel-naam-wijzigen-paneel');
  const input = document.getElementById('input-profiel-nieuwe-naam');
  document.getElementById('profiel-naam-foutmelding').textContent = '';
  paneel.hidden = !paneel.hidden;
  if (!paneel.hidden) { input.value = huidigeMakerNaam() || ''; input.focus(); input.select(); }
});

function slaNieuweGebruikersnaamOp() {
  const input = document.getElementById('input-profiel-nieuwe-naam');
  const fout = document.getElementById('profiel-naam-foutmelding');
  const knop = document.getElementById('btn-profiel-naam-opslaan');
  fout.textContent = '';
  knop.disabled = true;
  wijzigGebruikersnaam(input.value).then(gewijzigd => {
    knop.disabled = false;
    if (gewijzigd) werkProfielOverlayNaamBij();
    sluitNaamWijzigenPaneel();
  }).catch(err => {
    knop.disabled = false;
    const code = err && err.code ? ' (' + err.code + ')' : '';
    const rechten = String((err && (err.code || err.message)) || '').toUpperCase().indexOf('PERMISSION') !== -1;
    fout.textContent = rechten
      ? 'Firebase weigert dit' + code + (err && err.stap ? ' bij "' + err.stap + '"' : '') + '. Publiceer de nieuwste regels uit firebase-rules.json.'
      : ((err && err.message) || 'Naam wijzigen is mislukt.') + code;
  });
}
document.getElementById('btn-profiel-naam-opslaan').addEventListener('click', slaNieuweGebruikersnaamOp);
document.getElementById('input-profiel-nieuwe-naam').addEventListener('keydown', e => { if (e.key === 'Enter') slaNieuweGebruikersnaamOp(); });
document.getElementById('btn-profiel-badge').addEventListener('click', sluitNaamWijzigenPaneel);
document.getElementById('btn-profiel-overlay-sluiten').addEventListener('click', sluitNaamWijzigenPaneel);

// Vrienden openen vanuit de vaste balk rechtsboven.
document.getElementById('btn-vrienden-badge').addEventListener('click', () => {
  metProfielVereist(() => {
    document.getElementById('vrienden-overlay').classList.add('actief');
    zorgVoorSocialeGebruiker().then(gebruiker => {
      const meldingEl = document.getElementById('vrienden-verbindingsmelding');
      if (meldingEl) { meldingEl.hidden = !!gebruiker; meldingEl.textContent = gebruiker ? '' : socialeVerbindingsMelding(); }
      if (gebruiker) { registreerSociaalProfiel(); laadVriendenEnVerzoeken(); }
      updateVriendenBadge();
    });
  });
});

document.getElementById('btn-vrienden-sluiten').addEventListener('click', () => {
  document.getElementById('vrienden-overlay').classList.remove('actief');
});

document.getElementById('btn-vrienden-toevoegen').addEventListener('click', () => {
  const paneel = document.getElementById('vrienden-toevoegen-paneel');
  const open = !paneel.hidden;
  paneel.hidden = open;
  document.getElementById('btn-vrienden-toevoegen').textContent = open ? '➕ Toevoegen' : '✕ Toevoegen sluiten';
  if (!open) {
    document.getElementById('input-zoek-vrienden').focus();
    laadSocialeNamen(true).catch(() => {});
    zoekGebruikersOpNaam(document.getElementById('input-zoek-vrienden').value);
  }
});

document.getElementById('btn-vrienden-zoeken').addEventListener('click', () => {
  zoekGebruikersOpNaam(document.getElementById('input-zoek-vrienden').value, true);
});
document.getElementById('input-zoek-vrienden').addEventListener('input', e => {
  clearTimeout(socialeZoekTimer);
  const waarde = e.target.value;
  socialeZoekTimer = setTimeout(() => zoekGebruikersOpNaam(waarde), 150);
});
document.getElementById('input-zoek-vrienden').addEventListener('keydown', e => {
  if (e.key === 'Enter') { clearTimeout(socialeZoekTimer); zoekGebruikersOpNaam(e.target.value, true); }
});
document.getElementById('btn-chat-sluiten').addEventListener('click', sluitChat);
document.getElementById('btn-chat-sturen').addEventListener('click', verstuurChatBericht);
document.getElementById('btn-chat-stijl').addEventListener('click', () => {
  const paneel = document.getElementById('chat-stijl-paneel');
  paneel.hidden = !paneel.hidden;
  if (!paneel.hidden) {
    document.getElementById('chat-poppetjes-paneel').hidden = true;
    document.getElementById('chat-quiz-paneel').hidden = true;
    document.getElementById('chat-munten-paneel').hidden = true;
  }
});
document.getElementById('btn-chat-poppetje').addEventListener('click', togglePoppetjesPaneel);
document.getElementById('btn-chat-quiz').addEventListener('click', toggleQuizPaneel);
document.getElementById('btn-chat-munten').addEventListener('click', toggleMuntenPaneel);
document.getElementById('btn-chat-munten-verzenden').addEventListener('click', verstuurChatMunten);
document.getElementById('chat-munten-aantal').addEventListener('keydown', e => { if (e.key === 'Enter') verstuurChatMunten(); });
document.querySelectorAll('#chat-munten-paneel [data-munten]').forEach(k => k.addEventListener('click', () => {
  document.getElementById('chat-munten-aantal').value = k.getAttribute('data-munten');
}));
document.getElementById('chat-tab-dieren').addEventListener('click', () => zetChatTab('dieren'));
document.getElementById('chat-tab-accessoires').addEventListener('click', () => zetChatTab('accessoires'));
document.getElementById('btn-chat-poppetje-verzenden').addEventListener('click', verstuurChatPoppetje);
document.getElementById('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') verstuurChatBericht(); });
document.getElementById('btn-stuur-vriend-sluiten').addEventListener('click', sluitStuurVriendOverlay);

// Houd het online profiel gelijk aan de lokale profielkeuze.
const _oudeWerkProfielBadgeBij = werkProfielBadgeBij;
werkProfielBadgeBij = function() {
  _oudeWerkProfielBadgeBij();
  if (heeftProfiel()) registreerSociaalProfiel();
};

// Initialiseer aantallen voor bestaande spelers en publiceer het profiel zodra
// anonieme Firebase-auth klaar is.
huidigeBezitAantallen();
if (heeftProfiel()) {
  setTimeout(() => { registreerSociaalProfiel().then(volgBeheerWijzigingen); laadOnlineBezitVoorEigenProfiel(); }, 0);
}


// ================================================================
// ACCOUNT: UITLOGGEN EN VERWIJDEREN (knoppen in "Jouw profiel")
// ================================================================

// Uitloggen/verwijderen zijn er alleen voor een gewoon speler-account (niet voor de beheerder).
document.getElementById('btn-profiel-badge').addEventListener('click', () => {
  // Gebaseerd op dit apparaat (niet op Firebase, dat je login pas een moment na het laden herstelt).
  const isSpeler = !!accountUid();
  document.getElementById('btn-profiel-uitloggen').hidden = !(isSpeler || isBeheerAccount(auth.currentUser));
  document.getElementById('btn-profiel-verwijderen').hidden = !isSpeler;
  document.getElementById('profiel-verwijder-paneel').hidden = true;
  document.getElementById('profiel-verwijder-fout').textContent = '';
  document.getElementById('input-profiel-verwijder-ww').value = '';
});

document.getElementById('btn-profiel-uitloggen').addEventListener('click', () => {
  if (!accountUid() && isBeheerAccount(auth.currentUser)) { auth.signOut().then(() => location.reload()); return; }
  if (!confirm('Uitloggen? Je gegevens blijven veilig bewaard. Log later weer in met je gebruikersnaam en wachtwoord.')) return;
  syncAccountData().then(() => auth.signOut()).then(() => {
    wisLokaalAccount();   // het apparaat onthoudt wel welke accounts hier zijn gemaakt
    location.reload();
  }).catch(() => alert('Uitloggen is niet gelukt. Probeer het opnieuw.'));
});

document.getElementById('btn-profiel-verwijderen').addEventListener('click', () => {
  const paneel = document.getElementById('profiel-verwijder-paneel');
  paneel.hidden = !paneel.hidden;
  document.getElementById('profiel-verwijder-fout').textContent = '';
});

document.getElementById('btn-profiel-verwijder-bevestig').addEventListener('click', () => {
  const user = auth.currentUser;
  const fout = document.getElementById('profiel-verwijder-fout');
  const knop = document.getElementById('btn-profiel-verwijder-bevestig');
  const ww = document.getElementById('input-profiel-verwijder-ww').value;
  fout.textContent = '';
  if (!isSpelerAccount(user)) { fout.textContent = 'Je login wordt nog hersteld. Probeer het over een paar seconden opnieuw.'; return; }
  if (!ww) { fout.textContent = 'Vul je wachtwoord in.'; return; }
  if (!confirm('Weet je het zeker? Je account, je vrienden, je chats en de quizzen die je zelf hebt gemaakt worden voorgoed verwijderd, ook uit Firebase. Dit kan niet ongedaan worden gemaakt.')) return;
  knop.disabled = true;
  accountWordtVerwijderd = true;
  const uid = user.uid;
  const naam = huidigeMakerNaam() || '';
  const vrienden = Object.keys(socialeVrienden || {});
  const verzoeken = Object.keys(socialeVerzoeken || {});
  // Quizzen die je zelf hebt gemaakt (gedeelde quizzen van anderen blijven bij de maker staan).
  let eigenGemaakt = [];
  try { eigenGemaakt = (JSON.parse(localStorage.getItem('eigenQuizzen') || '[]') || []).filter(q => q && q.code && !q.gedeeldVan); } catch (e) {}
  user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email, ww)).then(() => {
    // Welke gebruikersnamen zijn echt van dit account? (alleen die mogen we weghalen)
    return db.ref(SOCIAAL_PROFIEL_PAD + '/' + uid).once('value').then(p => {
      const prof = p.val() || {};
      const sleutels = [prof.gebruikersnaamZoek, naam ? normaliseerGebruikersnaam(naam) : ''].filter(Boolean).map(naamSleutel);
      const uniek = Array.from(new Set(sleutels));
      return Promise.all(uniek.map(k => db.ref('gebruikersnamen/' + k).once('value').then(sn => (sn.val() === uid ? k : null)).catch(() => null)))
        .then(oud => ({ nieuw: uniek, oud: oud.filter(Boolean) }));
    });
  }).then(naamSleutels => {
    const updates = {};
    vrienden.forEach(f => { updates['vrienden/' + f + '/' + uid] = null; updates['vrienden/' + uid + '/' + f] = null; });
    verzoeken.forEach(f => { updates['vriendschapsverzoeken/' + uid + '/' + f] = null; });
    updates['accountData/' + uid] = null;
    updates['beheerders/' + uid] = null;
    updates['gebruikers/' + uid] = null;
    naamSleutels.nieuw.forEach(k => { updates['namen/' + k + '/' + uid] = null; });
    naamSleutels.oud.forEach(k => { updates['gebruikersnamen/' + k] = null; });
    vrienden.forEach(f => { updates['chats/' + chatIdVoor(uid, f)] = null; });
    eigenGemaakt.forEach(q => { updates['quizzen/' + q.code] = null; updates['sessies/' + q.code] = null; });
    return db.ref().update(updates);
  }).then(() => user.delete()).then(() => {
    beheerUitloggenLos();
    wisLokaalAccount();
    verwijderApparaatAccount(uid);   // alleen na verwijderen is er weer ruimte voor een nieuw account
    location.reload();
  }).catch(err => {
    knop.disabled = false;
    accountWordtVerwijderd = false;
    const c = err && err.code;
    fout.textContent = (c === 'auth/wrong-password' || c === 'auth/invalid-credential' || c === 'auth/invalid-login-credentials')
      ? 'Verkeerd wachtwoord.' : accountFoutTekst(err);
  });
});


// ================================================================
// SITEBEHEER: ALLE PROFIELEN BEKIJKEN EN VERWIJDEREN
// (vakje "Sitebeheer" naast "Profiel", alleen zichtbaar voor sitebeheer)
// ================================================================

function werkBeheerNavBij() {
  const knop = document.getElementById('nav-sitebeheer');
  if (knop) knop.hidden = !sitebeheerActief;
  if (!sitebeheerActief) {
    const o = document.getElementById('beheer-profielen-overlay');
    if (o) o.classList.remove('actief');
  }
}

let beheerProfielen = [];   // [{uid, naam, dier}]

function bouwBeheerProfielenHtml(zoek) {
  const term = (zoek || '').trim().toLowerCase();
  const eigen = auth.currentUser ? auth.currentUser.uid : null;
  const lijst = term ? beheerProfielen.filter(p => p.naam.toLowerCase().includes(term)) : beheerProfielen;
  if (beheerProfielen.length === 0) return '<p class="voortgang">Er zijn nog geen profielen.</p>';
  if (lijst.length === 0) return '<p class="sitebeheer-makers-leeg">Geen profiel gevonden voor "' + escapeHtml(zoek.trim()) + '".</p>';
  return lijst.map(p => {
    const isIk = p.uid === eigen || p.uid === accountUid();
    return '<div class="vriend-rij">' +
      '<span class="vriend-mini-poppetje" aria-hidden="true">' + (p.beheer ? BEHEER_LOGO_HTML : (p.dier ? escapeHtml(p.dier) : '👤')) + '</span>' +
      '<strong>' + escapeHtml(p.naam) + '</strong>' + (p.beheer ? '<span class="subtitel"> Sitebeheer</span>' : '') +
      '<div class="beheer-knoppen">' +
      '<button type="button" class="btn btn-secondary beheer-profiel-bezoek" data-uid="' + escapeHtml(p.uid) + '">👀 Bezoeken</button>' +
      '<button type="button" class="btn btn-secondary beheer-profiel-naam" data-uid="' + escapeHtml(p.uid) + '">✏️ Naam</button>' +
      '<button type="button" class="btn btn-secondary beheer-profiel-poppetje" data-uid="' + escapeHtml(p.uid) + '">🎨 Poppetje</button>' +
      '<button type="button" class="btn btn-secondary beheer-profiel-extradraai" data-uid="' + escapeHtml(p.uid) + '">🎡 Extra draai</button>' +
      (isIk ? '' : '<button type="button" class="btn btn-secondary beheer-profiel-verwijder" data-uid="' + escapeHtml(p.uid) + '">🗑 Verwijderen</button>') +
      '</div>' +
      '</div>';
  }).join('');
}

function toonBeheerProfielen() {
  const rijen = document.getElementById('beheer-profielen-lijst');
  const zoek = document.getElementById('input-beheer-zoek');
  rijen.innerHTML = bouwBeheerProfielenHtml(zoek.value);
  document.getElementById('beheer-profielen-aantal').textContent = beheerProfielen.length;
}

function laadBeheerProfielen() {
  const rijen = document.getElementById('beheer-profielen-lijst');
  const fout = document.getElementById('beheer-profielen-fout');
  fout.textContent = '';
  rijen.innerHTML = '<p class="voortgang">Profielen laden...</p>';
  Promise.all([
    db.ref(SOCIAAL_PROFIEL_PAD).once('value'),
    db.ref('beheerders').once('value').catch(() => null)
  ]).then(([snap, bsnap]) => {
    const data = snap.val() || {};
    const beheerders = (bsnap && bsnap.val()) || {};
    Object.keys(beheerders).forEach(u => { if (beheerders[u] === true) beheerCache[u] = { waarde: true, tijd: Date.now() }; });
    beheerProfielen = Object.keys(data)
      .filter(uid => data[uid] && data[uid].gebruikersnaam)
      .map(uid => ({ uid: uid, naam: String(data[uid].gebruikersnaam), dier: data[uid].dier || '', beheer: beheerders[uid] === true }))
      .sort((a, b) => a.naam.localeCompare(b.naam, 'nl', { sensitivity: 'base' }));
    toonBeheerProfielen();
  }).catch(err => {
    rijen.innerHTML = '';
    fout.textContent = accountFoutTekst(err);
  });
}

// Haalt een profiel van een ander helemaal uit Firebase. Het apparaat van die persoon merkt
// dit vanzelf en logt uit; daarna kan die persoon op dat apparaat weer een nieuw account maken.
function verwijderProfielAlsBeheer(uid) {
  const profiel = beheerProfielen.find(p => p.uid === uid);
  if (!profiel) return Promise.resolve();
  const fout = document.getElementById('beheer-profielen-fout');
  fout.textContent = '';
  if (!confirm('Profiel "' + profiel.naam + '" voorgoed verwijderen?\n\nHet account, de vrienden, de chats en de quizzen van deze persoon worden uit Firebase gehaald. Dit kan niet ongedaan worden gemaakt.')) return Promise.resolve();

  const lees = pad => db.ref(pad).once('value').catch(() => null);
  return Promise.all([
    lees(SOCIAAL_PROFIEL_PAD + '/' + uid),
    lees('vrienden/' + uid),
    lees('accountData/' + uid),
    lees('vriendschapsverzoeken')
  ]).then(([prof, vrienden, accData, verzoeken]) => {
    const p = (prof && prof.val()) || {};
    const updates = {};
    // gebruikersnamen die echt van dit profiel zijn
    const sleutels = Array.from(new Set([p.gebruikersnaamZoek, normaliseerGebruikersnaam(profiel.naam)].filter(Boolean).map(naamSleutel)));
    return Promise.all(sleutels.map(k => lees('gebruikersnamen/' + k).then(sn => (sn && sn.val() === uid ? k : null)))).then(eigenSleutels => {
      eigenSleutels.filter(Boolean).forEach(k => { updates['gebruikersnamen/' + k] = null; });
      sleutels.forEach(k => { updates['namen/' + k + '/' + uid] = null; });
      // vrienden, chats en verzoeken
      Object.keys((vrienden && vrienden.val()) || {}).forEach(f => {
        updates['vrienden/' + f + '/' + uid] = null;
        updates['vrienden/' + uid + '/' + f] = null;
        updates['chats/' + chatIdVoor(uid, f)] = null;
      });
      const alleVerzoeken = (verzoeken && verzoeken.val()) || {};
      Object.keys(alleVerzoeken).forEach(ontvanger => {
        if (ontvanger === uid) updates['vriendschapsverzoeken/' + uid] = null;
        else if (alleVerzoeken[ontvanger] && alleVerzoeken[ontvanger][uid] !== undefined) updates['vriendschapsverzoeken/' + ontvanger + '/' + uid] = null;
      });
      // quizzen die deze persoon zelf heeft gemaakt (gedeelde quizzen van anderen blijven staan)
      try {
        const eq = JSON.parse(((accData && accData.val()) || {}).eigenQuizzen || '[]') || [];
        eq.filter(q => q && q.code && !q.gedeeldVan).forEach(q => { updates['quizzen/' + q.code] = null; updates['sessies/' + q.code] = null; });
      } catch (e) {}
      updates['accountData/' + uid] = null;
      updates['beheerders/' + uid] = null;
      updates[SOCIAAL_PROFIEL_PAD + '/' + uid] = null;
      return db.ref().update(updates);
    });
  }).then(() => {
    beheerProfielen = beheerProfielen.filter(x => x.uid !== uid);
    toonBeheerProfielen();
  }).catch(err => { fout.textContent = accountFoutTekst(err); });
}

function openBeheerProfielen() {
  if (!sitebeheerActief) return;
  document.getElementById('input-beheer-zoek').value = '';
  if (typeof kiesBeheerTab === 'function') kiesBeheerTab('profielen');
  document.getElementById('beheer-profielen-overlay').classList.add('actief');
  laadBeheerProfielen();
}

// Sitebeheer geeft iemand een extra draai aan het geluksrad (telt op; wordt bij draaien 1 minder).
function geefExtraWielDraai(knop) {
  const uid = knop.dataset.uid;
  const p = beheerProfielen.find(x => x.uid === uid);
  const naam = p ? p.naam : 'deze persoon';
  if (!confirm('Wil je ' + naam + ' een extra draai aan het geluksrad geven?')) return;
  knop.disabled = true;
  db.ref('accountData/' + uid + '/wielExtraDraaien').transaction(huidig => {
    const n = parseInt(huidig, 10);
    return String((n > 0 ? n : 0) + 1);
  }).then(res => {
    knop.disabled = false;
    alert('🎡 ' + naam + ' heeft nu ' + res.snapshot.val() + ' extra ' + (parseInt(res.snapshot.val(), 10) === 1 ? 'draai' : 'draaien') + '.');
  }).catch(err => {
    knop.disabled = false;
    alert('Extra draai geven is niet gelukt: ' + accountFoutTekst(err));
  });
}

document.getElementById('beheer-profielen-sluiten').addEventListener('click', () => {
  document.getElementById('beheer-profielen-overlay').classList.remove('actief');
});
document.getElementById('input-beheer-zoek').addEventListener('input', toonBeheerProfielen);
document.getElementById('beheer-profielen-lijst').addEventListener('click', e => {
  const bezoek = e.target.closest('.beheer-profiel-bezoek');
  if (bezoek) { bezoekProfiel(bezoek.dataset.uid); return; }
  const naamKnop = e.target.closest('.beheer-profiel-naam');
  if (naamKnop) { wijzigNaamAlsBeheer(naamKnop); return; }
  const popKnop = e.target.closest('.beheer-profiel-poppetje');
  if (popKnop) { openBeheerPoppetje(popKnop.dataset.uid); return; }
  const extraKnop = e.target.closest('.beheer-profiel-extradraai');
  if (extraKnop) { geefExtraWielDraai(extraKnop); return; }
  const knop = e.target.closest('.beheer-profiel-verwijder');
  if (!knop) return;
  knop.disabled = true;
  verwijderProfielAlsBeheer(knop.dataset.uid).then(() => { knop.disabled = false; });
});
document.getElementById('nav-sitebeheer').addEventListener('click', openBeheerProfielen);
werkBeheerNavBij();

// Is JOUW profiel door sitebeheer verwijderd terwijl je de site open hebt? Dan merk je dat meteen
// (en niet pas bij de controle om de 20 seconden) en wordt je uitgelogd; daarna mag je op dit
// apparaat weer een nieuw account maken (zie verwijderdAccountOpruimen).
(function bewaakEigenProfiel() {
  let luisterUid = null, gezien = false, ref = null;
  setInterval(() => {
    const uid = accountUid();
    const u = auth.currentUser;
    if (!uid || !u || u.uid !== uid || u.isAnonymous) {
      if (ref) { ref.off(); ref = null; luisterUid = null; gezien = false; }
      return;
    }
    if (luisterUid === uid) return;
    if (ref) ref.off();
    luisterUid = uid; gezien = false;
    ref = db.ref(SOCIAAL_PROFIEL_PAD + '/' + uid + '/gebruikersnaam');
    ref.on('value', snap => {
      if (snap.exists()) { gezien = true; return; }
      if (gezien && !accountWordtVerwijderd && !accountWeg) {
        accountIsVerdwenen().then(weg => { if (weg) verwijderdAccountOpruimen(); }).catch(() => {});
      }
    }, () => {});
  }, 2000);
})();


// ================================================================
// SITEBEHEER: EEN PROFIEL BEZOEKEN (quizzen van die persoon bekijken, aanpassen en verwijderen)
// ================================================================

let bezoekProfiel_ = null;   // {uid, naam}


// ---------- Sitebeheer: naam en poppetje van iemand anders aanpassen ----------
let beheerNaamUid = '';

function wijzigNaamAlsBeheer(knop) {
  if (!sitebeheerActief) return;
  const p = beheerProfielen.find(x => x.uid === knop.dataset.uid);
  if (!p) return;
  beheerNaamUid = p.uid;
  document.getElementById('beheer-naam-titel').textContent = 'Naam van ' + p.naam + ' wijzigen';
  const invoer = document.getElementById('input-beheer-naam');
  invoer.value = p.naam;
  document.getElementById('beheer-naam-status').textContent = '';
  document.getElementById('btn-beheer-naam-opslaan').disabled = false;
  document.getElementById('beheer-naam-overlay').classList.add('actief');
  setTimeout(() => { invoer.focus(); invoer.select(); }, 50);
}

function slaBeheerNaamOp() {
  const uid = beheerNaamUid;
  const p = beheerProfielen.find(x => x.uid === uid);
  const status = document.getElementById('beheer-naam-status');
  const knop = document.getElementById('btn-beheer-naam-opslaan');
  status.textContent = '';
  if (!sitebeheerActief || !p) { status.textContent = 'Je bent geen sitebeheer meer, of dit profiel bestaat niet meer.'; return; }
  const nieuweNaam = String(document.getElementById('input-beheer-naam').value || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  if (!nieuweNaam) { status.textContent = 'Vul een gebruikersnaam in.'; return; }
  if (nieuweNaam === p.naam) { status.textContent = 'Dit is al de naam.'; return; }
  const oudeNaam = p.naam;
  const nieuweZoek = normaliseerGebruikersnaam(nieuweNaam);
  const oudeZoek = normaliseerGebruikersnaam(oudeNaam);
  knop.disabled = true;
  status.textContent = 'Bezig...';
  const stap = (naam, belofte) => Promise.resolve(belofte).catch(err => { if (err && !err.stap) err.stap = naam; throw err; });

  stap('namen', nieuweZoek === oudeZoek ? null : naamRegistreer(uid, nieuweZoek))
    .then(() => stap('profiel (gebruikers/' + uid + ')', db.ref(SOCIAAL_PROFIEL_PAD + '/' + uid).update({
      gebruikersnaam: nieuweNaam,
      gebruikersnaamZoek: nieuweZoek,
      beheerTijd: firebase.database.ServerValue.TIMESTAMP
    })))
    .then(() => (oudeZoek && oudeZoek !== nieuweZoek) ? naamVrijgeven(uid, oudeZoek).catch(() => {}) : null)
    .then(() => {
      // De naam is nu veranderd. De rest is netjes bijwerken; mislukt dat, dan blijft de naam toch veranderd.
      return Promise.all([
        db.ref('vrienden/' + uid).once('value').catch(() => null),
        db.ref('gebruikerGroepen/' + uid).once('value').catch(() => null),
        db.ref('accountData/' + uid + '/eigenQuizzen').once('value').catch(() => null)
      ]).then(([vs, gs, qs]) => {
        const upd = {};
        if (vs) Object.keys(vs.val() || {}).forEach(f => { upd['vrienden/' + f + '/' + uid + '/gebruikersnaam'] = nieuweNaam; });
        if (gs) Object.keys(gs.val() || {}).forEach(g => { upd['groepen/' + g + '/leden/' + uid] = nieuweNaam; });
        const taken = [];
        if (Object.keys(upd).length) taken.push(db.ref().update(upd).catch(() => {}));
        let quizzen = [];
        try { quizzen = JSON.parse((qs && qs.val()) || '[]'); } catch (e) {}
        quizzen.filter(q => q && q.code && !q.gedeeldVan).forEach(q => {
          taken.push(db.ref('quizzen/' + q.code).once('value').then(snap => {
            if (!snap.child('titel').exists()) return null;
            const huidig = snap.child('makerNaam').val();
            if (!huidig || huidig === oudeNaam) return db.ref('quizzen/' + q.code + '/makerNaam').set(nieuweNaam);
            return null;
          }).catch(() => {}));
        });
        return Promise.all(taken);
      }).catch(() => {});
    })
    .then(() => {
      knop.disabled = false;
      p.naam = nieuweNaam;
      beheerProfielen.sort((a, b) => a.naam.localeCompare(b.naam, 'nl', { sensitivity: 'base' }));
      toonBeheerProfielen();
      document.getElementById('beheer-naam-titel').textContent = 'Naam van ' + nieuweNaam + ' wijzigen';
      status.textContent = '✓ De naam is veranderd in "' + nieuweNaam + '".';
    })
    .catch(err => {
      knop.disabled = false;
      const code = err && (err.code || err.message) ? ' (' + (err.code || err.message) + ')' : '';
      const rechten = String((err && (err.code || err.message)) || '').toUpperCase().indexOf('PERMISSION') !== -1;
      status.textContent = 'Naam wijzigen is mislukt bij "' + ((err && err.stap) || 'onbekend') + '"' + code + '.' +
        (rechten ? ' Firebase weigert dit: publiceer de nieuwste regels uit firebase-rules.json en controleer dat dit account echt sitebeheer is.' : '');
    });
}
document.getElementById('btn-beheer-naam-opslaan').addEventListener('click', slaBeheerNaamOp);
document.getElementById('input-beheer-naam').addEventListener('keydown', e => { if (e.key === 'Enter') slaBeheerNaamOp(); });
document.getElementById('btn-beheer-naam-sluiten').addEventListener('click', () => {
  document.getElementById('beheer-naam-overlay').classList.remove('actief');
});

let beheerPopUid = '';
let beheerPopConcept = null;
let beheerPopTab = 'dieren';

function openBeheerPoppetje(uid) {
  if (!sitebeheerActief) return;
  const p = beheerProfielen.find(x => x.uid === uid);
  if (!p) return;
  beheerPopUid = uid; beheerPopTab = 'dieren'; beheerPopConcept = null;
  document.getElementById('beheer-poppetje-titel').textContent = 'Poppetje van ' + p.naam;
  document.getElementById('beheer-poppetje-fout').textContent = '';
  document.getElementById('beheer-poppetje-overlay').classList.add('actief');
  db.ref(SOCIAAL_PROFIEL_PAD + '/' + uid).once('value').then(snap => {
    const v = snap.val() || {};
    beheerPopConcept = { dier: geldigDier(v.dier) || DIEREN[0], acc: geldigeAccessoires(v.accessoires || {}) };
    bouwBeheerPoppetje();
  }).catch(err => { document.getElementById('beheer-poppetje-fout').textContent = accountFoutTekst(err); });
}

function bouwBeheerPoppetje() {
  const k = beheerPopConcept;
  if (!k) return;
  document.getElementById('beheer-poppetje-voorbeeld').innerHTML = poppetjeSvg(k.dier, k.acc);
  const tabs = document.getElementById('beheer-poppetje-tabs');
  tabs.innerHTML = '';
  [{ id: 'dieren', naam: 'Dieren' }].concat(ACCESSOIRE_GROEPEN.map(gr => ({ id: gr.plek, naam: PE_TAB_NAMEN[gr.plek] || gr.titel }))).forEach(t => {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'pe-tab' + (t.id === beheerPopTab ? ' actief' : '');
    knop.innerHTML = '<span class="pe-tab-icoon">' + PE_TAB_ICONEN[t.id] + '</span><span>' + t.naam + '</span>';
    knop.addEventListener('click', () => { beheerPopTab = t.id; bouwBeheerPoppetje(); });
    tabs.appendChild(knop);
  });
  const raster = document.getElementById('beheer-poppetje-raster');
  raster.innerHTML = '';
  if (beheerPopTab === 'dieren') {
    DIEREN.forEach(d => {
      raster.appendChild(peKaart(poppetjeSvg(d, k.acc), '', d === k.dier, () => { k.dier = d; bouwBeheerPoppetje(); }));
    });
  } else {
    const groep = ACCESSOIRE_GROEPEN.find(gr => gr.plek === beheerPopTab);
    if (groep) {
      const zonder = Object.assign({}, k.acc); delete zonder[groep.plek];
      raster.appendChild(peKaart(poppetjeSvg(k.dier, zonder), 'Geen', !k.acc[groep.plek], () => { delete k.acc[groep.plek]; bouwBeheerPoppetje(); }));
      groep.items.forEach(emoji => {
        const proef = Object.assign({}, k.acc); proef[groep.plek] = emoji;
        raster.appendChild(peKaart(poppetjeSvg(k.dier, proef), (ACCESSOIRES[emoji] && ACCESSOIRES[emoji].naam) || '', k.acc[groep.plek] === emoji, () => { k.acc[groep.plek] = emoji; bouwBeheerPoppetje(); }));
      });
    }
  }
}

function slaBeheerPoppetjeOp() {
  const k = beheerPopConcept;
  const uid = beheerPopUid;
  const fout = document.getElementById('beheer-poppetje-fout');
  const knop = document.getElementById('btn-beheer-poppetje-opslaan');
  if (!sitebeheerActief || !k || !uid) return;
  fout.textContent = '';
  knop.disabled = true;
  const acc = geldigeAccessoires(k.acc);
  // Wat je kiest komt ook bij die persoon in de verzameling (minstens 1 van elk).
  const items = [['dieren', k.dier]].concat(Object.keys(acc).map(plek => ['accessoires', acc[plek]]));
  Promise.all(items.map(([soort, item]) => {
    const r = db.ref(SOCIAAL_PROFIEL_PAD + '/' + uid + '/bezit/' + soort + '/' + item);
    return r.once('value').then(sn => (Number(sn.val()) > 0 ? null : r.set(1)));
  }))
    .then(() => db.ref(SOCIAAL_PROFIEL_PAD + '/' + uid).update({
      dier: k.dier,
      accessoires: acc,
      beheerTijd: firebase.database.ServerValue.TIMESTAMP
    }))
    .then(() => {
      knop.disabled = false;
      const p = beheerProfielen.find(x => x.uid === uid);
      if (p) { p.dier = k.dier; toonBeheerProfielen(); }
      fout.textContent = '✓ Poppetje opgeslagen';
    })
    .catch(err => {
      knop.disabled = false;
      const code = err && err.code ? ' (' + err.code + ')' : '';
      fout.textContent = 'Opslaan is mislukt' + code + '. Controleer of de nieuwste Firebase-regels zijn gepubliceerd.';
    });
}
document.getElementById('btn-beheer-poppetje-opslaan').addEventListener('click', slaBeheerPoppetjeOp);
document.getElementById('btn-beheer-poppetje-sluiten').addEventListener('click', () => {
  document.getElementById('beheer-poppetje-overlay').classList.remove('actief');
});

// Heeft sitebeheer jouw naam of poppetje veranderd, dan neem je dat over (en overschrijf je het niet meer).
const BEHEER_TIJD_GEZIEN_SLEUTEL = 'beheerTijdGezien';
let beheerWijzigingRef = null;
let beheerWijzigingUid = '';
function neemBeheerWijzigingOver(p) {
  if (!p || !p.beheerTijd) return false;
  if (Number(p.beheerTijd) <= Number(localStorage.getItem(BEHEER_TIJD_GEZIEN_SLEUTEL) || 0)) return false;
  localStorage.setItem(BEHEER_TIJD_GEZIEN_SLEUTEL, String(p.beheerTijd));
  if (p.gebruikersnaam) localStorage.setItem(MAKER_NAAM_SLEUTEL, String(p.gebruikersnaam));
  if (geldigDier(p.dier)) localStorage.setItem(PROFIEL_DIER_SLEUTEL, p.dier);
  localStorage.setItem(PROFIEL_ACCESSOIRES_SLEUTEL, JSON.stringify(geldigeAccessoires(p.accessoires || {})));
  socialeNamenCache = null;
  try { werkProfielBadgeBij(); werkProfielPoppetjeWeergaveBij(); werkProfielOverlayNaamBij(); bouwVerzamelingKiezer(); } catch (e) {}
  return true;
}
function volgBeheerWijzigingen() {
  const g = profielFirebaseGebruiker();
  if (!g || g.bezoek || !heeftProfiel()) return;
  if (beheerWijzigingRef && beheerWijzigingUid === g.uid) return;
  if (beheerWijzigingRef) beheerWijzigingRef.off();
  beheerWijzigingUid = g.uid;
  beheerWijzigingRef = db.ref(SOCIAAL_PROFIEL_PAD + '/' + g.uid);
  beheerWijzigingRef.on('value', snap => { neemBeheerWijzigingOver(snap.val()); }, () => {});
}

function bezoekProfiel(uid) {
  const p = beheerProfielen.find(x => x.uid === uid);
  if (!p || !sitebeheerActief) return;
  startBezoekModus(uid, p.naam).catch(err => alert('Bezoeken is niet gelukt: ' + (err && err.message ? err.message : accountFoutTekst(err))));
}

// Laadt het hele account van die persoon op dit apparaat en herlaadt de site.
function startBezoekModus(uid, naam) {
  if (!sitebeheerActief) return Promise.resolve();
  return syncAccountData().catch(() => {}).then(() => Promise.all([
    db.ref('gebruikers/' + uid).once('value'),
    db.ref('accountData/' + uid).once('value')
  ])).then(([ps, as]) => {
    const p = ps.val();
    const d = as.val() || {};
    if (!p || !p.gebruikersnaam) throw new Error('Dit profiel bestaat niet meer.');
    // Eerst een reserve-kopie van je eigen gegevens (alleen bij het eerste bezoek).
    if (!bezoekUid()) {
      const backup = {};
      ACCOUNT_LOKALE_SLEUTELS.forEach(k => { backup[k] = localStorage.getItem(k); });
      localStorage.setItem(BEZOEK_BACKUP_SLEUTEL, JSON.stringify(backup));
    }
    const zet = (k, v) => origineleSetItem.call(localStorage, k, v);
    ACCOUNT_LOKALE_SLEUTELS.forEach(k => localStorage.removeItem(k));
    ACCOUNT_DATA_SLEUTELS.forEach(k => { if (typeof d[k] === 'string') zet(k, d[k]); });
    zet(MAKER_NAAM_SLEUTEL, p.gebruikersnaam);
    zet(ACCOUNT_UID_SLEUTEL, uid);
    if (p.dier) zet(PROFIEL_DIER_SLEUTEL, p.dier);
    if (p.accessoires) zet(PROFIEL_ACCESSOIRES_SLEUTEL, JSON.stringify(p.accessoires));
    const b = p.bezit || {};
    const dieren = [], accessoires = [], aantallen = {};
    Object.entries(b.dieren || {}).forEach(([item, n]) => { if (geldigDier(item) && Number(n) > 0) { dieren.push(item); aantallen['dier:' + item] = Number(n); } });
    Object.entries(b.accessoires || {}).forEach(([item, n]) => { if (ACCESSOIRES[item] && Number(n) > 0) { accessoires.push(item); aantallen['accessoire:' + item] = Number(n); } });
    if (dieren.length) zet(BEZIT_DIEREN_SLEUTEL, JSON.stringify(dieren));
    if (accessoires.length) zet(BEZIT_ACCESSOIRES_SLEUTEL, JSON.stringify(accessoires));
    if (Object.keys(aantallen).length) zet(BEZIT_AANTALLEN_SLEUTEL, JSON.stringify(aantallen));
    zet(BEZOEK_SLEUTEL, JSON.stringify({ uid: uid, naam: p.gebruikersnaam }));
    location.reload();
  });
}

// Alles wat je deed is al bij die persoon opgeslagen. Hier komen je eigen gegevens terug.
function stopBezoekModus() {
  const knop = document.getElementById('btn-bezoek-stop');
  if (knop) knop.disabled = true;
  syncAccountData().catch(() => {}).then(() => {
    let backup = {};
    try { backup = JSON.parse(localStorage.getItem(BEZOEK_BACKUP_SLEUTEL) || '{}') || {}; } catch (e) {}
    ACCOUNT_LOKALE_SLEUTELS.forEach(k => localStorage.removeItem(k));
    ACCOUNT_LOKALE_SLEUTELS.forEach(k => { if (typeof backup[k] === 'string') origineleSetItem.call(localStorage, k, backup[k]); });
    localStorage.removeItem(BEZOEK_SLEUTEL);
    localStorage.removeItem(BEZOEK_BACKUP_SLEUTEL);
    location.reload();
  });
}

(function toonBezoekBalk() {
  const b = bezoekInfo();
  if (!b) return;
  document.body.classList.add('bezoek-modus');
  const balk = document.createElement('div');
  balk.className = 'bezoek-balk';
  const tekst = document.createElement('span');
  tekst.textContent = '👁 Je bekijkt het account van ' + b.naam + ' · alles wat je doet gebeurt in dit account';
  const stop = document.createElement('button');
  stop.id = 'btn-bezoek-stop'; stop.type = 'button'; stop.textContent = 'Stoppen';
  stop.addEventListener('click', stopBezoekModus);
  balk.append(tekst, stop);
  document.body.appendChild(balk);
  // Uitloggen en verwijderen horen bij jouw eigen account, niet bij het bezochte account.
  document.getElementById('btn-profiel-badge').addEventListener('click', () => {
    document.getElementById('btn-profiel-uitloggen').hidden = true;
    document.getElementById('btn-profiel-verwijderen').hidden = true;
    document.getElementById('profiel-verwijder-paneel').hidden = true;
  });
})();

document.getElementById('btn-beheer-bezoek-terug').addEventListener('click', () => {
  bezoekProfiel_ = null;
  toonScherm('scherm-algemeen');
  openBeheerProfielen();
});

function laadBezoekQuizzen() {
  const lijstEl = document.getElementById('lijst-bezoek-quizzen');
  const kopEl = document.getElementById('beheer-bezoek-kop');
  if (!bezoekProfiel_) { lijstEl.innerHTML = ''; return; }
  const { uid, naam } = bezoekProfiel_;
  kopEl.textContent = 'Quizzen van ' + naam;
  lijstEl.innerHTML = '<p class="voortgang">Quizzen laden...</p>';

  // Codes uit het account van die persoon + quizzen waar zijn/haar naam als maker bij staat.
  const uitAccount = db.ref('accountData/' + uid + '/eigenQuizzen').once('value').then(sn => {
    try { return (JSON.parse(sn.val() || '[]') || []).filter(q => q && q.code && !q.gedeeldVan).map(q => q.code); } catch (e) { return []; }
  }).catch(() => []);
  // Alle quizzen doorlopen (ook niet-openbare): van deze persoon als de maker-uid klopt of de makernaam
  // (hoofdletters maken niet uit) overeenkomt. Zo vind je ook oudere quizzen zonder uid.
  const zoekNaam = normaliseerGebruikersnaam(naam);
  const opNaam = db.ref('quizzen').once('value').then(sn => {
    const alle = sn.val() || {};
    return Object.keys(alle).filter(c => {
      const q = alle[c] || {};
      return q.makerUid === uid || (q.makerNaam && normaliseerGebruikersnaam(q.makerNaam) === zoekNaam);
    });
  }).catch(() => []);

  Promise.all([uitAccount, opNaam]).then(([a, b]) => {
    const codes = Array.from(new Set(a.concat(b)));
    return Promise.all(codes.map(code => db.ref('quizzen/' + code).once('value').then(sn => (sn.val() ? { code: code, quiz: sn.val() } : null)).catch(() => null)));
  }).then(lijst => {
    if (!bezoekProfiel_ || bezoekProfiel_.uid !== uid) return;
    const quizzen = lijst.filter(Boolean);
    lijstEl.innerHTML = '';
    if (quizzen.length === 0) {
      lijstEl.innerHTML = '<p class="voortgang">' + escapeHtml(naam) + ' heeft nog geen quizzen gemaakt.</p>';
      return;
    }
    quizzen.forEach(({ code, quiz }) => {
      const item = document.createElement('div');
      item.className = 'quiz-item';

      const img = document.createElement('img');
      img.className = 'quiz-item-afbeelding';
      img.src = quiz.afbeelding || STANDAARD_OMSLAGEN[0].url;
      img.alt = quiz.titel || '';

      const body = document.createElement('div');
      body.className = 'quiz-item-body';
      const info = document.createElement('div');
      info.className = 'quiz-item-info';
      const aantal = Array.isArray(quiz.vragen) ? quiz.vragen.length : 0;
      info.innerHTML = '<strong>' + escapeHtml(quiz.titel || 'Zonder titel') + '</strong><span>' + aantal + ' vraag/vragen · ' + escapeHtml(code) +
        (quiz.openbaar ? ' · Openbaar' : '') + (quiz.geblokkeerd ? ' · Geblokkeerd' : '') + '</span>';

      const knoppen = document.createElement('div');
      knoppen.className = 'quiz-item-knoppen';

      const aanpassen = document.createElement('button');
      aanpassen.className = 'btn-aanpassen-quiz';
      aanpassen.textContent = 'Aanpassen';
      aanpassen.addEventListener('click', () => startBewerkenVanQuiz(code, 'scherm-beheer-bezoek'));

      const verwijder = document.createElement('button');
      verwijder.className = 'btn-verwijderen-quiz';
      verwijder.textContent = 'Verwijderen';
      verwijder.addEventListener('click', () => {
        if (!confirm('Quiz "' + (quiz.titel || code) + '" van ' + naam + ' voorgoed verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
        verwijder.disabled = true;
        db.ref('quizzen/' + code).remove()
          .then(() => db.ref('sessies/' + code).remove().catch(() => {}))
          .then(() => laadBezoekQuizzen())
          .catch(err => { verwijder.disabled = false; alert('Verwijderen mislukt: ' + accountFoutTekst(err)); });
      });

      knoppen.appendChild(aanpassen);
      knoppen.appendChild(verwijder);
      body.appendChild(info);
      body.appendChild(knoppen);
      item.appendChild(img);
      item.appendChild(body);
      lijstEl.appendChild(item);
    });
  }).catch(err => {
    lijstEl.innerHTML = '<p class="foutmelding">Laden mislukt: ' + escapeHtml(accountFoutTekst(err)) + '</p>';
  });
}


// ================================================================
// WACHTWOORD ZICHTBAAR MAKEN: een oogje bij elk wachtwoordveld
// ================================================================
(function oogjesBijWachtwoorden() {
  document.querySelectorAll('input[type="password"]').forEach(veld => {
    if (veld.parentNode.classList.contains('ww-wrap')) return;
    const wrap = document.createElement('span');
    wrap.className = 'ww-wrap';
    veld.parentNode.insertBefore(wrap, veld);
    wrap.appendChild(veld);

    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'ww-oog';
    knop.textContent = '👁';
    knop.setAttribute('aria-label', 'Wachtwoord tonen');
    knop.setAttribute('aria-pressed', 'false');
    knop.tabIndex = -1;
    // Niet het veld laten loslaten (anders verdwijnt op de telefoon het toetsenbord).
    knop.addEventListener('mousedown', e => e.preventDefault());
    knop.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    knop.addEventListener('click', () => {
      const zichtbaar = veld.type === 'password';
      veld.type = zichtbaar ? 'text' : 'password';
      knop.textContent = zichtbaar ? '🙈' : '👁';
      knop.setAttribute('aria-label', zichtbaar ? 'Wachtwoord verbergen' : 'Wachtwoord tonen');
      knop.setAttribute('aria-pressed', zichtbaar ? 'true' : 'false');
      veld.focus();
    });
    wrap.appendChild(knop);
  });
})();


// ================================================================
// SITEBEHEER: OVERZICHT VAN ALLE DIEREN EN ACCESSOIRES (zoals in de kisten)
// Dezelfde getekende poppetjes als in het kistenscherm, met de naam eronder.
// Alleen om te bekijken: dit verandert niets aan de lijsten van de site zelf.
// [emoji zoals de site hem gebruikt, naam om te tonen]
// ================================================================
const BEHEER_OVERZICHT_POPPETJES = [
  ["🐶", "Hond"],
  ["🐱", "Kat"],
  ["🐭", "Muis"],
  ["🐹", "Hamster"],
  ["🐰", "Konijn"],
  ["🦊", "Vos"],
  ["🐻", "Beer"],
  ["🐼", "Panda"],
  ["🐨", "Koala"],
  ["🐯", "Tijger"],
  ["🦁", "Leeuw"],
  ["🐮", "Koe"],
  ["🐷", "Varken"],
  ["🐸", "Kikker"],
  ["🐵", "Aap"],
  ["🐔", "Kip"],
  ["🐧", "Pinguïn"],
  ["🦄", "Eenhoorn"],
  ["🐺", "Vos"],
  ["🐲", "Draak"],
  ["🦡", "Das"],
  ["🦔", "Egel"],
  ["🐘", "Olifant"],
  ["⛄", "Sneeuwpop"],
  ["🦒", "Giraf"],
  ["🦓", "Zebra"],
  ["🦛", "Nijlpaard"],
  ["🦏", "Neushoorn"],
  ["🐑", "Schaap"],
  ["🐐", "Geit"],
  ["🐴", "Paard"],
  ["🫏", "Ezel"],
  ["🦆", "Kuiken"],
  ["🦉", "Uil"],
  ["🦇", "Vleermuis"],
  ["🐬", "Dolfijn"],
  ["🐳", "Walvis"],
  ["🐟", "Vis"],
  ["🐙", "Octopus"],
  ["🦀", "Krab"],
  ["🐢", "Schildpad"],
  ["🐍", "Slang"],
  ["🐊", "Krokodil"],
  ["🦋", "Vlinder"],
  ["🐝", "Bij"],
  ["🐞", "Lieveheersbeestje"],
  ["🐌", "Slak"],
  ["🕷️", "Spin"],
  ["🐿️", "Eekhoorn"],
  ["🐫", "Kameel"],
  ["🦙", "Lama"],
  ["🦌", "Hert"],
  ["🦝", "Wasbeer"],
  ["🦨", "Stinkdier"],
  ["🦥", "Luiaard"],
  ["🦦", "Otter"],
  ["🦘", "Kangaroe"],
  ["🦩", "Flamingo"],
  ["🦚", "Pauw"],
  ["🦜", "Papegaai"],
  ["🦢", "Zwaan"],
  ["🦈", "Haai"],
  ["🦭", "Zeehond"],
  ["🐻‍❄️", "IJsbeer"],
  ["🦃", "Kalkoen"],
  ["🦍", "Gorilla"],
  ["🦣", "Mammoet"],
  ["🦖", "Dino"],
  ["🤖", "Robot"],
  ["👻", "Spook"],
  ["👽", "Alien"],
  ["🎃", "Pompoen"]
];
const BEHEER_OVERZICHT_ACCESSOIRES = [
  ["🎩", "Goochelhoed"],
  ["👑", "Kroon"],
  ["🎓", "Afstudeerhoed"],
  ["🧢", "Pet"],
  ["🤠", "Cowboyhoed"],
  ["👒", "Strandhoed"],
  ["🎅", "Kerstmuts"],
  ["🎀", "Strikje"],
  ["🧙", "Toverhoed"],
  ["👷", "Helm"],
  ["🥳", "Feesthoedje"],
  ["😺", "Kattenoren"],
  ["😈", "Duivelsoren"],
  ["👼", "Engelenring"],
  ["🍄", "Paddenstoelhoed"],
  ["🍦", "Taarthoed"],
  ["👨‍🍳", "Koksmuts"],
  ["☠️", "Piratenhoed"],
  ["🚒", "Mijnwerkershelm"],
  ["🎧", "Oorwarmers"],
  ["👽", "Aliensprieten"],
  ["🕶️", "Zonnebril"],
  ["👓", "Bril"],
  ["🥽", "Duikbril"],
  ["🥸", "Snorbril"],
  ["🧐", "Monocle"],
  ["🤡", "Rode neus"],
  ["😍", "Hartjesbril"],
  ["🤩", "Sterrenogen"],
  ["🏴", "Piratenlapje"],
  ["🎭", "Masker"],
  ["❤️", "Hartje"],
  ["💖", "Hartje"],
  ["💙", "Hartje"],
  ["💚", "Hartje"],
  ["💛", "Hartje"],
  ["💜", "Hartje"],
  ["⭐", "Sterretje"],
  ["✨", "Sprankels"],
  ["🌸", "Bloem"],
  ["🔥", "Vlam"],
  ["💎", "Diamant"],
  ["🍀", "Klavertje"],
  ["🎈", "Ballon"],
  ["🍭", "Lolly"],
  ["🌈", "Regenboog"],
  ["☀️", "Zon"],
  ["🌙", "Maan"],
  ["⚡", "Bliksem"],
  ["🎵", "Muzieknoot"],
  ["🍓", "Aardbei"],
  ["🦋", "Vlinder"],
  ["❄️", "Sneeuwvlokje"],
  ["🎁", "Cadeautje"],
  ["🏆", "Trofee"],
  ["🍩", "Donut"],
  ["⚽", "Voetbal"],
  ["🎂", "Taart"],
  ["🧸", "Knuffelbeertje"]
];

function bouwBeheerTegels(lijst, soort) {
  return lijst.map(t => {
    let svg = '';
    try {
      if (soort === 'dier') {
        svg = poppetjeSvg(t[0], {});
      } else {
        const groep = ACCESSOIRE_GROEPEN.find(g => g.items.indexOf(t[0]) !== -1);
        const voorbeeld = {};
        if (groep) voorbeeld[groep.plek] = t[0];
        svg = poppetjeSvg(DIEREN[0], voorbeeld);
      }
    } catch (e) { svg = ''; }
    return '<div class="beheer-tegel"><span class="beheer-tegel-poppetje">' + (svg || escapeHtml(t[0])) + '</span>' +
      '<span class="beheer-tegel-naam">' + escapeHtml(t[1]) + '</span></div>';
  }).join('');
}

function vulBeheerOverzicht() {
  document.getElementById('beheer-dieren-aantal').textContent = BEHEER_OVERZICHT_POPPETJES.length;
  document.getElementById('beheer-accessoires-aantal').textContent = BEHEER_OVERZICHT_ACCESSOIRES.length;
  document.getElementById('beheer-dieren-raster').innerHTML = bouwBeheerTegels(BEHEER_OVERZICHT_POPPETJES, 'dier');
  document.getElementById('beheer-accessoires-raster').innerHTML = bouwBeheerTegels(BEHEER_OVERZICHT_ACCESSOIRES, 'accessoire');
}
vulBeheerOverzicht();


// ---------------- Sitebeheer: verdienlijst bewerken ----------------
let verdienConcept = null;   // wat je nu aan het bewerken bent (nog niet opgeslagen)

function vulVerdienEditor(forceer) {
  const doel = document.getElementById('verdien-editor');
  if (!doel) return;
  if (!forceer && verdienConcept) return;      // niet overschrijven terwijl je bezig bent
  verdienConcept = JSON.parse(JSON.stringify(verdienLijst));
  tekenVerdienEditor();
}

function tekenVerdienEditor() {
  const doel = document.getElementById('verdien-editor');
  if (!doel || !verdienConcept) return;
  doel.innerHTML = '';
  VERDIEN_SOORTEN.forEach(z => {
    const blok = document.createElement('div');
    blok.className = 'verdien-blok';
    const kop = document.createElement('h4');
    kop.textContent = z.titel;
    blok.appendChild(kop);
    const regels = verdienConcept[z.id] = verdienConcept[z.id] || [];
    if (!regels.length) {
      const leeg = document.createElement('p');
      leeg.className = 'subtitel';
      leeg.textContent = 'Geen regels: hier krijg je geen munten voor.';
      blok.appendChild(leeg);
    }
    regels.forEach((r, i) => {
      const rij = document.createElement('div');
      rij.className = 'verdien-rij';
      const l1 = document.createElement('span'); l1.textContent = 'Vanaf';
      const vanaf = document.createElement('input');
      vanaf.type = 'number'; vanaf.min = '1'; vanaf.value = r.vanaf; vanaf.className = 'verdien-getal'; vanaf.setAttribute('aria-label', 'Vanaf hoeveel vragen');
      vanaf.addEventListener('input', () => { r.vanaf = vanaf.value; });
      const l2 = document.createElement('span'); l2.textContent = 'vragen →';
      const munten = document.createElement('input');
      munten.type = 'number'; munten.min = '0'; munten.value = r.munten; munten.className = 'verdien-getal'; munten.setAttribute('aria-label', 'Aantal munten');
      munten.addEventListener('input', () => { r.munten = munten.value; });
      const l3 = document.createElement('span'); l3.textContent = '🪙';
      const weg = document.createElement('button');
      weg.type = 'button'; weg.className = 'btn btn-secondary verdien-weg'; weg.textContent = '🗑'; weg.title = 'Regel verwijderen';
      weg.addEventListener('click', () => { regels.splice(i, 1); tekenVerdienEditor(); });
      rij.append(l1, vanaf, l2, munten, l3, weg);
      blok.appendChild(rij);
    });
    const plus = document.createElement('button');
    plus.type = 'button'; plus.className = 'btn btn-secondary'; plus.textContent = '➕ Regel toevoegen';
    plus.addEventListener('click', () => {
      const laatste = regels.length ? regels[regels.length - 1] : null;
      regels.push({ vanaf: laatste ? (parseInt(laatste.vanaf, 10) || 0) + 5 : 1, munten: laatste ? (parseInt(laatste.munten, 10) || 0) + 10 : 5 });
      tekenVerdienEditor();
    });
    blok.appendChild(plus);
    doel.appendChild(blok);
  });
}

function slaVerdienLijstOp() {
  const fout = document.getElementById('verdien-fout');
  const knop = document.getElementById('btn-verdien-opslaan');
  fout.textContent = '';
  if (!sitebeheerActief || !verdienConcept) return;
  const data = { versie: 1 };
  let probleem = '';
  VERDIEN_SOORTEN.forEach(z => {
    const ruw = verdienConcept[z.id] || [];
    ruw.forEach(r => {
      const v = parseInt(r.vanaf, 10), m = parseInt(r.munten, 10);
      if (!(v >= 1) || !(m >= 0)) probleem = 'Vul bij "' + z.titel.replace(/^\S+\s/, '') + '" overal een aantal vragen (1 of meer) en een aantal munten (0 of meer) in.';
    });
    const schoon = schoonVerdienRegels(ruw);
    const gezien = {};
    schoon.forEach(r => { if (gezien[r.vanaf]) probleem = probleem || 'Bij "' + z.titel.replace(/^\S+\s/, '') + '" staat "vanaf ' + r.vanaf + ' vragen" twee keer.'; gezien[r.vanaf] = true; });
    data[z.id] = schoon;
  });
  if (probleem) { fout.textContent = probleem; return; }
  knop.disabled = true;
  db.ref('instellingen/verdienlijst').set(data).then(() => {
    verdienConcept = null;
    zetVerdienLijstUitData(data);
    vulVerdienEditor(true);
    fout.className = 'voortgang'; fout.textContent = '✅ Opgeslagen.';
    setTimeout(() => { if (fout.textContent === '✅ Opgeslagen.') { fout.textContent = ''; fout.className = 'foutmelding'; } }, 2500);
  }).catch(err => {
    fout.className = 'foutmelding';
    fout.textContent = 'Opslaan is mislukt' + (err && err.code ? ' (' + err.code + ')' : '') + '. Publiceer de nieuwste regels uit firebase-rules.json.';
  }).then(() => { knop.disabled = false; });
}

document.getElementById('btn-verdien-opslaan').addEventListener('click', slaVerdienLijstOp);
document.getElementById('btn-verdien-standaard').addEventListener('click', () => {
  if (!confirm('Terug naar de standaardlijst? (Daarna nog op Opslaan klikken.)')) return;
  verdienConcept = JSON.parse(JSON.stringify(VERDIEN_STANDAARD));
  tekenVerdienEditor();
});
vulVerdienEditor(true);

function kiesBeheerTab(tab) {
  const panes = { profielen: 'beheer-pane-profielen', overzicht: 'beheer-pane-overzicht', verdienen: 'beheer-pane-verdienen' };
  Object.keys(panes).forEach(t => {
    document.getElementById(panes[t]).hidden = t !== tab;
    document.getElementById('beheer-tab-' + t).classList.toggle('actief', t === tab);
  });
  if (tab === 'verdienen') vulVerdienEditor(false);
  const o = document.querySelector('#beheer-profielen-overlay .sitebeheer-venster');
  if (o) o.scrollTop = 0;
}
document.getElementById('beheer-tab-profielen').addEventListener('click', () => kiesBeheerTab('profielen'));
document.getElementById('beheer-tab-overzicht').addEventListener('click', () => kiesBeheerTab('overzicht'));
document.getElementById('beheer-tab-verdienen').addEventListener('click', () => kiesBeheerTab('verdienen'));
