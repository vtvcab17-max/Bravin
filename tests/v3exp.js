const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});const ctx=await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
await ctx.addInitScript(()=>{ try{ delete window.showSaveFilePicker; window.showSaveFilePicker=undefined; }catch(e){} });
const p=await ctx.newPage();const errs=[]; p.on('crash',()=>console.log('PAGE CRASH')); p.on('close',()=>console.log('PAGE CLOSE'));p.on('pageerror',e=>errs.push('PE '+e.message));p.on('console',m=>{const x=m.text(); if((m.type()==='error'||m.type()==='warning')&&!/TUNNEL|fonts|GL Driver|swiftshader|GroupMarker/.test(x))errs.push(m.type()+': '+x.slice(0,300))});
await p.goto('http://localhost:8772/index.html');await p.waitForTimeout(2500);
console.log('caps', await p.evaluate(async()=>({ve:!!window.VideoEncoder, ae:!!window.AudioEncoder, mux:!!window.Mp4Muxer, box:!!window.MP4Box, avc:(await VideoEncoder.isConfigSupported({codec:'avc1.640028',width:720,height:1280,bitrate:4e6,framerate:30})).supported, aac:(await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:2,bitrate:192000})).supported})));
await p.evaluate(()=>newProject('9:16','Export test')); await p.waitForTimeout(1500);
await p.setInputFiles('#file',{name:'rot_vp9.mp4',mimeType:'video/mp4',buffer:fs.readFileSync('/tmp/claude-0/pt2/rot_vp9.mp4')}); await p.waitForTimeout(3500);
await p.evaluate(()=>{const m=[...media.values()].find(x=>x.name==='rot_vp9.mp4'); m.hasAudio=true; appendMedia(m); appendMedia(m); V[0].out=2.5; V[1].in=2.5; V[1].out=6; V[1].speed=2; applySpeedCurve(V[1],'montage'); V[0].tr={type:'fade',dur:0.6}; addTextPreset(TEXT_PRESETS[6],0.2); const tx=C[C.length-1]; tx.text='Xuất thử'; tx.dur=3; renderAll();});
console.log('timeline', await p.evaluate(()=>({total:total(), V:V.map(c=>[c.in,c.out,c.speed||1])})));
// preview frame at 1.0s for orientation reference
await p.evaluate(()=>{t=1;drawFrame();}); await p.waitForTimeout(1200); await p.evaluate(()=>drawFrame()); await p.waitForTimeout(300);
fs.writeFileSync('/tmp/claude-0/exp_prev.jpg',Buffer.from((await p.evaluate(()=>cv.toDataURL('image/jpeg',.8))).split(',')[1],'base64'));
const dlP=p.waitForEvent('download',{timeout:240000});
const t0=Date.now(); p.evaluate(()=>exportWebCodecs(720,30,0.11,'test-export').catch(e=>console.error('EXPORT FAIL '+e.message+' '+e.stack)));
const dl=await dlP; await dl.saveAs('/tmp/claude-0/test-export.mp4'); console.log('export secs',(Date.now()-t0)/1000);
console.log(errs.slice(0,8)); await b.close();})();
