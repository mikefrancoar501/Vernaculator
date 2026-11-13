// Floating control widget (spec 2.2 / 5.1): Shadow-DOM isolated, draggable with pointer
// events (mouse + touch), positioned with transform: translate(x, y), collapsible.
(() => {
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .card {
      --bg: #ffffff; --fg: #1d1b26; --muted: #6c6880; --line: #e4e1ee; --accent: #6b4eff; --accent-fg: #fff; --chip: #f3f1fa;
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg); background: var(--bg);
      width: 300px; border: 1px solid var(--line); border-radius: 16px; overflow: hidden;
      box-shadow: 0 12px 32px rgba(20, 10, 60, .18), 0 2px 6px rgba(20, 10, 60, .08);
      user-select: none; -webkit-user-select: none;
    }
    @media (prefers-color-scheme: dark) {
      .card { --bg: #1e1c27; --fg: #f1effa; --muted: #a29eb8; --line: #34313f; --accent: #8f7bff; --chip: #2a2735; }
    }
    header { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: grab; touch-action: none; border-bottom: 1px solid var(--line); }
    header:active { cursor: grabbing; }
    .title { font-weight: 700; flex: 1; letter-spacing: .2px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
    .dot[data-tone="ok"] { background: #2fbf71; } .dot[data-tone="busy"] { background: #f5a524; } .dot[data-tone="err"] { background: #e5484d; }
    button { font: inherit; color: inherit; background: var(--chip); border: 1px solid var(--line); border-radius: 10px; padding: 6px 10px; cursor: pointer; min-width: 36px; min-height: 32px; }
    button:hover { border-color: var(--accent); }
    button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    button.primary { background: var(--accent); color: var(--accent-fg); border-color: transparent; }
    button.icon { padding: 4px 8px; background: transparent; border-color: transparent; }
    .body { padding: 10px; display: grid; gap: 10px; }
    .card.collapsed .body { display: none; }
    .card.collapsed { width: auto; }
    .stage { position: relative; height: 150px; border-radius: 12px; background: radial-gradient(circle at 50% 40%, var(--chip), transparent 70%); display: grid; place-items: center; touch-action: none; cursor: pointer; }
    .stage img { max-height: 140px; max-width: 100%; pointer-events: none; transition: transform .08s ease-out; }
    .stage img[data-mouth="open"] { transform: translateY(-2px) scale(1.02); }
    .stage.giggle img { animation: wiggle .5s ease-in-out; }
    @keyframes wiggle { 0%,100% { transform: rotate(0) } 20% { transform: rotate(-8deg) } 40% { transform: rotate(7deg) } 60% { transform: rotate(-5deg) } 80% { transform: rotate(3deg) } }
    .who { position: absolute; left: 8px; bottom: 6px; font-size: 11px; color: var(--muted); }
    .caption { min-height: 2.8em; max-height: 6.5em; overflow: auto; color: var(--fg); font-size: 12.5px; user-select: text; -webkit-user-select: text; }
    .caption:empty::before { content: attr(data-placeholder); color: var(--muted); }
    .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .row.controls button { flex: 1; }
    label.field { display: grid; gap: 3px; flex: 1; font-size: 11px; color: var(--muted); }
    select { font: inherit; color: var(--fg); background: var(--chip); border: 1px solid var(--line); border-radius: 10px; padding: 6px 8px; width: 100%; }
    .level { display: grid; gap: 2px; }
    .level-head { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); }
    .level-head b { color: var(--fg); font-weight: 600; }
    .level-ends { display: flex; justify-content: space-between; font-size: 10px; color: var(--muted); }
    input[type="range"] { width: 100%; accent-color: var(--accent); margin: 2px 0; }
    .chip { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 999px; background: var(--chip); cursor: pointer; }
    .chip:has(input:checked) { border-color: var(--accent); }
    .chip input { margin: 0; accent-color: var(--accent); }
    label.field.style-field { flex: 1 1 100%; }
    .toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }
    .status { font-size: 11px; color: var(--muted); min-height: 1.2em; }
    progress { width: 100%; height: 6px; accent-color: var(--accent); }
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); }
    .tabs button { flex: 1; border: 0; border-radius: 8px 8px 0 0; background: transparent; color: var(--muted); font-weight: 600; min-height: 30px; }
    .tabs button[aria-selected="true"] { color: var(--fg); box-shadow: inset 0 -2px 0 var(--accent); }
    section { display: grid; gap: 10px; }
    .chip.strong { font-weight: 600; }
    .hint { font-size: 11px; color: var(--muted); }
    .quick button { flex: 1 1 auto; font-size: 12px; }
    .quick .oak { flex-basis: 100%; background: #2f4a26; color: #fff7c2; border-color: transparent; }
    form.ask { display: grid; gap: 6px; }
    form.ask input { font: inherit; color: var(--fg); background: var(--chip); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; width: 100%; user-select: text; -webkit-user-select: text; }
    form.ask .row button { flex: 1; }
    .sources { margin: 0; padding: 0 0 0 16px; font-size: 11px; max-height: 5em; overflow: auto; }
    .sources a { color: var(--accent); }
    [hidden] { display: none !important; }
  `;

  // Text comes from _locales via chrome.i18n (data-i18n*), with English fallbacks in the markup.
  const HTML = `
    <div class="card" part="card">
      <header>
        <span class="dot" data-tone="idle"></span>
        <span class="title" data-i18n="extShortName">Vernaculator</span>
        <button class="icon" data-action="profile" data-i18n-title="hudProfile" title="About you" aria-label="About you">👤</button>
        <button class="icon" data-action="collapse" data-i18n-title="hudCollapse" title="Collapse" aria-label="Collapse">▾</button>
      </header>
      <div class="body">
        <div class="stage" data-i18n-title="hudTickle" title="Tap me rapidly...">
          <img alt="" draggable="false">
          <span class="who"></span>
        </div>
        <div class="caption" aria-live="polite" data-i18n-placeholder="hudCaptionPlaceholder" data-placeholder="New replies will be read aloud here."></div>
        <ul class="sources" hidden></ul>
        <div class="row controls">
          <button class="primary" data-action="playpause" data-i18n-title="hudPlayPause" title="Play / pause" aria-label="Play or pause">▶</button>
          <button data-action="replay" data-i18n-title="hudReplay" title="Replay last" aria-label="Replay">↻</button>
          <button data-action="stop" data-i18n-title="hudStop" title="Stop" aria-label="Stop">■</button>
          <button data-action="readSelection" data-i18n-title="hudReadSelection" title="Read selected text (or last reply)" aria-label="Read selection">❝</button>
        </div>
        <div class="tabs" role="tablist">
          <button role="tab" data-tab="listen" aria-selected="true" data-i18n="hudTabListen">Listen</button>
          <button role="tab" data-tab="ask" aria-selected="false" data-i18n="hudTabAsk">Ask</button>
        </div>
        <section data-panel="listen">
          <label class="field"><span data-i18n="hudCharacter">Character</span><select data-setting="personaId"></select></label>
          <div class="level">
            <div class="level-head"><span data-i18n="hudReadingLevel">Reading level</span><b class="level-name"></b></div>
            <input type="range" min="1" max="5" step="1" data-setting="readingLevel" data-i18n-aria="hudReadingLevel" aria-label="Reading level">
            <div class="level-ends"><span data-i18n="hudLevelLow">Plain &amp; simple</span><span data-i18n="hudLevelHigh">Expert</span></div>
          </div>
          <div class="row">
            <label class="chip strong"><input type="checkbox" data-setting="paraphrase"> <span data-i18n="hudParaphrase">Paraphrase</span></label>
            <label class="chip"><input type="checkbox" data-setting="humor"> <span data-i18n="hudHumor">Humor</span></label>
            <label class="chip"><input type="checkbox" data-setting="philosophy"> <span data-i18n="hudPhilosophy">Philosophy</span></label>
            <label class="field style-field"><span data-i18n="hudSpeakingStyle">Speaking style</span><select data-setting="accent"></select></label>
          </div>
          <div class="row">
            <label class="toggle"><input type="checkbox" data-setting="autoRead"> <span data-i18n="hudAutoRead">Auto-read replies</span></label>
            <span style="flex:1"></span>
            <button data-action="export" data-i18n-title="hudMemeTitle" title="Export the last reply as a video">🎬 <span data-i18n="hudMeme">Meme</span></button>
          </div>
        </section>
        <section data-panel="ask" hidden>
          <div class="hint" data-i18n="hudAskHint">About the last AI answer:</div>
          <div class="row quick">
            <button data-action="keypoints" data-i18n="hudKeyPoints">Key points</button>
            <button data-action="paraphraseNow" data-i18n="hudParaphraseNow">Paraphrase</button>
            <button data-action="oakley" class="oak" data-i18n="hudOakley">🌳 Paraphrase with Oakley</button>
          </div>
          <form class="ask">
            <input type="text" name="q" maxlength="500" autocomplete="off" data-i18n-placeholder="hudAskPlaceholder" placeholder="Ask about what it just said...">
            <div class="row">
              <button type="submit" class="primary" data-i18n="hudAsk">Ask</button>
              <button type="button" data-action="expound" data-i18n-title="hudExpoundTitle" title="Go deeper, with research" data-i18n="hudExpound">Expound</button>
            </div>
          </form>
        </section>
        <progress hidden max="1" value="0"></progress>
        <div class="status"></div>
      </div>
    </div>
  `;

  class Hud {
    constructor({ onAction, onSetting }) {
      this.onAction = onAction;
      this.onSetting = onSetting;
      this.pos = { x: 0, y: 0 };
    }

    mount(settings) {
      this.host = document.createElement('div');
      this.host.id = 'vernaculator-hud';
      Object.assign(this.host.style, { position: 'fixed', top: '0', left: '0', zIndex: '2147483000', willChange: 'transform' });
      this.root = this.host.attachShadow({ mode: 'closed' });
      this.root.innerHTML = `<style>${CSS}</style>${HTML}`;
      document.documentElement.appendChild(this.host);
      this.#localize();

      const $ = (s) => this.root.querySelector(s);
      this.card = $('.card');
      this.img = $('.stage img');
      this.stage = $('.stage');
      this.who = $('.who');
      this.caption = $('.caption');
      this.statusEl = $('.status');
      this.dot = $('.dot');
      this.playBtn = $('[data-action="playpause"]');
      this.progress = $('progress');
      this.personaSelect = $('[data-setting="personaId"]');
      this.levelInput = $('[data-setting="readingLevel"]');
      this.levelName = $('.level-name');
      this.styleSelect = $('[data-setting="accent"]');
      this.levelLabels = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, Vern.t(`level${n}`, ['Super simple', 'Plain', 'Everyday', 'Detailed', 'Expert'][n - 1])]));
      this.sourcesEl = $('.sources');
      this.askForm = $('form.ask');
      this.askForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = this.askForm.q.value.trim();
        if (q) this.onAction('ask', q);
      });
      for (const tab of this.root.querySelectorAll('[data-tab]')) {
        tab.addEventListener('click', () => this.showTab(tab.dataset.tab));
      }
      // Keep typing in the Ask box from triggering the host page's keyboard shortcuts.
      for (const ev of ['keydown', 'keyup', 'keypress']) this.askForm.addEventListener(ev, (e) => e.stopPropagation());
      this.levelInput.addEventListener('input', () => this.#showLevel());

      this.root.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        if (btn.dataset.action === 'collapse') return this.setCollapsed(!this.collapsed, true);
        this.onAction(btn.dataset.action, btn.dataset.action === 'expound' ? this.askForm.q.value.trim() : undefined);
      });
      this.root.addEventListener('change', (e) => {
        const el = e.target.closest('[data-setting]');
        if (!el) return;
        const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
        this.onSetting(el.dataset.setting, v);
      });

      this.applySettings(settings);
      this.setCollapsed(!!settings.hudCollapsed, false);
      this.#initDrag(settings.hudPos);
    }

    applySettings(s) {
      for (const el of this.root.querySelectorAll('[data-setting]')) {
        const v = s[el.dataset.setting];
        if (v === undefined) continue;
        if (el.type === 'checkbox') el.checked = !!v;
        else if (el.type === 'range') el.value = String(v);
        else if ([...el.options].some((o) => o.value === v)) el.value = v;
        else if (el.dataset.setting === 'accent') this.pendingAccent = v; // options arrive with the catalog
      }
      this.#showLevel();
      if ('hudVisible' in s) this.host.style.display = s.hudVisible === false ? 'none' : '';
    }

    #localize() {
      for (const el of this.root.querySelectorAll('[data-i18n]')) el.textContent = Vern.t(el.dataset.i18n, el.textContent);
      for (const el of this.root.querySelectorAll('[data-i18n-title]')) {
        el.title = Vern.t(el.dataset.i18nTitle, el.title);
        el.setAttribute('aria-label', el.title);
      }
      for (const el of this.root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', Vern.t(el.dataset.i18nAria, el.getAttribute('aria-label')));
      for (const el of this.root.querySelectorAll('[data-i18n-placeholder]')) {
        const v = Vern.t(el.dataset.i18nPlaceholder, el.getAttribute('placeholder') || el.dataset.placeholder);
        if (el.tagName === 'INPUT') el.placeholder = v;
        else el.dataset.placeholder = v;
      }
    }

    showTab(name) {
      for (const t of this.root.querySelectorAll('[data-tab]')) t.setAttribute('aria-selected', String(t.dataset.tab === name));
      for (const p of this.root.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== name;
      if (name === 'ask') this.askForm.q.focus();
      requestAnimationFrame(() => this.#apply(this.pos));
    }

    clearQuestion() {
      this.askForm.q.value = '';
    }

    setSources(list) {
      this.sourcesEl.replaceChildren(...(list || []).map((s) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = /^https?:\/\//.test(s.url) ? s.url : '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = s.title || s.url;
        li.append(a);
        return li;
      }));
      this.sourcesEl.hidden = !list?.length;
    }

    setPersonas(list, selectedId) {
      this.personaSelect.replaceChildren(
        new Option(Vern.t('hudAutoCharacter', 'Auto (match the topic)'), 'auto'),
        ...list.map((p) => new Option(`${p.name} · ${p.archetype}`, p.id)),
      );
      this.personaSelect.value = list.some((p) => p.id === selectedId) ? selectedId : 'auto';
    }

    /** Server-provided labels for reading levels and speaking styles. */
    setStyleCatalog(catalog) {
      // Local translations win; the server's English labels are the fallback (e.g. for new styles).
      if (catalog?.readingLevels) for (const [k, v] of Object.entries(catalog.readingLevels)) this.levelLabels[k] = Vern.t(`level${k}`, v);
      const styles = catalog?.speakingStyles || { none: "Character's own" };
      for (const k of Object.keys(styles)) styles[k] = Vern.t(`style_${k}`, styles[k]);
      const want = this.pendingAccent ?? this.styleSelect.value ?? 'none';
      this.styleSelect.replaceChildren(...Object.entries(styles).map(([k, label]) => new Option(label, k)));
      this.styleSelect.value = Object.hasOwn(styles, want) ? want : 'none';
      this.pendingAccent = undefined;
      this.#showLevel();
    }

    #showLevel() {
      this.levelName.textContent = this.levelLabels[this.levelInput.value] || '';
    }

    setActivePersona(p) {
      this.who.textContent = p ? `${p.name}` : '';
    }

    setStatus(text, tone) {
      this.statusEl.textContent = text || '';
      if (tone) this.dot.dataset.tone = tone;
    }

    setCaption(text) {
      this.caption.textContent = text;
      this.caption.scrollTop = this.caption.scrollHeight;
    }

    appendCaption(text) {
      this.setCaption(this.caption.textContent ? `${this.caption.textContent} ${text}` : text);
    }

    setPlaying(playing) {
      this.playBtn.textContent = playing ? '❚❚' : '▶';
    }

    setExportProgress(f) {
      this.progress.hidden = f === null;
      if (f !== null) this.progress.value = f;
    }

    giggle() {
      this.stage.classList.remove('giggle');
      void this.stage.offsetWidth; // restart animation
      this.stage.classList.add('giggle');
    }

    setCollapsed(c, persist) {
      this.collapsed = c;
      this.card.classList.toggle('collapsed', c);
      this.root.querySelector('[data-action="collapse"]').textContent = c ? '▸' : '▾';
      if (persist) this.onSetting('hudCollapsed', c);
      requestAnimationFrame(() => this.#apply(this.pos));
    }

    // --- Dragging -----------------------------------------------------------
    #clamp({ x, y }) {
      const r = this.host.getBoundingClientRect();
      const maxX = Math.max(0, window.innerWidth - r.width - 4);
      const maxY = Math.max(0, window.innerHeight - r.height - 4);
      return { x: Math.min(Math.max(4, x), maxX), y: Math.min(Math.max(4, y), maxY) };
    }

    #apply(pos) {
      this.pos = this.#clamp(pos);
      this.host.style.transform = `translate(${Math.round(this.pos.x)}px, ${Math.round(this.pos.y)}px)`;
    }

    #initDrag(saved) {
      const header = this.root.querySelector('header');
      requestAnimationFrame(() => {
        const r = this.host.getBoundingClientRect();
        this.#apply(saved || { x: window.innerWidth - r.width - 24, y: window.innerHeight - r.height - 24 });
      });

      let drag = null;
      header.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('button')) return;
        drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: this.pos.x, oy: this.pos.y };
        header.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      header.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        this.#apply({ x: drag.ox + e.clientX - drag.sx, y: drag.oy + e.clientY - drag.sy });
      });
      const end = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag = null;
        this.onSetting('hudPos', this.pos);
      };
      header.addEventListener('pointerup', end);
      header.addEventListener('pointercancel', end);
      window.addEventListener('resize', () => this.#apply(this.pos));
    }
  }

  Vern.Hud = Hud;
})();
