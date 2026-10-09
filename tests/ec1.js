const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl']}); const errs=[];
const p=await b.newPage({viewport:{width:1600,height:1000}}); p.on('pageerror',e=>errs.push(e.message+' '+e.stack));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500);
await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(6000);
await p.evaluate(()=>{ const c=V[1]; sel={k:'v',id:c.id}; inspTabs.video='motion'; showTab('insp'); const s=vStarts()[1]; seek(s); applyMotionPreset(c,'kenburns'); setKf(c,'angle',0,0); setKf(c,'angle',1.2,30,'out'); setKf(c,'blend',0.8,'screen','hold'); setKf(c,'blend',0,'normal','hold'); setKf(c,'opacity',0.5,1,'linear'); setKf(c,'opacity',1.5,0.4); applySpeedCurve(c,'hero'); renderAll(); seek(s+0.6); });
await p.waitForTimeout(600);
await p.screenshot({path:'/tmp/claude-0/ec_full.png'});
await (await p.$('#sidePanel')).screenshot({path:'/tmp/claude-0/ec_side.png'});
// interactions: scrub value X
const r = await p.evaluate(async()=>{
  const out={}; const c=findSel(); const v=document.querySelector('.ec-p .ec-v'); const bb=v.getBoundingClientRect();
  const ev=(t,x)=>v.dispatchEvent(new PointerEvent(t,{bubbles:true,clientX:x,clientY:bb.y+5,pointerId:3}));
  const x0=kfVal(c,'x',curLt(c),0); ev('pointerdown',bb.x+10); ev('pointermove',bb.x+40); ev('pointerup',bb.x+40);
  out.dx=kfVal(c,'x',curLt(c),0)-x0; out.autoKey=!!kfAt(c,'x',curLt(c));
  // marquee select all in lanes
  const inner=document.querySelector('.ec-inner'), ib=inner.getBoundingClientRect(), lane=document.querySelectorAll('.ec-lane')[1].getBoundingClientRect();
  inner.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:ib.right-2,clientY:lane.y+2,button:0,pointerId:4}));
  window.dispatchEvent(new PointerEvent('pointermove',{clientX:ib.left+1,clientY:ib.bottom-2,pointerId:4}));
  window.dispatchEvent(new PointerEvent('pointerup',{clientX:ib.left+1,clientY:ib.bottom-2,pointerId:4}));
  out.selected=ecState.sel.size; out.total=Object.values(c.kf).reduce((a,l)=>a+l.length,0);
  // drag a diamond
  const d=document.querySelector('.ec-lane:not(.ec-glane) .ec-k'); const db=d.getBoundingClientRect(); ecState.sel.clear();
  const t0=d._ks[0][1].t; d.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:db.x+5,clientY:db.y+5,button:0,pointerId:5}));
  window.dispatchEvent(new PointerEvent('pointermove',{clientX:db.x+45,clientY:db.y+5,pointerId:5})); window.dispatchEvent(new PointerEvent('pointerup',{clientX:db.x+45,pointerId:5}));
  out.moved=[t0, d._ks[0][1].t];
  // stopwatch off on angle
  const rows=[...document.querySelectorAll('.ec-p')]; const ar=rows.find(r=>r.querySelector('.ec-n').textContent==='Góc xoay'); ar.querySelector('.ec-sw').click(); out.angleOff=!kfList(c,'angle');
  out.rows=document.querySelectorAll('.ec-p').length; out.lanes=document.querySelectorAll('.ec-lane').length; out.leftRows=document.querySelectorAll('.ec-left .ec-row').length;
  return out;});
console.log(r);
// keyboard delete
await p.evaluate(()=>{const c=findSel(); ecState.sel.clear(); c.kf.scale.forEach(k=>ecState.sel.add(k)); document.querySelector('.ecw').focus();});
await p.keyboard.press('Delete'); console.log('scale after del', await p.evaluate(()=>!!(findSel().kf||{}).scale), 'clip still', await p.evaluate(()=>!!findSel()));
// phone
const p2=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true}); p2.on('pageerror',e=>errs.push('ph:'+e.message));
await p2.goto('http://localhost:8772/index.html'); await p2.waitForTimeout(2500); await p2.evaluate(()=>newFromTemplate()); await p2.waitForTimeout(6000);
await p2.evaluate(()=>{const c=V[1]; applyMotionPreset(c,'spinIn'); sel={k:'v',id:c.id}; focusMotion(c); renderAll(); openSheet('insp'); seek(vStarts()[1]+0.3);});
await p2.waitForTimeout(500); await p2.screenshot({path:'/tmp/claude-0/ec_phone.png'});
console.log(errs); await b.close();})();
