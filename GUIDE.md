# GUIDE.md - refrão : synthèse + méthode de travail

> À coller/lire en début de chat pour repartir vite et bien.
> État détaillé : `ETAT.md`. Règles permanentes : `CLAUDE.md`.
> Dernière mise à jour : 2026-06-12.

---

## 1. Où en est le projet (synthèse)

- **Produit** : plateforme d'apprentissage des langues par la musique. Entreprise B2B (écoles paient, apprenants gratuits via code de cohorte). Marché francophone d'abord.
- **Live** : https://adrienrochestudio.github.io/refrao/ sert désormais le **build Astro** (bascule faite le 2026-06-12). Déploiement continu via `.github/workflows/deploy.yml` (merge sur `main` = publication).
- **Stack** : Astro + TypeScript (statique, GitHub Pages, gratuit), Firebase (Auth + Firestore, plan Spark). App dans `app/` ; couche typée dans `app/src/lib/` (`firebase.ts`, `refrao.ts`, `srs.ts`, `apprendre.ts`, `gestion.ts`, `paths.ts`, `types.ts`).
- **Sécurité (en prod)** : rôles + entitlements par **custom claims serveur** (jamais le client) ; règles Firestore durcies (isolation multi-tenant, validation de schéma `hasOnly`, licence requise pour écrire) ; App Check (reCAPTCHA v3) actif. Provisioning via `tools/set-manager.mjs` (Admin SDK local, gratuit). Déploiement des règles : `tools/deploy-rules.mjs`.
- **B2B** : modèle de licence (`plan`, `validUntil` en claim + doc `licenses/{uid}`) ; expiration = écritures coupées. Paiements (Stripe) différés.
- **Fait** : audit, sécurité, assainissement, validation schéma, socle B2B, migration Astro+TS **complète** (5 pages portées + en ligne).
- **Reste** : confirmer un parcours connecté réel en prod ; refonte CSS/UX ; nettoyer la dette transitoire (handlers sur `window`, doublon `style.css`) ; calibrer le test de niveau (`leveltest`, stub) ; plus tard RGPD + droits paroles (bloquants de commercialisation, hors code), Stripe, domaine perso.

## 2. Décisions actées (ne pas re-débattre)

- Séquencement : backend B2B durable → migration framework+TS → refonte produit. (les deux premiers faits)
- Framework : **Astro + TypeScript**, sortie statique. Pas de SSR (coût).
- Le **français est la langue pivot** des traductions (champ `fr`) ; à rouvrir seulement pour l'international.
- Pas d'inscription gestionnaire libre-service : comptes provisionnés serveur.

## 3. Méthode de travail (efficace, ambitieuse, sûre, pro)

### Efficacité tokens (priorité)
- **Ne relis pas** un fichier déjà lu/édité ce chat (le harness traque l'état). Pas de relecture "pour vérifier".
- **Lis ciblé** : `offset`/`limit`, ou `grep`/`Glob` plutôt que lire des fichiers entiers. Évite d'afficher de gros fichiers (ex : ne jamais `cat` un `settings.json` massif).
- Préfère `gh ... --json ... -q` et `| tail` pour des sorties courtes. Pas de dumps bruts.
- **Batch** les commandes indépendantes en un seul appel ; lance les outils indépendants en parallèle.
- Ne narre pas chaque micro-étape. Une phrase d'intention, puis l'action.
- Décision avant lecture : si tu sais déjà quoi faire, agis. Ne sur-explore pas.

### Autonomie (God Mode actif)
- Exécute toute la chaîne (branche → commit → push → PR → merge → déploiement) **sans demander**. Rapporte ce qui a été fait.
- Réserve un simple signalement (pas un blocage) aux portes à sens unique lourdes (suppression de données prod, bascule client-facing).

### Workflow git (non négociable)
- **Toujours créer une branche `chantier/...` AVANT d'éditer.** Piège vécu : après un merge, on revient sur `main` ; ne pas committer dessus. Réflexe : `git checkout -b chantier/...` en premier.
- PR via `gh`, merge `--delete-branch`, puis `git checkout main && git pull`.
- Commits en français, clairs. Trailer `Co-Authored-By: Claude ...`.

### Sécurité (le doute profite à la sécurité)
- Jamais d'autorité côté client (rôles/licences = claims serveur). Vérifier les règles avant de publier.
- Avant de publier des règles qui durcissent l'accès : reprovisionner les comptes impactés d'abord (sinon lockout). Cf. `ETAT.md` §8.
- Coûts : rester sur les paliers gratuits (Pages, Spark). Pas de Blaze/service payant sans accord.

### Professionnalisme & vérification
- Portage/refactor = **fidèle au comportement** ; pas de code mort ; documenter les décisions dans `ETAT.md` et la mémoire.
- Vérifier ce qui est vérifiable : `npm run check` (0 erreur) + `npm run build` + garde (déconnecté → `/auth`) + `curl` ciblé du live. Screenshot seulement quand le visuel compte ; ne pas multiplier les captures.
- Limite connue : le flux **connecté** n'est pas testable en local (App Check bloque localhost). S'appuyer sur une logique répliquée fidèlement ; le prod (même domaine/clé) fait foi.

## 4. Commandes utiles

```
# app (depuis app/)
npm run dev      # serveur dev sur /refrao/
npm run check    # type-check (doit être 0 erreur)
npm run build    # build statique -> app/dist

# règles & provisioning (depuis la racine, clé tools/serviceAccount.json requise)
node tools/deploy-rules.mjs            # publie firestore.rules
node tools/deploy-rules.mjs --check    # ruleset actif
node tools/set-manager.mjs --email <e> --until 2027-09-01 --school "<nom>"  # onboarding/renouvellement licence

# déploiement site : automatique au merge sur main (workflow Deploy)
```

## 5. Démarrer un chat

1. Lire ce `GUIDE.md` puis `ETAT.md`. `CLAUDE.md` est chargé automatiquement.
2. Annoncer le chantier. Créer une branche `chantier/...` **avant** d'éditer.
3. Travailler, vérifier, PR, merge. Tenir `ETAT.md` à jour en fin de chantier.
