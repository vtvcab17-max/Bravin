const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl']}); const errs=[]; const ctx=await b.newContext({viewport:{width:1500,height:1000}}); const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(6000);
const out={};
out.shape=await p.evaluate(()=>{ const c=addShape('round'); c.gfx.grad='#ff6b9a'; c.gfx.sw=6; drawFrame(); return [!!lastBoxes.get(c.id), textLabel(c)]; });
await p.evaluate(()=>{ inspTabs.sticker='st'; renderInspector(); });
out.shapeUI=await p.evaluate(()=>[...document.querySelectorAll('#insp details.sect>summary')].map(s=>s.textContent));
// synthetic
await p.evaluate(async()=>{ await addSynthetic('black'); await addSynthetic('bars'); });
out.synth=await p.evaluate(()=>[V[V.length-1] && media.get(V[V.length-1].mediaId).name, C.filter(c=>c.type==='audio' && /Tone/.test(media.get(c.mediaId).name)).length]);
// SRT import
const srt='1\n00:00:01,000 --> 00:00:02,500\nXin chào\n\n2\n00:00:03,000 --> 00:00:04,200\nDòng hai\ncó xuống dòng\n';
fs.writeFileSync('/tmp/claude-0/t.srt',srt);
const [fc]=await Promise.all([p.waitForEvent('filechooser'), p.evaluate(()=>importSRT())]); await fc.setFiles('/tmp/claude-0/t.srt'); await p.waitForTimeout(500);
out.srt=await p.evaluate(()=>{ const tr=tracks.find(x=>x.name==='Phụ đề SRT'); const cs=C.filter(c=>c.track===tr.id); return cs.map(c=>[c.start,+cend(c).toFixed(2),c.text||c.line1]); });
// markers
await p.evaluate(()=>{ markers.push(2.5); markerNotes['2.5']={name:'Hook',color:'#ff6b9a'}; renderTimeline(); });
out.mk=await p.evaluate(()=>{const m=document.querySelector('.marker.named'); return m && m.dataset.name;});
out.proj=await p.evaluate(()=>JSON.parse(projectJSON()).markerNotes);
// history
await p.evaluate(()=>openHistory()); out.hist=await p.evaluate(()=>[...document.querySelectorAll('.hirow span')].slice(0,5).map(x=>x.textContent)); await p.screenshot({path:'/tmp/claude-0/tl_hist.png'});
await p.evaluate(()=>document.querySelector('.hirow:nth-child(3)').click()); out.afterJump=await p.evaluate(()=>[undoStack.length, redoStack.length]);
// guides
await p.evaluate(()=>{toggleGuides(); drawFrame();}); 
// FCP XML import
const xml=`<?xml version="1.0"?><xmeml version="4"><sequence><name>Seq</name><rate><timebase>30</timebase><ntsc>FALSE</ntsc></rate><media><video><track>
<clipitem><name>A</name><start>0</start><end>60</end><in>30</in><out>90</out><file id="f1"><name>NAME1</name></file></clipitem>
<clipitem><name>B</name><start>75</start><end>135</end><in>0</in><out>120</out><file id="f2"><name>NAME2</name></file></clipitem>
</track></video><audio><track><clipitem><start>0</start><end>90</end><in>0</in><out>90</out><file id="f3"><name>NAME3</name></file></clipitem></track></audio></media>
<marker><name>Đầu</name><in>15</in><out>-1</out></marker></sequence></xmeml>`;
const names=await p.evaluate(()=>{const vids=[...media.values()].filter(m=>m.kind==='video'); const au=[...media.values()].filter(m=>m.kind==='audio'); return [vids[0].name, vids[1].name, au[0]&&au[0].name];});
fs.writeFileSync('/tmp/claude-0/t.xml', xml.replace('NAME1',names[0]).replace('NAME2',names[1]).replace('NAME3',names[2]||'x'));
await p.evaluate(()=>document.querySelectorAll('.overlay').forEach(o=>o.remove()));
const [fc2]=await Promise.all([p.waitForEvent('filechooser'), p.evaluate(()=>importFCPXML())]); await fc2.setFiles('/tmp/claude-0/t.xml'); await p.waitForTimeout(600);
out.xml=await p.evaluate(()=>({V:V.map(c=>[c.in,c.out,c.speed||1,c.gap||0]), aud:C.filter(c=>c.type==='audio').length, mk:markers, notes:markerNotes}));
await p.screenshot({path:'/tmp/claude-0/tl_full.png'});
console.log(JSON.stringify(out,null,0)); console.log(errs); await b.close();})();
