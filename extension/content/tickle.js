// Interactive tickle mechanics (spec 5.2): rapid taps or a fast back-and-forth rub
// on the character plays a pre-cached giggle without interrupting the TTS stream.
(() => {
  const TAPS_NEEDED = 3;
  const TAP_WINDOW_MS = 900;
  const RUB_TURNS_NEEDED = 3;
  const RUB_MIN_SPEED = 0.6; // px per ms
  const COOLDOWN_MS = 1500;

  class Giggler {
    constructor(getContext) {
      this.getContext = getContext;
      this.buffer = null;
      this.loading = null;
    }

    preload() {
      this.loading ??= fetch(Vern.assetUrl('assets/audio/giggle.mp3'))
        .then((r) => r.arrayBuffer())
        .catch((err) => Vern.log('giggle preload failed', err));
      return this.loading;
    }

    async play() {
      const ctx = this.getContext();
      if (!ctx) return;
      if (!this.buffer) {
        const bytes = await this.preload();
        if (!bytes) return;
        this.buffer = await ctx.decodeAudioData(bytes.slice(0));
      }
      // Separate source node mixed into the destination: the TTS element keeps playing.
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = 0.8;
      src.buffer = this.buffer;
      src.connect(gain).connect(ctx.destination);
      src.start();
    }
  }

  function attachTickle(el, onTickle) {
    let taps = [];
    let last = 0;
    let down = null;

    const fire = () => {
      const now = performance.now();
      if (now - last < COOLDOWN_MS) return;
      last = now;
      taps = [];
      onTickle();
    };

    el.addEventListener('pointerdown', (e) => {
      const now = performance.now();
      taps = taps.filter((t) => now - t < TAP_WINDOW_MS);
      taps.push(now);
      if (taps.length >= TAPS_NEEDED) fire();
      down = { x: e.clientX, t: now, dir: 0, turns: 0 };
      el.setPointerCapture?.(e.pointerId);
    });

    el.addEventListener('pointermove', (e) => {
      if (!down) return;
      const now = performance.now();
      const dx = e.clientX - down.x;
      const dt = Math.max(1, now - down.t);
      if (Math.abs(dx) < 4) return;
      const dir = Math.sign(dx);
      if (Math.abs(dx) / dt >= RUB_MIN_SPEED && dir !== down.dir) {
        if (down.dir !== 0) down.turns++;
        down.dir = dir;
      }
      down.x = e.clientX;
      down.t = now;
      if (down.turns >= RUB_TURNS_NEEDED) {
        down.turns = 0;
        fire();
      }
    });

    const up = () => { down = null; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  Vern.Giggler = Giggler;
  Vern.attachTickle = attachTickle;
})();
