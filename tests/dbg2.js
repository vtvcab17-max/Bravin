const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:412,height:892},deviceScaleFactor:2,isMobile:true,hasTouch:true});const p=await ctx.newPage();
await p.goto('http://127.0.0.1:47865/');await p.waitForTimeout(4000);
await p.evaluate(()=>{window.__ev=[];['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove'].forEach(n=>window.addEventListener(n,e=>{if(__ev.length<40)__ev.push(n+':'+(e.pointerType||'')+':'+e.target.tagName+'.'+(e.target.className||'').toString().slice(0,20)+':'+getComputedStyle(e.target.nodeType===1?e.target:document.body).touchAction+':'+e.cancelable)},true));});
await p.tap('.mtabs button[data-sheet=lib]'); await p.waitForTimeout(500);
const cdp=await ctx.newCDPSession(p);const it=await (await p.$('.mitem[data-mid="m_h25"]')).boundingBox();
await p.evaluate(()=>__ev.length=0);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:it.x+40,y:it.y+40}]}); await p.waitForTimeout(350);
for(let i=1;i<6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:it.x+40,y:it.y+40+15*i}]});await p.waitForTimeout(40);}
console.log(await p.evaluate(()=>[__ev, !!document.querySelector('.dragcard'), document.querySelector('.mitem.armed')?.dataset.mid]));
await b.close();})();
