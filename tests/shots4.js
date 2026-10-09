const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl']});
const p=await b.newPage({viewport:{width:1440,height:900}}); await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500);
await p.screenshot({path:'/tmp/claude-0/t4_home.png'});
await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(6000);
await p.evaluate(()=>{t=5.4; const c=V[3]; sel={k:'v',id:c.id}; inspTabs.video='base'; renderAll();}); await p.waitForTimeout(1200); await p.evaluate(()=>drawFrame());
await p.screenshot({path:'/tmp/claude-0/t4_editor.png'});
await b.close();})();
