/**
 * Town panel: several characters share one answer. The answer is split into sections and
 * each section goes to the town member whose interests fit it best; they take turns with
 * short handoffs, each in their own voice.
 */
import { scorePersonas } from './intent.js';
import { splitSentences } from './text.js';

export const MAX_TOWN = 6;
const MAX_SEGMENTS = 6;

export function parseTown(list, personas) {
  if (!Array.isArray(list)) return [];
  const ids = [...new Set(list.filter((id) => typeof id === 'string' && personas.get(id)))].slice(0, MAX_TOWN);
  return ids.length >= 2 ? ids : [];
}

function chunksOf(text) {
  const paras = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (paras.length >= 2) return paras;
  // One block of text: group sentences in pairs.
  const sentences = splitSentences(text);
  const out = [];
  for (let i = 0; i < sentences.length; i += 2) out.push(sentences.slice(i, i + 2).join(' '));
  return out.length ? out : [text];
}

/** Returns [{ personaId, text }] in speaking order. */
export function planTown(text, memberIds, personas) {
  const members = memberIds.map((id) => personas.get(id));
  const chunks = chunksOf(text);
  const assigned = [];
  for (const chunk of chunks) {
    const [best, second] = scorePersonas(chunk, members);
    const prev = assigned.at(-1)?.personaId;
    let id;
    if (best.score > 0 && (!second || best.score > second.score)) id = best.id;
    else id = prev || memberIds[0]; // no clear topic match: the current speaker keeps going
    assigned.push({ personaId: id, text: chunk });
  }
  // Merge neighbours with the same speaker.
  let segs = assigned.reduce((acc, s) => {
    const last = acc.at(-1);
    if (last && last.personaId === s.personaId) last.text += ` ${s.text}`;
    else acc.push({ ...s });
    return acc;
  }, []);
  // Everyone stayed on one speaker: hand the bottom line to the next member so the town is heard.
  if (segs.length === 1 && chunks.length >= 2) {
    const next = memberIds.find((id) => id !== segs[0].personaId);
    segs = [
      { personaId: segs[0].personaId, text: chunks.slice(0, -1).join(' ') },
      { personaId: next, text: chunks.at(-1) },
    ];
  }
  while (segs.length > MAX_SEGMENTS) {
    const tail = segs.pop();
    segs.at(-1).text += ` ${tail.text}`;
  }
  return segs;
}

export function townPrompt({ index, total, prevName, nextName, memberNames }) {
  return [
    `TOWN PANEL: You are one of several characters (${memberNames.join(', ')}) taking turns explaining one answer. You cover only the part you are given (part ${index + 1} of ${total}).`,
    prevName ? `- Open with a quick, natural handoff from ${prevName} (a few words, in your own style), then go.` : '- You go first: open briefly, no long introduction.',
    nextName ? `- Do not wrap up the whole answer; ${nextName} continues after you. You may end with a short pass to ${nextName}.` : '- You speak last: finish with a one-sentence bottom line.',
    '- Do not use the "<Name> here." style self-introduction.',
  ].join('\n');
}
