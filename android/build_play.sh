#!/bin/bash
# Bản Google Play: Android App Bundle (.aab) cho gói com.bravinall.bravin, targetSdk 36.
# Gọi qua:  KS_PASS=<mật khẩu> VER=<x.y> CODE=<n> FLAVOR=play bash build.sh <đường dẫn app>
# (build.sh đã dựng www/ và gọi tệp này). Kết quả: build/Bravin_Play.aab (+ build/Bravin_Play_universal.apk để thử).
# Ký AAB bằng khoá tải lên (upload key) = vincut-release.jks; Google Play App Signing giữ khoá ký phát hành.
set -euo pipefail
cd "$(dirname "$0")"
SDK=/usr/lib/android-sdk; JAR=$SDK/platforms/android-23/android.jar; BT=$SDK/build-tools/debian
PKG=com.bravinall.bravin; TARGET=36
VER=${VER:?Đặt VER}; CODE=${CODE:?Đặt CODE}
KS=${KS:-vincut-release.jks}; KS_ALIAS=${KS_ALIAS:-vincut}
[ -f "$KS" ] || { echo "Thiếu khoá $KS (chép vào android/ lúc dựng, không đưa lên git)"; exit 1; }
: "${KS_PASS:?Đặt biến KS_PASS là mật khẩu keystore}"
BUNDLETOOL_VER=1.18.1
BUNDLETOOL=${BUNDLETOOL:-$HOME/.cache/bravin/bundletool-all-$BUNDLETOOL_VER.jar}
if [ ! -f "$BUNDLETOOL" ]; then
  mkdir -p "$(dirname "$BUNDLETOOL")"
  curl -sSL -o "$BUNDLETOOL" "https://github.com/google/bundletool/releases/download/$BUNDLETOOL_VER/bundletool-all-$BUNDLETOOL_VER.jar"
fi
[ -d www ] || { echo "Thiếu www/ (chạy qua build.sh với FLAVOR=play)"; exit 1; }

O=build/play; rm -rf "$O"; mkdir -p "$O/classes" "$O/base/manifest" "$O/base/dex"
# 1) manifest: số phiên bản, targetSdk 36, nhãn Bravin
python3 - AndroidManifest.xml "$O/AndroidManifest.xml" "$CODE" "$VER" "$TARGET" <<'PY'
import sys,re
s=open(sys.argv[1],encoding='utf-8').read()
s=re.sub(r'android:versionCode="\d+"','android:versionCode="%s"'%sys.argv[3],s,1)
s=re.sub(r'android:versionName="[^"]*"','android:versionName="%s"'%sys.argv[4],s,1)
s=re.sub(r'android:targetSdkVersion="\d+"','android:targetSdkVersion="%s"'%sys.argv[5],s,1)
open(sys.argv[2],'w',encoding='utf-8').write(s)
PY
# 2) tài nguyên (proto) + assets
mkdir -p "$O/assets" && cp -r www "$O/assets/www"
aapt2 compile --dir res -o "$O/res.zip"
aapt2 link --proto-format -o "$O/linked.apk" -I "$JAR" --manifest "$O/AndroidManifest.xml" \
  --rename-manifest-package "$PKG" --min-sdk-version 24 --target-sdk-version "$TARGET" \
  --version-code "$CODE" --version-name "$VER" -A "$O/assets" --auto-add-overlay "$O/res.zip"
(cd "$O" && mkdir -p linked && cd linked && unzip -q ../linked.apk)
mv "$O/linked/AndroidManifest.xml" "$O/base/manifest/"
mv "$O/linked/resources.pb" "$O/base/"
[ -d "$O/linked/res" ] && mv "$O/linked/res" "$O/base/"
mv "$O/linked/assets" "$O/base/"
# 3) mã Java → dex
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$JAR" -classpath "$JAR" -d "$O/classes" src/app/vincut/*.java
"$BT/dx" --dex --min-sdk-version=24 --output="$O/base/dex/classes.dex" "$O/classes"
# 4) gói module + bundle (assets không nén để máy chủ nội bộ đọc được theo đoạn, tua video)
(cd "$O/base" && zip -q -r ../base.zip .)
cat > "$O/BundleConfig.json" <<'JSON'
{ "compression": { "uncompressedGlob": ["assets/**"] } }
JSON
java -jar "$BUNDLETOOL" build-bundle --modules="$O/base.zip" --config="$O/BundleConfig.json" --output="$O/Bravin_Play.aab"
# 5) ký bằng upload key
jarsigner -keystore "$KS" -storepass "$KS_PASS" -keypass "$KS_PASS" -sigalg SHA256withRSA -digestalg SHA-256 "$O/Bravin_Play.aab" "$KS_ALIAS" >/dev/null
jarsigner -verify "$O/Bravin_Play.aab" | tail -1
java -jar "$BUNDLETOOL" validate --bundle="$O/Bravin_Play.aab" >/dev/null && echo "bundletool validate: đạt"
# 6) APK "universal" từ chính bundle để thử trên máy (giống cái Play sẽ phát)
java -jar "$BUNDLETOOL" build-apks --bundle="$O/Bravin_Play.aab" --output="$O/universal.apks" --mode=universal \
  --ks="$KS" --ks-key-alias="$KS_ALIAS" --ks-pass="pass:$KS_PASS" --key-pass="pass:$KS_PASS" >/dev/null
(cd "$O" && unzip -q -o universal.apks universal.apk)
cp "$O/Bravin_Play.aab" build/Bravin_Play.aab; cp "$O/universal.apk" build/Bravin_Play_universal.apk
ls -la build/Bravin_Play.aab build/Bravin_Play_universal.apk
