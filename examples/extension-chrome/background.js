"use strict";
const EXT = { id: "com.doi-ngu.gui-sang-bravin", name: "Gửi sang Bravin" };
const MENU = "gui-sang-bravin";
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU, title: "Gửi sang Bravin", contexts: ["video", "audio", "image", "link"] });
});
const pick = info => info.srcUrl || info.linkUrl || info.pageUrl;
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU) return;
  const { bravinUrl = "", mode = "link" } = await chrome.storage.sync.get(["bravinUrl", "mode"]), url = pick(info);
  if (!bravinUrl) { chrome.runtime.openOptionsPage(); return; }
  const origin = new URL(bravinUrl).origin;
  const tabs = await chrome.tabs.query({ url: origin + "/*" }).catch(() => []);
  const tab = tabs.find(t => t.url.startsWith(bravinUrl)) || tabs[0];
  if (!tab) { chrome.tabs.create({ url: bravinUrl + "#import=" + encodeURIComponent(url) }); return; }   // Bravin chưa mở: mở và nhờ tham số #import=
  await chrome.tabs.update(tab.id, { active: true });
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id }, world: "MAIN",
    files: ["bridge-client.js"]
  }).then(() => chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: (e, m, u) => sendToBravin(e, m, u), args: [EXT, mode, url] }));
  const r = res && res.result;
  if (r && !r.ok) { chrome.action.setBadgeText({ text: "!" }); chrome.action.setTitle({ title: "Bravin: " + r.error.message }); setTimeout(() => chrome.action.setBadgeText({ text: "" }), 5000); }
});
