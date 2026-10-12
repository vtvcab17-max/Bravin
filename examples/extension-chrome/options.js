const $ = id => document.getElementById(id);
chrome.storage.sync.get(["bravinUrl", "mode"]).then(v => { $("u").value = v.bravinUrl || ""; $("m").value = v.mode || "link"; });
$("s").onclick = async () => {
  try {
    const u = new URL($("u").value.trim()); if (!/^https?:$/.test(u.protocol)) throw 0;
    const ok = await chrome.permissions.request({ origins: [u.origin + "/*"] });
    if (!ok) { $("st").textContent = "Cần cấp quyền truy cập trang Bravin."; return; }
    await chrome.storage.sync.set({ bravinUrl: u.href, mode: $("m").value }); $("st").textContent = "Đã lưu. Chuột phải vào video → Gửi sang Bravin.";
  } catch (_) { $("st").textContent = "Địa chỉ không hợp lệ."; }
};
