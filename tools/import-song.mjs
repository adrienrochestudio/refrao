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

   Prérequis :
     - tools/serviceAccount.json (déjà ignoré par git) - cf. set-manager.mjs
     - npm install firebase-admin @anthropic-ai/sdk   (depuis ~/refrao)
     - export ANTHROPIC_API_KEY=sk-ant-...   (sinon : import sans
       enrichissement - paroles synchro seules, utile pour tester)

   Utilisation :
     node tools/import-song.mjs --deezer https://www.deezer.com/track/3135556
     node tools/import-song.mjs --title "Ai Se Eu Te Pego" --artist "Michel Teló" --lang pt
     # options : --lang pt (langue d'origine), --band 1|2|3 (forçage),
     #           --dry (n'écrit pas dans Firestore, affiche le doc),
     #           --id mon-id (sinon dérivé de l'artiste-titre)
   ============================================================ */

import { readFile } from 'node:fs/promises';
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

if (!deezerUrl && !(argTitle && argArtist)) {
  console.error('Usage: node tools/import-song.mjs --deezer <url>  |  --title "<t>" --artist "<a>" [--lang pt] [--band 1|2|3] [--dry] [--id <id>]');
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
function assembleSong({ id, track, lyrics, enriched, srcLang }) {
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

/* ---------- main ---------- */
(async () => {
  try {
    let trackId = parseDeezerId(deezerUrl);
    if (!trackId && argTitle && argArtist) {
      console.log(`Recherche Deezer : ${argTitle} — ${argArtist} ...`);
      trackId = await fetchDeezerByQuery(argTitle, argArtist);
    }
    if (!trackId) throw new Error('Piste Deezer introuvable (vérifie le lien ou title/artist).');

    const track = await fetchDeezerTrack(trackId);
    console.log(`✓ Deezer : « ${track.title} » — ${track.artist} (${track.durationSec}s, id ${track.deezerId})`);

    const lyrics = await fetchLyrics(track);
    if (!lyrics.lines.length) throw new Error('Aucune parole trouvée sur LRCLIB.');
    console.log(`✓ Paroles : ${lyrics.lines.length} lignes, ${lyrics.synced ? 'SYNCHRONISÉES (karaoké)' : 'non synchronisées'}.`);

    let enriched = null;
    if (process.env.ANTHROPIC_API_KEY) {
      console.log('… Enrichissement LLM (traduction + sens au mot + structure)…');
      enriched = await enrich(track, lyrics.lines, lang);
      const nWords = enriched.sections.reduce((n, s) => n + s.lines.reduce((m, l) => m + (l.words?.length || 0), 0), 0);
      console.log(`✓ Enrichi : ${enriched.sections.length} sections, ${enriched.pairs.length} entrées de vocab, ${nWords} mots glosés, niveau ${enriched.cefr}.`);
    } else {
      console.log('⚠ ANTHROPIC_API_KEY absente : import des paroles synchronisées sans enrichissement (fr vide).');
    }

    const id = forcedId || `${slug(track.artist)}-${slug(track.title)}`;
    const song = assembleSong({ id, track, lyrics, enriched, srcLang: lang });

    if (dry) {
      console.log('\n--- DRY RUN (non écrit) ---\n');
      console.log(JSON.stringify(song, null, 2));
      return;
    }

    const db = await initDb();
    await db.collection('songs').doc(id).set(song);
    console.log(`\n✓ Écrit dans Firestore : songs/${id}`);
  } catch (e) {
    console.error('✗ ' + (e?.message || e));
    process.exit(1);
  }
})();
