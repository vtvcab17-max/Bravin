const http=require('http');let n=0;
http.createServer((q,s)=>{const h={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*','content-type':'application/json'};
if(q.method==='OPTIONS'){s.writeHead(204,h);return s.end();}
let b='';q.on('data',d=>b+=d);q.on('end',()=>{
 if(q.url.endsWith('/models')){s.writeHead(200,h);return s.end(JSON.stringify({data:[{id:'mock-plan'},{id:'mock-act'}]}));}
 const j=JSON.parse(b||'{}');n++;
 const content = j.model==='mock-plan' ? 'KẾ HOẠCH: thay clip ở giây 30 bằng m_h21 lấy từ giây 5; nhạc nhỏ đi 4 dB.' :
  '```json\n{"reply":"Đã thay cảnh ở giây 30 và hạ nhạc.","ops":[{"op":"replace","clip":"v15","media":"m_h21","in":5},{"op":"volume","clip":"c98","db":-4}]}\n```';
 s.writeHead(200,h);s.end(JSON.stringify({choices:[{message:{content}}]}));});}).listen(8799);
