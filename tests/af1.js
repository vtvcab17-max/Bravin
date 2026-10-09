const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader']}); const errs=[]; const p=await b.newPage({viewport:{width:1500,height:950}}); p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
let chatN=0;
await p.route('https://api.openai.com/v1/models', r=>r.request().headers()['authorization']==='Bearer sk-testkey123'? r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({data:[{id:'gpt-4o-mini'},{id:'gpt-5'},{id:'text-embedding-3-large'},{id:'gpt-4.1'}]})}) : r.fulfill({status:401,headers:{'access-control-allow-origin':'*'},body:'{"error":{"message":"bad key"}}'}));
await p.route('https://api.openai.com/v1/chat/completions', async r=>{ chatN++; const body=JSON.parse(r.request().postData()); const sys=body.messages[0].content; let content;
  if (/ĐẦU RA BẮT BUỘC/.test(sys)) { const prevErr=/Lỗi:/.test(body.messages[1].content); content = JSON.stringify({reply: prevErr? 'Đã sửa và thêm chữ.' : 'Thêm chữ.', ops: prevErr? [{op:'add_text',start:1,duration:2,line1:'Tư vấn miễn phí'}] : [{op:'delete',clip:'khong_ton_tai'}]}); }
  else content='Kế hoạch: thêm chữ ở giây 1.';
  r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({choices:[{message:{content}}]})}); });
await p.route('http://localhost:11434/**', r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({models:[{name:'qwen2.5:7b'},{name:'llama3.2'}]})}));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(5000);
const out={};
out.mode=await p.evaluate(()=>[AIS.mode, [...document.querySelectorAll('#aiMode option')].map(o=>o.value), AIS.flow.nodes.map(n=>n.type).join(',')]);
// detection
out.detect=await p.evaluate(async()=>{ const r=await resolveConn('sk-testkey123'); const r2=await resolveConn('http://localhost:11434'); let e3=''; try{ await resolveConn('sk-bad'); }catch(e){ e3=e.message.slice(0,60);} return [r.label, r.base, bestModel(r.models), r2.type, r2.models, e3, KEY_RULES.find(([re])=>re.test('AIza'+'x'.repeat(30)))[1].label]; });
// open canvas, load retry template programmatically, connect all AI nodes to openai key
await p.evaluate(()=>{ AIS.flow=FLOW_TEMPLATES.retry[1](); AIS.flow.nodes.filter(n=>n.type==='ai').forEach(n=>Object.assign(n,{src:'paste',conn:'sk-testkey123'})); setMode('flow'); openFlow(); });
await p.waitForTimeout(400);
out.conn=await p.evaluate(async()=>{ for(const n of AIS.flow.nodes.filter(n=>n.type==='ai')) await connectNode(n); flowUI.api.render(); return AIS.flow.nodes.filter(n=>n.type==='ai').map(n=>[n.provider,n.model]); });
// select ai node to show side panel
await p.evaluate(()=>{ const n=AIS.flow.nodes.find(n=>n.type==='ai'); flowUI.api.select(n.id); flowUI.api.fit(); });
await p.waitForTimeout(300); await p.screenshot({path:'/tmp/claude-0/af_canvas.png'});
// run the retry flow
const nText0=await p.evaluate(()=>C.filter(c=>c.type==='text').length);
await p.evaluate(()=>{ window.ghostSpeed=0; });
out.run=await p.evaluate(async()=>{ await runFlow('thêm chữ Tư vấn miễn phí ở giây 1'); return [...document.querySelectorAll('#msgs .msg')].slice(-4).map(m=>m.textContent.slice(0,80)); });
out.texts=[nText0, await p.evaluate(()=>C.filter(c=>c.type==='text').length)];
out.chatN=chatN;
// embedded mock
out.embed=await p.evaluate(async()=>{ _embed.set('qwen2.5-0.5b', Promise.resolve(async(msgs,opt)=>[{generated_text:[...msgs,{role:'assistant',content:'OK từ model nhúng'}]}])); const n=flowNode('ai',0,0,{src:'embed'}); return await callAI(stepOf(n),'sys','user',null); });
await p.screenshot({path:'/tmp/claude-0/af_after.png'});
// UI: right click empty canvas for add menu, drag wire to empty to get menu
await p.evaluate(()=>closeFlow());
out.chain=await p.evaluate(()=>document.querySelector('#chainLine').textContent);
console.log(JSON.stringify(out,null,1)); console.log(errs); await b.close();})();
