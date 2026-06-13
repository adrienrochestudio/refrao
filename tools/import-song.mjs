/* ============================================================
   refrão - Fabrique de chansons (import enrichi, LOCAL, hors-ligne)
   ------------------------------------------------------------
   Importe une chanson prête à l'emploi à partir d'un simple lien
   Deezer (ou titre+artiste) :

     1. Métadonnées Deezer (titre, artiste, pochette, extrait 30 s, id).
     2. Paroles SYNCHRONISÉES via LRCLIB (gratuit, sans clé) -> timecodes
        ligne par ligne = base du karaoké.
     3. Enrichissement LLM (UN appel, ta clé) -> segmentation
        refrain/couplet, traduction française par ligne, lemme + sens
        EN CONTEXTE par mot, vocabulaire clé, niveau CEFR/bande.
     4. Écriture du document songs/{id} dans Firestore (Admin SDK,
        contourne les règles, gratuit).

   Coût : l'enrichissement est fait UNE fois par chanson et stocké ;
   les apprenants ne déclenchent aucun calcul. Quelques centimes/chanson.

   DEUX FAÇONS D'ENRICHIR (au choix) :

   A. Sans clé API, via Claude Code (recommandé pour construire la banque) :
        node tools/import-song.mjs --prep --deezer <url> --lang pt
        # -> écrit tools/song-prep.json (paroles numérotées, à enrichir).
        # Claude Code (la session de chat) remplit le champ "enriched".
        node tools/import-song.mjs --commit [--dry]
        # -> assemble depuis tools/song-prep.json et écrit dans Firestore.

   B. Avec une clé API (automatique, pour des lots/Phase 3) :
        export ANTHROPIC_API_KEY=sk-ant-...   (vraie clé, org avec crédit)
        node tools/import-song.mjs --deezer <url> --lang pt [--dry]

   Prérequis communs :
     - tools/serviceAccount.json (déjà ignoré par git) - cf. set-manager.mjs
     - npm install firebase-admin @anthropic-ai/sdk   (depuis ~/refrao)

   Options : --lang pt (langue d'origine), --band 1|2|3 (forçage),
             --youtube <url|id> (moteur karaoké, gratuit), --dry (affiche
             sans écrire), --id mon-id (sinon dérivé de l'artiste-titre),
             --lyrics-file <chemin> (paroles collées à la main si LRCLIB
             n'a rien ; non synchronisées), --prep-file <chemin>.
   ============================================================ */

import { readFile, writeFile } from 'node:fs/promises';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/* ---------- arguments ---------- */
function arg(name, def = null) {
  const i = process.argv.indexOf('--' + name);
  if (process.argv.includes('--' + name) && (i < 0 || !process.argv[i + 1] || process.argv[i + 1].startsWith('--'))) {
    return true; // drapeau booléen (ex: --dry)
  }
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const deezerUrl = arg('deezer');
const argTitle = arg('title');
const argArtist = arg('artist');
const lang = arg('lang', 'pt');
const forcedBand = arg('band') ? parseInt(arg('band'), 10) : null;
const dry = !!arg('dry');
const forcedId = arg('id');
const prepMode = !!arg('prep');
const commitMode = !!arg('commit');
const ytArg = arg('youtube');
const parseYouTubeId = (v) => {
  if (!v || v === true) return '';
  const m = String(v).match(/(?:v=|youtu\.be\/|\/embed\/)([\w-]{11})/);
  return m ? m[1] : String(v).trim();
};
const prepFile = new URL('./' + (arg('prep-file') || 'song-prep.json'), import.meta.url);

if (!commitMode && !deezerUrl && !(argTitle && argArtist)) {
  console.error('Usage:\n  Sans clé : node tools/import-song.mjs --prep --deezer <url> --lang pt   (puis Claude Code enrichit, puis --commit)\n  Avec clé : node tools/import-song.mjs --deezer <url> --lang pt   (ANTHROPIC_API_KEY requise)\n  Options : --title "<t>" --artist "<a>" | --band 1|2|3 | --dry | --id <id> | --prep-file <chemin>');
  process.exit(1);
}

/* ---------- helpers ---------- */
const slug = (s) =>
  (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'refrao-import (https://github.com/adrienrochestudio/refrao)' } });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.json();
}

/* ---------- 1. Deezer (métadonnées + id) ---------- */
function parseDeezerId(url) {
  const m = (url || '').match(/track\/(\d+)/);
  return m ? m[1] : null;
}

async function fetchDeezerByQuery(title, artist) {
  const q = encodeURIComponent(`track:"${title}" artist:"${artist}"`);
  const data = await getJson(`https://api.deezer.com/search?q=${q}&limit=1`);
  return data?.data?.[0]?.id ? String(data.data[0].id) : null;
}

async function fetchDeezerTrack(id) {
  const d = await getJson(`https://api.deezer.com/track/${id}`);
  if (d?.error) throw new Error('Deezer: ' + JSON.stringify(d.error));
  return {
    deezerId: String(d.id),
    deezer: d.link || `https://www.deezer.com/track/${d.id}`,
    title: d.title_short || d.title,
    artist: d.artist?.name || '',
    cover: d.album?.cover_medium || d.album?.cover || '',
    preview: d.preview || '',
    durationSec: d.duration || 0
  };
}

/* ---------- 2. LRCLIB (paroles synchronisées) ---------- */
// Renvoie { lines:[{t, text}], synced } ou { lines:[{text}], synced:false }
async function fetchLyrics(track) {
  // 1) tentative exacte (signature artiste/titre/durée)
  const params = new URLSearchParams({
    track_name: track.title,
    artist_name: track.artist,
    duration: String(track.durationSec || 0)
  });
  let rec = await fetch(`https://lrclib.net/api/get?${params}`, {
    headers: { 'User-Agent': 'refrao-import (https://github.com/adrienrochestudio/refrao)' }
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  // 2) repli : recherche
  if (!rec) {
    const q = encodeURIComponent(`${track.title} ${track.artist}`);
    const list = await getJson(`https://lrclib.net/api/search?q=${q}`).catch(() => []);
    rec = Array.isArray(list) ? list.find((x) => x.syncedLyrics) || list[0] : null;
  }
  if (!rec) return { lines: [], synced: false };

  if (rec.syncedLyrics) return { lines: parseLrc(rec.syncedLyrics), synced: true };
  if (rec.plainLyrics) {
    return {
      lines: rec.plainLyrics.split('\n').map((t) => t.trim()).filter(Boolean).map((text) => ({ text })),
      synced: false
    };
  }
  return { lines: [], synced: false };
}

// Parse le format LRC ([mm:ss.xx] texte) en lignes horodatées (secondes).
function parseLrc(lrc) {
  const out = [];
  for (const raw of lrc.split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g, '').trim();
    if (!text) continue; // ignore les lignes vides (interludes)
    for (const m of stamps) {
      const cs = m[3] ? parseInt((m[3] + '00').slice(0, 2), 10) / 100 : 0;
      out.push({ t: parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + cs, text });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/* ---------- 3. Enrichissement LLM (un appel) ---------- */
const ENRICH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cefr: { type: 'string', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
    band: { type: 'integer', enum: [1, 2, 3] },
    genre: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['refrain', 'couplet'] },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                i: { type: 'integer' }, // index de la ligne d'origine (porte le timecode)
                fr: { type: 'string' }, // traduction française naturelle de la ligne
                words: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      w: { type: 'string' }, // mot tel quel dans la ligne
                      lemma: { type: 'string' }, // forme du dictionnaire
                      gloss: { type: 'string' } // sens français EN CONTEXTE
                    },
                    required: ['w', 'lemma', 'gloss']
                  }
                }
              },
              required: ['i', 'fr', 'words']
            }
          }
        },
        required: ['type', 'lines']
      }
    },
    pairs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { pt: { type: 'string' }, fr: { type: 'string' } },
        required: ['pt', 'fr']
      }
    }
  },
  required: ['cefr', 'band', 'genre', 'sections', 'pairs']
};

const LANG_NAMES = { pt: 'portugais', es: 'espagnol', en: 'anglais', it: 'italien', de: 'allemand', fr: 'français' };

async function enrich(track, numberedLines, srcLang) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();

  const langName = LANG_NAMES[srcLang] || srcLang;
  const corpus = numberedLines.map((l, i) => `[${i}] ${l.text}`).join('\n');

  const system =
    `Tu es lexicographe et professeur de langues pour refrão, une plateforme d'apprentissage des langues par la musique. ` +
    `La langue pivot des traductions est le FRANÇAIS. Tu reçois les paroles d'une chanson en ${langName}, ligne par ligne, ` +
    `chaque ligne préfixée de son index [n]. Tu dois :\n` +
    `1. Segmenter en sections "refrain" (partie répétée, accrocheuse) et "couplet". Conserve l'index [n] exact de chaque ligne dans le champ "i" ; n'invente, ne fusionne, ne réordonne aucune ligne.\n` +
    `2. Pour chaque ligne, donner "fr" : une traduction française NATURELLE et fidèle (pas du mot-à-mot), qui rend le sens réel y compris expressions et argot.\n` +
    `3. Pour chaque mot pédagogiquement utile de la ligne (ignore la ponctuation et les mots ultra-fréquents comme articles/prépositions si triviaux), donner : "w" (le mot tel qu'il apparaît), "lemma" (forme du dictionnaire, ex. infinitif d'un verbe conjugué), "gloss" (le sens français EN CONTEXTE de cette ligne, pas une liste de sens). Le gloss doit refléter le sens ici, pas le sens générique.\n` +
    `4. Estimer "cefr" (A1..C2) et "band" (1=A1-A2 Découverte, 2=B1-B2 Intermédiaire, 3=C1-C2 Avancé) d'après le vocabulaire et la syntaxe réels.\n` +
    `5. "genre" : un mot ou deux (ex. "pop", "sertanejo", "rock").\n` +
    `6. "pairs" : 8 à 15 entrées de vocabulaire clé à retenir, {pt: mot ou courte expression dans la langue d'origine, fr: sens français}. Choisis les plus rentables pour l'apprentissage.`;

  const user =
    `Chanson : « ${track.title} » — ${track.artist}.\nLangue d'origine : ${langName}.\nParoles (lignes indexées) :\n\n${corpus}`;

  const resp = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: ENRICH_SCHEMA } },
    system,
    messages: [{ role: 'user', content: user }]
  });

  const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

/* ---------- assemblage du document Song ---------- */
function assembleSong({ id, track, lyrics, enriched, srcLang, youtubeId }) {
  const base = {
    id,
    title: track.title,
    artist: track.artist,
    lang: srcLang,
    deezer: track.deezer,
    deezerId: track.deezerId,
    cover: track.cover,
    preview: track.preview,
    synced: !!lyrics.synced,
    source: enriched ? 'lrclib+llm' : 'lrclib'
  };
  if (youtubeId) base.youtubeId = youtubeId;

  if (!enriched) {
    // Sans enrichissement : une seule section brute, fr vide (à compléter au manager).
    return {
      ...base,
      cefr: forcedBand ? '' : '',
      band: forcedBand || 1,
      sections: [
        { type: 'couplet', lines: lyrics.lines.map((l) => ({ pt: l.text, fr: '', ...(l.t != null ? { t: round(l.t) } : {}) })) }
      ],
      pairs: []
    };
  }

  const sections = enriched.sections.map((sec) => ({
    type: sec.type,
    lines: sec.lines.map((ln) => {
      const src = lyrics.lines[ln.i];
      const line = { pt: src ? src.text : '', fr: ln.fr || '' };
      if (src && src.t != null) line.t = round(src.t);
      if (Array.isArray(ln.words) && ln.words.length) {
        line.words = ln.words.map((w) => ({ w: w.w, lemma: w.lemma, gloss: w.gloss }));
      }
      return line;
    })
  }));

  return {
    ...base,
    cefr: enriched.cefr,
    band: forcedBand || enriched.band,
    genre: enriched.genre || '',
    sections,
    pairs: enriched.pairs || []
  };
}

const round = (n) => Math.round(n * 100) / 100;

/* ---------- Firestore ---------- */
async function initDb() {
  const KEY_PATH = new URL('./serviceAccount.json', import.meta.url);
  const serviceAccount = JSON.parse(await readFile(KEY_PATH, 'utf8'));
  initializeApp({ credential: cert(serviceAccount) });
  return getFirestore();
}

/* ---------- mode --commit : assemble depuis le fichier de prep enrichi ---------- */
async function runCommit() {
  let payload;
  try {
    payload = JSON.parse(await readFile(prepFile, 'utf8'));
  } catch {
    throw new Error(`Fichier de prep introuvable (${prepFile.pathname}). Lance d'abord --prep.`);
  }
  if (!payload.enriched) {
    throw new Error("Le fichier de prep n'est pas encore enrichi (champ \"enriched\" vide). Claude Code doit le remplir avant --commit.");
  }
  const lyrics = { lines: payload.lines, synced: payload.synced };
  const id = forcedId || payload.id;
  const youtubeId = parseYouTubeId(ytArg) || payload.youtubeId || '';
  const song = assembleSong({ id, track: payload.track, lyrics, enriched: payload.enriched, srcLang: payload.lang, youtubeId });

  if (dry) {
    console.log('\n--- DRY RUN (non écrit) ---\n');
    console.log(JSON.stringify(song, null, 2));
    return;
  }
  const db = await initDb();
  await db.collection('songs').doc(id).set(song);
  console.log(`✓ Écrit dans Firestore : songs/${id}`);
}

/* ---------- récupération commune (Deezer + paroles) ---------- */
async function fetchTrackAndLyrics() {
  let trackId = parseDeezerId(deezerUrl);
  if (!trackId && argTitle && argArtist) {
    console.log(`Recherche Deezer : ${argTitle} — ${argArtist} ...`);
    trackId = await fetchDeezerByQuery(argTitle, argArtist);
  }
  if (!trackId) throw new Error('Piste Deezer introuvable (vérifie le lien ou title/artist).');

  const track = await fetchDeezerTrack(trackId);
  console.log(`✓ Deezer : « ${track.title} » — ${track.artist} (${track.durationSec}s, id ${track.deezerId})`);

  // Secours paroles : si LRCLIB n'a rien (ou si on force --lyrics-file), on prend un
  // fichier texte collé à la main (depuis Genius ou ailleurs). Non synchronisé : le
  // karaoké retombe en lecture simple, mais la chanson reste enrichissable.
  const lyricsFile = arg('lyrics-file');
  let lyrics;
  if (lyricsFile) {
    const txt = await readFile(lyricsFile, 'utf8');
    lyrics = { lines: txt.split('\n').map((t) => t.trim()).filter(Boolean).map((text) => ({ text })), synced: false };
    console.log(`✓ Paroles : ${lyrics.lines.length} lignes depuis ${lyricsFile} (non synchronisées).`);
  } else {
    lyrics = await fetchLyrics(track);
    if (!lyrics.lines.length) {
      throw new Error('Aucune parole sur LRCLIB. Colle les paroles dans un fichier et relance avec --lyrics-file <chemin>.');
    }
    console.log(`✓ Paroles : ${lyrics.lines.length} lignes, ${lyrics.synced ? 'SYNCHRONISÉES (karaoké)' : 'non synchronisées'}.`);
  }
  return { track, lyrics };
}

/* ---------- mode --prep : écrit le fichier à enrichir par Claude Code ---------- */
async function runPrep() {
  const { track, lyrics } = await fetchTrackAndLyrics();
  const id = forcedId || `${slug(track.artist)}-${slug(track.title)}`;
  const payload = {
    id,
    lang,
    synced: !!lyrics.synced,
    youtubeId: parseYouTubeId(ytArg),
    track,
    lines: lyrics.lines, // [{ t?, text }] — l'index dans ce tableau = "i" attendu dans enriched
    enriched: null, // <- Claude Code remplit ce champ selon ENRICH_SCHEMA (sections[{type,lines[{i,fr,words[{w,lemma,gloss}]}]}], cefr, band, genre, pairs)
    _todo: 'Claude Code : enrichis le champ "enriched" puis lance `node tools/import-song.mjs --commit`.'
  };
  await writeFile(prepFile, JSON.stringify(payload, null, 2));
  console.log(`✓ Prep écrit : ${prepFile.pathname}`);
  console.log(`  ${lyrics.lines.length} lignes à enrichir. Claude Code remplit "enriched", puis : node tools/import-song.mjs --commit --dry`);
}

/* ---------- mode par défaut : enrichissement par clé API ---------- */
async function runWithKey() {
  const { track, lyrics } = await fetchTrackAndLyrics();
  let enriched = null;
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('… Enrichissement LLM (traduction + sens au mot + structure)…');
    enriched = await enrich(track, lyrics.lines, lang);
    const nWords = enriched.sections.reduce((n, s) => n + s.lines.reduce((m, l) => m + (l.words?.length || 0), 0), 0);
    console.log(`✓ Enrichi : ${enriched.sections.length} sections, ${enriched.pairs.length} entrées de vocab, ${nWords} mots glosés, niveau ${enriched.cefr}.`);
  } else {
    console.log('⚠ Ni --prep ni ANTHROPIC_API_KEY : import des paroles synchronisées sans enrichissement (fr vide). Pour enrichir sans clé, utilise --prep.');
  }
  const id = forcedId || `${slug(track.artist)}-${slug(track.title)}`;
  const song = assembleSong({ id, track, lyrics, enriched, srcLang: lang, youtubeId: parseYouTubeId(ytArg) });

  if (dry) {
    console.log('\n--- DRY RUN (non écrit) ---\n');
    console.log(JSON.stringify(song, null, 2));
    return;
  }
  const db = await initDb();
  await db.collection('songs').doc(id).set(song);
  console.log(`✓ Écrit dans Firestore : songs/${id}`);
}

/* ---------- main ---------- */
(async () => {
  try {
    if (commitMode) await runCommit();
    else if (prepMode) await runPrep();
    else await runWithKey();
  } catch (e) {
    console.error('✗ ' + (e?.message || e));
    process.exit(1);
  }
})();
