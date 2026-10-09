const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const p=await b.newPage({viewport:{width:1400,height:860}});
const errs=[];p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8766/index.html');await p.waitForTimeout(6000);
const n=await p.evaluate(()=>({v:document.querySelectorAll('#vtrack .clip').length,a:document.querySelectorAll('#atrack .clip').length,bin:document.querySelectorAll('.mitem').length}));
// select 2nd clip and drag right handle left
const c=await p.$$('#vtrack .clip');await c[1].click();await p.waitForTimeout(300);
const h=await (await p.$$('#vtrack .clip'))[1].$('.h.r');const bb=await h.boundingBox();
await p.mouse.move(bb.x+5,bb.y+10);await p.mouse.down();await p.mouse.move(bb.x-40,bb.y+10,{steps:5});await p.mouse.up();
// reorder: drag first clip to end
const f=(await p.$$('#vtrack .clip'))[0];const fb=await f.boundingBox();await p.mouse.move(fb.x+fb.width/2,fb.y+20);await p.mouse.down();await p.mouse.move(fb.x+fb.width*3.6,fb.y+20,{steps:8});await p.mouse.up();
await p.keyboard.press('Space');await p.waitForTimeout(1500);await p.keyboard.press('Space');
await p.keyboard.press('s');
const n2=await p.evaluate(()=>({v:[...document.querySelectorAll('#vtrack .clip .cl')].map(e=>e.textContent),tc:document.querySelector('#tc').textContent}));
await p.screenshot({path:'/tmp/claude-0/ed.png'});
const pm=await b.newPage({viewport:{width:400,height:860}});await pm.goto('http://localhost:8766/index.html');await pm.waitForTimeout(4000);await pm.screenshot({path:'/tmp/claude-0/edm.png',fullPage:false});
console.log(JSON.stringify({n,n2,errs, hscroll: await pm.evaluate(()=>document.documentElement.scrollWidth>innerWidth)}));await b.close();})();
