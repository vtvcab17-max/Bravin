const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext();
await ctx.addInitScript(()=>{window.VINCUT_AI={transformers:'/nm/@huggingface/transformers/dist/transformers.min.js',wasmPaths:'/nm/@huggingface/transformers/dist/',modelHosts:['/nm/sts-whisper-tiny/models/']};});
const p=await ctx.newPage(); p.on('pageerror',e=>console.log('PE',e.message));
await p.goto('http://localhost:8772/index.html');await p.waitForTimeout(2500);
await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(6000);
const r=await p.evaluate(async()=>{const pipe=await getASR('tiny'); const vtr=tracks.find(x=>/voice/i.test(x.name)); const a=await renderSpeech(vtr.id, 20, 34);
 const out={}; try{ const r1=await pipe(a,{return_timestamps:'word',chunk_length_s:30,stride_length_s:5,language:'vietnamese',task:'transcribe'}); out.word={text:r1.text, chunks:(r1.chunks||[]).slice(0,8)}; }catch(e){out.wordErr=String(e)}
 try{ const r2=await pipe(a,{return_timestamps:true,chunk_length_s:30,stride_length_s:5,language:'vietnamese',task:'transcribe'}); out.seg={text:r2.text, chunks:(r2.chunks||[]).slice(0,6)}; }catch(e){out.segErr=String(e)}
 return out;});
console.log(JSON.stringify(r,null,1)); await b.close();})();
