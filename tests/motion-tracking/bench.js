const fs=require("fs"), MT=require(process.argv[2]), dir=process.argv[3];
const G=JSON.parse(fs.readFileSync(dir+"/gt.json")), raw=fs.readFileSync(dir+"/frames.gray"), W=G.w,H=G.h,N=G.n;
const frame=f=>{const g=new Float32Array(W*H);for(let i=0;i<W*H;i++)g[i]=raw[f*W*H+i];return g;};
function run(opts,poly){
  const tr=new MT.Tracker(opts); const nf=tr.setAnchor(frame(0),W,H,poly,MT.I3()); const errs=[]; let lostN=0,t0=Date.now(),stopAt=-1;
  for(let f=1;f<N;f++){const r=tr.step(frame(f)); if(r.lost)lostN++; if(r.stop&&stopAt<0)stopAt=f;
    let e=0; for(let k=0;k<4;k++){const p=MT.apply(r.H,G.gt[0][k][0],G.gt[0][k][1]);e=Math.max(e,Math.hypot(p[0]-G.gt[f][k][0],p[1]-G.gt[f][k][1]));} errs.push(e);}
  const mean=errs.reduce((a,b)=>a+b,0)/errs.length, occ=errs.slice(39,60), after=errs.slice(60);
  return `feat=${nf} mean=${mean.toFixed(2)}px max=${Math.max(...errs).toFixed(2)} inOcclusion=${(occ.reduce((a,b)=>a+b,0)/occ.length).toFixed(2)} afterOcc=${(after.reduce((a,b)=>a+b,0)/after.length).toFixed(2)} last=${errs[errs.length-1].toFixed(2)} lost=${lostN} ${((Date.now()-t0)/(N-1)).toFixed(0)}ms/f`;
}
const poly4=G.gt[0];
// hand-drawn 7-point polygon inside the card
const c=[0,1].map(k=>poly4.reduce((a,p)=>a+p[k],0)/4);
const poly7=[0,0.5,1,1.5,2,2.5,3].map(s=>{const i=Math.floor(s)%4,j=(i+1)%4,f=s-Math.floor(s);const p=[poly4[i][0]*(1-f)+poly4[j][0]*f,poly4[i][1]*(1-f)+poly4[j][1]*f];return [c[0]+(p[0]-c[0])*0.9,c[1]+(p[1]-c[1])*0.9];});
for(const [name,o,p] of [["persp+antidrift (4 góc)",{model:"persp"},poly4],["persp+antidrift (bút 7 điểm)",{model:"persp"},poly7],["persp, không chống trôi",{model:"persp",antiDrift:false},poly4],["kiểu Premiere: vị trí+xoay+tỉ lệ",{model:"sim",antiDrift:false},poly4],["chỉ vị trí",{model:"trans",antiDrift:false},poly4]])
  console.log(name.padEnd(36),run(o,p));
