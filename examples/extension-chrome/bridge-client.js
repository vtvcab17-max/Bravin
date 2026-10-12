/* Mã này được tiêm vào TRANG BRAVIN (world MAIN) bằng chrome.scripting.executeScript.
   Nó nói chuyện với Bravin qua window.postMessage — xem docs/PLUGIN_SDK.md, mục "Cầu nối extension". */
function bravinBridgeCall(ext, method, params) {
  return new Promise(function (resolve) {
    var id = Math.random().toString(36).slice(2), t = setTimeout(function () { done({ ok: false, error: { code: "timeout", message: "Bravin không trả lời" } }); }, 120000);
    function done(m) { clearTimeout(t); removeEventListener("message", h); resolve(m); }
    function h(e) { var m = e.data; if (e.source === window && m && m.bravin === "bridge-res" && m.id === id) done(m); }
    addEventListener("message", h);
    postMessage({ bravin: "bridge", v: 1, id: id, ext: ext, method: method, params: params || {} }, location.origin);
  });
}
async function sendToBravin(ext, mode, url) {
  var hi = await bravinBridgeCall(ext, "hello");           // lần đầu Bravin hỏi người dùng có cho phép không
  if (!hi.ok) return hi;
  return mode === "import" ? bravinBridgeCall(ext, "media.import", { url: url }) : bravinBridgeCall(ext, "openLink", { url: url });
}
