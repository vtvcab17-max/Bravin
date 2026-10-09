const http=require('http'),fs=require('fs'),path=require('path');const root=process.argv[2];
const types={'.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.css':'text/css','.html':'text/html; charset=utf-8','.json':'application/json','.webm':'video/webm','.mp4':'video/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.jpg':'image/jpeg','.png':'image/png'};
http.createServer((q,s)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!fs.existsSync(f)){s.writeHead(404);return s.end();}
const st=fs.statSync(f),ty=types[path.extname(f)]||'application/octet-stream',r=q.headers.range;
if(r){const [a,b]=r.replace('bytes=','').split('-');const start=+a,end=b?+b:st.size-1;s.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${st.size}`,'Accept-Ranges':'bytes','Content-Length':end-start+1,'Content-Type':ty});fs.createReadStream(f,{start,end}).pipe(s);}
else{s.writeHead(200,{'Content-Length':st.size,'Content-Type':ty,'Accept-Ranges':'bytes'});fs.createReadStream(f).pipe(s);}}).listen(+process.argv[3]);
