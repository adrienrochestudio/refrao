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

## 8. Provisionner un gestionnaire + sa licence (procédure)
Prérequis : `tools/serviceAccount.json` présent (clé privée Firebase, ignorée par git), `npm install` fait.
```
# onboarding complet d'un client B2B :
node tools/set-manager.mjs --email <email> --password <6+ si compte à créer> \
     --cohort <code> --lang pt --level A2 \
     --plan school --until 2027-09-01 --seats 30 --school "Collège Hugo"
# renouvellement : relancer avec un nouveau --until (date YYYY-MM-DD ou nb de jours, défaut 365)
node tools/set-manager.mjs --email <email> --until 2028-09-01
```
Pose le claim `role:manager` + la licence (claims `plan`/`validUntil` + doc `licenses/{uid}`). Le gestionnaire doit se reconnecter pour activer ses claims. La licence est le **levier B2B** : `validUntil` dépassé => écritures bloquées par les règles.

> ⚠️ **Ordre obligatoire avant de (re)publier les règles** (sinon lockout) : reprovisionner CHAQUE gestionnaire existant avec `set-manager.mjs --until ...` puis le faire reconnecter, AVANT de publier `firestore.rules` (§9). Fait le 2026-06-12 pour `adrien.etks@gmail.com` (licence school jusqu'au 2027-09-01).

## 9. Workflow Git
- Toujours une branche `chantier/...`, jamais de commit direct sur `main`.
- PR via `gh`, fusion sur `main` => GitHub Pages redéploie (~1-3 min).
- `gh` installé et authentifié (compte adrienrochestudio).
- Historique propre depuis le 2026-06-12 (fini les "Add files via upload").
- **Publier les règles Firestore** (`firestore.rules` est la source de vérité ; ni le repo ni la fusion sur `main` n'agissent sur Firebase) : `node tools/deploy-rules.mjs` (utilise la clé de service, gratuit, pas de Blaze ; `--check` pour voir la release active sans publier). NB : `firebase deploy` via le CLI échoue car le compte de service `firebase-adminsdk` n'a pas la permission `serviceusage` ; l'outil passe directement par l'API Rules (couverte par le scope `firebase`). Alternative manuelle : copier-coller dans la console Firebase > Firestore > Règles.

## 10. Ce qui est FAIT
- Audit complet du code.
- Fondations : `CLAUDE.md`, `.gitignore`, `ETAT.md`.
- Sécurité Phase 1 + 3 durcissements : voir section 7 (tout déployé et vérifié en prod).
- Workflow Git + déploiement opérationnels.
- **Phase 2 - assainissement** : modèle de paroles unifié sur `sections` ; code mort retiré (`R.buildLevels`, `R.songProgressPct`) ; libellés éditeur dynamiques selon la langue ; ESLint + Prettier en place (devDeps, scripts `lint`/`format`).
- **Validation de schéma fine** dans `firestore.rules` (champs en liste blanche `hasOnly`, types, tailles bornées) pour `users`/`cohorts`/`songs`/`progress`/`cards`. Ajout de `firebase.json` + `.firebaserc` (déploiement des règles en une commande).
- **Socle B2B - backend de licence** : entitlements autoritatifs serveur via custom claims (`plan`, `validUntil`) ; règles conditionnant les écritures gestionnaire à une licence valide (expiration = accès coupé) ; collection `licenses/{uid}` ; `set-manager.mjs` étendu (onboarding + renouvellement) ; bandeau de licence dans l'espace gestion ; onboarding nettoyé (accès sur demande, inscription libre-service retirée). Paiements (Stripe) volontairement différés.
- **Règles Firestore PUBLIÉES en prod le 2026-06-12** (validation de schéma + licence), via `tools/deploy-rules.mjs`. Ruleset actif vérifié identique au fichier. Gestionnaire démo reprovisionné au préalable (pas de lockout).
- **Migration framework DÉMARRÉE** : stack = **Astro + TypeScript** (statique, Pages, vivier React via îlots). Fondation isolée dans `app/` (le site vanilla à la racine reste en ligne, intact). Page d'accueil portée en preuve de concept (rendu vérifié identique), `style.css` réutilisé tel quel, CI build+type-check (`.github/workflows/ci.yml`). Voir §13.

## 11. Ce qui RESTE (par priorité)
- **Décision séquencement actée** : backend B2B durable d'abord (fait), puis migration framework + TypeScript, puis refonte produit (parcours/imports/accueil) sur le nouveau socle. Marché francophone d'abord. Ne PAS refondre l'UX en vanilla. Voir mémoire `refrao-roadmap-decisions`.
- **Reliquat Phase 2** (optionnel) : migration ponctuelle pour purger les `pt`/`fr` à plat des anciens docs Firestore ; reformatage Prettier global au moment de la migration framework (pas avant).
- **Socle B2B - suite** : conformité RGPD (données d'apprenants possiblement mineurs) et cadrage des droits sur les paroles (œuvres protégées) = bloquants de COMMERCIALISATION, à mener en parallèle. Plus tard : paiements (Stripe, exige un backend payant), formulaire de contact, enforcement dur des sièges, vraie page d'accueil/offre.
- **Migration framework (Astro + TS) - suite** (voir §13) : brancher Firebase via le SDK npm typé (remplacer les imports gstatic globaux de `core.js`) ; porter les autres pages (auth, apprendre, gestion, progression) en réutilisant le backend ; refondre le CSS et l'UX au passage ; puis basculer GitHub Pages sur le build Astro (étape délibérée).
- **Divers** : test de niveau (`leveltest.js`) à calibrer ; envisager un domaine personnalisé ; "Connexion Google" pour les profs (penser domaines Auth + App Check).

## 13. Migration framework (Astro + TypeScript) - état & plan
- **Stack** : Astro + TypeScript, sortie 100% statique (pas de SSR = pas de coût serveur), `base: '/refrao'`. Choix acté (vivier React accessible via les composants îlots).
- **Layout repo** : tout le nouveau code dans `app/` ; le site vanilla reste à la racine et continue d'être servi par GitHub Pages **tel quel** tant qu'on n'a pas basculé. `app/public/style.css` = copie transitoire du `style.css` racine (sera refondu).
- **Commandes** (depuis `app/`) : `npm run dev` (serveur sur `/refrao/`), `npm run build`, `npm run check` (type-check). CI auto sur chaque push.
- **PORTAGE COMPLET** : les 5 pages sont portées sur Astro + TS.
  - `index.astro` (accueil), `auth.astro` (connexion), `progression.astro`, `apprendre.astro` (parcours + cloze + révision), `gestion.astro` (cohorte + licence + éditeur + Deezer).
  - Couche typée dans `app/src/lib/` : `firebase.ts`, `refrao.ts` (auth, données, helpers), `srs.ts` (moteur répétition espacée), `apprendre.ts` et `gestion.ts` (contrôleurs), `paths.ts`, `types.ts`.
  - Les fonctions appelées par les `onclick` inline sont exposées sur `window` (pont transitoire assumé, le redesign nettoiera).
  - `style.css` réutilisé tel quel (copie dans `app/public/`). Refonte CSS/UX = étape ultérieure.
  - **Reporté** : test de niveau (`leveltest`, stub) ; placement par auto-sélection en attendant.
  - Vérifié logged-out (rendu, interactivité, gardes) ; le flux **connecté** n'est pas testable en local (App Check bloque localhost sans jeton de débogage enregistré) — il fonctionnera en prod (même clé, même domaine que le vanilla).
- **Bascule GitHub Pages** (PAS encore faite, étape délibérée) : workflow `.github/workflows/deploy.yml` prêt (déclenchement **manuel** `workflow_dispatch`). Procédure : (1) Settings > Pages > Source = « GitHub Actions » ; (2) lancer le workflow Deploy ; (3) vérifier le site connecté en prod ; (4) si OK, retirer les fichiers vanilla de la racine. Tant que ce n'est pas fait, le site en ligne reste le vanilla et fusionner sur `main` ne change RIEN pour les utilisateurs.

## 12. Comment reprendre dans un nouveau chat
1. Le chat démarre dans `~/refrao` : `CLAUDE.md` est lu automatiquement (règles permanentes).
2. Lire ce `ETAT.md` pour l'état complet.
3. Annoncer le chantier voulu (ex : "Phase 2", "validation de schéma", "onboarding B2B").
4. Travailler sur une branche `chantier/...`, PR, merge.
