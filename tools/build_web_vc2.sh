#!/bin/bash
# Build the VINCut web version (static site) into ./web
set -euo pipefail
cd "$(dirname "$0")"
BUILD=$(date -u +%Y%m%d-%H%M)
rm -rf web && mkdir -p web/fonts web/icons
cp -r app/js app/css app/vendor web/
cp /tmp/claude-0/fsub/*.woff2 web/fonts/ 2>/dev/null || cp fonts_web/*.woff2 web/fonts/
python3 - "$BUILD" <<'PY'
import sys,re
from PIL import Image
build=sys.argv[1]
s=open('app/index.html',encoding='utf-8').read()
s=re.sub(r'<meta name="viewport"[^>]*>\s*','',s)
s=re.sub(r'<link rel="preconnect"[^>]*>\s*','',s); s=re.sub(r'<link rel="stylesheet" href="https://fonts.googleapis.com[^>]*>\s*','',s)
head=f'''<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0d1417"><meta name="description" content="VINCut – trình dựng video kiểu CapCut chạy trên trình duyệt">
<link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icons/icon-192.png"><link rel="apple-touch-icon" href="icons/icon-192.png">
<style>
@font-face{{font-family:Montserrat;src:url(fonts/mont.woff2) format("woff2");font-weight:100 900;font-style:normal;font-display:swap}}
@font-face{{font-family:Montserrat;src:url(fonts/mont_i.woff2) format("woff2");font-weight:100 900;font-style:italic;font-display:swap}}
@font-face{{font-family:"Playfair Display";src:url(fonts/play_i.woff2) format("woff2");font-weight:400 900;font-style:italic;font-display:swap}}
html,body{{overscroll-behavior:none}}
</style>
<script>window.VINCUT_BUILD="{build}";if("serviceWorker"in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{{}}));</script>
'''
s=head+s.replace('<script src="','<script src="',1)
s=re.sub(r'src="(js|vendor)/([^"]+)"', lambda m: f'src="{m.group(1)}/{m.group(2)}?v={build}"', s)
s=s.replace('href="css/app.css"',f'href="css/app.css?v={build}"')
open('web/index.html','w',encoding='utf-8').write(s+'\n</html>\n')
im=Image.open('icon512.png').convert('RGBA'); im.save('web/icons/icon-512.png'); im.resize((192,192),Image.LANCZOS).save('web/icons/icon-192.png')
bg=Image.new('RGBA',(512,512),(13,20,23,255)); bg.paste(im.resize((410,410),Image.LANCZOS),(51,51),im.resize((410,410),Image.LANCZOS)); bg.save('web/icons/maskable-512.png')
import json
json.dump({"name":"VINCut","short_name":"VINCut","description":"Dựng video kiểu CapCut ngay trên trình duyệt","start_url":"./","scope":"./","display":"standalone","orientation":"any","background_color":"#0d1417","theme_color":"#0d1417","lang":"vi",
 "icons":[{"src":"icons/icon-192.png","sizes":"192x192","type":"image/png"},{"src":"icons/icon-512.png","sizes":"512x512","type":"image/png"},{"src":"icons/maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}]},open('web/manifest.webmanifest','w',encoding='utf-8'),ensure_ascii=False,indent=1)
open('web/sw.js','w').write('''// VINCut service worker: network first (always newest build while online), cache fallback (offline)
const CACHE = "vincut-%s";
self.addEventListener("install", e => { self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url); if (e.request.method !== "GET" || u.origin !== location.origin || e.request.headers.has("range")) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok && r.status === 200) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
''' % build)
json.dump({"cleanUrls":False,"headers":[
 {"source":"/(.*)","headers":[{"key":"X-Content-Type-Options","value":"nosniff"},{"key":"Referrer-Policy","value":"strict-origin-when-cross-origin"},{"key":"Permissions-Policy","value":"microphone=(self), camera=(), geolocation=()"}]},
 *[{"source":x,"headers":[{"key":"Cache-Control","value":"no-cache"}]} for x in ["/","/index.html","/sw.js","/manifest.webmanifest"]],
 {"source":"/(js|css|vendor)/(.*)","headers":[{"key":"Cache-Control","value":"public, max-age=31536000, immutable"}]},
 {"source":"/fonts/(.*)","headers":[{"key":"Cache-Control","value":"public, max-age=31536000, immutable"}]}]},open('web/vercel.json','w'),indent=1)
PY
echo "built $BUILD"; du -sh web; find web -type f | wc -l
