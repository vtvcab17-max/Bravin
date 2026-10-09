const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl']}); const errs=[];
const p=await b.newPage({viewport:{width:1600,height:1000}}); p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500);
await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(6000);
const out={};
const key=async k=>{await p.keyboard.press(k); await p.waitForTimeout(80);};
await p.evaluate(()=>{document.activeElement&&document.activeElement.blur(); seek(1.0);});
out.T0=await p.evaluate(()=>total());
await key('i'); await p.evaluate(()=>seek(3.0)); await key('o'); out.io=await p.evaluate(()=>ioRange());
out.band=await p.evaluate(()=>!!document.querySelector('.ioband'));
const vb=await p.evaluate(()=>({V:V.length, C:C.length}));
await key("'"); out.extract=await p.evaluate(()=>({T:total(), V:V.length, C:C.length}));
await key('Control+z'); out.undo=await p.evaluate(()=>total());
await p.evaluate(()=>{seek(1); setIn(1); setOut(3);}); await key(';'); out.lift=await p.evaluate(()=>({T:total(), gap: V.map(c=>c.gap||0).filter(x=>x>0)}));
await key('Control+z');
await p.evaluate(()=>seek(2.0)); await key('ArrowDown'); out.nextEdit=await p.evaluate(()=>t); await key('ArrowUp'); out.prevEdit=await p.evaluate(()=>t);
await p.evaluate(()=>seek(5.05)); const n0=await p.evaluate(()=>V.length+C.length); await key('Control+k'); out.addEdit=await p.evaluate(n=>V.length+C.length-n,n0);
await p.evaluate(()=>{sel={k:'v',id:V[2].id}}); await key('Control+c'); await p.evaluate(()=>seek(0.5)); const vl=await p.evaluate(()=>V.length); await key('Control+v'); out.paste=await p.evaluate(n=>V.length-n, vl);
await p.evaluate(()=>{sel={k:'v',id:V[1].id}}); await key('Shift+e'); out.dis=await p.evaluate(()=>[!!V[1].disabled, !!document.querySelector('.clip.dis')]);
await key('l'); await p.waitForTimeout(400); out.playing=await p.evaluate(()=>playing); await key('l'); await p.waitForTimeout(400); out.sh2=await p.evaluate(()=>[shuttle, playing]); await key('k'); out.stop=await p.evaluate(()=>[shuttle, playing]);
await key('b'); out.tool=await p.evaluate(()=>tool); await key('v');
// rolling edit on main track
await key('n'); const r=await p.evaluate(()=>{const d=document.querySelector(`.clip[data-id="${V[3].id}"]`).getBoundingClientRect(); return {x:d.right-3,y:d.y+d.height/2};}); const before=await p.evaluate(()=>[vlen(V[3]),vlen(V[4]),total()]);
await p.mouse.move(r.x,r.y); await p.mouse.down(); await p.mouse.move(r.x-30,r.y,{steps:4}); await p.mouse.up(); out.roll=[before, await p.evaluate(()=>[vlen(V[3]),vlen(V[4]),total()])];
await key('y'); const r2=await p.evaluate(()=>{const d=document.querySelector(`.clip[data-id="${V[4].id}"]`).getBoundingClientRect(); return {x:d.x+d.width/2,y:d.y+d.height/2, in:V[4].in};});
await p.mouse.move(r2.x,r2.y); await p.mouse.down(); await p.mouse.move(r2.x-25,r2.y,{steps:4}); await p.mouse.up(); out.slip=[r2.in, await p.evaluate(()=>V[4].in)];
await key('r'); const r3=await p.evaluate(()=>{const d=document.querySelector(`.clip[data-id="${V[5].id}"]`).getBoundingClientRect(); return {x:d.right-3,y:d.y+d.height/2};});
await p.mouse.move(r3.x,r3.y); await p.mouse.down(); await p.mouse.move(r3.x+40,r3.y,{steps:4}); await p.mouse.up(); out.rate=await p.evaluate(()=>V[5].speed);
await key('v');
// context menu
const r4=await p.evaluate(()=>{const d=document.querySelector(`.clip[data-id="${V[2].id}"]`).getBoundingClientRect(); return {x:d.x+d.width/2,y:d.y+d.height/2};});
await p.mouse.click(r4.x,r4.y,{button:'right'}); await p.waitForTimeout(300); await p.screenshot({path:'/tmp/claude-0/pr_menu.png'});
out.menu=await p.evaluate(()=>document.querySelectorAll('.menu button').length);
await p.evaluate(()=>{ [...document.querySelectorAll('.menu button')].find(b=>b.textContent.startsWith('Hồng'))?.click(); });
out.label=await p.evaluate(()=>V[2].label);
// track mixer + solo
await p.evaluate(()=>{const tr=tracks.find(x=>x.type==='audio'); tr.solo=true; tr.pan=-0.5; renderTimeline(); });
out.solo=await p.evaluate(()=>[trackGain('v'), trackGain(tracks.find(x=>x.type==='audio').id)]);
// mix range
out.mix=await p.evaluate(async()=>{const a=await renderMix(48000,[1,3]); return a.duration;});
await p.evaluate(()=>{setIn(1);setOut(3);}); await p.screenshot({path:'/tmp/claude-0/pr_tl.png'});
console.log(JSON.stringify(out)); console.log(errs); await b.close();})();
