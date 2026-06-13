// Contrôleur de la page "apprendre" : port TypeScript de exercices.js + learn.js.
// Les fonctions référencées par des onclick inline (dans des chaînes HTML) sont
// exposées sur window — pont transitoire conservé tel quel pendant la migration ;
// le redesign produit remplacera ce pattern. La logique est fidèle à l'original.
import {
  guard,
  getSongs,
  getProgress,
  getCohort,
  saveProgress,
  touchStreak,
  sections,
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
import type { Song, Section, Progress, Profile, Cohort } from './types';

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

function renderChooser(): void {
  const listEl = $id('learnList');
  if (!listEl) return;
  const dueCount = SRS.due().length;
  const st = SRS.stats();
  const review = `
    <div class="review-card">
      <div class="rc-left">
        <div class="rc-tag"><span class="live-dot"></span>Révision du jour</div>
        <div class="rc-sub">${dueCount ? dueCount + ' carte' + (dueCount > 1 ? 's' : '') + ' à revoir — on commence par tes points faibles.' : "Rien d'urgent. Reviens après une nouvelle leçon."}</div>
        <div class="rc-stats"><span><b>${st.mastered}</b> maîtrisées</span><span><b>${st.learning}</b> en cours</span>${S.profile && S.profile.streak ? `<span><b>${S.profile.streak.count || 0}</b> j. de suite</span>` : ''}</div>
      </div>
      <button class="btn ${dueCount ? 'btn-primary' : 'btn-ghost'}" ${dueCount ? '' : 'disabled'} onclick="startReview()">Réviser</button>
    </div>`;

  const songs = songsForLang()
    .slice()
    .sort(
      (a, b) => Math.abs(songBand(a) - S.band) - Math.abs(songBand(b) - S.band) || (a.title || '').localeCompare(b.title || '')
    );
  let grid: string;
  if (!songs.length) {
    grid = `<div class="empty"><b>Aucune chanson en ${esc(langLabel(S.curlang))}</b>Choisis une autre langue, ou demande à un gestionnaire d'en ajouter.</div>`;
  } else {
    grid =
      `<div class="song-grid stagger">` +
      songs
        .map(s => {
          const b = songBand(s);
          const above = b > S.band;
          const ps = S.prog.songs?.[s.id] ?? {};
          const ref = refrain(s);
          const pct = ref ? SRS.sectionPct(s, ref) : 0;
          return `<div class="song-card" onclick="openSong('${s.id}')">
      <div class="cefr-badge b${b}">${esc(s.cefr || ['', 'A2', 'B1', 'C1'][b])}</div>
      <div class="ttl">${esc(s.title)}</div>
      <div class="art">${esc(s.artist || '—')}</div>
      ${above ? `<div class="above">un cran au-dessus · i+1</div>` : ''}
      ${ps.completed ? `<div class="done-tag">${ps.full ? 'Maîtrise complète' : 'Complétée'}</div>` : ''}
      <div class="prog"><div class="bar"><i style="width:${pct}%"></i></div></div>
    </div>`;
        })
        .join('') +
      `</div>`;
  }
  listEl.className = '';
  listEl.innerHTML = review + grid;
}

/* ---------- parcours d'une chanson ---------- */
function openSong(id: string): void {
  const s = S.songs.find(x => x.id === id);
  if (!s) {
    showChooser();
    return;
  }
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

  const step = (state: string, tag: string, name: string, desc: string, action: string | null): string => `
    <div class="pstep ${state}" ${state !== 'locked' && action ? `onclick="${action}"` : ''}>
      <div class="pbubble">${state === 'done' ? miniCheck() : state === 'locked' ? lockIcon() : playIcon()}</div>
      <div class="pinfo"><div class="ptag">${tag}</div><div class="pname">${name}</div><div class="pdesc">${desc}</div></div>
    </div>`;

  let steps = '';
  steps += step(
    ps.discovered ? 'done' : 'current',
    'Étape 1',
    'Découverte',
    band === 1 ? 'Écoute, paroles + traduction' : band === 2 ? 'Écoute, traduction à la demande' : 'Écoute, sens mot à mot',
    `startDiscovery('${id}')`
  );
  const refState = !ps.discovered ? 'locked' : refMastered ? 'done' : 'current';
  steps += step(
    refState,
    'Étape 2',
    'Refrain — entraînement',
    refMastered ? 'Maîtrisé' : `Cloze adaptatif · ${ref ? SRS.sectionPct(s, ref) : 0}% de maîtrise`,
    ps.discovered ? `startTraining('${id}',${refIdx})` : null
  );
  const shState = !refMastered ? 'locked' : ps.shadow ? 'done' : 'current';
  steps += step(
    shState,
    'Étape 3',
    'Refrain — shadowing',
    band === 3 ? 'Requis pour la maîtrise complète' : 'Répète le refrain à voix haute (facultatif)',
    refMastered ? `declareShadow('${id}')` : null
  );
  verses.forEach((v, k) => {
    const unlocked = verseUnlocked(k);
    const m = SRS.sectionMastered(s, v.sec);
    const stt = !unlocked ? 'locked' : m ? 'done' : 'current';
    steps += step(
      stt,
      'Couplet ' + (k + 1),
      'Couplet ' + (k + 1) + ' — entraînement',
      m ? 'Maîtrisé' : unlocked ? `Cloze · ${SRS.sectionPct(s, v.sec)}%` : "Maîtrise le refrain d'abord",
      unlocked ? `startTraining('${id}',${v.i})` : null
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
    ${banner}
    <div class="parcours">${steps}</div>`;
  showView('song');
}

async function declareShadow(id: string): Promise<void> {
  if (!S.prog.songs) S.prog.songs = {};
  S.prog.songs[id] = S.prog.songs[id] ?? {};
  S.prog.songs[id]!.shadow = true;
  await saveProgress(S.uid, S.prog);
  toast('Shadowing noté — bravo');
  openSong(id);
}

/* ---------- Couche A : découverte / compréhension ---------- */
function startDiscovery(songId: string): void {
  const s = S.songs.find(x => x.id === songId);
  if (!s) return;
  S.sess = { kind: 'discovery', song: s };
  showView('exercise');
  const band = S.band;
  const secs = sections(s);
  const body = secs.map(sec => sectionLyrics(sec, band)).join('');
  const wrap = $id('exWrap');
  if (wrap)
    wrap.innerHTML = `
    <div class="ex-card lyric-card">
      <div class="ex-top"><button class="close" onclick="quitToSong('${s.id}')">${xIcon()}</button><div class="cefr-badge b${songBand(s)}">${esc(s.cefr || 'A2')}</div></div>
      <div class="disc-head">
        <div class="ex-tag">Découverte</div>
        <h2>${esc(s.title)}</h2>
        <div class="art">${esc(s.artist || '')}</div>
        ${s.deezer ? `<a class="deezer" href="${esc(s.deezer)}" target="_blank" rel="noopener">${deezerIcon()} Écouter sur Deezer</a>` : ''}
        <p class="disc-note">${band === 1 ? 'Traduction affichée. Écoute en lisant.' : band === 2 ? 'Clique une ligne pour révéler sa traduction.' : 'Clique un mot pour son sens.'}</p>
      </div>
      <div class="lyrics">${body}</div>
      <div class="ex-foot"><span></span><div class="foot-actions"><button class="btn btn-primary" onclick="markDiscovered('${s.id}')">J'ai écouté — commencer</button></div></div>
    </div>`;
  wireLyrics(band);
}
function sectionLyrics(sec: Section, band: number): string {
  const tag = sec.type === 'refrain' ? 'Refrain' : 'Couplet';
  const lines = sec.lines
    .map(l => {
      if (band === 1) return `<div class="ly-line both"><span class="o">${esc(l.pt)}</span><span class="t">${esc(l.fr)}</span></div>`;
      if (band === 2)
        return `<div class="ly-line reveal" data-fr="${esc(l.fr)}"><span class="o">${esc(l.pt)}</span><span class="t hidden-t"></span></div>`;
      return `<div class="ly-line words">${l.pt
        .split(/\s+/)
        .map(w => `<span class="w" data-w="${esc(w)}">${esc(w)}</span>`)
        .join(' ')}</div>`;
    })
    .join('');
  return `<div class="ly-sec ${sec.type}"><div class="ly-tag">${tag}</div>${lines}</div>`;
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
      el.onclick = () => {
        const tr = wordSense(el.dataset.w || '');
        toast(tr ? (el.dataset.w || '') + ' — ' + tr : 'sens non renseigné');
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
  if (!S.prog.songs) S.prog.songs = {};
  S.prog.songs[id] = S.prog.songs[id] ?? {};
  S.prog.songs[id]!.discovered = true;
  await saveProgress(S.uid, S.prog);
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
      qs.push({ li, words, blank: bi, answer, fr: l.fr, pt: l.pt, mode, opts: mode === 'choice' ? buildChoices(s, answer) : null });
    });
  });
  S.sess = { kind: 'training', song: s, sec, si, qs: shuffle(qs), idx: 0, correct: 0, lineRes: {}, hintN: 0, locked: false, sel: null };
  showView('exercise');
  renderClozeQ();
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
    <div class="ex-card">
      <div class="ex-top"><button class="close" onclick="quitToSong('${ss.song.id}')">${xIcon()}</button><div class="bar"><i style="width:${pct}%"></i></div></div>
      <div class="ex-tag">${ss.sec.type === 'refrain' ? 'Refrain' : 'Couplet'} · ${langOf()}</div>
      <div class="ex-q">Complète le vers</div>
      <div class="ex-prompt fr-help">${esc(q.fr)}</div>
      <div class="cloze">${lineHtml}</div>
      ${answerArea}
      ${foot(q.mode === 'type')}
    </div>`;
  requestAnimationFrame(() => {
    const b = $id('exWrap')?.querySelector('.bar i') as HTMLElement | null;
    if (b) b.style.width = pct + '%';
  });
  wireCloze(q);
}
function wireCloze(q: any): void {
  const check = $id('checkBtn') as HTMLButtonElement | null;
  if (!check) return;
  if (q.mode === 'choice') {
    document.querySelectorAll<HTMLButtonElement>('.choice').forEach(btn => {
      btn.onclick = () => {
        if (S.sess.locked) return;
        document.querySelectorAll('.choice').forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
        S.sess.sel = btn.dataset.o;
        const blank = $id('blank');
        if (blank) blank.textContent = btn.dataset.o || '';
        check.disabled = false;
      };
    });
    check.onclick = () => {
      if (S.sess.locked || S.sess.sel == null) return;
      const good = match(S.sess.sel, q.answer);
      document.querySelectorAll<HTMLButtonElement>('.choice').forEach(b => {
        if (match(b.dataset.o || '', q.answer)) b.classList.add('good');
        else if (b.classList.contains('sel')) b.classList.add('bad');
        else b.classList.add('dim');
      });
      gradeCloze(q, good);
      settle(good);
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
  await SRS.save();
  await saveProgress(S.uid, S.prog);
  if (S.profile) await touchStreak(S.uid, S.profile);
  const mastered = SRS.sectionMastered(s, ss.sec);
  if (mastered) confetti();
  const pct = SRS.sectionPct(s, ss.sec);
  const wrap = $id('exWrap');
  if (wrap)
    wrap.innerHTML = `
    <div class="finish">
      <div class="badge">${mastered ? checkBig() : repeatBig()}</div>
      <h2>${mastered ? (ss.sec.type === 'refrain' ? 'Refrain maîtrisé' : 'Couplet maîtrisé') : 'Bien joué'}</h2>
      <p>${mastered ? 'Tu peux passer à la suite.' : 'Reviens pour consolider — la mémoire se construit par la répétition espacée.'}</p>
      <div class="reward"><div class="r"><div class="n">${rate}%</div><div class="l">réussite</div></div><div class="r"><div class="n">${pct}%</div><div class="l">maîtrise</div></div></div>
      <div class="finish-acts">
        ${mastered ? '' : `<button class="btn btn-ghost" onclick="startTraining('${s.id}',${ss.si})">Encore une passe</button>`}
        <button class="btn btn-primary" onclick="openSong('${s.id}')">Continuer</button>
      </div>
      <p class="adj-note">${rate < 80 ? 'On allègera un peu la prochaine fois.' : rate > 90 ? 'On corsera un peu la prochaine fois.' : 'Bon rythme : autour de 80–90 %.'}</p>
    </div>`;
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
      <div class="ex-prompt fr-help">${esc(q.fr || '—')}</div>
      ${area}
      ${foot(q.kind === 'type')}
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
  await SRS.save();
  await saveProgress(S.uid, S.prog);
  if (S.profile) await touchStreak(S.uid, S.profile);
  const ss = S.sess;
  const total = ss.qs.length;
  const rate = total ? Math.round((ss.correct / total) * 100) : 100;
  confetti();
  const wrap = $id('exWrap');
  if (wrap)
    wrap.innerHTML = `
    <div class="finish">
      <div class="badge">${checkBig()}</div>
      <h2>Révision terminée</h2>
      <p>${ss.correct}/${total} — la file s'est mise à jour.</p>
      <div class="reward"><div class="r"><div class="n">${rate}%</div><div class="l">réussite</div></div><div class="r"><div class="n">${SRS.stats().mastered}</div><div class="l">cartes maîtrisées</div></div></div>
      <div class="finish-acts"><button class="btn btn-primary" onclick="showChooser()">Terminer</button></div>
    </div>`;
}

/* ---------- briques partagées ---------- */
function foot(withHint: boolean): string {
  return `<div class="ex-foot"><div class="feedback" id="fb"></div><div class="foot-actions">${withHint ? `<button class="btn btn-ghost btn-sm" id="hintBtn">Indice</button>` : ''}<button class="btn btn-primary" id="checkBtn" disabled>Valider</button></div></div>`;
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
  if (correct) S.sess.correct++;
  feedback(correct, msg);
  burst(correct);
  setTimeout(advance, correct ? 850 : 1550);
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
function deezerIcon(): string {
  return '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4h3v4h-3zM19 9h3v4h-3zM14 9h3v4h-3zM14 14h3v4h-3zM9 14h3v4H9zM4 14h3v4H4z"/></svg>';
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
  }
}
Object.assign(window, { showChooser, openSong, startDiscovery, markDiscovered, startTraining, quitToSong, declareShadow, startReview });
