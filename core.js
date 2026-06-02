/* ============================================================
   refrão — core.js  (fichier partagé)
   >>> CONFIG FIREBASE ICI <<<  + auth, rôles, cohortes, langues
   ============================================================ */
const R = {};

R.FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAM6s43G5e55LduqW9KYcEXgJDsh6pGUQs",
  authDomain:        "refrao-b6ae3.firebaseapp.com",
  projectId:         "refrao-b6ae3",
  storageBucket:     "refrao-b6ae3.firebasestorage.app",
  messagingSenderId: "39410882551",
  appId:             "1:39410882551:web:a5bea039d593d230b8c0f2"
};
R.USE_FIREBASE = !R.FIREBASE_CONFIG.apiKey.includes("COLLE");
R.AUTH_ENABLED = R.USE_FIREBASE;

/* ---- langues disponibles ---- */
R.LANGS = [
  {code:"en", label:"Anglais"},
  {code:"pt", label:"Portugais"},
  {code:"es", label:"Espagnol"},
  {code:"de", label:"Allemand"}
];
R.langLabel = c => (R.LANGS.find(l=>l.code===c)||{label:c}).label;

/* ---- utilitaires ---- */
R.esc = s => (s==null?"":String(s)).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
R.uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
R.norm = s => s.toLowerCase().trim().replace(/[.,;:!?¿¡"'«»…]/g,"").replace(/\s+/g," ");
R.shuffle = a => a.map(v=>[Math.random(),v]).sort((x,y)=>x[0]-y[0]).map(v=>v[1]);
R.slug = s => (s||"").toLowerCase().trim().replace(/[^a-z0-9-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40);
let toastT;
R.toast = function(msg){
  let t=document.getElementById("toast");
  if(!t){ t=document.createElement("div"); t.id="toast"; t.className="toast"; document.body.appendChild(t); }
  t.textContent=msg; t.classList.add("show");
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("show"),2600);
};

/* ---- donnée démo (1re utilisation locale) ---- */
R.DEMO = [{
  id:"demo", title:"Exemple — à remplacer", artist:"Démo", lang:"pt",
  deezer:"https://www.deezer.com",
  pt:"Eu gosto de música\nA canção é bonita\nNós cantamos juntos",
  fr:"J'aime la musique\nLa chanson est belle\nNous chantons ensemble",
  pairs:[{pt:"música",fr:"musique"},{pt:"canção",fr:"chanson"},{pt:"bonita",fr:"belle"},
         {pt:"cantamos",fr:"chantons"},{pt:"juntos",fr:"ensemble"},{pt:"gosto",fr:"j'aime"}]
}];

/* ============================================================
   STOCKAGE
   ============================================================ */
class LocalStore{
  constructor(){
    if(localStorage.getItem("refrao_songs")===null) localStorage.setItem("refrao_songs", JSON.stringify(R.DEMO));
  }
  async getSongs(){ return JSON.parse(localStorage.getItem("refrao_songs")||"[]"); }
  async saveSong(s){ const a=await this.getSongs(); const i=a.findIndex(x=>x.id===s.id); if(i>=0)a[i]=s; else a.push(s); localStorage.setItem("refrao_songs",JSON.stringify(a)); }
  async deleteSong(id){ localStorage.setItem("refrao_songs",JSON.stringify((await this.getSongs()).filter(s=>s.id!==id))); }
  async getProgress(id){ return JSON.parse(localStorage.getItem("refrao_prog_"+id)||'{"xp":0,"songs":{}}'); }
  async saveProgress(id,p){ localStorage.setItem("refrao_prog_"+id, JSON.stringify(p)); }
  async getUser(uid){ return JSON.parse(localStorage.getItem("refrao_user_"+uid)||"null"); }
  async setUser(uid,d){ const cur=(await this.getUser(uid))||{}; localStorage.setItem("refrao_user_"+uid, JSON.stringify({...cur,...d})); }
  async getCohort(c){ return JSON.parse(localStorage.getItem("refrao_cohort_"+c)||"null"); }
  async setCohort(c,d){ localStorage.setItem("refrao_cohort_"+c, JSON.stringify(d)); }
  async deleteCohort(c){ localStorage.removeItem("refrao_cohort_"+c); }
  async listLearners(){ return []; }
}
class FirebaseStore{
  constructor(db,f){ this.db=db; this.f=f; }
  _c(n){ return this.f.collection(this.db,n); }
  _d(n,id){ return this.f.doc(this.db,n,id); }
  async getSongs(){ const s=await this.f.getDocs(this._c("songs")); return s.docs.map(d=>({id:d.id,...d.data()})); }
  async saveSong(s){ await this.f.setDoc(this._d("songs",s.id), s); }
  async deleteSong(id){ await this.f.deleteDoc(this._d("songs",id)); }
  async getProgress(id){ const d=await this.f.getDoc(this._d("progress",id)); return d.exists()?d.data():{xp:0,songs:{}}; }
  async saveProgress(id,p){ await this.f.setDoc(this._d("progress",id), p); }
  async getUser(uid){ const d=await this.f.getDoc(this._d("users",uid)); return d.exists()?d.data():null; }
  async setUser(uid,data){ await this.f.setDoc(this._d("users",uid), data, {merge:true}); }
  async getCohort(c){ const d=await this.f.getDoc(this._d("cohorts",c)); return d.exists()?d.data():null; }
  async setCohort(c,data){ await this.f.setDoc(this._d("cohorts",c), data); }
  async deleteCohort(c){ await this.f.deleteDoc(this._d("cohorts",c)); }
  async listLearners(code){
    const q=this.f.query(this._c("users"), this.f.where("cohortId","==",code));
    const s=await this.f.getDocs(q); return s.docs.map(d=>({uid:d.id,...d.data()}));
  }
}

/* ---- app Firebase partagée ---- */
let _appP;
function fbApp(){
  if(_appP) return _appP;
  _appP=(async()=>{ const m=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"); return m.initializeApp(R.FIREBASE_CONFIG); })();
  return _appP;
}
let _storeP;
R.getStore = function(){
  if(_storeP) return _storeP;
  _storeP=(async()=>{
    if(R.USE_FIREBASE){
      try{
        const fs=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        const app=await fbApp();
        return new FirebaseStore(fs.getFirestore(app), fs);
      }catch(e){ console.error(e); R.toast("Firebase indisponible — stockage local"); return new LocalStore(); }
    }
    return new LocalStore();
  })();
  return _storeP;
};

/* ============================================================
   AUTHENTIFICATION + PROFIL (rôle, langue, cohorte)
   ============================================================ */
R.PROGRESS_ID = "local";
let _authP, _user=null, _profile=null, _cbs=[];

const LOCAL_PROFILE = {role:"manager", lang:"pt", cohortId:"local", email:"local@refrao"};

function fbAuth(){
  if(_authP) return _authP;
  _authP=(async()=>{
    const m=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    const app=await fbApp();
    const auth=m.getAuth(app);
    m.onAuthStateChanged(auth, async u=>{
      _user=u;
      if(u){
        R.PROGRESS_ID=u.uid;
        const store=await R.getStore();
        _profile=await store.getUser(u.uid);
      }else{ _profile=null; R.PROGRESS_ID="anon"; }
      _cbs.forEach(cb=>{try{cb(_user,_profile);}catch(e){}});
    });
    return {auth,m};
  })();
  return _authP;
}

/* s'abonner aux changements (user, profile) */
R.onAuthProfile = function(cb){
  _cbs.push(cb);
  if(!R.AUTH_ENABLED){ R.PROGRESS_ID="local"; _user={uid:"local"}; _profile=LOCAL_PROFILE; cb(_user,_profile); return; }
  if(_user!==null||_profile!==null) cb(_user,_profile); else cb(null,null);
  fbAuth();
};
R.user = ()=>_user;
R.profile = ()=>_profile;

R.login = async function(email,pw){
  if(!R.AUTH_ENABLED){ R.toast("Connexion réelle nécessite Firebase"); return; }
  const {auth,m}=await fbAuth();
  await m.signInWithEmailAndPassword(auth,email,pw);
};
R.logout = async function(){
  if(!R.AUTH_ENABLED){ return; }
  const {auth,m}=await fbAuth(); await m.signOut(auth);
};

/* inscription : opts = {email, pw, role, lang, cohortCode?} ; pour manager: cohortCode = identifiant choisi */
R.signup = async function(opts){
  if(!R.AUTH_ENABLED) throw new Error("Firebase requis");
  const {auth,m}=await fbAuth();
  const store=await R.getStore();

  if(opts.role==="manager"){
    const code=R.slug(opts.cohortCode);
    if(code.length<3) throw new Error("Identifiant de cohorte trop court (3+ caractères, lettres/chiffres/tirets).");
    const existing=await store.getCohort(code);
    if(existing) throw new Error("Cet identifiant de cohorte est déjà pris.");
    const cred=await m.createUserWithEmailAndPassword(auth, opts.email, opts.pw);
    const uid=cred.user.uid;
    await store.setCohort(code, {code, managerUid:uid, createdAt:Date.now()});
    await store.setUser(uid, {role:"manager", email:opts.email, lang:opts.lang||"pt", cohortId:code, createdAt:Date.now()});
  }else{
    let code="";
    if(opts.cohortCode && opts.cohortCode.trim()){
      code=R.slug(opts.cohortCode);
      const c=await store.getCohort(code);
      if(!c) throw new Error("Ce code de cohorte n'existe pas.");
    }
    const cred=await m.createUserWithEmailAndPassword(auth, opts.email, opts.pw);
    await store.setUser(cred.user.uid, {role:"learner", email:opts.email, lang:opts.lang||"en", cohortId:code, createdAt:Date.now()});
  }
  return {role:opts.role};
};

/* mises à jour de profil */
R.setLang = async function(code){
  if(_profile) _profile.lang=code;
  const store=await R.getStore();
  if(R.AUTH_ENABLED && _user) await store.setUser(_user.uid, {lang:code});
};
/* changer l'identifiant de cohorte (manager) : migre les apprenants */
R.changeCohortCode = async function(oldCode, rawNew){
  const store=await R.getStore();
  const code=R.slug(rawNew);
  if(code.length<3) throw new Error("Identifiant trop court.");
  if(code===oldCode) return code;
  if(await store.getCohort(code)) throw new Error("Cet identifiant est déjà pris.");
  await store.setCohort(code, {code, managerUid:_user.uid, createdAt:Date.now()});
  if(store.listLearners){
    const learners=await store.listLearners(oldCode);
    for(const l of learners){ await store.setUser(l.uid, {cohortId:code}); }
  }
  await store.deleteCohort(oldCode);
  await store.setUser(_user.uid, {cohortId:code});
  if(_profile) _profile.cohortId=code;
  return code;
};

/* ============================================================
   ÉLÉMENTS D'INTERFACE (bouton de compte, gardes de page)
   ============================================================ */
R.mountAuthButton = function(){
  const slot=document.getElementById("authSlot"); if(!slot) return;
  R.onAuthProfile((u,p)=>{
    if(u && p){
      const gestion = p.role==="manager" ? `<a class="btn btn-sm" href="gestion.html">Espace gestion</a>` : "";
      slot.innerHTML = gestion+`<button class="btn btn-sm btn-ghost" id="logoutBtn">Déconnexion</button>`;
      const lo=slot.querySelector("#logoutBtn"); if(lo) lo.onclick=()=>R.logout().then(()=>location.href="index.html");
    }else{
      slot.innerHTML = `<a class="btn btn-sm" href="auth.html">Connexion</a>`;
    }
  });
};

/* page réservée : any = juste connecté ; manager = rôle gestionnaire */
R.guard = function(kind, onAllowed){
  if(!R.AUTH_ENABLED){ onAllowed(LOCAL_PROFILE); return; }
  let started=false;
  R.onAuthProfile((u,p)=>{
    if(!u){ location.href="auth.html"; return; }
    if(kind==="manager" && (!p || p.role!=="manager")){
      document.body.innerHTML='<div style="max-width:520px;margin:18vh auto;text-align:center;font-family:Manrope,sans-serif;color:#eef1f7"><h2 style="font-family:Bricolage Grotesque,sans-serif">Accès réservé</h2><p style="color:#9aa0ad">Cet espace est réservé aux gestionnaires de cohorte.</p><a href="index.html" style="color:#80b7ff">Retour</a></div>';
      return;
    }
    if(!started){ started=true; onAllowed(p); }
  });
};

/* ---- topbar : lien actif (le bouton de compte est géré à part) ---- */
R.mountChrome = function(active){
  const link=document.querySelector(`.nav a[data-page="${active}"]`);
  if(link) link.classList.add("on");
};

/* ============================================================
   MOTEUR DE NIVEAUX
   ============================================================ */
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

window.R = R;
