const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader']}); const errs=[]; const p=await b.newPage({viewport:{width:1600,height:1000}}); p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
await p.goto('http://localhost:8772/index.html'); await p.waitForTimeout(2500); await p.evaluate(()=>newFromTemplate()); await p.waitForTimeout(5000);
await p.evaluate(()=>{ C=C.filter(c=>c.type!=='text'&&c.type!=='sticker'); sel=null; seek(1); renderAll(); });
await p.keyboard.press('KeyP'); await p.waitForTimeout(200);
const out={tool:await p.evaluate(()=>tool)};
const r=await p.evaluate(()=>{const b=document.querySelector('#pvSel').getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height};});
const P=(fx,fy)=>[r.x+fx*r.w, r.y+fy*r.h];
// corner, smooth (drag), corner, then click first to close
await p.mouse.click(...P(0.3,0.3)); await p.waitForTimeout(60);
await p.mouse.move(...P(0.7,0.3)); await p.mouse.down(); await p.mouse.move(...P(0.8,0.4),{steps:5}); await p.mouse.up(); await p.waitForTimeout(60);
await p.mouse.click(...P(0.6,0.7)); await p.waitForTimeout(60);
await p.keyboard.down('Shift'); await p.mouse.click(...P(0.32,0.68)); await p.keyboard.up('Shift'); await p.waitForTimeout(60);
await p.mouse.click(...P(0.3,0.3)); await p.waitForTimeout(200);
out.shape=await p.evaluate(()=>{ const c=findSel(); return {kind:c&&c.gfx&&c.gfx.kind, n:c.gfx.pts.length, closed:c.gfx.closed, smooth:c.gfx.pts[1].slice(2).map(v=>+v.toFixed(3)), x:c.x, y:c.y, mode:penEd&&penEd.mode}; });
await p.waitForTimeout(200); await p.screenshot({path:'/tmp/claude-0/pen_shape.png'});
// insert point on segment between pt0 and pt1 (top edge, around middle)
const segPx=await p.evaluate(()=>{ const c=findSel(), xf=pathXf(c), S=segCtrl(c.gfx.pts,0); const q=cubicAt(...S.map(v=>xf.fwd(v[0],v[1])),0.5); const b=selCv.getBoundingClientRect(); return [b.x+q[0]/cv.width*b.width, b.y+q[1]/cv.height*b.height]; });
await p.mouse.click(...segPx); await p.waitForTimeout(100);
out.afterInsert=await p.evaluate(()=>findSel().gfx.pts.length);
// ctrl+click delete that point
await p.keyboard.down('Control'); await p.mouse.click(...segPx); await p.keyboard.up('Control'); await p.waitForTimeout(100);
out.afterDelete=await p.evaluate(()=>findSel().gfx.pts.length);
// alt click pt0 to make smooth
const p0=await p.evaluate(()=>{ const c=findSel(), xf=pathXf(c), q=xf.fwd(c.gfx.pts[0][0],c.gfx.pts[0][1]); const b=selCv.getBoundingClientRect(); return [b.x+q[0]/cv.width*b.width, b.y+q[1]/cv.height*b.height]; });
await p.keyboard.down('Alt'); await p.mouse.click(...p0); await p.keyboard.up('Alt'); await p.waitForTimeout(100);
out.smooth0=await p.evaluate(()=>findSel().gfx.pts[0].slice(2).some(v=>Math.abs(v)>1e-4));
// drag a vertex
await p.mouse.move(...p0); await p.mouse.down(); await p.mouse.move(p0[0]+40,p0[1]+10,{steps:4}); await p.mouse.up();
out.moved=await p.evaluate(()=>findSel().gfx.pts[0].slice(0,2).map(v=>+v.toFixed(3)));
// pixel check: shape fill visible at centroid
out.fill=await p.evaluate(()=>{ drawFrame(); const d=g.getImageData(cv.width*0.55|0,cv.height*0.45|0,1,1).data; return [...d.slice(0,3)]; });
// undo works
await p.keyboard.press('Control+z'); out.undo=await p.evaluate(()=>findSel()?findSel().gfx.pts[0].slice(0,2).map(v=>+v.toFixed(3)):null);
// mask mode on video clip
await p.evaluate(()=>{ penEd=null; sel={k:'v',id:V[0].id}; renderAll(); });
await p.mouse.click(...P(0.2,0.2)); await p.mouse.click(...P(0.8,0.2)); await p.mouse.click(...P(0.5,0.8)); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
out.mask=await p.evaluate(()=>{ const c=V[0]; return (c.masks||[]).map(m=>[m.type,(m.pts||[]).length,m.closed]); });
// timeline band
await p.evaluate(()=>{ renderTimeline(); });
const clip=await p.evaluate(()=>{ const d=document.querySelector('#grid .clip[data-k="v"]'); d.scrollIntoView({block:'center'}); const b=d.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height,band:!!d.querySelector('.rband')}; });
out.band=clip.band;
await p.mouse.click(clip.x+clip.w*0.3, clip.y+clip.h*0.75); await p.waitForTimeout(100); out.kf1=await p.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y); return [JSON.stringify(V[0].kf||null), e&&e.className, e&&e.closest('.clip')&&e.closest('.clip').dataset.id, V[0].id, tool];},[clip.x+clip.w*0.3, clip.y+clip.h*0.75]);
await p.mouse.move(clip.x+clip.w*0.7, clip.y+clip.h/2); await p.mouse.down(); await p.mouse.move(clip.x+clip.w*0.7, clip.y+clip.h-6,{steps:4}); await p.mouse.up(); await p.waitForTimeout(100);
out.kf=await p.evaluate(()=>(V[0].kf&&V[0].kf.opacity||[]).map(k=>[+k.t.toFixed(2),+k.v.toFixed(2)]));
await p.screenshot({path:'/tmp/claude-0/pen_band.png'});
console.log(JSON.stringify(out)); console.log(errs); await b.close();})();
