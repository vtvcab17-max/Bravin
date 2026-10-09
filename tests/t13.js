const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1600,height:950}});const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8771/index.html');await p.waitForTimeout(6000);
const st=()=>p.evaluate(()=>({tracks:tracks.filter(t=>t.type!=='audio'&&t.type!=='text').map(t=>t.id+':'+t.name),ov:C.filter(c=>c.type==='video').map(c=>[c.track,c.start.toFixed(1)]),V:V.length}));
console.log('0',JSON.stringify(await st()));
async function dragLib(mid, x, y, shot){const item=await p.$(`.mitem[data-mid="${mid}"]`);await item.scrollIntoViewIfNeeded();const ib=await item.boundingBox();
 await p.mouse.move(ib.x+40,ib.y+30);await p.mouse.down();await p.mouse.move(ib.x+80,ib.y+60,{steps:3});await p.mouse.move(x,y,{steps:12});
 const ind=await p.evaluate(()=>!!document.querySelector('.newtrk'));if(shot)await p.screenshot({path:shot});await p.mouse.up();await p.waitForTimeout(300);return ind;}
const vb=await (await p.$('.tcontent.video')).boundingBox();
// 1) drop on top edge of main track → new track above
let ind=await dragLib('m_h25', vb.x+300, vb.y+4, '/tmp/claude-0/mt1.png');console.log('1 ind',ind,JSON.stringify(await st()));
// 2) drop on the same time on the new overlay track middle → overlap → another new track above
let ob=await (await p.$('.tcontent.ovl')).boundingBox();
ind=await dragLib('m_h26', ob.x+310, ob.y+ob.height/2, '/tmp/claude-0/mt2.png');console.log('2 ind',ind,JSON.stringify(await st()));
// 3) drop between the two overlay tracks (bottom edge of upper one)
ob=await (await p.$('.tcontent.ovl')).boundingBox();
ind=await dragLib('m_h27', ob.x+900, ob.y+ob.height-3, null);console.log('3 ind',ind,JSON.stringify(await st()));
// 4) drag a main clip upward onto a fresh top-edge → becomes overlay on new track
const clip=await p.$('.tcontent.video .clip:nth-child(6)');const cb=await clip.boundingBox();const top=await (await p.$('.tcontent.ovl')).boundingBox();
await p.mouse.move(cb.x+cb.width/2,cb.y+cb.height/2);await p.mouse.down();await p.mouse.move(cb.x+cb.width/2,cb.y-10,{steps:4});await p.mouse.move(cb.x+cb.width/2+20,top.y+3,{steps:8});await p.mouse.up();await p.waitForTimeout(300);
console.log('4',JSON.stringify(await st()));
// 5) drag that overlay clip down into main track
const oc=await p.$('.tcontent.ovl .clip');const ocb=await oc.boundingBox();
await p.mouse.move(ocb.x+ocb.width/2,ocb.y+ocb.height/2);await p.mouse.down();await p.mouse.move(ocb.x+ocb.width/2,ocb.y+30,{steps:3});const vb2=await (await p.$('.tcontent.video')).boundingBox();await p.mouse.move(vb2.x+400,vb2.y+vb2.height/2,{steps:10});await p.mouse.up();await p.waitForTimeout(300);
console.log('5',JSON.stringify(await st()));
await p.evaluate(()=>{t=C.find(c=>c.type==='video')?.start+0.5||0;drawFrame();});await p.screenshot({path:'/tmp/claude-0/mt3.png'});
// undo chain
for(let i=0;i<5;i++) await p.evaluate(()=>{$("#undoBtn").click()});console.log('undo',JSON.stringify(await st()));
console.log(errs);await b.close();})();
