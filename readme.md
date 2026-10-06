# Taalreis

Een simpele website om talen te leren (Engels, Nederlands, Frans). Beginnerslessen met woordjes, 5 levels per taal. Een level opent pas als je het vorige hebt gehaald (minimaal 6 van de 8 goed).

## Bestanden

- `index.html`: de pagina
- `style.css`: de opmaak
- `app.js`: schermen, vragen en voortgang
- `data.js`: talen, levels en woordjes (hier voeg je nieuwe woorden of talen toe)
- `firebase-config.js`: jouw Firebase-gegevens

## Firebase instellen

1. Maak een project op https://console.firebase.google.com
2. Voeg een **Web-app** toe en kopieer de config naar `firebase-config.js`
3. Zet bij **Authentication > Sign-in method** de optie **Anoniem** aan
4. Maak een **Firestore Database** aan (productiemodus)
5. Zet deze regels bij **Firestore > Regels**, zodat iedereen alleen zijn eigen voortgang kan lezen en schrijven:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

6. Voeg bij **Authentication > Instellingen > Geautoriseerde domeinen** je GitHub Pages-domein toe (`jouwnaam.github.io`)

## Online zetten met GitHub Pages

1. Zet alle bestanden in een GitHub-repository
2. Ga naar **Settings > Pages**, kies de branch `main` en map `/ (root)`
3. Na een minuut staat de site op `https://jouwnaam.github.io/repo-naam/`

## Lokaal testen

De site gebruikt ES-modules, dus open hem via een lokale server en niet door op het bestand te dubbelklikken:

```
python3 -m http.server 8000
```

Ga dan naar http://localhost:8000
