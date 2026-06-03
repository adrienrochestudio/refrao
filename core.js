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

/* ---- référentiel CEFR / bandes (note §3) ---- */
R.CEFR = ["A1","A2","B1","B2","C1","C2"];
R.BANDS = {1:"Découverte", 2:"Intermédiaire", 3:"Avancé"};
R.bandOf = cefr => { const i=R.CEFR.indexOf(cefr); return i<2?1 : i<4?2 : 3; };          // A1-A2=1, B1-B2=2, C1-C2=3
R.bandName = b => R.BANDS[b] || "Découverte";
R.PLACEMENT = { debutant:"A2", intermediaire:"B1", avance:"C1" };                          // auto-placement §3.2.b

/* ---- utilitaires ---- */
R.esc = s => (s==null?"":String(s)).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
R.uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
R.fold = s => String(s==null?"":s).normalize("NFD").replace(/[\u0300-\u036f]/g,"");
R.norm = s => R.fold(s).toLowerCase().trim().replace(/[.,;:!?¿¡"'«»…]/g,"").replace(/\s+/g," ");
function _lev(a,b){
  const m=a.length,n=b.length; if(!m)return n; if(!n)return m;
  let prev=Array.from({length:n+1},(_,i)=>i), cur=new Array(n+1);
  for(let i=1;i<=m;i++){ cur[0]=i;
    for(let j=1;j<=n;j++){ const c=a[i-1]===b[j-1]?0:1; cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+c); }
    [prev,cur]=[cur,prev];
  }
  return prev[n];
}
/* comparaison tolérante : ignore casse/accents/ponctuation + petites fautes */
R.match = function(input, answer){
  const a=R.norm(input), b=R.norm(answer);
  if(a===b) return true;
  if(!a) return false;
  const tol = b.length<=4 ? 0 : b.length<=8 ? 1 : 2;
  return _lev(a,b) <= tol;
};
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
  async getCards(uid){ return JSON.parse(localStorage.getItem("refrao_cards_"+uid)||'{"cards":{}}'); }
  async saveCards(uid,o){ localStorage.setItem("refrao_cards_"+uid, JSON.stringify(o)); }
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
  async getCards(uid){ const d=await this.f.getDoc(this._d("cards",uid)); return d.exists()?d.data():{cards:{}}; }
  async saveCards(uid,o){ await this.f.setDoc(this._d("cards",uid), o); }
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
let _authP, _user=null, _profile=null, _cbs=[], _authReady=false;

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
      _authReady=true;
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
  if(_authReady) cb(_user,_profile);   // déjà résolu : on appelle tout de suite
  fbAuth();                            // sinon, le callback sera appelé dès la résolution
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
    const cefr=opts.cefr||"A2";
    await store.setUser(cred.user.uid, {role:"learner", email:opts.email, lang:opts.lang||"en", cohortId:code, cefr, band:R.bandOf(cefr), streak:{count:0,last:null,freezes:2}, createdAt:Date.now()});
  }
  return {role:opts.role};
};

/* compléter un compte déjà connecté mais sans profil (ex : ancien compte) */
R.completeProfile = async function(opts){
  if(!_user) throw new Error("Non connecté");
  const store=await R.getStore();
  if(opts.role==="manager"){
    const code=R.slug(opts.cohortCode);
    if(code.length<3) throw new Error("Identifiant de cohorte trop court (3+ caractères).");
    if(await store.getCohort(code)) throw new Error("Cet identifiant de cohorte est déjà pris.");
    await store.setCohort(code, {code, managerUid:_user.uid, createdAt:Date.now()});
    await store.setUser(_user.uid, {role:"manager", email:_user.email, lang:opts.lang||"pt", cohortId:code, createdAt:Date.now()});
  }else{
    let code="";
    if(opts.cohortCode && opts.cohortCode.trim()){ code=R.slug(opts.cohortCode); if(!await store.getCohort(code)) throw new Error("Ce code de cohorte n'existe pas."); }
    const cefr=opts.cefr||"A2";
    await store.setUser(_user.uid, {role:"learner", email:_user.email, lang:opts.lang||"en", cohortId:code, cefr, band:R.bandOf(cefr), streak:{count:0,last:null,freezes:2}, createdAt:Date.now()});
  }
  _profile=await store.getUser(_user.uid);
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
/* niveau d'un apprenant (override gestionnaire §3.2.b) */
R.setLearnerLevel = async function(uid, cefr){
  const store=await R.getStore();
  await store.setUser(uid, {cefr, band:R.bandOf(cefr)});
};

/* ---- structure refrain / couplets (note §2, §4.5) ---- */
R.sections = function(s){
  if(Array.isArray(s.sections) && s.sections.length) return s.sections;
  const ln=R.lines(s);                       // repli : ancienne chanson à plat = un seul refrain
  return ln.length ? [{type:"refrain", lines:ln}] : [];
};
/* détection auto à valider : blocs séparés par lignes vides ; bloc répété = refrain */
R.autoSections = function(ptText, frText){
  const split = t => t.split(/\n\s*\n/).map(b=>b.split("\n").map(x=>x.trim()).filter(Boolean)).filter(b=>b.length);
  let blocks = split(ptText||"");
  if(!blocks.length){ const all=(ptText||"").split("\n").map(x=>x.trim()).filter(Boolean); blocks = all.length?[all]:[]; }
  const frAll = (frText||"").split("\n").map(x=>x.trim()).filter(Boolean);
  const key = b => b.map(R.norm).join(" | ");
  const counts={}; blocks.forEach(b=>{const k=key(b); counts[k]=(counts[k]||0)+1;});
  let refrainKey=null, max=1;
  for(const k in counts){ if(counts[k]>max){ max=counts[k]; refrainKey=k; } }
  let cur=0; const out=[];
  blocks.forEach(b=>{
    const isR = refrainKey && key(b)===refrainKey;
    const lines=b.map(pt=>{ const fr=frAll[cur]||""; cur++; return {pt, fr}; });
    out.push({type:isR?"refrain":"couplet", lines});
  });
  if(!refrainKey && out.length) out[0].type="refrain";   // sinon, 1er bloc = refrain par défaut
  return out;
};
R.refrain = s => R.sections(s).find(x=>x.type==="refrain") || R.sections(s)[0] || null;
R.verses  = s => R.sections(s).filter(x=>x.type==="couplet");

/* ---- espacement par paliers (note §5.3.b) ---- */
R.nextDue = function(streak, now){
  now=now||Date.now(); const H=3600e3, D=864e5;
  if(streak<=0) return now;          // raté : même session
  if(streak===1) return now + 4*H;   // plus tard le même jour
  if(streak===2) return now + 1*D;
  if(streak===3) return now + 3*D;   // maîtrisée
  return now + 7*D;                   // entretien
};

/* ---- streak avec gel (note §7.a) ---- */
R.touchStreak = async function(){
  if(!_profile) return null;
  const ds = new Date().toISOString().slice(0,10);
  const st = _profile.streak || {count:0,last:null,freezes:2};
  if(st.last===ds) return st;
  const y = new Date(Date.now()-864e5).toISOString().slice(0,10);
  if(st.last===y) st.count=(st.count||0)+1;
  else if(st.last){ if((st.freezes||0)>0){ st.freezes--; st.count=(st.count||0)+1; } else st.count=1; }
  else st.count=1;
  st.last=ds; _profile.streak=st;
  const store=await R.getStore();
  if(R.AUTH_ENABLED && _user) await store.setUser(_user.uid, {streak:st});
  return st;
};

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
