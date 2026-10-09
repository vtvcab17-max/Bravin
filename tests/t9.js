const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1600,height:950}});const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('http://localhost:8771/index.html');await p.waitForTimeout(7000);
const R={};
R.total0=await p.evaluate(()=>total());
// freeze at 10s
R.freeze=await p.evaluate(()=>{seek(10);const n=V.length;const txt=C.find(c=>c.track==='tcap'&&c.start>12).start;freezeFrame(3);return {added:V.length-n,total:total(),txtShift:C.find(c=>c.track==='tcap'&&Math.abs(c.start-(txt+3))<1e-6)!=null}});
await p.keyboard.press('Control+z');
// delete left/right
R.delL=await p.evaluate(()=>{seek(20.5);const h=vAt(20.5);const L=vlen(h.c);deleteSide('left');const c=V.find(x=>x.id===h.c.id);return {before:L,after:vlen(c)}});
R.marker=await p.evaluate(()=>{seek(33);toggleMarker();return markers});
// blade via UI
await p.keyboard.press('b');
const cl=await p.$$('#grid .trow[data-track="v"] .clip');const bb=await cl[3].boundingBox();
const n0=await p.evaluate(()=>V.length);await p.mouse.click(bb.x+bb.width/2,bb.y+20);R.blade=(await p.evaluate(()=>V.length))-n0;
await p.keyboard.press('a');
// add overlay track and overlay clip via drag
await p.evaluate(()=>{addTrack('overlay');renderAll();});
await p.evaluate(()=>appendMedia(media.get('m_h25'),null,{overlay:tracksOf('overlay')[0].id,start:0.6}));
R.overlay=await p.evaluate(()=>C.filter(c=>c.type==='video').map(c=>[c.track,c.mediaId,+c.start.toFixed(2)]));
// set transform on overlay: PiP
await p.evaluate(()=>{const c=C.find(c=>c.type==='video');c.scale=0.4;c.x=0.25;c.y=-0.25;c.opacity=0.9;sel={k:'c',id:c.id};seek(c.start+0.5);renderAll();});
await p.waitForTimeout(900);
// flip+rotate main clip at playhead
await p.evaluate(()=>{sel=null;}); await p.click('#flipBtn'); await p.waitForTimeout(500);
await p.screenshot({path:'/tmp/claude-0/cap1.png'});
// magnet off + drag a v clip right creates gap
await p.click('#magBtn');
const cl2=await p.$$('#grid .trow[data-track="v"] .clip');const b2=await cl2[1].boundingBox();
await p.mouse.move(b2.x+b2.width/2,b2.y+30);await p.mouse.down();await p.mouse.move(b2.x+b2.width/2-0,b2.y+30);await p.mouse.move(b2.x+b2.width/2+40,b2.y+30,{steps:5});await p.mouse.up();
R.gap=await p.evaluate(()=>V.slice(0,3).map(c=>c.gap||0));
await p.click('#magBtn'); R.gapAfter=await p.evaluate(()=>V.slice(0,3).map(c=>c.gap||0));
// track menu
await p.click('#grid .trow[data-track="tbg"] .thead .tb:nth-of-type(3)');await p.waitForTimeout(200);R.menu=await p.$$eval('.menu button',bs=>bs.map(b=>b.textContent));await p.keyboard.press('Escape');
// zoom fit
await p.click('#zoomFit');R.pps=await p.evaluate(()=>pps);
await p.screenshot({path:'/tmp/claude-0/cap2.png'});
console.log(JSON.stringify(R,null,1),errs);await b.close();})();
