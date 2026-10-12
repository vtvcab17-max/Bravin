Bravin.connect().then(async function (bravin) {
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (s) { var m = Math.floor(s / 60); return m + ":" + ("0" + (s % 60).toFixed(1)).slice(-4); };
  async function refresh() {
    var tl = await bravin.timeline.get();
    $("dur").textContent = fmt(tl.duration);
    $("n").textContent = tl.clips.length;
    $("nt").textContent = tl.clips.filter(function (c) { return c.type === "text"; }).length;
    $("s").textContent = tl.selection.length + " clip";
  }
  bravin.on("timeline.changed", refresh);
  bravin.on("selection.changed", refresh);
  bravin.on("project.loaded", refresh);
  $("add").onclick = async function () {
    try { $("err").textContent = ""; var tl = await bravin.timeline.get(); await bravin.timeline.addText({ text: $("txt").value, start: tl.playhead, dur: 2 }); }
    catch (e) { $("err").textContent = e.message; }
  };
  refresh();
}).catch(function (e) { document.body.textContent = e.message; });
