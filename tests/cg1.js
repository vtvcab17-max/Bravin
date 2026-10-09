const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']}); const errs=[]; const p=await b.newPage({viewport:{width:1600,height:1000}}); p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(6000);
await p.evaluate(()=>{ C=C.filter(c=>c.type!=='text'&&c.type!=='sticker'); sel={k:'v',id:V[1].id}; seek(vStarts()[1]+0.5); }); await p.waitForTimeout(1200);
const px=()=>p.evaluate(()=>{drawFrame(); const d=g.getImageData(cv.width/2|0,cv.height*0.4|0,1,1).data; return [...d.slice(0,3)];});
const out={};
out.base=await px();
await p.evaluate(()=>openColorPage()); await p.waitForTimeout(800);
out.graph=await p.evaluate(()=>({n:document.querySelectorAll('.cg-host .ng-node').length, wires:document.querySelectorAll('.cg-host .ng-wire').length, nodes:cp.clip.nodes.map(n=>[n.kind||'cor',n.gk,n.inp.join(',')])}));
// make node 1 warmer via gain
await p.evaluate(()=>{ const n=cp.clip.nodes.find(n=>!n.kind); n.gain={x:0.6,y:0.2,l:0.3}; drawFrame(); });
out.warm=await px();
// Alt+P parallel
await p.keyboard.down('Alt'); await p.keyboard.press('KeyP'); await p.keyboard.up('Alt'); await p.waitForTimeout(400);
out.par=await p.evaluate(()=>cp.clip.nodes.map(n=>[n.kind||'cor',n.gk,n.inp.join(',')]));
out.parPx=await px();
// layer instead: switch mixer kind
await p.evaluate(()=>{ const m=cp.clip.nodes.find(n=>n.kind==='par'); m.kind='lay'; m.blend='source-over'; renderCP(); });
out.layPx=await px();
await p.waitForTimeout(500);
await p.screenshot({path:'/tmp/claude-0/cg_page.png'});
// drag a wire: disconnect out input then reconnect to src directly
await p.evaluate(()=>cgUI.api.fit()); await p.waitForTimeout(100); const info=await p.evaluate(()=>{ const q=s=>{const r=document.querySelector(s).getBoundingClientRect(); return [r.x+r.width/2,r.y+r.height/2];}; return {srcOut:q('.ng-port.out[data-node="src"]'), outIn:q('.ng-port.in[data-node="out"]')}; });
console.log('ports',JSON.stringify(info)); await p.mouse.move(...info.srcOut); await p.mouse.down(); await p.mouse.move(info.outIn[0]-30, info.outIn[1], {steps:6}); await p.mouse.move(...info.outIn,{steps:3}); await p.mouse.up(); await p.waitForTimeout(300);
out.rewired=await p.evaluate(()=>cp.clip.nodes.find(n=>n.kind==='out').inp);
out.rewPx=await px();
// undo
await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
out.undo=await p.evaluate(()=>cp.clip.nodes.find(n=>n.kind==='out').inp);
// right click empty → menu
const hb=await p.evaluate(()=>{const r=document.querySelector('.cg-host').getBoundingClientRect(); return [r.x+r.width-40,r.y+r.height-30];});
await p.mouse.click(hb[0],hb[1],{button:'right'}); await p.waitForTimeout(200);
out.menu=await p.evaluate(()=>[...document.querySelectorAll('.menu button')].map(b=>b.textContent).slice(0,4));
await p.keyboard.press('Escape');
// copy grade to another clip
out.copy=await p.evaluate(()=>{ const src=cp.clip; const x=V[2]; x.nodes=freshNodes(src.nodes); cgEnsure(x); return x.nodes.map(n=>[n.kind||'cor',n.gk,n.inp.join(',')]); });
console.log(JSON.stringify(out)); console.log(errs); await b.close();})();
