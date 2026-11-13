// End-to-end check: real Chromium + unpacked extension + local middleware (mock LLM/TTS).
// Serves a fake claude.ai page via request routing, streams a reply into it, and checks
// that the extension reads it aloud, animates the sprite, giggles, and exports a video.
//
// Usage (server must be running in mock mode):  node extension/test/e2e.cjs <token> [outDir]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const EXT = path.resolve(__dirname, '..');
const token = process.argv[2];
const outDir = process.argv[3] || path.join(__dirname, 'out');
const backendUrl = process.env.BACKEND_URL || 'http://localhost:8787';
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
};

(async () => {
  const ctx = await chromium.launchPersistentContext('', {
    headless: process.env.HEADED ? false : true,
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--autoplay-policy=no-user-gesture-required'],
    acceptDownloads: true,
    viewport: { width: 1200, height: 800 },
  });
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker');
  // Let onInstalled seed defaults first so it can't overwrite our test settings.
  await sw.evaluate(async () => { for (let i = 0; i < 50 && !('autoRead' in (await chrome.storage.local.get('autoRead'))); i++) await new Promise((r) => setTimeout(r, 100)); });
  await sw.evaluate(async ({ token, backendUrl }) => chrome.storage.local.set({ token, backendUrl, autoRead: true, personaId: 'auto' }), { token, backendUrl });

  const html = fs.readFileSync(path.join(__dirname, 'fake-claude.html'), 'utf8');
  await ctx.route('https://claude.ai/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: html }));

  const page = ctx.pages()[0] || (await ctx.newPage());
  page.on('console', (m) => /Vernaculator|error/i.test(m.text()) && console.log('  [page]', m.text()));
  const cdp = await ctx.newCDPSession(page);
  const contexts = [];
  cdp.on('Runtime.executionContextCreated', (e) => contexts.push(e.context));
  await cdp.send('Runtime.enable');
  await page.goto('https://claude.ai/chat/test');

  // Evaluate inside the extension's isolated world (where window.Vern lives).
  const inExt = async (expr) => {
    const c = [...contexts].reverse().find((x) => x.auxData?.type === 'isolated' && x.name === 'The Vernaculator');
    if (!c) throw new Error('extension context not found');
    const r = await cdp.send('Runtime.evaluate', { expression: expr, contextId: c.id, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  console.log('HUD');
  await page.waitForSelector('#vernaculator-hud', { state: 'attached', timeout: 10000 });
  await sleep(800);
  assert(await page.locator('#vernaculator-hud').isVisible(), 'HUD injected and visible');
  const transform = await page.evaluate(() => document.getElementById('vernaculator-hud').style.transform);
  assert(/translate\(\d+px, \d+px\)/.test(transform), `HUD positioned with transform (${transform})`);
  assert((await inExt('document.querySelectorAll("#vernaculator-hud").length')) === 1, 'single HUD instance');
  await page.screenshot({ path: path.join(outDir, '1-hud-idle.png') });

  console.log('Dragging');
  const box = await page.locator('#vernaculator-hud').boundingBox();
  await page.mouse.move(box.x + 120, box.y + 16);
  await page.mouse.down();
  await page.mouse.move(box.x - 300, box.y - 250, { steps: 8 });
  await page.mouse.up();
  const box2 = await page.locator('#vernaculator-hud').boundingBox();
  assert(Math.abs(box2.x - (box.x - 420)) < 3 && Math.abs(box2.y - (box.y - 266)) < 3, `HUD dragged (${Math.round(box.x)},${Math.round(box.y)}) -> (${Math.round(box2.x)},${Math.round(box2.y)})`);
  await sleep(300);
  const saved = await sw.evaluate(() => chrome.storage.local.get('hudPos'));
  assert(saved.hudPos && Math.abs(saved.hudPos.x - box2.x) < 2, 'HUD position persisted');

  console.log('Auto-read a streamed reply');
  await page.evaluate(() => window.streamReply('Whoa, let me explain how the science of space works. Stars are giant balls of hot gas. They shine because of nuclear fusion in their cores! Planets orbit them because of gravity, which keeps everything in a cosmic dance.'));
  // Track whether the mouth ever opens while audio plays.
  await inExt(`window.__mouthOpened = false; (function poll(){ const img = Vern.debug.hud.img; if (img.dataset.mouth === 'open') window.__mouthOpened = true; if (!window.__stopPoll) requestAnimationFrame(poll); })(); true`);
  let state;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    state = await inExt(`({ playing: Vern.debug.player.playing, t: Vern.debug.player.audio.currentTime, chunks: Vern.debug.player.chunks.length, caption: Vern.debug.hud.caption.textContent, who: Vern.debug.hud.who.textContent, level: Vern.debug.player.level() })`);
    if (state.playing && state.t > 1) break;
  }
  await page.screenshot({ path: path.join(outDir, '2-hud-speaking.png') });
  assert(state.who === 'Professor Pip', `intent routing picked a persona (${state.who})`);
  assert(state.chunks > 0, `received streamed MP3 chunks (${state.chunks})`);
  assert(state.playing && state.t > 1, `MediaSource playback running (t=${state.t.toFixed(2)}s)`);
  assert(/Professor Pip here/.test(state.caption), 'captions shown in HUD');
  assert(!/old reply/.test(state.caption), 'history messages were not auto-read');

  await sleep(1500);
  assert(await inExt('window.__mouthOpened'), 'sprite switched to talking frame from audio amplitude');

  console.log('Tickle');
  const stage = await inExt(`(() => { const r = Vern.debug.hud.stage.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await inExt(`window.__giggles = 0; const orig = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function (...a) { window.__giggles++; return orig.apply(this, a); }; true`);
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(stage.x, stage.y);
    await sleep(80);
  }
  await sleep(600);
  assert((await inExt('window.__giggles')) === 1, 'rapid taps played the giggle once');
  assert(await inExt('Vern.debug.player.playing'), 'TTS kept playing during the giggle');

  console.log('Wait for the reply to finish');
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    if (await inExt('!!Vern.debug.lastSession && !Vern.debug.player.playing')) break;
  }
  assert(await inExt('!!Vern.debug.lastSession'), 'utterance completed');

  console.log('Meme export');
  const downloadP = page.waitForEvent('download', { timeout: 60000 });
  // The shadow root is closed, so trigger the Meme button through the HUD's action handler.
  await inExt(`Vern.debug.hud.onAction('export'), true`);
  const dl = await downloadP;
  const file = path.join(outDir, dl.suggestedFilename());
  await dl.saveAs(file);
  const size = fs.statSync(file).size;
  assert(size > 20000, `exported ${path.basename(file)} (${(size / 1024).toFixed(0)} KB)`);
  fs.writeFileSync(path.join(outDir, 'export-path.txt'), file);

  console.log('Manual read of selection + replay');
  await page.evaluate(() => {
    const p = document.querySelector('.font-claude-response p');
    const range = document.createRange();
    range.selectNodeContents(p);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await inExt(`Vern.debug.hud.onAction('readSelection'), true`);
  await sleep(2500);
  const cap = await inExt('Vern.debug.hud.caption.textContent');
  assert(/old reply/.test(cap), 'read-selection voiced the selected text');

  await page.screenshot({ path: path.join(outDir, '3-hud-final.png') });
  await ctx.close();
  console.log('\nE2E PASSED');
})().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
