# refrão — apprendre le portugais avec la musique

Site statique multi-pages. Interface publique d'un côté, back office protégé par connexion de l'autre. Aucun build : que des fichiers à déposer sur GitHub.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Accueil : un seul appel à l'action « Apprendre » (public) |
| `apprendre.html` | Apprentissage : niveaux + exercices (public) |
| `progression.html` | Progression et XP (public) |
| `admin.html` | **Back office** protégé par login : gestion des chansons, import Deezer, liage des mots |
| `style.css` | Tout le design |
| `core.js` | Données partagées + **config Firebase** + authentification + moteur de niveaux |

Le bouton **Connexion** en haut à droite ouvre la connexion. Une fois connecté, un bouton **Back office** apparaît (et **Déconnexion**). Le back office est aussi accessible directement via `…/admin.html`, mais il reste verrouillé tant que tu n'es pas connecté.

## Authentification (Firebase Auth) — à activer une fois

1. console.firebase.google.com → ton projet → **Authentication → Get started**.
2. Onglet **Sign-in method** → active **Email/Password**.
3. Onglet **Users → Add user** → saisis **ton email** et **un mot de passe**. C'est ton identifiant de connexion (il n'y a pas d'inscription dans l'app, juste la connexion).

## Règles Firestore

Lecture publique (pour que l'apprentissage fonctionne sans login), mais **seules les écritures de chansons exigent d'être connecté**. La progression reste libre.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /songs/{id}    { allow read: if true; allow write: if request.auth != null; }
    match /progress/{id} { allow read, write: if true; }
  }
}
```

> La clé API Web dans `core.js` est publique par nature ; ce sont ces règles + la connexion qui protègent l'ajout/modification de chansons. Firebase (auth + base) ne fonctionne qu'en `https://`.

### Données Firestore
- Collection `songs` : `{ title, artist, deezer, cover, preview, pt, fr, pairs:[{pt,fr}] }`
- Document `progress/main` : `{ xp, songs:{ [songId]:{ done:[clésNiveaux] } } }`

## Tester en local
Sans connexion Firebase (mode local), l'app utilise le stockage du navigateur et le back office n'est pas verrouillé (pratique pour le dev). Lance un serveur depuis le dossier :
```
python3 -m http.server 8000
```
puis http://localhost:8000

## Import Deezer
Dans le back office : colle un lien de piste Deezer (`.../track/123...`) puis « Récupérer » — titre, artiste, pochette et extrait de 30 s se remplissent (API publique gratuite).

## Mettre en ligne (GitHub Pages)
1. Dépose **tous les fichiers à la racine** du dépôt, commit + push.
2. Settings → Pages → Source : Deploy from a branch → `main` / `/root` → Save.
3. ~1 min plus tard : `https://<ton-pseudo>.github.io/<dépôt>/`.
