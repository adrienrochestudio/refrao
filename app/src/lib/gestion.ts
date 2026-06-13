// Contrôleur de l'espace gestion : port TypeScript du script de gestion.html.
// Fonctions appelées par les onclick inline exposées sur window (pont transitoire).
import {
  guard,
  getSongs,
  getProgress,
  getCohort,
  getCards,
  getLicense,
  listLearners,
  updateCohort,
  setLearnerLevel,
  changeCohortCode,
  saveSong,
  deleteSong,
  sections,
  songComplete,
  autoSections,
  sectionsToText,
  bandOf,
  bandName,
  langLabel,
  esc,
  norm,
  genId,
  entitlement,
  licenseValid,
  LANGS,
  CEFR,
  GENRES
} from './refrao';
import { withBase } from './paths';
import type { Song, Section, Pair, Profile, Progress } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface EditState {
  id: string | null;
  pairs: Pair[];
  selPt: string[];
  selFr: string[];
  sections: Section[] | null;
}
let edit: EditState = { id: null, pairs: [], selPt: [], selFr: [], sections: null };
let edMeta = { cover: '', preview: '' };
let SONGS: Song[] = [];
let PROFILE: Profile | null = null;
let UID = '';

const $ = (sel: string): HTMLElement | null => document.querySelector(sel);
const val = (sel: string): string => ($(sel) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)?.value ?? '';

export function boot(): void {
  guard('manager', async ({ user, profile }) => {
    UID = user!.uid;
    PROFILE = profile;
    await load();
  });
}

async function load(): Promise<void> {
  ($('#edLang') as HTMLSelectElement).innerHTML = LANGS.map(l => `<option value="${l.code}">${l.label}</option>`).join('');
  ($('#edLang') as HTMLSelectElement).onchange = () => {
    const cap = $('#capPt');
    if (cap) cap.textContent = langLabel(val('#edLang'));
  };
  ($('#edCefr') as HTMLSelectElement).innerHTML = CEFR.map(
    c => `<option value="${c}">${c} — bande ${bandOf(c)} (${bandName(bandOf(c))})</option>`
  ).join('');
  ($('#edCefr') as HTMLSelectElement).onchange = () => {
    const h = $('#bandHint');
    if (h) h.textContent = 'Bande ' + bandOf(val('#edCefr')) + ' — ' + bandName(bandOf(val('#edCefr')));
  };
  ($('#edGenre') as HTMLSelectElement).innerHTML =
    `<option value="">— choisir —</option>` + GENRES.map(g => `<option value="${g}">${g}</option>`).join('');

  SONGS = await getSongs();
  renderBank();
  await renderCohort();
  const id = new URLSearchParams(location.search).get('edit');
  if (id) openEditor(id);
}

async function renderCohort(): Promise<void> {
  const panel = $('#cohortPanel');
  if (!panel) return;
  const code = PROFILE?.cohortId || '';
  if (!code) {
    panel.innerHTML = '';
    return;
  }
  const cohort = (await getCohort(code)) ?? { code, lang: 'pt', level: 'A2', category: '' };
  let learners = await listLearners(code).catch(() => []);
  learners = learners.filter(l => l.role === 'learner');

  // Licence B2B
  const lic = await getLicense(UID).catch(() => null);
  const ent = entitlement();
  const valid = licenseValid();
  const until = lic?.validUntil ?? ent?.validUntil ?? null;
  const planName = lic?.plan ?? ent?.plan ?? '—';
  const seats = lic?.seats;
  const dleft = until ? Math.ceil((until - Date.now()) / 864e5) : null;
  const expSoon = !!(dleft !== null && dleft <= 30 && dleft > 0);
  const col = !valid ? 'var(--red)' : expSoon ? '#e0a800' : 'var(--green)';
  const untilStr = until ? new Date(until).toLocaleDateString('fr-FR') : '—';
  const seatStr = seats ? learners.length + ' / ' + seats + ' apprenants' : learners.length + ' apprenants';
  const licBanner = `<div class="lic-banner" style="display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;padding:10px 14px;margin-bottom:14px;border:1px solid var(--border);border-left:3px solid ${col};border-radius:10px;font-size:.84rem">
    <b style="color:${col}">Licence ${esc(planName)}</b>
    <span style="color:var(--text-mute)">${!valid ? 'expirée — création/édition bloquée' : 'valide jusqu\'au ' + esc(untilStr) + (expSoon ? ' · ' + dleft + ' j restants' : '')}</span>
    <span style="color:var(--text-mute);margin-left:auto">${esc(seatStr)}</span>
  </div>`;

  let rows = '';
  for (const l of learners) {
    const prog = await getProgress(l.uid).catch((): Progress => ({ xp: 0, songs: {}, recent: [] }));
    const cardsMap = await getCards(l.uid).catch(() => ({}) as Record<string, { state?: string }>);
    const mastered = Object.values(cardsMap).filter(c => c.state === 'maîtrisée').length;
    const r = prog.recent ?? [];
    const rate = r.length ? Math.round((r.filter(Boolean).length / r.length) * 100) + '%' : '—';
    const completed = Object.values(prog.songs ?? {}).filter(x => x.completed).length;
    const cefr = l.cefr || 'A2';
    const name = esc(((l.firstName || '') + ' ' + (l.lastName || '')).trim() || l.email || 'Apprenant');
    const sel = `<select class="lvl-sel" data-uid="${l.uid}">${CEFR.map(c => `<option value="${c}" ${c === cefr ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
    rows += `<tr><td>${name}</td><td>${sel}<span class="band-tag">B${bandOf(cefr)}</span></td><td class="v">${mastered}</td><td class="v">${completed}</td><td class="v">${rate}</td></tr>`;
  }
  const genreOpts =
    `<option value="">Toutes les catégories</option>` +
    GENRES.map(g => `<option value="${g}" ${cohort.category === g ? 'selected' : ''}>${g}</option>`).join('');
  panel.innerHTML = `
    ${licBanner}
    <div class="cohort-head">
      <div>
        <div class="cap">Ma cohorte</div>
        <div class="code"><span id="cohortCode">${esc(code)}</span>
          <button class="icbtn" id="editCode" title="Modifier l'identifiant"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
        </div>
        <div class="hint">Transmets ce code à tes apprenants.</div>
      </div>
      <div class="count"><div class="n">${learners.length}</div><div class="l">apprenant${learners.length > 1 ? 's' : ''}</div></div>
    </div>
    <div class="cohort-settings">
      <div class="cs-field"><label>Langue</label><select id="coLang">${LANGS.map(l => `<option value="${l.code}" ${cohort.lang === l.code ? 'selected' : ''}>${l.label}</option>`).join('')}</select></div>
      <div class="cs-field"><label>Niveau visé</label><select id="coLevel">${CEFR.map(c => `<option value="${c}" ${cohort.level === c ? 'selected' : ''}>${c} — bande ${bandOf(c)}</option>`).join('')}</select></div>
      <div class="cs-field"><label>Catégorie de chansons</label><select id="coCat">${genreOpts}</select></div>
    </div>
    ${learners.length ? `<table class="cohort-table"><thead><tr><th>Apprenant</th><th>Niveau</th><th>Cartes</th><th>Complétées</th><th>Réussite</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="hint" style="margin-top:10px">Aucun apprenant n'a encore rejoint cette cohorte.</div>`}
  `;
  const saveCohort = async () => {
    try {
      await updateCohort(code, { lang: val('#coLang'), level: val('#coLevel'), category: val('#coCat') });
      toast('Cohorte mise à jour');
    } catch {
      toast('Impossible');
    }
  };
  ['coLang', 'coLevel', 'coCat'].forEach(id => {
    const el = document.getElementById(id) as HTMLSelectElement | null;
    if (el) el.onchange = saveCohort;
  });
  panel.querySelectorAll<HTMLSelectElement>('.lvl-sel').forEach(sel => {
    sel.onchange = async () => {
      try {
        await setLearnerLevel(sel.dataset.uid!, sel.value);
        toast('Niveau mis à jour');
        void renderCohort();
      } catch {
        toast('Impossible');
      }
    };
  });
  const editCode = document.getElementById('editCode');
  if (editCode)
    editCode.onclick = async () => {
      const nv = prompt('Nouvel identifiant de cohorte (lettres, chiffres, tirets) :', code);
      if (!nv) return;
      try {
        const applied = await changeCohortCode(code, nv, UID);
        if (PROFILE) PROFILE.cohortId = applied;
        void renderCohort();
        toast('Identifiant mis à jour');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Impossible');
      }
    };
}

function renderBank(): void {
  const listEl = $('#bankList');
  if (!listEl) return;
  const incomplete = SONGS.filter(s => !songComplete(s)).length;
  const sub = $('#bankSub');
  if (sub)
    sub.innerHTML =
      SONGS.length +
      ' chanson' +
      (SONGS.length > 1 ? 's' : '') +
      ' — bibliothèque commune' +
      (incomplete ? ` · <span style="color:var(--red)">${incomplete} incomplète${incomplete > 1 ? 's' : ''}</span>` : '');
  if (!SONGS.length) {
    listEl.className = '';
    listEl.innerHTML = `<div class="empty"><b>Aucune musique pour l'instant</b>Ajoute ta première chanson pour commencer.</div>`;
    return;
  }
  const sorted = SONGS.slice().sort(
    (a, b) => (songComplete(a) ? 1 : 0) - (songComplete(b) ? 1 : 0) || (a.title || '').localeCompare(b.title || '')
  );
  listEl.className = 'song-grid stagger';
  listEl.innerHTML = sorted
    .map(s => {
      const complete = songComplete(s);
      const vers = sections(s).reduce((n, sec) => n + sec.lines.length, 0);
      return `<div class="song-card ${complete ? '' : 'incomplete'}" onclick="openEditor('${s.id}')">
      <div class="acts">
        <a class="icbtn" href="${withBase('apprendre')}?song=${encodeURIComponent(s.id)}" onclick="event.stopPropagation()" title="Apprendre">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </a>
        <button class="icbtn btn-danger" onclick="event.stopPropagation();removeSong('${s.id}')" title="Supprimer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        </button>
      </div>
      <div class="badges">
        <span class="lang-badge">${langLabel(s.lang || 'pt')}</span>
        ${s.genre ? `<span class="genre-badge">${esc(s.genre)}</span>` : ''}
        ${complete ? '' : `<span class="incomplete-badge">incomplète</span>`}
      </div>
      <div class="ttl">${esc(s.title)}</div>
      <div class="art">${esc(s.artist || '—')}</div>
      ${s.tags ? `<div class="tags">${esc(s.tags)}</div>` : ''}
      <div class="meta">
        <span><span class="v">${s.pairs?.length || 0}</span> mots</span>
        <span><span class="v">${vers}</span> vers</span>
        ${s.cefr ? `<span class="v">${esc(s.cefr)}</span>` : ''}
      </div>
    </div>`;
    })
    .join('');
}

async function removeSong(id: string): Promise<void> {
  if (!confirm('Supprimer cette chanson de la bibliothèque ?')) return;
  await deleteSong(id);
  SONGS = await getSongs();
  renderBank();
  toast('Chanson supprimée');
}

/* ---- import Deezer (API publique, via JSONP pour éviter le CORS) ---- */
interface DeezerTrack {
  title?: string;
  artist?: { name?: string };
  album?: { cover_medium?: string };
  preview?: string;
  error?: unknown;
}
function parseDeezerId(url: string): string | null {
  const m = (url || '').match(/track\/(\d+)/);
  return m ? m[1]! : null;
}
function deezerJsonp(id: string): Promise<DeezerTrack> {
  return new Promise((res, rej) => {
    const cb = 'dz_' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const cleanup = () => {
      try {
        delete (window as any)[cb];
      } catch {
        /* ignore */
      }
      s.remove();
    };
    (window as any)[cb] = (d: DeezerTrack) => {
      cleanup();
      res(d);
    };
    s.onerror = () => {
      cleanup();
      rej(new Error('net'));
    };
    s.src = `https://api.deezer.com/track/${id}?output=jsonp&callback=${cb}`;
    document.body.appendChild(s);
  });
}
function showDzInfo(): void {
  const box = $('#dzInfo');
  if (!box) return;
  if (edMeta.cover || edMeta.preview) {
    box.classList.remove('hidden');
    box.style.display = 'flex';
    const img = $('#dzCover') as HTMLImageElement;
    img.src = edMeta.cover || '';
    img.style.display = edMeta.cover ? 'block' : 'none';
    const t = $('#dzTitle');
    if (t) t.textContent = val('#edSongTitle') || 'Extrait';
    const a = $('#dzAudio') as HTMLAudioElement;
    if (edMeta.preview) {
      a.src = edMeta.preview;
      a.style.display = 'block';
    } else {
      a.removeAttribute('src');
      a.style.display = 'none';
    }
  } else {
    box.classList.add('hidden');
  }
}
async function importDeezer(): Promise<void> {
  const id = parseDeezerId(val('#edDeezer').trim());
  if (!id) {
    toast('Colle un lien de piste Deezer (.../track/123...)');
    return;
  }
  toast('Récupération...');
  try {
    const d = await deezerJsonp(id);
    if (!d || d.error) {
      toast('Piste introuvable sur Deezer');
      return;
    }
    if (!val('#edSongTitle').trim()) ($('#edSongTitle') as HTMLInputElement).value = d.title || '';
    if (!val('#edArtist').trim()) ($('#edArtist') as HTMLInputElement).value = d.artist?.name || '';
    edMeta.cover = d.album?.cover_medium || '';
    edMeta.preview = d.preview || '';
    showDzInfo();
    toast('Infos Deezer récupérées');
  } catch {
    toast('Échec Deezer (réseau ou lien court non supporté)');
  }
}

/* ---- éditeur ---- */
function openEditor(id?: string): void {
  if (!licenseValid()) {
    toast('Licence expirée — contacte refrão pour la renouveler.');
    return;
  }
  const s = id ? SONGS.find(x => x.id === id) : null;
  edit = {
    id: s ? s.id : null,
    pairs: s ? (JSON.parse(JSON.stringify(s.pairs || [])) as Pair[]) : [],
    selPt: [],
    selFr: [],
    sections: s && Array.isArray(s.sections) ? (JSON.parse(JSON.stringify(s.sections)) as Section[]) : null
  };
  edMeta = { cover: s?.cover || '', preview: s?.preview || '' };
  const setV = (sel: string, v: string) => {
    const el = $(sel) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (el) el.value = v;
  };
  const setText = (sel: string, v: string) => {
    const el = $(sel);
    if (el) el.textContent = v;
  };
  setText('#edTitle', s ? 'Modifier la musique' : 'Ajouter une musique');
  setV('#edSongTitle', s ? s.title || '' : '');
  setV('#edArtist', s ? s.artist || '' : '');
  setV('#edDeezer', s ? s.deezer || '' : '');
  setV('#edLang', s ? s.lang || 'pt' : PROFILE?.lang || 'pt');
  setText('#capPt', langLabel(val('#edLang')));
  setV('#edCefr', s ? s.cefr || 'A2' : 'A2');
  setText('#bandHint', 'Bande ' + bandOf(val('#edCefr')) + ' — ' + bandName(bandOf(val('#edCefr'))));
  setV('#edGenre', s ? s.genre || '' : '');
  setV('#edTags', s ? s.tags || '' : '');
  const txt = s && Array.isArray(s.sections) && s.sections.length ? sectionsToText(s.sections) : { pt: s?.pt || '', fr: s?.fr || '' };
  setV('#edPt', txt.pt);
  setV('#edFr', txt.fr);
  renderStruct();
  rebuildTokens();
  renderPairs();
  showDzInfo();
  $('#editorBg')?.classList.add('open');
}
function detectStructure(): void {
  edit.sections = autoSections(val('#edPt'), val('#edFr'));
  renderStruct();
  toast(edit.sections.length + ' section(s) détectée(s) — vérifie refrain/couplet');
}
function renderStruct(): void {
  const panel = $('#structPanel');
  if (!panel) return;
  if (!edit.sections || !edit.sections.length) {
    panel.innerHTML = `<div class="hint-small">Sépare les sections par une ligne vide, puis « Détecter ». Tu pourras corriger refrain / couplet avant d'enregistrer.</div>`;
    return;
  }
  panel.innerHTML = edit.sections
    .map(
      (sec, i) => `
    <div class="struct-sec">
      <div class="struct-top">
        <div class="seg sm">
          <button class="seg-opt ${sec.type === 'refrain' ? 'on' : ''}" type="button" onclick="setSecType(${i},'refrain')">Refrain</button>
          <button class="seg-opt ${sec.type === 'couplet' ? 'on' : ''}" type="button" onclick="setSecType(${i},'couplet')">Couplet</button>
        </div>
        <span class="struct-n">${sec.lines.length} vers</span>
      </div>
      <div class="struct-lines">${sec.lines.map(l => `<div>${esc(l.pt)}<span>${esc(l.fr || '')}</span></div>`).join('')}</div>
    </div>`
    )
    .join('');
}
function setSecType(i: number, t: 'refrain' | 'couplet'): void {
  if (edit.sections && edit.sections[i]) edit.sections[i]!.type = t;
  renderStruct();
}
function closeEditor(): void {
  $('#editorBg')?.classList.remove('open');
}

function tokenize(t: string): string[] {
  return t.replace(/\n/g, ' ').split(/\s+/).filter(Boolean);
}
function rebuildTokens(): void {
  edit.selPt = [];
  edit.selFr = [];
  renderTokens('#tokPt', tokenize(val('#edPt')), 'pt');
  renderTokens('#tokFr', tokenize(val('#edFr')), 'fr');
}
function renderTokens(sel: string, toks: string[], side: 'pt' | 'fr'): void {
  const linked = new Set<string>();
  edit.pairs.forEach(p => (side === 'pt' ? p.pt : p.fr).split(/\s+/).forEach(w => linked.add(norm(w))));
  const box = $(sel);
  if (!box) return;
  box.innerHTML =
    toks
      .map(t => {
        const cls = linked.has(norm(t)) ? 'tok linked' : 'tok';
        return `<span class="${cls}" data-w="${esc(t)}">${esc(t)}</span>`;
      })
      .join('') || `<span style="color:var(--text-mute);font-size:.82rem">…</span>`;
  box.querySelectorAll<HTMLElement>('.tok').forEach(el => {
    el.onclick = () => {
      el.classList.toggle('sel');
      const arr = side === 'pt' ? edit.selPt : edit.selFr;
      const w = el.dataset.w || '';
      if (el.classList.contains('sel')) arr.push(w);
      else {
        const k = arr.indexOf(w);
        if (k >= 0) arr.splice(k, 1);
      }
    };
  });
}
function linkSelection(): void {
  if (!edit.selPt.length || !edit.selFr.length) {
    toast('Sélectionne au moins un mot de chaque côté');
    return;
  }
  edit.pairs.push({ pt: edit.selPt.join(' '), fr: edit.selFr.join(' ') });
  rebuildTokens();
  renderPairs();
}
function renderPairs(): void {
  const count = $('#pairCount');
  if (count) count.textContent = String(edit.pairs.length);
  const listEl = $('#pairList');
  if (!listEl) return;
  listEl.innerHTML =
    edit.pairs
      .map(
        (p, i) =>
          `<span class="pair-chip"><span class="pt">${esc(p.pt)}</span><span class="ar">→</span><span class="fr">${esc(p.fr)}</span><button class="x" onclick="delPair(${i})">×</button></span>`
      )
      .join('') || `<span style="color:var(--text-mute);font-size:.82rem">Aucune paire — sélectionne des mots ci-dessus.</span>`;
}
function delPair(i: number): void {
  edit.pairs.splice(i, 1);
  rebuildTokens();
  renderPairs();
}

async function saveEditor(): Promise<void> {
  const title = val('#edSongTitle').trim();
  if (!title) {
    toast('Donne un titre à la chanson');
    return;
  }
  const cefr = val('#edCefr');
  const secs = edit.sections && edit.sections.length ? edit.sections : autoSections(val('#edPt'), val('#edFr'));
  // sections = source unique des paroles ; on n'écrit plus pt/fr à plat.
  const song: Song = {
    id: edit.id || genId(),
    title,
    artist: val('#edArtist').trim(),
    lang: val('#edLang'),
    cefr,
    band: bandOf(cefr),
    genre: val('#edGenre'),
    tags: val('#edTags').trim(),
    sections: secs,
    deezer: val('#edDeezer').trim(),
    pairs: edit.pairs,
    cover: edMeta.cover || '',
    preview: edMeta.preview || ''
  };
  try {
    await saveSong(song);
  } catch {
    toast('Enregistrement refusé (licence ou droits).');
    return;
  }
  if (!songComplete(song)) toast('Enregistrée, mais incomplète — invisible côté apprenants');
  SONGS = await getSongs();
  const wasEdit = edit.id;
  closeEditor();
  renderBank();
  toast(wasEdit ? 'Chanson mise à jour' : 'Chanson ajoutée');
}

/* toast minimal */
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

/* live update des tokens quand on tape dans les zones de paroles */
document.addEventListener('input', e => {
  const id = (e.target as HTMLElement | null)?.id;
  if (id === 'edPt' || id === 'edFr') rebuildTokens();
});

/* pont transitoire pour les onclick inline */
declare global {
  interface Window {
    openEditor: (id?: string) => void;
    closeEditor: () => void;
    saveEditor: () => void;
    importDeezer: () => void;
    detectStructure: () => void;
    setSecType: (i: number, t: 'refrain' | 'couplet') => void;
    linkSelection: () => void;
    delPair: (i: number) => void;
    removeSong: (id: string) => void;
  }
}
Object.assign(window, {
  openEditor,
  closeEditor,
  saveEditor,
  importDeezer,
  detectStructure,
  setSecType,
  linkSelection,
  delPair,
  removeSong
});
