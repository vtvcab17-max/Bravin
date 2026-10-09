const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl']}); const errs=[]; const p=await b.newPage({viewport:{width:1500,height:1000}}); p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(6000);
await p.evaluate(()=>{addEffect('twirl',1); const c=C[C.length-1]; inspTabs.fx='main'; showTab('insp'); renderAll(); seek(1.5);});
await p.waitForTimeout(500); await (await p.$('#sidePanel')).screenshot({path:'/tmp/claude-0/fx_panel.png'});
await p.evaluate(()=>{showAssets('fx');}); await p.waitForTimeout(300); await (await p.$('#libPanel')).screenshot({path:'/tmp/claude-0/fx_lib.png'});
console.log(errs); await b.close();})();
