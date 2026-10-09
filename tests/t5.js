const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8770/index.html');await p.waitForTimeout(9000);
const s1=await p.evaluate(()=>({V:V.length,C:C.length,tracks:tracks.length,bin:document.querySelectorAll('.mitem').length,clips:document.querySelectorAll('.clip').length,buf:[...media.values()].filter(m=>m.buf).length,total:total()}));
await p.evaluate(()=>seek(1.6));await p.waitForTimeout(800);await p.screenshot({path:'/tmp/claude-0/s_hook.png'});
// replace: seek to 30 and find clip there
const info=await p.evaluate(()=>{seek(30);const st=vStarts();const i=V.findIndex((c,k)=>30>=st[k]&&30<st[k]+vlen(c));ensureVisibleTime(30);return {id:V[i].id,old:V[i].mediaId,len:vlen(V[i])}});
await p.waitForTimeout(300);
const cb=await (await p.$(`.clip[data-id="${info.id}"]`)).boundingBox();
const item=await p.$('.mitem[data-mid="m_h21"]');await item.scrollIntoViewIfNeeded();const ib=await item.boundingBox();
await p.mouse.move(ib.x+40,ib.y+50);await p.mouse.down();await p.mouse.move(ib.x+90,ib.y+120,{steps:4});await p.mouse.move(cb.x+cb.width/2,cb.y+cb.height/2,{steps:12});
await p.waitForTimeout(200);await p.screenshot({path:'/tmp/claude-0/s_rep.png'});await p.mouse.up();await p.waitForTimeout(1200);
const dlg=await p.$('#trWin');let r2=null;
if(dlg){const wb=await dlg.boundingBox();await p.mouse.move(wb.x+wb.width/2,wb.y+wb.height/2);await p.mouse.down();await p.mouse.move(wb.x+wb.width/2+200,wb.y+wb.height/2,{steps:6});await p.mouse.up();await p.waitForTimeout(600);await p.screenshot({path:'/tmp/claude-0/s_trim.png'});await p.click('#trOk');await p.waitForTimeout(400);}
r2=await p.evaluate((id)=>{const c=V.find(x=>x.id===id);return {media:c.mediaId,in:c.in,len:vlen(c),total:total()}},info.id);
// play 2 s
await p.evaluate(()=>{seek(10);play()});await p.waitForTimeout(2200);const tp=await p.evaluate(()=>{const x=t;pause();return x});
// text edit: select caption at 50s
await p.evaluate(()=>{const c=C.find(c=>c.track==='tcap'&&50>=c.start&&50<cend(c));sel={k:'c',id:c.id};seek(50.2);renderInspector();showTab('insp')});
await p.fill('#iL1','Thử sửa phụ đề');await p.waitForTimeout(300);await p.screenshot({path:'/tmp/claude-0/s_text.png'});
console.log(JSON.stringify({s1,info,dialog:!!dlg,r2,tp}),errs.slice(0,8));await b.close();})();
