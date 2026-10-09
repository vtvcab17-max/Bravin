const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader']}); const p=await b.newPage({viewport:{width:1600,height:1000}});
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(5000);
console.log(await p.evaluate(()=>{const c=V[1]; sel={k:'v',id:c.id}; inspTabs.video='motion'; showTab('insp'); renderAll(); const w=document.querySelector('.ecw'); if(!w) return 'none'; const r=w.getBoundingClientRect(); const cs=getComputedStyle(w); return {h:r.height,w:r.width,disp:cs.display,parent:w.parentElement.id, kids:w.children.length, lh:w.querySelector('.ec-left').getBoundingClientRect().height, insp:getComputedStyle(document.querySelector('#insp')).display, flex:cs.flex, minh:cs.minHeight, ov:cs.overflow};}));
await b.close();})();
