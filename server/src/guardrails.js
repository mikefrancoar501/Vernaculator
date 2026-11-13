/**
 * Family-friendly guardrails (spec 3.2). Two layers:
 *  1. The persona system prompt forbids profanity and anchors on the core values.
 *  2. This deterministic post-filter runs on every sentence before it reaches TTS,
 *     so nothing slips through even if the LLM misbehaves or the mock provider is used.
 *
 * The word list is intentionally small and obvious; extend BLOCKLIST for production
 * or plug in a moderation service in `sanitize`.
 */

// Stored lightly obfuscated (reversed) so the source stays family-friendly too.
const RAW = ['kcuf', 'tihs', 'hctib', 'ssa', 'nmad', 'lleh', 'drassab', 'parc', 'tuls', 'erohw', 'ssahkcaj', 'ssadab'];
const BLOCKLIST = RAW.map((w) => w.split('').reverse().join(''));

const REPLACEMENTS = {
  [BLOCKLIST[0]]: 'fudge',
  [BLOCKLIST[1]]: 'shoot',
  [BLOCKLIST[4]]: 'darn',
  [BLOCKLIST[5]]: 'heck',
  [BLOCKLIST[7]]: 'crumbs',
};

// Match whole words plus common suffixes (-s, -ed, -ing, -er, -y), case-insensitive.
const PATTERN = new RegExp(`\\b(${BLOCKLIST.map(escape).join('|')})(s|es|ed|ing|er|ers|y|ty)?\\b`, 'gi');

// The strongest words are also caught inside compounds (e.g. "bull...").
const COMPOUND = new RegExp(`\\b\\w*(${BLOCKLIST.slice(0, 2).join('|')})\\w*\\b`, 'gi');

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchCase(src, repl) {
  if (src === src.toUpperCase()) return repl.toUpperCase();
  if (src[0] === src[0].toUpperCase()) return repl[0].toUpperCase() + repl.slice(1);
  return repl;
}

/** Returns { clean, flagged } where clean has profanity swapped for wholesome words. */
export function sanitize(text) {
  let flagged = false;
  const clean = text.replace(PATTERN, (whole, root) => {
    flagged = true;
    const repl = REPLACEMENTS[root.toLowerCase()] || 'goodness';
    return matchCase(whole, repl);
  }).replace(COMPOUND, (whole) => {
    flagged = true;
    return matchCase(whole, 'fiddlesticks');
  });
  return { clean, flagged };
}

export function containsProfanity(text) {
  return sanitize(text).flagged;
}

export function guardrailPrompt(coreValues) {
  return [
    'NON-NEGOTIABLE CONTENT RULES:',
    '- Use zero profanity, slurs, crude humor, or innuendo, even if the source text contains them. Replace them with wholesome, witty alternatives.',
    '- Keep the tone positive, kind, and witty. Never mock or demean anyone.',
    `- Embody these core values: ${coreValues.join(', ')}.`,
    '- Preserve the factual meaning of the source. Do not add new facts, advice, links, or claims.',
    '- If the source contains something unsafe for a family audience, summarize it gently instead of repeating it.',
  ].join('\n');
}
