# ETAT.md · Synthèse du projet refrão

> Document de reprise. À lire en début de chat pour reprendre le travail.
> Règles permanentes : `CLAUDE.md` (lu automatiquement). Méthode de travail : `GUIDE.md`.
> Dernière mise à jour : 2026-06-14.

---

## 0. Où on en est (TL;DR)
Le produit est **en ligne et fonctionnel** (build Astro + TypeScript sur GitHub Pages, Firebase Spark gratuit). Le backend B2B sécurisé et la migration framework sont **faits**. Le gros du travail récent : une **fabrique de chansons** (import enrichi karaoké + traduction au mot, par Claude Code, sans coût), et une **refonte du parcours apprenant** (gamification addictive style Duolingo : XP/niveaux/badges/streaks/objectif du jour/combos, exercices d'écoute, blocage multi-jours par répétition espacée). Catalogue : 6 chansons portugaises en place.
**Prochaines étapes (dans d'autres chats)** : encore des passes de review du processus d'AJOUT (gestion/import) et d'APPRENTISSAGE, puis une passe OPTIMISATION / SÉCURITÉ / FIABILITÉ / DÉPLOIEMENT / SCALING.

---

## 1. Le projet en une phrase
**refrão** : plateforme d'apprentissage des langues par la musique (le refrain comme unité de mémoire, input compréhensible, répétition espacée, CEFR, cible de réussite 80-90 %). Pas un projet étudiant : une **entreprise** en construction.

## 2. Vision & modèle économique
- **Premier business : B2B**, abonnement gestionnaires / écoles. Les enseignants paient pour gérer des cohortes ; les élèves accèdent gratuitement via un code de cohorte. Marché **francophone d'abord**.
- **Priorités permanentes** (cf. `CLAUDE.md`) : sécurité maximale, coûts minimaux et repoussés (paliers gratuits le plus longtemps possible), organisation sûre, professionnalisme maximal.
- **Phases par COÛT / ÉCHELLE (décidées par Adrien)** :
  - **Phase 1 (en cours)** : app POUR LUI seul, max ~10 chansons, tout doit être PARFAIT. Contrainte dure : **0 € de plus** que l'abonnement Claude actuel. Donc Pages + Spark gratuits, et l'enrichissement des chansons passe par Claude Code (le chat), jamais par une clé API Anthropic facturée.
  - **Phase 2** : quelques amis testeurs (1-2 promos de 5 à 10 users), toujours sur GitHub, budget toléré quelques dizaines d'euros.
  - **Phase 3** : commercialisation (droits paroles réglés, fonds levés, hébergement externe type AWS). C'est là qu'arrivent le self-service manager, Stripe, RGPD complet.
- **Règle structurelle** : chaque version buildée doit être structurellement prête pour la phase suivante, sans surcoût prématuré.

## 3. Boussole PRODUIT (guide TOUS les choix UX)
- **Persona : l'utilisateur basique**, fatigué, peu concentré, distrait. Test permanent : « le comprend-il en 1 seconde sans réfléchir ? ». Mots simples et concrets + repères visuels (pas de jargon, pas d'abstraction). Une seule action évidente par écran. Toujours un prochain pas unique et clair.
- **Rétention addictive à l'état de l'art** (inspiration Duolingo / Meta) : streaks, récompenses variables, célébrations, micro-objectifs, boucles courtes, friction minimale.
- **Différenciation vs Duolingo** (à garder en tête) : (1) le contenu est de la VRAIE musique, la chanson est la récompense et le but ; (2) contexte B2B école ; (3) cœur = répétition espacée, donc le **blocage multi-jours est honnête** (« reviens demain, ton cerveau consolide »), PAS des cœurs/énergie payants ; (4) accroche émotionnelle (aimer la chanson, comprendre enfin les paroles).
- **Tu / Vous** : l'ÉLÈVE (app Apprendre) au **tutoiement** ; le PROF / gestionnaire (espace Gestion, client B2B) au **vouvoiement**.
- **Jamais de tiret cadratin** nulle part (préférence d'Adrien ; utiliser « · », « : » ou « , ») ; copie courte (« le site parle trop » = à éviter).

## 4. Stack, hébergement & déploiement
- **Front** : **Astro + TypeScript**, sortie 100 % statique (pas de SSR = pas de coût serveur), `base: '/refrao'`. App dans `app/`.
- **Backend** : **Firebase** (Auth + Firestore), projet `refrao-b6ae3`, plan **Spark (gratuit)**. App Check (reCAPTCHA v3) actif.
- **Hébergement** : **GitHub Pages**, repo public `adrienrochestudio/refrao`, branche `main`. Source Pages = GitHub Actions.
- **Déploiement CONTINU** : tout merge sur `main` publie via `.github/workflows/deploy.yml` (~1-3 min). Les chansons sont des **données Firestore**, donc servies au live **sans redéploiement**.
- **Outils de dev** (local, gratuit) : `firebase-admin` + `@anthropic-ai/sdk` (devDeps racine). `node_modules/` ignoré par git.

## 5. URLs & accès clés
- Site : https://adrienrochestudio.github.io/refrao/
- Repo : https://github.com/adrienrochestudio/refrao
- Compte gestionnaire démo : `adrien.etks@gmail.com` (mdp connu d'Adrien), uid `DoB6EYKcJ5N5iPjbzGTwUyN8D2h2`, cohorte `demo2026` (pt, A2), licence school jusqu'au 2027-09-01.
- Pas de domaine perso (plus tard).

## 6. Architecture des fichiers
| Chemin | Rôle |
|---|---|
| `app/src/pages/*.astro` | Pages : `index` (accueil 2 boutons), `auth`, `apprendre`, `gestion`, `progression` |
| `app/src/layouts/Base.astro` | Layout commun (topbar, polices, fond) |
| `app/src/lib/refrao.ts` | Couche domaine : auth/rôles (custom claims), données, CEFR/bandes, `songMeters`, `levelInfo`, `badgeList`, helpers |
| `app/src/lib/apprendre.ts` | Contrôleur apprenant (accueil, parcours, découverte pas à pas, cloze d'écoute, révision, gamification) |
| `app/src/lib/gestion.ts` | Contrôleur gestionnaire (éditeur de chansons, import Deezer, cohorte, licence) |
| `app/src/lib/srs.ts` | Moteur de répétition espacée (cartes, échéances, `sectionReady`/`sectionDueAt`) |
| `app/src/lib/firebase.ts` / `paths.ts` / `types.ts` | SDK Firebase typé / `withBase` / types du domaine |
| `app/public/style.css` | Design (thème sombre, accents bleu/vert/violet) |
| `tools/import-song.mjs` | **Fabrique de chansons** (import enrichi, §8) |
| `tools/set-manager.mjs` | Provisioning gestionnaire + licence (Admin SDK) |
| `tools/deploy-rules.mjs` | Publication de `firestore.rules` |
| `firestore.rules` | Règles Firestore durcies (source de vérité, déjà publiées) |

> Dette transitoire assumée : les fonctions appelées par des `onclick` inline sont exposées sur `window`. À nettoyer au redesign.

## 7. Modèle de données (Firestore)
- `users/{uid}` : `{ role, email|firstName/lastName, lang, cohortId, cefr, band, streak, createdAt }`
- `cohorts/{code}` : `{ code, managerUid, lang, level, category, createdAt }`
- `songs/{id}` : `{ title, artist, lang, cefr, band, genre, tags, sections, deezer, deezerId, cover, preview, pairs, synced, source, youtubeId, offset }`
  - `sections:[{ type:'refrain'|'couplet', lines:[{ pt, fr, t?, words?:[{w,lemma,gloss,t?}] }] }]` : **source unique des paroles**. `t` = timecode (s, plein morceau) pour le karaoké ; `words` = sens au mot en contexte. `pt`/`fr` = texte d'origine / glose française.
  - `pairs:[{pt,fr}]` = vocabulaire clé (cartes SRS / cloze). `youtubeId` = lecture + synchro audio.
- `progress/{uid}` : `{ xp, songs:{[id]:{discovered, shadow, completed, full, clozeLevel}}, recent:[0/1] }`
- `cards/{uid}` : `{ cards:{[cardId]:{type, text, trad, songId, sectionType, streak, lapses, state, due}} }`
- ⚠️ `firestore.rules` valide les champs par **liste blanche `hasOnly`**. Ajouter un champ Firestore = mettre à jour les règles, sinon l'écriture client est rejetée. (L'Admin SDK contourne les règles ; l'import via `import-song.mjs` n'a donc pas eu besoin de toucher les règles.)
- Données dérivées sans champ Firestore (pour rester dans le `hasOnly`) : badges et objectif du jour calculés / stockés en `localStorage` (`refrao_badges`, `refrao_daily`).

## 8. Fabrique de chansons (import enrichi) · `tools/import-song.mjs`
But : importer une chanson prête (karaoké synchro + traduction au mot) à partir d'un simple lien Deezer, **sans coût**.
- **Pipeline** : métadonnées Deezer + paroles SYNCHRONISÉES via **LRCLIB** (gratuit, timecodes) + enrichissement (segmentation refrain/couplet, traduction fr par ligne, lemme + sens en contexte par mot, vocab, CEFR). Écrit `songs/{id}` via Admin SDK.
- **Enrichissement SANS clé API (Phase 1)** : flux en 2 temps.
  1. `node tools/import-song.mjs --prep --deezer <url|--title/--artist> --lang pt --youtube <url|id>` -> écrit `tools/song-prep.json` (paroles numérotées).
  2. Dans le chat, demander à Claude Code d'enrichir `song-prep.json` (remplir le champ `enriched`).
  3. `node tools/import-song.mjs --commit [--dry]` -> assemble + écrit dans Firestore.
  - Repli : `--lyrics-file <chemin>` si LRCLIB n'a pas les paroles (collage manuel, non synchronisé).
  - Le chemin clé API (`enrich()` + `ANTHROPIC_API_KEY`) existe mais n'est PAS le défaut (réservé Phase 2/3 ; Adrien ne veut pas payer de clé).
- **Genres = styles** : `GENRES` (dans `refrao.ts`) sert au genre de la chanson ET à la catégorie de cohorte ; le filtre apprenant fait `s.genre === cohort.category`, donc **un élève ne voit que les chansons de son style**. Styles brésiliens ajoutés (MPB, Samba, Bossa Nova, Sertanejo, Forró, Pagode, Axé, Funk, Tropicália). Mettre un genre EXACT de la liste.
- **Catalogue actuel (6 chansons PT, en ligne)** : Ai Se Eu Te Pego (Michel Teló, Sertanejo, A2) · Pagode Russo (Luiz Gonzaga, Forró, A2) · Lança Perfume (Rita Lee, Rock, B1) · Construção (Chico Buarque, MPB, C1) · Subirusdoistiozin (Criolo, Hip-hop, C1) · Convoque Seu Buda (Criolo, Hip-hop, C1).
- **À noter** : calage karaoké si une vidéo YouTube a une intro -> champ `offset`. Vidéo bloquée à l'embed -> changer d'id (`--commit --youtube <autre-id>`). Argot Criolo : nuances à vérifier par Adrien.

## 9. Parcours apprenant (gamification) · `apprendre.ts`
Refonte orientée persona (§3). Ce qui est en place :
- **Accueil linéaire** : une seule action évidente (révision prioritaire si cartes dues, sinon Continuer/Commencer une chanson), salutation + **objectif du jour** (barre, 3 activités/jour, célébration), bandeau **niveau/XP** + **streak** ; liste « Tes chansons » allégée (jauges difficulté/longueur/vocabulaire déplacées sur le DÉTAIL de la chanson). Entrée animée (stagger).
- **Découverte PAS À PAS** : une partie (refrain/couplet) par écran, l'audio se lance seul + surlignage ligne par ligne (lecteur YouTube caché `exAudio`), étincelle à chaque « Suivant ». (L'ancien karaoké visible a été retiré.)
- **Exercice = focus total** : cloze d'ÉCOUTE (bouton « Écouter le vers », audio auto), validation en UN tap (mode choix), feedback animé. Aucun bouton à part « Valider » (type) / retour. Pas de chrome de progression pendant l'exercice.
- **Machine à dopamine** : « +XP » qui jaillit (reste affiché ~2 s, survit au changement de question), COMBOS (« N d'affilée ! » + bonus), confettis au level-up et à la maîtrise.
- **XP / niveaux / hauts faits** : XP attribué (réponses, maîtrise, révision, découverte), `levelInfo` (paliers 100*L), 9 badges (`badgeList`) sur la page Progression, XP omniprésent (accueil + parcours + progression + fins).
- **Blocage MULTI-JOURS (différenciateur)** : on fait respecter les échéances de répétition espacée (`srs.ts` : 4h -> 1j -> 3j -> 7j). Une partie travaillée passe « En repos » (icône horloge, « Reviens demain ») jusqu'à son échéance. Maîtriser une partie = plusieurs séances espacées, pas du bachotage. Honnête, gratuit.
- **Limite connue** : le flux CONNECTÉ n'est pas testable en local (App Check bloque localhost). On déploie et Adrien regarde le live.

## 10. Sécurité (déployé et actif en prod)
- **Rôle via custom claim serveur** (`request.auth.token.role`), jamais un champ client. Pas d'auto-élévation.
- **Isolation multi-tenant** : un gestionnaire n'accède qu'aux cohortes dont il est `managerUid`.
- **Licence B2B** = levier d'accès : claims `plan`/`validUntil` + doc `licenses/{uid}` ; `validUntil` dépassé => écritures coupées par les règles.
- **Validation de schéma** (`hasOnly`, types, tailles) sur `users`/`cohorts`/`songs`/`progress`/`cards`.
- **App Check** (reCAPTCHA v3) enforcement ON sur Firestore + Auth. Clé API restreinte aux référents `adrienrochestudio.github.io/*`. Auth : Email + Anonyme.
- ⚠️ Avant de (re)publier des règles plus strictes : reprovisionner CHAQUE gestionnaire (`set-manager.mjs`) et le faire reconnecter, sinon lockout.

## 11. Provisionner un gestionnaire (Admin SDK, gratuit)
Prérequis : `tools/serviceAccount.json` (clé privée, ignorée par git), `npm install` fait.
```
node tools/set-manager.mjs --email <e> --password <6+ si nouveau> \
     --cohort <code> --lang pt --level A2 --plan school --until 2027-09-01 --seats 30 --school "..."
# renouvellement : relancer avec --until <YYYY-MM-DD ou nb de jours>
```
Le gestionnaire doit se reconnecter pour activer ses claims.

## 12. Workflow Git & règles (non négociable)
- **Toujours une branche `chantier/...` AVANT d'éditer.** Piège vécu : après un merge on revient sur `main` ; ne JAMAIS committer dessus. Réflexe : `git checkout -b chantier/...` en premier.
- PR via `gh`, `gh pr merge --merge --delete-branch`, puis `git checkout main && git pull`. Commits en français, trailer `Co-Authored-By: Claude ...`.
- **`npm run build` (Astro) transpile SANS type-check.** Toujours lancer `npm run check` (0 erreur) AVANT de déployer (des erreurs de type ont déjà filé en prod sinon).
- Publier les règles Firestore (le repo/merge n'agit PAS sur Firebase) : `node tools/deploy-rules.mjs` (`--check` pour voir la release active).

## 13. Ce qui est FAIT
- Audit, sécurité durcie + publiée, socle B2B (licences/entitlements), validation de schéma.
- Migration Astro + TypeScript COMPLÈTE (5 pages portées, bascule du live faite, ancien vanilla supprimé).
- Fabrique de chansons (import enrichi karaoké + sens au mot) ; 6 chansons en ligne ; taxonomie de styles + filtre par style.
- Refonte du parcours apprenant : gamification complète (XP/niveaux/badges/streaks/objectif du jour/dopamine/combos), exercices d'écoute, découverte pas à pas, accueil linéaire, blocage multi-jours, accueil 2 boutons, vouvoiement Gestion, tirets retirés.

## 14. Ce qui RESTE (par priorité)
- **Passes de review (prochaines, autres chats)** : continuer à simplifier/linéariser le **processus d'apprentissage** (moins de texte, plus direct, s'inspirer des meilleures apps) et revoir le **processus d'AJOUT** (gestion/import : le rendre fluide). Garder la boussole §3.
- **Puis passe OPTIMISATION / SÉCURITÉ / FIABILITÉ / DÉPLOIEMENT / ANTICIPATION SCALING** (autre chat) avant d'élargir.
- **Bloquants de COMMERCIALISATION (Phase 3, hors code)** : RGPD (données d'élèves possiblement mineurs), droits sur les paroles (œuvres protégées). Puis Stripe (exige un backend payant), domaine perso, self-service manager (clé API ou Cloud Function).
- **Divers** : tirets cadratins encore présents dans certains labels Gestion à finir de nettoyer ; calibrer le test de niveau (`leveltest`, stub) ; `README.md` décrit encore le vanilla.

## 15. Comment reprendre dans un nouveau chat
1. Le chat démarre dans `~/refrao` : `CLAUDE.md` lu automatiquement (règles permanentes).
2. Lire ce `ETAT.md` (état complet) et `GUIDE.md` (méthode).
3. Annoncer le chantier, créer une branche `chantier/...` AVANT d'éditer.
4. Vérifier (`npm run check` 0 erreur + `npm run build`), PR, merge (= déploiement auto). Tenir cet `ETAT.md` à jour en fin de chantier.

## 16. Commandes utiles
```
# app (depuis app/)
npm run dev      # serveur dev sur /refrao/
npm run check    # type-check (DOIT être 0 erreur avant deploy)
npm run build    # build statique -> app/dist

# fabrique de chansons (depuis la racine)
node tools/import-song.mjs --prep --deezer <url> --lang pt --youtube <url>   # puis enrichir dans le chat
node tools/import-song.mjs --commit [--dry]

# provisioning / règles (depuis la racine, serviceAccount.json requis)
node tools/set-manager.mjs --email <e> --until 2027-09-01 --school "<nom>"
node tools/deploy-rules.mjs [--check]
```
