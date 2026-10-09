const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader']}); const p=await b.newPage({viewport:{width:1400,height:900}}); p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2000); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(5000);
console.log(await p.evaluate(async()=>{ addShape('rect'); addShape('ellipse'); addShape('line'); const before=[undoStack.length, redoStack.length]; openHistory(); const rows=[...document.querySelectorAll('.hirow')]; const n=rows.length; const labels=rows.map(r=>r.textContent+'|'+r.parentElement.className); rows[2].click(); return {before, n, labels, after:[undoStack.length, redoStack.length]}; }));
await b.close();})();
