// Types partagés du domaine refrão. `pt`/`fr` dans une ligne = texte d'origine /
// glose française, quelle que soit la langue de la cohorte (cf. modèle de données).

export interface Line {
  pt: string;
  fr: string;
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
  cover?: string;
  preview?: string;
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

export interface Profile {
  role?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  lang?: string;
  cohortId?: string;
  cefr?: string;
  band?: number;
  [key: string]: unknown;
}

export interface Entitlement {
  plan: string | null;
  validUntil: number | null;
}
