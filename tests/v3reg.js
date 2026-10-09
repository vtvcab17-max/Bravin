const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const errs=[]; const hook=p=>{p.on('pageerror',e=>errs.push('PE '+e.message+' @'+(e.stack||'').split('\n')[1]));p.on('console',m=>{const x=m.text(); if(m.type()==='error'&&!/TUNNEL|fonts/.test(x))errs.push(x.slice(0,200))});};
const ctx=await b.newContext({viewport:{width:1600,height:950}}); const p=await ctx.newPage(); hook(p);
await p.goto('http://localhost:8772/index.html');await p.waitForTimeout(2500);
await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(6000);
console.log('opened', await p.evaluate(()=>[V.length,C.length,homeEl.hidden]));
// 1 multi-layer drag from library
const itEl=await p.$('.mitem[data-mid="m_h25"]'); await itEl.scrollIntoViewIfNeeded(); const vb=await (await p.$('.tcontent.video')).boundingBox(); const it=await itEl.boundingBox();
await p.mouse.move(it.x+40,it.y+40); await p.mouse.down(); await p.mouse.move(it.x+80,it.y+80,{steps:3}); await p.mouse.move(vb.x+300,vb.y+4,{steps:10}); await p.mouse.up(); await p.waitForTimeout(300);
console.log('layer', await p.evaluate(()=>tracks.filter(t=>t.type==='overlay').map(t=>t.name)));
// 2 assistant ops
const r=await p.evaluate(async()=>{const out=[]; const ops=[{op:'add_text',start:2,duration:2,text:'Thử trợ lý',preset:6},{op:'add_sticker',start:2,emoji:'🔥',x:0.3,y:-0.2},{op:'add_effect',effect:'snow',start:1,duration:3},{op:'transition',index:2,type:'zoom',duration:0.5},{op:'transition_all',type:'fade',duration:0.3},{op:'set',clip:V[1].id,props:{speed:1.5,filter:'warm',anim:{in:{type:'zoomIn',dur:0.4}}}},{op:'keyframe',clip:V[3].id,time:vStarts()[3],props:{scale:1}},{op:'keyframe',clip:V[3].id,time:vStarts()[3]+1,props:{scale:1.4,angle:8}},{op:'add_filter_layer',filter:'bw',start:4,duration:1},{op:'aspect',value:'4:5'},{op:'aspect',value:'9:16'}];
 for(const o of ops){ try{ out.push(await runOp(o)); }catch(e){ out.push('ERR '+o.op+': '+e.message); } } return out;});
console.log('ops', r);
// 3 direct manipulation: select sticker in preview and drag it
await p.evaluate(()=>{const c=C.find(x=>x.type==='sticker'); sel={k:'c',id:c.id}; t=c.start+0.6; renderAll();}); await p.waitForTimeout(400);
const box=await p.evaluate(()=>{const c=C.find(x=>x.type==='sticker'); const b=lastBoxes.get(c.id); const r=cv.getBoundingClientRect(); return b && {x:r.left+b.cx/cv.width*r.width, y:r.top+b.cy/cv.height*r.height, x0:c.x};});
console.log('sticker box', box);
if (box){ await p.mouse.move(box.x,box.y); await p.mouse.down(); await p.mouse.move(box.x-60,box.y+40,{steps:6}); await p.mouse.up(); console.log('dragged x', await p.evaluate(()=>C.find(x=>x.type==='sticker').x.toFixed(3))); }
// corner scale
const b2=await p.evaluate(()=>{const c=C.find(x=>x.type==='sticker'); const b=lastBoxes.get(c.id); const r=cv.getBoundingClientRect(); const k=r.width/cv.width; const pts=boxCorners(b); return {x:r.left+pts[2][0]*k, y:r.top+pts[2][1]*k};});
await p.mouse.move(b2.x,b2.y); await p.mouse.down(); await p.mouse.move(b2.x+40,b2.y+40,{steps:5}); await p.mouse.up();
console.log('scaled', await p.evaluate(()=>(C.find(x=>x.type==='sticker').scale||1).toFixed(2)));
await p.screenshot({path:'/tmp/claude-0/reg_desk.png'});
// 4 undo chain
console.log('undo', await p.evaluate(()=>{const n=undoStack.length; for(let i=0;i<4;i++) undo(); return [n, undoStack.length];}));
// keyboard K
await p.evaluate(()=>{sel={k:'v',id:V[5].id}; t=vStarts()[5]+0.3; renderAll();}); await p.keyboard.press('k'); console.log('K kf', await p.evaluate(()=>Object.keys(V[5].kf||{})));
// 5 phone
const ph=await b.newContext({viewport:{width:412,height:892},deviceScaleFactor:2,isMobile:true,hasTouch:true}); const q=await ph.newPage(); hook(q);
await q.goto('http://localhost:8772/index.html'); await q.waitForTimeout(2500); await q.screenshot({path:'/tmp/claude-0/reg_phone_home.png'});
await q.evaluate(()=>newFromTemplate()); await q.waitForTimeout(6000); await q.screenshot({path:'/tmp/claude-0/reg_phone_ed.png'}); console.log('phone state', await q.evaluate(()=>({home:homeEl.hidden, cls:document.body.className, tabs:getComputedStyle(document.querySelector('.mtabs')).display, vis:getComputedStyle(document.querySelector('.app')).visibility, r:JSON.stringify(document.querySelector('.mtabs').getBoundingClientRect())})));
await q.tap('.mtabs button[data-sheet=lib]'); await q.waitForTimeout(300); await q.evaluate(()=>showAssets('fx')); await q.waitForTimeout(300); await q.screenshot({path:'/tmp/claude-0/reg_phone_fx.png'});
await q.evaluate(()=>{closeSheets(); sel={k:'v',id:V[2].id}; renderAll(); openSheet('insp'); inspTabs.video='color'; renderInspector();}); await q.waitForTimeout(500); await q.screenshot({path:'/tmp/claude-0/reg_phone_insp.png'});
console.log('errors', errs.slice(0,12)); await b.close();})();
