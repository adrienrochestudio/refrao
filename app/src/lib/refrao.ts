// Couche domaine typée au-dessus de Firebase. Port progressif de l'ancien core.js
// vers TypeScript ; on n'expose ici que ce dont les pages portées ont besoin.
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Song, Section, Progress, Profile, Entitlement } from './types';

/* ---- langues ---- */
const LANGS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'en', label: 'Anglais' },
  { code: 'pt', label: 'Portugais' },
  { code: 'es', label: 'Espagnol' },
  { code: 'de', label: 'Allemand' }
];
export const langLabel = (code?: string): string =>
  LANGS.find(l => l.code === code)?.label ?? code ?? '';

/* ---- utilitaires ---- */
const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown): string =>
  (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ENT[c] ?? c);

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

/* ---- accès données ---- */
export async function getSongs(): Promise<Song[]> {
  const snap = await getDocs(collection(db, 'songs'));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Song, 'id'>) }));
}

export async function getProgress(uid: string): Promise<Progress> {
  const d = await getDoc(doc(db, 'progress', uid));
  return d.exists() ? (d.data() as Progress) : { xp: 0, songs: {}, recent: [] };
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

export async function logout(): Promise<void> {
  await signOut(auth);
}
