# refrão · apprendre les langues avec la musique

Plateforme d'apprentissage des langues par la musique : le refrain comme unité de mémoire, input compréhensible d'abord, rappel actif espacé, cible de réussite 80-90 %. Deux profils : apprenants (élèves, connexion anonyme via code de cohorte) et gestionnaires de cohorte (clients B2B, écoles).

> Documentation de travail : `CLAUDE.md` (règles permanentes), `ETAT.md` (état d'avancement et reprise), `GUIDE.md` (méthode). Ce README donne la vue d'ensemble.

## Stack

- **Front** : [Astro](https://astro.build) + TypeScript, sortie **100 % statique** (pas de SSR, donc pas de coût serveur). Code dans `app/`.
- **Backend** : Firebase (Auth + Firestore), projet `refrao-b6ae3`, plan **Spark (gratuit)**. App Check (reCAPTCHA v3) actif.
- **Hébergement** : GitHub Pages, `base: '/refrao'`. Déploiement continu : tout merge sur `main` publie via `.github/workflows/deploy.yml`.
- **Outils de dev** (local, gratuit) : `firebase-admin` pour le provisioning et la fabrique de chansons (`tools/`).

## Architecture des fichiers

| Chemin | Rôle |
|---|---|
| `app/src/pages/*.astro` | Pages : `index` (accueil), `auth`, `apprendre`, `gestion`, `progression` |
| `app/src/layouts/Base.astro` | Layout commun (topbar, polices, fond) |
| `app/src/lib/refrao.ts` | Couche domaine : auth/rôles (custom claims), données, CEFR/bandes, niveaux, badges, helpers |
| `app/src/lib/apprendre.ts` | Contrôleur apprenant : accueil, découverte pas à pas, exercices d'écoute, révision, gamification |
| `app/src/lib/gestion.ts` | Contrôleur gestionnaire : éditeur de chansons, import Deezer, cohorte, licence |
| `app/src/lib/srs.ts` | Moteur de répétition espacée (cartes, échéances) |
| `app/src/lib/firebase.ts` / `paths.ts` / `types.ts` | SDK Firebase typé, `withBase`, types du domaine |
| `app/public/style.css` | Design (thème sombre, système de tokens espacement/typo, 1 accent par sens) |
| `tools/import-song.mjs` | Fabrique de chansons (import enrichi karaoké + sens au mot) |
| `tools/set-manager.mjs` | Provisioning d'un gestionnaire + licence (Admin SDK) |
| `tools/deploy-rules.mjs` | Publication de `firestore.rules` |
| `firestore.rules` | Règles Firestore durcies (**source de vérité**) |

## Modèle pédagogique (résumé)

- **Bandes** : 1 = Découverte (A1-A2), 2 = Intermédiaire (B1-B2), 3 = Avancé (C1-C2). Sur les comptes ET les chansons.
- **Parcours d'une chanson** : découverte pas à pas (audio + surlignage ligne à ligne) puis exercices de cloze d'écoute, partie par partie.
- **Répétition espacée** : « 3 bonnes réponses consécutives = maîtrisée ». Paliers raté → même session ; 1 → +4 h ; 2 → +1 j ; 3 → +3 j ; entretien → +7 j. File commune à toutes les chansons, points faibles d'abord. Le blocage multi-jours est assumé (le cerveau consolide), pas un mécanisme payant.
- **Gamification** : XP, niveaux, badges, streaks, objectif du jour, combos et célébrations.
- **Reporté (assumé)** : test de niveau calibré (auto-placement pour l'instant), production audio réelle.

## Sécurité

Le socle de sécurité repose sur `firestore.rules` (publiées) + App Check. La config web Firebase n'est pas un secret : la sécurité tient aux règles, pas à l'obscurité de la clé.

- **Rôle = custom claim serveur** (`request.auth.token.role`), jamais un champ de document que le client pourrait écrire. Pas d'auto-élévation.
- **Isolation multi-tenant** : un gestionnaire n'accède qu'aux cohortes dont il est `managerUid`.
- **Licence B2B** : claims `plan` / `validUntil` ; une licence expirée coupe les écritures.
- **Validation de schéma** : liste blanche de champs (`hasOnly`), types et tailles bornées sur `users` / `cohorts` / `songs` / `progress` / `cards`.

Publier les règles (le merge GitHub n'agit PAS sur Firebase) : `node tools/deploy-rules.mjs`.

## Développement

```
# depuis app/
npm install
npm run dev      # serveur dev sur /refrao/
npm run check    # type-check (DOIT être 0 erreur avant deploy)
npm run build    # build statique -> app/dist
```

Workflow : toujours une branche `chantier/...` avant d'éditer, jamais de commit direct sur `main`. PR via `gh`, merge = déploiement automatique. Détails dans `CLAUDE.md` et `ETAT.md`.
