const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']}); const errs=[]; const p=await b.newPage({viewport:{width:1600,height:1000}}); p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(6000);
await p.evaluate(()=>{ C=C.filter(c=>c.type!=='text'&&c.type!=='sticker'); sel={k:'v',id:V[1].id}; seek(vStarts()[1]+0.6); });
await p.waitForTimeout(1000);
const px=()=>p.evaluate(()=>{drawFrame(); const d=g.getImageData(cv.width/2|0,cv.height*0.4|0,1,1).data; return [...d.slice(0,3)];});
const out={base:await px()};
await p.keyboard.press('Shift+Digit6'); await p.waitForTimeout(600);
out.open=await p.evaluate(()=>[cp.open, !!document.querySelector('.cpage:not([hidden])'), findSel().nodes.length]);
await p.evaluate(()=>{ const n=cpNodeOf(); n.gain={x:0.6,y:0.2,l:0.3}; n.con=0.3; drawFrame(); }); out.gain=await px();
await p.evaluate(()=>{ const n=cpNodeOf(); n.gain=null; n.con=0; n.curves={y:[[0,0],[0.5,0.25],[1,1]]}; drawFrame(); }); out.curve=await px();
await p.evaluate(()=>{ const n=cpNodeOf(); n.curves=null; n.hcur={hs:[[0,0],[1,0]]}; drawFrame(); }); out.huesat=await px();
await p.evaluate(()=>{ const n=cpNodeOf(); n.hcur=null; n.sat=0; n.win=[Object.assign(newMask('ellipse',1),{w:0.15,h:0.15,feather:0})]; drawFrame(); }); out.winCenter=await px(); out.winEdge=await p.evaluate(()=>[...g.getImageData(cv.width*0.1|0,cv.height*0.9|0,1,1).data.slice(0,3)]);
await p.evaluate(()=>{ const n=cpNodeOf(); n.win=null; n.sat=1; n.q={on:true,h:220,hw:60,hs:10,s0:0,s1:1,l0:0,l1:1,soft:0.05}; n.hue=180; cp.tab='qual'; renderCP(); drawFrame(); });
await p.waitForTimeout(400); await p.screenshot({path:'/tmp/claude-0/cp_qual.png'});
await p.evaluate(()=>{ const n=cpNodeOf(); n.q=null; n.hue=0; n.lift={x:-0.4,y:-0.5,l:0}; n.gain={x:0.5,y:0.3,l:0.1}; cp.tab='wheels'; cp.split=true; renderCP(); drawFrame(); });
await p.waitForTimeout(500); await p.screenshot({path:'/tmp/claude-0/cp_wheels.png'});
// add node, window tab
await p.keyboard.press('Alt+KeyS'); await p.waitForTimeout(200);
out.nodes=await p.evaluate(()=>cp.clip.nodes.length);
await p.evaluate(()=>{ cp.tab='win'; renderCP(); [...document.querySelectorAll('.cp-panel .mkadd button')].find(b=>b.textContent.includes('Elip')).click(); }); await p.waitForTimeout(300);
await p.evaluate(()=>{ const n=cpNodeOf(); n.blur=12; drawFrame(); }); await p.waitForTimeout(300);
await p.screenshot({path:'/tmp/claude-0/cp_win.png'});
// still + copy grade
await p.evaluate(()=>{ [...document.querySelectorAll('.cp-gal>button')][0].click(); }); out.stills=await p.evaluate(()=>stillsLoad().length);
await p.evaluate(()=>{ cp.tab='hcurves'; renderCP(); }); await p.waitForTimeout(300); await p.screenshot({path:'/tmp/claude-0/cp_hc.png'});
// export a frame path check: drawFrame with renderMode export should apply nodes
out.exportApply=await p.evaluate(()=>{ const keep=cv, kg=g; const e=document.createElement('canvas'); e.width=cv.width; e.height=cv.height; cv=e; g=e.getContext('2d'); renderMode='export'; frameProvider=()=>null; try{ drawFrame(t);} finally{ cv=keep; g=kg; renderMode='preview'; frameProvider=null; } return true; });
await p.keyboard.press('Escape'); out.closed=await p.evaluate(()=>cp.open);
// phone
const p2=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true}); p2.on('pageerror',e=>errs.push('ph:'+e.message));
await p2.goto('http://localhost:8772/index.html'); await p2.waitForTimeout(2500); await p2.evaluate(()=>newFromTemplate()); await p2.waitForTimeout(5000);
await p2.evaluate(()=>{ sel={k:'v',id:V[1].id}; seek(vStarts()[1]+0.5); openColorPage(); }); await p2.waitForTimeout(600); await p2.screenshot({path:'/tmp/claude-0/cp_phone.png'});
console.log(JSON.stringify(out)); console.log(errs); await b.close();})();
