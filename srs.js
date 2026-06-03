/* ============================================================
   refrão — srs.js  (Couche C : moteur de maîtrise espacée)
   File de cartes par compte, commune à toutes les chansons.
   "3 bonnes réponses consécutives = maîtrisée" (note §5).
   ============================================================ */
const SRS = { cards:{}, _uid:null };

SRS.load = async function(){
  const store=await R.getStore();
  SRS._uid=R.PROGRESS_ID;
  const data=await store.getCards(SRS._uid);
  SRS.cards = (data && data.cards) || {};
  return SRS.cards;
};
let _saveT;
SRS.save = async function(){
  const store=await R.getStore();
  await store.saveCards(SRS._uid||R.PROGRESS_ID, {cards:SRS.cards});
};
SRS.saveSoon = function(){ clearTimeout(_saveT); _saveT=setTimeout(()=>SRS.save(),400); };

SRS._id = (songId,type,text)=> songId+":"+type+":"+R.slug(R.norm(text)).slice(0,46);

SRS.addCard = function(songId, type, text, trad, sectionType){
  const id=SRS._id(songId,type,text);
  if(!SRS.cards[id]) SRS.cards[id]={ id, songId, type, text, trad:trad||"", sectionType:sectionType||"", streak:0, lapses:0, state:"nouvelle", due:Date.now() };
  return SRS.cards[id];
};

/* génère les cartes d'une section : une carte-phrase par vers + cartes-mots à forte valeur */
SRS.generateForSection = function(song, section){
  const made=[];
  section.lines.forEach(l=>{ if(l.pt) made.push(SRS.addCard(song.id,"phrase", l.pt, l.fr, section.type)); });
  const txt=R.norm(section.lines.map(l=>l.pt).join(" "));
  (song.pairs||[]).forEach(p=>{
    const w=(p.pt||"").split(/\s+/)[0];
    if(w && txt.split(" ").includes(R.norm(w))) made.push(SRS.addCard(song.id,"mot", p.pt, p.fr, section.type));
  });
  SRS.saveSoon();
  return made;
};

/* note une réponse : met à jour streak / lapses / état / échéance (paliers §5.3) */
SRS.grade = function(id, correct){
  const c=SRS.cards[id]; if(!c) return null;
  if(correct) c.streak=Math.min((c.streak||0)+1, 4);
  else { c.lapses=(c.lapses||0)+1; c.streak=0; }
  c.state = c.streak>=3 ? "maîtrisée" : (c.streak>=1 ? "en cours" : "nouvelle");
  c.due = R.nextDue(c.streak);
  SRS.saveSoon();
  return c;
};

SRS.list = ()=> Object.values(SRS.cards);

/* file de révision : dues d'abord, fragiles (lapses élevé) avant les neuves (§5.4) */
SRS.due = function(now){
  now=now||Date.now();
  return SRS.list().filter(c=>c.due<=now).sort((a,b)=>
    (b.lapses-a.lapses) ||
    ((a.state==="nouvelle"?1:0)-(b.state==="nouvelle"?1:0)) ||
    (a.due-b.due)
  );
};
SRS.cardsForSection = function(song, section){
  return section.lines.map(l=>SRS.cards[SRS._id(song.id,"phrase",l.pt)]).filter(Boolean);
};
SRS.sectionMastered = function(song, section){
  const cs=SRS.cardsForSection(song, section);
  return cs.length>0 && cs.every(c=>c.state==="maîtrisée");
};
SRS.sectionPct = function(song, section){
  const cs=SRS.cardsForSection(song, section);
  if(!cs.length) return 0;
  return Math.round(cs.reduce((s,c)=>s+Math.min(c.streak,3),0) / (cs.length*3) * 100);
};
SRS.stats = function(){
  const a=SRS.list();
  return { total:a.length, mastered:a.filter(c=>c.state==="maîtrisée").length, learning:a.filter(c=>c.state==="en cours").length, due:SRS.due().length };
};
SRS.recentRate = function(prog){
  const r=(prog && prog.recent)||[];
  if(!r.length) return null;
  return Math.round(r.filter(Boolean).length / r.length * 100);
};
SRS.pushRecent = function(prog, correct){
  prog.recent = ((prog.recent)||[]).concat(correct?1:0).slice(-40);  // fenêtre glissante (§3.2.c, §4.6)
};

window.SRS = SRS;
