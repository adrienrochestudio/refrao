/* ============================================================
   refrão — learn.js
   Pilotage : langue, choix de chanson, parcours d'une chanson (§8),
   révision quotidienne. Moteur : exercises.js + srs.js
   ============================================================ */
var S = { songs:[], prog:{xp:0,songs:{},recent:[]}, store:null, curlang:"pt", profile:null, band:1, sess:null };
const LANG_COLORS={en:"#80b7ff", pt:"#7ef0b0", es:"#b89bff", de:"#ff9d7a"};

R.mountAuthButton();
R.guard("any", init);

async function init(profile){
  S.profile=profile;
  R.mountChrome("learn");
  S.store=await R.getStore();
  S.songs=await S.store.getSongs();
  S.prog=await S.store.getProgress(R.PROGRESS_ID);
  if(!S.prog.recent) S.prog.recent=[];
  await SRS.load();
  S.curlang=(profile && profile.lang) || "pt";
  S.band=(profile && profile.band) || 1;
  S.cohort=null;
  if(profile && profile.cohortId){ try{ S.cohort=await S.store.getCohort(profile.cohortId); }catch(e){} }
  renderLangPick();
  renderChooser();
  const sid=new URLSearchParams(location.search).get("song");
  if(sid && S.songs.find(s=>s.id===sid)) openSong(sid);
}

function showView(id){
  document.querySelectorAll("main .view").forEach(v=>v.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  window.scrollTo({top:0,behavior:"smooth"});
}
function showChooser(){ renderChooser(); showView("chooser"); }
function songsForLang(){
  const cat = (S.profile && S.profile.role==="learner" && S.cohort && S.cohort.category) ? S.cohort.category : null;
  return S.songs.filter(s=>(s.lang||"pt")===S.curlang && R.songComplete(s) && (!cat || s.genre===cat));
}
function songBand(s){ return s.band || R.bandOf(s.cefr||"A2"); }

function renderLangPick(){
  const wrap=document.getElementById("langPick");
  if(S.profile && S.profile.role==="learner"){ wrap.innerHTML=""; wrap.style.display="none"; return; }
  wrap.style.display="";
  wrap.innerHTML=R.LANGS.map(l=>`<button class="lang-chip${l.code===S.curlang?' on':''}" data-lang="${l.code}" style="--c:${LANG_COLORS[l.code]||'#80b7ff'}">${l.label}</button>`).join("");
  wrap.querySelectorAll(".lang-chip").forEach(b=>{ b.onclick=async()=>{ S.curlang=b.dataset.lang; await R.setLang(S.curlang); renderLangPick(); renderChooser(); }; });
}

function renderChooser(){
  const list=document.getElementById("learnList");
  const due=SRS.due().length, st=SRS.stats();
  const review=`
    <div class="review-card">
      <div class="rc-left">
        <div class="rc-tag"><span class="live-dot"></span>Révision du jour</div>
        <div class="rc-sub">${due? due+" carte"+(due>1?"s":"")+" à revoir — on commence par tes points faibles." : "Rien d'urgent. Reviens après une nouvelle leçon."}</div>
        <div class="rc-stats"><span><b>${st.mastered}</b> maîtrisées</span><span><b>${st.learning}</b> en cours</span>${S.profile&&S.profile.streak?`<span><b>${S.profile.streak.count||0}</b> j. de suite</span>`:""}</div>
      </div>
      <button class="btn ${due?'btn-primary':'btn-ghost'}" ${due?"":"disabled"} onclick="startReview()">Réviser</button>
    </div>`;

  const songs=songsForLang().slice().sort((a,b)=> Math.abs(songBand(a)-S.band)-Math.abs(songBand(b)-S.band) || a.title.localeCompare(b.title));
  let grid;
  if(!songs.length){ grid=`<div class="empty"><b>Aucune chanson en ${R.langLabel(S.curlang)}</b>Choisis une autre langue, ou demande à un gestionnaire d'en ajouter.</div>`; }
  else grid=`<div class="song-grid stagger">`+songs.map(s=>{
    const b=songBand(s), above=b>S.band;
    const ps=S.prog.songs[s.id]||{};
    const pct = R.refrain(s)? SRS.sectionPct(s, R.refrain(s)) : 0;
    return `<div class="song-card" onclick="openSong('${s.id}')">
      <div class="cefr-badge b${b}">${R.esc(s.cefr||["","A2","B1","C1"][b])}</div>
      <div class="ttl">${R.esc(s.title)}</div>
      <div class="art">${R.esc(s.artist||"—")}</div>
      ${above?`<div class="above">un cran au-dessus · i+1</div>`:""}
      ${ps.completed?`<div class="done-tag">${ps.full?"Maîtrise complète":"Complétée"}</div>`:""}
      <div class="prog"><div class="bar"><i style="width:${pct}%"></i></div></div>
    </div>`;
  }).join("")+`</div>`;

  list.className="";
  list.innerHTML=review+grid;
}

/* ---------- parcours d'une chanson (§8) ---------- */
function openSong(id){
  const s=S.songs.find(x=>x.id===id); if(!s){ showChooser(); return; }
  const secs=R.sections(s);
  if(!secs.length){
    document.getElementById("songView").innerHTML=`<div class="song-head"><div class="row"><div><h2>${R.esc(s.title)}</h2><div class="art">${R.esc(s.artist||"")}</div></div></div></div><div class="empty"><b>Cette chanson n'a pas encore de paroles</b>Ajoute des paroles et une structure depuis l’espace gestion.</div>`;
    showView("song"); return;
  }
  const ref=R.refrain(s); const refIdx=secs.indexOf(ref);
  const verses=secs.map((sec,i)=>({sec,i})).filter(x=>x.sec.type==="couplet");
  const ps=S.prog.songs[id]||{};
  const refMastered = ref && SRS.sectionMastered(s, ref);
  const band=S.band;

  // déverrouillage des couplets (§4.5)
  const verseUnlocked=(k)=>{
    if(!refMastered) return false;
    if(band>=2) return true;                                  // bandes 2-3 : tous après le refrain
    for(let j=0;j<k;j++){ if(!SRS.sectionMastered(s, verses[j].sec)) return false; }  // bande 1 : un à la fois
    return true;
  };

  // complétion (§6)
  const versesNeeded = band===1 ? verses.slice(0,1) : verses;
  const versesDone = versesNeeded.every(v=>SRS.sectionMastered(s, v.sec));
  const completed = refMastered && versesDone;
  const full = completed && (ps.shadow===true);
  if(completed!==ps.completed || full!==ps.full){ ps.completed=completed; ps.full=full; S.prog.songs[id]=ps; S.store.saveProgress(R.PROGRESS_ID,S.prog); }

  const step=(state, tag, name, desc, action)=>`
    <div class="pstep ${state}" ${state!=="locked"&&action?`onclick="${action}"`:""}>
      <div class="pbubble">${state==="done"?miniCheck():state==="locked"?lockIcon():playIcon()}</div>
      <div class="pinfo"><div class="ptag">${tag}</div><div class="pname">${name}</div><div class="pdesc">${desc}</div></div>
    </div>`;

  let steps="";
  // 1. Découverte
  steps+=step(ps.discovered?"done":"current","Étape 1","Découverte", band===1?"Écoute, paroles + traduction":band===2?"Écoute, traduction à la demande":"Écoute, sens mot à mot", `startDiscovery('${id}')`);
  // 2. Refrain
  const refState = !ps.discovered?"locked":(refMastered?"done":"current");
  steps+=step(refState,"Étape 2","Refrain — entraînement", refMastered?"Maîtrisé":`Cloze adaptatif · ${SRS.sectionPct(s,ref)}% de maîtrise`, ps.discovered?`startTraining('${id}',${refIdx})`:null);
  // 3. Shadowing (auto-déclaratif)
  const shState = !refMastered?"locked":(ps.shadow?"done":"current");
  steps+=step(shState,"Étape 3", "Refrain — shadowing", band===3?"Requis pour la maîtrise complète":"Répète le refrain à voix haute (facultatif)", refMastered?`declareShadow('${id}')`:null);
  // 4. Couplets
  verses.forEach((v,k)=>{
    const unlocked=verseUnlocked(k), m=SRS.sectionMastered(s,v.sec);
    const stt = !unlocked?"locked":(m?"done":"current");
    steps+=step(stt,"Couplet "+(k+1), "Couplet "+(k+1)+" — entraînement", m?"Maîtrisé":unlocked?`Cloze · ${SRS.sectionPct(s,v.sec)}%`:"Maîtrise le refrain d'abord", unlocked?`startTraining('${id}',${v.i})`:null);
  });

  const banner = completed?`<div class="complete-banner ${full?'full':''}">${full?checkBig():miniCheck()} <div><b>${full?"Maîtrise complète":"Chanson complétée"}</b><span>${full?"Refrain + couplets maîtrisés, shadowing fait.":band===3?"Fais le shadowing pour la maîtrise complète.":"Tu peux viser la maîtrise complète avec le shadowing."}</span></div></div>`:"";

  document.getElementById("songView").innerHTML=`
    <div class="song-head">
      <div class="row">
        <div><h2>${R.esc(s.title)}</h2><div class="art">${R.esc(s.artist||"")} · ${R.langLabel(s.lang||"pt")}</div></div>
        <div class="cefr-badge b${songBand(s)} big">${R.esc(s.cefr||"A2")}</div>
      </div>
    </div>
    ${banner}
    <div class="parcours">${steps}</div>`;
  showView("song");
}

async function declareShadow(id){
  S.prog.songs[id]=S.prog.songs[id]||{};
  S.prog.songs[id].shadow=true;
  await S.store.saveProgress(R.PROGRESS_ID, S.prog);
  R.toast("Shadowing noté — bravo");
  openSong(id);
}

function lockIcon(){ return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'; }
function playIcon(){ return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; }
