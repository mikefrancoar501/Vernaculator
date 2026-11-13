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
    hudSize: 'S', // compact by default; long-press the character for M / L / custom
    hudScale: 1,
    muted: false,
    replaceCompanion: true, // on grok.com, sit in place of Grok's own companion avatar
    townEnabled: false,
    townMembers: ['big_sal', 'old_oakley', 'big_play_ray', 'elias_stillwater'], // the core four
    cribPersonaId: 'big_play_ray', // comedic voice for social crib notes and replies ('' = main character)
    socialPill: true,
    sceneCast: ['big_sal', 'old_oakley', 'big_play_ray', 'elias_stillwater'], // writers' room, 2-4 (the core four)
    sceneDirector: 'big_sal',
    whatsHot: false,
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
  const t = (key, fallback = '', subs) => {
    try {
      return chrome.i18n.getMessage(key, subs) || fallback;
    } catch {
      return fallback;
    }
  };
  // Locale display name when we have one (Comic Reggie, ...); otherwise the server's name.
  const personaName = (p) => (p && p.id ? t(`persona_${p.id}`, p.name || '') : '');
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

  window.Vern = { DEFAULTS, settings, log, assetUrl, t, personaName, profile, browserLanguage };
})();
