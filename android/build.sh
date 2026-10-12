#!/bin/bash
# Dựng Bravin cho Android, không cần Gradle:
#   aapt2 (SDK 36) -> javac -> dx -> bundletool
# Kết quả:
#   build/Bravin.aab  : gói App Bundle cho Google Play (đã ký bằng khoá tải lên)
#   build/Bravin.apk  : APK cài trực tiếp / nộp Galaxy Store (ký cùng khoá)
# FLAVOR=samsung: bản Bravin Samsung (gói app.bravin.samsung, Air actions S Pen, cửa sổ DeX, biểu tượng có chữ S)
#   -> build/Bravin_Samsung.aab, build/Bravin_Samsung.apk
#
# Công cụ (đặt biến môi trường nếu để chỗ khác):
#   ANDROID_JAR  android.jar API 36 (có resources.arsc)
#   AAPT2        aapt2 bản 2.19 trở lên
#   BUNDLETOOL   bundletool-all-*.jar
#   DX           dalvik-exchange (gói Ubuntu) hoặc dx
#   FONTS        thư mục có mont.ttf, mont_i.ttf, play_i.ttf
# Khoá ký: bravin-release.jks (alias bravin) đặt trong android/ lúc dựng rồi xoá; KS_PASS = mật khẩu. KHÔNG đưa vào repo.
set -euo pipefail
cd "$(dirname "$0")"
T=${TOOLS:-/home/claude/andtools}
ANDROID_JAR=${ANDROID_JAR:-$T/android-36.jar}
AAPT2=${AAPT2:-$T/aaptjs3/package/bin/x64/linux/aapt2}
BUNDLETOOL=${BUNDLETOOL:-$T/bundletoolheavy/package/bundletoolfile/bundletool-all-1.17.2.jar}
DX=${DX:-$(command -v dalvik-exchange || command -v dx)}
FONTS=${FONTS:-/home/claude/fonts_var}
KS=${KS:-bravin-release.jks}; KS_ALIAS=${KS_ALIAS:-bravin}
APP=${1:-/home/claude/out/bravin/app}
VER=${VER:-1.0}; CODE=${CODE:-1}
FLAVOR=${FLAVOR:-standard}
case "$FLAVOR" in
  standard) PKG=app.bravin; OUT=Bravin;;
  samsung)  PKG=app.bravin.samsung; OUT=Bravin_Samsung;;
  *) echo "FLAVOR phải là standard hoặc samsung"; exit 1;;
esac
: "${KS_PASS:?Đặt biến KS_PASS là mật khẩu keystore}"
for f in "$ANDROID_JAR" "$AAPT2" "$BUNDLETOOL" "$DX"; do [ -e "$f" ] || { echo "Thiếu công cụ: $f"; exit 1; }; done
export JAVA_TOOL_OPTIONS=

rm -rf build www && mkdir -p build/classes build/module/{manifest,dex,assets} www/fonts
# 1) web app → assets/www
for f in "$APP"/*; do b=$(basename "$f"); case "$b" in index.html|index.before*|durs.txt|nm|node_modules|*.tflite|rot_vp9.mp4|downloads) ;; *) cp -r "$f" www/ ;; esac; done
cp "$FONTS"/mont.ttf "$FONTS"/mont_i.ttf "$FONTS"/play_i.ttf www/fonts/
python3 - "$APP/index.html" www/index.html "$FLAVOR" <<'PY'
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
if sys.argv[3]=='samsung': head+='<meta name="bravin-edition" content="samsung">\n'
open(sys.argv[2],'w',encoding='utf-8').write(head+s+'\n</html>\n')
PY
cp -r www build/module/assets/www

# 2) manifest (+ bản Samsung: Air actions, cửa sổ DeX)
sed -e "s/android:versionCode=\"[0-9]*\"/android:versionCode=\"$CODE\"/" -e "s/android:versionName=\"[^\"]*\"/android:versionName=\"$VER\"/" AndroidManifest.xml > build/AndroidManifest.xml
OVERLAY=""
if [ "$FLAVOR" = samsung ]; then
python3 - build/AndroidManifest.xml <<'PY'
import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
s=s.replace('android:label="Bravin"','android:label="Bravin Samsung"',1)
add='''            <!-- S Pen Air actions: vẫy bút = phím tắt (res-samsung/xml/remote_actions.xml) -->
            <intent-filter>
                <action android:name="com.samsung.android.support.REMOTE_ACTION" />
            </intent-filter>
            <meta-data android:name="com.samsung.android.support.REMOTE_ACTION" android:resource="@xml/remote_actions" />
            <!-- Samsung DeX: mở cửa sổ rộng 1440×900 thay vì khung điện thoại -->
            <meta-data android:name="com.samsung.android.dex.launchwidth" android:value="1440" />
            <meta-data android:name="com.samsung.android.dex.launchheight" android:value="900" />
        </activity>'''
assert s.count('        </activity>')==1
s=s.replace('        </activity>',add,1)
open(p,'w',encoding='utf-8').write(s)
PY
"$AAPT2" compile --dir res-samsung -o build/res-samsung.zip
OVERLAY="-R build/res-samsung.zip --auto-add-overlay"
fi

# 3) tài nguyên → định dạng proto cho App Bundle. Lớp Java vẫn là app.vincut.*, chỉ đổi tên gói trong manifest.
"$AAPT2" compile --dir res -o build/res.zip
"$AAPT2" link --proto-format -o build/res_proto.zip -I "$ANDROID_JAR" --manifest build/AndroidManifest.xml \
  --rename-manifest-package "$PKG" --min-sdk-version 24 --target-sdk-version 36 \
  --version-code "$CODE" --version-name "$VER" build/res.zip $OVERLAY
(cd build/module && unzip -q ../res_proto.zip && mv AndroidManifest.xml manifest/)

# 4) Java → dex
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$ANDROID_JAR" -classpath "$ANDROID_JAR" -d build/classes src/app/vincut/*.java
"$DX" --dex --min-sdk-version=24 --output=build/module/dex/classes.dex build/classes

# 5) App Bundle. Tài nguyên trong assets/ để không nén cho video tua nhanh.
(cd build/module && zip -q -r -0 ../base.zip assets && zip -q -r ../base.zip manifest dex res resources.pb)
cat > build/BundleConfig.json <<'JSON'
{"compression":{"uncompressedGlob":["assets/**"]}}
JSON
java -jar "$BUNDLETOOL" build-bundle --modules=build/base.zip --config=build/BundleConfig.json --output=build/$OUT.aab
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$KS" -storepass "$KS_PASS" -keypass "$KS_PASS" build/$OUT.aab "$KS_ALIAS" >/dev/null

# 6) APK cài trực tiếp (universal) từ chính App Bundle, ký cùng khoá
java -jar "$BUNDLETOOL" build-apks --bundle=build/$OUT.aab --output=build/$OUT.apks --mode=universal --aapt2="$AAPT2" \
  --ks="$KS" --ks-key-alias="$KS_ALIAS" --ks-pass=pass:"$KS_PASS" --key-pass=pass:"$KS_PASS" --overwrite
unzip -q -o -p build/$OUT.apks universal.apk > build/$OUT.apk
jarsigner -verify build/$OUT.aab >/dev/null && echo "AAB đã ký: build/$OUT.aab"
ls -la build/$OUT.aab build/$OUT.apk
echo "Gói $PKG · phiên bản $VER ($CODE) · target API 36"
