# ETAT.md - Suivi d'avancement refrão

> Fichier de reprise entre les chats. À mettre à jour en fin de session.
> Voir `CLAUDE.md` pour les règles permanentes.

## Dernière mise à jour
2026-06-12 - Audit + fondations + Phase 1 (code prêt, déploiement Firebase à faire).

## Branche de travail
`chantier/fondations-securite` (rien n'est encore poussé ni fusionné).

## Fait
- Audit complet du code (9 fichiers lus).
- Créé `CLAUDE.md` (règles permanentes), `.gitignore`, ce `ETAT.md`.
- Créé `firestore.rules` : version durcie cible (NON déployée, voir séquence ci-dessous).
- `core.js` : le rôle est désormais lu depuis le custom claim serveur (infalsifiable) ; il prime sur le champ du document. Rétrocompatible tant que les règles ne sont pas publiées.
- Créé `tools/set-manager.mjs` : script de provisioning gratuit (pose le claim role:manager, crée la cohorte/le doc).
- Supprimé `admin.html` (code mort cassé, référencé nulle part).

## Failles identifiées (rappel, détail dans l'audit)
1. CRITIQUE - élévation de privilège : client peut se déclarer `manager`.
2. ÉLEVÉ - pas d'isolation multi-tenant : un gestionnaire lit les données d'autres cohortes.
3. ÉLEVÉ - cohorts énumérables publiquement + création libre.
4. ÉLEVÉ - aucune validation de schéma.
5. MOYEN - pas d'App Check ; clé API et domaines Auth non verrouillés.
6. MOYEN - `admin.html` mort et cassé, à supprimer.
7. DETTE - double modèle de données, libellés multilingues codés en dur, leveltest stub.
8. JURIDIQUE - RGPD (apprenants mineurs), droits sur les paroles.

## Phase 1 sécurité : DÉPLOYÉE ET VÉRIFIÉE (2026-06-12) - COMPLÈTE
- Provisioning FAIT : compte adrien.etks@gmail.com, claim role:manager, cohorte demo2026 (pt, A2), uid DoB6EYKcJ5N5iPjbzGTwUyN8D2h2.
- Règles Firestore durcies PUBLIÉES en prod.
- Fournisseurs Auth activés : Email/mot de passe + Anonyme.
- VÉRIFIÉ en prod : connexion gestionnaire OK + arrivée apprenant (code demo2026) OK.
- Faille d'élévation de privilège fermée ; isolation multi-tenant en place.
- Site en ligne : https://adrienrochestudio.github.io/refrao/ (pas de domaine perso).

## Workflow Git + déploiement : FAIT (2026-06-12)
- Homebrew + gh installés, gh authentifié (compte adrienrochestudio).
- Travail commité en 2 commits, PR #1 fusionnée sur main, branche nettoyée.
- Déploiement vérifié en prod : nouveau core.js en ligne (claim), admin.html en 404.
- Le projet a désormais un vrai historique Git (fini les "Add files via upload").

ATTENTION : depuis la publication, l'inscription gestionnaire en libre-service ne fonctionne plus (création de cohorte réservée aux comptes déjà manager). Voulu pour le B2B : les gestionnaires sont provisionnés via tools/set-manager.mjs. Onboarding payant = Phase 3.

## Durcissements sécurité (2026-06-12)
- Point 1 (domaines Auth) : VÉRIFIÉ, rien à faire (la liste ne sert qu'à l'OAuth ; refrão n'utilise qu'email + anonyme). À refaire si on ajoute "Connexion Google" : ajouter adrienrochestudio.github.io.
- Point 2 (clé API) : FAIT. Browser key restreinte aux référents HTTP https://adrienrochestudio.github.io/* (Google Cloud). Testé OK.
- Point 3 (App Check) : EN COURS. reCAPTCHA v3 créé + enregistré dans Firebase (clé secrète côté Firebase, clé de site dans core.js). SDK App Check intégré dans core.js (init non bloquante). Reste : déployer, vérifier en monitoring, puis activer l'enforcement (Firestore + Auth).

## Prochaine étape (au choix, rien d'urgent)
- PHASE 2 : unifier le double modèle de données (sections vs pt/fr/pairs), corriger les libellés multilingues codés en dur, retirer la dette.
- PHASE 3 : socle B2B (entitlements/licences), comptes persistants, RGPD, droits paroles.
- PHASE 4 : migration vers un framework (build + CI/CD).

## Notes / décisions en attente
- Validation de schéma fine dans les règles : à ajouter après l'étape 1-2 (champs et tailles autorisés).
- Modèle d'abonnement B2B, RGPD, droits paroles : Phase 3, à cadrer avec Adrien.
- GitHub CLI (`gh`) pas encore installé ; Homebrew absent. À faire avant le premier push.

## Backlog (phases suivantes)
- Phase 2 : unifier le modèle de données, corriger les libellés multilingues, retirer le code mort, linter/formateur.
- Phase 3 : socle B2B (entitlements/licences), comptes persistants, conformité RGPD, droits paroles.
- Phase 4 : migration progressive vers un framework (build + CI/CD).
