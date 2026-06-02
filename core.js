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
  apiKey:            "COLLE_TA_CLE_ICI",
  authDomain:        "ton-projet.firebaseapp.com",
  projectId:         "ton-projet",
  storageBucket:     "ton-projet.appspot.com",
  messagingSenderId: "000000000000",
  appId:             "1:000:web:xxxxxxxx"
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

let _storeP;
R.getStore = function(){
  if(_storeP) return _storeP;
  _storeP = (async()=>{
    if(R.USE_FIREBASE){
      try{
        const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
        const fs     = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        const app = appMod.initializeApp(R.FIREBASE_CONFIG);
        return new FirebaseStore(fs.getFirestore(app), fs);
      }catch(e){ console.error(e); R.toast("Firebase indisponible — stockage local"); return new LocalStore(); }
    }
    return new LocalStore();
  })();
  return _storeP;
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
