/* Bravin Plugin SDK v1 — chạy BÊN TRONG plugin (iframe sandbox). Không phụ thuộc thư viện nào.
   Dùng:  const bravin = await Bravin.connect();  await bravin.timeline.addText({ text: "Xin chào" });
   Bravin tự chèn file này vào plugin, nên thường không cần thẻ <script> riêng. */
(function (root) {
  "use strict";
  if (root.Bravin && root.Bravin.__sdk) return;
  var pending = new Map(), handlers = {}, seq = 0, info = null, readyP = null, subscribed = {};
  function post(msg) { msg.bravin = "plugin"; msg.v = 1; root.parent.postMessage(msg, "*"); }
  function err(e) { var x = new Error(e && e.message || "Lỗi không rõ"); x.code = e && e.code || "error"; return x; }
  function call(method, params, timeoutMs) {
    return new Promise(function (res, rej) {
      var id = ++seq, to = setTimeout(function () { pending.delete(id); rej(err({ code: "timeout", message: "Bravin không trả lời (" + method + ")" })); }, timeoutMs || 30000);
      pending.set(id, { res: res, rej: rej, to: to });
      post({ id: id, method: method, params: params || {} });
    });
  }
  function emit(name, data) { (handlers[name] || []).slice().forEach(function (f) { try { f(data); } catch (e) { console.error("[Bravin] handler", name, e); } }); }
  root.addEventListener("message", function (e) {
    if (e.source !== root.parent) return;
    var m = e.data; if (!m || m.bravin !== "host") return;
    if (m.type === "res") {
      var p = pending.get(m.id); if (!p) return; pending.delete(m.id); clearTimeout(p.to);
      m.ok ? p.res(m.result) : p.rej(err(m.error));
    } else if (m.type === "evt") emit(m.name, m.data);
  });
  function on(name, fn) {
    (handlers[name] = handlers[name] || []).push(fn);
    if (!subscribed[name] && name !== "ready") { subscribed[name] = 1; call("events.subscribe", { name: name }).catch(function () {}); }
    return function () { off(name, fn); };
  }
  function off(name, fn) { handlers[name] = (handlers[name] || []).filter(function (f) { return f !== fn; }); }
  var api = {
    get info() { return info; },
    has: function (perm) { return !!info && info.permissions.indexOf(perm) >= 0; },
    on: on, off: off, call: call,
    app: { info: function () { return call("app.info"); } },
    timeline: {
      get: function () { return call("timeline.get"); },
      seek: function (time) { return call("timeline.seek", { time: time }); },
      addText: function (o) { return call("timeline.addText", o); },
      addMedia: function (o) { return call("timeline.addMedia", o); },
      updateClip: function (id, patch, o) { return call("timeline.updateClip", Object.assign({ id: id, patch: patch }, o || {})); },
      removeClip: function (id) { return call("timeline.removeClip", { id: id }); },
      select: function (ids) { return call("timeline.select", { ids: [].concat(ids || []) }); },
      undo: function () { return call("timeline.undo"); },
      /* API v2 */
      checkpoint: function () { return call("timeline.checkpoint"); },
      getClip: function (id) { return call("timeline.getClip", { id: id }); },
      duplicateClip: function (id, o) { return call("timeline.duplicateClip", Object.assign({ id: id }, o || {})); },
      setMask: function (id, o) { return call("timeline.setMask", Object.assign({ id: id }, o || {}), 60000); },
      setPin: function (id, o) { return call("timeline.setPin", Object.assign({ id: id }, o || {}), 60000); },
      setKeyframes: function (id, props, o) { return call("timeline.setKeyframes", Object.assign({ id: id, props: props }, o || {}), 60000); },
      applyTrack: function (id, o) { return call("timeline.applyTrack", Object.assign({ id: id }, o || {}), 60000); }
    },
    /* API v2: đọc khung hình của một clip (quyền video.frames) */
    frames: {
      open: function (clipId, o) { return call("frames.open", Object.assign({ clipId: clipId }, o || {}), 60000); },
      get: function (session, t) { return call("frames.get", { session: session, t: t }, 60000); },
      close: function (session) { return call("frames.close", { session: session }); }
    },
    playback: { play: function () { return call("playback.play"); }, pause: function () { return call("playback.pause"); } },
    media: {
      list: function () { return call("media.list"); },
      import: function (o) { return call("media.import", o, 120000); }
    },
    project: { snapshotFrame: function (o) { return call("project.snapshotFrame", o, 60000); } },
    ui: {
      toast: function (message) { return call("ui.toast", { message: String(message) }); },
      openPanel: function (o) { return call("ui.panel.open", o || {}); },
      closePanel: function () { return call("ui.panel.close"); },
      setPanelTitle: function (title) { return call("ui.panel.setTitle", { title: title }); },
      registerCommand: function (cmd, fn) { if (fn) on("command:" + cmd.id, fn); return call("ui.registerCommand", cmd); }
    },
    storage: {
      get: function (k) { return call("storage.get", { key: k }); },
      set: function (k, v) { return call("storage.set", { key: k, value: v }); },
      remove: function (k) { return call("storage.remove", { key: k }); },
      keys: function () { return call("storage.keys"); }
    },
    net: { fetch: function (url, o) { return call("net.fetch", Object.assign({ url: url }, o || {}), 120000); } },
    /* onCommand(fn): fn({ id, context, clipId, selection }) — mọi lệnh của plugin */
    onCommand: function (fn) { return on("command", fn); }
  };
  function connect(opts) {
    if (readyP) return readyP;
    readyP = new Promise(function (res, rej) {
      var tries = 0, timer = setInterval(function () {
        if (++tries > 40) { clearInterval(timer); readyP = null; rej(err({ code: "timeout", message: "Không kết nối được Bravin. Plugin phải chạy bên trong Bravin (Tiện ích → Cài plugin)." })); return; }
        call("hello", { sdk: 1, name: opts && opts.name }, 3000).then(function (r) { clearInterval(timer); info = r; res(api); emit("ready", r); }).catch(function () {});
      }, 250);
    });
    return readyP;
  }
  root.Bravin = { __sdk: 1, version: 2, connect: connect };
})(typeof window !== "undefined" ? window : this);
