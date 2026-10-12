import base64, io, json, sys
from PIL import Image, ImageDraw
D=sys.argv[1]; OUT=sys.argv[2]
def png(im): b=io.BytesIO(); im.save(b,'PNG'); return 'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()
bg=Image.new('RGB',(1280,720),(20,40,140))
logo=Image.new('RGBA',(200,200),(230,30,30,255)); ImageDraw.Draw(logo).rectangle([0,0,199,199],outline=(255,255,255,255),width=10)
hud=Image.new('RGBA',(300,80),(30,200,60,255))
vid='data:video/webm;base64,'+base64.b64encode(open(D+'/green.webm','rb').read()).decode()
aud='data:audio/wav;base64,'+base64.b64encode(open(D+'/a.wav','rb').read()).decode()
def doc(camera):
    o={"format":"bravin-project","schema":2,"generator":{"name":"Antifact","version":"1.2"},
     "canvas":{"width":1280,"height":720,"background":"#101018"},"timeline":{"fps":30,"duration":4,"trackOrder":"bottom-to-top"},
     "tracks":[
      {"id":"t-bg","name":"Ảnh nền","index":0,"clips":[{"start":0,"duration":4,"position":{"x":0,"y":0,"width":1280,"height":720},"media":{"type":"image","encoding":"data-url","data":png(bg)}}]},
      {"id":"t-logo","name":"Logo","index":1,"clips":[{"name":"Logo","start":0,"duration":4,"position":{"x":100,"y":100,"width":200,"height":200},
          "keyframes":[{"time":0,"x":100,"y":100,"rotation":0,"scale":1,"opacity":1,"easing":"ease-in-out"},{"time":2,"x":900,"y":400,"rotation":90,"scale":1.5,"opacity":1,"easing":"linear"},{"time":4,"x":900,"y":400,"opacity":0.5}],
          "transitionIn":{"type":"fade","duration":0.4},"transitionOut":{"type":"slide-to-right","duration":0.5},"media":{"type":"image","encoding":"data-url","data":png(logo)}}]},
      {"id":"t-vid","name":"Video","index":2,"clips":[{"start":1,"duration":1.5,"position":{"x":880,"y":40,"width":360,"height":202},"media":{"type":"video","encoding":"data-url","data":vid,"trim":{"in":0.5}},"volume":0.5}]},
      {"id":"t-hud","name":"HUD","index":3,"parallax":0,"clips":[{"start":0,"duration":4,"position":{"x":40,"y":620,"width":300,"height":80},"media":{"type":"image","encoding":"data-url","data":png(hud)}}]},
      {"id":"t-text","name":"Tiêu đề","index":4,"clips":[{"start":0,"duration":4,"text":"Xin chào","position":{"x":500,"y":300,"width":300,"height":80}}]},
      {"id":"t-aud","name":"Nhạc","index":5,"clips":[{"start":0,"duration":3,"media":{"type":"audio","encoding":"data-url","data":aud},"volume":0.8}]}
     ]}
    if camera: o["camera"]={"keyframes":[{"time":0,"x":640,"y":360,"zoom":1,"rotation":0,"easing":"ease-in-out"},{"time":3,"x":800,"y":400,"zoom":1.5,"rotation":10,"z":-200}]}
    return o
json.dump(doc(False),open(OUT+'/plain.bravin.json','w'),ensure_ascii=False)
json.dump(doc(True),open(OUT+'/camera.bravin.json','w'),ensure_ascii=False)
print('ok')
