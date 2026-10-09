const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader']}); const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true}); p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2000); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(5000);
console.log(await p.evaluate(()=>{ sel={k:'v',id:V[1].id}; openColorPage(); const r=s=>{const e=document.querySelector(s).getBoundingClientRect(); return [Math.round(e.width),Math.round(e.height),Math.round(e.top)];}; return {wrap:r('.cp-vwrap'), cv:r('.cp-cv'), view:r('.cp-view'), main:r('.cp-main'), page:r('.cpage')}; }));
console.log(await p.evaluate(()=>{ cp.tab='hcurves'; try { renderCP(); return 'ok'; } catch(e){ return e.message+e.stack; } }));
await b.close();})();
