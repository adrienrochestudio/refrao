/* ============================================================
   refrão — learn.js
   Pilotage de la page Apprendre : langue, choix de chanson,
   aperçu des paroles, carte des niveaux. (Moteur : exercises.js)
   ============================================================ */
var S = { songs:[], prog:{xp:0,songs:{}}, store:null, curlang:"pt", profile:null, sess:null };
const LANG_COLORS={en:"#80b7ff", pt:"#7ef0b0", es:"#b89bff", de:"#ff9d7a"};

R.mountAuthButton();
R.guard("any", init);

async function init(profile){
  S.profile=profile;
  R.mountChrome("learn");
  S.store=await R.getStore();
  S.songs=await S.store.getSongs();
  S.prog=await S.store.getProgress(R.PROGRESS_ID);
  S.curlang=(profile && profile.lang) || "pt";
  renderLangPick();
  renderChooser();
  const sid=new URLSearchParams(location.search).get("song");
  if(sid && S.songs.find(s=>s.id===sid)) openLevels(sid);
}

function showView(id){
  document.querySelectorAll("main .view").forEach(v=>v.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  window.scrollTo({top:0,behavior:"smooth"});
}
function showChooser(){ renderChooser(); showView("chooser"); }
function songsForLang(){ return S.songs.filter(s=>(s.lang||"pt")===S.curlang); }

function renderLangPick(){
  const wrap=document.getElementById("langPick");
  wrap.innerHTML=R.LANGS.map(l=>`<button class="lang-chip${l.code===S.curlang?' on':''}" data-lang="${l.code}" style="--c:${LANG_COLORS[l.code]||'#80b7ff'}">${l.label}</button>`).join("");
  wrap.querySelectorAll(".lang-chip").forEach(b=>{
    b.onclick=async()=>{ S.curlang=b.dataset.lang; await R.setLang(S.curlang); renderLangPick(); renderChooser(); };
  });
}

function renderChooser(){
  const list=document.getElementById("learnList");
  const songs=songsForLang();
  if(!songs.length){ list.className=""; list.innerHTML=`<div class="empty"><b>Aucune chanson en ${R.langLabel(S.curlang)}</b>Choisis une autre langue, ou demande à un gestionnaire d'en ajouter.</div>`; return; }
  list.className="song-grid stagger";
  list.innerHTML=songs.map(s=>`
    <div class="song-card" onclick="openLevels('${s.id}')">
      <div class="ttl">${R.esc(s.title)}</div>
      <div class="art">${R.esc(s.artist||"—")}</div>
      <div class="meta"><span><span class="v">${R.buildLevels(s).length}</span> niveaux</span><span><span class="v">${R.songProgressPct(s,S.prog)}%</span> fait</span></div>
      <div class="prog"><div class="bar"><i style="width:${R.songProgressPct(s,S.prog)}%"></i></div></div>
    </div>`).join("");
}

function openLevels(id){
  const s=S.songs.find(x=>x.id===id); if(!s) return;
  const lv=R.buildLevels(s);
  const done=(S.prog.songs[id]?.done)||[];
  let firstLocked=true;
  const nodes=lv.map((l,i)=>{
    const isDone=done.includes(l.key);
    let state="locked"; if(isDone) state="done"; else if(firstLocked){ state="current"; firstLocked=false; }
    const clk=state!=="locked";
    return `${i>0?`<div class="connector ${done.includes(lv[i-1].key)?'done':''}"></div>`:""}
      <div class="node ${state}" ${clk?`onclick="startLevel('${id}','${l.key}')"`:""}>
        <div class="bubble">${i+1}
          ${state==="locked"?`<span class="lock"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>`:""}
          ${state==="done"?`<span class="chk"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg></span>`:""}
        </div>
        <div class="info"><div class="nm">${l.name}</div><div class="ds">${l.desc}</div></div>
      </div>`;
  }).join("");

  const ln=R.lines(s);
  const overview = ln.length ? `
    <div class="overview">
      <button class="ov-head" id="ovToggle">
        <span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg> Aperçu des paroles</span>
        <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="ov-body" id="ovBody">
        ${ln.map(l=>`<div class="ov-line"><div class="o">${R.esc(l.pt)}</div><div class="t">${R.esc(l.fr)}</div></div>`).join("")}
      </div>
    </div>` : "";

  document.getElementById("levelMap").innerHTML=`
    <div class="learn-head">
      <div class="row">
        <div><h2>${R.esc(s.title)}</h2><div class="art">${R.esc(s.artist||"")} · ${R.langLabel(s.lang||"pt")}</div></div>
        ${s.deezer?`<a class="deezer" href="${R.esc(s.deezer)}" target="_blank" rel="noopener"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4h3v4h-3zM19 9h3v4h-3zM14 9h3v4h-3zM14 14h3v4h-3zM9 14h3v4H9zM4 14h3v4H4z"/></svg> Écouter sur Deezer</a>`:""}
      </div>
      <div class="pct"><span>Progression</span><span>${R.songProgressPct(s,S.prog)}%</span></div>
      <div class="bar green" style="margin-top:8px"><i style="width:${R.songProgressPct(s,S.prog)}%"></i></div>
    </div>
    ${overview}
    <div class="path">${nodes||'<div class="empty"><b>Pas assez de contenu</b>Ajoute des mots et des paroles depuis l’espace gestion.</div>'}</div>`;

  const ov=document.getElementById("ovBody"), tog=document.getElementById("ovToggle");
  if(tog) tog.onclick=()=>{ ov.classList.toggle("collapsed"); tog.classList.toggle("collapsed"); };

  showView("levels");
  requestAnimationFrame(()=>document.querySelectorAll("#levelMap .bar i").forEach(b=>b.style.width=b.style.width));
}
