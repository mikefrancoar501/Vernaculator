// Streaming audio playback via MediaSource (spec 2.3) + Web Audio amplitude analysis (spec 2.2).
(() => {
  const MIME = 'audio/mpeg';
  const mseSupported = () => typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(MIME);

  class StreamPlayer {
    constructor({ onState } = {}) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.onState = onState;
      this.seq = null;
      this.chunks = []; // every MP3 chunk of the current utterance (for replay + meme export)
      this.queue = [];
      this.ended = false;
      this.ms = null;
      this.sb = null;
      this.objectUrl = null;
      this.ctx = null;
      this.analyser = null;
      this.levelBuf = null;
      this.audio.addEventListener('playing', () => this.onState?.('playing'));
      this.audio.addEventListener('pause', () => this.onState?.(this.audio.ended ? 'ended' : 'paused'));
      this.audio.addEventListener('ended', () => this.onState?.('ended'));
      this.audio.addEventListener('error', () => this.#onMediaError());
    }

    /**
     * Web Audio needs a user gesture to start. Until then audio plays straight
     * from the element (the sprite falls back to a timed mouth flap).
     */
    ensureAudioGraph() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
      }
      try {
        this.ctx = new AudioContext();
        const src = this.ctx.createMediaElementSource(this.audio);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 1024;
        this.analyser.smoothingTimeConstant = 0.3;
        this.levelBuf = new Uint8Array(this.analyser.fftSize);
        src.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
      } catch (err) {
        Vern.log('Web Audio unavailable', err);
      }
      return this.ctx;
    }

    /** RMS amplitude 0..1 of what is playing right now, or null if no analyser yet. */
    level() {
      if (!this.analyser || this.ctx.state !== 'running') return null;
      this.analyser.getByteTimeDomainData(this.levelBuf);
      let sum = 0;
      for (let i = 0; i < this.levelBuf.length; i++) {
        const v = (this.levelBuf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / this.levelBuf.length);
    }

    /** Approximate byte offset of the playhead (the middleware streams 128 kbps CBR MP3). */
    get playheadBytes() {
      return this.audio.currentTime * 16000;
    }

    get playing() {
      return !this.audio.paused && !this.audio.ended;
    }

    begin(seq) {
      this.#teardown();
      this.seq = seq;
      this.chunks = [];
      this.bytes = 0; // bytes received for this utterance (used to time town-panel handoffs)
      this.queue = [];
      this.ended = false;
      this.fallback = !mseSupported();
      if (this.fallback) return;
      this.ms = new MediaSource();
      this.objectUrl = URL.createObjectURL(this.ms);
      this.audio.src = this.objectUrl;
      this.ms.addEventListener('sourceopen', () => {
        if (!this.ms || this.ms.readyState !== 'open') return;
        this.sb = this.ms.addSourceBuffer(MIME);
        this.sb.mode = 'sequence';
        this.sb.addEventListener('updateend', () => this.#pump());
        this.#pump();
      }, { once: true });
      this.#play();
    }

    push(seq, bytes) {
      if (seq !== this.seq) return; // stale audio from a superseded utterance
      const copy = bytes.slice();
      this.chunks.push(copy);
      this.bytes += copy.length;
      if (!this.fallback) {
        this.queue.push(copy);
        this.#pump();
      }
    }

    end(seq) {
      if (seq !== this.seq) return;
      this.ended = true;
      if (this.fallback) this.#playBlob();
      else this.#pump();
    }

    #pump() {
      const sb = this.sb;
      if (!sb || sb.updating || this.ms?.readyState !== 'open') return;
      if (this.queue.length) {
        try {
          sb.appendBuffer(this.queue.shift());
        } catch (err) {
          if (err.name === 'QuotaExceededError') this.#trimBuffer();
          else Vern.log('appendBuffer failed', err);
        }
        return;
      }
      if (this.ended) {
        try { this.ms.endOfStream(); } catch { /* already ended */ }
      }
      // Nudge playback once enough data is buffered (autoplay may have stalled).
      if (this.audio.paused && !this.userPaused && this.audio.readyState >= 2) this.#play();
    }

    #trimBuffer() {
      const t = this.audio.currentTime;
      if (this.sb && t > 10) this.sb.remove(0, t - 5);
    }

    async #play() {
      try {
        this.userPaused = false;
        await this.audio.play();
      } catch (err) {
        if (err.name === 'NotAllowedError') this.onState?.('blocked');
      }
    }

    #playBlob() {
      if (!this.chunks.length) return;
      this.#setSrc(URL.createObjectURL(new Blob(this.chunks, { type: MIME })));
      this.#play();
    }

    #setSrc(url) {
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = url;
      this.audio.src = url;
    }

    #onMediaError() {
      // Some host pages' CSP (media-src) can block blob: URLs. Report it so the HUD can show captions.
      if (this.audio.src) this.onState?.('error');
    }

    pause() {
      this.userPaused = true;
      this.audio.pause();
    }

    resume() {
      this.ensureAudioGraph();
      this.#play();
    }

    /** Replay the last utterance from its stored chunks (no network). */
    replay() {
      if (!this.chunks.length) return false;
      this.ensureAudioGraph();
      const chunks = this.chunks;
      this.#teardown();
      this.chunks = chunks;
      this.#playBlob();
      return true;
    }

    stop() {
      this.#teardown();
      this.chunks = [];
      this.seq = null;
      this.onState?.('idle');
    }

    #teardown() {
      this.audio.pause();
      this.ms = null;
      this.sb = null;
      this.queue = [];
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
      this.audio.removeAttribute('src');
      this.audio.load();
    }
  }

  Vern.StreamPlayer = StreamPlayer;
})();
