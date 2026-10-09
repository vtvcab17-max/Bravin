const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--autoplay-policy=no-user-gesture-required']}); const errs=[];
const p=await b.newPage({viewport:{width:1440,height:900}}); p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('console:'+m.text())});
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500);
await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(6000);
const r = await p.evaluate(async()=>{
  const out={};
  const c=V[0]; out.len0=vlen(c); out.src=c.out-c.in;
  // tap clip on timeline → motion tab
  const d=document.querySelector(`.clip[data-id="${V[1].id}"]`); const bb=d.getBoundingClientRect();
  d.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:bb.x+bb.width/2,clientY:bb.y+bb.height/2,button:0,pointerId:1}));
  window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));
  await new Promise(r=>setTimeout(r,200));
  out.tab=document.querySelector('.itabs [aria-selected=true]')?.textContent; out.hasLane=!!document.querySelector('.kfl.big');
  out.sections=[...document.querySelectorAll('#insp details.sect>summary')].map(x=>x.textContent);
  // speed ramp
  applySpeedCurve(c,'montage'); out.rampLen=vlen(c); out.srcEnd=srcOffset(c,vlen(c)); out.inv=outAtSrc(c,srcOffset(c,1.234));
  // split preserves source continuity
  const st=vStarts(); const off=vlen(c)*0.5, so=srcOffset(c,off), cin=c.in; const b2=splitV(c,off); out.splitCut=[c.out, cin+so, b2.in]; out.sumLen=[vlen(c)+vlen(b2)];
  // flip + blend kf
  const v=V[2]; setKf(v,'flipH',0,0); setKf(v,'flipH',1,1); setKf(v,'blend',0,'normal','hold'); setKf(v,'blend',0.5,'screen','hold');
  out.flipMid=xform(v,0.5,vlen(v)).fx; out.flipEnd=xform(v,1.2,vlen(v)).fx; out.blend=[blendAt(v,0.2),blendAt(v,0.7)];
  setKf(v,'blur',0,20); setKf(v,'blur',1,0); out.blur=xform(v,0.5,vlen(v)).blur;
  // preset
  sel={k:'v',id:v.id}; applyMotionPreset(v,'kenburns'); out.kb=Object.keys(v.kf);
  // duration field
  const v3=V[3]; const s0=(v3.out-v3.in); setDuration(v3,s0/2); out.dur=[vlen(v3), v3.speed];
  sel={k:'v',id:v.id}; inspTabs.video='motion'; renderAll(); seek(vStarts()[2]+0.5);
  out.applied=[...document.querySelectorAll('.applied .apn')].map(x=>x.textContent);
  drawFrame(); return out;});
console.log(JSON.stringify(r,null,1));
await p.screenshot({path:'/tmp/claude-0/mot_desk.png'});
// export a short piece via webcodecs to check ramps don't crash
const ex = await p.evaluate(async()=>{ try{ const a=await renderMix(48000); return a.duration; }catch(e){return 'ERR '+e.message} });
console.log('mix',ex);
// phone
const p2=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true}); p2.on('pageerror',e=>errs.push('ph:'+e.message));
await p2.goto('http://localhost:8772/index.html'); await p2.waitForTimeout(2500); await p2.evaluate(()=>newFromTemplate()); await p2.waitForTimeout(6000);
const cl=await p2.$(`.clip[data-k="v"]:nth-of-type(2)`) || await p2.$('.clip[data-k="v"]'); const bx=await cl.boundingBox(); await p2.mouse.click(bx.x+bx.width/2,bx.y+bx.height/2); await p2.waitForTimeout(500);
await p2.screenshot({path:'/tmp/claude-0/mot_phone.png'});
await p2.evaluate(()=>{const c=findSel(); applyMotionPreset(c,'spinIn'); }); await p2.waitForTimeout(400); await p2.screenshot({path:'/tmp/claude-0/mot_phone2.png'});
console.log(errs); await b.close();})();
