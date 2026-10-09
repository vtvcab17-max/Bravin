const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});const ctx=await b.newContext({viewport:{width:412,height:892},deviceScaleFactor:2,isMobile:true,hasTouch:true});
await ctx.addInitScript(()=>{ const jobs={}; let n=0; window.__saved=[];
  window.VINCutAndroid={ version:()=>"3.0", begin:(name,mime)=>{const id='j'+(++n); jobs[id]={name,mime,parts:[]}; return id;}, append:(id,b64)=>{jobs[id].parts.push(atob(b64)); return true;},
    beginRandom:(name,mime)=>{const id='r'+(++n); jobs[id]={name,mime,buf:new Uint8Array(0)}; return id;},
    writeAt:(id,pos,b64)=>{const j=jobs[id]; const d=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)); if(pos+d.length>j.buf.length){const nb=new Uint8Array(pos+d.length); nb.set(j.buf); j.buf=nb;} j.buf.set(d,pos); return true;},
    finish:(id)=>{const j=jobs[id]; window.__saved.push({name:j.name, size: j.buf? j.buf.length : j.parts.join('').length}); if(j.buf) window.__lastMp4=j.buf; return 'Download/VINCut/'+j.name;},
    persistUrl:()=>"" };
  delete window.showSaveFilePicker; });
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push('PE '+e.message)); p.on('console',m=>{if(m.type()==='error'&&!/TUNNEL|GL Driver/.test(m.text()))errs.push(m.text().slice(0,200))});
await p.goto('http://127.0.0.1:47865/'); await p.waitForTimeout(3000);
console.log('home', await p.evaluate(()=>({home:!homeEl.hidden, phone:document.body.classList.contains('phone'), projects:[...document.querySelectorAll('#hProj .hcard b')].map(x=>x.textContent), fonts:document.fonts.check('800 20px Montserrat')})));
await p.evaluate(()=>newProject('9:16','Android test')); await p.waitForTimeout(1500);
await p.setInputFiles('#file',{name:'clip.mp4',mimeType:'video/mp4',buffer:fs.readFileSync('/tmp/claude-0/pt2/rot_vp9.mp4')}); await p.waitForTimeout(3000);
await p.evaluate(()=>{const m=[...media.values()].find(x=>x.user); m.hasAudio=true; appendMedia(m); addTextPreset(TEXT_PRESETS[13],0); C[C.length-1].text='Thử Android'; renderAll();});
await p.evaluate(()=>exportWebCodecs(720,30,0.11,'android-test')); await p.waitForTimeout(500);
const r=await p.evaluate(()=>({saved:window.__saved, head: window.__lastMp4 ? String.fromCharCode(...window.__lastMp4.slice(4,12)) : null}));
console.log('export', r);
if (r.saved.length) { const b64=await p.evaluate(()=>{let s='';const u=window.__lastMp4;for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);}); fs.writeFileSync('/tmp/claude-0/android-test.mp4',Buffer.from(b64,'base64')); }
console.log(errs.slice(0,6)); await b.close();})();
