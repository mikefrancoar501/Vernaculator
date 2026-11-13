/**
 * Joke-writing algorithms for the town comedians (Comic Reggie, Comic Chuy,
 * Comic Marty, Comic Winnie, Comic Priya). Adapted from the slangshot comedy
 * craft so crib notes, draft replies, and writers' room lines follow each
 * comedian's technique. Original material only; roast the situation, never a person.
 */

export const COMEDIAN_IDS = {
  reggie_riff: 'standup',
  chuy_carcajadas: 'chuy',
  marty_midstep: 'observer',
  winnie_brightwater: 'improv',
  priya_nair: 'priya',
};

const SOCIAL_TASKS = new Set(['crib', 'reply', 'scene']);

export function isComedian(persona) {
  return Boolean(persona && COMEDIAN_IDS[persona.id]);
}

const BLUEPRINTS = {
  misdirection: {
    name: 'misdirection (the garden path)',
    how: (beats, twist) => `Build the setup in ${beats} short beat${beats > 1 ? 's' : ''} that make the audience picture ONE meaning or ONE obvious ending (the expectation). Then flip it with the very last word or phrase: a second meaning of a word, a sneaky assumption, or a literal reading. ${TWIST[twist]} The surprise word goes LAST, with nothing after it but the laugh.`,
    trick: 'Lead them one way, then flip it with the last word.',
  },
  callback: {
    name: 'callback',
    how: (beats, twist, hook) => `Do the joke in ${beats} beat${beats > 1 ? 's' : ''}, then bring back ${hook ? `"${hook}" from your last bit with this person` : 'the funniest word from the setup'} in a new, surprising way at the end, so the old joke pays off again. ${TWIST[twist]}`,
    trick: 'Bring back something funny from earlier: that\'s a callback.',
  },
  ruleOfThree: {
    name: 'rule of three',
    how: (beats, twist) => `Set up ${beats > 1 ? 'a quick' : 'a one-line'} list of three. The first two are normal and set a pattern (same rhythm, same kind of thing), so the audience thinks they know the third. The third breaks the pattern: same rhythm, totally different kind of thing. ${TWIST[twist]} Keep the three items short and the third one LAST, then stop.`,
    trick: 'Two normal things, then a surprise third one: that\'s the rule of three.',
  },
  actOut: {
    name: 'act-out (a character voice or an object talking)',
    how: (beats, twist) => `Tell the setup in ${beats} short beat${beats > 1 ? 's' : ''}, then switch into a voice: let a character or an everyday OBJECT talk (the backpack, the alarm clock, the last slice of pizza, the dog) and say what it's really thinking, in its own personality, with a quick "Now the backpack goes..." style lead-in instead of any stage direction. ${TWIST[twist]} The object's last line is the punchline.`,
    trick: 'Give a thing a voice and let it tell its side: that\'s an act-out.',
  },
  reversal: {
    name: 'reversal (the roles swap)',
    how: (beats, twist) => `Set up a normal situation in ${beats} short beat${beats > 1 ? 's' : ''} where everyone knows who does what (the human walks the dog, the kid does the homework, the alarm wakes you up). Then swap the roles and play it totally straight, as if it's normal: the dog walks the human, the homework does the kid. ${TWIST[twist]} Land on the most specific detail of the swapped world.`,
    trick: 'Flip who does what, and act like it\'s totally normal: that\'s a reversal.',
  },
  exaggeration: {
    name: 'observational exaggeration',
    how: (beats, twist) => `Start with a tiny everyday slip anyone has made (the observation, true and specific). Then scale it up in three steps (the rule of three), each one more extreme but still following its own strict logic, until the third step is absurd. ${TWIST[twist]} Keep each step short; the biggest one goes last.`,
    trick: 'Take a small true thing and make it bigger three times.',
  },
};

const TWIST = {
  1: 'Twist size: small, a clever turn that makes people smile and groan.',
  2: 'Twist size: big, a real surprise nobody sees coming but that makes sense right away.',
  3: 'Twist size: absurd but logical, completely ridiculous yet it follows the rules the setup made.',
};

// Each comedian's taste: blueprint weights, setup length, twist size, and how often they add a tag.
export const STYLE = {
  standup: { weights: { exaggeration: 3, callback: 2, misdirection: 2, ruleOfThree: 3, actOut: 2, reversal: 1 }, beats: [3, 4], twist: [2, 3], tag: 0.7, note: 'Reggie repeats the funny part louder on each beat (the big nah-nah-nah build), and he never skips it.' },
  chuy: { weights: { exaggeration: 3, callback: 2, misdirection: 1, ruleOfThree: 2, actOut: 3, reversal: 1 }, beats: [4, 5], twist: [2, 3], tag: 0.5, note: 'Chuy tells it as a big, warm family story, acting out each relative with love; the family is loving, never the butt of the joke.' },
  observer: { weights: { exaggeration: 3, misdirection: 2, callback: 1, ruleOfThree: 2, actOut: 1, reversal: 2 }, beats: [2, 3], twist: [1, 2], tag: 0.6, note: 'Marty notices the small things everyone does but nobody says out loud.' },
  improv: { weights: { callback: 3, exaggeration: 2, misdirection: 1, ruleOfThree: 1, actOut: 3, reversal: 2 }, beats: [3, 3], twist: [2, 3], tag: 0.5, note: 'Winnie builds it yes-and style: each beat accepts the last one and adds something bigger.' },
  priya: { weights: { misdirection: 8, callback: 1, exaggeration: 1, ruleOfThree: 1, actOut: 0, reversal: 2 }, beats: [1, 2], twist: [1, 2], tag: 0.3, note: 'Priya keeps it short and dry: a one-liner or pun, then lets the groan land.' },
};

const DEFAULT_STYLE = { weights: { misdirection: 1, callback: 1, exaggeration: 1, ruleOfThree: 1, actOut: 1, reversal: 1 }, beats: [2, 3], twist: [1, 2], tag: 0.5, note: '' };

const TAG = 'After the punchline, add ONE tag: a short second laugh (one sentence, no new setup) that builds on the same punchline, like a little encore. If the punchline is already perfect, let it be.';

export const CRAFT = [
  'Put the funniest word LAST. Nothing after the punch word but the laugh.',
  'Be specific: not \'an animal\', but \'a raccoon in a tiny raincoat\'. Specific is funnier.',
  'Cut every word the joke doesn\'t need. Short setups, quick punches.',
  'Find the true, tiny thing first. The best jokes start with \'that\'s SO true\'.',
  'Take a phrase everyone knows and finish it a new way.',
  'Say the setup like it\'s serious. The straighter the setup, the bigger the laugh.',
  'Make yourself the one who looks silly, never someone else.',
  'Heighten: each beat a little bigger than the one before, until it pops.',
  'Leave a tiny pause before the punch: a short sentence works like a drumroll.',
  'Act it out: give the thing a voice instead of describing it.',
  'Plant something early so it can pay off later (a callback is a gift to the audience).',
  'Use words with a K or a P sound in the punch: pickle, kazoo, platypus. They just sound funnier.',
  'Pick the angle: what\'s weird about this, and who would be the most surprised by it?',
  'If you want a second laugh, tag it: one more short line on the same idea.',
];

// Hard rules and signature technique for each comedian, always included with the blueprint.
const VOICE = {
  standup: `Comic Reggie (Reggie Riff) writes clean, crowd-friendly stand-up: a quick setup, a big punchline, a callback, and his signature nah-nah-nah build (the same complaint gets louder each beat, and the last one goes sideways). He roasts the situation and himself, never a person or a group, and the crowd is always in on the joke. Original material only: never any real comedian's catchphrases or bits. Keep it PG: no swearing.`,
  chuy: `Comic Chuy (Chuy Carcajadas) writes warm family storytelling comedy: a true-feeling story that gets bigger and bigger, every relative acted out with their own voice, a Spanglish word landing right on the punchline, and a loving twist at the end. The family is always the hero; the chancla is only ever a legendary warning, never hitting anyone. Kid-safe Spanish only (no mames, qué pedo, or güey). Original material only. Keep it PG: no swearing in any language.`,
  observer: `Comic Marty (Marty Midstep) writes clean observational comedy: notice one tiny everyday thing everybody does but nobody talks about, ask why, pick it apart with precise little details, and act out both sides. Baffled, never mean; never joke at anyone's expense. Original material only (never "what's the deal with" or any real comedian's catchphrases or bits). Keep it PG: no swearing.`,
  improv: `Comic Winnie (Winnie Brightwater) writes family-friendly improv: say "yes, and" to the idea, add one surprising thing, keep making it bigger, then end on a button (one last laugh). She may narrate a tiny scene out loud, playing every character herself, and the whole thing grows from the post. Never says no to an idea, never laughs at a person, only with them. Original material only (never any real show's games, catchphrases or performers). Keep it PG: no swearing.`,
  priya: `Comic Priya (Priya Nair) writes clean kid wordplay: puns, double meanings, riddles and knock-knock jokes, delivered dry, then she lets the groan land. Short and quick: a one-liner or pun, punch word last. Kind, never mean. Original material only. Keep it PG: no swearing.`,
};

const STOP = new Set('that this with have what when your just like they them then there were from been about would could should really very into over know okay yeah right gonna wanna said says tell told make made back some more much than here because funny joke jokes laugh trick lemme hold'.split(' '));

/** A word worth calling back: the longest uncommon word in the comedian's last answer. */
export function callbackHook(last) {
  const text = Array.isArray(last) ? String(last[0] || '') : String(last || '');
  const words = (text.match(/[A-Za-z][A-Za-z'-]{3,}/g) || []).map((w) => w.replace(/'s$/, '')).filter((w) => !STOP.has(w.toLowerCase()));
  if (!words.length) return '';
  const counts = new Map();
  for (const w of words) counts.set(w.toLowerCase(), (counts.get(w.toLowerCase()) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
}

const seedOf = (t) => [...String(t)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 11);

/**
 * Picks the blueprint, beats and twist for one joke. Same text + same history = same plan
 * (so a retry with new text changes it); `turn` rotates it too.
 */
export function planJoke(id, text, last = [], turn = 0) {
  const st = STYLE[id] || DEFAULT_STYLE;
  const hook = callbackHook(last);
  const weights = { ...st.weights };
  if (!hook) weights.callback = 0;
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = Math.abs(seedOf(text) + turn * 7) % total;
  let kind = 'misdirection';
  for (const [k, w] of Object.entries(weights)) {
    if (roll < w) { kind = k; break; }
    roll -= w;
  }
  const span = (lo, hi, s) => lo + Math.abs(s) % (hi - lo + 1);
  const beats = span(st.beats[0], st.beats[1], seedOf(text) >> 3);
  const twist = span(st.twist[0], st.twist[1], seedOf(text) >> 5);
  const tag = (Math.abs((seedOf(text) >> 7) + turn * 13) % 100) / 100 < (st.tag ?? DEFAULT_STYLE.tag);
  const craft = CRAFT[Math.abs((seedOf(text) >> 9) + turn) % CRAFT.length];
  return { kind, beats, twist, hook: kind === 'callback' ? hook : '', tag, craft };
}

/** The prompt block that describes this joke's blueprint. */
export function comedyLine(id, text, last = [], turn = 0) {
  const p = planJoke(id, text, last, turn);
  const b = BLUEPRINTS[p.kind];
  const st = STYLE[id] || DEFAULT_STYLE;
  return [
    `- JOKE BLUEPRINT for this one: ${b.name}. ${b.how(p.beats, p.twist, p.hook)}${st.note ? ` ${st.note}` : ''}`,
    `- ${p.tag ? TAG : 'No tag this time: end right on the punchline.'}`,
    `- A joke-writing habit of great comedians to use here (the technique only; never name, quote or imitate any comedian): ${p.craft}`,
    '- If the post already has a joke, keep that idea and punchline and use this blueprint only to tighten it.',
    `- For a teachable moment, the blueprint in kid words is: "${b.trick}"`,
  ].join('\n');
}

/**
 * Extra system-prompt section for a comedian's crib notes, draft replies, or writers' room lines.
 * Empty for non-comedians, or when the task is not a social joke job.
 */
export function comedyPrompt(persona, { text = '', last = [], turn = 0, task } = {}) {
  const id = persona && COMEDIAN_IDS[persona.id];
  if (!id) return '';
  if (task && !SOCIAL_TASKS.has(task)) return '';
  return [
    'COMEDY ALGORITHM (follow this joke-writing plan for crib notes, draft replies, and writers\' room lines):',
    VOICE[id],
    comedyLine(id, text, last, turn),
  ].join('\n');
}
