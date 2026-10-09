const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:412,height:892},isMobile:true,hasTouch:true});const p=await ctx.newPage();
await p.goto('http://127.0.0.1:47865/');await p.waitForTimeout(3000);
console.log(await p.evaluate(()=>{const a=document.querySelector('.app');const cs=getComputedStyle(a);return {rows:cs.gridTemplateRows, kids:[...a.children].map(k=>k.className+':'+(k.getBoundingClientRect().height|0)+':'+getComputedStyle(k).gridRowStart), h:a.getBoundingClientRect().height}}));
await b.close();})();
