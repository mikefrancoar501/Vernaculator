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
  await sw.evaluate(async ({ token, backendUrl }) => chrome.storage.local.set({ token, backendUrl, autoRead: true, personaId: 'auto', hudSize: 'M' }), { token, backendUrl });

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
    const c = [...contexts].reverse().find((x) => x.auxData?.type === 'isolated' && x.name === 'Fancy Bot');
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
  await page.mouse.move(box.x - 300, box.y - 60, { steps: 8 });
  await page.mouse.up();
  const box2 = await page.locator('#vernaculator-hud').boundingBox();
  assert(Math.abs(box2.x - (box.x - 420)) < 3 && Math.abs(box2.y - (box.y - 76)) < 3, `HUD dragged (${Math.round(box.x)},${Math.round(box.y)}) -> (${Math.round(box2.x)},${Math.round(box2.y)})`);
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

  console.log('Big Sal + plain-language controls');
  await inExt(`Vern.settings.save({ personaId: 'big_sal', readingLevel: 1, humor: true, philosophy: false, accent: 'slow' }).then(() => true)`);
  await sleep(400);
  assert((await inExt('Vern.debug.hud.levelName.textContent')) === 'Super simple', 'reading-level slider shows "Super simple"');
  assert((await inExt('Vern.debug.hud.styleSelect.options.length')) >= 5, 'speaking styles loaded from the server');
  await inExt(`Vern.debug.speak('Your doctor says you have hypertension. Take 10 mg of lisinopril once daily and call your physician if you feel dizzy.'), true`);
  let sal;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    sal = await inExt(`({ who: Vern.debug.hud.who.textContent, src: Vern.debug.hud.img.src, applied: Vern.debug.current?.applied, playing: Vern.debug.player.playing, cap: Vern.debug.hud.caption.textContent })`);
    if (sal.playing && sal.who === 'Big Sal') break;
  }
  assert(sal.who === 'Big Sal', 'Big Sal selected');
  assert(/big_sal_(idle|talking)\.svg/.test(sal.src), 'Big Sal sprite shown');
  assert(sal.applied?.readingLevel === 1 && sal.applied?.style?.humor === true && sal.applied?.style?.accent === 'slow', `server applied level + style (${JSON.stringify(sal.applied)})`);
  assert(/10 mg/.test(sal.cap), 'facts like doses survive into the captions');
  await inExt(`window.__salOpen = false; (function poll(){ if (/big_sal_talking/.test(Vern.debug.hud.img.src)) window.__salOpen = true; if (!window.__salOpen) requestAnimationFrame(poll); })(); true`);
  await sleep(1500);
  assert(await inExt('window.__salOpen'), "Big Sal's mouth moves with the audio");
  await page.screenshot({ path: path.join(outDir, '4-big-sal.png') });
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    if (await inExt("Vern.debug.lastSession?.persona?.id === 'big_sal' && !Vern.debug.player.playing")) break;
  }
  const salDl = page.waitForEvent('download', { timeout: 60000 });
  await inExt(`Vern.debug.hud.onAction('export'), true`);
  const salFile = path.join(outDir, (await salDl).suggestedFilename());
  await (await salDl).saveAs(salFile);
  fs.writeFileSync(path.join(outDir, 'sal-export-path.txt'), salFile);
  assert(fs.statSync(salFile).size > 20000, `Big Sal meme exported (${path.basename(salFile)})`);

  console.log('Paraphrase assistant (profile, paraphrase, Oakley, key points, ask, expound)');
  await inExt(`Vern.settings.save({ autoRead: false, humor: false, accent: 'none', readingLevel: 2, userName: 'Sergio', aboutMe: 'Electrician who codes in Python', ageGroup: 'adult', language: 'auto' }).then(() => true)`);
  await page.evaluate(() => window.streamReply('Lisinopril is an ACE inhibitor that lowers blood pressure. The usual starting dose is 10 mg once a day. A dry cough is a common side effect. Many people also benefit from less salt and more exercise. Call your doctor right away if your lips or tongue swell.', { delay: 2 }));
  for (let i = 0; i < 40 && !(await inExt("Vern.debug.observer.active.size === 0")); i++) await sleep(250);
  await sleep(1800); // let the observer mark the reply finished
  const waitCaption = async (re, label) => {
    let cap = '';
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      cap = await inExt('Vern.debug.hud.caption.textContent');
      if (re.test(cap)) break;
    }
    assert(re.test(cap), `${label}: "${cap.slice(0, 90)}..."`);
    return cap;
  };
  await inExt(`Vern.debug.hud.showTab('ask'), true`);
  await inExt(`Vern.debug.hud.onAction('paraphraseNow'), true`);
  const para = await waitCaption(/Sergio, basically what Claude is telling you/, 'Paraphrase is personal and names the AI as a third party');
  assert(/10 mg/.test(para) && /right away/.test(para), 'Paraphrase keeps the dose and the warning');
  let applied = await inExt('Vern.debug.current?.applied');
  assert(applied?.style?.paraphrase === true, 'server ran in paraphrase mode');

  await inExt(`Vern.debug.hud.onAction('oakley'), true`);
  await waitCaption(/Old Oakley here/, 'Paraphrase with Oakley uses Old Oakley');
  await sleep(600);
  assert(/old_oakley_(idle|talking)\.svg/.test(await inExt('Vern.debug.hud.img.src')), "Oakley's sprite is shown");
  await page.screenshot({ path: path.join(outDir, '5-oakley-ask.png') });

  await inExt(`Vern.debug.hud.onAction('keypoints'), true`);
  await waitCaption(/First, .*Second, /, 'Key points breakdown');
  await inExt(`Vern.debug.hud.onAction('ask', 'What about the cough?'), true`);
  await waitCaption(/Claude said: A dry cough/, 'Follow-up question answered from the original answer');
  await inExt(`Vern.debug.hud.onAction('expound'), true`);
  await waitCaption(/go deeper/i, 'Expound goes deeper');
  const lang = await inExt('Vern.profile().language');
  assert(/^en/.test(lang), `language defaults to the browser language (${lang})`);

  console.log('Gestures: long-press menu, double-tap assistant, triple-tap tickle');
  const stagePt = async () => inExt(`(() => { const r = Vern.debug.hud.stage.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await inExt(`Vern.debug.player.stop(), true`);
  let sp = await stagePt();
  await page.mouse.move(sp.x, sp.y);
  await page.mouse.down();
  await sleep(750);
  await page.mouse.up();
  assert(await inExt('!Vern.debug.hud.menu.hidden'), 'long-press opens the menu');
  const sizeL = await inExt(`(() => { const r = Vern.debug.hud.root.querySelector('[data-size-pick="L"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await page.mouse.click(sizeL.x, sizeL.y);
  await sleep(300);
  assert((await inExt('Vern.debug.hud.card.dataset.size')) === 'L', 'menu size L enlarges the widget');
  await page.screenshot({ path: path.join(outDir, '6-menu.png') });
  await page.mouse.click(5, 795); // click outside closes it
  await sleep(200);
  assert(await inExt('Vern.debug.hud.menu.hidden'), 'clicking outside closes the menu');

  const g0 = await inExt('window.__giggles');
  sp = await stagePt();
  await page.mouse.click(sp.x, sp.y);
  await sleep(90);
  await page.mouse.click(sp.x, sp.y);
  await sleep(600);
  assert(await inExt('!Vern.debug.hud.assistant.hidden'), 'double-tap opens the mini-assistant');
  assert((await inExt('window.__giggles')) === g0, 'double-tap does not tickle');
  await inExt(`Vern.debug.hud.closePopovers(), true`);
  await sleep(1600); // tickle cooldown
  for (let i = 0; i < 3; i++) { await page.mouse.click(sp.x, sp.y); await sleep(80); }
  await sleep(600);
  assert((await inExt('window.__giggles')) === g0 + 1, 'triple-tap still tickles');
  assert(await inExt('Vern.debug.hud.assistant.hidden'), 'triple-tap does not open the assistant');

  await inExt(`Vern.debug.hud.openAssistant(), Vern.debug.hud.onAction('assistant', 'switch to Old Oakley and talk slower'), true`);
  await sleep(800);
  const asst = await inExt(`({ p: Vern.settings.values.personaId, a: Vern.settings.values.accent, reply: Vern.debug.hud.asstReply.textContent })`);
  assert(asst.p === 'old_oakley' && asst.a === 'slow', `assistant switched character and style ("${asst.reply}")`);
  await page.screenshot({ path: path.join(outDir, '7-assistant.png') });
  await inExt(`Vern.debug.hud.closePopovers(), Vern.settings.save({ hudSize: 'S' }).then(() => true)`);
  await sleep(300);
  assert((await inExt('Vern.debug.hud.card.dataset.size')) === 'S', 'compact size');
  await page.screenshot({ path: path.join(outDir, '8-compact.png') });
  assert(await inExt(`getComputedStyle(Vern.debug.hud.root.querySelector('header [data-action="help"]')).display !== 'none'`), 'help button shows in compact size');
  await inExt(`Vern.settings.save({ hudSize: 'M' }).then(() => true)`);
  await sleep(300);
  await inExt(`Vern.debug.hud.root.querySelector('header [data-action="help"]').click(), true`);
  await sleep(200);
  const help = await inExt(`({ open: !Vern.debug.hud.help.hidden, n: Vern.debug.hud.help.querySelectorAll('details').length, title: Vern.debug.hud.help.querySelector('.pop-title').textContent })`);
  assert(help.open && help.n === 10 && /Fancy Bot/.test(help.title), `help dropdown opens with ${help.n} topics`);
  await inExt(`Vern.debug.hud.help.querySelectorAll('details')[1].open = true, true`);
  await sleep(150);
  await page.screenshot({ path: path.join(outDir, '8b-help.png') });
  await inExt(`Vern.debug.hud.root.querySelector('header [data-action="help"]').click(), true`);
  assert(await inExt('Vern.debug.hud.help.hidden'), 'help button toggles the dropdown closed');
  await inExt(`Vern.settings.save({ hudSize: 'S' }).then(() => true)`);
  await sleep(300);

  console.log('Town panel');
  await inExt(`Vern.settings.save({ hudSize: 'M', personaId: 'auto', accent: 'none', autoRead: true, paraphrase: false, townEnabled: true, townMembers: ['big_sal', 'professor_pip', 'sir_reginald_ledger'] }).then(() => true)`);
  await sleep(500);
  assert(await page.locator('#vernaculator-town').isVisible(), 'town strip shows along the top');
  await page.evaluate(() => window.streamReply('Your doctor wants to explain the diagnosis simply, so let me break it down.\nIn science terms, the experiment shows how stars and space work, which is fun to learn.\nFor your budget, the cost is low and you can save money with a simple plan.', { delay: 2 }));
  const speakers = new Set();
  let segCount = 0;
  for (let i = 0; i < 120; i++) {
    await sleep(200);
    const st = await inExt(`({ a: Vern.debug.town.active, n: (Vern.debug.current?.segments || []).length, done: !!Vern.debug.current?.done, playing: Vern.debug.player.playing })`);
    if (st.a) speakers.add(st.a);
    segCount = Math.max(segCount, st.n);
    if (speakers.size >= 2 && i % 10 === 0) await page.screenshot({ path: path.join(outDir, '9-town.png') });
    if (st.done && !st.playing && speakers.size >= 3) break;
  }
  assert(segCount === 3, `answer split into ${segCount} sections`);
  assert(speakers.size >= 3, `speakers handed off on time: ${[...speakers].join(' -> ')}`);
  await inExt(`Vern.settings.save({ townEnabled: false }).then(() => true)`);

  await page.screenshot({ path: path.join(outDir, '3-hud-final.png') });

  console.log('Social: crib notes on X');
  const xHtml = fs.readFileSync(path.join(__dirname, 'fake-x.html'), 'utf8');
  await ctx.route('https://x.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: xHtml }));
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://x.com' });
  await sw.evaluate(() => chrome.storage.local.set({ hudSize: 'S', hudPos: { x: 960, y: 120 }, personaId: 'big_sal', accent: 'none' }));
  const xp = await ctx.newPage();
  const xcdp = await ctx.newCDPSession(xp);
  const xContexts = [];
  xcdp.on('Runtime.executionContextCreated', (e) => xContexts.push(e.context));
  await xcdp.send('Runtime.enable');
  await xp.goto('https://x.com/home');
  await xp.waitForSelector('#vernaculator-hud', { state: 'attached', timeout: 10000 });
  await sleep(800);
  const inX = async (expr) => {
    const c = [...xContexts].reverse().find((x) => x.auxData?.type === 'isolated' && x.name === 'Fancy Bot');
    const r = await xcdp.send('Runtime.evaluate', { expression: expr, contextId: c.id, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const tabs = await inX(`({ post: !Vern.debug.hud.root.querySelector('[data-tab="social"]').hidden, ask: !Vern.debug.hud.root.querySelector('[data-tab="ask"]').hidden })`);
  assert(tabs.post && !tabs.ask, 'Post tab replaces Ask on social sites');
  assert(!(await inX('Vern.debug.observer instanceof Vern.MessageObserver')), 'no AI-reply observer on social sites');

  const art = await xp.locator('article').first().boundingBox();
  await xp.mouse.move(art.x + 200, art.y + 60);
  await sleep(300);
  const pill = await xp.locator('#vernaculator-crib').boundingBox();
  assert(pill && pill.y >= art.y && pill.x + pill.width <= art.x + art.width + 1, 'Crib notes pill appears on the hovered post');
  await xp.mouse.click(pill.x + pill.width / 2, pill.y + pill.height / 2);
  let crib = null;
  for (let i = 0; i < 100 && !crib; i++) {
    await sleep(150);
    crib = await inX(`Vern.debug.lastSession?.task === 'crib' ? { text: Vern.debug.lastSession.text, who: Vern.debug.lastSession.persona?.id } : null`);
  }
  assert(crib && /^Crib notes: Big news/.test(crib.text), `crib notes for the tapped post ("${crib?.text.slice(0, 60)}...")`);
  assert(crib.who === 'big_play_ray', 'crib notes use the comedic voice (Big Play Ray)');
  const ui = await inX(`({ out: !Vern.debug.hud.socialOut.hidden, size: Vern.debug.hud.card.dataset.size })`);
  assert(ui.out && ui.size === 'M', 'HUD grows from compact to show the result and share buttons');
  await sleep(500);
  await xp.screenshot({ path: path.join(outDir, '10-social-crib.png') });

  await inX(`Vern.debug.hud.onAction('reply', 'Bright idea'), true`);
  let reply = null;
  for (let i = 0; i < 100 && !reply; i++) {
    await sleep(150);
    reply = await inX(`Vern.debug.lastSession?.task === 'reply' ? Vern.debug.lastSession.text : null`);
  }
  assert(reply && /Bright idea\./.test(reply), `reply draft follows the angle ("${reply}")`);
  await inX(`Vern.debug.hud.onAction('openReply'), true`);
  await sleep(400);
  assert(await xp.evaluate(() => window.__replyClicked === true), "Open reply box opens the site's own reply box");
  assert(await xp.evaluate(() => document.querySelector('textarea').value === ''), 'nothing is typed or posted for the user');
  const clip = await xp.evaluate(() => navigator.clipboard.readText());
  assert(clip === reply, 'reply text copied to the clipboard');

  const vidP = xp.waitForEvent('download', { timeout: 60000 });
  await inX(`Vern.debug.hud.onAction('export'), true`);
  const vid = await vidP;
  const vidFile = path.join(outDir, `social-${vid.suggestedFilename()}`);
  await vid.saveAs(vidFile);
  assert(fs.statSync(vidFile).size > 10000, `reply video rendered (${path.basename(vidFile)})`);
  await xp.screenshot({ path: path.join(outDir, '11-social-reply.png') });

  console.log("Social: What's hot and the writers' room");
  await inX(`Vern.settings.save({ whatsHot: true }).then(() => true)`);
  await sleep(300);
  const hot = await inX(`Vern.rankPosts(Vern.platformFor()).map((p) => ({ t: p.text.slice(0, 20), reach: p.reach, topic: p.topic }))`);
  assert(hot[0].t.startsWith('Council streetlight') && hot[0].reach === 1688, `What's hot ranks by reach and shared topics (${hot.map((h) => `${h.t}… ${h.reach} #${h.topic}`).join(' | ')})`);
  assert(hot[1].t.startsWith('Big news') && hot[1].reach === 252, 'second: the long council post');
  await inX(`Vern.debug.hud.onAction('pickHot', 0), true`);
  await sleep(600);
  assert(await inX(`Vern.debug.lastPost.text.startsWith('Council streetlight')`), 'picking a hot post makes it the target');

  await inX(`Vern.debug.hud.onAction('scene'), true`);
  let scene = null;
  for (let i = 0; i < 200 && !scene; i++) {
    await sleep(150);
    scene = await inX(`Vern.debug.lastSession?.task === 'scene' ? { text: Vern.debug.lastSession.text, segs: Vern.debug.lastSession.segments.map((s) => s.persona.id), lines: Vern.debug.lastSession.segments.map((s) => !!s.line) } : null`);
    if (i === 25) await xp.screenshot({ path: path.join(outDir, '12-scene.png') });
  }
  if (!scene) console.log('    debug', JSON.stringify(await inX(`({ status: Vern.debug.hud.statusEl.textContent, task: Vern.debug.current?.task, done: Vern.debug.current?.done, segs: Vern.debug.current?.segments.length, last: Vern.debug.lastSession?.task, playing: Vern.debug.player.playing, cap: Vern.debug.hud.caption.textContent })`)));
  assert(scene && /^Big Play Ray: So council streetlight vote/m.test(scene.text), `scene about the picked post:\n      ${scene?.text.split('\n').join('\n      ')}`);
  assert(new Set(scene.segs).size >= 3 && scene.lines.every(Boolean), `cast took turns in beat order: ${scene.segs.join(' -> ')}`);
  assert(await xp.locator('#vernaculator-town').isVisible(), 'scene cast shown along the top');
  const sceneVidP = xp.waitForEvent('download', { timeout: 90000 });
  await inX(`Vern.debug.hud.onAction('export'), true`);
  const sceneVid = await sceneVidP;
  const sceneFile = path.join(outDir, `scene-${sceneVid.suggestedFilename()}`);
  await sceneVid.saveAs(sceneFile);
  assert(fs.statSync(sceneFile).size > 20000, `multi-character scene video rendered (${path.basename(sceneFile)})`);

  await ctx.close();
  console.log('\nE2E PASSED');
})().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
