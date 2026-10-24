// Screenshots of the running game: the Vite dev server and headless Chrome over the DevTools Protocol (Node stdlib
// only, needs google-chrome; after Dark Planet's tools/headless.mjs).
// Usage: node tools/screenshot.mjs <out-dir> [step...]
// A step is a JS expression run in the page once the game has started (`world` and `view` are globals). After each
// step the Classic picture (640 x 480) is saved as <out-dir>/shot-<n>.png; a step starting with "page:" saves the
// whole window instead (menus, dialogs). The game loop keeps running in the page; steps can tick `world` directly.
// Example: node tools/screenshot.mjs /tmp/shots "" "for (let i = 0; i < 40; i++) world.tick({left: 0, right: 0, up: 1, fire: 0})"
// Environment: SIZE=390x844 sets the window (default 1280x1000), TOUCH=1 emulates a phone (coarse pointer, touch
// buttons), MODE=classic or MODE=remastered picks the picture (default: the saved setting, Remastered). Remastered
// has no picture of its own: its steps always save the window. `menu` and `startCourse()` are globals too.

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [out, ...steps] = process.argv.slice(2);
if (!out) {
  console.error('usage: node tools/screenshot.mjs <out-dir> [step...]');
  process.exit(2);
}
const PORT = 5292, DEBUG_PORT = 6292;
const [WIDTH, HEIGHT] = (process.env.SIZE ?? '1280x1000').split('x').map(Number);
const TOUCH = process.env.TOUCH === '1';
const MODE = process.env.MODE ? `?${process.env.MODE}` : '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(url, ms = 30000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(250)) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {
      // not up yet
    }
  }
  throw new Error(`timeout waiting for ${url}`);
}

mkdirSync(out, { recursive: true });
const vite = spawn(process.execPath, [join(ROOT, 'game/node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'],
  { cwd: join(ROOT, 'game'), stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'wunioid-headless-'));
const chrome = spawn('google-chrome', ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
  `--window-size=${WIDTH},${HEIGHT}`, '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio', 'about:blank'],
{ stdio: 'ignore' });
let ws;
const stop = () => {
  ws?.close();
  chrome.kill();
  vite.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Chrome may still hold files
  }
};
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));

let nextId = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++nextId;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

try {
  await waitFor(`http://localhost:${PORT}/`);
  await waitFor(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
  const target = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === 'Runtime.consoleAPICalled' && ['warning', 'error'].includes(d.params.type)) {
      console.log(`  [page ${d.params.type}]`, d.params.args.map((a) => a.value ?? a.description).join(' '));
    }
    if (d.method === 'Runtime.exceptionThrown') console.log('  [page exception]', d.params.exceptionDetails.exception?.description);
    const p = d.id && pending.get(d.id);
    if (!p) return;
    pending.delete(d.id);
    if (d.error) p.rej(new Error(d.error.message));
    else p.res(d.result);
  };
  await new Promise((r) => (ws.onopen = r));
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: TOUCH });
  if (TOUCH) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: `http://localhost:${PORT}/${MODE}` });
  for (let i = 0; i < 240 && (await evaluate('typeof window.ready').catch(() => 'undefined')) !== 'object'; i++) await sleep(250);
  await evaluate('window.ready');
  for (const [i, step] of (steps.length ? steps : ['']).entries()) {
    const page = step.startsWith('page:');
    await evaluate(`(async () => { ${page ? step.slice(5) : step}; })()`);
    const whole = page || !(await evaluate('!!view.canvas'));
    await sleep(300);
    const file = join(out, `shot-${i}.png`);
    if (whole) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(data, 'base64'));
    } else {
      const url = await evaluate('view.draw(world, 45), view.canvas.toDataURL("image/png")');
      writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    }
    console.log(file);
  }
} finally {
  stop();
}
