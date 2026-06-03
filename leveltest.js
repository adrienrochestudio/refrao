/* ============================================================
   refrão — leveltest.js
   STUB de test de niveau (note §10). À remplacer par un vrai
   test calibré plus tard. Ici : 3 questions bidon -> un CEFR.
   API : LevelTest.run(lang, (cefr)=>{ ... })
   ============================================================ */
const LevelTest = {
  // questions provisoires, non calibrées
  QUESTIONS: [
    { q:"À quelle fréquence lis-tu ou écoutes-tu dans cette langue ?",
      a:[["Jamais",0],["Parfois",1],["Souvent",2]] },
    { q:"Peux-tu suivre une chanson sans traduction ?",
      a:[["Pas du tout",0],["Un peu",1],["Oui, en grande partie",2]] },
    { q:"Tiens-tu une conversation simple ?",
      a:[["Non",0],["Quelques phrases",1],["Oui, sans souci",2]] }
  ],
  scoreToCefr(score){            // 0..6 -> CEFR (provisoire)
    if(score<=1) return "A1";
    if(score<=2) return "A2";
    if(score<=3) return "B1";
    if(score<=4) return "B2";
    if(score<=5) return "C1";
    return "C2";
  },
  run(lang, done){
    const host=document.getElementById("ltHost");
    let idx=0, score=0;
    const render=()=>{
      if(idx>=LevelTest.QUESTIONS.length){
        const cefr=LevelTest.scoreToCefr(score);
        host.innerHTML=`<div class="lt-done">
          <div class="lt-tag">Test rapide (provisoire)</div>
          <h3>Niveau estimé : <b>${cefr}</b></h3>
          <p>Ce test sera affiné plus tard. Ton gestionnaire peut ajuster ton niveau.</p>
          <button class="btn btn-primary" id="ltOk">Continuer</button>
        </div>`;
        document.getElementById("ltOk").onclick=()=>done(cefr);
        return;
      }
      const item=LevelTest.QUESTIONS[idx];
      host.innerHTML=`<div class="lt-q">
        <div class="lt-tag">Question ${idx+1} / ${LevelTest.QUESTIONS.length}</div>
        <h3>${R.esc(item.q)}</h3>
        <div class="lt-opts">${item.a.map((o,i)=>`<button class="lt-opt" data-v="${o[1]}">${R.esc(o[0])}</button>`).join("")}</div>
      </div>`;
      host.querySelectorAll(".lt-opt").forEach(b=>{ b.onclick=()=>{ score+=parseInt(b.dataset.v,10)||0; idx++; render(); }; });
    };
    render();
  }
};
window.LevelTest = LevelTest;
