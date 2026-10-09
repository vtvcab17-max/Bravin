const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']}); const errs=[]; const p=await b.newPage({viewport:{width:1600,height:1000}}); p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(6000);
const out={};
const snap=()=>p.evaluate(()=>{ drawFrame(); const t=document.createElement('canvas'); t.width=90;t.height=160; t.getContext('2d').drawImage(cv,0,0,90,160); return Array.from(t.getContext('2d').getImageData(0,0,90,160).data); });
const diff=(a,b2)=>{let s=0,n=0; for(let i=0;i<a.length;i++){ s+=Math.abs(a[i]-b2[i]); } return +(s/a.length).toFixed(2);};
// beauty on face clip
out.face=await p.evaluate(()=>{ C=C.filter(c=>c.type!=='text'&&c.type!=='sticker'); const c=V.find(c=>media.get(c.mediaId)&&/Tik/i.test(media.get(c.mediaId).name||'')) || V[13]; let st=0; for(const x of V){ if(x===c) break; st+=vlen(x);} window.__c=c; seek(st+0.8); return [media.get(c.mediaId).name, st]; });
await p.waitForTimeout(1500); const b0=await snap();
await p.evaluate(()=>{ __c.fix={beauty:{amt:1,detail:0.3,tone:0.4}}; }); await p.waitForTimeout(200); const b1=await snap(); out.beauty=diff(b0,b1);
await p.screenshot({path:'/tmp/claude-0/fix_beauty.png',clip:{x:640,y:70,width:260,height:420}});
await p.evaluate(()=>{ delete __c.fix; }); await p.waitForTimeout(200); await p.screenshot({path:'/tmp/claude-0/fix_beauty0.png',clip:{x:640,y:70,width:260,height:420}});
// sapphire effects contact
out.fx={};
for (const k of ['sglow','sglint','srays','sdefocus','sdamage','sduotone','sedge','sprism']) {
  const r=await p.evaluate(k=>{ try{ const fc={id:nid('c'),track:tracks.find(x=>x.type==='fx'||x.kind==='fx')?.id,type:'fx',fxType:k,start:t-0.5,dur:2}; return Object.keys(FX2[k]).join(','); }catch(e){return 'ERR '+e.message} },k);
  out.fx[k]=r;
}
console.log(JSON.stringify(out)); console.log(errs); await b.close();})();
