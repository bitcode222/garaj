// The glass benchmark (docs/LIQUID-GLASS.md). Serve the repo root, then, for example:
//   python3 -m http.server 4190 &
//   node scripts/glass-bench/run.mjs http://127.0.0.1:4190/scripts/glass-bench/index.html \
//     '[{"name":"lite","q":"mode=lite&n=300"},{"name":"css","q":"mode=css&n=300"}]' '[1,4,6]'
// A weak GPU: add `1 "--use-angle=swiftshader --enable-unsafe-swiftshader --disable-features=Vulkan,WebGPU"`.
// Usage: node run.mjs <base-url> <configs json> [throttles json] [headless 1|0] [chrome flags]
// For each config × CPU throttle: fresh Chrome, phone viewport (390×844 @2x), load, wait for liquidGL's init,
// then measure 4 s idle and 4 s of real touch scrolling: frame intervals and main-thread time per second.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [base, configsJson, throttlesJson = "[1,4,6]", headless = "1", gpuFlag = ""] = process.argv.slice(2);
const configs = JSON.parse(configsJson);
const throttles = JSON.parse(throttlesJson);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function session() {
  const args = ["--remote-debugging-port=9334", `--user-data-dir=${mkdtempSync(join(tmpdir(), "lgl-"))}`, "--no-first-run", "--no-default-browser-check", "--window-size=420,900", "--enable-unsafe-webgpu", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "about:blank"];
  if (headless === "1") args.unshift("--headless=new");
  if (gpuFlag) args.unshift(...gpuFlag.split(" "));
  const chrome = spawn(CHROME, args, { stdio: "ignore" });
  let ws;
  for (let i = 0; i < 60; i++) { try { const t = await (await fetch("http://127.0.0.1:9334/json")).json(); const p = t.find((x) => x.type === "page"); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await sleep(200); }
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  return { chrome, ws, send, evaluate };
}

const RECORD = `(() => { const f = []; let last = performance.now(), on = true; const tick = (t) => { f.push(t - last); last = t; if (on) requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__stop = () => { on = false; return f; }; })()`;
function frames(list) {
  const f = list.slice(1).sort((a, b) => a - b);
  const pct = (p) => f[Math.min(f.length - 1, Math.floor(f.length * p))] || 0;
  const total = list.slice(1).reduce((a, b) => a + b, 0);
  return { fps: Math.round((f.length / total) * 1000), p50: +pct(0.5).toFixed(1), p95: +pct(0.95).toFixed(1), max: +(f.at(-1) || 0).toFixed(0), janky: f.filter((x) => x > 34).length };
}
async function metrics(send) {
  const m = (await send("Performance.getMetrics")).result.metrics;
  const o = {}; for (const x of m) o[x.name] = x.value; return o;
}
const busy = (a, b, secs) => ({ task: Math.round(((b.TaskDuration - a.TaskDuration) / secs) * 1000), script: Math.round(((b.ScriptDuration - a.ScriptDuration) / secs) * 1000), layout: Math.round((((b.LayoutDuration + b.RecalcStyleDuration) - (a.LayoutDuration + a.RecalcStyleDuration)) / secs) * 1000) });

const rows = [];
for (const cfg of configs) for (const cpu of throttles) {
  const s = await session();
  try {
    await s.send("Performance.enable");
    await s.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await s.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await s.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    const t0 = Date.now();
    await s.send("Page.navigate", { url: `${base}?${cfg.q}` });
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) { await sleep(200); ready = await s.evaluate("window.__bench && window.__bench.ready"); }
    const loadWall = Date.now() - t0;
    await sleep(1000);
    const info = await s.evaluate("({ gpu: __bench.gpu, webgpu: __bench.webgpu, initMs: __bench.initMs, refractMs: __bench.refractMs, longTasks: __bench.longTasks.slice(), heap: Math.round(performance.memory.usedJSHeapSize/1048576), canvases: [...document.querySelectorAll('canvas')].map(c => c.width + 'x' + c.height) })");
    // Idle: nothing moves on the page.
    await s.evaluate(RECORD);
    let a = await metrics(s.send); await sleep(4000); let b = await metrics(s.send);
    const idle = { ...frames(await s.evaluate("__stop()")), ...busy(a, b, 4) };
    // Scroll: real touch flings, down then up.
    await s.evaluate(RECORD);
    a = await metrics(s.send);
    const ts = Date.now();
    await s.send("Input.synthesizeScrollGesture", { x: 195, y: 500, yDistance: -2400, speed: 1600, gestureSourceType: "touch", repeatCount: 0 });
    await s.send("Input.synthesizeScrollGesture", { x: 195, y: 500, yDistance: 2400, speed: 1600, gestureSourceType: "touch", repeatCount: 0 });
    const secs = (Date.now() - ts) / 1000;
    b = await metrics(s.send);
    const scroll = { ...frames(await s.evaluate("__stop()")), ...busy(a, b, secs) };
    const rq = "(() => { const r = (__bench.renderMs || []).slice().sort((a,b)=>a-b); const p = (q) => +(r[Math.floor(r.length*q)] || 0).toFixed(2); return { n: r.length, p50: p(0.5), p95: p(0.95), max: +(r.at(-1)||0).toFixed(1) }; })()";
    const render = await s.evaluate(rq);
    // The page grows (a list loads more, a route changes): one row every 1.5 s, 4 times.
    const before = await s.evaluate("__bench.longTasks.length");
    await s.evaluate(RECORD);
    for (let k = 0; k < 4; k++) { await s.evaluate("__grow()"); await sleep(1500); }
    await sleep(1500);
    const grow = { ...frames(await s.evaluate("__stop()")), longTasks: await s.evaluate(`__bench.longTasks.slice(${before})`), snapMs: await s.evaluate("__bench.snapMs || []") };
    const heapAfter = await s.evaluate("Math.round(performance.memory.usedJSHeapSize/1048576)");
    rows.push({ cfg: cfg.name, cpu: `${cpu}x`, ready, loadWall, ...info, heapAfter, idle, scroll, render, grow });
    console.error(JSON.stringify(rows.at(-1)));
  } catch (e) {
    console.error(cfg.name, cpu, e.message);
  } finally { s.ws.close(); s.chrome.kill(); await sleep(800); }
}
console.log(JSON.stringify(rows));
