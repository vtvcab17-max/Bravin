const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{window.claude={use:async()=>{throw new Error('x')}};});
await p.goto('http://localhost:8772/index.html');await p.waitForTimeout(2500);
await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(5000);
await p.evaluate(()=>openAutoCaptions()); console.log('toast', await p.evaluate(()=>document.querySelector('.toast')?.textContent.slice(0,60)), 'dialog', await p.evaluate(()=>!!document.querySelector('#acGo')));
await p.evaluate(()=>{sel={k:'v',id:V[3].id}; inspTabs.video='key'; renderInspector();}); console.log('note', await p.evaluate(()=>[...document.querySelectorAll('#insp .note')].map(n=>n.textContent.slice(0,50))));
console.log('tabs rows', await p.evaluate(()=>document.querySelector('#ltabs').getBoundingClientRect().height));
console.log(errs); await b.close();})();
