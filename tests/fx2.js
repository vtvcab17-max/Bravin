const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl']}); const p=await b.newPage({viewport:{width:1400,height:900}});
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(6000);
const r=await p.evaluate(async()=>{const out={}; const st=vStarts(); for (const k of ['additive','film','nonadd','fade']){ V[1].tr={type:k,dur:1}; for(let i=0;i<5;i++){drawFrame(st[2]-0.1); await new Promise(r=>setTimeout(r,150));} const d=g.getImageData(cv.width/2|0,cv.height/2|0,1,1).data; out[k]=[...d.slice(0,3)];} return out;});
console.log(r); await b.close();})();
