// Shared namespace for the content-script modules (loaded in order by manifest.json).
(() => {
  if (window.Vern) return;
  const DEFAULTS = {
    backendUrl: 'http://localhost:8787',
    token: '',
    personaId: 'big_sal',
    readingLevel: 2, // 1 = super simple ... 5 = expert; plain language by default
    paraphrase: false,
    // About-you profile (stays in this browser; sent with each request so characters can personalize)
    userName: '',
    aboutMe: '',
    ageGroup: '',
    language: 'auto', // 'auto' = browser language
    humor: false,
    philosophy: false,
    accent: 'none',
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
      // Migrate the old named reading levels to the 1-5 slider.
      const named = { kid: 1, preteen: 2, teen: 3, adult: 4, scholar: 5 };
      if (typeof this.values.readingLevel !== 'number') this.values.readingLevel = named[this.values.readingLevel] ?? DEFAULTS.readingLevel;
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
  const t = (key, fallback = '') => {
    try {
      return chrome.i18n.getMessage(key) || fallback;
    } catch {
      return fallback;
    }
  };
  const browserLanguage = () => {
    try {
      return chrome.i18n.getUILanguage() || navigator.language || 'en';
    } catch {
      return navigator.language || 'en';
    }
  };
  /** The listener profile sent to the middleware. Language defaults to the browser's. */
  const profile = () => {
    const v = settings.values;
    return { name: v.userName, about: v.aboutMe, ageGroup: v.ageGroup, language: v.language && v.language !== 'auto' ? v.language : browserLanguage() };
  };
  const assetUrl = (p) => chrome.runtime.getURL(p);

  window.Vern = { DEFAULTS, settings, log, assetUrl, t, profile, browserLanguage };
})();
