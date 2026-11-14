// Character picker: a category dropdown and a search box in front of the Character <select>
// (data-setting="personaId", the one character setting), plus a Preview button.
// It only filters and re-labels that select's options and fires its normal "change" event,
// so whatever owns the personaId setting keeps working unchanged.
(() => {
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9']+/g, ' ').trim();
  const slug = (s) => norm(s).replace(/'/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const accentLabel = (p) => (p?.accent ? Vern.t(`accent_${slug(p.accent)}`, p.accent) : '');
  /** "Delta Dale (Southern)" for voice-library characters, the plain name for the original cast. */
  const personaLabel = (p) => {
    const name = Vern.personaName(p);
    const accent = accentLabel(p);
    return accent ? `${name} (${accent})` : name;
  };
  const catLabel = (c) => Vern.t(`cat_${c.id}`, c.label || c.id);
  const groupLabel = (id, fallback) => Vern.t(`catgroup_${id}`, fallback || id);

  /** Locale search synonyms, e.g. Spanish "pirata=pirate;abuela=grandma". */
  function synonyms() {
    const out = {};
    for (const pair of Vern.t('pickerSynonyms', '').split(';')) {
      const [from, to] = pair.split('=').map(norm);
      if (from && to) out[from] = to;
    }
    return out;
  }

  function haystack(p, catalog) {
    const cat = (catalog.categories || []).find((c) => c.id === p.category);
    return ` ${norm([
      p.id.replace(/_/g, ' '), p.name, Vern.personaName(p), p.accent, accentLabel(p), p.archetype,
      cat ? `${cat.label} ${catLabel(cat)}` : '', ...(p.tags || []),
    ].join(' '))} `;
  }

  /**
   * Characters matching a category ('all', a category id, or 'group:<id>') and a free-text query.
   * Every word must match the start of a word in the name, accent, archetype, category or tags.
   */
  function filterPersonas(list, { category = 'all', query = '', catalog = {} } = {}) {
    const groupOf = Object.fromEntries((catalog.categories || []).map((c) => [c.id, c.group || '']));
    const syn = synonyms();
    const words = norm(query).split(' ').filter(Boolean);
    return list.filter((p) => {
      if (category.startsWith('group:')) {
        if (groupOf[p.category] !== category.slice(6)) return false;
      } else if (category !== 'all' && p.category !== category) return false;
      if (!words.length) return true;
      const hay = haystack(p, catalog);
      return words.every((w) => hay.includes(` ${w}`) || (syn[w] && hay.includes(` ${syn[w]}`)));
    });
  }

  const CSS = `
    .picker { display: grid; gap: 6px; font-size: 12px; }
    .picker-row { display: flex; gap: 6px; align-items: center; }
    .picker-row select { flex: 1; min-width: 0; font-size: 12px; }
    .picker input[type="search"] { width: 100%; box-sizing: border-box; font: inherit; color: var(--fg); background: var(--chip); border: 1px solid var(--line);
      border-radius: 10px; padding: 6px 8px; user-select: text; -webkit-user-select: text; }
    .picker-row .preview { flex: 0 0 auto; font-size: 12px; min-height: 30px; padding: 4px 10px; white-space: nowrap; }
    .picker-row .preview[aria-pressed="true"] { background: var(--accent); color: #fff; border-color: transparent; }
    .picker-hits { display: flex; flex-wrap: wrap; gap: 4px; max-height: 124px; overflow: auto; }
    .picker-hits button { font-size: 11.5px; padding: 3px 8px; min-height: 26px; border-radius: 999px; }
    .picker-hits button[aria-pressed="true"] { border-color: var(--accent); font-weight: 600; }
    .picker-note { font-size: 11px; color: var(--muted); }
    .picker-note:empty { display: none; }
  `;

  class CharacterPicker {
    /** @param {HTMLSelectElement} select the data-setting="personaId" select */
    constructor(select) {
      this.select = select;
      this.list = [];
      this.catalog = { categories: [], categoryGroups: {} };
      this.category = 'all';
      this.query = '';
      this.auto = false;
      this.audio = null;
      this.objectUrl = null;
      const root = select.getRootNode();
      if (!root.querySelector?.('style[data-picker]')) {
        const style = document.createElement('style');
        style.dataset.picker = '';
        style.textContent = CSS;
        (root.head || root).appendChild(style);
      }
      this.el = document.createElement('div');
      this.el.className = 'picker';
      this.el.innerHTML = `
        <div class="picker-row">
          <select class="picker-cat"></select>
          <button type="button" class="preview" aria-pressed="false"></button>
        </div>
        <input type="search" class="picker-search" maxlength="60" autocomplete="off" spellcheck="false">
        <div class="picker-hits" role="listbox" hidden></div>
        <div class="picker-note" aria-live="polite"></div>`;
      const anchor = select.closest('label') || select;
      anchor.after(this.el);
      this.catSelect = this.el.querySelector('.picker-cat');
      this.search = this.el.querySelector('.picker-search');
      this.previewBtn = this.el.querySelector('.preview');
      this.hits = this.el.querySelector('.picker-hits');
      this.note = this.el.querySelector('.picker-note');
      this.catSelect.setAttribute('aria-label', Vern.t('pickerCategory', 'Category'));
      this.search.placeholder = Vern.t('pickerSearch', 'Search: Southern, British, pirate...');
      this.search.setAttribute('aria-label', Vern.t('pickerSearchLabel', 'Search characters'));
      this.#setPreviewButton(false);

      // The picker's own controls never count as settings changes or host-page shortcuts.
      for (const ev of ['keydown', 'keyup', 'keypress']) this.search.addEventListener(ev, (e) => e.stopPropagation());
      this.catSelect.addEventListener('change', (e) => {
        e.stopPropagation();
        this.category = this.catSelect.value;
        this.render();
      });
      this.search.addEventListener('change', (e) => e.stopPropagation());
      this.search.addEventListener('input', () => {
        this.query = this.search.value;
        this.render();
      });
      this.search.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.search.value) {
          this.search.value = '';
          this.query = '';
          this.render();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const [first] = this.matches();
          if (first) this.pick(first.id);
        }
      });
      this.hits.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pick]');
        if (b) this.pick(b.dataset.pick);
      });
      // Keep our idea of the current character in step with picks made in the dropdown itself.
      select.addEventListener('change', () => { this.selected = select.value; });
      this.previewBtn.addEventListener('click', () => (this.audio ? this.stopPreview() : this.preview(this.select.value)));
    }

    /** New character list (from /v1/personas) and the saved personaId. */
    setList(list, selectedId, { auto = false, catalog } = {}) {
      this.list = Array.isArray(list) ? list : [];
      this.auto = auto;
      if (catalog) this.catalog = { categories: catalog.categories || [], categoryGroups: catalog.categoryGroups || {} };
      this.selected = selectedId;
      this.#renderCategories();
      this.render();
    }

    /** Show a personaId chosen elsewhere (assistant, long-press menu) even if it's filtered out. */
    choose(id) {
      if (!id) return;
      this.selected = id;
      if (id !== this.select.value) this.render();
    }

    matches() {
      return filterPersonas(this.list, { category: this.category, query: this.query, catalog: this.catalog });
    }

    pick(id) {
      if (!this.list.some((p) => p.id === id)) return;
      this.selected = id;
      this.render();
      this.select.value = id;
      // Same path as choosing in the dropdown: the widget saves personaId from this event.
      this.select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    #renderCategories() {
      const present = new Set(this.list.map((p) => p.category).filter(Boolean));
      const cats = (this.catalog.categories || []).filter((c) => present.has(c.id));
      const opts = [new Option(Vern.t('pickerAll', 'All characters'), 'all')];
      const groups = new Map();
      for (const c of cats) {
        if (!c.group) {
          opts.push(new Option(catLabel(c), c.id));
          continue;
        }
        if (!groups.has(c.group)) {
          const og = document.createElement('optgroup');
          og.label = groupLabel(c.group, this.catalog.categoryGroups?.[c.group]);
          og.append(new Option(Vern.t('pickerAllIn', 'All $1', [og.label.toLowerCase()]), `group:${c.group}`));
          groups.set(c.group, og);
          opts.push(og);
        }
        groups.get(c.group).append(new Option(catLabel(c), c.id));
      }
      this.catSelect.replaceChildren(...opts);
      const valid = this.category === 'all' || [...this.catSelect.querySelectorAll('option')].some((o) => o.value === this.category);
      if (!valid) this.category = 'all';
      this.catSelect.value = this.category;
      this.el.hidden = !this.list.length;
      this.catSelect.hidden = cats.length < 2;
    }

    /** Rebuild the Character select's options for the current category + search. */
    render() {
      const want = this.selected ?? this.select.value;
      const shown = this.matches();
      const opts = [];
      if (this.auto) opts.push(new Option(Vern.t('hudAutoCharacter', 'Auto (match the topic)'), 'auto'));
      const current = this.list.find((p) => p.id === want);
      if (current && !shown.includes(current)) {
        const og = document.createElement('optgroup');
        og.label = Vern.t('pickerCurrent', 'Current');
        og.append(this.#option(current));
        opts.push(og);
      }
      const order = (this.catalog.categories || []).map((c) => c.id);
      const byCat = new Map();
      for (const p of shown) {
        const key = order.includes(p.category) ? p.category : '';
        if (!byCat.has(key)) byCat.set(key, []);
        byCat.get(key).push(p);
      }
      const keys = [...order.filter((k) => byCat.has(k)), ...(byCat.has('') ? [''] : [])];
      if (keys.length === 1 && keys[0] === '') {
        opts.push(...byCat.get('').map((p) => this.#option(p)));
      } else {
        for (const k of keys) {
          const og = document.createElement('optgroup');
          const cat = this.catalog.categories.find((c) => c.id === k);
          og.label = cat ? catLabel(cat) : Vern.t('pickerOther', 'Other');
          og.append(...byCat.get(k).map((p) => this.#option(p)));
          opts.push(og);
        }
      }
      this.select.replaceChildren(...opts);
      const values = [...this.select.querySelectorAll('option')].map((o) => o.value);
      this.select.value = values.includes(want) ? want : this.auto ? 'auto' : values[0] || '';
      this.#renderHits(shown);
    }

    #option(p) {
      // The original cast keeps "Name · Archetype"; library voices read "Name (Accent)".
      return new Option(p.accent ? personaLabel(p) : `${Vern.personaName(p)} · ${p.archetype}`, p.id);
    }

    #renderHits(shown) {
      const searching = !!norm(this.query);
      const narrowed = searching || this.category !== 'all';
      const MAX = 12;
      this.hits.hidden = !searching || !shown.length;
      if (searching) {
        this.hits.replaceChildren(...shown.slice(0, MAX).map((p) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.dataset.pick = p.id;
          b.textContent = personaLabel(p);
          b.title = p.archetype || '';
          b.setAttribute('aria-pressed', String(p.id === this.select.value));
          return b;
        }));
      }
      if (!narrowed) this.note.textContent = '';
      else if (!shown.length) this.note.textContent = Vern.t('pickerNoMatch', 'No characters match. Try "Southern", "British" or "pirate".');
      else if (searching && shown.length > MAX) this.note.textContent = Vern.t('pickerMore', '$1 matches: the first $2 are above, all of them are in the list.', [String(shown.length), String(MAX)]);
      else if (searching) this.note.textContent = Vern.t('pickerTapToPick', 'Tap a name to pick it (or press Enter for the first).');
      else this.note.textContent = Vern.t('pickerCount', '$1 characters in this category.', [String(shown.length)]);
    }

    #setPreviewButton(playing) {
      this.previewBtn.textContent = playing ? Vern.t('pickerStop', '■ Stop') : Vern.t('pickerPreview', '▶ Preview');
      this.previewBtn.title = Vern.t('pickerPreviewTitle', 'Hear a short sample of this voice');
      this.previewBtn.setAttribute('aria-pressed', String(playing));
    }

    stopPreview() {
      try { this.audio?.pause(); } catch { /* gone */ }
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.audio = null;
      this.objectUrl = null;
      this.#setPreviewButton(false);
    }

    async preview(id) {
      const p = this.list.find((x) => x.id === id);
      if (!p) {
        this.note.textContent = Vern.t('pickerPreviewPick', 'Pick a character first, then press Preview.');
        return;
      }
      this.stopPreview();
      const { backendUrl, token } = Vern.settings.values;
      this.previewBtn.disabled = true;
      this.note.textContent = Vern.t('pickerPreviewLoading', 'Loading a sample of $1...', [personaLabel(p)]);
      try {
        const res = await chrome.runtime.sendMessage({
          op: 'fetchAudio',
          url: `${String(backendUrl).replace(/\/+$/, '')}/v1/personas/${encodeURIComponent(p.id)}/preview`,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res?.ok) throw Object.assign(new Error(res?.error || 'failed'), { status: res?.status });
        const bin = atob(res.b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        this.objectUrl = URL.createObjectURL(new Blob([bytes], { type: res.type || 'audio/mpeg' }));
        const audio = new Audio(this.objectUrl);
        this.audio = audio;
        audio.addEventListener('ended', () => this.audio === audio && this.stopPreview());
        audio.addEventListener('error', () => this.audio === audio && this.stopPreview());
        await audio.play();
        this.#setPreviewButton(true);
        this.note.textContent = res.source === 'sample'
          ? Vern.t('pickerPreviewSample', 'Sample of $1 from Fish Audio.', [personaLabel(p)])
          : Vern.t('pickerPreviewSpoken', '$1, saying hello.', [personaLabel(p)]);
      } catch (err) {
        this.stopPreview();
        const key = { 401: 'pickerPreviewToken', 402: 'pickerPreviewQuota', 409: 'pickerPreviewTestMode', 429: 'pickerPreviewBusy' }[err.status];
        const fallback = {
          pickerPreviewToken: 'Add your token in the options to hear previews.',
          pickerPreviewQuota: 'Your monthly voice allowance is used up.',
          pickerPreviewTestMode: "This character's preview needs the real voices: the server is in test mode (keys not loaded).",
          pickerPreviewBusy: 'Lots of previews! Wait a few seconds and try again.',
        };
        this.note.textContent = key
          ? Vern.t(key, fallback[key])
          : Vern.t('pickerPreviewError', "Couldn't load a preview. Is the Fancy Bot server running?");
      } finally {
        this.previewBtn.disabled = false;
      }
    }
  }

  /**
   * Short cast list for the writers' room, town and crib-voice pickers: the original cast
   * (Big Sal's World + Comics), plus the chosen character and anyone already cast.
   */
  function castRoster(list, selectedId) {
    const v = Vern.settings?.values || {};
    const keep = new Set([selectedId, v.personaId, v.sceneDirector, v.cribPersonaId, ...(v.sceneCast || []), ...(v.townMembers || [])].filter(Boolean));
    return (list || []).filter((p) => !p.category || p.category === 'bigsal' || p.category === 'comics' || keep.has(p.id));
  }

  Vern.CharacterPicker = CharacterPicker;
  Vern.castRoster = castRoster;
  Vern.filterPersonas = filterPersonas;
  Vern.personaLabel = personaLabel;
})();
