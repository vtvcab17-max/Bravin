import numpy as np, json, sys, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont
rs=np.random.RandomState(3)
W,H,N=720,405,90
OUT=sys.argv[1]
def noise(w,h,sig,seed):
    r=np.random.RandomState(seed); a=r.rand(h,w)*255
    im=Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(sig)); a=np.asarray(im).astype(float)
    a=(a-a.min())/(a.max()-a.min()+1e-9)*255; return a
bg=np.stack([noise(W+200,H+200,6,1)*0.55+40, noise(W+200,H+200,9,2)*0.5+50, noise(W+200,H+200,4,3)*0.45+45],-1).clip(0,255).astype(np.uint8)
bg=Image.fromarray(bg)
# card texture (like a poster / phone screen)
cw,ch=240,160
card=Image.new("RGB",(cw,ch),(230,230,220)); d=ImageDraw.Draw(card)
for i in range(60):
    x,y=rs.randint(0,cw),rs.randint(0,ch); r=rs.randint(4,18); c=tuple(int(v) for v in rs.randint(0,255,3))
    (d.ellipse if i%2 else d.rectangle)([x-r,y-r,x+r,y+r],fill=c)
for k in range(6): d.text((10,10+k*24),"BRAVIN TRACK %d"%k,fill=(20,20,20))
card=card.filter(ImageFilter.GaussianBlur(0.6))
src=np.array([[0,0],[cw,0],[cw,ch],[0,ch]],float)
def homog(s,dq):
    A=[];b=[]
    for (x,y),(u,v) in zip(s,dq):
        A.append([x,y,1,0,0,0,-u*x,-u*y]);b.append(u);A.append([0,0,0,x,y,1,-v*x,-v*y]);b.append(v)
    h=np.linalg.solve(np.array(A),np.array(b)); return np.append(h,1).reshape(3,3)
gt=[]
os.makedirs(OUT,exist_ok=True)
raw=open(OUT+"/frames.gray","wb")
for f in range(N):
    p=f/(N-1)
    ang=np.radians(25*p); sc=1.0+0.45*p; cx=230+300*p; cy=200-40*np.sin(p*np.pi)
    hw,hh=cw/2*sc,ch/2*sc
    base=np.array([[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]])
    # perspective: right edge shrinks over time
    base[1,1]*= (1-0.25*p); base[2,1]*=(1-0.25*p); base[1,0]*=(1-0.1*p); base[2,0]*=(1-0.1*p)
    R=np.array([[np.cos(ang),-np.sin(ang)],[np.sin(ang),np.cos(ang)]])
    q=(base@R.T)+[cx,cy]
    gt.append(q.tolist())
    # background pans (camera)
    ox,oy=int(100-60*p),int(100-30*p)
    frame=bg.crop((ox,oy,ox+W,oy+H)).copy()
    Hm=homog(src,q); Hi=np.linalg.inv(Hm); Hi/=Hi[2,2]
    warped=card.transform((W,H),Image.PERSPECTIVE,tuple(Hi.flatten()[:8]),Image.BILINEAR)
    mask=Image.new("L",(cw,ch),255).transform((W,H),Image.PERSPECTIVE,tuple(Hi.flatten()[:8]),Image.BILINEAR)
    frame.paste(warped,(0,0),mask)
    # occluder: hand-like bar crossing frames 40..60
    if 40<=f<=60:
        dr=ImageDraw.Draw(frame); x=int(cx-160+ (f-40)*16)
        dr.rectangle([x,0,x+70,H],fill=(150,110,90))
    a=np.asarray(frame).astype(float)*(1+0.15*p)+rs.normal(0,2,(H,W,3))
    a=a.clip(0,255).astype(np.uint8)
    Image.fromarray(a).save(OUT+"/f%03d.png"%f)
    g=(0.299*a[...,0]+0.587*a[...,1]+0.114*a[...,2]).astype(np.uint8); raw.write(g.tobytes())
raw.close()
json.dump({"w":W,"h":H,"n":N,"gt":gt},open(OUT+"/gt.json","w"))
print("ok")
