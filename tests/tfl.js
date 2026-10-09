const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch(); const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8773/index.html'); await p.waitForTimeout(3000);
const r=await p.evaluate(async()=>{ try{ const tf=await loadTF(); return [AI_CDN.localRuntime, AI_CDN.transformers, typeof tf.pipeline, tf.env.backends.onnx.wasm.wasmPaths]; }catch(e){ return 'ERR '+e.message; } });
console.log(JSON.stringify(r), errs); await b.close();})();
