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
    [hidden] { display: none !important; }
  `;

  const HTML = `
    <div class="card" part="card">
      <header>
        <span class="dot" data-tone="idle"></span>
        <span class="title">Vernaculator</span>
        <button class="icon" data-action="collapse" title="Collapse" aria-label="Collapse">▾</button>
      </header>
      <div class="body">
        <div class="stage" title="Tap me rapidly...">
          <img alt="Character" draggable="false">
          <span class="who"></span>
        </div>
        <div class="caption" aria-live="polite" data-placeholder="New replies will be read aloud here."></div>
        <div class="row controls">
          <button class="primary" data-action="playpause" title="Play / pause" aria-label="Play or pause">▶</button>
          <button data-action="replay" title="Replay last" aria-label="Replay">↻</button>
          <button data-action="stop" title="Stop" aria-label="Stop">■</button>
          <button data-action="readSelection" title="Read selected text (or last reply)" aria-label="Read selection">❝</button>
        </div>
        <label class="field">Character<select data-setting="personaId"></select></label>
        <div class="level">
          <div class="level-head"><span>Reading level</span><b class="level-name"></b></div>
          <input type="range" min="1" max="5" step="1" data-setting="readingLevel" aria-label="Reading level, from super simple to expert">
          <div class="level-ends"><span>Plain &amp; simple</span><span>Expert</span></div>
        </div>
        <div class="row">
          <label class="chip"><input type="checkbox" data-setting="humor"> Humor</label>
          <label class="chip"><input type="checkbox" data-setting="philosophy"> Philosophy</label>
          <label class="field style-field">Speaking style<select data-setting="accent"></select></label>
        </div>
        <div class="row">
          <label class="toggle"><input type="checkbox" data-setting="autoRead"> Auto-read replies</label>
          <span style="flex:1"></span>
          <button data-action="export" title="Export the last reply as a video">🎬 Meme</button>
        </div>
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
      this.levelLabels = { 1: 'Super simple', 2: 'Plain', 3: 'Everyday', 4: 'Detailed', 5: 'Expert' };
      this.levelInput.addEventListener('input', () => this.#showLevel());

      this.root.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        if (btn.dataset.action === 'collapse') return this.setCollapsed(!this.collapsed, true);
        this.onAction(btn.dataset.action);
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

    setPersonas(list, selectedId) {
      this.personaSelect.replaceChildren(
        new Option('Auto (match the topic)', 'auto'),
        ...list.map((p) => new Option(`${p.name} · ${p.archetype}`, p.id)),
      );
      this.personaSelect.value = list.some((p) => p.id === selectedId) ? selectedId : 'auto';
    }

    /** Server-provided labels for reading levels and speaking styles. */
    setStyleCatalog(catalog) {
      if (catalog?.readingLevels) this.levelLabels = catalog.readingLevels;
      const styles = catalog?.speakingStyles || { none: "Character's own" };
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
