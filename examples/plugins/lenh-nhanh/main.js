Bravin.connect().then(function (bravin) {
  bravin.on("command:outro", async function () {
    var tl = await bravin.timeline.get();
    await bravin.timeline.addText({ text: "Cảm ơn đã xem!", start: Math.max(0, tl.duration - 2), dur: 2 });
    bravin.ui.toast("Đã thêm chữ cảm ơn.");
  });
  bravin.on("command:tieude", async function (cmd) {
    var tl = await bravin.timeline.get();
    var c = tl.clips.filter(function (x) { return x.id === cmd.clipId; })[0];
    if (!c) return bravin.ui.toast("Chọn một clip.");
    await bravin.timeline.addText({ text: (c.mediaName || "Clip").replace(/\.[^.]+$/, ""), start: c.start, dur: Math.min(3, c.dur) });
  });
});
