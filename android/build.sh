#!/bin/bash
# Build VINCut.apk without Gradle: aapt -> javac -> dx -> zipalign -> apksigner
set -euo pipefail
cd "$(dirname "$0")"
SDK=/usr/lib/android-sdk; JAR=$SDK/platforms/android-23/android.jar; BT=$SDK/build-tools/debian
APP=${1:-/home/claude/out/bravin/app}
VER=${VER:-1.0}; CODE=${CODE:-1}
rm -rf build www && mkdir -p build/classes www/fonts
# 1) web app → assets/www
for f in "$APP"/*; do b=$(basename "$f"); case "$b" in index.html|index.before*|durs.txt|nm|node_modules|*.tflite|rot_vp9.mp4) ;; *) cp -r "$f" www/ ;; esac; done
cp /home/claude/fonts_var/mont.ttf /home/claude/fonts_var/mont_i.ttf /home/claude/fonts_var/play_i.ttf www/fonts/
python3 - "$APP/index.html" www/index.html <<'PY'
import sys,re
s=open(sys.argv[1],encoding='utf-8').read()
s=re.sub(r'(?is)^\s*<!doctype html>\s*<html[^>]*>\s*<head>\s*<meta charset="utf-8">\s*','',s); s=re.sub(r'<meta name="viewport"[^>]*>\s*','',s,count=1)
s=re.sub(r'<link rel="preconnect"[^>]*>\s*','',s); s=re.sub(r'<link rel="stylesheet" href="https://fonts.googleapis.com[^>]*>\s*','',s)
head='''<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover,interactive-widget=resizes-content">
<meta name="theme-color" content="#131417">
<style>
@font-face{font-family:Montserrat;src:url(fonts/mont.ttf) format("truetype");font-weight:100 900;font-style:normal;font-display:swap}
@font-face{font-family:Montserrat;src:url(fonts/mont_i.ttf) format("truetype");font-weight:100 900;font-style:italic;font-display:swap}
@font-face{font-family:"Playfair Display";src:url(fonts/play_i.ttf) format("truetype");font-weight:400 900;font-style:italic;font-display:swap}
html,body{overscroll-behavior:none;-webkit-tap-highlight-color:transparent}
</style>
'''
open(sys.argv[2],'w',encoding='utf-8').write(head+s+'\n</html>\n')
PY
# 2) resources + manifest (+ all assets stored uncompressed so video can seek)
sed -e "s/android:versionCode=\"[0-9]*\"/android:versionCode=\"$CODE\"/" -e "s/android:versionName=\"[^\"]*\"/android:versionName=\"$VER\"/" AndroidManifest.xml > build/AndroidManifest.xml
mkdir -p build/assets && cp -r www build/assets/www
aapt package -f -0 "" -M build/AndroidManifest.xml -S res -A build/assets -I "$JAR" -F build/unsigned.apk
# 3) java → dex
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$JAR" -classpath "$JAR" -d build/classes src/app/vincut/*.java
"$BT/dx" --dex --min-sdk-version=24 --output=build/classes.dex build/classes
(cd build && aapt add -0 "" unsigned.apk classes.dex >/dev/null)
# 4) align + sign
zipalign -f -p 4 build/unsigned.apk build/aligned.apk
[ -f vincut-release.jks ] || keytool -genkeypair -keystore vincut-release.jks -alias vincut -keyalg RSA -keysize 2048 -validity 10000 \
   -storepass "${KS_PASS:?Đặt biến KS_PASS là mật khẩu keystore}" -keypass "${KS_PASS:?Đặt biến KS_PASS là mật khẩu keystore}" -dname "CN=VINCut, C=VN" >/dev/null 2>&1
apksigner sign --ks vincut-release.jks --ks-key-alias vincut --ks-pass pass:"${KS_PASS:?Đặt biến KS_PASS là mật khẩu keystore}" --key-pass pass:"${KS_PASS:?Đặt biến KS_PASS là mật khẩu keystore}" \
   --min-sdk-version 24 --out build/Bravin.apk build/aligned.apk
apksigner verify --min-sdk-version 24 build/Bravin.apk && ls -la build/Bravin.apk
