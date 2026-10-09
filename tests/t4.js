const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('http://localhost:8766/index.html');await p.waitForTimeout(7000);
const before=await p.evaluate(()=>V.length+'/'+A.length);
const items=await p.$$('.mitem');const ib=await items[1].boundingBox();const vt=await (await p.$('#vtrack')).boundingBox();
await p.mouse.move(ib.x+40,ib.y+60);await p.mouse.down();await p.mouse.move(ib.x+80,ib.y+120,{steps:4});await p.mouse.move(vt.x+30,vt.y+vt.height/2,{steps:10});await p.mouse.up();
await items[4].scrollIntoViewIfNeeded();const ab=await items[4].boundingBox();const at=await (await p.$('#atrack')).boundingBox();
await p.mouse.move(ab.x+40,ab.y+40);await p.mouse.down();await p.mouse.move(at.x+500,at.y+at.height/2,{steps:12});await p.mouse.up();
// splitter drag up
const sp=await (await p.$('#split')).boundingBox();await p.mouse.move(sp.x+sp.width/2,sp.y+5);await p.mouse.down();await p.mouse.move(sp.x+sp.width/2,sp.y-60,{steps:5});await p.mouse.up();
const after=await p.evaluate(()=>({n:V.length+'/'+A.length,first:media.get(V[0].mediaId).name,a2:A[1]&&A[1].start,tl:document.querySelector('.tl').getBoundingClientRect().height}));
await p.screenshot({path:'/tmp/claude-0/ed2.png'});console.log(before,JSON.stringify(after),errs);await b.close();})();
