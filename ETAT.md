# ETAT.md - Synthèse du projet refrão

> Document de reprise. À lire en début de chat pour reprendre le travail.
> Règles permanentes : voir `CLAUDE.md` (lu automatiquement par Claude).
> Dernière mise à jour : 2026-06-12.

---

## 1. Le projet en une phrase
**refrão** : plateforme d'apprentissage des langues par la musique (le refrain comme unité de mémoire, répétition espacée, CEFR, cible de réussite 80-90 %). En cours de transformation d'un prototype étudiant vers une **entreprise**.

## 2. Vision & modèle économique
- **Premier business : B2B**, abonnement gestionnaires / écoles. Les enseignants paient pour gérer des cohortes ; les apprenants accèdent gratuitement via un code de cohorte.
- **Cap technique long terme** : migration progressive du site statique actuel vers une vraie application (build + framework), sans surcoût prématuré.
- **Priorités permanentes** : sécurité maximale, coûts minimaux et repoussés, organisation sûre, professionnalisme maximal.

## 3. Stack & hébergement
- Front : HTML / CSS / JS **vanilla**, aucun build, aucune dépendance npm côté site.
- Backend : **Firebase** (Auth + Firestore), projet `refrao-b6ae3`, plan **Spark (gratuit)**.
- Hébergement : **GitHub Pages**, repo public `adrienrochestudio/refrao` (branche `main`, fichiers à la racine).
- Outil de dev : `firebase-admin` (npm, en local) pour le provisioning. `node_modules/` ignoré par git.

## 4. URLs & accès clés
- Site en ligne : https://adrienrochestudio.github.io/refrao/
- Connexion gestionnaire : https://adrienrochestudio.github.io/refrao/auth.html (onglet Gestionnaire)
- Repo : https://github.com/adrienrochestudio/refrao
- Pas de domaine personnalisé (à acheter plus tard).
- Compte gestionnaire de démo : `adrien.etks@gmail.com` (mot de passe connu d'Adrien, non stocké ici), uid `DoB6EYKcJ5N5iPjbzGTwUyN8D2h2`, cohorte `demo2026` (pt, A2).

## 5. Architecture des fichiers
| Fichier | Rôle |
|---|---|
| `index.html` | Accueil |
| `auth.html` | Connexion (apprenant sans mot de passe / gestionnaire email+mdp) |
| `apprendre.html` | Coquille apprenant (révision + chansons + parcours) |
| `gestion.html` | Espace gestionnaire (éditeur de chansons + tableau cohorte) |
| `progression.html` | Progression personnelle de l'apprenant |
| `core.js` | Config Firebase, auth/rôles (via custom claim), cohortes, CEFR/bandes, structure refrain/couplets, App Check |
| `srs.js` | Moteur de répétition espacée |
| `exercises.js` | Activités (découverte, cloze adaptatif, révision) |
| `learn.js` | Pilotage : langue, choix de chanson, parcours |
| `leveltest.js` | Test de niveau (STUB non calibré, à refaire) |
| `style.css` | Design (sombre, bleu électrique) |
| `firestore.rules` | Règles Firestore durcies (source de vérité, déjà publiées) |
| `tools/set-manager.mjs` | Provisioning d'un gestionnaire via Admin SDK |

## 6. Modèle de données (Firestore)
- `users/{uid}` : `{ role, email|firstName/lastName, lang, cohortId, cefr, band, streak, createdAt }`
- `cohorts/{code}` : `{ code, managerUid, lang, level, category, createdAt }`
- `songs/{id}` : `{ title, artist, lang, cefr, band, genre, tags, sections:[{type, lines:[{pt,fr}]}], deezer, cover, preview, pairs }`
- `progress/{uid}` : `{ songs:{[id]:{discovered, shadow, completed, full, clozeLevel}}, recent:[0/1] }`
- `cards/{uid}` : `{ cards:{[cardId]:{type, text, trad, songId, sectionType, streak, lapses, state, due}} }`
- NB : `sections` est la **source unique des paroles** (Phase 2 faite). L'éditeur n'écrit plus `pt`/`fr` à plat ; repli backward-compat pour lire les anciens docs (migrés vers `sections` au prochain enregistrement). `pairs` n'est PAS de la dette : couche vocabulaire active (cartes SRS, cloze, sens des mots), conservée. Dans `lines`, les clés `pt`/`fr` signifient « texte d'origine » / « glose française » quelle que soit la langue de la cohorte.

## 7. Sécurité - ÉTAT COMPLET (tout déployé et actif en prod, 2026-06-12)
- **Rôle via custom claim serveur** : `isManager()` lit `request.auth.token.role`, jamais un champ que le client pourrait écrire. `users` create force `role:'learner'`. Plus d'auto-élévation possible.
- **Isolation multi-tenant** : un gestionnaire n'accède qu'aux données des cohortes dont il est `managerUid` (fonctions `ownsCohort` / `managesUserCohort` dans les règles).
- **Cohortes** : `get` par code exact autorisé (flux rejoindre-par-code), `list` interdit (pas d'énumération).
- **Catalogue** : `songs` lisible seulement par les connectés.
- **App Check (reCAPTCHA v3)** : intégré dans `core.js`, ENFORCEMENT ACTIVÉ sur Cloud Firestore + Authentication. Clé de site (publique) dans le code ; clé secrète dans Firebase. Provisioning Admin SDK exempté.
- **Clé API** (Browser key, Google Cloud) : restreinte aux référents `https://adrienrochestudio.github.io/*`.
- **Domaines Auth** : liste par défaut propre ; non bloquant car seuls email + anonyme sont utilisés. À compléter (ajouter le domaine) si on ajoute "Connexion Google".
- **Fournisseurs Auth activés** : Email/mot de passe + Anonyme.
- Pour annuler App Check en cas de souci : console App Check > service > "Annuler l'application".

## 8. Provisionner un gestionnaire (procédure)
Prérequis : `tools/serviceAccount.json` présent (clé privée Firebase, ignorée par git), `npm install` fait.
```
node tools/set-manager.mjs --email <email> --password <6+ si compte à créer> --cohort <code> --lang pt --level A2
```
Le gestionnaire doit se reconnecter pour activer le claim. C'est ainsi qu'on intègre un client B2B.

## 9. Workflow Git
- Toujours une branche `chantier/...`, jamais de commit direct sur `main`.
- PR via `gh`, fusion sur `main` => GitHub Pages redéploie (~1-3 min).
- `gh` installé et authentifié (compte adrienrochestudio).
- Historique propre depuis le 2026-06-12 (fini les "Add files via upload").

## 10. Ce qui est FAIT
- Audit complet du code.
- Fondations : `CLAUDE.md`, `.gitignore`, `ETAT.md`.
- Sécurité Phase 1 + 3 durcissements : voir section 7 (tout déployé et vérifié en prod).
- Workflow Git + déploiement opérationnels.
- **Phase 2 - assainissement** (branche `chantier/phase2-assainissement`, à fusionner) : modèle de paroles unifié sur `sections` ; code mort retiré (`R.buildLevels`, `R.songProgressPct`) ; libellés éditeur dynamiques selon la langue ; ESLint + Prettier en place (devDeps, scripts `lint`/`format`).

## 11. Ce qui RESTE (par priorité)
- **Durcissement avancé** : validation de schéma fine dans `firestore.rules` (champs et tailles autorisés). À faire APRÈS Phase 2 (valide le modèle `sections` désormais stable, une seule fois).
- **Reliquat Phase 2** (optionnel) : migration ponctuelle pour purger les `pt`/`fr` à plat des anciens docs Firestore ; envisager un reformatage Prettier global au moment de la migration framework (pas avant, pour garder le style dense actuel).
- **Phase 3 - socle B2B** : modèle d'abonnement écoles (entitlements/licences), refonte de l'onboarding gestionnaire (l'inscription libre-service est désormais bloquée par les règles, voulu), comptes persistants, conformité RGPD (données d'apprenants possiblement mineurs), cadrage des droits sur les paroles (œuvres protégées).
- **Phase 4 - migration framework** : build + framework + CI/CD, progressivement.
- **Divers** : test de niveau (`leveltest.js`) à calibrer ; envisager un domaine personnalisé ; "Connexion Google" pour les profs (penser domaines Auth + App Check).

## 12. Comment reprendre dans un nouveau chat
1. Le chat démarre dans `~/refrao` : `CLAUDE.md` est lu automatiquement (règles permanentes).
2. Lire ce `ETAT.md` pour l'état complet.
3. Annoncer le chantier voulu (ex : "Phase 2", "validation de schéma", "onboarding B2B").
4. Travailler sur une branche `chantier/...`, PR, merge.
