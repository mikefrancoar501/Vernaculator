/**
 * The widget's mini-assistant (double-tap the character): turns a spoken or typed request
 * like "switch to Old Oakley", "talk slower", or "who would explain this like a coach?"
 * into a settings change plus a short reply.
 *
 * Fast path: deterministic rules (free, instant, works offline).
 * Fallback: the LLM picks from the known options with structured output (Anthropic provider only).
 * Output is always validated against the real persona/style catalog before it reaches the client.
 */
import { SPEAKING_STYLES } from './styles.js';
import { scorePersonas } from './intent.js';

const SIZES = ['S', 'M', 'L'];

// Plain-word cues for "explain it like a ..." requests, mapped onto persona archetype words.
const ROLE_HINTS = {
  coach: 'sports', announcer: 'sports', athlete: 'sports',
  grandma: 'family', grandmother: 'family', granny: 'family',
  scientist: 'science', teacher: 'learn', kid: 'science',
  engineer: 'technical', mechanic: 'fix', programmer: 'code',
  banker: 'money', accountant: 'budget',
  philosopher: 'meaning', guide: 'guide', spirit: 'spirit', wise: 'explain', mentor: 'explain',
};

function findPersonaByName(text, personas) {
  const t = text.toLowerCase();
  // Longest names first so "Old Oakley" wins over a partial match.
  const sorted = [...personas.list].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    const full = p.name.toLowerCase();
    const parts = full.split(/\s+/).filter((w) => w.length > 3 && !['the', 'play', 'captain', 'professor', 'granny', 'old', 'big', 'sir'].includes(w));
    if (t.includes(full) || parts.some((w) => new RegExp(`\\b${w}\\b`).test(t))) return p;
  }
  return null;
}

export function ruleAssistant(text, personas, current = {}) {
  const t = text.toLowerCase();
  const action = {};
  const notes = [];

  const named = findPersonaByName(t, personas);
  if (named) {
    action.personaId = named.id;
    notes.push(`Switching to ${named.name}.`);
  } else {
    const role = /\blike (?:a|an|my)\s+([a-z]+)/.exec(t)?.[1] || /\b(coach|scientist|grandma|granny|grandmother|teacher|engineer|banker|philosopher|announcer|mentor|guide)\b/.exec(t)?.[1];
    if (role) {
      const cue = ROLE_HINTS[role] || role;
      const [best] = scorePersonas(cue, personas.list).filter((r) => r.score > 0);
      const byArchetype = personas.list.find((p) => p.archetype.toLowerCase().includes(role));
      const pick = byArchetype || (best && personas.get(best.id));
      if (pick) {
        action.personaId = pick.id;
        notes.push(`${pick.name}, the ${pick.archetype}, would explain it like a ${role}.`);
      }
    }
  }

  if (/\b(slow(er)?|patient)\b/.test(t)) action.accent = 'slow';
  else if (/\b(british|english accent)\b/.test(t)) action.accent = 'british';
  else if (/\bpirate\b/.test(t)) action.accent = 'pirate';
  else if (/\b(story ?teller|campfire)\b/.test(t)) action.accent = 'storyteller';
  else if (/\b(genius|rapid|fast(er)?|quick(er)?|speed (it )?up|phd)\b/.test(t)) action.accent = 'rapid';
  else if (/\b(hype|excit|energy)\w*/.test(t)) action.accent = 'hype';
  else if (/\bnormal (voice|style)\b/.test(t)) action.accent = 'none';
  if (action.accent) notes.push(`Speaking style: ${SPEAKING_STYLES[action.accent].label}.`);

  const level = current.readingLevel ?? 2;
  if (/\b(simpler|easier|dumb(ed)? it down|too (hard|complicated)|plain(er)?)\b/.test(t)) action.readingLevel = Math.max(1, level - 1);
  else if (/\b(more detail|smarter|technical|advanced|expert)\b/.test(t)) action.readingLevel = Math.min(5, level + 1);
  if (action.readingLevel) notes.push(`Reading level ${action.readingLevel} of 5.`);

  if (/\b(no|stop|without|less) (jokes|humor|funny)\b/.test(t)) action.humor = false;
  else if (/\b(funny|funnier|humor|jokes?|make me laugh)\b/.test(t)) action.humor = true;
  if (/\bno philosophy\b/.test(t)) action.philosophy = false;
  else if (/\b(philosoph|deep(er)? meaning|wisdom)\w*/.test(t)) action.philosophy = true;
  if (/\bparaphrase\b/.test(t)) action.paraphrase = !/\b(stop|don'?t|no)\b.*paraphras/.test(t);
  if ('humor' in action) notes.push(action.humor ? 'Humor on.' : 'Humor off.');
  if ('philosophy' in action) notes.push(action.philosophy ? 'Philosophy on.' : 'Philosophy off.');
  if ('paraphrase' in action) notes.push(action.paraphrase ? 'I\'ll paraphrase from now on.' : 'Paraphrase off.');

  if (/\b(bigger|larger|large|grow)\b/.test(t)) action.size = current.size === 'S' ? 'M' : 'L';
  else if (/\b(smaller|small|tiny|shrink|compact)\b/.test(t)) action.size = current.size === 'L' ? 'M' : 'S';
  if (/\b(mute|quiet|silence)\b/.test(t)) action.muted = true;
  else if (/\bunmute\b/.test(t)) action.muted = false;

  return { action, reply: notes.join(' ') };
}

/** Validates an action against the real catalogs; anything unknown is dropped. */
export function sanitizeAction(a = {}, personas) {
  const out = {};
  if (typeof a.personaId === 'string' && personas.get(a.personaId)) out.personaId = a.personaId;
  if (typeof a.accent === 'string' && Object.hasOwn(SPEAKING_STYLES, a.accent)) out.accent = a.accent;
  if (Number.isInteger(a.readingLevel) && a.readingLevel >= 1 && a.readingLevel <= 5) out.readingLevel = a.readingLevel;
  for (const k of ['humor', 'philosophy', 'paraphrase', 'muted']) if (typeof a[k] === 'boolean') out[k] = a[k];
  if (SIZES.includes(a.size)) out.size = a.size;
  return out;
}

export async function runAssistant(text, { personas, llm, current }) {
  const clean = String(text || '').slice(0, 500);
  const ruled = ruleAssistant(clean, personas, current);
  if (Object.keys(ruled.action).length || !llm?.assistant) {
    return { action: sanitizeAction(ruled.action, personas), reply: ruled.reply || "I didn't catch a change there. Try \"switch to Old Oakley\" or \"talk slower\".", method: 'rules' };
  }
  try {
    const res = await llm.assistant(clean, { personas: personas.list, styles: Object.keys(SPEAKING_STYLES) });
    return { action: sanitizeAction(res.action, personas), reply: String(res.reply || '').slice(0, 300), method: 'llm' };
  } catch (err) {
    return { action: {}, reply: "Sorry, I couldn't work that out. Try \"switch to Big Sal\".", method: 'error' };
  }
}
