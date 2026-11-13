import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const SHARED = path.resolve(ROOT, '..', 'shared');

const env = process.env;
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const int = (v, d) => (Number.isFinite(Number.parseInt(v, 10)) ? Number.parseInt(v, 10) : d);

export function loadConfig(overrides = {}) {
  const cfg = {
    port: int(env.PORT, 8787),
    allowedOrigins: list(env.ALLOWED_ORIGINS || 'https://claude.ai,https://grok.com,https://gemini.google.com'),
    extensionId: env.EXTENSION_ID || '',
    dataFile: path.resolve(ROOT, env.DATA_FILE || './data/store.json'),
    personasFile: path.resolve(SHARED, 'personas.json'),
    coreValuesFile: path.resolve(SHARED, 'core-values.json'),
    quotas: {
      free: int(env.QUOTA_FREE, 20000),
      pro: int(env.QUOTA_PRO, 500000),
    },
    llm: {
      provider: env.LLM_PROVIDER || 'mock',
      apiKey: env.ANTHROPIC_API_KEY || '',
      model: env.LLM_MODEL || 'claude-opus-5-5',
      effort: env.LLM_EFFORT || 'low',
    },
    intentMode: env.INTENT_MODE || 'keywords',
    // Per-user limits on social generations (crib notes, replies, writers' room scenes).
    socialRate: { perMinute: int(env.SOCIAL_RATE_PER_MIN, 6), perDay: int(env.SOCIAL_RATE_PER_DAY, 120) },
    tts: {
      provider: env.TTS_PROVIDER || 'mock',
      apiKey: env.FISH_API_KEY || '',
      wsUrl: env.FISH_WS_URL || 'wss://api.fish.audio/v1/tts/live',
      model: env.FISH_MODEL || 's2.1-pro',
      latency: env.FISH_LATENCY || 'balanced',
      defaultVoiceId: env.FISH_DEFAULT_VOICE_ID || '',
    },
    ...overrides,
  };
  return cfg;
}

/**
 * Resolve the Fish voice for a persona:
 * language-specific env override (FISH_VOICE_BIG_SAL_ES) > persona's fishAudioVoicesByLanguage.es
 * > env override (FISH_VOICE_BIG_SAL) > real id in personas.json > default.
 */
export function resolveVoiceId(cfg, persona, language = '') {
  const base = `FISH_VOICE_${persona.id.toUpperCase()}`;
  const lang = (language || '').split('-')[0].toLowerCase();
  if (lang && env[`${base}_${lang.toUpperCase()}`]) return env[`${base}_${lang.toUpperCase()}`];
  const byLang = lang && persona.fishAudioVoicesByLanguage?.[lang];
  if (byLang && !/placeholder/i.test(byLang)) return byLang;
  if (env[base]) return env[base];
  const id = persona.fishAudioReferenceId;
  if (id && !/placeholder/i.test(id)) return id;
  return cfg.tts.defaultVoiceId || null;
}
