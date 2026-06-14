// Contrôleur de la page "apprendre" : port TypeScript de exercices.js + learn.js.
// Les fonctions référencées par des onclick inline (dans des chaînes HTML) sont
// exposées sur window · pont transitoire conservé tel quel pendant la migration ;
// le redesign produit remplacera ce pattern. La logique est fidèle à l'original.
import {
  guard,
  getSongs,
  getProgress,
  getCohort,
  saveProgress,
  touchStreak,
  sections,
  songMeters,
  levelInfo,
  refrain,
  songComplete,
  bandOf,
  langLabel,
  esc,
  norm,
  match,
  shuffle,
  setLang,
  LANGS
} from './refrao';
import * as SRS from './srs';
import type { Song, Section, Line, Progress, Profile, Cohort } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface AppState {
  songs: Song[];
  prog: Progress;
  curlang: string;
  profile: Profile | null;
  band: number;
  sess: any;
  cohort: Cohort | null;
  uid: string;
}
const S: AppState = {
  songs: [],
  prog: { xp: 0, songs: {}, recent: [] },
  curlang: 'pt',
  profile: null,
  band: 1,
  sess: null,
  cohort: null,
  uid: ''
};
const LANG_COLORS: Record<string, string> = { en: '#80b7ff', pt: '#7ef0b0', es: '#b89bff', de: '#ff9d7a' };

const $id = (id: string): HTMLElement | null => document.getElementById(id);
const langOf = (): string => langLabel(S.sess?.song?.lang || S.curlang);
const songBand = (s: Song): number => s.band || bandOf(s.cefr || 'A2');

export function boot(): void {
  mountMiniPlayer();
  guard('any', async ({ user, profile }) => {
    await init(user!.uid, profile);
  });
}

async function init(uid: string, profile: Profile | null): Promise<void> {
  S.uid = uid;
  S.profile = profile;
  S.songs = await getSongs();
  S.prog = await getProgress(uid);
  if (!S.prog.recent) S.prog.recent = [];
  if (!S.prog.songs) S.prog.songs = {};
  await SRS.load(uid);
  S.curlang = profile?.lang ?? 'pt';
  S.band = profile?.band ?? 1;
  S.cohort = null;
  if (profile?.cohortId) {
    try {
      S.cohort = await getCohort(profile.cohortId);
    } catch {
      /* cohorte illisible : on continue */
    }
  }
  renderLangPick();
  renderChooser();
  const sid = new URLSearchParams(location.search).get('song');
  if (sid && S.songs.find(s => s.id === sid)) openSong(sid);
}

function showView(id: string): void {
  document.querySelectorAll('main .view').forEach(v => v.classList.remove('active'));
  $id(id)?.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // Lecteur persistant : présent sur accueil/parcours, masqué + en pause en exercice (focus total).
  if (id === 'exercise') hideMiniPlayer();
  else refreshMiniPlayer();
}
function showChooser(): void {
  renderChooser();
  showView('chooser');
}

function songsForLang(): Song[] {
  const cat =
    S.profile && S.profile.role === 'learner' && S.cohort && S.cohort.category ? S.cohort.category : null;
  return S.songs.filter(s => (s.lang || 'pt') === S.curlang && songComplete(s) && (!cat || s.genre === cat));
}

function renderLangPick(): void {
  const wrap = $id('langPick');
  if (!wrap) return;
  if (S.profile && S.profile.role === 'learner') {
    wrap.innerHTML = '';
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  wrap.innerHTML = LANGS.map(
    l =>
      `<button class="lang-chip${l.code === S.curlang ? ' on' : ''}" data-lang="${l.code}" style="--c:${LANG_COLORS[l.code] || '#80b7ff'}">${l.label}</button>`
  ).join('');
  wrap.querySelectorAll<HTMLButtonElement>('.lang-chip').forEach(b => {
    b.onclick = async () => {
      S.curlang = b.dataset.lang || 'pt';
      await setLang(S.uid, S.curlang);
      renderLangPick();
      renderChooser();
    };
  });
}

function flameIcon(): string {
  return '<svg class="flame" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C9 6 6.5 8 6.5 12.5A5.5 5.5 0 0 0 17.5 13c0-2.6-1.5-4.2-2.6-5.7-.9 1-1.9 1.4-2.9.5.9-2 .6-4 0-5.8z"/></svg>';
}

// Objectif du jour (ancre de retour quotidien). Compteur local (pas de champ
// Firestore en plus) ; nudge honnête, pas une barrière.
const DAILY_GOAL = 3;
function getDailyCount(): number {
  try {
    const raw = JSON.parse(localStorage.getItem('refrao_daily') || '{}');
    const today = new Date().toISOString().slice(0, 10);
    return raw.date === today ? raw.n || 0 : 0;
  } catch {
    return 0;
  }
}
function bumpDaily(): number {
  const today = new Date().toISOString().slice(0, 10);
  const n = getDailyCount() + 1;
  try {
    localStorage.setItem('refrao_daily', JSON.stringify({ date: today, n }));
  } catch {
    /* localStorage indisponible */
  }
  if (n === DAILY_GOAL) toast('Objectif du jour atteint, bravo');
  return n;
}

function clockIcon(): string {
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
}
// Échéance lisible pour le « repos » (répétition espacée).
function restLabel(dueAt: number): string {
  const ms = dueAt - Date.now();
  if (ms <= 0) return 'maintenant';
  const h = ms / 3600e3;
  if (h < 1) return 'dans ' + Math.max(1, Math.round(ms / 60000)) + ' min';
  if (h < 20) return 'dans ' + Math.round(h) + ' h';
  const d = Math.round(h / 24);
  return d <= 1 ? 'demain' : 'dans ' + d + ' jours';
}

// Bandeau niveau/XP réutilisable : pour que l'XP soit OMNIPRÉSENT et clair sur
// tous les écrans apprenant (accueil, parcours d'une chanson, etc.).
function xpStrip(wide = false): string {
  const li = levelInfo(S.prog.xp || 0);
  return `<div class="lh-xp${wide ? ' wide' : ''}" title="${S.prog.xp || 0} XP au total">
      <div class="lx-top"><span class="lx-lvl">Niveau ${li.lvl}</span><span class="lx-pts">${li.into} / ${li.need} XP</span></div>
      <div class="lx-bar"><i style="width:${li.pct}%"></i></div>
    </div>`;
}

// Détermine la prochaine activité à proposer en haut de l'accueil (guidage).
function nextActivity(): { song: Song; label: string; sub: string } | null {
  const songs = songsForLang();
  if (!songs.length) return null;
  const inProg = songs.find(s => {
    const p = S.prog.songs?.[s.id];
    return !!p?.discovered && !p?.completed;
  });
  if (inProg) return { song: inProg, label: 'Continuer', sub: 'Reprends ton entraînement là où tu t’es arrêté' };
  const anyProgress = songs.some(s => S.prog.songs?.[s.id]?.discovered);
  const fresh = songs.find(s => !S.prog.songs?.[s.id]?.completed) ?? songs[0]!;
  return {
    song: fresh,
    label: anyProgress ? 'Nouvelle chanson' : 'Commencer',
    sub: anyProgress ? 'Découvre une nouvelle chanson' : 'Bienvenue. Commence par écouter une chanson.'
  };
}

function renderChooser(): void {
  const listEl = $id('learnList');
  if (!listEl) return;
  const dueCount = SRS.due().length;

  const hr = new Date().getHours();
  const part = hr < 12 ? 'Bonjour' : hr < 18 ? 'Bon après-midi' : 'Bonsoir';
  const nm = S.profile?.firstName ? ', ' + esc(S.profile.firstName) : '';
  const streak = S.profile?.streak?.count || 0;
  const li = levelInfo(S.prog.xp || 0);
  const dc = getDailyCount();
  const dpct = Math.min(100, Math.round((dc / DAILY_GOAL) * 100));
  const goalDone = dc >= DAILY_GOAL;
  const home = `<div class="learn-home">
      <div class="lh-hi">
        <h3>${part}${nm}</h3>
        <div class="lh-sub">${goalDone ? 'Objectif du jour atteint, bravo' : `Objectif du jour : ${dc}/${DAILY_GOAL}`}${dueCount ? ` · ${dueCount} à revoir` : ''}</div>
        <div class="daily-bar ${goalDone ? 'done' : ''}"><i style="width:${dpct}%"></i></div>
      </div>
      <div class="lh-meta">
        <div class="lh-xp" title="${S.prog.xp || 0} XP au total">
          <div class="lx-top"><span class="lx-lvl">Niv. ${li.lvl}</span><span class="lx-pts">${li.into}/${li.need} XP</span></div>
          <div class="lx-bar"><i style="width:${li.pct}%"></i></div>
        </div>
        <div class="lh-streak ${streak ? '' : 'cold'}" title="${streak ? 'Reviens chaque jour pour garder ta série' : 'Apprends aujourd’hui pour lancer ta série'}">${flameIcon()}<b>${streak}</b><span>jour${streak > 1 ? 's' : ''} de série</span></div>
      </div>
    </div>`;
  // Une seule action évidente (chemin linéaire). Cartes à revoir = priorité ;
  // sinon on reprend / commence une chanson.
  let hero = '';
  if (dueCount > 0) {
    hero = `<div class="continue-card" onclick="startReview()">
      <div class="cc-l"><div class="cc-tag">Révision</div><div class="cc-ttl">${dueCount} carte${dueCount > 1 ? 's' : ''} à revoir</div><div class="cc-sub">Tes points faibles d'abord</div></div>
      <div class="cc-play">${playIcon()}</div>
    </div>`;
  } else {
    const na = nextActivity();
    if (na)
      hero = `<div class="continue-card" onclick="openSong('${na.song.id}')">
      <div class="cc-l"><div class="cc-tag">${na.label}</div><div class="cc-ttl">${esc(na.song.title)}</div><div class="cc-sub">${na.sub}</div></div>
      <div class="cc-play">${playIcon()}</div>
    </div>`;
  }

  const songs = songsForLang()
    .slice()
    .sort(
      (a, b) => Math.abs(songBand(a) - S.band) - Math.abs(songBand(b) - S.band) || (a.title || '').localeCompare(b.title || '')
    );
  let grid: string;
  if (!songs.length) {
    grid = `<div class="empty"><b>Aucune chanson pour le moment</b>Demande à ton professeur d'en ajouter.</div>`;
  } else {
    grid =
      `<div class="songs-head">Tes chansons</div><div class="song-grid stagger">` +
      songs
        .map(s => {
          const b = songBand(s);
          const ps = S.prog.songs?.[s.id] ?? {};
          const ref = refrain(s);
          const pct = ref ? SRS.sectionPct(s, ref) : 0;
          return `<div class="song-card" data-cover-seed="${esc(s.id)}" data-cover="${esc(s.cover || '')}" onclick="openSong('${s.id}')">
      <div class="cefr-badge b${b}">${esc(s.cefr || ['', 'A2', 'B1', 'C1'][b])}</div>
      <div class="ttl">${esc(s.title)}</div>
      <div class="art">${esc(s.artist || '')}</div>
      ${ps.completed ? `<div class="done-tag">${ps.full ? 'Maîtrisé' : 'Complété'}</div>` : ''}
      <div class="prog"><div class="bar"><i style="width:${pct}%"></i></div></div>
    </div>`;
        })
        .join('') +
      `</div>`;
  }
  listEl.className = 'stagger';
  listEl.innerHTML = home + hero + grid;
  tintSongCards(listEl);
}

/* ---------- teinte de carte par couleur dominante de la pochette ----------
   Effet « Spotify » discret : on échantillonne une vignette de la pochette et on
   pose une teinte douce en fond de carte. Repli déterministe (teinte dérivée de
   l'identifiant) si la pochette manque ou si le canvas est bloqué par CORS. */
const coverTints = new Map<string, string>();
function tintSongCards(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.song-card[data-cover-seed]').forEach(card => {
    const seed = card.dataset.coverSeed || '';
    const cover = card.dataset.cover || '';
    const cached = coverTints.get(seed);
    if (cached) {
      card.style.setProperty('--cover-tint', cached);
      return;
    }
    // Repli immédiat : il y a toujours une teinte, affinée si l'extraction réussit.
    const fallback = tintFromSeed(seed);
    coverTints.set(seed, fallback);
    card.style.setProperty('--cover-tint', fallback);
    if (!cover) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const rgb = averageColor(img);
      if (!rgb) return; // canvas « tainted » (CORS) : on garde le repli
      const tint = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, .22)`;
      coverTints.set(seed, tint);
      card.style.setProperty('--cover-tint', tint);
    };
    img.src = cover;
  });
}
function averageColor(img: HTMLImageElement): [number, number, number] | null {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 16, 16);
    const d = ctx.getImageData(0, 0, 16, 16).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3]! < 200) continue;
      r += d[i]!;
      g += d[i + 1]!;
      b += d[i + 2]!;
      n++;
    }
    if (!n) return null;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  } catch {
    return null; // getImageData lève si le canvas est bloqué par CORS
  }
}
function tintFromSeed(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsla(${h}, 50%, 55%, .16)`;
}

/* ---------- parcours d'une chanson ---------- */
function openSong(id: string): void {
  const s = S.songs.find(x => x.id === id);
  if (!s) {
    showChooser();
    return;
  }
  setMiniSong(s);
  const secs = sections(s);
  if (!secs.length) {
    const sv = $id('songView');
    if (sv)
      sv.innerHTML = `<div class="song-head"><div class="row"><div><h2>${esc(s.title)}</h2><div class="art">${esc(s.artist || '')}</div></div></div></div><div class="empty"><b>Cette chanson n'a pas encore de paroles</b>Ajoute des paroles et une structure depuis l'espace gestion.</div>`;
    showView('song');
    return;
  }
  const ref = refrain(s);
  const refIdx = ref ? secs.indexOf(ref) : 0;
  const verses = secs.map((sec, i) => ({ sec, i })).filter(x => x.sec.type === 'couplet');
  const ps = S.prog.songs?.[id] ?? {};
  const refMastered = !!ref && SRS.sectionMastered(s, ref);
  const band = S.band;

  const verseUnlocked = (k: number): boolean => {
    if (!refMastered) return false;
    if (band >= 2) return true;
    for (let j = 0; j < k; j++) {
      if (!SRS.sectionMastered(s, verses[j]!.sec)) return false;
    }
    return true;
  };

  const versesNeeded = band === 1 ? verses.slice(0, 1) : verses;
  const versesDone = versesNeeded.every(v => SRS.sectionMastered(s, v.sec));
  const completed = refMastered && versesDone;
  const full = completed && ps.shadow === true;
  if (completed !== ps.completed || full !== ps.full) {
    ps.completed = completed;
    ps.full = full;
    if (!S.prog.songs) S.prog.songs = {};
    S.prog.songs[id] = ps;
    void saveProgress(S.uid, S.prog);
  }

  const bubble = (state: string): string =>
    state === 'done' ? miniCheck() : state === 'locked' ? lockIcon() : state === 'resting' ? clockIcon() : playIcon();
  const step = (state: string, tag: string, name: string, desc: string, action: string | null): string => `
    <div class="pstep ${state}" ${state === 'current' && action ? `onclick="${action}"` : ''}>
      <div class="pbubble">${bubble(state)}</div>
      <div class="pinfo"><div class="ptag">${tag}</div><div class="pname">${name}</div><div class="pdesc">${desc}</div></div>
    </div>`;

  let steps = '';
  steps += step(
    ps.discovered ? 'done' : 'current',
    'Étape 1',
    'Découverte',
    band === 1 ? 'Écoute en lisant la traduction' : band === 2 ? 'Écoute, traduction à la demande' : 'Écoute, sens des mots',
    `startDiscovery('${id}')`
  );
  const refReady = !ref || SRS.sectionReady(s, ref);
  const refState = !ps.discovered ? 'locked' : refMastered ? 'done' : refReady ? 'current' : 'resting';
  steps += step(
    refState,
    'Étape 2',
    'Refrain',
    refMastered
      ? 'Maîtrisé'
      : refState === 'resting'
        ? `En repos, reviens ${restLabel(ref ? SRS.sectionDueAt(s, ref) : Date.now())}`
        : `Entraîne-toi (${ref ? SRS.sectionPct(s, ref) : 0}% maîtrisé)`,
    refState === 'current' ? `startTraining('${id}',${refIdx})` : null
  );
  const shState = !refMastered ? 'locked' : ps.shadow ? 'done' : 'current';
  steps += step(
    shState,
    'Étape 3',
    'Refrain à voix haute',
    band === 3 ? 'Requis pour la maîtrise complète' : 'Répète le refrain à voix haute (facultatif)',
    refMastered && !ps.shadow ? `declareShadow('${id}')` : null
  );
  verses.forEach((v, k) => {
    const unlocked = verseUnlocked(k);
    const m = SRS.sectionMastered(s, v.sec);
    const ready = SRS.sectionReady(s, v.sec);
    const stt = !unlocked ? 'locked' : m ? 'done' : ready ? 'current' : 'resting';
    steps += step(
      stt,
      'Couplet ' + (k + 1),
      'Couplet ' + (k + 1),
      m
        ? 'Maîtrisé'
        : !unlocked
          ? 'Maîtrise le refrain d’abord'
          : stt === 'resting'
            ? `En repos, reviens ${restLabel(SRS.sectionDueAt(s, v.sec))}`
            : `Entraîne-toi (${SRS.sectionPct(s, v.sec)}% maîtrisé)`,
      stt === 'current' ? `startTraining('${id}',${v.i})` : null
    );
  });

  const banner = completed
    ? `<div class="complete-banner ${full ? 'full' : ''}">${full ? checkBig() : miniCheck()} <div><b>${full ? 'Maîtrise complète' : 'Chanson complétée'}</b><span>${full ? 'Refrain + couplets maîtrisés, shadowing fait.' : band === 3 ? 'Fais le shadowing pour la maîtrise complète.' : 'Tu peux viser la maîtrise complète avec le shadowing.'}</span></div></div>`
    : '';

  const sv = $id('songView');
  if (sv)
    sv.innerHTML = `
    <div class="song-head">
      <div class="row">
        <div><h2>${esc(s.title)}</h2><div class="art">${esc(s.artist || '')} · ${langLabel(s.lang || 'pt')}</div></div>
        <div class="cefr-badge b${songBand(s)} big">${esc(s.cefr || 'A2')}</div>
      </div>
    </div>
    ${songMeters(s)}
    ${xpStrip(true)}
    ${banner}
    <div class="parcours">${steps}</div>`;
  showView('song');
}

async function declareShadow(id: string): Promise<void> {
  if (!S.prog.songs) S.prog.songs = {};
  S.prog.songs[id] = S.prog.songs[id] ?? {};
  S.prog.songs[id]!.shadow = true;
  await saveProgress(S.uid, S.prog);
  toast('Bravo, shadowing noté');
  openSong(id);
}

/* ---------- Couche A : découverte / compréhension ---------- */
function startDiscovery(songId: string): void {
  const s = S.songs.find(x => x.id === songId);
  if (!s) return;
  S.sess = { kind: 'discovery', song: s, secs: sections(s), di: 0 };
  showView('exercise');
  void setupExAudio(s);
  renderDiscoveryStep();
}

// Découverte PAS À PAS : une seule partie (refrain/couplet) par écran · peu
// d'infos d'un coup ·, audio qui se lance seul + surlignage, étincelle à chaque
// « Suivant ». Plus addictif et plus direct qu'un mur de paroles.
function renderDiscoveryStep(): void {
  const ss = S.sess;
  const s = ss.song as Song;
  const secs = ss.secs as Section[];
  const di = ss.di as number;
  const sec = secs[di];
  if (!sec) {
    void markDiscovered(s.id);
    return;
  }
  const band = S.band;
  const last = di >= secs.length - 1;
  const dots = secs.map((_, i) => `<span class="dseg${i < di ? ' done' : i === di ? ' on' : ''}"></span>`).join('');
  const tag = sec.type === 'refrain' ? 'Refrain' : 'Couplet';
  const hint = band === 1 ? 'Écoute en lisant la traduction.' : band === 2 ? 'Touche une ligne pour sa traduction.' : 'Touche un mot pour son sens.';
  const wrap = $id('exWrap');
  if (wrap)
    wrap.innerHTML = `
    <div class="ex-card disc-step ex-listen">
      <div class="ex-top"><button class="close" onclick="quitToSong('${s.id}')">${xIcon()}</button><div class="dseg-row">${dots}</div></div>
      <div class="ex-tag">${tag} · partie ${di + 1} / ${secs.length}</div>
      ${s.youtubeId ? `<div class="audio-wrap"><button class="audio-hero" id="discPlay" type="button" aria-label="Réécouter">${earIcon()}</button><div class="audio-cap">Écoute cette partie</div></div>` : ''}
      <div class="lyrics step">${sectionLyrics(sec, band)}</div>
      <p class="disc-mini">${hint}</p>
      <div class="ex-foot"><span></span><div class="foot-actions"><button class="btn btn-primary" id="discNext">${last ? 'C’est parti !' : 'Suivant'}</button></div></div>
    </div>`;
  wireLyrics(band);
  const pb = $id('discPlay');
  if (pb) {
    pb.onclick = () => playDiscoSection();
    window.setTimeout(() => playDiscoSection(), 450); // lecture auto : immersion
  }
  const nx = $id('discNext');
  if (nx)
    nx.onclick = () => {
      burst(true); // petite étincelle de récompense
      if (last) {
        void markDiscovered(s.id);
      } else {
        ss.di++;
        renderDiscoveryStep();
      }
    };
}

// Joue la partie courante sur le lecteur caché (exAudio) et surligne la ligne en cours.
function playDiscoSection(): void {
  if (!exAudio) return;
  const offset = (S.sess.song as Song).offset || 0;
  const lineEls = Array.from(document.querySelectorAll<HTMLElement>('.lyrics .ly-line'));
  const times = lineEls.map(el => parseFloat(el.dataset.t || 'NaN'));
  const valid = times.filter(t => !isNaN(t));
  if (!valid.length) return;
  const start = Math.min(...valid);
  const end = Math.max(...valid) + 3.5;
  cancelAnimationFrame(exAudio.raf);
  const cap = $id('discPlay')?.parentElement?.querySelector('.audio-cap') as HTMLElement | null;
  try {
    exAudio.player.seekTo(start + offset, true);
    exAudio.player.playVideo();
    $id('discPlay')?.classList.add('playing');
    if (cap) cap.textContent = 'Le son joue…';
  } catch {
    return;
  }
  const tick = (): void => {
    if (!exAudio) return;
    const now = (exAudio.player.getCurrentTime?.() ?? 0) - offset;
    if (now >= end) {
      try {
        exAudio.player.pauseVideo();
      } catch {
        /* déjà arrêté */
      }
      lineEls.forEach(el => el.classList.remove('kara-active'));
      $id('discPlay')?.classList.remove('playing');
      if (cap) cap.textContent = 'Touche pour réécouter';
      return;
    }
    let idx = -1;
    for (let i = 0; i < times.length; i++) {
      if (!isNaN(times[i]) && times[i] <= now + 0.12) idx = i;
    }
    lineEls.forEach((el, i) => {
      el.classList.toggle('kara-active', i === idx);
      if (i === idx && S.band === 2) {
        const t = el.querySelector('.t') as HTMLElement | null;
        if (t) {
          t.textContent = el.dataset.fr || '';
          t.classList.remove('hidden-t');
        }
      }
    });
    exAudio.raf = requestAnimationFrame(tick);
  };
  exAudio.raf = requestAnimationFrame(tick);
}

/* Chargement de l'API YouTube IFrame (partagé par le lecteur audio caché exAudio). */
function loadYT(): Promise<any> {
  const w = window as any;
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT);
  return new Promise(resolve => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve(w.YT);
    };
    if (!document.getElementById('yt-iframe-api')) {
      const sc = document.createElement('script');
      sc.id = 'yt-iframe-api';
      sc.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(sc);
    }
  });
}

function sectionLyrics(sec: Section, band: number): string {
  const tag = sec.type === 'refrain' ? 'Refrain' : 'Couplet';
  const lines = sec.lines
    .map(l => {
      const dt = l.t != null ? ` data-t="${l.t}"` : '';
      if (band === 1) return `<div class="ly-line both"${dt}><span class="o">${esc(l.pt)}</span><span class="t">${esc(l.fr)}</span></div>`;
      if (band === 2)
        return `<div class="ly-line reveal" data-fr="${esc(l.fr)}"${dt}><span class="o">${esc(l.pt)}</span><span class="t hidden-t"></span></div>`;
      return `<div class="ly-line words"${dt}>${wordsHtml(l)}</div>`;
    })
    .join('');
  return `<div class="ly-sec ${sec.type}"><div class="ly-tag">${tag}</div>${lines}</div>`;
}

// Rend les mots cliquables. Si la ligne porte des données enrichies (words[]),
// chaque mot connu reçoit son SENS EN CONTEXTE (data-gloss) · la vraie correction
// de la reconnaissance de mots, qui résout conjugaisons/accords via le lemme.
const stripPunct = (w: string): string => w.replace(/[.,;:!?¿¡"'“”«»()…]/g, '');
function wordsHtml(l: Line): string {
  const glossOf = new Map<string, string>();
  (l.words || []).forEach(w => glossOf.set(norm(stripPunct(w.w)), w.gloss || ''));
  return l.pt
    .split(/\s+/)
    .filter(Boolean)
    .map(tok => {
      const g = glossOf.get(norm(stripPunct(tok)));
      return g
        ? `<span class="w has-sense" data-w="${esc(tok)}" data-gloss="${esc(g)}">${esc(tok)}</span>`
        : `<span class="w" data-w="${esc(tok)}">${esc(tok)}</span>`;
    })
    .join(' ');
}
function wireLyrics(band: number): void {
  if (band === 2)
    document.querySelectorAll<HTMLElement>('.ly-line.reveal').forEach(el => {
      el.onclick = () => {
        const t = el.querySelector('.t') as HTMLElement | null;
        if (t) {
          t.textContent = el.dataset.fr || '';
          t.classList.remove('hidden-t');
        }
      };
    });
  if (band === 3)
    document.querySelectorAll<HTMLElement>('.ly-line.words .w').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation(); // ne pas déclencher le seek karaoké de la ligne
        const tr = el.dataset.gloss || wordSense(el.dataset.w || '');
        toast(tr ? (el.dataset.w || '') + ' : ' + tr : 'sens non renseigné');
      };
    });
}
function wordSense(w: string): string | null {
  const s = S.sess.song as Song;
  const n = norm(w.replace(/[.,;:!?¿¡"']/g, ''));
  const p = (s.pairs ?? []).find(p => norm((p.pt || '').split(/\s+/)[0]) === n);
  return p ? p.fr : null;
}
async function markDiscovered(id: string): Promise<void> {
  stopExAudio();
  if (!S.prog.songs) S.prog.songs = {};
  S.prog.songs[id] = S.prog.songs[id] ?? {};
  const fresh = !S.prog.songs[id]!.discovered;
  S.prog.songs[id]!.discovered = true;
  if (fresh) S.prog.xp = (S.prog.xp || 0) + 5;
  await saveProgress(S.uid, S.prog);
  if (fresh) {
    toast('+5 XP · première écoute');
    bumpDaily();
  }
  openSong(id);
}

/* ---------- Couche B : entraînement cloze ---------- */
function buildChoices(s: Song, answer: string): string[] {
  const pool = (s.pairs ?? [])
    .map(p => (p.pt || '').split(/\s+/)[0])
    .filter(w => w && norm(w) !== norm(answer));
  const ex = [...new Set(pool)];
  const opts = [answer, ...shuffle(ex).slice(0, 3)];
  while (opts.length < 4) opts.push(answer + '·');
  return shuffle([...new Set(opts)]).slice(0, 4);
}
function startTraining(songId: string, si: number): void {
  const s = S.songs.find(x => x.id === songId);
  if (!s) return;
  const sec = sections(s)[si];
  if (!sec) return;
  // Blocage multi-jours : une partie déjà travaillée se repose jusqu'à son échéance.
  if (!SRS.sectionReady(s, sec)) {
    toast('Cette partie se repose. Reviens ' + restLabel(SRS.sectionDueAt(s, sec)) + '.');
    openSong(songId);
    return;
  }
  SRS.generateForSection(s, sec);
  const band = S.band;
  const adj = S.prog.songs?.[songId]?.clozeLevel ?? 0;
  const perLine = Math.max(1, (band === 1 ? 1 : band === 2 ? 2 : 3) + adj);
  const mode = band === 1 ? 'choice' : 'type';
  const clean = (w: string): string => w.replace(/[.,;:!?¿¡"'«»…]/g, '');
  const qs: any[] = [];
  sec.lines.forEach((l, li) => {
    const words = l.pt.split(/\s+/);
    if (!words.length) return;
    const idxs = words.map((_w, i) => i);
    const keyIdx = idxs.filter(i =>
      (s.pairs ?? []).some(p => norm((p.pt || '').split(/\s+/)[0]) === norm(clean(words[i]!)))
    );
    let chosen = (keyIdx.length ? keyIdx : [...idxs].sort((a, b) => clean(words[b]!).length - clean(words[a]!).length))
      .slice(0, perLine)
      .sort((a, b) => a - b);
    if (!chosen.length) chosen = [0];
    chosen.forEach(bi => {
      const answer = clean(words[bi]!);
      qs.push({
        li,
        words,
        blank: bi,
        answer,
        fr: l.fr,
        pt: l.pt,
        mode,
        opts: mode === 'choice' ? buildChoices(s, answer) : null,
        t: l.t ?? null,
        tEnd: sec.lines[li + 1]?.t ?? null
      });
    });
  });
  S.sess = { kind: 'training', song: s, sec, si, qs: shuffle(qs), idx: 0, correct: 0, lineRes: {}, hintN: 0, locked: false, sel: null };
  showView('exercise');
  void setupExAudio(s);
  renderClozeQ();
}

/* ---------- Audio des exercices d'écoute : joue le snippet exact d'un vers
   (seek au timecode de la ligne via YouTube, pause au vers suivant). Réutilise
   loadYT(). Lecteur caché persistant, hors de #exWrap (qui est reconstruit). ---------- */
let exAudio: { player: any; raf: number } | null = null;

async function setupExAudio(s: Song): Promise<void> {
  stopExAudio();
  if (!s.youtubeId) return;
  const host = $id('exercise');
  if (!host) return;
  const mount = document.createElement('div');
  mount.id = 'exYt';
  mount.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1';
  host.appendChild(mount);
  const YT = await loadYT();
  if (!$id('exYt')) return; // sorti entre-temps
  const player = new YT.Player('exYt', {
    videoId: s.youtubeId,
    playerVars: { rel: 0, playsinline: 1, controls: 0 },
    events: {}
  });
  exAudio = { player, raf: 0 };
}

function playLine(t: number, tEnd: number | null, offset: number): void {
  if (!exAudio) return;
  cancelAnimationFrame(exAudio.raf);
  const end = (tEnd != null ? tEnd : t + 4) + offset;
  try {
    exAudio.player.seekTo(t + offset, true);
    exAudio.player.playVideo();
  } catch {
    return;
  }
  const tick = (): void => {
    if (!exAudio) return;
    if ((exAudio.player.getCurrentTime?.() ?? 0) >= end) {
      try {
        exAudio.player.pauseVideo();
      } catch {
        /* déjà arrêté */
      }
      return;
    }
    exAudio.raf = requestAnimationFrame(tick);
  };
  exAudio.raf = requestAnimationFrame(tick);
}

function stopExAudio(): void {
  if (!exAudio) return;
  cancelAnimationFrame(exAudio.raf);
  try {
    exAudio.player.destroy();
  } catch {
    /* déjà détruit */
  }
  exAudio = null;
  $id('exYt')?.remove();
}

/* ---------- Lecteur audio persistant (mini-barre, hors exercice) ----------
   Joue le morceau ENTIER de la chanson en cours, sur l'accueil et le parcours.
   Se met en pause et s'efface dès qu'un exercice démarre (focus total). Player
   YouTube DÉDIÉ (séparé du lecteur de segments exAudio) : aucun conflit, et les
   deux ne jouent jamais en même temps (vues disjointes). État préservé entre
   accueil et parcours (le player n'est ni détruit ni recréé à la navigation). */
let miniAudio: { player: any; raf: number; videoId: string } | null = null;
let miniSong: Song | null = null;

function setMiniSong(s: Song): void {
  miniSong = s;
}

function mountMiniPlayer(): void {
  if ($id('miniPlayer')) return;
  const bar = document.createElement('div');
  bar.id = 'miniPlayer';
  bar.className = 'mini-player';
  bar.innerHTML =
    `<img class="mp-cover" id="mpCover" alt="" />` +
    `<button class="mp-play" id="mpPlay" type="button" aria-label="Lecture">${mpPlayIcon()}</button>` +
    `<div class="mp-meta"><div class="mp-ttl" id="mpTtl"></div><div class="mp-art" id="mpArt"></div>` +
    `<div class="mp-bar"><i id="mpProg"></i></div></div>`;
  document.body.appendChild(bar);
  $id('mpPlay')?.addEventListener('click', () => void toggleMiniPlay());
}

function refreshMiniPlayer(): void {
  const bar = $id('miniPlayer');
  if (!bar) return;
  if (!miniSong || !miniSong.youtubeId) {
    bar.classList.remove('show');
    return;
  }
  const cover = $id('mpCover') as HTMLImageElement | null;
  if (cover) cover.src = miniSong.cover || '';
  const ttl = $id('mpTtl');
  if (ttl) ttl.textContent = miniSong.title || '';
  const art = $id('mpArt');
  if (art) art.textContent = miniSong.artist || '';
  bar.classList.add('show');
  // Si on écoutait déjà et que la chanson a changé, on bascule le son en cours.
  if (miniAudio && miniAudio.videoId !== miniSong.youtubeId) {
    try {
      if (miniAudio.player.getPlayerState?.() === 1) {
        miniAudio.player.loadVideoById(miniSong.youtubeId);
        miniAudio.videoId = miniSong.youtubeId;
      }
    } catch {
      /* player pas prêt */
    }
  }
}

function hideMiniPlayer(): void {
  $id('miniPlayer')?.classList.remove('show');
  if (miniAudio) {
    cancelAnimationFrame(miniAudio.raf);
    try {
      miniAudio.player.pauseVideo();
    } catch {
      /* idle */
    }
  }
  setMiniIcon(false);
}

async function toggleMiniPlay(): Promise<void> {
  const s = miniSong;
  if (!s?.youtubeId) return;
  if (!miniAudio) {
    const YT = await loadYT();
    if (!$id('miniPlayer')) return;
    if (!$id('miniYt')) {
      const mount = document.createElement('div');
      mount.id = 'miniYt';
      mount.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1';
      document.body.appendChild(mount);
    }
    const vid = s.youtubeId;
    const player = new YT.Player('miniYt', {
      videoId: vid,
      playerVars: { rel: 0, playsinline: 1, controls: 0 },
      events: {
        onReady: () => {
          try {
            player.playVideo();
          } catch {
            /* ignore */
          }
        },
        onStateChange: onMiniState
      }
    });
    miniAudio = { player, raf: 0, videoId: vid };
    return;
  }
  try {
    if (miniAudio.videoId !== s.youtubeId) {
      miniAudio.player.loadVideoById(s.youtubeId);
      miniAudio.videoId = s.youtubeId;
      return;
    }
    if (miniAudio.player.getPlayerState?.() === 1) miniAudio.player.pauseVideo();
    else miniAudio.player.playVideo();
  } catch {
    /* player pas prêt */
  }
}

function onMiniState(e: any): void {
  const playing = e?.data === 1; // YT.PlayerState.PLAYING
  setMiniIcon(playing);
  if (!miniAudio) return;
  cancelAnimationFrame(miniAudio.raf);
  if (playing) miniAudio.raf = requestAnimationFrame(miniTick);
}

function miniTick(): void {
  if (!miniAudio) return;
  try {
    const p = miniAudio.player;
    const dur = p.getDuration?.() || 0;
    const cur = p.getCurrentTime?.() || 0;
    const prog = $id('mpProg');
    if (prog && dur > 0) prog.style.width = `${Math.min(100, (cur / dur) * 100)}%`;
  } catch {
    /* player pas prêt */
  }
  miniAudio.raf = requestAnimationFrame(miniTick);
}

function setMiniIcon(playing: boolean): void {
  const btn = $id('mpPlay');
  if (!btn) return;
  btn.innerHTML = playing ? mpPauseIcon() : mpPlayIcon();
  btn.setAttribute('aria-label', playing ? 'Pause' : 'Lecture');
}

function mpPlayIcon(): string {
  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
}
function mpPauseIcon(): string {
  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
}

function renderClozeQ(): void {
  const ss = S.sess;
  if (ss.idx >= ss.qs.length) {
    void finishTraining();
    return;
  }
  const q = ss.qs[ss.idx];
  ss.hintN = 0;
  ss.sel = null;
  ss.locked = false;
  const hasAudio = !!(ss.song as Song).youtubeId && q.t != null;
  const pct = Math.round((ss.idx / ss.qs.length) * 100);
  const lineHtml = q.words
    .map((w: string, i: number) => (i === q.blank ? `<span class="blank" id="blank">?</span>` : `<span>${esc(w)}</span>`))
    .join(' ');
  const answerArea =
    q.mode === 'choice'
      ? `<div class="choices">${q.opts.map((o: string) => `<button class="choice" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>`
      : `<input class="ex-input" id="wIn" placeholder="le mot manquant..." autocomplete="off" autocapitalize="off"><div class="hint-line" id="hintLine"></div>`;
  const wrap = $id('exWrap');
  if (wrap)
    wrap.innerHTML = `
    <div class="ex-card${hasAudio ? ' ex-listen' : ''}">
      <div class="ex-top"><button class="close" onclick="quitToSong('${ss.song.id}')">${xIcon()}</button><div class="bar"><i style="width:${pct}%"></i></div></div>
      <div class="ex-tag">${ss.sec.type === 'refrain' ? 'Refrain' : 'Couplet'} · ${langOf()}</div>
      <div class="ex-q">${hasAudio ? 'Écoute, puis complète' : 'Complète le vers'}</div>
      ${hasAudio ? `<div class="audio-wrap"><button class="audio-hero" id="listenBtn" type="button" aria-label="Réécouter">${earIcon()}</button><div class="audio-cap">Touche pour réécouter</div></div>` : ''}
      <div class="cloze">${lineHtml}</div>
      <div class="ex-prompt fr-help">${esc(q.fr)}</div>
      ${answerArea}
      ${foot()}
    </div>`;
  requestAnimationFrame(() => {
    const b = $id('exWrap')?.querySelector('.bar i') as HTMLElement | null;
    if (b) b.style.width = pct + '%';
  });
  wireCloze(q);
}
function wireCloze(q: any): void {
  const lb = $id('listenBtn') as HTMLButtonElement | null;
  if (lb) {
    const offset = (S.sess.song as Song).offset || 0;
    const dur = q.tEnd != null ? q.tEnd - q.t : 4;
    const cap = lb.parentElement?.querySelector('.audio-cap') as HTMLElement | null;
    const play = (): void => {
      lb.classList.add('playing');
      if (cap) cap.textContent = 'Le son joue…';
      playLine(q.t, q.tEnd, offset);
      window.setTimeout(() => {
        lb.classList.remove('playing');
        if (cap) cap.textContent = 'Touche pour réécouter';
      }, Math.max(800, dur * 1000 + 300));
    };
    lb.onclick = play;
    // Lecture automatique : l'apprenant est « dans le truc ». Si l'autoplay est
    // bloqué (politique navigateur, lecteur pas prêt), il touche le bouton.
    window.setTimeout(play, 350);
  }
  const check = $id('checkBtn') as HTMLButtonElement | null;
  if (!check) return;
  if (q.mode === 'choice') {
    check.style.display = 'none'; // un seul tap : pas de bouton « Valider »
    document.querySelectorAll<HTMLButtonElement>('.choice').forEach(btn => {
      btn.onclick = () => {
        if (S.sess.locked) return;
        const good = match(btn.dataset.o || '', q.answer);
        const blank = $id('blank');
        if (blank) blank.textContent = btn.dataset.o || '';
        document.querySelectorAll<HTMLButtonElement>('.choice').forEach(b => {
          if (match(b.dataset.o || '', q.answer)) b.classList.add('good');
          else if (b === btn) b.classList.add('bad');
          else b.classList.add('dim');
        });
        gradeCloze(q, good);
        settle(good, good ? null : 'Réponse : ' + q.answer);
      };
    });
  } else {
    const inp = $id('wIn') as HTMLInputElement | null;
    const hintBtn = $id('hintBtn') as HTMLButtonElement | null;
    if (!inp) return;
    inp.oninput = () => {
      check.disabled = inp.value.trim() === '';
    };
    if (hintBtn)
      hintBtn.onclick = () => {
        if (S.sess.hintN < q.answer.length) {
          S.sess.hintN++;
          renderHint(q.answer);
        }
        if (S.sess.hintN >= q.answer.length) hintBtn.disabled = true;
      };
    const submit = () => {
      if (S.sess.locked || inp.value.trim() === '') return;
      const good = match(inp.value, q.answer);
      inp.classList.add(good ? 'good' : 'bad');
      const blank = $id('blank');
      if (blank) blank.textContent = q.answer;
      gradeCloze(q, good);
      settle(good, good ? null : 'Réponse : ' + q.answer);
    };
    check.onclick = submit;
    inp.onkeydown = e => {
      if (e.key === 'Enter' && !check.disabled) submit();
    };
    inp.focus();
  }
}
function gradeCloze(q: any, good: boolean): void {
  const s = S.sess.song as Song;
  const pair = (s.pairs ?? []).find(p => norm((p.pt || '').split(/\s+/)[0]) === norm(q.answer));
  if (pair) {
    const id = SRS.cardId(s.id, 'mot', pair.pt);
    if (SRS.card(id)) SRS.grade(id, good);
  }
  S.sess.lineRes[q.li] = S.sess.lineRes[q.li] !== false && good;
  SRS.pushRecent(S.prog, good);
}
async function finishTraining(): Promise<void> {
  stopExAudio();
  const ss = S.sess;
  const s = ss.song as Song;
  ss.sec.lines.forEach((l: any, li: number) => {
    if (l.pt) {
      const id = SRS.cardId(s.id, 'phrase', l.pt);
      const r = ss.lineRes[li];
      if (r !== undefined) SRS.grade(id, r);
    }
  });
  const total = ss.qs.length;
  const rate = total ? Math.round((ss.correct / total) * 100) : 100;
  if (!S.prog.songs) S.prog.songs = {};
  S.prog.songs[s.id] = S.prog.songs[s.id] ?? {};
  let adj = S.prog.songs[s.id]!.clozeLevel ?? 0;
  if (rate < 80) adj = Math.max(-1, adj - 1);
  else if (rate > 90) adj = Math.min(1, adj + 1);
  S.prog.songs[s.id]!.clozeLevel = adj;
  const mastered = SRS.sectionMastered(s, ss.sec);
  const xpBefore = S.prog.xp || 0;
  const gain = (ss.xpEarned || 0) + (mastered ? 60 : 0);
  S.prog.xp = xpBefore + gain;
  const liBefore = levelInfo(xpBefore);
  const liAfter = levelInfo(S.prog.xp || 0);
  const leveledUp = liAfter.lvl > liBefore.lvl;
  await SRS.save();
  await saveProgress(S.uid, S.prog);
  if (S.profile) await touchStreak(S.uid, S.profile);
  bumpDaily();
  if (mastered || leveledUp) confetti();
  const pct = SRS.sectionPct(s, ss.sec);
  const wrap = $id('exWrap');
  if (wrap)
    wrap.innerHTML = `
    <div class="finish">
      <div class="badge">${mastered ? checkBig() : repeatBig()}</div>
      <h2>${mastered ? (ss.sec.type === 'refrain' ? 'Refrain maîtrisé' : 'Couplet maîtrisé') : 'Bien joué'}</h2>
      <p>${mastered ? 'Tu peux passer à la suite.' : 'Cette partie se repose. Reviens ' + restLabel(SRS.sectionDueAt(s, ss.sec)) + ' pour la consolider.'}</p>
      <div class="reward"><div class="r"><div class="n">${rate}%</div><div class="l">réussite</div></div><div class="r"><div class="n">${pct}%</div><div class="l">maîtrise</div></div></div>
      ${xpReward(liAfter, leveledUp)}
      <div class="finish-acts">
        <button class="btn btn-primary" onclick="openSong('${s.id}')">Continuer</button>
      </div>
    </div>`;
  animateXp(gain, liAfter.pct);
}

// Bloc de récompense XP (barre de niveau + gain), animé après rendu.
function xpReward(li: { lvl: number; pct: number }, leveledUp: boolean): string {
  return `<div class="xp-reward">
      <div class="xpr-head"><span class="xpr-lvl">${leveledUp ? `Niveau ${li.lvl} atteint !` : `Niveau ${li.lvl}`}</span><span class="xpr-gain" id="xpGain">+0 XP</span></div>
      <div class="xpr-bar"><i id="xpBar" style="width:0%"></i></div>
    </div>`;
}
function animateXp(gain: number, pct: number): void {
  requestAnimationFrame(() => {
    const bar = $id('xpBar');
    if (bar) bar.style.width = pct + '%';
  });
  const g = $id('xpGain');
  if (!g) return;
  const start = performance.now();
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / 850);
    g.textContent = '+' + Math.round(gain * t) + ' XP';
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Couche C : révision quotidienne ---------- */
function startReview(): void {
  const dueCards = SRS.due().slice(0, 15);
  if (!dueCards.length) {
    toast("Aucune carte à réviser pour l'instant");
    return;
  }
  const qs = dueCards.map(c => {
    const s = S.songs.find(x => x.id === c.songId);
    if (c.type === 'phrase') {
      const words = c.text.split(/\s+/);
      return { review: true, card: c, kind: 'build', answer: c.text, fr: c.trad, words: shuffle(words.slice()), song: s };
    }
    return { review: true, card: c, kind: 'type', answer: (c.text || '').split(/\s+/)[0], fr: c.trad, song: s };
  });
  S.sess = { kind: 'review', qs: shuffle(qs), idx: 0, correct: 0, locked: false, hintN: 0, sel: null, song: null };
  showView('exercise');
  renderReviewQ();
}
function renderReviewQ(): void {
  const ss = S.sess;
  if (ss.idx >= ss.qs.length) {
    void finishReview();
    return;
  }
  const q = ss.qs[ss.idx];
  ss.locked = false;
  ss.hintN = 0;
  const pct = Math.round((ss.idx / ss.qs.length) * 100);
  let area: string;
  if (q.kind === 'build') {
    area = `<div class="builder"><div class="build-zone" id="zone"></div><div class="bank" id="bank">${q.words
      .map((w: string, i: number) => `<button class="tile" data-i="${i}">${esc(w)}</button>`)
      .join('')}</div></div>`;
  } else {
    area = `<input class="ex-input" id="wIn" placeholder="ta réponse..." autocomplete="off" autocapitalize="off"><div class="hint-line" id="hintLine"></div>`;
  }
  const wrap = $id('exWrap');
  if (wrap)
    wrap.innerHTML = `
    <div class="ex-card">
      <div class="ex-top"><button class="close" onclick="showChooser()">${xIcon()}</button><div class="bar"><i style="width:${pct}%"></i></div></div>
      <div class="ex-tag">Révision du jour · ${langLabel(q.song?.lang || S.curlang)}</div>
      <div class="ex-q">${q.kind === 'build' ? 'Reconstruis le vers' : 'Écris le mot'}</div>
      <div class="ex-prompt fr-help">${esc(q.fr || '·')}</div>
      ${area}
      ${foot()}
    </div>`;
  requestAnimationFrame(() => {
    const b = $id('exWrap')?.querySelector('.bar i') as HTMLElement | null;
    if (b) b.style.width = pct + '%';
  });
  wireReview(q);
}
function wireReview(q: any): void {
  const check = $id('checkBtn') as HTMLButtonElement | null;
  if (!check) return;
  if (q.kind === 'build') {
    const zone = $id('zone');
    const bank = $id('bank');
    if (!zone || !bank) return;
    const refresh = () => {
      check.disabled = zone.querySelectorAll('.tile').length === 0;
    };
    bank.querySelectorAll<HTMLButtonElement>('.tile').forEach(t => {
      t.onclick = () => {
        if (t.classList.contains('used') || S.sess.locked) return;
        t.classList.add('used');
        const c = t.cloneNode(true) as HTMLButtonElement;
        c.classList.remove('used');
        c.onclick = () => {
          if (S.sess.locked) return;
          c.remove();
          t.classList.remove('used');
          refresh();
        };
        zone.appendChild(c);
        refresh();
      };
    });
    check.onclick = () => {
      if (S.sess.locked || zone.querySelectorAll('.tile').length === 0) return;
      const built = [...zone.querySelectorAll('.tile')].map(x => x.textContent).join(' ');
      const good = match(built, q.answer);
      zone.style.borderColor = good ? 'var(--green)' : 'var(--red)';
      gradeReview(q, good);
      settle(good, good ? null : 'Réponse : ' + q.answer);
    };
  } else {
    const inp = $id('wIn') as HTMLInputElement | null;
    const hintBtn = $id('hintBtn') as HTMLButtonElement | null;
    if (!inp) return;
    inp.oninput = () => {
      check.disabled = inp.value.trim() === '';
    };
    if (hintBtn)
      hintBtn.onclick = () => {
        if (S.sess.hintN < q.answer.length) {
          S.sess.hintN++;
          renderHint(q.answer);
        }
        if (S.sess.hintN >= q.answer.length) hintBtn.disabled = true;
      };
    const submit = () => {
      if (S.sess.locked || inp.value.trim() === '') return;
      const good = match(inp.value, q.answer);
      inp.classList.add(good ? 'good' : 'bad');
      gradeReview(q, good);
      settle(good, good ? null : 'Réponse : ' + q.answer);
    };
    check.onclick = submit;
    inp.onkeydown = e => {
      if (e.key === 'Enter' && !check.disabled) submit();
    };
    inp.focus();
  }
}
function gradeReview(q: any, good: boolean): void {
  SRS.grade(q.card.id, good);
  SRS.pushRecent(S.prog, good);
}
async function finishReview(): Promise<void> {
  const ss = S.sess;
  const total = ss.qs.length;
  const rate = total ? Math.round((ss.correct / total) * 100) : 100;
  const xpBefore = S.prog.xp || 0;
  const gain = ss.xpEarned || 0;
  S.prog.xp = xpBefore + gain;
  const liBefore = levelInfo(xpBefore);
  const liAfter = levelInfo(S.prog.xp || 0);
  const leveledUp = liAfter.lvl > liBefore.lvl;
  await SRS.save();
  await saveProgress(S.uid, S.prog);
  if (S.profile) await touchStreak(S.uid, S.profile);
  bumpDaily();
  confetti();
  const wrap = $id('exWrap');
  if (wrap)
    wrap.innerHTML = `
    <div class="finish">
      <div class="badge">${checkBig()}</div>
      <h2>Révision terminée</h2>
      <p>${ss.correct}/${total} · la file s'est mise à jour.</p>
      <div class="reward"><div class="r"><div class="n">${rate}%</div><div class="l">réussite</div></div><div class="r"><div class="n">${SRS.stats().mastered}</div><div class="l">cartes maîtrisées</div></div></div>
      ${xpReward(liAfter, leveledUp)}
      <div class="finish-acts"><button class="btn btn-primary" onclick="showChooser()">Terminer</button></div>
    </div>`;
  animateXp(gain, liAfter.pct);
}

/* ---------- briques partagées ---------- */
function foot(): string {
  return `<div class="ex-foot"><div class="feedback" id="fb"></div><div class="foot-actions"><button class="btn btn-primary" id="checkBtn" disabled>Valider</button></div></div>`;
}
function renderHint(ans: string): void {
  const line = $id('hintLine');
  if (!line) return;
  let h = '';
  for (let i = 0; i < ans.length; i++) {
    const c = ans[i];
    h += c === ' ' ? `<span class="sp"></span>` : `<span class="hc">${i < S.sess.hintN ? esc(c) : '·'}</span>`;
  }
  line.innerHTML = h;
}
function settle(correct: boolean, msg?: string | null): void {
  if (S.sess.locked) return;
  S.sess.locked = true;
  if (correct) {
    S.sess.correct++;
    S.sess.combo = (S.sess.combo || 0) + 1;
    const bonus = Math.min(10, (S.sess.combo - 1) * 2); // bonus de série
    const earned = 10 + bonus;
    S.sess.xpEarned = (S.sess.xpEarned || 0) + earned;
    floatGain('+' + earned);
    if (S.sess.combo >= 3) comboFlash(S.sess.combo);
  } else {
    S.sess.combo = 0;
  }
  feedback(correct, msg);
  burst(correct);
  setTimeout(advance, correct ? 680 : 1500);
}
// Dopamine : +XP qui jaillit à chaque bonne réponse.
function floatGain(txt: string): void {
  // Rattaché à #exercise (pas à la carte) pour survivre au changement de question
  // et rester affiché plus longtemps.
  const host = $id('exercise');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'xp-float';
  el.textContent = txt;
  host.appendChild(el);
  setTimeout(() => el.remove(), 1900);
}
// Dopamine : flash de série quand les bonnes réponses s'enchaînent.
function comboFlash(n: number): void {
  const host = $id('exercise');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'combo-flash';
  el.textContent = n + ' d’affilée !';
  host.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}
function advance(): void {
  S.sess.idx++;
  if (S.sess.kind === 'review') renderReviewQ();
  else renderClozeQ();
}
function feedback(good: boolean, msg?: string | null): void {
  const fb = $id('fb');
  if (!fb) return;
  fb.className = 'feedback show ' + (good ? 'good' : 'bad');
  fb.innerHTML = good ? `${miniCheck()} Correct` : `${miniX()} ${esc(msg || 'Pas tout à fait')}`;
}
function burst(ok: boolean): void {
  const card = document.querySelector('.ex-card');
  if (!card) return;
  card.classList.add(ok ? 'flash-ok' : 'flash-no');
  const b = document.createElement('div');
  b.className = 'burst ' + (ok ? 'ok' : 'no');
  b.innerHTML = ok ? miniCheck(true) : miniX(true);
  card.appendChild(b);
  setTimeout(() => b.remove(), 720);
}
function confetti(): void {
  const c = document.createElement('div');
  c.className = 'confetti';
  document.body.appendChild(c);
  const cols = ['#80b7ff', '#b89bff', '#7ef0b0', '#b9d6ff'];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = cols[i % cols.length]!;
    p.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
    p.style.animationDelay = Math.random() * 0.4 + 's';
    c.appendChild(p);
  }
  setTimeout(() => c.remove(), 3500);
}
function quitToSong(id: string): void {
  stopExAudio();
  openSong(id);
}

/* toast minimal (équivalent R.toast) */
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(msg: string): void {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t!.classList.remove('show'), 2600);
}

/* petites icônes SVG (pas d'emoji) */
function xIcon(): string {
  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
}
function earIcon(): string {
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11a9 9 0 0 1 18 0v2M3 13v-2M21 13v-2M3 14a2 2 0 0 0 2 2 2 2 0 0 1 2 2 2 2 0 0 0 2 2M21 14a2 2 0 0 1-2 2 2 2 0 0 0-2 2 2 2 0 0 1-2 2"/></svg>';
}
function miniCheck(big?: boolean): string {
  const sz = big ? 0 : 18;
  return `<svg ${big ? '' : `width="${sz}" height="${sz}"`} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${big ? 2.6 : 3}" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>`;
}
function miniX(big?: boolean): string {
  return `<svg ${big ? '' : 'width="18" height="18"'} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${big ? 2.6 : 3}" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
}
function checkBig(): string {
  return '<svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>';
}
function repeatBig(): string {
  return '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M1 4v6h6M3.5 9a9 9 0 1 1 .5 6"/></svg>';
}
function lockIcon(): string {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
}
function playIcon(): string {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
}

/* pont transitoire : les onclick inline des chaînes HTML appellent ces fonctions. */
declare global {
  interface Window {
    showChooser: () => void;
    openSong: (id: string) => void;
    startDiscovery: (id: string) => void;
    markDiscovered: (id: string) => void;
    startTraining: (id: string, si: number) => void;
    quitToSong: (id: string) => void;
    declareShadow: (id: string) => void;
    startReview: () => void;
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}
Object.assign(window, { showChooser, openSong, startDiscovery, markDiscovered, startTraining, quitToSong, declareShadow, startReview });
