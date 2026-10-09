const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']}); const errs=[];
const p=await b.newPage({viewport:{width:1400,height:900}}); p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500);
await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(6000);
await p.evaluate(()=>{seek(1.2); C=C.filter(c=>c.type!=='text'&&c.type!=='sticker'); drawFrame();}); await p.waitForTimeout(1200);
const keys=['none','sglow','sglint','srays','sdefocus','sdamage','sduotone','sedge','sprism'];
const thumbs = await p.evaluate(async(keys)=>{ const out=[]; for (const k of keys){ if(k!=='none'){addEffect(k, 1.0); const c=C[C.length-1]; c.dur=2;} drawFrame(); await new Promise(r=>setTimeout(r,30)); drawFrame(); const s=document.createElement('canvas'); s.width=135; s.height=240; s.getContext('2d').drawImage(cv,0,0,135,240); out.push([k, s.toDataURL('image/png')]); if(k!=='none') C.pop(); } return out; }, keys);
thumbs.forEach(([k,u])=>fs.writeFileSync('/tmp/claude-0/sfx_'+k+'.png', Buffer.from(u.split(',')[1],'base64')));
// slow-mo on a 0.6s piece
const sm = await p.evaluate(async()=>{ const c=V[0]; c.out=c.in+0.6; const n0=media.size; const t0=performance.now(); try{ await renderSmoothSlow(c, 2); }catch(e){ return 'ERR '+e.message; } const m=media.get(c.mediaId); return [media.size-n0, m.name, m.dur||m.duration, c.in, c.out, Math.round(performance.now()-t0)]; });
// sync audio: make an audio clip from a video media offset
const sy = await p.evaluate(async()=>{ const vm=media.get(V[2].mediaId); const tr=tracks.find(x=>x.type==='audio')||addTrack('audio'); const st=vStarts(); const a={id:nid('c'),track:tr.id,type:'audio',mediaId:vm.id,start:st[2]+0.9,in:V[2].in,out:V[2].out,vol:1}; C.push(a); clearMsel&&clearMsel(); msel.add(V[2].id); msel.add(a.id); sel=null; const t0=performance.now(); try{ await syncAudio(); }catch(e){ return 'ERR '+e.message+e.stack; } return [st[2], a.start, Math.round(performance.now()-t0)]; });
console.log(JSON.stringify({sm, sy})); console.log(errs); await b.close();})();
