const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--autoplay-policy=no-user-gesture-required']}); const errs=[]; const p=await b.newPage({viewport:{width:1500,height:1000}}); p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(7000);
const r=await p.evaluate(async()=>{const out={};
  const sr=48000, oc=new OfflineAudioContext(1,sr*2,sr), o=oc.createOscillator(); o.frequency.value=1000; const g2=oc.createGain(); g2.gain.value=0.1; o.connect(g2); g2.connect(oc.destination); o.start(); const sine=await oc.startRendering();
  out.lufsSine=+(await measureLUFS(sine)).toFixed(2);
  // denoise: sine burst + noise
  const nb=actx.createBuffer(1,sr*2,sr), d=nb.getChannelData(0); for(let i=0;i<d.length;i++){ d[i]=(Math.random()*2-1)*0.03 + (i>sr*0.5&&i<sr*1.5? Math.sin(i*2*Math.PI*440/sr)*0.3:0); }
  const t0=performance.now(); const dn=await denoiseBuffer(nb,0.8); out.denMs=Math.round(performance.now()-t0);
  const rms=(buf,a,b)=>{const x=buf.getChannelData(0); let s=0; for(let i=a;i<b;i++) s+=x[i]*x[i]; return Math.sqrt(s/(b-a));};
  out.noiseBefore=+rms(nb,0,sr*0.4).toFixed(4); out.noiseAfter=+rms(dn,0,sr*0.4).toFixed(4); out.toneBefore=+rms(nb,sr*0.7,sr*1.3).toFixed(3); out.toneAfter=+rms(dn,sr*0.7,sr*1.3).toFixed(3);
  // ducking: music clip
  const mus=C.find(c=>c.type==='audio' && /nhạc/i.test((trackById(c.track)||{}).name||'')); const voice=C.find(c=>c.type==='audio' && /voice/i.test((trackById(c.track)||{}).name||''));
  out.found=[!!mus,!!voice, mus&&esOf(mus), voice&&esOf(voice)];
  if (mus){ const g0=clipGain(mus, 3, clen(mus)); mus.afx={duck:{on:true,db:12}}; const map=duckActivity(); out.activity=+(map.reduce((a,b)=>a+b,0)/map.length).toFixed(2); out.duck=[+g0.toFixed(3), +clipGain(mus,3,clen(mus)).toFixed(3)]; }
  // eq/comp/rev + pan export mix
  if (voice){ voice.afx={eq:{lo:-3,mid:3,midF:3000,hi:2},comp:{on:true,thr:-24,ratio:3,mk:4},rev:{mix:0.3,size:0.5}}; voice.pan=-0.4; }
  exportNorm=-14; const t1=performance.now(); const mix=await renderMix(48000,[0,8]); out.mixMs=Math.round(performance.now()-t1); out.mixLufs=+(await measureLUFS(mix)).toFixed(2);
  exportNorm=0;
  // live
  play(); await new Promise(r=>setTimeout(r,800)); pause();
  return out;});
console.log(JSON.stringify(r));
await p.evaluate(()=>{const v=C.find(c=>c.type==='audio'); sel={k:'c',id:v.id}; inspTabs.audio='a'; showTab('insp'); renderAll();}); await p.waitForTimeout(300);
await (await p.$('#sidePanel')).screenshot({path:'/tmp/claude-0/au_panel.png'});
console.log(errs); await b.close();})();
