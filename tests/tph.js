const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();
for (const [w,h,n] of [[915,412,'land'],[412,915,'port'],[1280,800,'tab']]) {
 const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:true,hasTouch:true});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8771/index.html');await p.waitForTimeout(4500);await p.screenshot({path:`/tmp/claude-0/ph_${n}.png`});
 console.log(n, await p.evaluate(()=>({sw:document.documentElement.scrollWidth, sh:document.documentElement.scrollHeight, vw:innerWidth, vh:innerHeight})), errs); await p.close();}
await b.close();})();
