const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:412,height:892},deviceScaleFactor:2,isMobile:true,hasTouch:true});const p=await ctx.newPage();
await p.goto('http://127.0.0.1:47865/');await p.waitForTimeout(4000);
const r=await p.evaluate(()=>{const e=document.querySelector('.trow[data-track=t1] .tcontent, .tcontent.text');const b=e.getBoundingClientRect();return [b.x,b.y,b.width,b.height,e.className];}); console.log(r);
await p.evaluate(()=>{window.__ev=[];['pointerdown','pointerup','pointercancel'].forEach(n=>window.addEventListener(n,e=>__ev.push(n+':'+e.pointerType+':'+e.target.className),true));});
// find empty spot in a text row (between clips): use far right end of the timeline after scrolling
await p.evaluate(()=>{scroller.scrollLeft=0});
const pt=await p.evaluate(()=>{for(const row of document.querySelectorAll('.tcontent')){const b=row.getBoundingClientRect();for(let x=b.left+5;x<innerWidth-5;x+=7){const el=document.elementFromPoint(x,b.top+b.height/2);if(el===row)return [x,b.top+b.height/2,row.className];}}return null;});
console.log('pt',pt); await p.touchscreen.tap(pt[0],pt[1]); await p.waitForTimeout(200);
console.log(await p.evaluate(()=>[__ev,t.toFixed(2)]));
await b.close();})();
