const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader']}); const p=await b.newPage({viewport:{width:1500,height:900}}); p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2000); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(5000);
await p.evaluate(()=>{ sel={k:'v',id:V[1].id}; openColorPage(); });
await p.waitForTimeout(300);
console.log(await p.evaluate(()=>document.activeElement.tagName+'.'+document.activeElement.className));
await p.keyboard.press('Escape'); console.log('after esc', await p.evaluate(()=>cp.open));
await b.close();})();
