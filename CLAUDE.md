# CLAUDE.md - Règles permanentes du projet refrão

> Ce fichier est lu automatiquement par Claude au début de chaque session.
> Il contient les règles, le contexte et les conventions à respecter en permanence.
> Tenir ce fichier à jour. Pour l'état d'avancement, voir `ETAT.md`.

## 1. Projet & vision
- **refrão** : plateforme d'apprentissage des langues par la musique (le refrain comme unité de mémoire, input compréhensible, rappel actif espacé, cible de réussite 80-90 %).
- Ce n'est **pas** un projet étudiant. C'est une **entreprise** en construction.
- **Premier business : B2B**, abonnement pour gestionnaires / écoles. Les enseignants paient pour gérer des cohortes ; les apprenants accèdent gratuitement via un code de cohorte.
- **Cap technique long terme** : migration progressive depuis le site statique actuel vers une vraie application (build + framework). À faire sans précipitation et sans surcoût prématuré.

## 2. Priorités permanentes (ordre d'importance)
1. **Sécurité maximale.** Aucune faille connue laissée ouverte. Le doute profite à la sécurité.
2. **Coûts et investissements minimaux, repoussés au plus tard.** Rester sur les paliers gratuits (GitHub Pages, Firebase Spark) le plus longtemps possible. Tout engagement payant doit être justifié et différé.
3. **Organisation la plus sûre possible.** Branches, revue, rien en production sans validation.
4. **Professionnalisme maximal.** Code propre, conventions tenues, pas de bricolage.

## 3. Stack actuelle
- Front : HTML / CSS / JS **vanilla**, aucun build, aucune dépendance npm.
- Backend : **Firebase** (Auth + Firestore), projet `refrao-b6ae3`, plan **Spark (gratuit)**.
- Hébergement : **GitHub Pages** (repo public `adrienrochestudio/refrao`). Firebase exige `https://`.
- Fichiers clés : `core.js` (config, auth, rôles, modèle), `srs.js` (répétition espacée), `exercises.js`, `learn.js`, `leveltest.js` (stub), `gestion.html` (espace gestionnaire), `apprendre.html` (apprenant).

## 4. Règles de sécurité (non négociables)
- **Les rôles ne sont JAMAIS contrôlés par le client.** Un utilisateur ne doit jamais pouvoir se déclarer `manager`. Le rôle se fait par custom claims serveur / provisioning, pas par écriture Firestore.
- **Isolation multi-tenant stricte.** Un gestionnaire n'accède qu'aux données des cohortes qu'il possède. Jamais celles d'un autre client.
- **Validation de schéma** dans les règles Firestore (champs et tailles autorisés).
- **App Check activé**, clé API restreinte (référents HTTP), domaines Auth verrouillés.
- Aucun secret dans le repo (voir `.gitignore`). La config Firebase web n'est pas un secret, mais la sécurité repose entièrement sur les règles + App Check.
- **RGPD** : données d'apprenants (potentiellement mineurs) = base légale, consentement, durée de conservation, registre. À traiter avant toute commercialisation.
- **Droits sur les paroles** : œuvres protégées ; cadrer les licences avant de monétiser.

## 5. Règles de coûts
- Par défaut : **plan gratuit uniquement**. Ne jamais activer Firebase Blaze sans accord explicite d'Adrien.
- Pas de service tiers payant sans justification et validation.
- Minimiser les lectures/écritures Firestore (impact quota et future facture).

## 6. Conventions de code
- Garder le style existant tant qu'on n'a pas migré : pas de framework introduit à la légère.
- Échapper toute donnée affichée (`R.esc`).
- Pas de code mort : supprimer ce qui n'est plus utilisé.
- Un seul modèle de données par entité (en cours d'unification : `sections` remplace l'ancien `pt`/`fr`/`pairs`).

## 7. Workflow Git
- Toujours travailler sur une **branche** (`chantier/...`), jamais directement sur `main`.
- Commits clairs en français. Pas d'upload manuel via l'interface web GitHub.
- Pousser et fusionner **seulement quand Adrien le demande**.

## 8. Économie de tokens / organisation des chats
- Lire seulement les fichiers nécessaires à la tâche en cours.
- Tenir `ETAT.md` à jour en fin de session pour reprendre vite au chat suivant.
- Ce `CLAUDE.md` étant versionné, **il n'y a rien à réuploader** au début d'un chat.

## 9. Comportement attendu de Claude
- **Être autonome.** Ne pas redemander les autorisations à chaque action courante.
- Demander l'avis d'Adrien seulement pour les décisions stratégiques ou les actions irréversibles / externes.
- **Ne jamais utiliser le caractère tiret cadratin** dans les réponses (préférence d'Adrien).

## 10. Glossaire métier
- **Cohorte** : groupe d'apprenants rattaché à un gestionnaire, identifié par un code.
- **Gestionnaire (manager)** : enseignant / client B2B qui gère une cohorte et la banque de chansons.
- **Apprenant (learner)** : élève, connexion anonyme via code de cohorte.
- **Bande** : niveau de difficulté (1 Découverte A1-A2, 2 Intermédiaire B1-B2, 3 Avancé C1-C2).
- **Carte** : unité de mémoire (mot ou phrase) suivie par le moteur de répétition espacée.
- **Section** : refrain ou couplet d'une chanson.
