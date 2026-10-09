const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader']}); const errs=[]; const p=await b.newPage({viewport:{width:1600,height:1000}}); p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.text().startsWith('DBG')) console.log(m.text()); });
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2000); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(5000);
const pos=await p.evaluate(()=>{const ds=[...document.querySelectorAll('.clip[data-k="c"]')].filter(d=>{const r=d.getBoundingClientRect(); return r.width>80 && r.right<innerWidth-20 && r.bottom<innerHeight-10;}); const r=ds[0].getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,id:ds[0].dataset.id};});
console.log(pos);
await p.mouse.click(pos.x,pos.y); await p.waitForTimeout(100); await p.mouse.click(pos.x,pos.y); await p.waitForTimeout(300);
await p.waitForTimeout(400); console.log('irn', !!(await p.$('.irn')), await p.evaluate(()=>document.activeElement.className)); await p.keyboard.press('Control+a'); await p.keyboard.type('Tên mới'); await p.keyboard.press('Enter'); await p.waitForTimeout(200); console.log('name', await p.evaluate(()=>C.find(c=>c.id==='c1').name));
await p.keyboard.press('Escape');
// group drag test: select 2 clips by ctrl click
const two=await p.evaluate(()=>{const ds=[...document.querySelectorAll('.clip[data-k="c"]')].filter(d=>{const r=d.getBoundingClientRect(); return r.width>60 && r.right<innerWidth-20 && r.bottom<innerHeight-10;}).slice(0,2); return ds.map(d=>{const r=d.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,id:d.dataset.id};});});
await p.mouse.click(two[0].x,two[0].y); await p.keyboard.down('Control'); await p.mouse.click(two[1].x,two[1].y); await p.keyboard.up('Control'); await p.waitForTimeout(200);
console.log('msel', await p.evaluate(()=>[...msel]));
const s0=await p.evaluate(ids=>ids.map(id=>clipById(id).c.start), two.map(x=>x.id));
await p.mouse.move(two[0].x,two[0].y); await p.mouse.down(); await p.mouse.move(two[0].x+80,two[0].y,{steps:6}); await p.mouse.up(); await p.waitForTimeout(300);
console.log('move', s0, await p.evaluate(ids=>ids.map(id=>clipById(id).c.start), two.map(x=>x.id)));
console.log(errs); await b.close();})();
