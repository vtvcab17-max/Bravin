const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl']}); const errs=[];
const p=await b.newPage({viewport:{width:1440,height:1400}}); p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500);
await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(6000);
const r=await p.evaluate(()=>{ const c=V[1]; applySpeedCurve(c,'hero'); const L=vlen(c); const e=Math.abs(srcOffset(c,L)-(c.out-c.in)); const inv=outAtSrc(c,srcOffset(c,L*0.7))-L*0.7;
 sel={k:'v',id:c.id}; inspTabs.video='motion'; renderAll(); seek(vStarts()[1]+0.3); applyMotionPreset(c,'spinIn'); seek(vStarts()[1]+0.3); showTab('insp'); renderInspector();
 return {e,inv,L};});
console.log(r);
await p.evaluate(()=>{document.querySelector('#insp').scrollTop=0}); await p.waitForTimeout(300);
await (await p.$('#sidePanel')).screenshot({path:'/tmp/claude-0/mot_d2.png'});
await p.evaluate(()=>{document.querySelector('#insp').scrollTop=700}); await p.waitForTimeout(300);
await (await p.$('#sidePanel')).screenshot({path:'/tmp/claude-0/mot_d3.png'});
// play through ramp briefly
await p.evaluate(()=>{seek(vStarts()[1]); play();}); await p.waitForTimeout(1500); await p.evaluate(()=>pause());
// text clip tap
const tx=await p.evaluate(()=>{const c=C.find(x=>x.type==='text'); sel={k:'c',id:c.id}; focusMotion(c); renderInspector(); return document.querySelector('.itabs [aria-selected=true]').textContent;});
console.log('text tab',tx, errs); await b.close();})();
