const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('http://localhost:8771/index.html');await p.waitForTimeout(7000);
const clipAt30=await p.evaluate(()=>{const st=vStarts();const i=V.findIndex((c,k)=>30>=st[k]&&30<st[k]+vlen(c));return V[i].id});
const musicId=await p.evaluate(()=>C.find(c=>c.track==='music').id);
await p.evaluate(([cid,mid])=>{AIS.local=[newStep('lmstudio',{name:'Mock lập kế hoạch',base:'http://localhost:8799/v1',model:'mock-plan',role:'think',skill:'Lập kế hoạch'}),newStep('lmstudio',{name:'Mock thao tác',base:'http://localhost:8799/v1',model:'mock-act',role:'act',skill:'Thao tác'})];setMode('local');},[clipAt30,musicId]);
// open settings to screenshot
await p.click('#aiCfgBtn');await p.waitForTimeout(300);await p.click('.aisec.local .aicard .test');await p.waitForTimeout(800);await p.screenshot({path:'/tmp/claude-0/cfg.png'});
const testRes=await p.$eval('.aisec.local .aicard .res',e=>e.textContent);
await p.click('#cfgDone');
// patch mock op ids: replace music clip id placeholder via evaluate after
await p.fill('#aiIn','Thay cảnh ở giây 30 bằng HN tư vấn máy tính, nhạc nhỏ 4 dB');await p.keyboard.press('Enter');
await p.waitForTimeout(9000);await p.screenshot({path:'/tmp/claude-0/chain.png'});
const after=await p.evaluate((cid)=>{const c=V.find(x=>x.id===cid);return {media:c.mediaId,in:c.in,log:[...document.querySelectorAll('.msg,.steps div')].map(e=>e.textContent.slice(0,90))}},clipAt30);
console.log(JSON.stringify({clipAt30,musicId,testRes,after},null,1),errs);await b.close();})();
