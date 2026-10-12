# Dựng desktop/app từ app/: phông chữ cục bộ thay Google Fonts, bỏ downloads/ (chạy offline, nhẹ bộ cài)
import sys,os,shutil,re
root=sys.argv[1]; fontsrc=sys.argv[2] if len(sys.argv)>2 else None
app=os.path.join(root,'app'); dst=os.path.join(root,'desktop','app')
keep_fonts=os.path.join(dst,'fonts'); tmpf=None
if fontsrc is None and os.path.isdir(keep_fonts): tmpf=root+'/.fonts_tmp'; shutil.rmtree(tmpf,ignore_errors=True); shutil.copytree(keep_fonts,tmpf); fontsrc=tmpf
shutil.rmtree(dst,ignore_errors=True)
shutil.copytree(app,dst,ignore=shutil.ignore_patterns('downloads'))
for f in os.listdir(fontsrc): shutil.copy(os.path.join(fontsrc,f),os.path.join(dst,'fonts',f))
os.makedirs(os.path.join(dst,'models'),exist_ok=True)
open(os.path.join(dst,'models','README.txt'),'w',encoding='utf-8').write('Đặt mô hình AI nhúng (nếu có) vào thư mục này.\n')
style='''<style>
@font-face{font-family:Montserrat;src:url(fonts/mont.ttf) format("truetype");font-weight:100 900;font-style:normal;font-display:swap}
@font-face{font-family:Montserrat;src:url(fonts/mont_i.ttf) format("truetype");font-weight:100 900;font-style:italic;font-display:swap}
@font-face{font-family:"Playfair Display";src:url(fonts/play_i.ttf) format("truetype");font-weight:400 900;font-style:italic;font-display:swap}
@font-face{font-family:"JetBrains Mono";src:url(fonts/jetbrains-mono-vietnamese-500-normal.woff2) format("woff2");font-weight:500;unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB}
@font-face{font-family:"JetBrains Mono";src:url(fonts/jetbrains-mono-latin-500-normal.woff2) format("woff2");font-weight:500}
@font-face{font-family:"JetBrains Mono";src:url(fonts/jetbrains-mono-vietnamese-600-normal.woff2) format("woff2");font-weight:600;unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB}
@font-face{font-family:"JetBrains Mono";src:url(fonts/jetbrains-mono-latin-600-normal.woff2) format("woff2");font-weight:600}
</style>
'''
p=os.path.join(dst,'index.html'); s=open(p,encoding='utf-8').read()
s=re.sub(r'<link rel="preconnect" href="https://fonts.googleapis.com">\s*','',s)
s,n=re.subn(r'<link rel="stylesheet" href="https://fonts.googleapis.com[^>]*>\s*',style,s,count=1)
assert n==1
open(p,'w',encoding='utf-8').write(s)
if tmpf: shutil.rmtree(tmpf)
print('desktop/app ok')
