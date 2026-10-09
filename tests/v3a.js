const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});const p=await b.newPage({viewport:{width:1600,height:950}});const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message+' '+(e.stack||'').split('\n')[1]));p.on('console',m=>{if(m.type()==='error'&&!/TUNNEL|fonts/.test(m.text()))errs.push(m.text())});
await p.goto('http://localhost:8772/index.html');await p.waitForTimeout(6000);
console.log('gl', await p.evaluate(()=>GLFX.available()));
const shot=async(n,T)=>{await p.evaluate(T=>{pause();t=T;drawFrame();},T);await p.waitForTimeout(900);await p.evaluate(()=>drawFrame());await p.waitForTimeout(200);const d=await p.evaluate(()=>document.querySelector('#pv').toDataURL('image/jpeg',.8));require('fs').writeFileSync('/tmp/claude-0/'+n+'.jpg',Buffer.from(d.split(',')[1],'base64'));};
await p.evaluate(()=>{ // build a test scene
  t=5; addTextPreset(TEXT_PRESETS[12]); // gradient
  const tx=findSel(); tx.y=-0.25; tx.anim={in:{type:'pop',dur:.5},loop:{type:'pulse'}};
  t=5; addSticker({shape:'arrow',color:GOLD}); const s1=findSel(); s1.x=0.2; s1.y=0.1; s1.angle=-30;
  t=5; addSticker({emoji:'🔥'}); findSel().x=-0.25;
  t=4; addEffect('vignette'); 
  V[1].filter='cinema'; V[2].filter='bw'; V[2].speed=2; V[0].tr={type:'circle',dur:0.8}; V[1].tr={type:'slideL',dur:0.6};
  V[3].mask={type:'heart',x:0,y:0,w:0.9,feather:0.1}; V[3].fit='contain'; V[3].bg='blur';
  const k=V[4]; k.kf={scale:[{t:0,v:1,e:'inout'},{t:1.5,v:1.6}],angle:[{t:0,v:0},{t:1.5,v:20}]};
  addTextPreset(TEXT_PRESETS[13], 9); const kt=findSel(); kt.y=0.3;
  renderAll();
});
const st=await p.evaluate(()=>vStarts().slice(0,6).map((s,i)=>[s,vlen(V[i])]));console.log(st);
await shot('v3_text',5.6);
await shot('v3_trans', st[1][0]-0.05);
await shot('v3_trans2', st[2][0]);
await shot('v3_mask', st[3][0]+0.5);
await shot('v3_kf', st[4][0]+1.4);
await shot('v3_kara', 10.2);
await p.screenshot({path:'/tmp/claude-0/v3_ui.png'});
// inspector tabs render for each kind
for (const id of await p.evaluate(()=>[V[1].id, C.find(c=>c.type==='text'&&c.style==='custom').id, C.find(c=>c.type==='sticker').id, C.find(c=>c.type==='fx').id, C.find(c=>c.type==='audio').id])) {
  const r=await p.evaluate(id=>{const f=clipById(id); sel={k:f.k,id}; renderInspector(); const tabs=[...document.querySelectorAll('#insp .itabs button')].map(b=>b.textContent); const out=[]; for(const b of document.querySelectorAll('#insp .itabs button')){} return tabs;},id);
  const n=r.length; for(let i=0;i<n;i++){ await p.evaluate(i=>document.querySelectorAll('#insp .itabs button')[i].click(),i); await p.waitForTimeout(80);} console.log('tabs',r.join('|'));
}
await p.evaluate(()=>{sel={k:'tr',id:V[0].id};renderInspector();}); console.log('tr panel', await p.evaluate(()=>document.querySelector('#insp').textContent.slice(0,60)));
// library tabs
for (const k of ['audio','text','sticker','fx','tr','filter','media']) { await p.evaluate(k=>showAssets(k),k); await p.waitForTimeout(100); }
await p.evaluate(()=>showAssets('text')); await p.screenshot({path:'/tmp/claude-0/v3_lib.png'});
console.log(errs.slice(0,10));await b.close();})();
