const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1400,height:860}});const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('http://localhost:8766/index.html');await p.waitForTimeout(7000);
const r=await p.evaluate(async()=>{const s=describeState();const v=s.video_track;pushUndo();const out=[];
 for(const op of [{op:"split",time:5},{op:"trim",clip:v[0].id,trim_start:1},{op:"move",clip:v[1].id,to_index:1},{op:"move_audio",clip:s.audio_track[0].id,start:1},{op:"volume",clip:s.audio_track[0].id,db:-6},{op:"delete",clip:v[3].id},{op:"bogus"}]){try{out.push(await runOp(op))}catch(e){out.push('ERR '+e.message)}}
 return {out,after:describeState().video_track.map(c=>[c.id,c.media,c.start,c.end])}});
await p.screenshot({path:'/tmp/claude-0/ai.png'});console.log(JSON.stringify(r,null,0),errs);await b.close();})();
