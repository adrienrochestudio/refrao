// Types partagés du domaine refrão. `pt`/`fr` dans une ligne = texte d'origine /
// glose française, quelle que soit la langue de la cohorte (cf. modèle de données).

// Donnée au mot, produite par la fabrique de chansons (tools/import-song.mjs).
// Tout est optionnel : une ligne reste valide sans enrichissement.
export interface Word {
  w: string;        // forme de surface telle qu'elle apparaît dans les paroles
  t?: number;       // début du mot (s, repère plein morceau) pour le surlignage karaoké mot à mot
  lemma?: string;   // forme du dictionnaire (résout conjugaisons/accords)
  gloss?: string;   // sens français EN CONTEXTE (pas une trad dico brute)
}

export interface Line {
  pt: string;
  fr: string;
  t?: number;       // début de la ligne (s, repère plein morceau), depuis le LRC synchronisé
  words?: Word[];   // enrichissement au mot (optionnel)
}

export interface Section {
  type: 'refrain' | 'couplet';
  lines: Line[];
}

export interface Pair {
  pt: string;
  fr: string;
}

export interface Song {
  id: string;
  title?: string;
  artist?: string;
  lang?: string;
  cefr?: string;
  band?: number;
  genre?: string;
  tags?: string;
  sections?: Section[];
  pairs?: Pair[];
  deezer?: string;
  deezerId?: string;   // id de piste Deezer (lecture pleine via SDK pour les Premium)
  cover?: string;
  preview?: string;
  synced?: boolean;    // true quand les lignes portent des timecodes (LRC) => karaoké dispo
  source?: string;     // provenance de l'enrichissement (ex: 'lrclib+llm') pour la traçabilité
  // Ancien modèle à plat, conservé en lecture seule pour la rétrocompat.
  pt?: string;
  fr?: string;
}

export interface SongProgress {
  discovered?: boolean;
  shadow?: boolean;
  completed?: boolean;
  full?: boolean;
  clozeLevel?: number;
}

export interface Progress {
  xp?: number;
  songs?: Record<string, SongProgress>;
  recent?: number[];
}

export interface Streak {
  count: number;
  last: string | null;
  freezes: number;
}

export interface Profile {
  role?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  lang?: string;
  cohortId?: string;
  cefr?: string;
  band?: number;
  streak?: Streak;
  [key: string]: unknown;
}

export interface Entitlement {
  plan: string | null;
  validUntil: number | null;
}

export interface Cohort {
  code: string;
  managerUid?: string;
  lang?: string;
  level?: string;
  category?: string;
  createdAt?: number;
}

export interface Learner extends Profile {
  uid: string;
}

export interface License {
  managerUid?: string;
  plan?: string;
  status?: string;
  seats?: number;
  validUntil?: number;
  school?: string;
  contactEmail?: string;
  createdAt?: number;
  updatedAt?: number;
}
