/* ============================================================
   refrão — exercises.js
   Moteur d'exercices. Utilise l'état global S (défini dans learn.js).
   ============================================================ */
function _$(id){ return document.getElementById(id); }
function langLabelOf(){ return R.langLabel(S.sess.song.lang||"pt"); }

function startLevel(songId, key){
  const s=S.songs.find(x=>x.id===songId);
  const lv=R.buildLevels(s).find(l=>l.key===key);
  S.sess={songId, key, type:lv.type, name:lv.name, qs:makeQuestions(s,lv.type), idx:0, correct:0, song:s, hintN:0, sel:null, locked:false};
  showView("exercise"); renderQuestion();
}

function makeQuestions(s,type){
  const P=s.pairs||[], L=R.lines(s);
  const pick=(arr,n)=>R.shuffle(arr).slice(0,n);
  switch(type){
    case "flash": return P.map(p=>({kind:"flash",pt:p.pt,fr:p.fr}));
    case "mcq": return pick(P,Math.min(8,P.length)).map(p=>{
      const d=Math.random()>.5, correct=d?p.fr:p.pt;
      const pool=P.filter(x=>x!==p).map(x=>d?x.fr:x.pt);
      return {kind:"mcq", q:d?p.pt:p.fr, from:d?"pt":"fr", correct, opts:R.shuffle([correct,...pick(pool,3)])};
    });
    case "match": return [{kind:"match", pairs:pick(P,Math.min(5,P.length))}];
    case "write": return pick(P,Math.min(8,P.length)).map(p=>{
      const d=Math.random()>.5; return {kind:"write", prompt:d?p.pt:p.fr, answer:d?p.fr:p.pt, dir:d?"pt→fr":"fr→pt"};
    });
    case "build": return pick(L.filter(l=>l.pt.split(/\s+/).length>=2),Math.min(6,L.length)).map(l=>({kind:"build", fr:l.fr, pt:l.pt, words:R.shuffle(l.pt.split(/\s+/))}));
    case "cloze": return pick(L.filter(l=>l.pt.split(/\s+/).length>=2),Math.min(6,L.length)).map(l=>{
      const ws=l.pt.split(/\s+/), bi=Math.floor(Math.random()*ws.length), answer=ws[bi];
      const pool=(s.pairs||[]).map(p=>p.pt.split(/\s+/)[0]).filter(w=>R.norm(w)!==R.norm(answer));
      return {kind:"cloze", fr:l.fr, before:ws.slice(0,bi).join(" "), after:ws.slice(bi+1).join(" "), answer, opts:R.shuffle([answer,...pick([...new Set(pool)],3)])};
    });
    case "master": return pick(L,Math.min(6,L.length)).map(l=>({kind:"master", fr:l.fr, answer:l.pt}));
  }
}

function renderQuestion(){
  const w=_$("exWrap"), ss=S.sess;
  if(ss.idx>=ss.qs.length) return renderFinish();
  const q=ss.qs[ss.idx]; ss.hintN=0; ss.sel=null; ss.locked=false;
  const pct=Math.round(ss.idx/ss.qs.length*100);
  const top=`<div class="ex-top">
    <button class="close" onclick="quitLevel()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
    <div class="bar"><i style="width:${pct}%"></i></div>
  </div>`;
  let body="";
  if(q.kind==="flash") body=viewFlash(q);
  if(q.kind==="mcq")   body=viewChoice(q, q.from==="pt"?langLabelOf()+" → Français":"Français → "+langLabelOf(), "Quelle est la traduction ?", q.q);
  if(q.kind==="cloze") body=viewCloze(q);
  if(q.kind==="match") body=viewMatch(q);
  if(q.kind==="write") body=viewWrite(q.dir==="pt→fr"?langLabelOf()+" → Français":"Français → "+langLabelOf(), "Écris la traduction", q.prompt, q.answer);
  if(q.kind==="master")body=viewWrite("Français → "+langLabelOf(), "Écris le vers", q.fr, q.answer);
  if(q.kind==="build") body=viewBuild(q);
  w.innerHTML=top+body;
  requestAnimationFrame(()=>{const b=w.querySelector(".bar i"); if(b)b.style.width=pct+"%";});
  wireQuestion(q);
}

/* ---- vues ---- */
function foot(withHint){
  return `<div class="ex-foot">
    <div class="feedback" id="fb"></div>
    <div class="foot-actions">
      ${withHint?`<button class="btn btn-ghost btn-sm" id="hintBtn">Indice</button>`:""}
      <button class="btn btn-primary" id="checkBtn" disabled>Valider</button>
    </div>
  </div>`;
}
function viewFlash(q){
  return `<div class="ex-card">
    <div class="ex-tag">Vocabulaire · découverte</div><div class="ex-q">Mémorise</div>
    <div style="text-align:center;margin:30px 0">
      <div class="ex-target" style="display:block">${R.esc(q.pt)}</div>
      <div style="color:var(--text-mute);margin:10px 0">↓</div>
      <div style="font-size:1.4rem;font-weight:600;color:var(--green)">${R.esc(q.fr)}</div>
    </div>
    <div class="ex-foot"><span></span><div class="foot-actions"><button class="btn btn-primary" id="nextBtn">Suivant</button></div></div>
  </div>`;
}
function viewChoice(q, tag, title, target){
  return `<div class="ex-card">
    <div class="ex-tag">${tag}</div><div class="ex-q">${title}</div>
    <div class="ex-target">${R.esc(target)}</div>
    <div class="choices">${q.opts.map(o=>`<button class="choice" data-o="${R.esc(o)}">${R.esc(o)}</button>`).join("")}</div>
    ${foot(false)}
  </div>`;
}
function viewCloze(q){
  return `<div class="ex-card">
    <div class="ex-tag">Texte à trous</div><div class="ex-q">Complète le vers</div>
    <div class="ex-prompt" style="color:var(--blue-soft)">${R.esc(q.fr)}</div>
    <div class="cloze">${R.esc(q.before)} <span class="blank" id="blank">?</span> ${R.esc(q.after)}</div>
    <div class="choices" style="margin-top:22px">${q.opts.map(o=>`<button class="choice" data-o="${R.esc(o)}">${R.esc(o)}</button>`).join("")}</div>
    ${foot(false)}
  </div>`;
}
function viewWrite(tag, title, prompt, answer){
  return `<div class="ex-card">
    <div class="ex-tag">${tag}</div><div class="ex-q">${title}</div>
    <div class="ex-target">${R.esc(prompt)}</div>
    <input class="ex-input" id="wIn" placeholder="ta réponse..." autocomplete="off" autocapitalize="off">
    <div class="hint-line" id="hintLine"></div>
    ${foot(true)}
  </div>`;
}
function viewMatch(q){
  const l=q.pairs.map(p=>`<button class="match-item" data-side="l" data-id="${R.esc(p.pt)}">${R.esc(p.pt)}</button>`).join("");
  const r=R.shuffle(q.pairs).map(p=>`<button class="match-item" data-side="r" data-id="${R.esc(p.pt)}">${R.esc(p.fr)}</button>`).join("");
  return `<div class="ex-card">
    <div class="ex-tag">Association</div><div class="ex-q">Relie chaque mot</div>
    <div class="match"><div class="match-col">${l}</div><div class="match-col">${r}</div></div>
    <div class="ex-foot"><div class="feedback" id="fb"></div><span></span></div>
  </div>`;
}
function viewBuild(q){
  return `<div class="ex-card">
    <div class="ex-tag">Reconstruis la phrase</div><div class="ex-q">Traduis en ${langLabelOf().toLowerCase()}</div>
    <div class="ex-prompt" style="font-size:1.1rem;color:var(--blue-soft)">${R.esc(q.fr)}</div>
    <div class="builder"><div class="build-zone" id="zone"></div>
      <div class="bank" id="bank">${q.words.map((w,i)=>`<button class="tile" data-i="${i}">${R.esc(w)}</button>`).join("")}</div>
    </div>
    ${foot(false)}
  </div>`;
}

/* ---- interactions ---- */
function wireQuestion(q){
  const w=_$("exWrap");
  if(q.kind==="flash"){ _$("nextBtn").onclick=()=>advance(true); return; }

  const check=_$("checkBtn");

  if(q.kind==="mcq"||q.kind==="cloze"){
    const correct=q.correct||q.answer;
    w.querySelectorAll(".choice").forEach(btn=>{
      btn.onclick=()=>{
        if(S.sess.locked) return;
        w.querySelectorAll(".choice").forEach(b=>b.classList.remove("sel"));
        btn.classList.add("sel"); S.sess.sel=btn.dataset.o; check.disabled=false;
        if(q.kind==="cloze") _$("blank").textContent=btn.dataset.o;
      };
    });
    check.onclick=()=>{
      if(S.sess.locked||S.sess.sel==null) return;
      const good=R.match(S.sess.sel, correct);
      w.querySelectorAll(".choice").forEach(b=>{
        if(R.match(b.dataset.o,correct)) b.classList.add("good");
        else if(b.classList.contains("sel")) b.classList.add("bad");
        else b.classList.add("dim");
      });
      settle(good);
    };
    return;
  }

  if(q.kind==="write"||q.kind==="master"){
    const inp=_$("wIn"), hintBtn=_$("hintBtn"), ans=q.answer;
    inp.oninput=()=>{ check.disabled = inp.value.trim()===""; };
    hintBtn.onclick=()=>{
      if(S.sess.hintN<ans.length){ S.sess.hintN++; renderHint(ans); }
      if(S.sess.hintN>=ans.length) hintBtn.disabled=true;
    };
    const submit=()=>{
      if(S.sess.locked||inp.value.trim()==="") return;
      const good=R.match(inp.value, ans);
      inp.classList.add(good?"good":"bad");
      settle(good, good?null:"Réponse : "+ans);
    };
    check.onclick=submit;
    inp.onkeydown=e=>{ if(e.key==="Enter" && !check.disabled) submit(); };
    inp.focus();
    return;
  }

  if(q.kind==="build"){
    const zone=_$("zone"), bank=_$("bank");
    const refresh=()=>{ check.disabled = zone.querySelectorAll(".tile").length===0; };
    bank.querySelectorAll(".tile").forEach(t=>{
      t.onclick=()=>{ if(t.classList.contains("used")||S.sess.locked)return; t.classList.add("used");
        const c=t.cloneNode(true); c.classList.remove("used");
        c.onclick=()=>{ if(S.sess.locked)return; c.remove(); t.classList.remove("used"); refresh(); };
        zone.appendChild(c); refresh();
      };
    });
    check.onclick=()=>{
      if(S.sess.locked||zone.querySelectorAll(".tile").length===0) return;
      const built=[...zone.querySelectorAll(".tile")].map(x=>x.textContent).join(" ");
      const good=R.match(built, q.pt);
      zone.style.borderColor=good?"var(--green)":"var(--red)";
      settle(good, good?null:"Réponse : "+q.pt);
    };
    return;
  }

  if(q.kind==="match"){
    let sel=null, ok=0;
    w.querySelectorAll(".match-item").forEach(it=>{
      it.onclick=()=>{
        if(it.classList.contains("ok")) return;
        if(!sel){ if(it.dataset.side!=="l")return; sel=it; it.classList.add("sel"); return; }
        if(it.dataset.side!=="r"){ sel.classList.remove("sel"); sel=it; it.classList.add("sel"); return; }
        if(sel.dataset.id===it.dataset.id){
          sel.classList.remove("sel"); sel.classList.add("ok"); it.classList.add("ok"); ok++;
          if(ok===q.pairs.length){ feedback(true); burst(true); setTimeout(()=>advance(true),800); }
        }else{
          const s2=sel; it.classList.add("err"); s2.classList.add("err");
          setTimeout(()=>{it.classList.remove("err");s2.classList.remove("err","sel");},450);
        }
        sel=null;
      };
    });
    return;
  }
}

function renderHint(ans){
  const line=_$("hintLine"); if(!line) return;
  let html="";
  for(let i=0;i<ans.length;i++){
    const c=ans[i];
    html += c===" " ? `<span class="sp"></span>` : `<span class="hc">${i<S.sess.hintN?R.esc(c):"·"}</span>`;
  }
  line.innerHTML=html;
}

function settle(correct, revealMsg){
  if(S.sess.locked) return; S.sess.locked=true;
  feedback(correct, revealMsg); burst(correct);
  setTimeout(()=>advance(correct), correct?850:1600);
}
function feedback(good,msg){
  const fb=_$("fb"); if(!fb) return;
  fb.className="feedback show "+(good?"good":"bad");
  fb.innerHTML = good
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg> Correct`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg> ${R.esc(msg||"Pas tout à fait")}`;
}
function burst(ok){
  const card=document.querySelector(".ex-card"); if(!card) return;
  card.classList.add(ok?"flash-ok":"flash-no");
  const b=document.createElement("div"); b.className="burst "+(ok?"ok":"no");
  b.innerHTML = ok
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  card.appendChild(b); setTimeout(()=>{b.remove();},720);
}
function advance(correct){ if(correct)S.sess.correct++; S.sess.idx++; renderQuestion(); }
function quitLevel(){ openLevels(S.sess.songId); }

async function renderFinish(){
  const ss=S.sess, total=ss.qs.length, acc=total?Math.round(ss.correct/total*100):100, passed=acc>=60;
  const xpGain=ss.correct*10+(passed?20:0);
  if(passed){
    S.prog.songs[ss.songId]=S.prog.songs[ss.songId]||{done:[]};
    if(!S.prog.songs[ss.songId].done.includes(ss.key)) S.prog.songs[ss.songId].done.push(ss.key);
  }
  S.prog.xp=(S.prog.xp||0)+xpGain;
  await S.store.saveProgress(R.PROGRESS_ID, S.prog);
  if(passed) confetti();
  _$("exWrap").innerHTML=`
    <div class="finish">
      <div class="badge">${passed
        ? `<svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>`
        : `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M1 4v6h6M3.5 9a9 9 0 1 1 .5 6"/></svg>`}</div>
      <h2>${passed?"Niveau réussi":"Presque !"}</h2>
      <p>${passed?"Tu débloques le niveau suivant.":"Réessaie pour atteindre 60% et débloquer la suite."}</p>
      <div class="reward"><div class="r xp"><div class="n">+${xpGain}</div><div class="l">XP</div></div><div class="r ac"><div class="n">${acc}%</div><div class="l">précision</div></div></div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button class="btn btn-ghost" onclick="startLevel('${ss.songId}','${ss.key}')">Recommencer</button>
        <button class="btn btn-primary" onclick="openLevels('${ss.songId}')">Continuer</button>
      </div>
    </div>`;
}
function confetti(){
  const c=document.createElement("div"); c.className="confetti"; document.body.appendChild(c);
  const cols=["#80b7ff","#b89bff","#7ef0b0","#b9d6ff"];
  for(let i=0;i<70;i++){ const p=document.createElement("i"); p.style.left=Math.random()*100+"%"; p.style.background=cols[i%cols.length]; p.style.animationDuration=(1.6+Math.random()*1.6)+"s"; p.style.animationDelay=(Math.random()*.4)+"s"; c.appendChild(p); }
  setTimeout(()=>c.remove(),3500);
}
