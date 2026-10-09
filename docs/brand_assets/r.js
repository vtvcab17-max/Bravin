const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1024,height:1024}});
for (const n of ['icon','maskable']) { await p.setContent(`<html><body style="margin:0;background:transparent">${fs.readFileSync(n+'.svg','utf8')}</body></html>`); await (await p.$('svg')).screenshot({path:n+'1024.png', omitBackground:true}); }
await b.close();})();
