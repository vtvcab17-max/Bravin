const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:412,height:892},isMobile:true,hasTouch:true});const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PE',e.message,(e.stack||'').split('\n').slice(0,3).join(' | ')));
await p.goto('http://localhost:8772/index.html');await p.waitForTimeout(2500);
console.log(await p.evaluate(()=>({cls:document.body.className, w:innerWidth})));
await b.close();})();
