const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch(); const p=await b.newPage(); p.on('pageerror',e=>console.log('ERR',e.message, (e.stack||'').split('\n').slice(0,2).join(' | ')));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2000); console.log(await p.evaluate(()=>typeof addShape)); await b.close();})();
