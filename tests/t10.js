const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1600,height:950}});const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('http://localhost:8771/index.html');await p.waitForTimeout(6000);
await p.click('#magBtn');
const cl2=await p.$$('#grid .trow[data-track="v"] .clip');const b2=await cl2[1].boundingBox();
const info=await p.evaluate(([x,y])=>{const el=document.elementFromPoint(x,y);return {mag:magnetOn,el:el.className,id:el.closest('.clip')?.dataset.id}},[b2.x+b2.width/2,b2.y+30]);
await p.mouse.move(b2.x+b2.width/2,b2.y+30);await p.mouse.down();await p.mouse.move(b2.x+b2.width/2+10,b2.y+30);await p.mouse.move(b2.x+b2.width/2+40,b2.y+30,{steps:5});await p.mouse.up();
const r=await p.evaluate(()=>V.slice(0,3).map(c=>[c.id,c.gap||0]));
console.log(JSON.stringify({info,r}),errs);await b.close();})();
