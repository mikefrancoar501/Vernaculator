// Wires observers -> middleware connection -> player/HUD.
(async () => {
  const platform = Vern.platformFor();
  if (!platform || window.__vernaculatorLoaded) return;
  window.__vernaculatorLoaded = true;

  const settings = await Vern.settings.load();
  const FALLBACK = { idle: Vern.assetUrl('assets/sprites/default_idle.svg'), talking: Vern.assetUrl('assets/sprites/default_talking.svg') };

  let personas = [];
  let seqCounter = Math.floor(Math.random() * 1e6);
  let current = null; // { seq, sourceId, persona, sprites }
  let lastSession = null; // { chunks, text, persona, sprites } for replay/export

  const player = new Vern.StreamPlayer({ onState: onPlayerState });
  const conn = new Vern.Connection({
    onMessage: onServerMessage,
    onAudio: (seq, bytes) => player.push(seq, bytes),
    onStatus: (s) => {
      if (s === 'connected') hud.setStatus('Connected', 'ok');
      else if (s === 'connecting') hud.setStatus('Connecting...', 'busy');
      else hud.dot.dataset.tone = 'idle'; // keep any error text visible
    },
  });
  const hud = new Vern.Hud({ onAction, onSetting: (k, v) => Vern.settings.save({ [k]: v }) });
  hud.mount(settings);
  if (!settings.controlsHintSeen) hud.showControlsHint();
  const viseme = new Vern.VisemeDriver(hud.img, player);
  const town = new Vern.TownStrip({ onPick: (id) => Vern.settings.save({ personaId: id }) });
  town.mount();
  viseme.setSprites(FALLBACK);

  // Web Audio may only start after a user gesture; hook the first one on the page.
  const unlock = () => player.ensureAudioGraph();
  window.addEventListener('pointerdown', unlock, { capture: true, once: true });
  window.addEventListener('keydown', unlock, { capture: true, once: true });

  const giggler = new Vern.Giggler(() => player.ensureAudioGraph());
  giggler.preload();
  Vern.attachCharacterGestures(hud.stage, {
    onTickle: () => {
      hud.giggle();
      giggler.play();
    },
    onLongPress: () => hud.openMenu(personas, Vern.settings.values.personaId),
    onDoubleTap: () => hud.openAssistant(),
  });
  player.audio.muted = !!settings.muted;

  // --- Grok companion replacement ----------------------------------------------
  // On grok.com the HUD can take the place of Grok's own animated companion avatar.
  const companion = {
    style: null,
    sync() {
      const sel = platform.companionSelector;
      if (!sel) return;
      const on = Vern.settings.values.replaceCompanion !== false;
      const el = on && document.querySelector(sel);
      if (on && el && !this.style) {
        const rect = el.getBoundingClientRect();
        if (rect.width && rect.height && !Vern.settings.values.hudPos) hud.placeOver(rect);
        this.style = document.createElement('style');
        this.style.textContent = `${sel} { visibility: hidden !important; }`;
        document.documentElement.appendChild(this.style);
      } else if (!on && this.style) {
        this.style.remove();
        this.style = null;
      }
    },
  };
  if (platform.companionSelector) {
    companion.sync();
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      setTimeout(() => { queued = false; companion.sync(); }, 500);
    }).observe(document.body, { childList: true, subtree: true });
  }

  // --- Personas & sprites ---------------------------------------------------
  const spriteCache = new Map();
  function hueFor(id) {
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  }
  function canLoad(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }
  async function spritesFor(persona) {
    if (!persona) return { ...FALLBACK, hue: 0 };
    if (!spriteCache.has(persona.id)) {
      spriteCache.set(persona.id, (async () => {
        // personas.json may point at https URLs or at sprites bundled in this extension (assets/...).
        const resolve = (u) => (!u ? '' : /^https:\/\//.test(u) ? u : Vern.assetUrl(u));
        const idleUrl = resolve(persona.visemeAssets?.idleUrl);
        const talkingUrl = resolve(persona.visemeAssets?.talkingUrl);
        const ok = idleUrl && talkingUrl && (await canLoad(idleUrl)) && (await canLoad(talkingUrl));
        return ok ? { idle: idleUrl, talking: talkingUrl, hue: 0 } : { ...FALLBACK, hue: hueFor(persona.id) };
      })());
    }
    return spriteCache.get(persona.id);
  }
  async function showPersona(persona) {
    hud.setActivePersona(persona);
    const sprites = await spritesFor(persona);
    hud.img.style.filter = sprites.hue ? `hue-rotate(${sprites.hue}deg)` : '';
    viseme.setSprites(sprites);
    return sprites;
  }

  const townIds = () => (Vern.settings.values.townMembers || []).filter((id) => personas.some((p) => p.id === id));
  const townOn = () => Vern.settings.values.townEnabled && townIds().length >= 2;
  async function refreshTown() {
    const members = await Promise.all(townIds().map(async (id) => {
      const p = personas.find((x) => x.id === id);
      return { id, name: p.name, sprites: await spritesFor(p) };
    }));
    town.setMembers(members);
    town.setVisible(townOn());
  }

  async function loadPersonas() {
    try {
      const data = await Vern.fetchJson(`${Vern.settings.values.backendUrl.replace(/\/+$/, '')}/v1/personas`);
      personas = data.characters;
      hud.setStyleCatalog(data.styles);
      hud.setPersonas(personas, Vern.settings.values.personaId);
      refreshTown();
      const selected = personas.find((p) => p.id === Vern.settings.values.personaId);
      showPersona(selected || null);
    } catch (err) {
      hud.setStatus(`Middleware unreachable at ${Vern.settings.values.backendUrl}`, 'err');
    }
  }
  loadPersonas();

  // --- Speaking ---------------------------------------------------------------
  const SOURCE_NAME = { claude: 'Claude', grok: 'Grok', gemini: 'Gemini' }[platform.id];

  /**
   * Start a spoken request. `task` is speak | keypoints | ask | expound; overrides let the
   * Ask panel force a one-off character (e.g. Oakley) or a one-off paraphrase.
   */
  async function startUtterance({ sourceId = null, text = '', final = false, task = 'speak', question, personaId, paraphrase, cast, director } = {}) {
    if (current) conn.send({ type: 'utterance.cancel', seq: current.seq }).catch(() => {});
    if (sceneStrip) { sceneStrip = false; refreshTown(); }
    const seq = ++seqCounter;
    current = { seq, sourceId, persona: null, sprites: null, text: '', task, segments: [] };
    hud.setCaption('');
    hud.setSources([]);
    hud.setStatus(Vern.t('statusThinking', 'Thinking in character...'), 'busy');
    player.begin(seq);
    const v = Vern.settings.values;
    const style = { paraphrase: paraphrase ?? v.paraphrase, humor: v.humor, philosophy: v.philosophy, accent: v.accent };
    try {
      await conn.send({
        type: 'utterance.start',
        seq,
        personaId: personaId || v.personaId,
        readingLevel: v.readingLevel,
        style,
        task,
        question,
        profile: Vern.profile(),
        source: platform.id,
        // Town panel shares plain read-alouds; one-off actions (Oakley, Ask, ...) stay solo.
        town: cast || (townOn() && task === 'speak' && !personaId ? townIds() : undefined),
        director,
        text,
        final,
      });
    } catch (err) {
      hud.setStatus(err.message, 'err');
      current = null;
    }
    return seq;
  }

  function sendChunk(seq, text) {
    conn.send({ type: 'utterance.text', seq, text }).catch(() => {});
  }

  function speak(text, extra = {}) {
    const clean = (text || '').trim();
    if (!clean) return hud.setStatus(Vern.t('statusNothing', 'Nothing to read yet.'), 'idle');
    startUtterance({ text: clean.slice(0, 20000), final: true, ...extra });
  }

  /** Mini-assistant: the server maps the request onto settings; we apply them and show the reply. */
  async function runAssistant(text) {
    const v = Vern.settings.values;
    try {
      const res = await Vern.fetchJson(
        `${v.backendUrl.replace(/\/+$/, '')}/v1/assistant`,
        { Authorization: `Bearer ${v.token}` },
        { text, current: { personaId: v.personaId, readingLevel: v.readingLevel, accent: v.accent, size: v.hudSize } },
      );
      const a = res.action || {};
      const patch = {};
      for (const k of ['personaId', 'readingLevel', 'accent', 'humor', 'philosophy', 'paraphrase', 'muted']) if (k in a) patch[k] = a[k];
      if (a.size) Object.assign(patch, { hudSize: a.size, hudScale: 1 });
      if (Object.keys(patch).length) await Vern.settings.save(patch);
      hud.setAssistantReply(res.reply || '');
      lastAssistant = res;
    } catch (err) {
      hud.setAssistantReply(err.message);
    }
  }
  let lastAssistant = null;

  // The full text of the most recent AI answer: what Key points / Ask / Expound work from.
  let lastAnswer = '';
  const answerText = () => lastAnswer || observer.latestText();

  // --- Social sites (X, Facebook, Instagram) ---------------------------------------
  // No AI replies to watch: the user picks a post. The character writes crib notes or a reply
  // draft; the user copies it, makes a video, and posts it themselves. We never post for them.
  let lastPost = null; // { el, text }
  const social = platform.social ? new Vern.SocialOverlay(platform, { onCrib: (el) => socialTask('crib', el) }) : null;
  if (social) {
    social.mount();
    hud.setSocial(true);
  }
  let sceneStrip = false; // the town strip is showing a writers' room cast
  let hotItems = [];
  function refreshHot() {
    if (!social || !Vern.settings.values.whatsHot) return;
    hotItems = Vern.rankPosts(platform);
    hud.setHotList(hotItems);
  }
  if (social) {
    let queued = false;
    new MutationObserver(() => {
      if (queued || !Vern.settings.values.whatsHot) return;
      queued = true;
      setTimeout(() => { queued = false; refreshHot(); }, 3000);
    }).observe(document.body, { childList: true, subtree: true });
    refreshHot();
  }
  function socialTask(task, el, angle) {
    const post = el || (lastPost?.el?.isConnected && (task !== 'crib' || lastPost.picked) ? lastPost.el : null) || social.postInView();
    const text = post ? Vern.postText(platform, post) : '';
    if (!text) return hud.setStatus(Vern.t('socialNoPost', 'No post found. Scroll a post into view or tap 🎭 on one.'), 'idle');
    lastPost = { el: post, text, picked: post === lastPost?.el && lastPost.picked };
    hud.setSocialResult(false);
    hud.showTab('social', false);
    if (hud.card.dataset.size === 'S') hud.applySettings({ hudSize: 'M' }); // show the result, without changing the saved size
    const v = Vern.settings.values;
    if (task === 'scene') return speak(text, { task, cast: v.sceneCast, director: v.sceneDirector });
    speak(text, { task, question: angle || undefined, personaId: v.cribPersonaId || undefined });
  }
  async function copyResult() {
    const text = lastSession?.text;
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  const observer = social ? { start() {}, latestText: () => lastPost?.text || '' } : new Vern.MessageObserver(platform, {
    onStart(id) {
      if (Vern.settings.values.autoRead) startUtterance({ sourceId: id });
    },
    onChunk(id, text) {
      if (current?.sourceId === id) sendChunk(current.seq, text);
    },
    onEnd(id, fullText) {
      if (fullText) lastAnswer = fullText;
      if (current?.sourceId === id) conn.send({ type: 'utterance.end', seq: current.seq }).catch(() => {});
    },
  });
  observer.start();

  // --- Server events ----------------------------------------------------------
  async function onServerMessage(msg) {
    if (msg.seq !== undefined && msg.seq !== current?.seq) return;
    switch (msg.type) {
      case 'utterance.persona':
        current.persona = msg.persona;
        current.applied = { readingLevel: msg.readingLevel, style: msg.style }; // what the server actually used
        current.sprites = await showPersona(msg.persona);
        hud.setStatus(`${msg.persona.name}${msg.method !== 'manual' ? ` (${Vern.t('statusAutoPicked', 'auto-picked')})` : ''}`, 'busy');
        break;
      case 'utterance.status': {
        const labels = { paraphrasing: ['statusParaphrasing', 'Paraphrasing...'], keypoints: ['statusKeyPoints', 'Finding the key points...'], ask: ['statusAnswering', 'Answering...'], expound: ['statusExpounding', 'Digging deeper...'], crib: ['statusCrib', 'Writing crib notes...'], reply: ['statusReply', 'Drafting a reply...'], pitching: ['statusPitching', 'The room is pitching lines...'], directing: ['statusDirecting', 'The director is putting the scene together...'] };
        const [k, fb] = labels[msg.status] || ['', msg.status];
        hud.setStatus(Vern.t(k, fb), 'busy');
        break;
      }
      case 'scene.cast':
        hud.setStatus(`${Vern.t('sceneRoom', "Writers' room")}: ${msg.roles.map((r) => r.name).join(', ')}${msg.director ? ` · ${Vern.t('sceneDirector', 'Director')}: ${msg.director.name}` : ''}`, 'busy');
        break;
      case 'town.plan':
        if (current.task === 'scene') {
          // Show the scene's cast along the top while it plays.
          sceneStrip = true;
          Promise.all(msg.members.map(async (p) => ({ id: p.id, name: p.name, sprites: await spritesFor(p) }))).then((members) => {
            if (!sceneStrip) return;
            town.setMembers(members);
            town.setVisible(true);
          });
        }
        break;
      case 'utterance.segment': {
        // Remember where in the audio this speaker starts; the playback loop hands off on time.
        const seg = { startByte: player.bytes, persona: msg.persona, sprites: null };
        current.segments.push(seg);
        seg.sprites = await spritesFor(msg.persona);
        startTownLoop();
        break;
      }
      case 'utterance.sources':
        hud.setSources(msg.sources);
        break;
      case 'utterance.caption':
        if (msg.speaker) hud.setCaption(`${hud.caption.textContent ? `${hud.caption.textContent}\n` : ''}${msg.speaker}: ${msg.text}`);
        else hud.appendCaption(msg.text);
        break;
      case 'utterance.done':
        current.done = true;
        player.end(msg.seq);
        if (msg.script) current.segments.forEach((seg, i) => { seg.line = msg.script[i]?.line || ''; });
        lastSession = { chunks: player.chunks, text: msg.text, persona: current.persona, sprites: current.sprites, segments: current.segments, task: current.task };
        if (['crib', 'reply', 'scene'].includes(current.task)) hud.setSocialResult(true);
        hud.setStatus((() => { const n = msg.usage.remainingChars.toLocaleString(); return Vern.t('statusCharsLeft', `${n} characters left this month`, [n]); })(), 'ok');
        break;
      case 'utterance.cancelled':
        if (msg.reason !== 'superseded' && msg.reason !== 'client') hud.setStatus(`Stopped (${msg.reason})`, 'idle');
        break;
      case 'error':
        hud.setStatus(msg.message || msg.code, msg.recoverable ? 'busy' : 'err');
        break;
    }
  }

  // While a town-panel reply plays, switch the active speaker (HUD sprite + strip) by playhead position.
  let townRaf = 0;
  let activeSeg = null;
  function startTownLoop() {
    if (townRaf) return;
    const tick = () => {
      const segs = current?.segments || lastSession?.segments || [];
      if (!segs.length) { townRaf = 0; return; }
      const pos = player.playheadBytes;
      let seg = segs[0];
      for (const s of segs) if (s.startByte <= pos) seg = s;
      if (seg !== activeSeg && seg.sprites) {
        activeSeg = seg;
        hud.setActivePersona(seg.persona);
        hud.img.style.filter = seg.sprites.hue ? `hue-rotate(${seg.sprites.hue}deg)` : '';
        viseme.setSprites(seg.sprites);
        town.setActive(seg.persona.id);
      }
      town.setMouth(hud.img.dataset.mouth === 'open');
      townRaf = player.playing || (current && !current.done) ? requestAnimationFrame(tick) : 0;
    };
    townRaf = requestAnimationFrame(tick);
  }

  function onPlayerState(state) {
    hud.setPlaying(state === 'playing');
    if (state === 'playing') {
      viseme.start();
      if ((current?.segments || lastSession?.segments || []).length) {
        activeSeg = null;
        startTownLoop();
      }
    }
    if (state === 'blocked') hud.setStatus('Press ▶ to start audio (the browser blocked autoplay).', 'busy');
    if (state === 'error') hud.setStatus('This site blocked audio playback; captions only.', 'err');
  }

  // --- HUD actions --------------------------------------------------------------
  async function onAction(action, arg) {
    player.ensureAudioGraph();
    switch (action) {
      case 'profile':
        hud.closePopovers();
        chrome.runtime.sendMessage({ op: 'openOptions' });
        break;
      case 'toggleMute':
        Vern.settings.save({ muted: !Vern.settings.values.muted });
        break;
      case 'openAssistant':
        hud.openAssistant();
        break;
      case 'assistant':
        await runAssistant(arg);
        break;
      case 'keypoints':
        speak(answerText(), { task: 'keypoints' });
        break;
      case 'paraphraseNow':
        speak(answerText(), { paraphrase: true });
        break;
      case 'oakley':
        speak(answerText(), { paraphrase: true, personaId: 'old_oakley' });
        break;
      case 'ask':
        if (!arg) return;
        speak(answerText(), { task: 'ask', question: arg });
        hud.clearQuestion();
        break;
      case 'expound':
        speak(answerText(), { task: 'expound', question: arg || undefined });
        break;
      case 'crib':
        socialTask('crib');
        break;
      case 'reply':
        socialTask('reply', null, arg);
        break;
      case 'scene':
        socialTask('scene');
        break;
      case 'refreshHot':
        refreshHot();
        break;
      case 'pickHot': {
        const it = hotItems[arg];
        if (!it?.el?.isConnected) return refreshHot();
        it.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        lastPost = { el: it.el, text: it.text, picked: true };
        hud.setStatus(Vern.t('hotPicked', 'Picked. Now tap Crib notes, Draft reply or the scene.'), 'ok');
        break;
      }
      case 'copyText':
        hud.setStatus((await copyResult()) ? Vern.t('socialCopied', 'Copied. Paste it wherever you like.') : Vern.t('socialCopyFailed', 'Could not copy; select the caption text instead.'), 'ok');
        break;
      case 'openReply': {
        const copied = await copyResult();
        const opened = social?.openReply(lastPost?.el);
        hud.setStatus(
          opened
            ? Vern.t('socialReplyOpened', 'Reply box opened. Paste the text and attach your video, then post it yourself.')
            : Vern.t('socialReplyNotFound', 'Could not find the reply button on this post.') + (copied ? ` ${Vern.t('socialCopied', 'Copied. Paste it wherever you like.')}` : ''),
          opened ? 'ok' : 'idle',
        );
        break;
      }
      case 'playpause':
        if (player.playing) player.pause();
        else if (player.audio.currentSrc && !player.audio.ended) player.resume();
        else if (lastSession) player.replay();
        else speak(observer.latestText());
        break;
      case 'replay':
        if (!player.replay()) speak(observer.latestText());
        break;
      case 'stop':
        if (sceneStrip) { sceneStrip = false; refreshTown(); }
        if (current) conn.send({ type: 'utterance.cancel', seq: current.seq }).catch(() => {});
        current = null;
        player.stop();
        break;
      case 'readSelection':
        speak(window.getSelection()?.toString() || observer.latestText());
        break;
      case 'export':
        if (!lastSession) return hud.setStatus(Vern.t('statusExportFirst', 'Play a reply first, then export it.'), 'idle');
        try {
          hud.setStatus('Rendering video...', 'busy');
          hud.setExportProgress(0);
          const s = lastSession;
          const { blob, ext } = await Vern.exportMeme(
            {
              chunks: s.chunks,
              text: s.text,
              persona: s.persona,
              hue: s.sprites?.hue || 0,
              sprites: { idle: s.sprites?.idle || FALLBACK.idle, talking: s.sprites?.talking || FALLBACK.talking, fallbackIdle: FALLBACK.idle, fallbackTalking: FALLBACK.talking },
              segments: s.segments,
            },
            (f) => hud.setExportProgress(f),
          );
          const name = `${(s.persona?.name || 'fancy-bot').toLowerCase().replace(/\W+/g, '-')}-${Date.now()}.${ext}`;
          Vern.downloadBlob(blob, name);
          hud.setStatus(ext === 'mp4' ? 'Saved MP4.' : 'Saved WebM (this Chrome cannot record MP4).', 'ok');
        } catch (err) {
          hud.setStatus(err.message, 'err');
        } finally {
          hud.setExportProgress(null);
        }
        break;
    }
  }

  Vern.settings.onChange((patch) => {
    hud.applySettings(patch);
    if ('muted' in patch) player.audio.muted = !!patch.muted;
    if ('townEnabled' in patch || 'townMembers' in patch) refreshTown();
    if ('whatsHot' in patch) refreshHot();
    if ('replaceCompanion' in patch) companion.sync();
    if ('backendUrl' in patch || 'token' in patch) {
      conn.reset();
      loadPersonas();
    }
    if ('personaId' in patch && !current) showPersona(personas.find((p) => p.id === patch.personaId) || null);
  });

  // Exposed for debugging from DevTools (isolated world): Vern.debug.speak('hello')
  Vern.debug = { speak, player, conn, observer, hud, get lastSession() { return lastSession; }, get current() { return current; }, get lastAssistant() { return lastAssistant; }, town, social, get lastPost() { return lastPost; } };
})();
