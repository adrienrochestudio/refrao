# refrão — apprendre le portugais avec la musique

Site statique multi-pages, sans login (usage perso). Aucun build : que des fichiers à déposer sur GitHub.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Accueil |
| `ajout.html` | Banque de musiques (ajout / édition / liage des mots) |
| `apprendre.html` | Apprentissage (niveaux + exercices) |
| `progression.html` | Suivi de la progression et du XP |
| `style.css` | Tout le design (couleurs, animations) — un seul endroit à éditer |
| `core.js` | Données partagées + **config Firebase** + moteur de niveaux |

Pour modifier une section, tu ouvres son fichier. Pour changer l'apparence : `style.css`. Pour Firebase : `core.js`.

## Tester en local

Sans Firebase, l'app utilise le **stockage local du navigateur** (localStorage) : tes chansons et ta progression sont conservées entre les pages, sur ton ordinateur.

- Le plus simple : pousse sur GitHub Pages (voir plus bas) et utilise directement l'URL.
- En local, lance un petit serveur depuis le dossier (sinon le navigateur bloque le partage entre fichiers) :
  ```
  python3 -m http.server 8000
  ```
  puis ouvre http://localhost:8000

## Brancher Firebase (Firestore)

1. console.firebase.google.com → ton projet → **Build → Firestore Database → Créer une base** (mode production).
2. **Paramètres du projet → Vos applications → app Web** : copie l'objet `firebaseConfig`.
3. Ouvre `core.js`, remplace le bloc `R.FIREBASE_CONFIG` par tes valeurs. Dès que `apiKey` ne contient plus « COLLE », l'app passe automatiquement de localStorage à Firestore.
4. **Firestore → Règles** → comme c'est un usage perso sans login, colle puis **Publier** :
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} { allow read, write: if true; }
     }
   }
   ```

> La clé API Web est publique par nature : c'est normal de la voir dans `core.js`, ce sont les règles Firestore qui protègent les données.
> Important : la connexion Firebase ne fonctionne qu'en `https://` (donc sur GitHub Pages), pas en double-clic `file://`.

### Données Firestore
- Collection `songs` : un document par chanson `{ title, artist, deezer, pt, fr, pairs:[{pt,fr}] }`
- Document `progress/main` : `{ xp, songs:{ [songId]:{ done:[clésNiveaux] } } }`

## Mettre en ligne (GitHub Pages)

1. Crée un dépôt, dépose **tous les fichiers à la racine** (pas dans un sous-dossier), commit + push.
2. **Settings → Pages → Source : Deploy from a branch → `main` / `/root`** → Save.
3. ~1 min plus tard : `https://<ton-pseudo>.github.io/<dépôt>/`.

À chaque modif, tu remplaces le fichier concerné dans le dépôt et le site se met à jour tout seul.

## Idées pour la suite
- Lecteur d'extrait Deezer intégré
- Révision espacée des mots ratés
- Mode « par cœur » qui efface progressivement les paroles
