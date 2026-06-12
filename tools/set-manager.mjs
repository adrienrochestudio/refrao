/* ============================================================
   refrão - Provisioning d'un gestionnaire (GRATUIT, local)
   ------------------------------------------------------------
   Pose le custom claim { role: 'manager' } sur un compte, et
   (option) crée sa cohorte + son document utilisateur.
   Le claim est la SEULE source de vérité du rôle : un client ne
   peut jamais se l'attribuer. Voir CLAUDE.md et firestore.rules.

   Prérequis (une seule fois) :
     1. Console Firebase > Paramètres du projet > Comptes de
        service > Générer une nouvelle clé privée.
     2. Enregistrer le fichier sous: tools/serviceAccount.json
        (déjà ignoré par git, ne JAMAIS le committer).
     3. Depuis ~/refrao :  npm init -y && npm install firebase-admin

   Utilisation :
     node tools/set-manager.mjs --email prof@ecole.fr
     node tools/set-manager.mjs --email prof@ecole.fr \
          --cohort hugo-3eB-2026 --lang pt --level A2
     # créer le compte s'il n'existe pas encore :
     node tools/set-manager.mjs --email prof@ecole.fr --password motdepasse6+ \
          --cohort hugo-3eB-2026

   Après exécution, le gestionnaire doit se déconnecter/reconnecter
   (ou attendre ~1 h) pour que son token reflète le nouveau claim.
   ============================================================ */

import { readFile } from 'node:fs/promises';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function arg(name, def = null) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const email    = arg('email');
const password = arg('password');       // optionnel : crée le compte s'il n'existe pas
const cohort   = arg('cohort');         // optionnel : crée/rattache la cohorte
const lang     = arg('lang', 'pt');
const level    = arg('level', 'A2');

if (!email) {
  console.error('Usage: node tools/set-manager.mjs --email <email> [--cohort <code> --lang <pt> --level <A2>]');
  process.exit(1);
}

const KEY_PATH = new URL('./serviceAccount.json', import.meta.url);
let serviceAccount;
try {
  serviceAccount = JSON.parse(await readFile(KEY_PATH, 'utf8'));
} catch {
  console.error('Clé de service introuvable. Place-la dans tools/serviceAccount.json (voir en-tête du script).');
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();

let user = await auth.getUserByEmail(email).catch(() => null);
if (!user) {
  if (!password) {
    console.error('Aucun compte avec cet email. Relance avec --password <6+ caractères> pour le créer.');
    process.exit(1);
  }
  user = await auth.createUser({ email, password });
  console.log(`OK  compte créé pour ${email}.`);
}
const uid = user.uid;

// 1. Custom claim role:manager (en conservant les claims existants)
await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), role: 'manager' });
console.log(`OK  claim role:manager posé sur ${email} (uid ${uid}).`);

// 2. Document utilisateur (role + cohortId si fourni)
const userDoc = { role: 'manager', email };
if (cohort) userDoc.cohortId = cohort;
await db.collection('users').doc(uid).set(userDoc, { merge: true });
console.log('OK  document users mis à jour.');

// 3. Cohorte (optionnelle)
if (cohort) {
  await db.collection('cohorts').doc(cohort).set({
    code: cohort, managerUid: uid, lang, level, category: '', createdAt: Date.now()
  }, { merge: true });
  console.log(`OK  cohorte "${cohort}" créée/rattachée (lang ${lang}, niveau ${level}).`);
}

console.log('\nTerminé. Le gestionnaire doit se reconnecter pour activer son rôle.');
process.exit(0);
