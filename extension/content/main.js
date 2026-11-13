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
  const viseme = new Vern.VisemeDriver(hud.img, player);
  viseme.setSprites(FALLBACK);

  // Web Audio may only start after a user gesture; hook the first one on the page.
  const unlock = () => player.ensureAudioGraph();
  window.addEventListener('pointerdown', unlock, { capture: true, once: true });
  window.addEventListener('keydown', unlock, { capture: true, once: true });

  const giggler = new Vern.Giggler(() => player.ensureAudioGraph());
  giggler.preload();
  Vern.attachTickle(hud.stage, () => {
    hud.giggle();
    giggler.play();
  });

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

  async function loadPersonas() {
    try {
      const data = await Vern.fetchJson(`${Vern.settings.values.backendUrl.replace(/\/+$/, '')}/v1/personas`);
      personas = data.characters;
      hud.setStyleCatalog(data.styles);
      hud.setPersonas(personas, Vern.settings.values.personaId);
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
  async function startUtterance({ sourceId = null, text = '', final = false, task = 'speak', question, personaId, paraphrase } = {}) {
    if (current) conn.send({ type: 'utterance.cancel', seq: current.seq }).catch(() => {});
    const seq = ++seqCounter;
    current = { seq, sourceId, persona: null, sprites: null, text: '', task };
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

  // The full text of the most recent AI answer: what Key points / Ask / Expound work from.
  let lastAnswer = '';
  const answerText = () => lastAnswer || observer.latestText();

  const observer = new Vern.MessageObserver(platform, {
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
        const labels = { paraphrasing: ['statusParaphrasing', 'Paraphrasing...'], keypoints: ['statusKeyPoints', 'Finding the key points...'], ask: ['statusAnswering', 'Answering...'], expound: ['statusExpounding', 'Digging deeper...'] };
        const [k, fb] = labels[msg.status] || ['', msg.status];
        hud.setStatus(Vern.t(k, fb), 'busy');
        break;
      }
      case 'utterance.sources':
        hud.setSources(msg.sources);
        break;
      case 'utterance.caption':
        hud.appendCaption(msg.text);
        break;
      case 'utterance.done':
        player.end(msg.seq);
        lastSession = { chunks: player.chunks, text: msg.text, persona: current.persona, sprites: current.sprites };
        hud.setStatus(Vern.t('statusCharsLeft', '$1 characters left this month').replace('$1', msg.usage.remainingChars.toLocaleString()), 'ok');
        break;
      case 'utterance.cancelled':
        if (msg.reason !== 'superseded' && msg.reason !== 'client') hud.setStatus(`Stopped (${msg.reason})`, 'idle');
        break;
      case 'error':
        hud.setStatus(msg.message || msg.code, msg.recoverable ? 'busy' : 'err');
        break;
    }
  }

  function onPlayerState(state) {
    hud.setPlaying(state === 'playing');
    if (state === 'playing') viseme.start();
    if (state === 'blocked') hud.setStatus('Press ▶ to start audio (the browser blocked autoplay).', 'busy');
    if (state === 'error') hud.setStatus('This site blocked audio playback; captions only.', 'err');
  }

  // --- HUD actions --------------------------------------------------------------
  async function onAction(action, arg) {
    player.ensureAudioGraph();
    switch (action) {
      case 'profile':
        chrome.runtime.sendMessage({ op: 'openOptions' });
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
            },
            (f) => hud.setExportProgress(f),
          );
          const name = `${(s.persona?.name || 'vernaculator').toLowerCase().replace(/\W+/g, '-')}-${Date.now()}.${ext}`;
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
    if ('backendUrl' in patch || 'token' in patch) {
      conn.reset();
      loadPersonas();
    }
    if ('personaId' in patch && !current) showPersona(personas.find((p) => p.id === patch.personaId) || null);
  });

  // Exposed for debugging from DevTools (isolated world): Vern.debug.speak('hello')
  Vern.debug = { speak, player, conn, observer, hud, get lastSession() { return lastSession; }, get current() { return current; } };
})();
