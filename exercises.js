/* ============================================================
   refrão — exercises.js
   Activités d'apprentissage (utilise S de learn.js + SRS de srs.js).
   - Découverte / compréhension (Couche A, §4.2)
   - Entraînement cloze refrain-d'abord, adaptatif par bande (§4.3, §4.6)
   - Révision quotidienne (Couche C, §5.4)
   ============================================================ */
function _$(id){ return document.getElementById(id); }
function langOf(){ return R.langLabel(S.sess.song?.lang || S.curlang); }

/* ---------- Couche A : compréhension ---------- */
function startDiscovery(songId){
  const s=S.songs.find(x=>x.id===songId);
  S.sess={kind:"discovery", song:s};
  showView("exercise");
  const band=S.band, secs=R.sections(s);
  const body = secs.map(sec=>sectionLyrics(sec, band)).join("");
  _$("exWrap").innerHTML=`
    <div class="ex-card lyric-card">
      <div class="ex-top"><button class="close" onclick="quitToSong('${s.id}')">${xIcon()}</button><div class="cefr-badge b${s.band||1}">${R.esc(s.cefr||"A2")}</div></div>
      <div class="disc-head">
        <div class="ex-tag">Découverte</div>
        <h2>${R.esc(s.title)}</h2>
        <div class="art">${R.esc(s.artist||"")}</div>
        ${s.deezer?`<a class="deezer" href="${R.esc(s.deezer)}" target="_blank" rel="noopener">${deezerIcon()} Écouter sur Deezer</a>`:""}
        <p class="disc-note">${band===1?"Traduction affichée. Écoute en lisant.":band===2?"Clique une ligne pour révéler sa traduction.":"Clique un mot pour son sens."}</p>
      </div>
      <div class="lyrics">${body}</div>
      <div class="ex-foot"><span></span><div class="foot-actions"><button class="btn btn-primary" onclick="markDiscovered('${s.id}')">J'ai écouté — commencer</button></div></div>
    </div>`;
  wireLyrics(band);
}
function sectionLyrics(sec, band){
  const tag = sec.type==="refrain" ? "Refrain" : "Couplet";
  const lines = sec.lines.map(l=>{
    if(band===1) return `<div class="ly-line both"><span class="o">${R.esc(l.pt)}</span><span class="t">${R.esc(l.fr)}</span></div>`;
    if(band===2) return `<div class="ly-line reveal" data-fr="${R.esc(l.fr)}"><span class="o">${R.esc(l.pt)}</span><span class="t hidden-t"></span></div>`;
    return `<div class="ly-line words">${l.pt.split(/\s+/).map(w=>`<span class="w" data-w="${R.esc(w)}">${R.esc(w)}</span>`).join(" ")}</div>`;
  }).join("");
  return `<div class="ly-sec ${sec.type}"><div class="ly-tag">${tag}</div>${lines}</div>`;
}
function wireLyrics(band){
  if(band===2) document.querySelectorAll(".ly-line.reveal").forEach(el=>{
    el.onclick=()=>{ const t=el.querySelector(".t"); t.textContent=el.dataset.fr; t.classList.remove("hidden-t"); };
  });
  if(band===3) document.querySelectorAll(".ly-line.words .w").forEach(el=>{
    el.onclick=()=>{ const tr=wordSense(el.dataset.w); R.toast(tr?el.dataset.w+" — "+tr:"sens non renseigné"); };
  });
}
function wordSense(w){
  const s=S.sess.song; const n=R.norm(w.replace(/[.,;:!?¿¡"']/g,""));
  const p=(s.pairs||[]).find(p=>R.norm((p.pt||"").split(/\s+/)[0])===n);
  return p?p.fr:null;
}
async function markDiscovered(id){
  S.prog.songs[id]=S.prog.songs[id]||{};
  S.prog.songs[id].discovered=true;
  await S.store.saveProgress(R.PROGRESS_ID, S.prog);
  openSong(id);
}

/* ---------- Couche B : entraînement cloze (refrain-d'abord) ---------- */
function buildChoices(s, answer){
  const pool=(s.pairs||[]).map(p=>(p.pt||"").split(/\s+/)[0]).filter(w=>w && R.norm(w)!==R.norm(answer));
  const ex=[...new Set(pool)]; const opts=[answer, ...R.shuffle(ex).slice(0,3)];
  while(opts.length<4) opts.push(answer+"·");           // garde-fou si peu de mots
  return R.shuffle([...new Set(opts)]).slice(0,4);
}
function startTraining(songId, si){
  const s=S.songs.find(x=>x.id===songId);
  const sec=R.sections(s)[si];
  SRS.generateForSection(s, sec);
  const band=S.band;
  const adj=(S.prog.songs[songId]?.clozeLevel)||0;
  const perLine=Math.max(1, (band===1?1:band===2?2:3)+adj);
  const mode = band===1 ? "choice" : "type";
  const clean = w => w.replace(/[.,;:!?¿¡"'«»…]/g,"");
  const qs=[];
  sec.lines.forEach((l,li)=>{
    const words=l.pt.split(/\s+/); if(!words.length) return;
    let idxs=words.map((w,i)=>i);
    const keyIdx=idxs.filter(i=>(s.pairs||[]).some(p=>R.norm((p.pt||"").split(/\s+/)[0])===R.norm(clean(words[i]))));
    let chosen=(keyIdx.length?keyIdx:[...idxs].sort((a,b)=>clean(words[b]).length-clean(words[a]).length)).slice(0,perLine).sort((a,b)=>a-b);
    if(!chosen.length) chosen=[0];
    chosen.forEach(bi=>{
      const answer=clean(words[bi]);
      qs.push({ li, words, blank:bi, answer, fr:l.fr, pt:l.pt, mode, opts: mode==="choice"?buildChoices(s,answer):null });
    });
  });
  S.sess={ kind:"training", song:s, sec, si, qs:R.shuffle(qs), idx:0, correct:0, lineRes:{}, hintN:0, locked:false, sel:null };
  showView("exercise"); renderClozeQ();
}
function renderClozeQ(){
  const ss=S.sess; if(ss.idx>=ss.qs.length) return finishTraining();
  const q=ss.qs[ss.idx]; ss.hintN=0; ss.sel=null; ss.locked=false;
  const pct=Math.round(ss.idx/ss.qs.length*100);
  const lineHtml=q.words.map((w,i)=> i===q.blank ? `<span class="blank" id="blank">?</span>` : `<span>${R.esc(w)}</span>`).join(" ");
  const answerArea = q.mode==="choice"
    ? `<div class="choices">${q.opts.map(o=>`<button class="choice" data-o="${R.esc(o)}">${R.esc(o)}</button>`).join("")}</div>`
    : `<input class="ex-input" id="wIn" placeholder="le mot manquant..." autocomplete="off" autocapitalize="off"><div class="hint-line" id="hintLine"></div>`;
  _$("exWrap").innerHTML=`
    <div class="ex-card">
      <div class="ex-top"><button class="close" onclick="quitToSong('${ss.song.id}')">${xIcon()}</button><div class="bar"><i style="width:${pct}%"></i></div></div>
      <div class="ex-tag">${ss.sec.type==="refrain"?"Refrain":"Couplet"} · ${langOf()}</div>
      <div class="ex-q">Complète le vers</div>
      <div class="ex-prompt fr-help">${R.esc(q.fr)}</div>
      <div class="cloze">${lineHtml}</div>
      ${answerArea}
      ${foot(q.mode==="type")}
    </div>`;
  requestAnimationFrame(()=>{const b=_$("exWrap").querySelector(".bar i"); if(b)b.style.width=pct+"%";});
  wireCloze(q);
}
function wireCloze(q){
  const check=_$("checkBtn");
  if(q.mode==="choice"){
    document.querySelectorAll(".choice").forEach(btn=>{
      btn.onclick=()=>{ if(S.sess.locked)return; document.querySelectorAll(".choice").forEach(b=>b.classList.remove("sel")); btn.classList.add("sel"); S.sess.sel=btn.dataset.o; _$("blank").textContent=btn.dataset.o; check.disabled=false; };
    });
    check.onclick=()=>{
      if(S.sess.locked||S.sess.sel==null)return;
      const good=R.match(S.sess.sel,q.answer);
      document.querySelectorAll(".choice").forEach(b=>{ if(R.match(b.dataset.o,q.answer))b.classList.add("good"); else if(b.classList.contains("sel"))b.classList.add("bad"); else b.classList.add("dim"); });
      gradeCloze(q, good); settle(good);
    };
  }else{
    const inp=_$("wIn"), hintBtn=_$("hintBtn");
    inp.oninput=()=>{ check.disabled=inp.value.trim()===""; };
    hintBtn.onclick=()=>{ if(S.sess.hintN<q.answer.length){S.sess.hintN++; renderHint(q.answer);} if(S.sess.hintN>=q.answer.length)hintBtn.disabled=true; };
    const submit=()=>{ if(S.sess.locked||inp.value.trim()==="")return; const good=R.match(inp.value,q.answer); inp.classList.add(good?"good":"bad"); _$("blank").textContent=q.answer; gradeCloze(q, good); settle(good, good?null:"Réponse : "+q.answer); };
    check.onclick=submit; inp.onkeydown=e=>{ if(e.key==="Enter"&&!check.disabled)submit(); }; inp.focus();
  }
}
function gradeCloze(q, good){
  const s=S.sess.song;
  // carte-mot correspondante
  const pair=(s.pairs||[]).find(p=>R.norm((p.pt||"").split(/\s+/)[0])===R.norm(q.answer));
  if(pair){ const id=SRS._id(s.id,"mot",pair.pt); if(SRS.cards[id]) SRS.grade(id, good); }
  // accumulateur par ligne (pour la carte-phrase)
  S.sess.lineRes[q.li] = (S.sess.lineRes[q.li]!==false) && good;
  SRS.pushRecent(S.prog, good);
}
async function finishTraining(){
  const ss=S.sess, s=ss.song;
  // note des cartes-phrases selon la réussite de chaque ligne dans cette passe
  ss.sec.lines.forEach((l,li)=>{ if(l.pt){ const id=SRS._id(s.id,"phrase",l.pt); const r=ss.lineRes[li]; if(r!==undefined) SRS.grade(id, r); } });
  const total=ss.qs.length, rate=total?Math.round(ss.correct/total*100):100;
  // ajustement 80–90 % (§4.6), à l'intérieur de la bande
  S.prog.songs[s.id]=S.prog.songs[s.id]||{};
  let adj=S.prog.songs[s.id].clozeLevel||0;
  if(rate<80) adj=Math.max(-1,adj-1); else if(rate>90) adj=Math.min(1,adj+1);
  S.prog.songs[s.id].clozeLevel=adj;
  await SRS.save();
  await S.store.saveProgress(R.PROGRESS_ID, S.prog);
  await R.touchStreak();
  const mastered=SRS.sectionMastered(s, ss.sec);
  if(mastered) confetti();
  const pct=SRS.sectionPct(s, ss.sec);
  _$("exWrap").innerHTML=`
    <div class="finish">
      <div class="badge">${mastered?checkBig():repeatBig()}</div>
      <h2>${mastered?(ss.sec.type==="refrain"?"Refrain maîtrisé":"Couplet maîtrisé"):"Bien joué"}</h2>
      <p>${mastered?"Tu peux passer à la suite.":"Reviens pour consolider — la mémoire se construit par la répétition espacée."}</p>
      <div class="reward"><div class="r"><div class="n">${rate}%</div><div class="l">réussite</div></div><div class="r"><div class="n">${pct}%</div><div class="l">maîtrise</div></div></div>
      <div class="finish-acts">
        ${mastered?"":`<button class="btn btn-ghost" onclick="startTraining('${s.id}',${ss.si})">Encore une passe</button>`}
        <button class="btn btn-primary" onclick="openSong('${s.id}')">Continuer</button>
      </div>
      <p class="adj-note">${rate<80?"On allègera un peu la prochaine fois.":rate>90?"On corsera un peu la prochaine fois.":"Bon rythme : autour de 80–90 %."}</p>
    </div>`;
}

/* ---------- Couche C : révision quotidienne ---------- */
function startReview(){
  const due=SRS.due().slice(0,15);
  if(!due.length){ R.toast("Aucune carte à réviser pour l'instant"); return; }
  const qs=due.map(c=>{
    const s=S.songs.find(x=>x.id===c.songId);
    if(c.type==="phrase"){ const words=c.text.split(/\s+/); return {review:true, card:c, kind:"build", answer:c.text, fr:c.trad, words:R.shuffle(words.slice()), song:s}; }
    return {review:true, card:c, kind:"type", answer:(c.text||"").split(/\s+/)[0], fr:c.trad, song:s};
  });
  S.sess={kind:"review", qs:R.shuffle(qs), idx:0, correct:0, locked:false, hintN:0, sel:null, song:null};
  showView("exercise"); renderReviewQ();
}
function renderReviewQ(){
  const ss=S.sess; if(ss.idx>=ss.qs.length) return finishReview();
  const q=ss.qs[ss.idx]; ss.locked=false; ss.hintN=0;
  const pct=Math.round(ss.idx/ss.qs.length*100);
  let area;
  if(q.kind==="build"){
    area=`<div class="builder"><div class="build-zone" id="zone"></div><div class="bank" id="bank">${q.words.map((w,i)=>`<button class="tile" data-i="${i}">${R.esc(w)}</button>`).join("")}</div></div>`;
  }else{
    area=`<input class="ex-input" id="wIn" placeholder="ta réponse..." autocomplete="off" autocapitalize="off"><div class="hint-line" id="hintLine"></div>`;
  }
  _$("exWrap").innerHTML=`
    <div class="ex-card">
      <div class="ex-top"><button class="close" onclick="showChooser()">${xIcon()}</button><div class="bar"><i style="width:${pct}%"></i></div></div>
      <div class="ex-tag">Révision du jour · ${R.langLabel(q.song?.lang||S.curlang)}</div>
      <div class="ex-q">${q.kind==="build"?"Reconstruis le vers":"Écris le mot"}</div>
      <div class="ex-prompt fr-help">${R.esc(q.fr||"—")}</div>
      ${area}
      ${foot(q.kind==="type")}
    </div>`;
  requestAnimationFrame(()=>{const b=_$("exWrap").querySelector(".bar i"); if(b)b.style.width=pct+"%";});
  wireReview(q);
}
function wireReview(q){
  const check=_$("checkBtn");
  if(q.kind==="build"){
    const zone=_$("zone"), bank=_$("bank");
    const refresh=()=>{ check.disabled=zone.querySelectorAll(".tile").length===0; };
    bank.querySelectorAll(".tile").forEach(t=>{
      t.onclick=()=>{ if(t.classList.contains("used")||S.sess.locked)return; t.classList.add("used"); const c=t.cloneNode(true); c.classList.remove("used"); c.onclick=()=>{ if(S.sess.locked)return; c.remove(); t.classList.remove("used"); refresh(); }; zone.appendChild(c); refresh(); };
    });
    check.onclick=()=>{ if(S.sess.locked||zone.querySelectorAll(".tile").length===0)return; const built=[...zone.querySelectorAll(".tile")].map(x=>x.textContent).join(" "); const good=R.match(built,q.answer); zone.style.borderColor=good?"var(--green)":"var(--red)"; gradeReview(q,good); settle(good, good?null:"Réponse : "+q.answer); };
  }else{
    const inp=_$("wIn"), hintBtn=_$("hintBtn");
    inp.oninput=()=>{ check.disabled=inp.value.trim()===""; };
    hintBtn.onclick=()=>{ if(S.sess.hintN<q.answer.length){S.sess.hintN++; renderHint(q.answer);} if(S.sess.hintN>=q.answer.length)hintBtn.disabled=true; };
    const submit=()=>{ if(S.sess.locked||inp.value.trim()==="")return; const good=R.match(inp.value,q.answer); inp.classList.add(good?"good":"bad"); gradeReview(q,good); settle(good, good?null:"Réponse : "+q.answer); };
    check.onclick=submit; inp.onkeydown=e=>{ if(e.key==="Enter"&&!check.disabled)submit(); }; inp.focus();
  }
}
function gradeReview(q, good){ SRS.grade(q.card.id, good); SRS.pushRecent(S.prog, good); }
async function finishReview(){
  await SRS.save(); await S.store.saveProgress(R.PROGRESS_ID, S.prog); await R.touchStreak();
  const ss=S.sess, total=ss.qs.length, rate=total?Math.round(ss.correct/total*100):100;
  confetti();
  _$("exWrap").innerHTML=`
    <div class="finish">
      <div class="badge">${checkBig()}</div>
      <h2>Révision terminée</h2>
      <p>${ss.correct}/${total} — la file s'est mise à jour.</p>
      <div class="reward"><div class="r"><div class="n">${rate}%</div><div class="l">réussite</div></div><div class="r"><div class="n">${SRS.stats().mastered}</div><div class="l">cartes maîtrisées</div></div></div>
      <div class="reflect" id="reflect">
        <label>Qu'est-ce qui a été difficile aujourd'hui ? <span>(facultatif)</span></label>
        <input id="reflectIn" placeholder="une note pour toi-même...">
      </div>
      <div class="finish-acts"><button class="btn btn-primary" onclick="showChooser()">Terminer</button></div>
    </div>`;
}

/* ---------- briques partagées ---------- */
function foot(withHint){
  return `<div class="ex-foot"><div class="feedback" id="fb"></div><div class="foot-actions">${withHint?`<button class="btn btn-ghost btn-sm" id="hintBtn">Indice</button>`:""}<button class="btn btn-primary" id="checkBtn" disabled>Valider</button></div></div>`;
}
function renderHint(ans){ const line=_$("hintLine"); if(!line)return; let h=""; for(let i=0;i<ans.length;i++){const c=ans[i]; h+= c===" "?`<span class="sp"></span>`:`<span class="hc">${i<S.sess.hintN?R.esc(c):"·"}</span>`;} line.innerHTML=h; }
function settle(correct, msg){ if(S.sess.locked)return; S.sess.locked=true; if(correct)S.sess.correct++; feedback(correct,msg); burst(correct); setTimeout(advance, correct?850:1550); }
function advance(){ S.sess.idx++; if(S.sess.kind==="review")renderReviewQ(); else renderClozeQ(); }
function feedback(good,msg){ const fb=_$("fb"); if(!fb)return; fb.className="feedback show "+(good?"good":"bad"); fb.innerHTML=good?`${miniCheck()} Correct`:`${miniX()} ${R.esc(msg||"Pas tout à fait")}`; }
function burst(ok){ const card=document.querySelector(".ex-card"); if(!card)return; card.classList.add(ok?"flash-ok":"flash-no"); const b=document.createElement("div"); b.className="burst "+(ok?"ok":"no"); b.innerHTML=ok?miniCheck(true):miniX(true); card.appendChild(b); setTimeout(()=>b.remove(),720); }
function confetti(){ const c=document.createElement("div"); c.className="confetti"; document.body.appendChild(c); const cols=["#80b7ff","#b89bff","#7ef0b0","#b9d6ff"]; for(let i=0;i<70;i++){const p=document.createElement("i"); p.style.left=Math.random()*100+"%"; p.style.background=cols[i%cols.length]; p.style.animationDuration=(1.6+Math.random()*1.6)+"s"; p.style.animationDelay=(Math.random()*.4)+"s"; c.appendChild(p);} setTimeout(()=>c.remove(),3500); }
function quitToSong(id){ openSong(id); }

/* petites icônes SVG (pas d'emoji) */
function xIcon(){ return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'; }
function deezerIcon(){ return '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4h3v4h-3zM19 9h3v4h-3zM14 9h3v4h-3zM14 14h3v4h-3zM9 14h3v4H9zM4 14h3v4H4z"/></svg>'; }
function miniCheck(big){ const sz=big?0:18; return `<svg ${big?'':`width="${sz}" height="${sz}"`} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${big?2.6:3}" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>`; }
function miniX(big){ return `<svg ${big?'':'width="18" height="18"'} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${big?2.6:3}" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`; }
function checkBig(){ return '<svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>'; }
function repeatBig(){ return '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M1 4v6h6M3.5 9a9 9 0 1 1 .5 6"/></svg>'; }
