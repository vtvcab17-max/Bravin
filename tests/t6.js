const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('http://localhost:8771/index.html');await p.waitForTimeout(8000);
await p.evaluate(()=>seek(1.6));await p.waitForTimeout(900);await p.screenshot({path:'/tmp/claude-0/s1.png'});
await p.evaluate(()=>seek(76.9));await p.waitForTimeout(900);await p.screenshot({path:'/tmp/claude-0/s2.png'});
await p.evaluate(()=>seek(215));await p.waitForTimeout(900);await p.screenshot({path:'/tmp/claude-0/s3.png'});
const w=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth}));
const pm=await b.newPage({viewport:{width:400,height:860}});await pm.goto('http://localhost:8771/index.html');await pm.waitForTimeout(6000);const wm=await pm.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth}));
console.log(JSON.stringify({w,wm}),errs);await b.close();})();
