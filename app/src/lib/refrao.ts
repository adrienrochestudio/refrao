// Couche domaine typée au-dessus de Firebase. Port progressif de l'ancien core.js
// vers TypeScript ; on n'expose ici que ce dont les pages portées ont besoin.
import {
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  signInAnonymously,
  type User
} from 'firebase/auth';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { withBase } from './paths';
import type { Song, Section, Progress, Profile, Entitlement, Cohort, Streak } from './types';

/* ---- langues ---- */
export const LANGS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'en', label: 'Anglais' },
  { code: 'pt', label: 'Portugais' },
  { code: 'es', label: 'Espagnol' },
  { code: 'de', label: 'Allemand' }
];
export const langLabel = (code?: string): string =>
  LANGS.find(l => l.code === code)?.label ?? code ?? '';

/* ---- CEFR / bandes / placement ---- */
const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
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

export function refrain(s: Song): Section | null {
  const secs = sections(s);
  return secs.find(x => x.type === 'refrain') ?? secs[0] ?? null;
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

export async function logout(): Promise<void> {
  await signOut(auth);
}
