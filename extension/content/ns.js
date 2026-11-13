// Shared namespace for the content-script modules (loaded in order by manifest.json).
(() => {
  if (window.Vern) return;
  const DEFAULTS = {
    backendUrl: 'http://localhost:8787',
    token: '',
    personaId: 'auto',
    readingLevel: 'auto',
    autoRead: true,
    hudVisible: true,
    hudCollapsed: false,
    hudPos: null,
  };

  const listeners = new Set();
  const settings = {
    values: { ...DEFAULTS },
    async load() {
      const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
      for (const [k, v] of Object.entries(stored)) if (v !== undefined) this.values[k] = v;
      return this.values;
    },
    async save(patch) {
      Object.assign(this.values, patch);
      await chrome.storage.local.set(patch);
    },
    onChange(cb) {
      listeners.add(cb);
    },
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const patch = {};
    for (const [k, { newValue }] of Object.entries(changes)) {
      if (k in DEFAULTS) {
        settings.values[k] = newValue;
        patch[k] = newValue;
      }
    }
    if (Object.keys(patch).length) listeners.forEach((cb) => cb(patch));
  });

  const log = (...a) => console.debug('[Vernaculator]', ...a);
  const assetUrl = (p) => chrome.runtime.getURL(p);

  window.Vern = { DEFAULTS, settings, log, assetUrl };
})();
