/* ============================================================
   refrão — core.js
   Fichier partagé par toutes les pages.
   >>> C'EST ICI, ET SEULEMENT ICI, QUE TU COLLES TA CONFIG FIREBASE <<<
   ============================================================ */
const R = {};

/* ---- 1. CONFIG FIREBASE ----------------------------------------
   Console Firebase -> Paramètres du projet -> Vos applications (Web).
   Tant que apiKey contient "COLLE", l'app utilise le stockage local
   du navigateur. Dès que tu mets ta vraie clé, elle passe sur Firestore.
----------------------------------------------------------------- */
R.FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAM6s43G5e55LduqW9KYcEXgJDsh6pGUQs",
  authDomain:        "refrao-b6ae3.firebaseapp.com",
  projectId:         "refrao-b6ae3",
  storageBucket:     "refrao-b6ae3.firebasestorage.app",
  messagingSenderId: "39410882551",
  appId:             "1:39410882551:web:a5bea039d593d230b8c0f2"
};
R.USE_FIREBASE = !R.FIREBASE_CONFIG.apiKey.includes("COLLE");

/* ---- 2. UTILITAIRES -------------------------------------------- */
R.esc = s => (s==null?"":String(s)).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
R.uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
R.norm = s => s.toLowerCase().trim().replace(/[.,;:!?¿¡"'«»…]/g,"").replace(/\s+/g," ");
R.shuffle = a => a.map(v=>[Math.random(),v]).sort((x,y)=>x[0]-y[0]).map(v=>v[1]);

let toastT;
R.toast = function(msg){
  let t=document.getElementById("toast");
  if(!t){ t=document.createElement("div"); t.id="toast"; t.className="toast"; document.body.appendChild(t); }
  t.textContent=msg; t.classList.add("show");
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("show"),2400);
};

/* ---- 3. DONNÉE DÉMO (1re utilisation seulement) ---------------- */
R.DEMO = [{
  id:"demo",
  title:"Exemple — à remplacer",
  artist:"Démo",
  deezer:"https://www.deezer.com",
  pt:"Eu gosto de música\nA canção é bonita\nNós cantamos juntos",
  fr:"J'aime la musique\nLa chanson est belle\nNous chantons ensemble",
  pairs:[
    {pt:"música", fr:"musique"},{pt:"canção", fr:"chanson"},
    {pt:"bonita", fr:"belle"},{pt:"cantamos", fr:"chantons"},
    {pt:"juntos", fr:"ensemble"},{pt:"gosto", fr:"j'aime"}
  ]
}];

/* ---- 4. STOCKAGE ----------------------------------------------- */
class LocalStore{
  constructor(){
    if(localStorage.getItem("refrao_songs")===null) localStorage.setItem("refrao_songs", JSON.stringify(R.DEMO));
    if(localStorage.getItem("refrao_prog")===null)  localStorage.setItem("refrao_prog", JSON.stringify({xp:0,songs:{}}));
  }
  async getSongs(){ return JSON.parse(localStorage.getItem("refrao_songs")||"[]"); }
  async saveSong(s){ const a=await this.getSongs(); const i=a.findIndex(x=>x.id===s.id); if(i>=0)a[i]=s; else a.push(s); localStorage.setItem("refrao_songs",JSON.stringify(a)); }
  async deleteSong(id){ localStorage.setItem("refrao_songs",JSON.stringify((await this.getSongs()).filter(s=>s.id!==id))); }
  async getProgress(){ return JSON.parse(localStorage.getItem("refrao_prog")||'{"xp":0,"songs":{}}'); }
  async saveProgress(p){ localStorage.setItem("refrao_prog",JSON.stringify(p)); }
}
class FirebaseStore{
  constructor(db,f){ this.db=db; this.f=f; }
  async getSongs(){ const s=await this.f.getDocs(this.f.collection(this.db,"songs")); return s.docs.map(d=>({id:d.id,...d.data()})); }
  async saveSong(s){ await this.f.setDoc(this.f.doc(this.db,"songs",s.id), s); }
  async deleteSong(id){ await this.f.deleteDoc(this.f.doc(this.db,"songs",id)); }
  async getProgress(){ const d=await this.f.getDoc(this.f.doc(this.db,"progress","main")); return d.exists()?d.data():{xp:0,songs:{}}; }
  async saveProgress(p){ await this.f.setDoc(this.f.doc(this.db,"progress","main"), p); }
}

/* ---- app Firebase partagée (store + auth) ---- */
let _appP;
function fbApp(){
  if(_appP) return _appP;
  _appP=(async()=>{
    const m=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    return m.initializeApp(R.FIREBASE_CONFIG);
  })();
  return _appP;
}

let _storeP;
R.getStore = function(){
  if(_storeP) return _storeP;
  _storeP = (async()=>{
    if(R.USE_FIREBASE){
      try{
        const fs  = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        const app = await fbApp();
        return new FirebaseStore(fs.getFirestore(app), fs);
      }catch(e){ console.error(e); R.toast("Firebase indisponible — stockage local"); return new LocalStore(); }
    }
    return new LocalStore();
  })();
  return _storeP;
};

/* ---- AUTHENTIFICATION (Firebase Auth) -------------------------- */
R.AUTH_ENABLED = R.USE_FIREBASE;
let _authP, _user=null, _userCbs=[];
function fbAuth(){
  if(_authP) return _authP;
  _authP=(async()=>{
    const m=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    const app=await fbApp();
    const auth=m.getAuth(app);
    m.onAuthStateChanged(auth, u=>{ _user=u; _userCbs.forEach(cb=>{try{cb(u);}catch(e){}}); });
    return {auth, m};
  })();
  return _authP;
}
R.onAuth = function(cb){ _userCbs.push(cb); cb(_user); if(R.AUTH_ENABLED) fbAuth(); };
R.user   = ()=>_user;
R.login  = async function(email,pw){ const {auth,m}=await fbAuth(); await m.signInWithEmailAndPassword(auth,email,pw); };
R.logout = async function(){ const {auth,m}=await fbAuth(); await m.signOut(auth); };

function injectLoginModal(){
  if(document.getElementById("loginBg")) return;
  const d=document.createElement("div");
  d.innerHTML=`
  <div class="modal-bg" id="loginBg">
    <div class="modal" style="max-width:380px">
      <h3>Connexion</h3>
      <div class="lead">Accès au back office.</div>
      <div class="field"><label>Email</label><input id="loginEmail" type="email" autocomplete="username"></div>
      <div class="field"><label>Mot de passe</label><input id="loginPw" type="password" autocomplete="current-password"></div>
      <div id="loginErr" style="color:var(--red);font-size:.82rem;min-height:18px;margin-bottom:4px"></div>
      <div class="modal-foot">
        <button class="btn btn-ghost" id="loginCancel">Annuler</button>
        <button class="btn btn-primary" id="loginGo">Se connecter</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(d.firstElementChild);
  const close=()=>document.getElementById("loginBg").classList.remove("open");
  document.getElementById("loginCancel").onclick=close;
  const go=async()=>{
    const e=document.getElementById("loginEmail").value.trim();
    const p=document.getElementById("loginPw").value;
    const err=document.getElementById("loginErr"); err.textContent="";
    try{ await R.login(e,p); close(); document.getElementById("loginPw").value=""; }
    catch(ex){ err.textContent="Identifiants incorrects."; }
  };
  document.getElementById("loginGo").onclick=go;
  document.getElementById("loginPw").addEventListener("keydown",ev=>{ if(ev.key==="Enter")go(); });
}
R.openLogin = function(){ injectLoginModal(); document.getElementById("loginBg").classList.add("open"); setTimeout(()=>document.getElementById("loginEmail").focus(),50); };

/* bouton de connexion dans la barre (slot #authSlot) */
R.mountAuthButton = function(isAdmin){
  const slot=document.getElementById("authSlot"); if(!slot) return;
  injectLoginModal();
  const render=(u)=>{
    if(u){
      slot.innerHTML = isAdmin
        ? `<button class="btn btn-sm btn-ghost" id="logoutBtn">Déconnexion</button>`
        : `<a class="btn btn-sm" href="admin.html">Back office</a><button class="btn btn-sm btn-ghost" id="logoutBtn">Déconnexion</button>`;
      const lo=slot.querySelector("#logoutBtn"); if(lo) lo.onclick=()=>R.logout();
    }else{
      if(!R.AUTH_ENABLED && !isAdmin){ slot.innerHTML=`<a class="btn btn-sm" href="admin.html">Back office</a>`; return; }
      slot.innerHTML = isAdmin ? "" : `<button class="btn btn-sm" id="loginBtn">Connexion</button>`;
      const li=slot.querySelector("#loginBtn"); if(li) li.onclick=R.openLogin;
    }
  };
  R.onAuth(render);
};

/* protège la page admin : n'appelle onAllowed() qu'une fois connecté */
R.guardAdmin = function(onAllowed){
  if(!R.AUTH_ENABLED){ onAllowed(); return; }   // mode local : pas de barrière
  injectLoginModal();
  let started=false;
  R.onAuth(u=>{
    const lock=document.getElementById("adminLock"), content=document.getElementById("adminContent");
    if(u){
      if(lock) lock.style.display="none";
      if(content) content.style.display="";
      if(!started){ started=true; onAllowed(); }
    }else{
      if(content) content.style.display="none";
      if(lock) lock.style.display="flex";
    }
  });
};

/* ---- 5. MOTEUR DE NIVEAUX -------------------------------------- */
R.lines = function(s){
  const pt=(s.pt||"").split("\n").map(x=>x.trim()).filter(Boolean);
  const fr=(s.fr||"").split("\n").map(x=>x.trim()).filter(Boolean);
  const n=Math.min(pt.length,fr.length);
  return Array.from({length:n},(_,i)=>({pt:pt[i],fr:fr[i]}));
};
R.buildLevels = function(s){
  const lv=[]; const hasPairs=(s.pairs?.length||0)>=2; const ln=R.lines(s); const hasLines=ln.length>=1;
  if(hasPairs){
    lv.push({key:"flash", name:"Découverte", desc:"Cartes de vocabulaire", type:"flash"});
    lv.push({key:"mcq",   name:"Reconnaître", desc:"Trouve la traduction", type:"mcq"});
    lv.push({key:"match", name:"Associer",   desc:"Relie les paires", type:"match"});
    lv.push({key:"write", name:"Écrire",     desc:"Tape la traduction", type:"write"});
  }
  if(hasLines && (s.pairs?.length||0)>=1){
    if(ln.some(l=>l.pt.split(/\s+/).length>=2)) lv.push({key:"build", name:"Phrases", desc:"Reconstruis le vers", type:"build"});
    if(hasPairs) lv.push({key:"cloze", name:"Texte à trous", desc:"Complète le vers", type:"cloze"});
    lv.push({key:"master", name:"Maîtrise", desc:"Le vers en entier", type:"master"});
  }
  return lv;
};
R.songProgressPct = function(s, prog){
  const lv=R.buildLevels(s); if(!lv.length) return 0;
  const done=(prog.songs[s.id]?.done)||[];
  return Math.round(done.filter(k=>lv.some(l=>l.key===k)).length / lv.length * 100);
};

/* ---- 6. TOPBAR (XP + lien actif) ------------------------------- */
R.mountChrome = async function(active){
  const link=document.querySelector(`.nav a[data-page="${active}"]`);
  if(link) link.classList.add("on");
  try{
    const store=await R.getStore();
    const p=await store.getProgress();
    document.querySelectorAll("[data-xp]").forEach(e=>e.textContent=p.xp||0);
  }catch(e){}
};

window.R = R;
