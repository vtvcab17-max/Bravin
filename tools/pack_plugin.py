#!/usr/bin/env python3
"""Đóng gói thư mục plugin (có manifest.json) thành 1 file .bravinplugin.json để gửi cho đồng đội.
   python3 tools/pack_plugin.py examples/plugins/thong-ke [-o ra.bravinplugin.json]"""
import json, os, sys
a = sys.argv[1:]
if not a: sys.exit(__doc__)
d = a[0]; out = a[a.index("-o") + 1] if "-o" in a else os.path.basename(os.path.normpath(d)) + ".bravinplugin.json"
man = json.load(open(os.path.join(d, "manifest.json"), encoding="utf-8"))
files = {}
for root, _, names in os.walk(d):
    for n in names:
        p = os.path.join(root, n); rel = os.path.relpath(p, d).replace(os.sep, "/")
        if rel == "manifest.json" or n.startswith("."): continue
        try: files[rel] = open(p, encoding="utf-8").read()
        except UnicodeDecodeError: print("Bỏ qua file nhị phân (hãy dùng data URI):", rel)
if man.get("entry", "index.html") not in files: sys.exit("Thiếu file entry: " + man.get("entry", "index.html"))
json.dump({"format": "bravin-plugin", "schema": 1, "manifest": man, "files": files}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("Đã tạo", out, "(%d file)" % len(files))
