/**
 * User-chosen delivery controls that stack on top of ANY character:
 *   - reading level 1-5 (plain language <-> expert), never framed as intelligence
 *   - humor / philosophy add-ons
 *   - speaking style (word choice + pacing), deliberately not tied to race or region
 */

export const READING_LEVELS = {
  1: {
    label: 'Super simple',
    prompt: [
      'READING LEVEL 1 of 5 (super simple, plain language):',
      '- Explain it like a patient friend talking to someone hearing about this for the very first time.',
      '- Very short sentences. One idea per sentence. Everyday words only.',
      '- Replace every technical or medical term with plain words. If a term must stay (for example a medicine name), say it once and immediately explain it in plain words.',
      '- Use one simple, familiar comparison for the hardest idea.',
      '- End with a one-sentence "bottom line".',
    ].join('\n'),
  },
  2: {
    label: 'Plain',
    prompt: [
      'READING LEVEL 2 of 5 (plain language):',
      '- Short sentences and common words. Define any jargon in plain words the first time it appears.',
      '- Lead with what matters most to the listener, then the details.',
      '- Use a familiar comparison when an idea is abstract.',
    ].join('\n'),
  },
  3: { label: 'Everyday', prompt: 'READING LEVEL 3 of 5 (everyday): natural conversational vocabulary; briefly explain uncommon terms.' },
  4: { label: 'Detailed', prompt: 'READING LEVEL 4 of 5 (detailed): precise vocabulary and fuller explanations; technical terms are fine when they help.' },
  5: { label: 'Expert', prompt: 'READING LEVEL 5 of 5 (expert): rich, exact vocabulary and nuance; keep it easy to follow when spoken aloud.' },
};

// Kept for older clients that sent named levels.
const NAMED = { kid: 1, preteen: 2, teen: 3, adult: 4, scholar: 5 };

export function parseReadingLevel(v) {
  if (v == null || v === '' || v === 'auto') return null;
  const n = typeof v === 'number' ? v : NAMED[v] ?? Number.parseInt(v, 10);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

/** Simplifying must never change the facts, especially for health, legal or money topics. */
export const FIDELITY_RULE = [
  'ACCURACY RULES (always, at every reading level):',
  '- Keep every number, dose, amount, date, time, step, warning, and safety instruction exactly as in the source. Simplify the words, never the facts.',
  '- If the source tells the listener to see a doctor, call emergency services, or get professional help, keep that advice and keep it prominent.',
  '- Never add medical, legal, or financial advice that is not in the source.',
].join('\n');

export const ADDONS = {
  humor: {
    label: 'Humor',
    prompt: 'HUMOR: Weave in light, wholesome humor: playful comparisons and a gentle joke or two. Never joke about anyone\'s pain, illness, or identity, and never let a joke blur a fact or warning.',
  },
  philosophy: {
    label: 'Philosophy',
    prompt: 'PHILOSOPHY: Add one brief, thoughtful reflection that connects the topic to a bigger life lesson, without lecturing.',
  },
};

export const SPEAKING_STYLES = {
  none: { label: 'Character\'s own', prompt: '', speed: 1 },
  slow: {
    label: 'Slow & patient',
    prompt: 'SPEAKING STYLE: Slow and patient. Unhurried, warm pacing; pause between ideas (use short sentences and commas); gently repeat the key point once at the end.',
    speed: 0.85,
  },
  british: {
    label: 'British English',
    prompt: 'SPEAKING STYLE: Polite, cheerful British English word choice and phrasing (for example "brilliant", "rather", "have a go"), without caricature.',
    speed: 1,
  },
  storyteller: {
    label: 'Old-time storyteller',
    prompt: 'SPEAKING STYLE: An old-time radio storyteller: vivid, folksy narration with a little suspense, as if telling the story around a campfire.',
    speed: 0.95,
  },
  hype: {
    label: 'Hype announcer',
    prompt: 'SPEAKING STYLE: High-energy announcer: punchy short lines, big enthusiasm, exclamation where it fits.',
    speed: 1.1,
  },
  pirate: {
    label: 'Friendly pirate',
    prompt: 'SPEAKING STYLE: A friendly, family-film pirate: "ahoy", "matey", nautical comparisons. Keep facts crystal clear.',
    speed: 1,
  },
};

/** Normalizes untrusted client input into a known-good style object. */
export function parseStyle(input = {}) {
  return {
    humor: input.humor === true,
    philosophy: input.philosophy === true,
    accent: Object.hasOwn(SPEAKING_STYLES, input.accent) ? input.accent : 'none',
  };
}

export function stylePrompt(style) {
  return [
    style.humor ? ADDONS.humor.prompt : '',
    style.philosophy ? ADDONS.philosophy.prompt : '',
    SPEAKING_STYLES[style.accent]?.prompt || '',
  ].filter(Boolean).join('\n');
}

/** Public catalog for the extension's controls. */
export function styleCatalog() {
  return {
    readingLevels: Object.fromEntries(Object.entries(READING_LEVELS).map(([k, v]) => [k, v.label])),
    addons: Object.fromEntries(Object.entries(ADDONS).map(([k, v]) => [k, v.label])),
    speakingStyles: Object.fromEntries(Object.entries(SPEAKING_STYLES).map(([k, v]) => [k, v.label])),
  };
}
