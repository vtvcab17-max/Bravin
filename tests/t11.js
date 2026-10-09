const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1600,height:950}});const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('http://localhost:8771/index.html');await p.waitForTimeout(6000);
const r=await p.evaluate(()=>{addTrack('overlay');renderAll();appendMedia(media.get('m_h25'),null,{overlay:tracks[0].id,start:1});const d=document.querySelector('.clip.ov');const r=d.getBoundingClientRect();return {par:d.parentElement.className, op:d.offsetParent&&d.offsetParent.className, rect:[r.x,r.y,r.width,r.height], scrollY:document.scrollingElement.scrollTop, appScroll:document.querySelector('.app').scrollTop}});
console.log(JSON.stringify(r),errs);await b.close();})();
