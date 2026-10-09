const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']}); const errs=[]; const p=await b.newPage({viewport:{width:1600,height:1000}}); p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(6000);
const out={};
out.setup=await p.evaluate(()=>{ C=C.filter(c=>c.type!=='text'&&c.type!=='sticker'); const c=V.find(c=>c.mediaId&&media.get(c.mediaId)&&media.get(c.mediaId).kind==='video'); sel={k:'v',id:c.id}; seek(1); renderAll(); window.__c=c; return [c.id,c.type,FIXGL.available()]; });
await p.waitForTimeout(1500);
const snap=()=>p.evaluate(()=>{ drawFrame(); const t=document.createElement('canvas'); t.width=64;t.height=36; t.getContext('2d').drawImage(cv,0,0,64,36); return Array.from(t.getContext('2d').getImageData(0,0,64,36).data); });
const diff=(a,b2)=>{let s=0; for(let i=0;i<a.length;i++) s+=Math.abs(a[i]-b2[i]); return +(s/a.length).toFixed(2);};
const base=await snap();
for (const [k,v] of [['dn',{s:0.8,t:0.5}],['beauty',{amt:0.9,detail:0.4,tone:0.5}],['film',{stock:'warm250',amt:0.9,grain:0.6,size:1.6,hal:0.4,weave:0.3}]]) {
  await p.evaluate(([k,v])=>{ __c.fix={[k]:v}; },[k,v]); await p.waitForTimeout(200); const s=await snap(); out[k]=diff(base,s);
}
await p.evaluate(()=>{ delete __c.fix; inspTabs.video='fix'; showTab('insp'); renderInspector(); });
await p.waitForTimeout(400); await p.screenshot({path:'/tmp/claude-0/fix_ui.png'});
out.dfl=await p.evaluate(async()=>{ const t0=performance.now(); await analyzeDeflicker(__c); return [__c.dfl&&__c.dfl.g.length, __c.dfl&&__c.dfl.g.slice(0,4).map(x=>+x.toFixed(3)), Math.round(performance.now()-t0)]; });
out.stab=await p.evaluate(async()=>{ const t0=performance.now(); await analyzeStab(__c); const s=__c.stab; return [s&&s.raw.length, s&&s.z, JSON.stringify(stabAt(__c, 1)), Math.round(performance.now()-t0)]; });
const s2=await snap(); out.dflstab=diff(base,s2);
out.sapphire=await p.evaluate(()=>Object.keys(FX2).filter(k=>k[0]==='s'&&['sglow','sglint','srays','sdefocus','sdamage','sduotone','sedge','sprism'].includes(k)));
out.fxdiff={};
for (const k of out.sapphire){ await p.evaluate(k=>{ delete __c.stab; delete __c.dfl; applyEffect? 0:0; __c.fx2=undefined; },k); }
await p.screenshot({path:'/tmp/claude-0/fix_after.png'});
console.log(JSON.stringify(out)); console.log(errs); await b.close();})();
