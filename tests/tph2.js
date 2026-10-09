const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();
async function page(w,h){const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await ctx.addInitScript(()=>{window.VINCutAndroid={version:()=>"1.0",begin:()=>"j",append:()=>true,finish:()=>"Download/VINCut/x",persistUrl:()=>""};try{localStorage.clear()}catch(e){}});
 const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message)); await p.goto('http://127.0.0.1:47865/'); await p.waitForTimeout(5500); return p;}
const p=await page(412,892);
await p.screenshot({path:'/tmp/claude-0/m_port.png'});
console.log('port', await p.evaluate(()=>({phone:document.body.classList.contains('phone'),sh:document.documentElement.scrollHeight,ih:innerHeight, tl:document.querySelector('.tl').getBoundingClientRect().height|0, cv:document.querySelector('#pv').getBoundingClientRect().height|0})));
// open library sheet, long-press drag an item onto the top edge of main video track via CDP touch
await p.tap('.mtabs button[data-sheet=lib]'); await p.waitForTimeout(400); await p.screenshot({path:'/tmp/claude-0/m_lib.png'});
const cdp=await p.context().newCDPSession(p);
const it=await p.evaluate(()=>{const e=[...document.querySelectorAll('.mitem:not(.audio)')].find(x=>{const r=x.getBoundingClientRect();return r.top>0&&r.bottom<innerHeight-60;});const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}); const before=await p.evaluate(()=>tracks.length);
const sx=it.x+it.width/2, sy=it.y+it.height/2;
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy}]}); await p.waitForTimeout(350);
const steps=14; let tx=0,ty=0;
for(let i=1;i<=steps;i++){ // aim at the main video row top edge (computed after sheet hides)
  if(i===3){ await p.waitForTimeout(300); const r=await p.evaluate(()=>{const e=document.querySelector('.tcontent.video').getBoundingClientRect();return [e.left+e.width*0.5,e.top+4];}); tx=r[0]; ty=r[1]; }
  const x= i<3? sx : sx+(tx-sx)*(i-2)/(steps-2), y= i<3? sy+8*i : sy+(ty-sy)*(i-2)/(steps-2);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]}); await p.waitForTimeout(40);}
console.log('during', await p.evaluate(()=>({card:!!document.querySelector('.dragcard'), dragout:document.body.classList.contains('dragout'), ind:!!document.querySelector('.newtrk')})));
await p.screenshot({path:'/tmp/claude-0/m_drag.png'});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await p.waitForTimeout(500);
console.log('after drop', await p.evaluate(b=>({tracks:tracks.length-b, ov:C.filter(c=>c.type==='video').length, libOpen:document.querySelector('#libPanel').classList.contains('open')}),before));
// tap empty timeline area to seek
const vr=await (await p.$('.tcontent.ovl')).boundingBox(); await p.touchscreen.tap(vr.x+60, vr.y+vr.height-8); console.log('t after tap', await p.evaluate(()=>t.toFixed(2)));
await p.tap('.mtabs button[data-sheet=ai]'); await p.waitForTimeout(400); await p.screenshot({path:'/tmp/claude-0/m_ai.png'});
await p.tap('.mtabs button[data-sheet=ai]'); await p.tap('#moreBtn'); await p.waitForTimeout(200); await p.screenshot({path:'/tmp/claude-0/m_more.png'}); await p.keyboard.press('Escape');
console.log(p.errs);
const q=await page(892,412); await q.screenshot({path:'/tmp/claude-0/m_land.png'});
await q.tap('.mtabs button[data-sheet=insp]'); await q.waitForTimeout(400); await q.screenshot({path:'/tmp/claude-0/m_land_insp.png'});
console.log('land', await q.evaluate(()=>({land:document.body.classList.contains('land'),sh:document.documentElement.scrollHeight})), q.errs);
const t=await page(800,1280); await t.screenshot({path:'/tmp/claude-0/m_tab.png'});
await b.close();})();
