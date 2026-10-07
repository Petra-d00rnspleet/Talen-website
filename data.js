// Talen en lesinhoud (gewoon script, geen module).
// Elk item heeft een vertaling in nl, en en fr.
// Een nieuwe taal toevoegen: voeg hem toe aan LANGUAGES en geef elk item een extra sleutel.

const LANGUAGES = {
  en: { name: "Engels", native: "English", flag: "🇬🇧", speech: "en-GB", helper: "nl", color: "#e8505b" },
  nl: { name: "Nederlands", native: "Nederlands", flag: "🇳🇱", speech: "nl-NL", helper: "en", color: "#f39c34" },
  fr: { name: "Frans", native: "Français", flag: "🇫🇷", speech: "fr-FR", helper: "nl", color: "#3b82f6" },
};

const HELPER_NAMES = { nl: "Nederlands", en: "Engels" };

// Drie blokken, steeds moeilijker:
//  1. Woordjes     losse woorden
//  2. Zinnen       hele zinnen (kiezen, woorden in volgorde zetten, typen)
//  3. Gesprekken   een gesprek voeren: kies steeds het goede antwoord
// De id's lopen door (1-15). Een level opent als het vorige level is gehaald.
const SECTIONS = [
  {
    id: "woordjes",
    title: "Woordjes",
    icon: "🔤",
    kind: "words",
    description: "Leer de eerste makkelijke woordjes.",
    levels: [
      {
        id: 1, title: "Begroetingen", icon: "👋",
        items: [
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
        id: 2, title: "Dieren", icon: "🐶",
        items: [
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
        id: 3, title: "Eten en drinken", icon: "🍎",
        items: [
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
        id: 4, title: "Kleuren", icon: "🎨",
        items: [
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
        id: 5, title: "Getallen", icon: "🔢",
        items: [
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
    ],
  },

  {
    id: "zinnen",
    title: "Zinnen",
    icon: "📝",
    kind: "sentences",
    description: "Maak hele zinnen: kiezen, woorden in de goede volgorde zetten en typen.",
    levels: [
      {
        id: 6, title: "Over jezelf", icon: "👤",
        mix: ["choice", "build"], distractors: 0,
        items: [
          { nl: "Ik heet Anna.", en: "My name is Anna.", fr: "Je m'appelle Anna." },
          { nl: "Ik werk in een winkel.", en: "I work in a shop.", fr: "Je travaille dans un magasin." },
          { nl: "Ik woon in Nederland.", en: "I live in the Netherlands.", fr: "J'habite aux Pays-Bas." },
          { nl: "Ik hou van muziek.", en: "I love music.", fr: "J'adore la musique." },
          { nl: "Ik heb een hond.", en: "I have a dog.", fr: "J'ai un chien." },
          { nl: "Hoe gaat het?", en: "How are you?", fr: "Comment ça va?" },
          { nl: "Het gaat goed.", en: "I am fine.", fr: "Ça va bien." },
          { nl: "Ik ben blij je te zien.", en: "I am happy to see you.", fr: "Je suis content de te voir." },
        ],
      },
      {
        id: 7, title: "Dagelijks leven", icon: "☀️",
        mix: ["choice", "build"], distractors: 1,
        items: [
          { nl: "Ik drink water.", en: "I drink water.", fr: "Je bois de l'eau." },
          { nl: "Ik eet een appel.", en: "I eat an apple.", fr: "Je mange une pomme." },
          { nl: "De kat slaapt.", en: "The cat is sleeping.", fr: "Le chat dort." },
          { nl: "Wij gaan naar school.", en: "We go to school.", fr: "Nous allons à l'école." },
          { nl: "Hij leest een boek.", en: "He reads a book.", fr: "Il lit un livre." },
          { nl: "Zij speelt buiten.", en: "She plays outside.", fr: "Elle joue dehors." },
          { nl: "Het is een mooie dag.", en: "It is a nice day.", fr: "C'est une belle journée." },
          { nl: "Ik ben moe.", en: "I am tired.", fr: "Je suis fatigué." },
        ],
      },
      {
        id: 8, title: "Vragen stellen", icon: "❓",
        mix: ["build", "choice"], distractors: 2,
        items: [
          { nl: "Waar is de wc?", en: "Where is the toilet?", fr: "Où sont les toilettes?" },
          { nl: "Hoeveel kost dit?", en: "How much does this cost?", fr: "Combien ça coûte?" },
          { nl: "Wat is dit?", en: "What is this?", fr: "Qu'est-ce que c'est?" },
          { nl: "Hoe laat is het?", en: "What time is it?", fr: "Quelle heure est-il?" },
          { nl: "Spreek je Nederlands?", en: "Do you speak Dutch?", fr: "Parles-tu néerlandais?" },
          { nl: "Kun je mij helpen?", en: "Can you help me?", fr: "Peux-tu m'aider?" },
          { nl: "Waar woon je?", en: "Where do you live?", fr: "Où habites-tu?" },
          { nl: "Wat is je naam?", en: "What is your name?", fr: "Comment t'appelles-tu?" },
        ],
      },
      {
        id: 9, title: "Eten bestellen", icon: "🍽️",
        mix: ["build", "type"], distractors: 2,
        items: [
          { nl: "Ik wil graag water.", en: "I would like water.", fr: "Je voudrais de l'eau." },
          { nl: "Ik heb honger.", en: "I am hungry.", fr: "J'ai faim." },
          { nl: "Ik heb dorst.", en: "I am thirsty.", fr: "J'ai soif." },
          { nl: "De rekening, alstublieft.", en: "The bill, please.", fr: "L'addition, s'il vous plaît." },
          { nl: "Dit smaakt heerlijk.", en: "This tastes delicious.", fr: "C'est délicieux." },
          { nl: "Ik hou niet van vis.", en: "I do not like fish.", fr: "Je n'aime pas le poisson." },
          { nl: "Mag ik een kopje koffie?", en: "May I have a cup of coffee?", fr: "Puis-je avoir une tasse de café?" },
          { nl: "Een tafel voor twee, alstublieft.", en: "A table for two, please.", fr: "Une table pour deux, s'il vous plaît." },
        ],
      },
      {
        id: 10, title: "Langere zinnen", icon: "📖",
        mix: ["build", "type"], distractors: 3,
        items: [
          { nl: "Morgen ga ik met mijn vriend naar het strand.", en: "Tomorrow I am going to the beach with my friend.", fr: "Demain, je vais à la plage avec mon ami." },
          { nl: "Gisteren heb ik een mooi boek gelezen.", en: "Yesterday I read a nice book.", fr: "Hier, j'ai lu un beau livre." },
          { nl: "Ik woon in een klein huis bij het bos.", en: "I live in a small house near the forest.", fr: "J'habite dans une petite maison près de la forêt." },
          { nl: "Als het regent, blijf ik thuis.", en: "If it rains, I stay at home.", fr: "S'il pleut, je reste à la maison." },
          { nl: "Mijn zus werkt in een grote stad.", en: "My sister works in a big city.", fr: "Ma sœur travaille dans une grande ville." },
          { nl: "Wij hebben vandaag lekker gegeten.", en: "We ate well today.", fr: "Nous avons bien mangé aujourd'hui." },
          { nl: "Ik zou graag een nieuwe taal willen leren.", en: "I would like to learn a new language.", fr: "Je voudrais apprendre une nouvelle langue." },
          { nl: "Het weer is vandaag erg mooi.", en: "The weather is very nice today.", fr: "Il fait très beau aujourd'hui." },
        ],
      },
    ],
  },

  {
    id: "gesprekken",
    title: "Gesprekken",
    icon: "🗣️",
    kind: "dialogue",
    description: "Voer een echt gesprek: kies steeds het goede antwoord.",
    levels: [
      {
        id: 11, title: "Kennismaken", icon: "🤝", showHint: true,
        items: [
          { say: { nl: "Hallo! Hoe heet je?", en: "Hello! What is your name?", fr: "Salut! Comment t'appelles-tu?" },
            reply: { nl: "Ik heet Anna.", en: "My name is Anna.", fr: "Je m'appelle Anna." } },
          { say: { nl: "Leuk je te ontmoeten, Anna. Hoe gaat het?", en: "Nice to meet you, Anna. How are you?", fr: "Enchanté, Anna. Comment ça va?" },
            reply: { nl: "Het gaat goed, dank je.", en: "I am fine, thank you.", fr: "Ça va bien, merci." } },
          { say: { nl: "Waar woon je?", en: "Where do you live?", fr: "Où habites-tu?" },
            reply: { nl: "Ik woon in Nederland.", en: "I live in the Netherlands.", fr: "J'habite aux Pays-Bas." } },
          { say: { nl: "Heb je een huisdier?", en: "Do you have a pet?", fr: "As-tu un animal?" },
            reply: { nl: "Ja, ik heb een hond.", en: "Yes, I have a dog.", fr: "Oui, j'ai un chien." } },
          { say: { nl: "Zullen we samen een ijsje eten?", en: "Shall we eat an ice cream together?", fr: "On mange une glace ensemble?" },
            reply: { nl: "Ja, graag!", en: "Yes, I would love to!", fr: "Oui, avec plaisir!" } },
          { say: { nl: "Ik moet nu gaan. Tot ziens!", en: "I have to go now. Goodbye!", fr: "Je dois partir maintenant. Au revoir!" },
            reply: { nl: "Doei, tot snel!", en: "Bye, see you soon!", fr: "Salut, à bientôt!" } },
        ],
      },
      {
        id: 12, title: "In de winkel", icon: "🛍️", showHint: true,
        items: [
          { say: { nl: "Goedemorgen! Kan ik u helpen?", en: "Good morning! Can I help you?", fr: "Bonjour! Je peux vous aider?" },
            reply: { nl: "Ja, ik zoek een boek.", en: "Yes, I am looking for a book.", fr: "Oui, je cherche un livre." } },
          { say: { nl: "Wat voor boek wilt u?", en: "What kind of book do you want?", fr: "Quel genre de livre voulez-vous?" },
            reply: { nl: "Ik wil een boek over dieren.", en: "I want a book about animals.", fr: "Je veux un livre sur les animaux." } },
          { say: { nl: "Dit is een mooi boek over dieren.", en: "This is a nice book about animals.", fr: "Voici un beau livre sur les animaux." },
            reply: { nl: "Hoeveel kost het?", en: "How much does it cost?", fr: "Combien ça coûte?" } },
          { say: { nl: "Het kost tien euro.", en: "It costs ten euros.", fr: "Ça coûte dix euros." },
            reply: { nl: "Dat is goed, ik neem het.", en: "That is fine, I will take it.", fr: "C'est bien, je le prends." } },
          { say: { nl: "Wilt u contant of met de pin betalen?", en: "Would you like to pay with cash or by card?", fr: "Vous payez en espèces ou par carte?" },
            reply: { nl: "Met de pin, alstublieft.", en: "By card, please.", fr: "Par carte, s'il vous plaît." } },
          { say: { nl: "Alstublieft, fijne dag nog!", en: "Here you are, have a nice day!", fr: "Voilà, bonne journée!" },
            reply: { nl: "Dank u wel, u ook!", en: "Thank you, you too!", fr: "Merci, vous aussi!" } },
        ],
      },
      {
        id: 13, title: "In het restaurant", icon: "🍴",
        items: [
          { say: { nl: "Goedenavond! Hebt u gereserveerd?", en: "Good evening! Do you have a reservation?", fr: "Bonsoir! Vous avez réservé?" },
            reply: { nl: "Nee, een tafel voor twee, alstublieft.", en: "No, a table for two, please.", fr: "Non, une table pour deux, s'il vous plaît." } },
          { say: { nl: "Wat wilt u drinken?", en: "What would you like to drink?", fr: "Qu'est-ce que vous voulez boire?" },
            reply: { nl: "Een glas water, alstublieft.", en: "A glass of water, please.", fr: "Un verre d'eau, s'il vous plaît." } },
          { say: { nl: "Wat wilt u eten?", en: "What would you like to eat?", fr: "Qu'est-ce que vous voulez manger?" },
            reply: { nl: "Ik neem de vis met rijst.", en: "I will have the fish with rice.", fr: "Je prends le poisson avec du riz." } },
          { say: { nl: "Smaakt het goed?", en: "Does it taste good?", fr: "Est-ce que c'est bon?" },
            reply: { nl: "Ja, het is heerlijk!", en: "Yes, it is delicious!", fr: "Oui, c'est délicieux!" } },
          { say: { nl: "Wilt u nog een toetje?", en: "Would you like a dessert?", fr: "Vous voulez un dessert?" },
            reply: { nl: "Nee, dank u, ik heb genoeg gegeten.", en: "No, thank you, I have had enough.", fr: "Non, merci, j'ai assez mangé." } },
          { say: { nl: "Hier is de rekening.", en: "Here is the bill.", fr: "Voici l'addition." },
            reply: { nl: "Dank u wel. Mag ik met de pin betalen?", en: "Thank you. May I pay by card?", fr: "Merci. Puis-je payer par carte?" } },
        ],
      },
      {
        id: 14, title: "De weg vragen", icon: "🗺️",
        items: [
          { say: { nl: "Hallo, kan ik u helpen?", en: "Hello, can I help you?", fr: "Bonjour, je peux vous aider?" },
            reply: { nl: "Ja, ik ben de weg kwijt.", en: "Yes, I am lost.", fr: "Oui, je suis perdu." } },
          { say: { nl: "Waar wilt u naartoe?", en: "Where do you want to go?", fr: "Où voulez-vous aller?" },
            reply: { nl: "Ik zoek het station.", en: "I am looking for the station.", fr: "Je cherche la gare." } },
          { say: { nl: "Ga hier rechtdoor en sla dan links af.", en: "Go straight ahead here and then turn left.", fr: "Allez tout droit ici, puis tournez à gauche." },
            reply: { nl: "Is het ver lopen?", en: "Is it far to walk?", fr: "C'est loin à pied?" } },
          { say: { nl: "Nee, het is maar vijf minuten lopen.", en: "No, it is only a five-minute walk.", fr: "Non, c'est à cinq minutes à pied." },
            reply: { nl: "Gelukkig, dat is dichtbij.", en: "Good, that is close.", fr: "Heureusement, c'est près." } },
          { say: { nl: "Graag gedaan! Wilt u een kaart van de stad?", en: "You are welcome! Would you like a map of the city?", fr: "Je vous en prie! Vous voulez un plan de la ville?" },
            reply: { nl: "Ja, dat is een goed idee.", en: "Yes, that is a good idea.", fr: "Oui, c'est une bonne idée." } },
          { say: { nl: "Hier is de kaart. Veel plezier in de stad!", en: "Here is the map. Enjoy the city!", fr: "Voici le plan. Amusez-vous bien en ville!" },
            reply: { nl: "Dank u wel, tot ziens!", en: "Thank you, goodbye!", fr: "Merci, au revoir!" } },
        ],
      },
      {
        id: 15, title: "Plannen maken", icon: "📅",
        items: [
          { say: { nl: "Hoi! Heb je zin om morgen iets te doen?", en: "Hi! Do you feel like doing something tomorrow?", fr: "Salut! Tu as envie de faire quelque chose demain?" },
            reply: { nl: "Ja, leuk! Wat zullen we doen?", en: "Yes, nice! What shall we do?", fr: "Oui, super! Qu'est-ce qu'on fait?" } },
          { say: { nl: "We kunnen naar het strand gaan als het mooi weer is.", en: "We can go to the beach if the weather is nice.", fr: "On peut aller à la plage s'il fait beau." },
            reply: { nl: "Goed idee, ik ben dol op het strand.", en: "Good idea, I love the beach.", fr: "Bonne idée, j'adore la plage." } },
          { say: { nl: "Hoe laat zullen we afspreken?", en: "What time shall we meet?", fr: "À quelle heure on se retrouve?" },
            reply: { nl: "Om tien uur bij het station, is dat goed?", en: "At ten o'clock at the station, is that okay?", fr: "À dix heures à la gare, ça va?" } },
          { say: { nl: "Prima! Zal ik iets te eten meenemen?", en: "Great! Shall I bring something to eat?", fr: "Parfait! Je prends quelque chose à manger?" },
            reply: { nl: "Ja, graag. Ik neem de drankjes mee.", en: "Yes, please. I will bring the drinks.", fr: "Oui, volontiers. J'apporte les boissons." } },
          { say: { nl: "Wat als het toch gaat regenen?", en: "What if it does start to rain after all?", fr: "Et s'il se met à pleuvoir quand même?" },
            reply: { nl: "Dan gaan we naar de film.", en: "Then we will go to the cinema.", fr: "Alors on ira au cinéma." } },
          { say: { nl: "Perfect, dan zie ik je morgen!", en: "Perfect, then I will see you tomorrow!", fr: "Parfait, alors à demain!" },
            reply: { nl: "Tot morgen, ik heb er zin in!", en: "See you tomorrow, I am looking forward to it!", fr: "À demain, j'ai hâte!" } },
        ],
      },
    ],
  },
];

// Alle levels op één rij, met het blok erbij
const LEVELS = SECTIONS.flatMap((s) =>
  s.levels.map((lv) => Object.assign({}, lv, { sectionId: s.id, kind: s.kind }))
);

// Een level is gehaald bij minstens 75% goed (bijvoorbeeld 6 van 8)
function passScore(level) {
  return Math.ceil(level.items.length * 0.75);
}
