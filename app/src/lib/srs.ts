// Moteur de répétition espacée (lecture + écriture). Les identifiants de cartes
// sont calculés EXACTEMENT comme l'ancien srs.js (norm + slug) pour retomber sur
// les documents cards/{uid} déjà écrits en base.
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { slug, norm } from './refrao';
import type { Song, Section } from './types';

export interface Card {
  id: string;
  songId: string;
  type: string;
  text: string;
  trad: string;
  sectionType: string;
  streak: number;
  lapses: number;
  state: string;
  due: number;
}

export const cardId = (songId: string, type: string, text: string): string =>
  songId + ':' + type + ':' + slug(norm(text)).slice(0, 46);

let cards: Record<string, Card> = {};
let currentUid: string | null = null;

export async function load(uid: string): Promise<void> {
  currentUid = uid;
  const d = await getDoc(doc(db, 'cards', uid));
  cards = d.exists() ? ((d.data() as { cards?: Record<string, Card> }).cards ?? {}) : {};
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
export async function save(): Promise<void> {
  if (!currentUid) return;
  await setDoc(doc(db, 'cards', currentUid), { cards });
}
export function saveSoon(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void save();
  }, 400);
}

export const card = (id: string): Card | undefined => cards[id];
const list = (): Card[] => Object.values(cards);

/* ---- espacement par paliers (note §5.3.b) ---- */
export function nextDue(streak: number, now = Date.now()): number {
  const H = 3600e3;
  const D = 864e5;
  if (streak <= 0) return now;
  if (streak === 1) return now + 4 * H;
  if (streak === 2) return now + 1 * D;
  if (streak === 3) return now + 3 * D;
  return now + 7 * D;
}

export function addCard(songId: string, type: string, text: string, trad?: string, sectionType?: string): Card {
  const id = cardId(songId, type, text);
  if (!cards[id]) {
    cards[id] = {
      id,
      songId,
      type,
      text,
      trad: trad ?? '',
      sectionType: sectionType ?? '',
      streak: 0,
      lapses: 0,
      state: 'nouvelle',
      due: Date.now()
    };
  }
  return cards[id]!;
}

/* génère les cartes d'une section : une carte-phrase par vers + cartes-mots à forte valeur */
export function generateForSection(song: Song, section: Section): Card[] {
  const made: Card[] = [];
  section.lines.forEach(l => {
    if (l.pt) made.push(addCard(song.id, 'phrase', l.pt, l.fr, section.type));
  });
  const txt = norm(section.lines.map(l => l.pt).join(' '));
  (song.pairs ?? []).forEach(p => {
    const w = (p.pt || '').split(/\s+/)[0];
    if (w && txt.split(' ').includes(norm(w))) made.push(addCard(song.id, 'mot', p.pt, p.fr, section.type));
  });
  saveSoon();
  return made;
}

/* note une réponse : met à jour streak / lapses / état / échéance (paliers §5.3) */
export function grade(id: string, correct: boolean): Card | null {
  const c = cards[id];
  if (!c) return null;
  if (correct) c.streak = Math.min((c.streak || 0) + 1, 4);
  else {
    c.lapses = (c.lapses || 0) + 1;
    c.streak = 0;
  }
  c.state = c.streak >= 3 ? 'maîtrisée' : c.streak >= 1 ? 'en cours' : 'nouvelle';
  c.due = nextDue(c.streak);
  saveSoon();
  return c;
}

export function due(now = Date.now()): Card[] {
  return list()
    .filter(c => c.due <= now)
    .sort(
      (a, b) =>
        b.lapses - a.lapses ||
        (a.state === 'nouvelle' ? 1 : 0) - (b.state === 'nouvelle' ? 1 : 0) ||
        a.due - b.due
    );
}

export function stats(): { total: number; mastered: number; learning: number; due: number } {
  const a = list();
  return {
    total: a.length,
    mastered: a.filter(c => c.state === 'maîtrisée').length,
    learning: a.filter(c => c.state === 'en cours').length,
    due: due().length
  };
}

function cardsForSection(song: Song, section: Section): Card[] {
  return section.lines
    .map(l => cards[cardId(song.id, 'phrase', l.pt)])
    .filter((c): c is Card => !!c);
}

export function sectionMastered(song: Song, section: Section): boolean {
  const cs = cardsForSection(song, section);
  return cs.length > 0 && cs.every(c => c.state === 'maîtrisée');
}

export function sectionPct(song: Song, section: Section): number {
  const cs = cardsForSection(song, section);
  if (!cs.length) return 0;
  return Math.round((cs.reduce((s, c) => s + Math.min(c.streak, 3), 0) / (cs.length * 3)) * 100);
}

// Blocage multi-jours = on fait respecter les échéances de répétition espacée.
// Une partie déjà travaillée « repose » jusqu'à ce qu'au moins une de ses cartes
// soit due. Pas encore générée (jamais travaillée) = prête.
export function sectionReady(song: Song, section: Section, now = Date.now()): boolean {
  const cs = cardsForSection(song, section);
  if (!cs.length) return true;
  return cs.some(c => c.due <= now);
}
// Quand la partie redevient disponible (échéance la plus proche).
export function sectionDueAt(song: Song, section: Section): number {
  const cs = cardsForSection(song, section);
  if (!cs.length) return Date.now();
  return Math.min(...cs.map(c => c.due));
}

export interface Prog {
  recent?: number[];
}
export function pushRecent(prog: Prog, correct: boolean): void {
  prog.recent = (prog.recent ?? []).concat(correct ? 1 : 0).slice(-40);
}
