"use strict";
/* ============================================================================
   AI workflow canvas ("Luồng AI").
   The assistant's settings are a node graph: Lệnh người dùng → AI → Thao tác
   timeline → Trả lời, plus logic nodes (Điều kiện, Gộp, Lặp lại, Mẫu văn bản,
   Trạng thái timeline, Ghi chú). Wires carry text between nodes.
   Connections:
     - API: paste only the key → provider, base URL and model are detected.
     - Local: paste a local link (Ollama / LM Studio / llama.cpp / Jan / vLLM)
       or press "Dò AI local" to probe the usual ports.
     - Embedded: the model runs inside Bravin (transformers.js, WebGPU or WASM);
       the runtime is loaded from vendor/transformers/ when bundled with the
       desktop build, otherwise from the CDN; weights are cached after the
       first download (or read from models/ next to the app).
   Executor: a node runs once every wire into it has delivered a value; when
   nothing is ready, partially-fed nodes are flushed. Loops are allowed and
   capped (60 node runs per command).
   ========================================================================== */

/* ---------- key / link detection ---------- */
const KEY_RULES = [
  [/^sk-ant-/, { type: "anthropic", base: "https://api.anthropic.com", label: "Anthropic (Claude)" }],
  [/^sk-or-/, { type: "openai", base: "https://openrouter.ai/api/v1", label: "OpenRouter" }],
  [/^AIza[0-9A-Za-z_-]{20,}/, { type: "gemini", base: "https://generativelanguage.googleapis.com", label: "Google Gemini" }],
  [/^AQ\.[0-9A-Za-z_-]{20,}/, { type: "gemini", base: "https://generativelanguage.googleapis.com", label: "Google Gemini" }],
  [/^gsk_/, { type: "openai", base: "https://api.groq.com/openai/v1", label: "Groq" }],
  [/^xai-/, { type: "openai", base: "https://api.x.ai/v1", label: "xAI (Grok)" }],
  [/^pplx-/, { type: "openai", base: "https://api.perplexity.ai", label: "Perplexity" }],
  [/^nvapi-/, { type: "openai", base: "https://integrate.api.nvidia.com/v1", label: "NVIDIA" }],
  [/^hf_/, { type: "openai", base: "https://router.huggingface.co/v1", label: "Hugging Face" }],
  [/^fw_/, { type: "openai", base: "https://api.fireworks.ai/inference/v1", label: "Fireworks" }]
];
const KEY_GUESS = [ // keys without a distinctive prefix: try these in order
  { type: "openai", base: "https://api.openai.com/v1", label: "OpenAI" }, { type: "openai", base: "https://api.deepseek.com/v1", label: "DeepSeek" },
  { type: "openai", base: "https://api.mistral.ai/v1", label: "Mistral" }, { type: "openai", base: "https://api.together.xyz/v1", label: "Together" },
  { type: "openai", base: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", label: "Qwen (DashScope)" }, { type: "openai", base: "https://api.moonshot.ai/v1", label: "Moonshot (Kimi)" }
];
const LOCAL_PORTS = [["http://localhost:11434", "ollama", "Ollama"], ["http://localhost:1234/v1", "lmstudio", "LM Studio"], ["http://localhost:8080/v1", "lmstudio", "llama.cpp"], ["http://localhost:1337/v1", "lmstudio", "Jan"], ["http://localhost:8000/v1", "lmstudio", "vLLM"], ["http://localhost:5001/v1", "lmstudio", "KoboldCpp"], ["http://localhost:4891/v1", "lmstudio", "GPT4All"]];
const MODEL_PREF = [/claude-opus/, /claude-sonnet/, /gpt-5(?!.*(mini|nano))/, /gemini-[\d.]+-pro/, /grok-4/, /deepseek-(chat|v3)/, /gpt-4\.1(?!-(mini|nano))/, /gpt-4o(?!-mini)/, /qwen3|qwen2\.5/, /llama-?3/, /mistral-large/, /claude-haiku/, /gemini-[\d.]+-flash(?!-lite)/, /mini/, /./];
const MODEL_SKIP = /embed|whisper|tts|audio|image|dall|moderation|search|realtime|transcribe|vision-preview|guard|computer-use|robotics|lyria|banana|antigravity|customtools|omni|gemma|veo|imagen|aqa|learnlm/i;
function bestModel(list) { const L = list.filter(m => !MODEL_SKIP.test(m)); for (const re of MODEL_PREF) { const hits = L.filter(m => re.test(m.toLowerCase())).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })); if (hits.length) return hits[0]; } return list[0] || ""; }
function rankModels(list) { const L = list.filter(m => !MODEL_SKIP.test(m)), out = []; for (const re of MODEL_PREF) L.filter(m => re.test(m.toLowerCase()) && !out.includes(m)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).forEach(m => out.push(m)); return out; }
/* model bị khoá (404), hết hạn mức gói miễn phí (429) hoặc quá tải (503) → thử model kế tiếp và nhớ model chạy được */
const MODEL_RETRY = /^(404|429|503)\b/;
async function callWithFallback(call, s, sys, user, signal) {
  try { return await call(s, sys, user, signal); }
  catch (e) {
    if (!e || e.name === "AbortError" || !MODEL_RETRY.test(e.message || "") || !s.base || s.type === "embed" || s.type === "claude") throw e;
    let list = s.models && s.models.length ? s.models : null; if (!list) { try { list = await listModels(s); } catch (_) { throw e; } }
    const tried = new Set([s.model]); let last = e, lastM = s.model;
    for (const m of rankModels(list)) {
      if (tried.has(m)) continue; if (tried.size >= 6) break; tried.add(m);
      s._prog && s._prog(`Model ${lastM} không dùng được (lỗi ${(last.message || "").slice(0, 3)}), thử ${m}…`);
      try { const out = await call(Object.assign({}, s, { model: m }), sys, user, signal); s.model = m; s._onModel && s._onModel(m); return out; }
      catch (e2) { if (e2 && e2.name === "AbortError") throw e2; if (!MODEL_RETRY.test(e2.message || "")) throw e2; last = e2; lastM = m; }
    }
    throw new Error((e.message || e) + " · Đã thử thêm " + (tried.size - 1) + " model khác nhưng đều lỗi. Với gói miễn phí, hãy chọn model dòng Flash.");
  }
}
async function probeLocal(url, type) {
  const base = url.replace(/\/+$/, ""), tries = type ? [[type, base]] : /11434/.test(base) ? [["ollama", base.replace(/\/v1$/, "")]] : [["ollama", base.replace(/\/v1$/, "")], ["lmstudio", /\/v1$/.test(base) ? base : base + "/v1"], ["lmstudio", base]];
  for (const [ty, b] of tries) { try { const ms = await listModels({ type: ty, base: b, key: "" }); return { type: ty, base: b, models: ms }; } catch (_) {} }
  return null;
}
/* turn "whatever the user pasted" into a working connection */
async function resolveConn(input, onStep) {
  const v = String(input || "").trim(); if (!v) throw new Error("Chưa dán mã API hoặc đường link.");
  if (/^https?:\/\//i.test(v)) {
    onStep && onStep("Đang dò " + v + "…"); const r = await probeLocal(v); if (r) return Object.assign(r, { key: "", label: (r.type === "ollama" ? "Ollama" : "Máy chủ tương thích OpenAI") + " · " + new URL(r.base).host });
    throw new Error("Không kết nối được " + v + ". Kiểm tra ứng dụng AI local đang chạy và đã bật CORS (Ollama: OLLAMA_ORIGINS=*; LM Studio: Enable CORS).");
  }
  const rule = KEY_RULES.find(([re]) => re.test(v)); const cands = rule ? [rule[1]] : KEY_GUESS;
  let lastErr = null;
  for (const c of cands) {
    onStep && onStep("Đang thử " + c.label + "…");
    try { const ms = c.type === "anthropic" ? AI_TYPES.anthropic.models.slice() : await listModels({ type: c.type, base: c.base, key: v }); return Object.assign({}, c, { key: v, models: ms }); }
    catch (e) { lastErr = e; if (rule) break; }
  }
  const em = lastErr ? String(lastErr.message || lastErr) : "";
  if (rule) throw new Error(/^(400|401|403)\b/.test(em) ? `Mã ${rule[1].label} không hợp lệ, đã bị thu hồi hoặc chưa được cấp quyền (${em.slice(0, 160)}). Kiểm tra lại mã rồi dán lần nữa.` : `Không kết nối được ${rule[1].label}: ${em.slice(0, 200)}`);
  throw new Error("Không nhận ra mã này" + (em ? ": " + em.slice(0, 200) : "") + ". Bạn có thể mở Luồng AI → Nâng cao để tự điền địa chỉ.");
}
async function scanLocal(onStep) { const found = []; await Promise.all(LOCAL_PORTS.map(async ([u, ty, name]) => { const r = await Promise.race([probeLocal(u, ty), sleep(1500).then(() => null)]); if (r) found.push(Object.assign(r, { label: name + " · " + new URL(r.base).host })); })); onStep && onStep(found.length ? "Tìm thấy " + found.map(f => f.label).join(", ") : "Không thấy AI local nào đang chạy."); return found; }

/* ---------- embedded model (runs inside Bravin) ---------- */
const EMBED_MODELS = {
  "qwen2.5-0.5b": ["onnx-community/Qwen2.5-0.5B-Instruct", "Qwen2.5 0.5B · rất nhẹ ~0,5 GB"],
  "qwen2.5-1.5b": ["onnx-community/Qwen2.5-1.5B-Instruct", "Qwen2.5 1.5B · cân bằng ~1,2 GB"],
  "llama3.2-1b": ["onnx-community/Llama-3.2-1B-Instruct", "Llama 3.2 1B · ~1 GB"],
  "phi3.5-mini": ["onnx-community/Phi-3.5-mini-instruct-onnx-web", "Phi-3.5 mini · mạnh hơn ~2,2 GB (cần WebGPU)"]
};
const _embed = new Map();
let _tfLocalChecked = false;
const _loadTF0 = loadTF;
loadTF = async function () { // prefer a bundled runtime (desktop build) over the CDN
  if (!_tfLocalChecked) { _tfLocalChecked = true; try { const r = await fetch("vendor/transformers/transformers.min.js", { method: "HEAD" }); if (r.ok) { AI_CDN.transformers = new URL("vendor/transformers/transformers.min.js", location.href).href; AI_CDN.localRuntime = true; } } catch (_) {} }
  const tf = await _loadTF0();
  try { if (AI_CDN.localRuntime && tf.env && tf.env.backends && tf.env.backends.onnx && tf.env.backends.onnx.wasm) tf.env.backends.onnx.wasm.wasmPaths = new URL("vendor/transformers/", location.href).href; } catch (_) {}
  try { if (tf.env) { tf.env.allowLocalModels = !!AI_CDN.localModels; if (AI_CDN.localModels) tf.env.localModelPath = AI_CDN.localModelPath || new URL("models/", location.href).href; } } catch (_) {}
  return tf;
};
async function getEmbed(id, onProgress) {
  const key = id; if (_embed.has(key)) return _embed.get(key);
  const p = (async () => {
    const tf = await loadTF(); const repo = (EMBED_MODELS[id] || [id])[0]; const gpu = !!navigator.gpu;
    const files = new Map(); const prog = x => { if (x && x.file && x.total) { files.set(x.file, [x.loaded || 0, x.total]); let a = 0, b = 0; files.forEach(([l, t2]) => { a += l; b += t2; }); onProgress && onProgress(`Đang tải model ${Math.round(a / 1048576)}/${Math.round(b / 1048576)} MB`); } };
    let pipe = null, err = null;
    for (const opt of gpu ? [{ device: "webgpu", dtype: "q4f16" }, { device: "wasm", dtype: "q4" }] : [{ device: "wasm", dtype: "q4" }]) { try { pipe = await tf.pipeline("text-generation", repo, Object.assign({ progress_callback: prog }, opt)); break; } catch (e) { err = e; } }
    if (!pipe) throw new Error("Không nạp được model nhúng: " + (err && err.message || err));
    return pipe;
  })();
  _embed.set(key, p); p.catch(() => _embed.delete(key)); return p;
}
async function embedChat(s, sys, user, signal, onProgress) {
  const pipe = await getEmbed(s.model || "qwen2.5-0.5b", onProgress); if (signal && signal.aborted) { const e = new Error("Đã dừng"); e.name = "AbortError"; throw e; }
  onProgress && onProgress("Đang sinh chữ trên máy…");
  const out = await pipe([{ role: "system", content: sys }, { role: "user", content: user }], { max_new_tokens: s.maxTokens || 900, do_sample: false });
  const g0 = out && out[0] && out[0].generated_text; if (Array.isArray(g0)) { const last = g0[g0.length - 1]; return (last && last.content) || ""; } return String(g0 || "");
}
const _callAI0 = callAI;
callAI = async function (s, sys, user, signal) { if (s.type === "embed") return embedChat(s, sys, user, signal, s._prog); return callWithFallback(_callAI0, s, sys, user, signal); };

/* ---------- node types ---------- */
const FLOW_TESTS = { contains: "Có chứa", notcontains: "Không chứa", regex: "Khớp biểu thức (regex)", json: "Là JSON thao tác hợp lệ", hasops: "Có ít nhất 1 thao tác", empty: "Rỗng", longer: "Dài hơn N ký tự", error: "Bắt đầu bằng \"Lỗi\"" };
const FLOW_DEF = {
  start: { t: "Lệnh người dùng", col: "#2f6b45", fixed: true, ins: [], outs: [["Lệnh", "text"], ["Trạng thái timeline", "state"]] },
  ai: { t: "AI", col: "#4a3f8f", ins: [["Vào", "text", true]], outs: [["Trả lời", "text"]] },
  apply: { t: "Thao tác timeline", col: "#6b5a2f", ins: [["Lệnh JSON", "ops"]], outs: [["Xong", "text"], ["Lỗi", "text"]] },
  reply: { t: "Trả lời người dùng", col: "#2f6b45", ins: [["Vào", "text", true]], outs: [] },
  cond: { t: "Điều kiện", col: "#6b3f5a", ins: [["Vào", "text"]], outs: [["Đúng", "flow"], ["Sai", "flow"]] },
  merge: { t: "Gộp", col: "#3f5a6b", ins: [["Vào", "text", true]], outs: [["Ra", "text"]] },
  loop: { t: "Lặp lại", col: "#6b4a2f", ins: [["Vào", "text"]], outs: [["Lặp tiếp", "flow"], ["Hết lượt", "flow"]] },
  tpl: { t: "Mẫu văn bản", col: "#3f4f6b", ins: [["Vào", "text", true]], outs: [["Ra", "text"]] },
  state: { t: "Trạng thái timeline", col: "#2f5f6b", ins: [], outs: [["Bảng trạng thái", "state"]] },
  note: { t: "Ghi chú", col: "#3a3b45", ins: [], outs: [] }
};
const fnid = p => p + "_" + Math.random().toString(36).slice(2, 7);
function flowNode(type, x, y, over) { const n = Object.assign({ id: fnid(type), type, x, y, on: true }, over || {}); if (type === "ai") Object.assign(n, { name: n.name || "AI", src: n.src || (ON_CLAUDE ? "claude" : "paste"), conn: n.conn || "", ctype: n.ctype || "", base: n.base || "", key: n.key || "", model: n.model || "", fmt: n.fmt || "text", withState: n.withState !== false, skill: n.skill || "" }); if (type === "cond") Object.assign(n, { test: n.test || "contains", val: n.val || "" }); if (type === "loop") n.max = n.max || 2; if (type === "tpl") n.tpl = n.tpl || "Viết lại cho ngắn gọn:\n{{vào}}"; if (type === "merge") n.mode = n.mode || "all"; if (type === "note") n.text = n.text || "Ghi chú…"; return n; }
const flk = (a, ap, b, bp) => ({ id: fnid("lk"), from: [a.id, ap], to: [b.id, bp] });
const FLOW_TEMPLATES = {
  plan: ["Lập kế hoạch rồi thao tác", () => { const s = flowNode("start", 20, 120), a = flowNode("ai", 250, 40, { name: "AI lập kế hoạch", src: ON_CLAUDE ? "claude" : "paste", model: ON_CLAUDE ? "claude-sonnet-5-5" : "", skill: SKILL_PLAN }), b = flowNode("ai", 520, 120, { name: "AI thao tác", src: ON_CLAUDE ? "claude" : "paste", model: ON_CLAUDE ? "claude-opus-5-5" : "", fmt: "ops", skill: SKILL_ACT }), ap = flowNode("apply", 790, 120), r = flowNode("reply", 1040, 100), r2 = flowNode("reply", 1040, 230, { name: "Báo lỗi" }); return { nodes: [s, a, b, ap, r, r2], links: [flk(s, 0, a, 0), flk(s, 0, b, 0), flk(a, 0, b, 0), flk(b, 0, ap, 0), flk(ap, 0, r, 0), flk(ap, 1, r2, 0)] }; }],
  single: ["Một AI thao tác", () => { const s = flowNode("start", 20, 100), b = flowNode("ai", 260, 80, { name: "AI thao tác", fmt: "ops", skill: SKILL_ACT, model: ON_CLAUDE ? "claude-opus-5-5" : "" }), ap = flowNode("apply", 540, 100), r = flowNode("reply", 800, 90); return { nodes: [s, b, ap, r], links: [flk(s, 0, b, 0), flk(b, 0, ap, 0), flk(ap, 0, r, 0), flk(ap, 1, r, 0)] }; }],
  retry: ["Thao tác + tự sửa khi lỗi", () => { const s = flowNode("start", 20, 120), b = flowNode("ai", 260, 100, { name: "AI thao tác", fmt: "ops", skill: SKILL_ACT + " Nếu nhận được báo lỗi từ lần trước, sửa đúng chỗ sai rồi xuất lại.", model: ON_CLAUDE ? "claude-opus-5-5" : "" }), ap = flowNode("apply", 540, 120), lp = flowNode("loop", 540, 300, { max: 2 }), r = flowNode("reply", 820, 80), r2 = flowNode("reply", 820, 320, { name: "Báo lỗi" }); return { nodes: [s, b, ap, lp, r, r2], links: [flk(s, 0, b, 0), flk(b, 0, ap, 0), flk(ap, 0, r, 0), flk(ap, 1, lp, 0), flk(lp, 0, b, 0), flk(lp, 1, r2, 0)] }; }],
  vote: ["Hai AI đề xuất, AI thứ ba chọn", () => { const s = flowNode("start", 20, 160), a = flowNode("ai", 250, 40, { name: "AI đề xuất A", skill: SKILL_PLAN }), a2 = flowNode("ai", 250, 260, { name: "AI đề xuất B", skill: SKILL_PLAN }), m = flowNode("merge", 520, 160), j = flowNode("ai", 720, 140, { name: "AI chọn và thao tác", fmt: "ops", skill: "So sánh các đề xuất, chọn phương án tốt nhất (hoặc kết hợp) rồi xuất thao tác." }), ap = flowNode("apply", 980, 160), r = flowNode("reply", 1220, 150); return { nodes: [s, a, a2, m, j, ap, r], links: [flk(s, 0, a, 0), flk(s, 0, a2, 0), flk(a, 0, m, 0), flk(a2, 0, m, 0), flk(m, 0, j, 0), flk(s, 0, j, 0), flk(j, 0, ap, 0), flk(ap, 0, r, 0), flk(ap, 1, r, 0)] }; }],
  check: ["Kiểm duyệt từ ngữ cấm", () => { const s = flowNode("start", 20, 120), b = flowNode("ai", 250, 100, { name: "AI thao tác", fmt: "ops", skill: SKILL_ACT }), cd = flowNode("cond", 520, 100, { test: "regex", val: "từ cấm 1|từ cấm 2" }), fix = flowNode("ai", 760, 260, { name: "AI sửa chữ vi phạm", fmt: "ops", skill: "Thay mọi cụm từ bị cấm bằng cách diễn đạt an toàn, giữ nguyên ý, rồi xuất lại toàn bộ thao tác." }), ap = flowNode("apply", 1000, 100), r = flowNode("reply", 1240, 100); return { nodes: [s, b, cd, fix, ap, r], links: [flk(s, 0, b, 0), flk(b, 0, cd, 0), flk(cd, 1, ap, 0), flk(cd, 0, fix, 0), flk(fix, 0, ap, 0), flk(ap, 0, r, 0), flk(ap, 1, r, 0)] }; }]
};
/* migrate the old two-chain settings into a flow */
function flowFromChain(list) {
  const on = (list || []).filter(s => s.on); if (!on.length) return null; const s0 = flowNode("start", 20, 120); const nodes = [s0], links = []; let prev = null; const hasAct = on.some(s => s.role === "act");
  on.forEach((s, i) => { const isAct = s.role === "act" || (!hasAct && i === on.length - 1); const n = flowNode("ai", 250 + i * 260, 100, { name: s.name, src: s.type === "claude" ? "claude" : "paste", ctype: s.type === "claude" ? "" : s.type, base: s.base, key: s.key, model: s.model, conn: s.key || (AI_TYPES[s.type] && AI_TYPES[s.type].where === "local" ? s.base : ""), skill: s.skill, fmt: isAct ? "ops" : "text" }); nodes.push(n); links.push(flk(s0, 0, n, 0)); if (prev) links.push(flk(prev, 0, n, 0)); prev = n; });
  const ap = flowNode("apply", 250 + on.length * 260, 120), r = flowNode("reply", 500 + on.length * 260, 110); nodes.push(ap, r); links.push(flk(prev, 0, ap, 0), flk(ap, 0, r, 0), flk(ap, 1, r, 0)); return { nodes, links };
}
if (!AIS.flow || !Array.isArray(AIS.flow.nodes)) {
  const used = list => (list || []).some(s => s.on && (s.key || s.model) && s.type !== "claude"); // chuỗi cũ người dùng đã tự cài
  AIS.flow = (AIS.mode === "local" && used(AIS.local) ? flowFromChain(AIS.local) : used(AIS.api) ? flowFromChain(AIS.api) : null) || (ON_CLAUDE ? FLOW_TEMPLATES.plan[1]() : FLOW_TEMPLATES.single[1]());
  AIS.flow.view = { x: 30, y: 30, k: 0.9 };
}
if (AIS.mode === "api" || AIS.mode === "local") AIS.mode = "flow";
if (!ON_CLAUDE && AIS.mode === "builtin") AIS.mode = "flow";

/* ---------- connection of one AI node → callAI step ---------- */
function stepOf(n) {
  if (n.src === "claude") throw new Error(`"${n.name}" chưa kết nối: dán mã API của bạn (Bravin không có AI tích hợp sẵn).`);
  if (n.src === "embed") return { name: n.name, type: "embed", model: n.model && EMBED_MODELS[n.model] ? n.model : "qwen2.5-0.5b", maxTokens: n.fmt === "ops" ? 1200 : 700 };
  if (!n.ctype || !n.base) throw new Error(`"${n.name}" chưa kết nối: dán mã API hoặc đường link rồi bấm Kết nối.`);
  return { name: n.name, type: n.ctype, base: n.base, key: n.key, model: n.model, models: n.models, _onModel: m => { n.model = m; saveAIS(); try { flowUI.api && flowUI.api.render(); } catch (_) {} } };
}
async function connectNode(n, status) {
  const r = await resolveConn(n.conn, status); n.ctype = r.type; n.base = r.base; n.key = r.key || ""; n.models = (r.models || []).slice(0, 400); n.provider = r.label;
  if (!n.model || (n.models.length && !n.models.includes(n.model))) n.model = bestModel(n.models);
  saveAIS(); return r;
}
function connLabel(n) { if (n.src === "claude") return "Claude trong claude.ai · " + (n.model || "claude-opus-5-5"); if (n.src === "embed") return "Nhúng trong Bravin · " + ((EMBED_MODELS[n.model] || EMBED_MODELS["qwen2.5-0.5b"])[1].split(" · ")[0]); if (!n.ctype) return "Chưa kết nối"; return (n.provider || n.ctype) + (n.model ? " · " + n.model : ""); }

/* ---------- executor ---------- */
let flowUI = null;
function flowStatus(id, txt, cls) { if (flowUI && flowUI.api) flowUI.api.setStatus(id, txt, cls); }
function flowWire(lk, on) { lk.active = on; if (flowUI && flowUI.api) flowUI.api.redrawWires(); }
function testCond(n, v) {
  const s = String(v == null ? "" : v), val = n.val || "";
  switch (n.test) {
    case "contains": return s.toLowerCase().includes(val.toLowerCase()); case "notcontains": return !s.toLowerCase().includes(val.toLowerCase());
    case "regex": try { return new RegExp(val, "i").test(s); } catch (_) { return false; }
    case "json": { const j = parseOpsJSON(s); return !!(j && Array.isArray(j.ops)); } case "hasops": { const j = parseOpsJSON(s); return !!(j && Array.isArray(j.ops) && j.ops.length); }
    case "empty": return !s.trim(); case "longer": return s.length > (+val || 0); case "error": return /^\s*lỗi/i.test(s);
  }
  return false;
}
async function runFlow(text, opts = {}) {
  const F = AIS.flow, nodes = F.nodes.filter(n => n.on !== false), byId = new Map(nodes.map(n => [n.id, n])), links = F.links.filter(l => byId.has(l.from[0]) && byId.has(l.to[0]));
  if (!nodes.some(n => n.type === "start")) { addMsg("c", "Luồng AI chưa có node \"Lệnh người dùng\"."); return; }
  if (playing) pause(); if (!opts.silentUser) addMsg("u", text);
  aiCtl = new AbortController(); const signal = aiCtl.signal; $("#aiSend").hidden = true; $("#aiStop").hidden = false; document.body.classList.add("aibusy");
  nodes.forEach(n => flowStatus(n.id, "", "")); links.forEach(l => l.active = false);
  const recv = new Map(), loops = new Map(), order = ngTopo({ nodes, links }) || nodes.map(n => n.id); let runs = 0, pushed = false, lastReply = "", replied = false;
  const stateTxt = () => JSON.stringify(describeState());
  const emit = (n, port, value) => { for (const l of links) if (l.from[0] === n.id && l.from[1] === port) { flowWire(l, true); if (!recv.has(l.to[0])) recv.set(l.to[0], new Map()); recv.get(l.to[0]).set(l.id, { value, from: n, port: l.to[1] }); } };
  const inLinks = id => links.filter(l => l.to[0] === id);
  const ready = id => { const r = recv.get(id); if (!r || !r.size) return false; return inLinks(id).every(l => r.has(l.id)); };
  const title = n => n.name || FLOW_DEF[n.type].t;
  const label = v => typeof v === "string" ? v : JSON.stringify(v);
  async function run(n, inputs) {
    runs++; inLinks(n.id).forEach(l => flowWire(l, false)); flowStatus(n.id, "Đang chạy…", "run");
    const vals = inputs.map(x => x.value), joined = inputs.map(x => (inputs.length > 1 ? `[${title(x.from)}]\n` : "") + label(x.value)).join("\n\n");
    switch (n.type) {
      case "ai": {
        const s = stepOf(n); s._prog = m => flowStatus(n.id, m, "run");
        const bub = document.createElement("div"); bub.className = "msg c step think"; bub.innerHTML = '<span class="who"></span><span class="tx">Đang chạy…</span>'; bub.querySelector(".who").textContent = title(n) + (n.fmt === "ops" ? " · thao tác" : ""); msgsEl.appendChild(bub); msgsEl.scrollTop = msgsEl.scrollHeight;
        const sys = (n.skill ? "SKILL CỦA BẠN:\n" + n.skill + "\n\n" : "") + RULES_CHAIN + (n.fmt === "ops" ? ACT_FMT : THINK_FMT);
        const extra = inputs.filter(x => !(x.from.type === "start" && x.value === text));
        const user = (n.withState !== false ? `TRẠNG THÁI HIỆN TẠI:\n${stateTxt()}\n\n` : "") + `LỆNH NGƯỜI DÙNG: ${text}` + (extra.length ? "\n\nĐẦU VÀO TỪ CÁC NODE TRƯỚC:\n" + extra.map(x => `[${title(x.from)}]\n${label(x.value)}`).join("\n\n") : "");
        let out = ""; try { out = await callAI(s, sys, user, signal); } catch (e) { bub.classList.remove("think"); bub.querySelector(".tx").textContent = (e && e.name === "AbortError") ? "Đã dừng." : "Lỗi: " + (e.message || e); flowStatus(n.id, (e.message || String(e)).slice(0, 160), "err"); if (e && e.name === "AbortError") throw e; return; }
        bub.classList.remove("think"); if (n.fmt === "ops") { const j = parseOpsJSON(out); setMsg(bub.querySelector(".tx"), j && j.reply ? j.reply : out.slice(0, 600)); } else setMsg(bub.querySelector(".tx"), out);
        flowStatus(n.id, out.slice(0, 140), "ok"); emit(n, 0, out); return;
      }
      case "apply": {
        const j = parseOpsJSON(vals.find(v => typeof v === "string" && v.includes("{")) || vals[0]);
        if (!j || !Array.isArray(j.ops)) { const msg = "Lỗi: AI không trả đúng JSON thao tác. Nội dung nhận được:\n" + label(vals[0]).slice(0, 600); flowStatus(n.id, "JSON không hợp lệ", "err"); emit(n, 1, msg); return; }
        const box = document.createElement("div"); box.className = "steps"; msgsEl.appendChild(box);
        if (!pushed && j.ops.length) { pushUndo(); pushed = true; }
        const r = await applyOps(j.ops, box, signal), ok = r.results.filter(x => x.ok).length, bad = r.results.filter(x => !x.ok);
        lastReply = j.reply || lastReply;
        if (bad.length) { const msg = `Lỗi: ${bad.length}/${r.results.length} thao tác hỏng. ${JSON.stringify(bad).slice(0, 1200)}\nThao tác đã gửi: ${JSON.stringify(j.ops).slice(0, 1500)}`; flowStatus(n.id, `${ok}/${r.results.length} thao tác thành công`, "err"); emit(n, 1, msg); }
        else { flowStatus(n.id, `Xong ${ok} thao tác`, "ok"); emit(n, 0, (j.reply || "Đã thực hiện.") + (j.ops.length ? "" : " (không có thao tác nào)")); }
        return;
      }
      case "reply": { const v = vals.length ? vals.map(label).join("\n\n") : lastReply; const j = /^\s*\{/.test(v) ? parseOpsJSON(v) : null; addMsg("c", j && j.reply ? j.reply : v); lastReply = v; replied = true; flowStatus(n.id, "Đã trả lời", "ok"); return; }
      case "cond": { const v = vals[0], res = testCond(n, v); flowStatus(n.id, res ? "→ Đúng" : "→ Sai", "ok"); emit(n, res ? 0 : 1, v); return; }
      case "loop": { const k = (loops.get(n.id) || 0) + 1; loops.set(n.id, k); const more = k <= (n.max || 1); flowStatus(n.id, more ? `Lượt ${k}/${n.max}` : "Hết lượt", more ? "ok" : "err"); emit(n, more ? 0 : 1, vals[0]); return; }
      case "merge": { flowStatus(n.id, `Gộp ${inputs.length} đầu vào`, "ok"); emit(n, 0, joined); return; }
      case "tpl": { const out = (n.tpl || "{{vào}}").replace(/\{\{\s*vào\s*\}\}/g, joined).replace(/\{\{\s*lệnh\s*\}\}/g, text).replace(/\{\{\s*trạng thái\s*\}\}/g, () => stateTxt()); flowStatus(n.id, out.slice(0, 100), "ok"); emit(n, 0, out); return; }
    }
  }
  try {
    for (const n of nodes) if (n.type === "start") { flowStatus(n.id, text.slice(0, 80), "ok"); emit(n, 0, text); emit(n, 1, stateTxt()); } else if (n.type === "state") { flowStatus(n.id, "Đã gửi", "ok"); emit(n, 0, stateTxt()); }
    while (runs < 60) {
      if (signal.aborted) throw Object.assign(new Error("Đã dừng"), { name: "AbortError" });
      let id = order.find(k => ready(k)); if (!id) id = order.find(k => recv.get(k) && recv.get(k).size && byId.get(k).type !== "start"); if (!id) break;
      const n = byId.get(id), r = recv.get(id); const inputs = [...r.values()].sort((a, b) => a.port - b.port); recv.delete(id);
      if (n.type === "note" || n.type === "start" || n.type === "state") continue;
      await run(n, inputs);
    }
    if (runs >= 60) addMsg("c", "Luồng dừng sau 60 bước để tránh lặp vô hạn. Kiểm tra node Lặp lại hoặc dây vòng.");
    if (!replied && lastReply) addMsg("c", lastReply);
    aiTurns.push({ role: "user", content: "LỆNH: " + text }, { role: "assistant", content: String(lastReply || "").slice(0, 1500) });
  } catch (e) { addMsg("c", (e && e.name === "AbortError" ? "Đã dừng luồng." : "Luồng lỗi: " + (e.message || e)) + " Các bước đã làm vẫn giữ, Ctrl+Z để hoàn tác."); }
  finally { links.forEach(l => l.active = false); if (flowUI && flowUI.api) flowUI.api.redrawWires(); ghostHide(); document.body.classList.remove("aibusy"); $("#aiSend").hidden = false; $("#aiStop").hidden = true; aiCtl = null; syncButtons(); }
}

/* ---------- canvas UI ---------- */
function flowTypes() {
  const T = {};
  for (const [k, d] of Object.entries(FLOW_DEF)) T[k] = {
    title: n => n.name || d.t, color: d.col, fixed: d.fixed, w: k === "note" ? 200 : k === "ai" ? 210 : 170,
    inputs: () => d.ins.map(([name, kind, multi]) => ({ name, kind, multi })), outputs: () => d.outs.map(([name, kind]) => ({ name, kind })),
    badge: n => k === "ai" ? (n.fmt === "ops" ? "JSON" : "") : k === "loop" ? "×" + n.max : "",
    body: (n, b) => {
      if (k === "ai") { const p = el("div", "ng-note"); p.textContent = connLabel(n); b.appendChild(p); if (n.skill) { const s = el("div", "ng-note"); s.textContent = "Skill: " + n.skill.slice(0, 60) + (n.skill.length > 60 ? "…" : ""); b.appendChild(s); } }
      else if (k === "cond") { const p = el("div", "ng-note"); p.textContent = FLOW_TESTS[n.test] + (["contains", "notcontains", "regex", "longer"].includes(n.test) ? ": " + (n.val || "…") : ""); b.appendChild(p); }
      else if (k === "tpl") { const p = el("div", "ng-note"); p.textContent = (n.tpl || "").slice(0, 70); b.appendChild(p); }
      else if (k === "note") { const ta = el("textarea"); ta.value = n.text || ""; ta.oninput = () => { n.text = ta.value; saveAIS(); }; b.appendChild(ta); }
      else if (k === "merge") { const p = el("div", "ng-note"); p.textContent = "Chờ đủ các dây vào rồi gộp"; b.appendChild(p); }
    }
  };
  return T;
}
function openFlow() {
  let ov = $("#aiflow"); if (!ov) { ov = document.createElement("div"); ov.id = "aiflow"; ov.className = "aiflow"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Luồng AI"); document.body.appendChild(ov); }
  ov.hidden = false; document.body.classList.add("flowopen");
  ov.innerHTML = `<div class="af-head"><b>Luồng AI</b><span class="af-sub">Nối dây từ ● ra sang ● vào · chuột phải để thêm node · bấm đúp node để đổi tên</span><div class="af-acts"></div><button type="button" class="primary af-done">Xong</button></div>
  <div class="af-main"><div class="af-canvas"></div><aside class="af-side"></aside></div>
  <form class="af-run"><input type="text" placeholder="Thử chạy luồng với một lệnh, ví dụ: thêm chữ 'Xin chào' ở giây 5" aria-label="Lệnh thử"><button class="primary" type="submit">Chạy thử</button><button type="button" class="af-stop" hidden>Dừng</button></form>`;
  const acts = ov.querySelector(".af-acts");
  const mk = (lbl, fn, tip) => { const b = el("button", "", lbl); b.type = "button"; if (tip) b.title = tip; b.onclick = fn; acts.appendChild(b); return b; };
  mk("Mẫu luồng", e => openMenu(e.currentTarget, Object.entries(FLOW_TEMPLATES).map(([k, [n, f]]) => ({ label: n, run: async () => { if (!(await confirm2("Thay luồng hiện tại bằng mẫu \"" + n + "\"?", "Thay"))) return; const keep = AIS.flow.nodes.find(x => x.type === "ai" && (x.ctype || x.src === "embed")); const nf = f(); if (keep) nf.nodes.filter(x => x.type === "ai").forEach(x => Object.assign(x, { src: keep.src, conn: keep.conn, ctype: keep.ctype, base: keep.base, key: keep.key, model: keep.model, provider: keep.provider, models: keep.models })); nf.view = AIS.flow.view; AIS.flow = nf; saveAIS(); openFlow(); setTimeout(() => flowUI.api.fit(), 50); } }))), "Bắt đầu từ một luồng làm sẵn");
  mk("Dò AI local", async e => { const b = e.currentTarget; b.disabled = true; b.textContent = "Đang dò…"; const f = await scanLocal(m => toast(m)); b.disabled = false; b.textContent = "Dò AI local"; if (f.length) { const n = AIS.flow.nodes.find(x => x.id === flowUI.sel) || AIS.flow.nodes.find(x => x.type === "ai"); if (n && n.type === "ai" && await confirm2(`Dùng ${f[0].label} (${f[0].models.length} model) cho node "${n.name}"?`, "Dùng")) { Object.assign(n, { src: "paste", conn: f[0].base, ctype: f[0].type, base: f[0].base, key: "", models: f[0].models, provider: f[0].label, model: bestModel(f[0].models) }); saveAIS(); flowUI.api.render(); flowSide(); } } }, "Tìm Ollama, LM Studio, llama.cpp, Jan, vLLM đang chạy trên máy này");
  ov.querySelector(".af-done").onclick = closeFlow;
  flowUI = { ov, sel: null, api: null };
  const G = AIS.flow; G.view = G.view || { x: 30, y: 30, k: 0.9 };
  flowUI.api = NodeGraph(ov.querySelector(".af-canvas"), {
    graph: G, types: flowTypes(),
    onChange: kind => { saveAIS(); if (kind === "nodes") flowSide(); },
    onSelect: ids => { flowUI.sel = ids.length === 1 ? ids[0] : null; flowSide(); },
    onOpen: id => { const n = G.nodes.find(x => x.id === id); if (!n) return; prompt2("Tên node", n.name || FLOW_DEF[n.type].t).then(v => { if (v != null) { n.name = v.trim(); saveAIS(); flowUI.api.render(); flowSide(); } }); },
    canConnect: (from, to) => from[0] !== to[0],
    addItems: pos => [{ h: "Thêm node" }, ...Object.entries(FLOW_DEF).filter(([k]) => k !== "start" || !G.nodes.some(n => n.type === "start")).map(([k, d]) => ({ label: d.t, run: () => { const n = flowNode(k, Math.round(pos[0]), Math.round(pos[1])); if (k === "ai") { const keep = G.nodes.find(x => x.type === "ai" && (x.ctype || x.src !== "paste")); if (keep) Object.assign(n, { src: keep.src, conn: keep.conn, ctype: keep.ctype, base: keep.base, key: keep.key, model: keep.model, provider: keep.provider, models: keep.models }); } G.nodes.push(n); saveAIS(); flowUI.api.render(); flowUI.api.select(n.id); } }))],
    dropWire: (t0, pos, at) => { openMenu(document.body, [{ h: "Nối tới node mới" }, ...Object.entries(FLOW_DEF).filter(([k, d]) => t0.dir === "out" ? d.ins.length : d.outs.length).map(([k, d]) => ({ label: d.t, run: () => { const n = flowNode(k, Math.round(pos[0]), Math.round(pos[1] - 20)); G.nodes.push(n); if (t0.dir === "out") flowUI.api.connect(t0.from, [n.id, 0]); else flowUI.api.connect([n.id, 0], t0.from); saveAIS(); flowUI.api.render(); flowUI.api.select(n.id); } }))], at); },
    nodeItems: n => [{ h: FLOW_DEF[n.type].t }, ...(n.type !== "start" ? [{ label: n.on === false ? "Bật node" : "Tắt node (bỏ qua khi chạy)", run: () => { n.on = n.on === false; saveAIS(); flowUI.api.render(); } }, { label: "Nhân bản", run: () => { const d = Object.assign(deep(n), { id: fnid(n.type), x: n.x + 30, y: n.y + 40 }); G.nodes.push(d); saveAIS(); flowUI.api.render(); } }] : [])],
    toolbar: bar => {}
  });
  flowSide();
  const form = ov.querySelector(".af-run"), stop = ov.querySelector(".af-stop");
  form.onsubmit = async e => { e.preventDefault(); const v = form.querySelector("input").value.trim(); if (!v || aiCtl) return; stop.hidden = false; await runFlow(v); stop.hidden = true; };
  stop.onclick = () => aiCtl && aiCtl.abort();
  if (!G.fitted) { G.fitted = true; setTimeout(() => flowUI.api.fit(), 60); }
}
function closeFlow() { const ov = $("#aiflow"); if (ov) ov.hidden = true; document.body.classList.remove("flowopen"); renderChainLine(); }
function flowSide() {
  if (!flowUI) return; const side = flowUI.ov.querySelector(".af-side"); side.innerHTML = ""; const n = AIS.flow.nodes.find(x => x.id === flowUI.sel);
  if (!n) { side.innerHTML = `<h3>Cách dùng</h3><p class="note">Mỗi node là một bước. Dây nối mang chữ từ node này sang node khác. Node chạy khi đã nhận đủ các dây vào.</p><p class="note"><b>AI</b>: dán mã API (OpenAI, Claude, Gemini, DeepSeek, Groq, OpenRouter, xAI, Mistral…) hoặc đường link AI local, Bravin tự nhận nhà cung cấp và chọn model. Hoặc chọn <b>Nhúng trong Bravin</b> để chạy model ngay trong ứng dụng.</p><p class="note"><b>Thao tác timeline</b> nhận JSON từ AI có đầu ra "Lệnh thao tác", sửa timeline, rồi ra cổng Xong hoặc Lỗi.</p><p class="note"><b>Điều kiện</b>, <b>Lặp lại</b>, <b>Gộp</b>, <b>Mẫu văn bản</b> dùng để rẽ nhánh, thử lại, ghép kết quả.</p>`; return; }
  const h = el("div", "af-sh"); const nm = el("input"); nm.type = "text"; nm.value = n.name || FLOW_DEF[n.type].t; nm.setAttribute("aria-label", "Tên node"); nm.oninput = () => { n.name = nm.value; saveAIS(); }; nm.onchange = () => flowUI.api.render(); h.append(el("small", "", FLOW_DEF[n.type].t), nm); side.appendChild(h);
  const fld = (label, inputEl) => { const l = el("label", "af-f"); l.append(el("span", "", label), inputEl); side.appendChild(l); return inputEl; };
  const sel = (label, opts, get, set) => { const s = el("select"); for (const [k, v] of Object.entries(opts)) { const o = document.createElement("option"); o.value = k; o.textContent = v; s.appendChild(o); } s.value = get(); s.onchange = () => { set(s.value); saveAIS(); flowUI.api.render(); flowSide(); }; return fld(label, s); };
  const res = el("div", "res");
  if (n.type === "ai") {
    sel("Nguồn AI", { paste: "Dán mã API hoặc đường link", embed: "Nhúng trong Bravin (chạy trên máy)" }, () => n.src, v => { n.src = v; if (v === "embed" && !EMBED_MODELS[n.model]) n.model = "qwen2.5-0.5b"; if (v === "claude" && !/^claude/.test(n.model)) n.model = "claude-opus-5-5"; });
    if (n.src === "paste") {
      const inp = el("input"); inp.type = "password"; inp.autocomplete = "off"; inp.spellcheck = false; inp.placeholder = "sk-…, AIza…, AQ.…, gsk_… hoặc http://localhost:11434"; inp.value = n.conn || ""; inp.onchange = () => { n.conn = inp.value.trim(); saveAIS(); };
      fld("Mã API hoặc đường link local", inp);
      const show = el("label", "chk"); const cb = el("input"); cb.type = "checkbox"; cb.onchange = () => inp.type = cb.checked ? "text" : "password"; show.append(cb, document.createTextNode(" Hiện mã")); side.appendChild(show);
      const row = el("div", "row"); const go = el("button", "primary", "Kết nối"); go.type = "button"; go.onclick = async () => { n.conn = inp.value.trim(); res.className = "res"; res.textContent = "Đang nhận diện…"; try { const r = await connectNode(n, m => res.textContent = m); res.className = "res ok"; res.textContent = `Đã kết nối ${r.label} · ${(r.models || []).length} model · chọn ${n.model}`; flowUI.api.render(); flowSide(); } catch (e) { res.className = "res err"; res.textContent = e.message || String(e); } };
      const scan = el("button", "", "Dò AI local"); scan.type = "button"; scan.onclick = async () => { res.className = "res"; res.textContent = "Đang dò các cổng quen thuộc…"; const f = await scanLocal(m => res.textContent = m); if (f[0]) { inp.value = n.conn = f[0].base; go.click(); } else res.className = "res err"; };
      row.append(go, scan); side.appendChild(row);
      if (n.provider) { const p = el("p", "note"); p.textContent = "Đang dùng: " + n.provider + (n.base ? " · " + n.base : ""); side.appendChild(p); }
    }
    if (n.src === "embed") {
      sel("Model nhúng", Object.fromEntries(Object.entries(EMBED_MODELS).map(([k, v]) => [k, v[1]])), () => EMBED_MODELS[n.model] ? n.model : "qwen2.5-0.5b", v => n.model = v);
      const row = el("div", "row"); const pre = el("button", "primary", "Tải trước model"); pre.type = "button"; pre.onclick = async () => { res.className = "res"; res.textContent = "Đang nạp bộ chạy AI…"; try { await getEmbed(n.model || "qwen2.5-0.5b", m => res.textContent = m); res.className = "res ok"; res.textContent = "Model đã sẵn sàng trên máy này (" + (navigator.gpu ? "WebGPU" : "CPU/WASM") + ")."; } catch (e) { res.className = "res err"; res.textContent = e.message || String(e); } }; row.appendChild(pre); side.appendChild(row);
      const p = el("p", "note"); p.textContent = "Chạy ngay trong Bravin, không cần mã hay máy chủ. Lần đầu tải model rồi lưu lại trong trình duyệt; bản Bravin trên máy đọc thẳng từ thư mục models/ và vendor/transformers/ nếu có. Model nhỏ hợp viết, tóm tắt, gợi ý; thao tác timeline phức tạp nên dùng model lớn qua API hoặc Ollama."; side.appendChild(p);
    } else {
      const md = el("input"); md.type = "text"; md.spellcheck = false; md.value = n.model || ""; const dl = el("datalist"); dl.id = "afm_" + n.id; md.setAttribute("list", dl.id);
      (n.src === "claude" ? AI_TYPES.claude.models : (n.models || [])).forEach(m => { const o = document.createElement("option"); o.value = m; dl.appendChild(o); });
      md.onchange = () => { n.model = md.value.trim(); saveAIS(); flowUI.api.render(); }; fld("Model" + (n.models && n.models.length ? ` (${n.models.length} có sẵn)` : ""), md); side.appendChild(dl);
    }
    sel("Đầu ra", { text: "Văn bản (suy nghĩ, viết, kế hoạch)", ops: "Lệnh thao tác timeline (JSON)" }, () => n.fmt, v => n.fmt = v);
    const st = el("label", "chk"); const cb2 = el("input"); cb2.type = "checkbox"; cb2.checked = n.withState !== false; cb2.onchange = () => { n.withState = cb2.checked; saveAIS(); }; st.append(cb2, document.createTextNode(" Gửi kèm trạng thái timeline")); side.appendChild(st);
    const sk = el("textarea"); sk.rows = 5; sk.value = n.skill || ""; sk.placeholder = "Vai trò, phong cách, quy tắc riêng cho AI này…"; sk.oninput = () => { n.skill = sk.value; saveAIS(); }; sk.onchange = () => flowUI.api.render(); fld("Skill", sk);
    const adv = el("details", "af-adv"); adv.innerHTML = "<summary>Nâng cao</summary>"; const ty = el("select"); for (const [k, v] of Object.entries(AI_TYPES)) if (k !== "claude") { const o = document.createElement("option"); o.value = k; o.textContent = v.label; ty.appendChild(o); } ty.value = n.ctype || "openai"; ty.onchange = () => { n.ctype = ty.value; saveAIS(); };
    const bs = el("input"); bs.type = "text"; bs.value = n.base || ""; bs.placeholder = "Địa chỉ base URL"; bs.onchange = () => { n.base = bs.value.trim().replace(/\/+$/, ""); if (!n.ctype) n.ctype = ty.value; saveAIS(); };
    const l1 = el("label", "af-f"); l1.append(el("span", "", "Loại giao thức"), ty); const l2 = el("label", "af-f"); l2.append(el("span", "", "Base URL"), bs); adv.append(l1, l2); if (n.src === "paste") side.appendChild(adv);
    const row2 = el("div", "row"); const tst = el("button", "", "Thử kết nối"); tst.type = "button"; tst.onclick = async () => { res.className = "res"; res.textContent = "Đang thử…"; try { const s = stepOf(n); s._prog = m => res.textContent = m; const t0 = performance.now(); const out = await callAI(s, "Bạn là trợ lý kiểm tra kết nối.", "Trả lời đúng một từ: OK", null); res.className = "res ok"; res.textContent = `Kết nối được (${Math.round(performance.now() - t0)} ms): ${String(out).slice(0, 80)}`; } catch (e) { res.className = "res err"; res.textContent = e.message || String(e); } }; row2.appendChild(tst); side.appendChild(row2);
    side.appendChild(res);
  } else if (n.type === "cond") {
    sel("Kiểm tra", FLOW_TESTS, () => n.test, v => n.test = v);
    if (["contains", "notcontains", "regex", "longer"].includes(n.test)) { const v = el("input"); v.type = "text"; v.value = n.val || ""; v.oninput = () => { n.val = v.value; saveAIS(); }; v.onchange = () => flowUI.api.render(); fld(n.test === "longer" ? "Số ký tự N" : "Giá trị", v); }
    side.appendChild(el("p", "note", "Chữ đi vào được chuyển nguyên sang cổng Đúng hoặc Sai."));
  } else if (n.type === "loop") {
    const v = el("input"); v.type = "number"; v.min = 1; v.max = 10; v.value = n.max || 2; v.onchange = () => { n.max = clamp(Math.round(+v.value || 1), 1, 10); saveAIS(); flowUI.api.render(); }; fld("Số lượt tối đa", v);
    side.appendChild(el("p", "note", "Mỗi lần nhận dữ liệu: còn lượt thì ra cổng Lặp tiếp (nối ngược về AI để thử lại), hết lượt thì ra cổng Hết lượt."));
  } else if (n.type === "tpl") {
    const ta = el("textarea"); ta.rows = 6; ta.value = n.tpl || ""; ta.oninput = () => { n.tpl = ta.value; saveAIS(); }; ta.onchange = () => flowUI.api.render(); fld("Mẫu", ta);
    side.appendChild(el("p", "note", "Dùng {{vào}} cho chữ đi vào, {{lệnh}} cho lệnh người dùng, {{trạng thái}} cho bảng trạng thái timeline."));
  } else if (n.type === "apply") side.appendChild(el("p", "note", "Nhận JSON {reply, ops} từ AI và sửa timeline (hoàn tác được bằng Ctrl+Z). Thành công ra cổng Xong; JSON sai hoặc có thao tác hỏng ra cổng Lỗi kèm mô tả lỗi để AI sửa."));
  else if (n.type === "reply") side.appendChild(el("p", "note", "Hiện nội dung đi vào trong khung trò chuyện. Nếu là JSON thao tác thì hiện phần reply."));
  else if (n.type === "merge") side.appendChild(el("p", "note", "Chờ tất cả dây vào có dữ liệu rồi ghép thành một đoạn, có nhãn tên node nguồn. Nhánh không chạy sẽ được bỏ qua khi luồng sắp kết thúc."));
  else if (n.type === "start") side.appendChild(el("p", "note", "Điểm bắt đầu: cổng Lệnh là câu bạn gõ, cổng Trạng thái timeline là bảng clip hiện tại."));
  else if (n.type === "state") side.appendChild(el("p", "note", "Gửi bảng trạng thái timeline mới nhất tại lúc bắt đầu chạy."));
  if (n.type !== "start") { const row = el("div", "row"); const tg = el("button", "", n.on === false ? "Bật node" : "Tắt node"); tg.type = "button"; tg.onclick = () => { n.on = n.on === false; saveAIS(); flowUI.api.render(); flowSide(); }; const del = el("button", "", "Xoá node"); del.type = "button"; del.onclick = () => { AIS.flow.nodes = AIS.flow.nodes.filter(x => x !== n); AIS.flow.links = AIS.flow.links.filter(l => l.from[0] !== n.id && l.to[0] !== n.id); flowUI.api.graph.nodes = AIS.flow.nodes; flowUI.api.graph.links = AIS.flow.links; flowUI.sel = null; saveAIS(); openFlow(); }; row.append(tg, del); side.appendChild(row); }
}

/* ---------- hook into the assistant panel ---------- */
(function hookAssistant() {
  const mode = $("#aiMode"); mode.innerHTML = '<option value="flow">Luồng AI</option>'; mode.value = "flow"; mode.hidden = true; const ml = document.querySelector('label[for="aiMode"]'); if (ml) ml.hidden = true; $("#aiEffort").hidden = true;
  if (AIS.mode !== "flow") { AIS.mode = "flow"; }
  $("#aiCfgBtn").title = "Mở canvas Luồng AI"; $("#aiCfgBtn").onclick = openFlow;
})();
setMode = function (m) { if (m === "api" || m === "local") m = "flow"; AIS.mode = m; $("#aiMode").value = m; $("#aiEffort").hidden = m !== "builtin"; saveAIS(); };
renderChainLine = function () {
  const elx = $("#chainLine"); if (!elx) return; if (AIS.mode === "builtin") { elx.hidden = true; $("#aiBadge").textContent = "Opus 5.5"; return; }
  const ais = (AIS.flow.nodes || []).filter(n => n.type === "ai" && n.on !== false); elx.hidden = false; elx.innerHTML = "Luồng AI: <b></b> · <a href='#' class='af-open'>mở canvas</a>";
  elx.querySelector("b").textContent = ais.length ? ais.map(n => n.name + " (" + connLabel(n).split(" · ")[0] + ")").join(" → ") : "chưa có node AI"; elx.querySelector(".af-open").onclick = e => { e.preventDefault(); openFlow(); };
  const ok = aiConnected(); $("#aiBadge").textContent = ok ? connLabel(ok).split(" · ")[0] : "Chưa kết nối";
};
/* ---------- "Hãy đưa mã API model của bạn": kết nối ngay trong khung Trợ lý ---------- */
function aiConnected() { return (AIS.flow && AIS.flow.nodes || []).find(n => n.type === "ai" && n.on !== false && (n.src === "embed" || (n.src !== "claude" && n.ctype && n.base))) || null; }
function aiWelcome() {
  const n = aiConnected();
  if (n) addMsg("c", `Đã kết nối **${connLabel(n)}**. Gõ lệnh dựng bằng tiếng Việt, ví dụ "thêm chữ Xin chào ở giây 2", trợ lý sẽ làm trực tiếp trên timeline. Ctrl+Z để hoàn tác.`);
  else aiConnectCard();
}
function aiConnectCard(focus) {
  document.querySelectorAll("#msgs .aiconn").forEach(x => x.remove());
  const d = document.createElement("div"); d.className = "msg c aiconn";
  d.innerHTML = `<b>Hãy đưa mã API model AI của bạn</b>
    <p>Bravin không có sẵn AI. Dán mã API của bạn (Google Gemini, OpenAI, Anthropic Claude, Groq, DeepSeek, OpenRouter, xAI…), Bravin tự nhận nhà cung cấp, chọn model và thử kết nối. Mã chỉ lưu trên máy này.</p>
    <div class="aic-row"><input type="password" id="aiKeyIn" autocomplete="off" spellcheck="false" placeholder="AIza…, AQ.…, sk-…, sk-ant-…, gsk_… hoặc http://localhost:11434" aria-label="Mã API hoặc đường link AI"><button type="button" class="primary" id="aiKeyGo">Kết nối</button></div>
    <div class="aic-st" role="status"></div>
    <p class="aic-alt">Không có mã? Dùng AI chạy trên máy (Ollama, LM Studio) bằng cách dán đường link ở trên, hoặc <a href="#" class="aic-flow">mở Luồng AI</a> để chọn model nhúng.</p>`;
  msgsEl.appendChild(d); const ch = $("#chips"); if (ch) ch.hidden = true; // gợi ý lệnh chưa dùng được khi chưa có AI: nhường chỗ cho ô dán mã
  requestAnimationFrame(() => { const inpEl = d.querySelector("#aiKeyIn"); msgsEl.scrollTop = Math.max(0, d.offsetTop - msgsEl.offsetTop - 4); if (msgsEl.scrollTop + msgsEl.clientHeight < inpEl.offsetTop - msgsEl.offsetTop + inpEl.offsetHeight) inpEl.scrollIntoView({ block: "nearest" }); });
  const inp = d.querySelector("#aiKeyIn"), go = d.querySelector("#aiKeyGo"), st = d.querySelector(".aic-st");
  d.querySelector(".aic-flow").onclick = e => { e.preventDefault(); openFlow(); };
  const run = async () => {
    const v = inp.value.trim(); if (!v) { st.textContent = "Chưa dán mã."; inp.focus(); return; }
    go.disabled = true; inp.disabled = true; st.className = "aic-st"; st.textContent = "Đang nhận dạng mã…";
    try {
      if (!AIS.flow || !(AIS.flow.nodes || []).some(n => n.type === "ai")) { AIS.flow = FLOW_TEMPLATES.single[1](); AIS.flow.view = { x: 30, y: 30, k: 0.9 }; }
      const targets = AIS.flow.nodes.filter(n => n.type === "ai" && n.src !== "embed");
      const first = targets[0]; first.src = "paste"; first.conn = v;
      await connectNode(first, m => st.textContent = m);
      const s = stepOf(first); s._prog = m => st.textContent = m; st.textContent = "Đang thử model " + first.model + "…";
      const out = await callAI(s, "Bạn là trợ lý kiểm tra kết nối.", "Trả lời đúng một từ: OK", null);
      for (const n of targets.slice(1)) Object.assign(n, { src: "paste", conn: v, ctype: first.ctype, base: first.base, key: first.key, models: first.models, provider: first.provider, model: first.model });
      AIS.mode = "flow"; saveAIS(); renderChainLine();
      d.remove(); { const ch = $("#chips"); if (ch && !msgsEl.querySelector(".msg.u")) ch.hidden = false; } addMsg("c", `Đã kết nối **${connLabel(first)}** (AI trả lời: "${String(out).trim().slice(0, 40)}"). Gõ lệnh dựng bằng tiếng Việt, ví dụ "thêm chữ Xin chào ở giây 2". Đổi AI bất cứ lúc nào ở **Cài đặt AI**.`);
    } catch (e) {
      st.className = "aic-st err"; st.textContent = (e && e.message) || String(e); go.disabled = false; inp.disabled = false; inp.focus();
    }
  };
  go.onclick = run; inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); run(); } };
  if (focus) setTimeout(() => inp.focus(), 50);
}
const _askAI_flow = askAI;
askAI = function (text) { if (!String(text || "").trim() || aiCtl) return; if (!aiConnected()) { $("#aiIn").value = text; aiConnectCard(true); return; } if (AIS.mode === "flow") return runFlow(text); return _askAI_flow(text); };
document.addEventListener("keydown", e => { if (e.key === "Escape" && document.body.classList.contains("flowopen") && !document.querySelector(".overlay,.menu")) { e.preventDefault(); e.stopImmediatePropagation(); closeFlow(); } }, true);
saveAIS();
