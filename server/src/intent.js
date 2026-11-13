/**
 * Intent routing (spec 3.2): pick a persona from the semantic intent of the raw text.
 * Fast path: keyword scoring against each persona's intentKeywords.
 * Optional slow path (INTENT_MODE=llm): ask the LLM when keywords are inconclusive.
 */

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'is', 'it', 'for', 'on', 'with']);

export function tokenize(text) {
  return (text.toLowerCase().match(/[a-z][a-z'-]+/g) || []).filter((w) => !STOP.has(w));
}

/** Returns [{ id, score }] sorted best-first. Matches whole words and simple plurals/-ing forms. */
export function scorePersonas(text, personas) {
  const words = tokenize(text);
  const counts = new Map();
  for (const w of words) {
    const stems = new Set([w, w.replace(/(ing|ed|es|s)$/, '')]);
    for (const s of stems) counts.set(s, (counts.get(s) || 0) + 1);
  }
  return personas
    .map((p) => ({
      id: p.id,
      score: (p.intentKeywords || []).reduce((sum, k) => sum + (counts.get(k.toLowerCase()) || 0), 0),
    }))
    .sort((a, b) => b.score - a.score);
}

export async function routeIntent(text, personas, { mode = 'keywords', llm = null, fallbackId } = {}) {
  const ranked = scorePersonas(text, personas.list);
  const [best, second] = ranked;
  const decisive = best && best.score > 0 && (!second || best.score > second.score);
  if (decisive) return { personaId: best.id, method: 'keywords', ranked };

  if (mode === 'llm' && llm?.classify) {
    try {
      const id = await llm.classify(text, personas.list);
      if (id && personas.get(id)) return { personaId: id, method: 'llm', ranked };
    } catch (err) {
      console.warn('[intent] LLM classify failed, falling back:', err.message);
    }
  }
  const id = best?.score > 0 ? best.id : fallbackId || personas.defaultPersona().id;
  return { personaId: id, method: best?.score > 0 ? 'keywords-tie' : 'default', ranked };
}
