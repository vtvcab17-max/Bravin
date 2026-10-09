const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']}); const errs=[]; const p=await b.newPage({viewport:{width:1600,height:1000}}); p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(6000);
const out={};
// overlay clip so we can see masking against main
out.setup=await p.evaluate(()=>{ C=C.filter(c=>c.type!=='text'&&c.type!=='sticker'); const m=[...media.values()].filter(x=>x.kind==='video')[3]; const tr=addTrack('overlay'); const c={id:nid('c'),track:tr.id,type:'video',mediaId:m.id,start:0,in:0,out:6,scale:1,vol:0}; C.push(c); sel={k:'c',id:c.id}; inspTabs.video='mask'; showTab('insp'); seek(1.0); renderAll(); return c.id; });
await p.waitForTimeout(1200);
// add ellipse via UI button
await p.evaluate(()=>{ [...document.querySelectorAll('.mkadd button')].find(b=>b.textContent.includes('Elip')).click(); });
await p.waitForTimeout(300);
out.masks=await p.evaluate(()=>findSel().masks.map(m=>m.type));
// add rect, set subtract & small
await p.evaluate(()=>{ [...document.querySelectorAll('.mkadd button')].find(b=>b.textContent.includes('Chữ nhật')).click(); const c=findSel(); c.masks[1].mode='sub'; c.masks[1].w=0.2; c.masks[1].h=0.2; drawFrame(); });
out.alpha=await p.evaluate(()=>{ const c=findSel(); const mc=drawMaskSet(c.masks, cv.width, cv.height, 1); const x=mc.getContext('2d'); const a=(px,py)=>x.getImageData(px,py,1,1).data[3]; return [a(cv.width/2|0, cv.height/2|0), a(cv.width/2+cv.width*0.18|0, cv.height/2|0), a(5,5)]; });
await p.screenshot({path:'/tmp/claude-0/mk_two.png'});
// pen mask by clicking on selCv
await p.evaluate(()=>{ [...document.querySelectorAll('.mkadd button')].find(b=>b.textContent.includes('bút')).click(); });
await p.waitForTimeout(200);
const r=await p.evaluate(()=>{const b=document.querySelector('#pvSel').getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height};});
const pts=[[0.3,0.3],[0.7,0.3],[0.75,0.7],[0.3,0.65]];
for (const [fx,fy] of pts){ await p.mouse.click(r.x+fx*r.w, r.y+fy*r.h); await p.waitForTimeout(80); }
await p.mouse.move(r.x+0.3*r.w, r.y+0.3*r.h); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(200);
out.pen=await p.evaluate(()=>{ const m=findSel().masks[2]; return [m.pts.length, m.closed]; });
// drag ellipse move
await p.evaluate(()=>{ maskIdxMem['clip:'+findSel().id]=0; renderInspector(); drawFrame(); });
const x0=await p.evaluate(()=>findSel().masks[0].x);
await p.mouse.move(r.x+0.5*r.w, r.y+0.5*r.h); await p.mouse.down(); await p.mouse.move(r.x+0.6*r.w, r.y+0.5*r.h,{steps:4}); await p.mouse.up();
out.move=[x0, await p.evaluate(()=>findSel().masks[0].x)];
// keyframe + interpolation
out.kf=await p.evaluate(()=>{ const c=findSel(), m=c.masks[0]; maskKeyHere(m, 0); setMaskVal(m,'x',1.5,0.3); return [maskAt(m,0).x, maskAt(m,0.75).x.toFixed(3), maskAt(m,1.5).x]; });
// migration
out.mig=await p.evaluate(()=>{ const c={mask:{type:'circle',x:0.1,y:0,w:0.5,h:0.5,feather:0.2,invert:true}}; migrateMask(c); return [c.masks[0].type, c.masks[0].inv, !!c.mask]; });
// tracking 6 frames forward
out.track=await p.evaluate(async()=>{ const c=findSel(), m=c.masks[1]; const t0=performance.now(); await trackMask(c, m, 1, 6); return [Object.keys(m.kf||{}), (m.kf.x||[]).length, Math.round(performance.now()-t0)]; });
await p.screenshot({path:'/tmp/claude-0/mk_ui.png'});
console.log(JSON.stringify(out)); console.log(errs); await b.close();})();
