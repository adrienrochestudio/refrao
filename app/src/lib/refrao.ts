// Couche domaine typée au-dessus de Firebase. Port progressif de l'ancien core.js
// vers TypeScript ; on n'expose ici que ce dont les pages portées ont besoin.
import {
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  signInAnonymously,
  type User
} from 'firebase/auth';
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { withBase } from './paths';
import type { Song, Section, Progress, Profile, Entitlement, Cohort, Streak, Learner, License } from './types';

/* ---- langues ---- */
export const LANGS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'en', label: 'Anglais' },
  { code: 'pt', label: 'Portugais' },
  { code: 'es', label: 'Espagnol' },
  { code: 'de', label: 'Allemand' }
];
export const langLabel = (code?: string): string =>
  LANGS.find(l => l.code === code)?.label ?? code ?? '';

/* ---- CEFR / bandes / placement / genres ---- */
export const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const GENRES = [
  // Styles brésiliens en tête (catalogue lusophone d'abord). Valeurs exactes :
  // le genre d'une chanson DOIT correspondre à la catégorie de cohorte (filtre apprenant).
  'MPB',
  'Samba',
  'Bossa Nova',
  'Sertanejo',
  'Forró',
  'Pagode',
  'Axé',
  'Funk',
  'Tropicália',
  // Styles génériques (autres langues / international).
  'Pop',
  'Rock',
  'Hip-hop',
  'R&B / Soul',
  'Électro',
  'Jazz',
  'Classique',
  'Folk / Acoustique',
  'Latino',
  'Reggae',
  'Variété',
  'Bande originale',
  'Autre'
];
export const genId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const bandOf = (cefr: string): number => {
  const i = CEFR.indexOf(cefr as (typeof CEFR)[number]);
  return i < 2 ? 1 : i < 4 ? 2 : 3;
};
const BANDS: Record<number, string> = { 1: 'Découverte', 2: 'Intermédiaire', 3: 'Avancé' };
export const bandName = (b: number): string => BANDS[b] ?? 'Découverte';
// Auto-placement apprenant (en attendant la calibration du test de niveau).
export const PLACEMENT: Record<string, string> = { debutant: 'A2', intermediaire: 'B1', avance: 'C1' };

/* ---- identifiant de cohorte normalisé ---- */
export const slug = (s: string): string =>
  (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/* ---- utilitaires ---- */
const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown): string =>
  (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ENT[c] ?? c);

// Normalisation (sans accents, minuscule, sans ponctuation) — identique à l'ancien core.js.
export const fold = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
export const norm = (s: unknown): string =>
  fold(s)
    .toLowerCase()
    .trim()
    .replace(/[.,;:!?¿¡"'«»…]/g, '')
    .replace(/\s+/g, ' ');

function lev(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + c);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n]!;
}
// Comparaison tolérante : ignore casse/accents/ponctuation + petites fautes.
export function match(input: string, answer: string): boolean {
  const a = norm(input);
  const b = norm(answer);
  if (a === b) return true;
  if (!a) return false;
  const tol = b.length <= 4 ? 0 : b.length <= 8 ? 1 : 2;
  return lev(a, b) <= tol;
}

export const shuffle = <T>(a: T[]): T[] =>
  a
    .map(v => [Math.random(), v] as const)
    .sort((x, y) => x[0] - y[0])
    .map(v => v[1]);

/* ---- structure des chansons ---- */
export function sections(s: Song): Section[] {
  if (Array.isArray(s.sections) && s.sections.length) return s.sections;
  // Repli rétrocompat : ancien modèle à plat (pt/fr) => un refrain unique.
  const pt = (s.pt ?? '').split('\n').map(x => x.trim()).filter(Boolean);
  const fr = (s.fr ?? '').split('\n').map(x => x.trim()).filter(Boolean);
  const n = Math.min(pt.length, fr.length);
  const lines = Array.from({ length: n }, (_, i) => ({ pt: pt[i]!, fr: fr[i]! }));
  return lines.length ? [{ type: 'refrain', lines }] : [];
}

export function songComplete(s: Song): boolean {
  if (!s.title || !s.artist || !s.lang || !s.cefr || !s.genre) return false;
  const secs = sections(s);
  if (!secs.length || !secs.some(x => x.type === 'refrain')) return false;
  return secs.every(sec => sec.lines.every(l => l.pt && l.fr));
}

// Jauges visuelles d'une chanson : plutôt que des chiffres bruts (mots/vers),
// on donne à l'apprenant un ressenti immédiat — Difficulté (CEFR), Longueur
// (nombre de vers) et Densité (diversité lexicale = varié/dense). Niveaux 1..4.
const SEG = 4;
const segClamp = (n: number): number => Math.max(1, Math.min(SEG, Math.round(n)));
export function songMetrics(s: Song): { diff: number; length: number; density: number } {
  const secs = sections(s);
  const lineCount = secs.reduce((n, sec) => n + sec.lines.length, 0);
  const toks: string[] = [];
  secs.forEach(sec =>
    sec.lines.forEach(l =>
      (l.pt || '').split(/\s+/).forEach(w => {
        const t = norm(w.replace(/[.,;:!?¿¡"'«»…()]/g, ''));
        if (t) toks.push(t);
      })
    )
  );
  const total = toks.length || 1;
  const ratio = new Set(toks).size / total; // diversité lexicale : haut = dense
  const diffMap: Record<string, number> = { A1: 1, A2: 2, B1: 2, B2: 3, C1: 4, C2: 4 };
  const diff = diffMap[s.cefr || ''] ?? Math.min(4, (s.band || 1) + 1);
  const length = lineCount <= 20 ? 1 : lineCount <= 35 ? 2 : lineCount <= 50 ? 3 : 4;
  const density = ratio >= 0.7 ? 4 : ratio >= 0.55 ? 3 : ratio >= 0.4 ? 2 : 1;
  return { diff: segClamp(diff), length: segClamp(length), density: segClamp(density) };
}
export function songMeters(s: Song): string {
  const m = songMetrics(s);
  const meter = (label: string, lvl: number, cls: string): string =>
    `<div class="meter ${cls}" title="${label}"><span class="ml">${label}</span><span class="seg s${lvl}">${'<i></i>'.repeat(SEG)}</span></div>`;
  return `<div class="meters">${meter('Difficulté', m.diff, 'd')}${meter('Longueur', m.length, 'l')}${meter('Densité', m.density, 'n')}</div>`;
}

// Niveau à partir de l'XP cumulée. Le palier L->L+1 coûte 100*L (100, 200, 300…).
export function levelInfo(xp: number): { lvl: number; into: number; need: number; pct: number } {
  const x = Math.max(0, Math.floor(xp || 0));
  let lvl = 1;
  let need = 100;
  let acc = 0;
  while (x >= acc + need) {
    acc += need;
    lvl++;
    need = 100 * lvl;
  }
  const into = x - acc;
  return { lvl, into, need, pct: Math.round((into / need) * 100) };
}

export interface BadgeDef {
  id: string;
  name: string;
  desc: string;
  earned: boolean;
}
// Hauts faits dérivés de la progression (pas de champ Firestore en plus : tout
// est calculé). Le déclenchement « nouveau badge » est géré côté page via localStorage.
export function badgeList(i: {
  discovered: number;
  completed: number;
  full: number;
  mastered: number;
  level: number;
  streak: number;
}): BadgeDef[] {
  const d = (id: string, name: string, desc: string, earned: boolean): BadgeDef => ({ id, name, desc, earned });
  return [
    d('ecoute', 'Première écoute', 'Découvre ta première chanson', i.discovered >= 1),
    d('mot', 'Premier mot', 'Maîtrise ton premier mot', i.mastered >= 1),
    d('complete', 'Chanson complétée', 'Termine une chanson', i.completed >= 1),
    d('melomane', 'Mélomane', 'Découvre 5 chansons', i.discovered >= 5),
    d('full', 'Maîtrise complète', 'Refrain + couplets + shadowing', i.full >= 1),
    d('vocab', 'Vocabulaire solide', 'Maîtrise 25 mots', i.mastered >= 25),
    d('assidu', 'Assidu', '3 jours d’affilée', i.streak >= 3),
    d('fidele', 'Fidèle', '7 jours d’affilée', i.streak >= 7),
    d('niv5', 'Niveau 5', 'Atteins le niveau 5', i.level >= 5)
  ];
}

export function refrain(s: Song): Section | null {
  const secs = sections(s);
  return secs.find(x => x.type === 'refrain') ?? secs[0] ?? null;
}

/* Détection auto de structure : blocs séparés par lignes vides ; bloc répété = refrain. */
export function autoSections(ptText: string, frText: string): Section[] {
  const split = (t: string): string[][] =>
    t
      .split(/\n\s*\n/)
      .map(b => b.split('\n').map(x => x.trim()).filter(Boolean))
      .filter(b => b.length);
  let blocks = split(ptText || '');
  if (!blocks.length) {
    const all = (ptText || '').split('\n').map(x => x.trim()).filter(Boolean);
    blocks = all.length ? [all] : [];
  }
  const frAll = (frText || '').split('\n').map(x => x.trim()).filter(Boolean);
  const key = (b: string[]): string => b.map(norm).join(' | ');
  const counts: Record<string, number> = {};
  blocks.forEach(b => {
    const k = key(b);
    counts[k] = (counts[k] || 0) + 1;
  });
  let refrainKey: string | null = null;
  let max = 1;
  for (const k in counts) {
    if (counts[k]! > max) {
      max = counts[k]!;
      refrainKey = k;
    }
  }
  let cur = 0;
  const out: Section[] = [];
  blocks.forEach(b => {
    const isR = !!refrainKey && key(b) === refrainKey;
    const lines = b.map(pt => {
      const fr = frAll[cur] || '';
      cur++;
      return { pt, fr };
    });
    out.push({ type: isR ? 'refrain' : 'couplet', lines });
  });
  if (!refrainKey && out.length) out[0]!.type = 'refrain';
  return out;
}

/* Inverse de sections : reconstruit le texte brut (pt / fr) pour l'éditeur. */
export function sectionsToText(secs: Section[] | undefined): { pt: string; fr: string } {
  const list = Array.isArray(secs) ? secs : [];
  const join = (side: 'pt' | 'fr'): string => list.map(sec => sec.lines.map(l => l[side] || '').join('\n')).join('\n\n');
  return { pt: join('pt'), fr: join('fr') };
}

/* ---- accès données ---- */
export async function getSongs(): Promise<Song[]> {
  const snap = await getDocs(collection(db, 'songs'));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Song, 'id'>) }));
}

export async function getProgress(uid: string): Promise<Progress> {
  const d = await getDoc(doc(db, 'progress', uid));
  return d.exists() ? (d.data() as Progress) : { xp: 0, songs: {}, recent: [] };
}

export async function getCohort(code: string): Promise<Cohort | null> {
  const d = await getDoc(doc(db, 'cohorts', code));
  return d.exists() ? (d.data() as Cohort) : null;
}

export async function saveProgress(uid: string, prog: Progress): Promise<void> {
  await setDoc(doc(db, 'progress', uid), prog);
}

export async function setLang(uid: string, code: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { lang: code }, { merge: true });
}

/* ---- opérations gestionnaire ---- */
export async function listLearners(code: string): Promise<Learner[]> {
  const q = query(collection(db, 'users'), where('cohortId', '==', code));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...(d.data() as Profile) }));
}

export async function updateCohort(code: string, fields: Partial<Cohort>): Promise<Cohort> {
  const cur = (await getCohort(code)) ?? { code };
  const next = { ...cur, ...fields };
  await setDoc(doc(db, 'cohorts', code), next);
  return next;
}

export async function setLearnerLevel(uid: string, cefr: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { cefr, band: bandOf(cefr) }, { merge: true });
}

/* Renomme l'identifiant de cohorte et migre les apprenants. Préserve les réglages. */
export async function changeCohortCode(oldCode: string, rawNew: string, uid: string): Promise<string> {
  const code = slug(rawNew);
  if (code.length < 3) throw new Error('Identifiant trop court.');
  if (code === oldCode) return code;
  if (await getCohort(code)) throw new Error('Cet identifiant est déjà pris.');
  const old = await getCohort(oldCode);
  await setDoc(doc(db, 'cohorts', code), {
    code,
    managerUid: uid,
    lang: old?.lang ?? 'pt',
    level: old?.level ?? 'A2',
    category: old?.category ?? '',
    createdAt: old?.createdAt ?? Date.now()
  });
  const learners = await listLearners(oldCode);
  for (const l of learners) await setDoc(doc(db, 'users', l.uid), { cohortId: code }, { merge: true });
  await deleteDoc(doc(db, 'cohorts', oldCode));
  await setDoc(doc(db, 'users', uid), { cohortId: code }, { merge: true });
  return code;
}

export async function saveSong(song: Song): Promise<void> {
  await setDoc(doc(db, 'songs', song.id), song);
}

export async function deleteSong(id: string): Promise<void> {
  await deleteDoc(doc(db, 'songs', id));
}

export async function getCards(uid: string): Promise<Record<string, { state?: string }>> {
  const d = await getDoc(doc(db, 'cards', uid));
  return d.exists() ? ((d.data() as { cards?: Record<string, { state?: string }> }).cards ?? {}) : {};
}

export async function getLicense(uid: string): Promise<License | null> {
  const d = await getDoc(doc(db, 'licenses', uid));
  return d.exists() ? (d.data() as License) : null;
}

/* streak quotidien avec gel (note §7.a). Mute profile.streak et persiste. */
export async function touchStreak(uid: string, profile: Profile): Promise<Streak> {
  const ds = new Date().toISOString().slice(0, 10);
  const st: Streak = profile.streak ?? { count: 0, last: null, freezes: 2 };
  if (st.last === ds) return st;
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  if (st.last === yesterday) st.count = (st.count || 0) + 1;
  else if (st.last) {
    if ((st.freezes || 0) > 0) {
      st.freezes--;
      st.count = (st.count || 0) + 1;
    } else st.count = 1;
  } else st.count = 1;
  st.last = ds;
  profile.streak = st;
  await setDoc(doc(db, 'users', uid), { streak: st }, { merge: true });
  return st;
}

/* ---- auth + profil (rôle/entitlement depuis les claims serveur) ---- */
export interface AuthState {
  user: User | null;
  profile: Profile | null;
  entitlement: Entitlement | null;
}

let started = false;
let last: AuthState | null = null;
const callbacks: Array<(s: AuthState) => void> = [];

/** S'abonne à l'état (user, profile, entitlement). Un seul listener Firebase
 *  partagé ; rejoue le dernier état connu aux nouveaux abonnés. */
export function onAuthProfile(cb: (state: AuthState) => void): void {
  callbacks.push(cb);
  if (last) cb(last);
  if (started) return;
  started = true;
  onAuthStateChanged(auth, async user => {
    let profile: Profile | null = null;
    let entitlement: Entitlement | null = null;
    if (user) {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        profile = snap.exists() ? (snap.data() as Profile) : {};
        const tok = await user.getIdTokenResult();
        if (tok.claims.role) profile.role = String(tok.claims.role);
        entitlement = {
          plan: tok.claims.plan != null ? String(tok.claims.plan) : null,
          validUntil: typeof tok.claims.validUntil === 'number' ? tok.claims.validUntil : null
        };
      } catch {
        profile = profile ?? {};
      }
    }
    last = { user, profile, entitlement };
    for (const c of callbacks) {
      try {
        c(last);
      } catch {
        /* un callback ne doit pas casser les autres */
      }
    }
  });
}

/* ---- connexion gestionnaire (email + mot de passe) ---- */
export async function login(email: string, pw: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, pw);
}

/* ---- connexion apprenant SANS mot de passe (code cohorte + prénom, auth anonyme) ---- */
export async function joinAsLearner(opts: {
  code: string;
  firstName: string;
  lastName?: string;
  cefr?: string;
}): Promise<void> {
  if (!opts.firstName || !opts.firstName.trim()) throw new Error('Indique au moins ton prénom.');
  const code = slug(opts.code ?? '');
  const cohort = await getCohort(code);
  if (!cohort) throw new Error("Ce code de cohorte n'existe pas.");
  const cred = await signInAnonymously(auth);
  const cf = opts.cefr || cohort.level || 'A2';
  const lang = cohort.lang || 'pt';
  await setDoc(doc(db, 'users', cred.user.uid), {
    role: 'learner',
    firstName: opts.firstName.trim(),
    lastName: (opts.lastName ?? '').trim(),
    lang,
    cohortId: code,
    cefr: cf,
    band: bandOf(cf),
    streak: { count: 0, last: null, freezes: 2 },
    createdAt: Date.now()
  });
}

/** Garde de page : redirige vers la connexion si déconnecté, et vers l'accueil
 *  si l'accès "manager" est requis sans le rôle. onAllowed n'est appelé qu'une fois. */
export function guard(kind: 'any' | 'manager', onAllowed: (state: AuthState) => void): void {
  let done = false;
  onAuthProfile(state => {
    if (!state.user) {
      location.href = withBase('auth');
      return;
    }
    if (kind === 'manager' && state.profile?.role !== 'manager') {
      location.href = withBase();
      return;
    }
    if (!done) {
      done = true;
      onAllowed(state);
    }
  });
}

/** Entitlement courant (depuis le dernier état d'auth résolu) ou null. */
export const entitlement = (): Entitlement | null => last?.entitlement ?? null;
/** Licence valide ? (gestionnaire avec validUntil dans le futur). Enforcé aussi côté serveur. */
export const licenseValid = (): boolean => {
  const e = last?.entitlement;
  return !!(e && e.validUntil && Date.now() < e.validUntil);
};

export async function logout(): Promise<void> {
  await signOut(auth);
}
