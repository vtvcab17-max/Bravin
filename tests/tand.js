const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:915,height:412},deviceScaleFactor:2,isMobile:true,hasTouch:true});
await ctx.addInitScript(()=>{ const jobs={}; let n=0; window.__saved=[];
  window.VINCutAndroid={ version:()=>"1.0", begin:(name,mime)=>{const id='j'+(++n); jobs[id]={name,mime,parts:[]}; return id;},
    append:(id,b64)=>{jobs[id].parts.push(b64); return true;}, finish:(id)=>{const j=jobs[id]; const bin=j.parts.map(p=>atob(p)).join(''); window.__saved.push({name:j.name,mime:j.mime,size:bin.length,head:bin.slice(0,60)}); return 'Download/VINCut/'+j.name;},
    persistUrl:(name)=> name.startsWith('Clip') ? '/u/'+encodeURIComponent(name) : '' }; });
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://127.0.0.1:47865/');await p.waitForTimeout(6000);
console.log('fonts', await p.evaluate(()=>[document.fonts.check('800 20px Montserrat'),document.fonts.check('italic 700 20px "Playfair Display"'), [...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family+' '+f.style).join(',')]));
console.log('restorebar(first run)', await p.evaluate(()=>!!document.querySelector('.restorebar')));
await p.evaluate(()=>seek(30)); await p.waitForTimeout(2500); await p.evaluate(()=>drawFrame());
console.log('frame@30s', await p.evaluate(()=>{const c=document.querySelector('canvas');const g=c.getContext('2d');const d=g.getImageData(0,0,c.width,c.height).data;let s=0;for(let i=0;i<d.length;i+=4000)s+=d[i]+d[i+1]+d[i+2];return {w:c.width,avg:s/(d.length/4000)/3|0};}));
await p.screenshot({path:'/tmp/claude-0/and_land.png'});
// import a "phone" file
await p.setInputFiles('#file', {name:'Clip điện thoại.webm', mimeType:'video/webm', buffer: fs.readFileSync('/tmp/claude-0/jvm/phone/Clip điện thoại.webm')});
await p.waitForTimeout(5000);
const mi=await p.evaluate(()=>{const m=[...media.values()].find(x=>x.name.startsWith('Clip'));return m&&{id:m.id,persist:m.persist,dur:m.duration};}); console.log('imported',mi);
await p.evaluate(id=>{appendMedia(media.get(id), 2);}, mi.id); 
// save project via bridge
await p.click('#saveProj'); await p.waitForTimeout(1500);
console.log('saved', JSON.stringify(await p.evaluate(()=>window.__saved.map(s=>({name:s.name,size:s.size,head:s.head.slice(0,30)})))));
const pj=JSON.parse(await p.evaluate(()=>projectJSON())); console.log('persist in json', pj.media.filter(m=>m.user).map(m=>[m.name,m.file]));
// big blob via saver chunking
console.log('bigsave', await p.evaluate(async()=>{const s=await getSaver(); const big=new Uint8Array(3*1024*1024+77).map((_,i)=>i%251); const r=await s.save({filename:'big.bin',data:new Blob([big])}); const last=window.__saved[window.__saved.length-1]; let ok=true; for(let i=0;i<last.head.length;i++) if(last.head.charCodeAt(i)!==i%251) ok=false; return [r.where,last.size,ok];}));
// autosave + restore after "app killed"
await p.waitForTimeout(9000); console.log('autosaved', await p.evaluate(()=>{const s=localStorage.getItem('vincut-autosave');return s&&JSON.parse(s).V.length;}));
await p.reload(); await p.waitForTimeout(6000);
console.log('restorebar', await p.evaluate(()=>document.querySelector('.restorebar')?.textContent));
await p.screenshot({path:'/tmp/claude-0/and_restore.png'});
await p.click('#rsYes'); await p.waitForTimeout(5000);
console.log('after restore', await p.evaluate(()=>{const m=[...media.values()].find(x=>x.name.startsWith('Clip'));return {V:V.length, clipInV: V.some(c=>c.mediaId===m?.id), missing:m?.missing, url:m?.url, hasStrip:!!m?.strip};}));
// portrait
await p.setViewportSize({width:412,height:915}); await p.waitForTimeout(800); await p.screenshot({path:'/tmp/claude-0/and_port.png'});
console.log(errs.filter(e=>!/TUNNEL|fonts.g/.test(e)));await b.close();})();
