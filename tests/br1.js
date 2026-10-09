const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader']}); const errs=[]; const p=await b.newPage({viewport:{width:1440,height:900}}); p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500); await p.screenshot({path:'/tmp/claude-0/br_home.png',clip:{x:0,y:0,width:720,height:300}});
await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(4000); await p.screenshot({path:'/tmp/claude-0/br_ed.png',clip:{x:0,y:0,width:720,height:80}});
console.log(await p.title(), errs); await b.close();})();
