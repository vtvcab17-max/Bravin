const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader']}); const errs=[]; const p=await b.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true}); p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(5000);
await p.evaluate(()=>openFlow()); await p.waitForTimeout(500); await p.screenshot({path:'/tmp/claude-0/mob_flow.png'});
await p.evaluate(()=>{closeFlow(); sel={k:'v',id:V[1].id}; openColorPage();}); await p.waitForTimeout(800); await p.screenshot({path:'/tmp/claude-0/mob_cp.png'});
console.log(errs); await b.close();})();
