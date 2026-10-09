const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('console',m=>errs.push(m.type()+': '+m.text()));p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('http://localhost:8765/index.html');await p.waitForTimeout(12000);
console.log(JSON.stringify(await p.evaluate(()=>({v:document.querySelectorAll('#vtrack .clip').length,bin:document.querySelectorAll('.mitem').length}))),errs.slice(0,10));await b.close();})();
