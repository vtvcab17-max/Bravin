const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl']}); const errs=[]; const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true}); p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(6000);
await p.screenshot({path:'/tmp/claude-0/ph_main.png'});
await p.evaluate(()=>{const c=V[1]; sel={k:'v',id:c.id}; inspTabs.video='color'; renderAll(); openSheet('insp');}); await p.waitForTimeout(500); await p.screenshot({path:'/tmp/claude-0/ph_color.png'});
console.log(errs); await b.close();})();
