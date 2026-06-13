// Moteur de répétition espacée, côté LECTURE (stats, maîtrise par section).
// Les identifiants de cartes doivent être calculés EXACTEMENT comme l'ancien
// srs.js pour retomber sur les documents cards/{uid} déjà écrits en base.
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { slug } from './refrao';
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

// Retire les diacritiques (NFD + suppression des marques combinantes U+0300–U+036F).
const fold = (s: string): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const norm = (s: string): string =>
  fold(s)
    .toLowerCase()
    .trim()
    .replace(/[.,;:!?¿¡"'«»…]/g, '')
    .replace(/\s+/g, ' ');

export const cardId = (songId: string, type: string, text: string): string =>
  songId + ':' + type + ':' + slug(norm(text)).slice(0, 46);

let cards: Record<string, Card> = {};

export async function load(uid: string): Promise<void> {
  const d = await getDoc(doc(db, 'cards', uid));
  cards = d.exists() ? ((d.data() as { cards?: Record<string, Card> }).cards ?? {}) : {};
}

const list = (): Card[] => Object.values(cards);

export function due(now = Date.now()): Card[] {
  return list().filter(c => c.due <= now);
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
