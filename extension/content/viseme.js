// Two-state viseme driver: swaps idle/talking sprites from live audio amplitude.
// Runs a rAF loop only while audio plays and touches the DOM only on state changes.
(() => {
  const OPEN_AT = 0.055;
  const CLOSE_AT = 0.03;
  const MIN_HOLD_MS = 70;

  /** Shared hysteresis so the live HUD and the meme renderer animate identically. */
  class MouthState {
    constructor() {
      this.open = false;
      this.changedAt = 0;
    }
    update(level, now) {
      if (now - this.changedAt < MIN_HOLD_MS) return this.open;
      const next = this.open ? level > CLOSE_AT : level > OPEN_AT;
      if (next !== this.open) {
        this.open = next;
        this.changedAt = now;
      }
      return this.open;
    }
  }

  class VisemeDriver {
    constructor(img, player) {
      this.img = img;
      this.player = player;
      this.urls = { idle: '', talking: '' };
      this.mouth = new MouthState();
      this.raf = 0;
      this.shown = null;
    }

    setSprites(urls) {
      this.urls = urls;
      // Preload the talking frame so the first swap doesn't flash.
      new Image().src = urls.talking;
      this.#show(false, true);
    }

    #show(open, force = false) {
      if (!force && open === this.shown) return;
      this.shown = open;
      this.img.src = open ? this.urls.talking : this.urls.idle;
      this.img.dataset.mouth = open ? 'open' : 'closed';
    }

    start() {
      if (this.raf) return;
      const loop = (now) => {
        if (!this.player.playing) {
          this.raf = 0;
          this.#show(false);
          return;
        }
        const level = this.player.level();
        // No analyser yet (no user gesture): flap at ~6 Hz so it still looks alive.
        const open = level === null ? Math.floor(now / 85) % 2 === 0 : this.mouth.update(level, now);
        this.#show(open);
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
  }

  Vern.VisemeDriver = VisemeDriver;
  Vern.MouthState = MouthState;
})();
