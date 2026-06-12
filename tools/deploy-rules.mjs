/* ============================================================
   refrão - Déploiement des règles Firestore (GRATUIT, local)
   ------------------------------------------------------------
   Publie firestore.rules en prod via l'API Firebase Rules, en
   utilisant la clé de service (tools/serviceAccount.json).

   Pourquoi pas `firebase deploy` ? Le CLI vérifie d'abord que
   l'API est activée (serviceusage.services.get), permission que
   le compte de service firebase-adminsdk n'a pas. L'API Rules,
   elle, est couverte par le scope `firebase` du jeton Admin.

   ⚠️ Les règles exigent une LICENCE valide pour les écritures
   gestionnaire. AVANT de publier, reprovisionner chaque
   gestionnaire existant (tools/set-manager.mjs --until ...) et
   le faire reconnecter, sinon lockout. Voir ETAT.md §8.

   Utilisation :
     node tools/deploy-rules.mjs            # publie
     node tools/deploy-rules.mjs --check    # affiche le ruleset actif, ne publie pas
   ============================================================ */

import { readFile } from 'node:fs/promises';
import { initializeApp, cert } from 'firebase-admin/app';

const PID = 'refrao-b6ae3';
const checkOnly = process.argv.includes('--check');

const sa = JSON.parse(await readFile(new URL('./serviceAccount.json', import.meta.url), 'utf8'));
const app = initializeApp({ credential: cert(sa) });
const { access_token } = await app.options.credential.getAccessToken();
const H = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };

async function activeRelease() {
  const r = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PID}/releases/cloud.firestore`, { headers: H });
  return r.ok ? r.json() : null;
}

if (checkOnly) {
  const rel = await activeRelease();
  if (!rel) { console.error('Aucune release cloud.firestore.'); process.exit(1); }
  console.log('ruleset actif :', rel.rulesetName);
  console.log('mis à jour le :', rel.updateTime);
  process.exit(0);
}

const content = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');

// 1. Créer le ruleset depuis firestore.rules
let r = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PID}/rulesets`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content }] } })
});
let j = await r.json();
if (!r.ok) { console.error('Échec création ruleset', r.status, JSON.stringify(j)); process.exit(1); }
const rulesetName = j.name;
console.log('OK  ruleset créé :', rulesetName);

// 2. Pointer la release cloud.firestore sur ce ruleset (PATCH ; create si absente)
const relName = `projects/${PID}/releases/cloud.firestore`;
r = await fetch(`https://firebaserules.googleapis.com/v1/${relName}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({ release: { name: relName, rulesetName } })
});
if (r.status === 404) {
  r = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PID}/releases`, {
    method: 'POST', headers: H, body: JSON.stringify({ name: relName, rulesetName })
  });
}
j = await r.json();
if (!r.ok) { console.error('Échec release', r.status, JSON.stringify(j)); process.exit(1); }
console.log('OK  règles publiées en prod (release cloud.firestore mise à jour).');
process.exit(0);
