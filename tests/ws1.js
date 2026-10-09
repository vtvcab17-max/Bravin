const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl']}); const errs=[]; const p=await b.newPage({viewport:{width:1600,height:1000}}); p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500);
const out={};
// home card rename by dblclick
const hb=await p.$('.hcard.proj b');
if (hb){ await hb.dblclick(); await p.waitForTimeout(200); out.homeInput=!!(await p.$('.hcard.proj .irn')); await p.keyboard.press('Control+a'); await p.keyboard.type('Dự án đổi tên'); await p.keyboard.press('Enter'); await p.waitForTimeout(500); out.homeName=await p.evaluate(()=>document.querySelector('.hcard.proj b').textContent); out.stillHome=await p.evaluate(()=>document.body.classList.contains('athome')); }
await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(5000);
// badge rename
await p.dblclick('#projBadge'); await p.keyboard.press('Control+a'); await p.keyboard.type('Bravin test'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
out.badge=await p.evaluate(()=>[projName, document.querySelector('#projBadge').textContent]);
// clip rename via dblclick on label
const cpos=await p.evaluate(()=>{const ds=[...document.querySelectorAll('.clip[data-k="c"]')].sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width); const r=ds[0].getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};}); await p.mouse.dblclick(cpos.x,cpos.y); await p.waitForTimeout(150); out.clipInput=!!(await p.$('.clip .irn')); await p.keyboard.press('Control+a'); await p.keyboard.type('Clip mới'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
out.clipName=await p.evaluate(()=>C.filter(c=>c.name).map(c=>c.name));
// media rename
const mn=await p.$('.mitem .mname'); if (mn){ await mn.dblclick(); await p.keyboard.press('Control+a'); await p.keyboard.type('Cảnh A'); await p.keyboard.press('Enter'); await p.waitForTimeout(200); out.media=await p.evaluate(()=>[...media.values()].some(m=>m.name==='Cảnh A')); }
// marquee select on empty area of text tracks
const area=await p.evaluate(()=>{const ct=document.querySelector('.tcontent.text'); const r=ct.getBoundingClientRect(); const rows=[...document.querySelectorAll('.tcontent')].map(x=>x.getBoundingClientRect()); return {x:r.left+600, y:r.top+4, y2:rows[rows.length-1].bottom-4};});
await p.mouse.move(area.x+700, area.y); await p.mouse.down(); await p.mouse.move(area.x-400, area.y2,{steps:6}); await p.mouse.up(); await p.waitForTimeout(300);
out.msel=await p.evaluate(()=>[msel.size, document.querySelectorAll('.clip.msel').length]);
// group drag
const st0=await p.evaluate(()=>selectedClips().filter(f=>f.k==='c').map(f=>f.c.start).slice(0,3));
const anyC=await p.evaluate(()=>{const id=[...msel].find(id=>clipById(id).k==='c'); const r=document.querySelector(`.clip[data-id="${id}"]`).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};});
await p.mouse.move(anyC.x,anyC.y); await p.mouse.down(); await p.mouse.move(anyC.x+60,anyC.y,{steps:5}); await p.mouse.up(); await p.waitForTimeout(300);
out.groupMove=[st0, await p.evaluate(()=>selectedClips().filter(f=>f.k==='c').map(f=>f.c.start).slice(0,3))];
// context menu multi
await p.mouse.click(anyC.x+60, anyC.y, {button:'right'}); await p.waitForTimeout(200); out.multiMenu=await p.evaluate(()=>document.querySelector('.menu .mh')?.textContent);
await p.screenshot({path:'/tmp/claude-0/ws_multi.png'}); await p.evaluate(()=>closeMenu());
// delete many
const n0=await p.evaluate(()=>V.length+C.length); const k=await p.evaluate(()=>selectedClips().length); await p.evaluate(()=>document.activeElement.blur()); await p.keyboard.press('Delete'); out.del=[k, n0-await p.evaluate(()=>V.length+C.length)];
await p.keyboard.press('Control+z');
// single clip context menu
await p.evaluate(()=>{clearMsel(); scroller.scrollLeft=0; renderTimeline();}); const v1=await p.evaluate(()=>{const r=[...document.querySelectorAll(`.clip[data-k="v"]`)].find(d=>d.getBoundingClientRect().left>200).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2+10};});
await p.mouse.click(v1.x, v1.y, {button:'right'}); await p.waitForTimeout(200); out.clipMenu=await p.evaluate(()=>[document.querySelectorAll('.menu button').length, document.querySelector('.menu .mh')?.textContent]); await p.screenshot({path:'/tmp/claude-0/ws_clipmenu.png'}); await p.evaluate(()=>closeMenu());
// empty area & ruler menus
await p.mouse.click(area.x+300, area.y2-6, {button:'right'}); await p.waitForTimeout(150); out.emptyMenu=await p.evaluate(()=>document.querySelector('.menu .mh')?.textContent); await p.evaluate(()=>closeMenu());
const rr=await p.evaluate(()=>{const r=document.querySelector('.ruler').getBoundingClientRect(); return {x:r.x+300,y:r.y+8};}); await p.mouse.click(rr.x,rr.y,{button:'right'}); await p.waitForTimeout(150); out.rulerMenu=await p.evaluate(()=>document.querySelector('.menu .mh')?.textContent); await p.evaluate(()=>closeMenu());
// preview context menu
const pv=await p.evaluate(()=>{const r=document.querySelector('#pvSel').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};}); await p.mouse.click(pv.x,pv.y,{button:'right'}); await p.waitForTimeout(150); out.pvMenu=await p.evaluate(()=>document.querySelectorAll('.menu button').length); await p.evaluate(()=>closeMenu());
// splitter click → menu; drag → resize
const sp=await p.evaluate(()=>{const r=document.querySelector('.vsplit.l').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};});
await p.mouse.click(sp.x, sp.y); await p.waitForTimeout(150); out.edgeMenu=await p.evaluate(()=>document.querySelector('.menu .mh')?.textContent); await p.screenshot({path:'/tmp/claude-0/ws_edge.png'});
await p.evaluate(()=>{ [...document.querySelectorAll('.menu button')].find(b=>b.textContent.startsWith('Thu gọn')).click(); }); await p.waitForTimeout(400);
out.collapsed=await p.evaluate(()=>[document.body.classList.contains('lcol'), getComputedStyle(document.querySelector('#libPanel')).display, !!document.querySelector('.reopen.l')&&getComputedStyle(document.querySelector('.reopen.l')).display]);
await p.click('.reopen.l'); await p.waitForTimeout(300);
const sp2=await p.evaluate(()=>{const r=document.querySelector('.vsplit.r').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};}); const w0=await p.evaluate(()=>document.querySelector('#sidePanel').getBoundingClientRect().width);
await p.mouse.move(sp2.x,sp2.y); await p.mouse.down(); await p.mouse.move(sp2.x-150,sp2.y,{steps:5}); await p.mouse.up(); await p.waitForTimeout(300);
out.resize=[Math.round(w0), Math.round(await p.evaluate(()=>document.querySelector('#sidePanel').getBoundingClientRect().width))];
// screens dialog
await p.evaluate(()=>openScreens()); await p.waitForTimeout(400); out.screens=await p.evaluate(()=>document.querySelector('#scT') && document.querySelector('.dialog p').textContent); await p.screenshot({path:'/tmp/claude-0/ws_screens.png'});
await p.evaluate(()=>document.querySelectorAll('.overlay').forEach(o=>o.remove()));
// auto layout on resize
await p.setViewportSize({width:2400,height:1300}); await p.evaluate(()=>{layout.auto=true; autoLayout();}); await p.waitForTimeout(400); out.auto2400=await p.evaluate(()=>[Math.round(document.querySelector('#libPanel').getBoundingClientRect().width), Math.round(document.querySelector('#sidePanel').getBoundingClientRect().width)]);
await p.screenshot({path:'/tmp/claude-0/ws_2400.png'});
console.log(JSON.stringify(out,null,0)); console.log(errs); await b.close();})();
