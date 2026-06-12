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

   Pose aussi la LICENCE B2B : claims `plan` + `validUntil` (levier
   d'accès, vérifié par firestore.rules) et un document licenses/{uid}
   (plan, sièges, expiration, école, contact). Sert à l'onboarding ET
   au renouvellement (relancer avec un nouveau --until prolonge).

   Utilisation :
     # onboarding complet d'un client B2B (crée le compte si besoin) :
     node tools/set-manager.mjs --email prof@ecole.fr --password motdepasse6+ \
          --cohort hugo-3eB-2026 --lang pt --level A2 \
          --plan school --until 2027-09-01 --seats 30 --school "Collège Hugo"
     # renouvellement (prolonge la licence d'un compte existant) :
     node tools/set-manager.mjs --email prof@ecole.fr --until 2028-09-01
     # --until : date YYYY-MM-DD ou un nombre de jours (défaut 365).

   Après exécution, le gestionnaire doit se déconnecter/reconnecter
   (ou attendre ~1 h) pour que son token reflète les nouveaux claims.
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
const plan     = arg('plan', 'school'); // licence : type d'abonnement
const until    = arg('until');          // licence : YYYY-MM-DD ou nb de jours (défaut 365)
const seats    = parseInt(arg('seats', '30'), 10);
const school   = arg('school', '');
const contact  = arg('contact', email);

if (!email) {
  console.error('Usage: node tools/set-manager.mjs --email <email> [--password <6+>] [--cohort <code> --lang <pt> --level <A2>] [--plan school --until 2027-09-01 --seats 30 --school "..."]');
  process.exit(1);
}

/* Calcule la date d'expiration (ms epoch) de la licence. */
function computeValidUntil(v) {
  if (!v) return Date.now() + 365 * 864e5;             // défaut : 1 an
  if (/^\d+$/.test(v)) return Date.now() + parseInt(v, 10) * 864e5;  // nombre de jours
  const t = Date.parse(v);                              // date ISO YYYY-MM-DD
  if (Number.isNaN(t)) {
    console.error('--until invalide (attendu YYYY-MM-DD ou un nombre de jours).');
    process.exit(1);
  }
  return t;
}
const validUntil = computeValidUntil(until);

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

// 1. Custom claims : role:manager + licence (plan, validUntil), claims existants conservés.
await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), role: 'manager', plan, validUntil });
console.log(`OK  claims role:manager + licence (${plan}) posés sur ${email} (uid ${uid}).`);

// 2. Document utilisateur (role + cohortId si fourni)
const userDoc = { role: 'manager', email };
if (cohort) userDoc.cohortId = cohort;
await db.collection('users').doc(uid).set(userDoc, { merge: true });
console.log('OK  document users mis à jour.');

// 3. Document licence (source de vérité ops/facturation ; lisible par le gestionnaire).
//    createdAt préservé lors d'un renouvellement.
const licRef = db.collection('licenses').doc(uid);
const licSnap = await licRef.get();
const createdAt = licSnap.exists ? (licSnap.data().createdAt || Date.now()) : Date.now();
await licRef.set({
  managerUid: uid, plan, status: 'active', seats,
  validUntil, school, contactEmail: contact, createdAt, updatedAt: Date.now()
}, { merge: true });
console.log(`OK  licence ${plan} jusqu'au ${new Date(validUntil).toISOString().slice(0, 10)} (${seats} sièges).`);

// 4. Cohorte (optionnelle)
if (cohort) {
  await db.collection('cohorts').doc(cohort).set({
    code: cohort, managerUid: uid, lang, level, category: '', createdAt: Date.now()
  }, { merge: true });
  console.log(`OK  cohorte "${cohort}" créée/rattachée (lang ${lang}, niveau ${level}).`);
}

console.log('\nTerminé. Le gestionnaire doit se reconnecter pour activer son rôle et sa licence.');
process.exit(0);
