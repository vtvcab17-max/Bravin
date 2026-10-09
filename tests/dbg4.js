const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:412,height:892},isMobile:true,hasTouch:true});const p=await ctx.newPage();
await p.goto('http://127.0.0.1:47865/');await p.waitForTimeout(3000);
console.log(await p.evaluate(()=>{const tl=document.querySelector('.tl');return [...tl.children].map(k=>k.className+':'+(k.getBoundingClientRect().height|0)).concat([...document.querySelector('.tlbar').children].slice(0,4).map(k=>k.tagName+'.'+k.className+':'+(k.getBoundingClientRect().height|0)), getComputedStyle(document.querySelector('.tlbar')).alignItems);}));
await b.close();})();
