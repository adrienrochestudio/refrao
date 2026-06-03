# refrão — apprendre les langues avec la musique

Plateforme d'apprentissage par la musique, fondée sur une note pédagogique : input compréhensible d'abord, le refrain comme unité de mémoire, rappel actif espacé, cible de réussite 80–90 %. Multi-comptes (apprenants + gestionnaires de cohorte). Site statique (GitHub Pages) + Firebase (Auth + Firestore).

## Fichiers
| Fichier | Rôle |
|---|---|
| `index.html` | Accueil |
| `auth.html` | Connexion / inscription (rôle, langue, auto-placement de niveau) |
| `apprendre.html` | Coquille : révision du jour + chansons + parcours + activités |
| `core.js` | Config Firebase, auth/rôles/cohortes, CEFR/bandes, structure refrain/couplets, paliers, streak |
| `srs.js` | Moteur de maîtrise espacée (Couche C) : cartes, file commune, points faibles d'abord |
| `exercises.js` | Activités : découverte/compréhension, cloze adaptatif, révision quotidienne |
| `learn.js` | Pilotage : langue, choix de chanson, parcours d'une chanson |
| `progression.html` | Progression personnelle (niveau, cartes maîtrisées, complétées, réussite) |
| `gestion.html` | Espace gestion : éditeur (CEFR + structure auto) + cohorte (niveaux modifiables) |
| `style.css` | Design (sombre, bleu électrique) |

## Modèle pédagogique (résumé)
- **Bandes** (note §3) : 1 = Découverte (A1-A2), 2 = Intermédiaire (B1-B2), 3 = Avancé (C1-C2). Sur les comptes ET les chansons.
- **Parcours d'une chanson** (§8) : Découverte → Refrain (entraînement cloze) → Shadowing (auto-déclaratif) → Couplets (déverrouillés après le refrain) → complétion par maîtrise.
- **Adaptation par bande** : compréhension (traduction visible / à la demande / mot à mot) ; cloze (reconnaissance pour la bande 1, saisie pour 2-3 ; densité croissante) ; déverrouillage des couplets (un à un en bande 1, tous en 2-3).
- **Ajustement 80–90 %** (§4.6) : le cloze s'allège sous 80 %, se corse au-dessus de 90 %.
- **Maîtrise espacée** (§5) : « 3 bonnes réponses consécutives = maîtrisée ». Paliers : raté → même session ; 1 → +4 h ; 2 → +1 j ; 3 → +3 j ; entretien → +7 j. File commune à toutes les chansons, points faibles d'abord.
- **Motivation** (§7) : streak avec 2 gels, micro-récompenses, question de réflexion en fin de révision.
- **Reporté** (assumé) : test de niveau (§10), estimation auto de difficulté, production audio réelle (le shadowing est auto-déclaratif). Ligue de cohorte : à ajouter.

## Configuration Firebase
1. **Authentication** → activer **Email/Password**.
2. **Firestore** → onglet **Règles** (ajout de la collection `cards`) :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isManager() {
      return request.auth != null
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'manager';
    }
    match /users/{uid} {
      allow read:   if request.auth != null && (request.auth.uid == uid || isManager());
      allow create: if request.auth != null && request.auth.uid == uid;
      allow update, delete: if request.auth != null && (request.auth.uid == uid || isManager());
    }
    match /progress/{uid} {
      allow read:  if request.auth != null && (request.auth.uid == uid || isManager());
      allow write: if request.auth != null && request.auth.uid == uid;
    }
    match /cards/{uid} {
      allow read:  if request.auth != null && (request.auth.uid == uid || isManager());
      allow write: if request.auth != null && request.auth.uid == uid;
    }
    match /cohorts/{code} {
      allow read:   if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && resource.data.managerUid == request.auth.uid;
    }
    match /songs/{id} {
      allow read:  if true;
      allow write: if isManager();
    }
  }
}
```
Note : la règle `users` autorise désormais la mise à jour par un gestionnaire (pour corriger le niveau CEFR d'un apprenant, §3.2.b).

## Modèle de données (Firestore)
- `users/{uid}` : `{ role, email, lang, cohortId, cefr, band, streak:{count,last,freezes}, createdAt }`
- `cohorts/{code}` : `{ code, managerUid, createdAt }`
- `songs/{id}` : `{ title, artist, lang, cefr, band, sections:[{type:"refrain"|"couplet", lines:[{pt,fr}]}], deezer, cover, preview, pt, fr, pairs }`
  (`pt`/`fr` conservés pour compatibilité ; `sections` est la structure utilisée par le moteur)
- `progress/{uid}` : `{ songs:{ [id]:{ discovered, shadow, completed, full, clozeLevel } }, recent:[0/1...] }`
- `cards/{uid}` : `{ cards:{ [cardId]:{ type:"phrase"|"mot", text, trad, songId, sectionType, streak, lapses, state, due } } }`

## Côté gestionnaire
Dans l'éditeur : renseigner le **CEFR** (la bande en découle), coller les paroles (une ligne vide entre les sections), puis **Détecter la structure** — le bloc répété est proposé comme refrain ; corriger refrain/couplet avant d'enregistrer. Le tableau cohorte affiche, par apprenant, niveau (modifiable), cartes maîtrisées, chansons complétées et réussite récente.

## Mettre en ligne
Tous les fichiers à la racine du dépôt → GitHub Pages. Firebase ne marche qu'en `https://`. Cmd+Maj+R après chaque déploiement (cache).
