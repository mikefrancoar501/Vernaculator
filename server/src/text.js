/**
 * Incremental sentence splitter. Feed it streamed text; it yields complete
 * sentences as soon as they end, and `flush()` returns whatever is left.
 */
export class SentenceBuffer {
  constructor({ minLength = 12 } = {}) {
    this.buf = '';
    this.minLength = minLength;
  }

  push(text) {
    this.buf += text;
    const out = [];
    // A sentence ends at . ! ? … (optionally followed by quotes/brackets) then whitespace, or at a newline.
    const re = /([.!?…]+["'”’)\]]*)(\s+)|(\n+)/g;
    let start = 0;
    let m;
    while ((m = re.exec(this.buf))) {
      const end = m.index + (m[1] ? m[1].length : 0);
      const candidate = this.buf.slice(start, end).trim();
      if (candidate.length >= this.minLength || m[3]) {
        if (candidate) out.push(candidate);
        start = m.index + m[0].length;
      }
    }
    this.buf = this.buf.slice(start);
    return out;
  }

  flush() {
    const rest = this.buf.trim();
    this.buf = '';
    return rest ? [rest] : [];
  }
}

export function splitSentences(text) {
  const sb = new SentenceBuffer({ minLength: 1 });
  return [...sb.push(text + ' '), ...sb.flush()];
}
