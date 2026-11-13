// MutationObserver-based detection of assistant replies (spec 2.1).
// Emits sentence-level chunks while a reply streams, then an end event once the
// text has been stable for `stableMs` and the site no longer marks it as streaming.
(() => {
  const SKIP_TAGS = new Set(['PRE', 'BUTTON', 'SVG', 'svg', 'STYLE', 'SCRIPT', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'KBD']);
  const BLOCK = /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|TR|SECTION|ARTICLE|UL|OL|TABLE|BR)$/;

  /** Readable text of a message, skipping code blocks, buttons, and hidden UI. */
  function extractText(root) {
    let out = '';
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.nodeValue;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (SKIP_TAGS.has(node.tagName)) {
        if (node.tagName === 'PRE') out += '\n(code sample)\n';
        return;
      }
      if (node.getAttribute('aria-hidden') === 'true' || node.classList.contains('sr-only') || node.id === 'vernaculator-hud') return;
      const block = BLOCK.test(node.tagName);
      if (block) out += '\n';
      for (const child of node.childNodes) walk(child);
      if (block) out += '\n';
    };
    walk(root);
    return out.replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').trim();
  }

  /** Index just past the last complete sentence in `text` at or after `from`, or -1. */
  function lastSentenceEnd(text, from) {
    const re = /[.!?…]+["'”’)\]]*(?=\s)|\n/g;
    re.lastIndex = from;
    let end = -1;
    let m;
    while ((m = re.exec(text))) end = m.index + m[0].length;
    return end;
  }

  class MessageObserver {
    constructor(platform, handlers, { stableMs = 1400, minChunk = 40 } = {}) {
      this.platform = platform;
      this.h = handlers; // { onStart(id, node), onChunk(id, text), onEnd(id, fullText) }
      this.stableMs = stableMs;
      this.minChunk = minChunk;
      this.states = new WeakMap();
      this.active = new Set();
      this.nextId = 1;
      this.scheduled = false;
      this.timer = null;
      this.latest = null; // most recent assistant node (for manual "read last reply")
    }

    start() {
      // Existing messages are history: never auto-read them.
      for (const node of this.platform.find(document)) {
        this.states.set(node, { id: this.nextId++, history: true, emitted: 0, text: extractText(node) });
        this.latest = node;
      }
      this.mo = new MutationObserver(() => this.schedule());
      this.mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    stop() {
      this.mo?.disconnect();
      clearInterval(this.timer);
    }

    schedule() {
      if (this.scheduled) return;
      this.scheduled = true;
      setTimeout(() => {
        this.scheduled = false;
        this.scan();
      }, 150);
    }

    scan() {
      const now = performance.now();
      for (const node of this.platform.find(document)) {
        let st = this.states.get(node);
        if (!st) {
          st = { id: this.nextId++, history: false, started: false, ended: false, emitted: 0, text: '', changedAt: now, node };
          this.states.set(node, st);
        }
        this.latest = node;
        if (st.history || st.ended) continue;
        const text = extractText(node);
        if (text !== st.text) {
          st.text = text;
          st.changedAt = now;
        }
        if (!st.started && text) {
          st.started = true;
          this.active.add(st);
          this.h.onStart?.(st.id, node);
        }
      }
      for (const st of this.active) this.#advance(st, now);
      this.#ensureTicker();
    }

    #advance(st, now) {
      if (!st.node.isConnected) {
        this.#end(st);
        return;
      }
      const streaming = this.platform.isStreaming(st.node);
      const stable = now - st.changedAt >= this.stableMs;
      if (!streaming && stable) {
        const rest = st.text.slice(st.emitted).trim();
        if (rest) this.h.onChunk?.(st.id, rest);
        st.emitted = st.text.length;
        this.#end(st);
        return;
      }
      const end = lastSentenceEnd(st.text, st.emitted);
      if (end > st.emitted && end - st.emitted >= this.minChunk) {
        this.h.onChunk?.(st.id, st.text.slice(st.emitted, end).trim());
        st.emitted = end;
      }
    }

    #end(st) {
      st.ended = true;
      this.active.delete(st);
      this.h.onEnd?.(st.id, st.text);
    }

    #ensureTicker() {
      // While a reply is in flight, re-check periodically so "stable" fires without new mutations.
      if (this.active.size && !this.timer) {
        this.timer = setInterval(() => this.scan(), 400);
      } else if (!this.active.size && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }

    latestText() {
      return this.latest ? extractText(this.latest) : '';
    }
  }

  Vern.MessageObserver = MessageObserver;
  Vern.extractText = extractText;
})();
