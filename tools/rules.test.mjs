/* ============================================================
   refrão · Tests des règles Firestore (contrat de sécurité)
   ------------------------------------------------------------
   Encode, en specs exécutables, les invariants de firestore.rules :
   pas d'auto-élévation en `manager`, isolation multi-tenant, licence
   expirée = écritures coupées, liste blanche + tailles bornées,
   pas d'énumération des cohortes, licences non écrivables côté client.

   POURQUOI un fichier séparé, non lancé par la CI actuelle :
   les règles Firestore ne se testent qu'avec l'ÉMULATEUR Firestore,
   qui exige un runtime Java (absent de la machine de dev au moment de
   l'écriture). On garde donc l'empreinte minimale : aucune dépendance
   installée par défaut. Pour exécuter :

     npm i -D @firebase/rules-unit-testing firebase-tools   # une fois
     npm run test:rules

   `test:rules` lance l'émulateur le temps des tests (cf. package.json).
   Aucune connexion au vrai projet : tout se passe en local, gratuit.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { test, before, after } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

const PROJECT_ID = 'refrao-rules-test';
const VALID = Date.now() + 365 * 864e5; // licence valide (1 an)
const EXPIRED = Date.now() - 864e5; // licence expirée (hier)

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') }
  });
});
after(async () => {
  await env?.cleanup();
});

// Contextes : un élève, un gestionnaire à licence valide, un à licence expirée.
const learner = () => env.authenticatedContext('learner1').firestore();
const manager = () =>
  env.authenticatedContext('mgr1', { role: 'manager', validUntil: VALID }).firestore();
const expiredMgr = () =>
  env.authenticatedContext('mgr2', { role: 'manager', validUntil: EXPIRED }).firestore();

// Pré-remplit la base en contournant les règles (setup uniquement).
async function seed(fn) {
  await env.withSecurityRulesDisabled(async ctx => fn(ctx.firestore()));
}

test('un élève peut créer son doc utilisateur en rôle learner', async () => {
  await assertSucceeds(
    setDoc(doc(learner(), 'users/learner1'), { role: 'learner', firstName: 'Léa', cohortId: 'demo' })
  );
});

test("un élève ne peut PAS se créer en rôle manager (pas d'auto-élévation)", async () => {
  await assertFails(setDoc(doc(learner(), 'users/learner1'), { role: 'manager' }));
});

test('un élève ne peut PAS passer son rôle à manager', async () => {
  await seed(db => setDoc(doc(db, 'users/learner1'), { role: 'learner', cohortId: 'demo' }));
  await assertFails(
    setDoc(doc(learner(), 'users/learner1'), { role: 'manager', cohortId: 'demo' })
  );
});

test("un élève ne peut PAS lire le doc utilisateur d'un autre", async () => {
  await seed(db => setDoc(doc(db, 'users/learner2'), { role: 'learner', cohortId: 'demo' }));
  await assertFails(getDoc(doc(learner(), 'users/learner2')));
});

test('un gestionnaire ne peut PAS énumérer toutes les cohortes', async () => {
  await assertFails(getDocs(collection(manager(), 'cohorts')));
});

test('get sur une cohorte par code exact est autorisé (rejoindre par lien)', async () => {
  await seed(db => setDoc(doc(db, 'cohorts/demo'), { code: 'demo', managerUid: 'mgr1' }));
  await assertSucceeds(getDoc(doc(learner(), 'cohorts/demo')));
});

test('un gestionnaire à licence valide peut écrire une chanson', async () => {
  await assertSucceeds(
    setDoc(doc(manager(), 'songs/s1'), { title: 'Teste', artist: 'X', lang: 'pt', cefr: 'A2', band: 1 })
  );
});

test('un gestionnaire à licence EXPIRÉE ne peut PAS écrire de chanson', async () => {
  await assertFails(
    setDoc(doc(expiredMgr(), 'songs/s2'), { title: 'Bloquée', artist: 'X', lang: 'pt', cefr: 'A2', band: 1 })
  );
});

test('un gestionnaire à licence EXPIRÉE ne peut PAS supprimer une chanson', async () => {
  await seed(db => setDoc(doc(db, 'songs/s3'), { title: 'A', artist: 'X', lang: 'pt', cefr: 'A2', band: 1 }));
  await assertFails(deleteDoc(doc(expiredMgr(), 'songs/s3')));
});

test('progress refuse une map songs surdimensionnée (> 2000 clés)', async () => {
  const songs = {};
  for (let i = 0; i < 2001; i++) songs['k' + i] = { completed: true };
  await assertFails(setDoc(doc(learner(), 'progress/learner1'), { xp: 1, songs }));
});

test('cards refuse une map surdimensionnée (> 5000 clés)', async () => {
  const cards = {};
  for (let i = 0; i < 5001; i++) cards['c' + i] = { type: 'mot' };
  await assertFails(setDoc(doc(learner(), 'cards/learner1'), { cards }));
});

test('progress refuse un champ hors liste blanche', async () => {
  await assertFails(setDoc(doc(learner(), 'progress/learner1'), { xp: 1, triche: true }));
});

test("personne ne peut écrire un doc de licence côté client", async () => {
  await assertFails(setDoc(doc(manager(), 'licenses/mgr1'), { plan: 'school' }));
});
