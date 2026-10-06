// Talen en woordenlijsten.
// Elk woord heeft een vertaling in nl, en en fr.
// Een nieuwe taal toevoegen: voeg hem toe aan LANGUAGES en geef elk woord in LEVELS een extra sleutel.

export const LANGUAGES = {
  en: { name: "Engels", native: "English", flag: "🇬🇧", speech: "en-GB", helper: "nl", color: "#e8505b" },
  nl: { name: "Nederlands", native: "Nederlands", flag: "🇳🇱", speech: "nl-NL", helper: "en", color: "#f39c34" },
  fr: { name: "Frans", native: "Français", flag: "🇫🇷", speech: "fr-FR", helper: "nl", color: "#3b82f6" },
};

export const HELPER_NAMES = { nl: "Nederlands", en: "Engels" };

export const LEVELS = [
  {
    id: 1,
    title: "Begroetingen",
    icon: "👋",
    words: [
      { nl: "hallo", en: "hello", fr: "salut" },
      { nl: "doei", en: "goodbye", fr: "au revoir" },
      { nl: "dank je", en: "thank you", fr: "merci" },
      { nl: "alsjeblieft", en: "please", fr: "s'il te plaît" },
      { nl: "ja", en: "yes", fr: "oui" },
      { nl: "nee", en: "no", fr: "non" },
      { nl: "sorry", en: "sorry", fr: "pardon" },
      { nl: "goedenacht", en: "good night", fr: "bonne nuit" },
    ],
  },
  {
    id: 2,
    title: "Dieren",
    icon: "🐶",
    words: [
      { nl: "hond", en: "dog", fr: "chien" },
      { nl: "kat", en: "cat", fr: "chat" },
      { nl: "vogel", en: "bird", fr: "oiseau" },
      { nl: "vis", en: "fish", fr: "poisson" },
      { nl: "paard", en: "horse", fr: "cheval" },
      { nl: "koe", en: "cow", fr: "vache" },
      { nl: "konijn", en: "rabbit", fr: "lapin" },
      { nl: "muis", en: "mouse", fr: "souris" },
    ],
  },
  {
    id: 3,
    title: "Eten en drinken",
    icon: "🍎",
    words: [
      { nl: "brood", en: "bread", fr: "pain" },
      { nl: "water", en: "water", fr: "eau" },
      { nl: "melk", en: "milk", fr: "lait" },
      { nl: "kaas", en: "cheese", fr: "fromage" },
      { nl: "appel", en: "apple", fr: "pomme" },
      { nl: "ei", en: "egg", fr: "oeuf" },
      { nl: "koffie", en: "coffee", fr: "café" },
      { nl: "vlees", en: "meat", fr: "viande" },
    ],
  },
  {
    id: 4,
    title: "Kleuren",
    icon: "🎨",
    words: [
      { nl: "rood", en: "red", fr: "rouge" },
      { nl: "blauw", en: "blue", fr: "bleu" },
      { nl: "groen", en: "green", fr: "vert" },
      { nl: "geel", en: "yellow", fr: "jaune" },
      { nl: "zwart", en: "black", fr: "noir" },
      { nl: "wit", en: "white", fr: "blanc" },
      { nl: "roze", en: "pink", fr: "rose" },
      { nl: "paars", en: "purple", fr: "violet" },
    ],
  },
  {
    id: 5,
    title: "Getallen",
    icon: "🔢",
    words: [
      { nl: "een", en: "one", fr: "un" },
      { nl: "twee", en: "two", fr: "deux" },
      { nl: "drie", en: "three", fr: "trois" },
      { nl: "vier", en: "four", fr: "quatre" },
      { nl: "vijf", en: "five", fr: "cinq" },
      { nl: "acht", en: "eight", fr: "huit" },
      { nl: "negen", en: "nine", fr: "neuf" },
      { nl: "tien", en: "ten", fr: "dix" },
    ],
  },
];

// Aantal goede antwoorden dat nodig is om een level te halen
export const PASS_SCORE = 6;
