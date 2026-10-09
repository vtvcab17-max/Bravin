const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto('http://localhost:8771/index.html');await p.waitForTimeout(7000);
const r=await p.evaluate(async()=>{seek(1.6);await new Promise(r=>setTimeout(r,1500));const a=activeVideo(t);const m=media.get(a.c.mediaId);const el=getEl(m,a.i%2);return {src:el.currentSrc,rs:el.readyState,vw:el.videoWidth,ct:el.currentTime,err:el.error&&el.error.code,net:el.networkState}});
console.log(JSON.stringify(r));await b.close();})();
