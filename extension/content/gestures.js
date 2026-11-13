// Character gestures. One recognizer owns every pointer interaction on the character so
// they can't clash:
//
//   long-press  (hold >= 550 ms without moving)        -> menu (size, characters, ...)
//   double-tap  (2 taps, then no 3rd tap within 320 ms) -> mini-assistant
//   tickle      (3 quick taps, or a fast back-and-forth rub) -> giggle
//   drag        handled elsewhere: only the header/grip drags, never the character
//
// A double-tap waits 320 ms to make sure it isn't the start of a tickle; a rub cancels
// the long-press; a long-press swallows the tap it started with.
(() => {
  const LONG_PRESS_MS = 550;
  const MOVE_CANCEL_PX = 8;
  const DOUBLE_GAP_MS = 320;
  const TAPS_FOR_TICKLE = 3;
  const TAP_WINDOW_MS = 900;
  const RUB_TURNS_NEEDED = 3;
  const RUB_MIN_SPEED = 0.6; // px per ms
  const TICKLE_COOLDOWN_MS = 1500;

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

  function attachCharacterGestures(el, { onTickle, onDoubleTap, onLongPress }) {
    let taps = [];
    let lastTickle = 0;
    let press = null; // { x, y, t, timer, long, rubX, rubT, dir, turns }
    let doubleTimer = 0;

    const tickle = () => {
      const now = performance.now();
      clearTimeout(doubleTimer);
      taps = [];
      if (now - lastTickle < TICKLE_COOLDOWN_MS) return;
      lastTickle = now;
      onTickle?.();
    };

    el.addEventListener('contextmenu', (e) => e.preventDefault()); // long-press on touch would open it
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      el.setPointerCapture?.(e.pointerId);
      const now = performance.now();
      press = { x: e.clientX, y: e.clientY, t: now, long: false, rubX: e.clientX, rubT: now, dir: 0, turns: 0 };
      press.timer = setTimeout(() => {
        if (!press) return;
        press.long = true;
        taps = [];
        clearTimeout(doubleTimer);
        onLongPress?.({ x: press.x, y: press.y });
      }, LONG_PRESS_MS);
    });

    el.addEventListener('pointermove', (e) => {
      if (!press) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_CANCEL_PX) clearTimeout(press.timer);
      const now = performance.now();
      const dx = e.clientX - press.rubX;
      if (Math.abs(dx) < 4) return;
      const dir = Math.sign(dx);
      if (Math.abs(dx) / Math.max(1, now - press.rubT) >= RUB_MIN_SPEED && dir !== press.dir) {
        if (press.dir !== 0) press.turns++;
        press.dir = dir;
      }
      press.rubX = e.clientX;
      press.rubT = now;
      if (press.turns >= RUB_TURNS_NEEDED) {
        press.turns = 0;
        tickle();
      }
    });

    const up = (e) => {
      if (!press) return;
      clearTimeout(press.timer);
      const wasLong = press.long;
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_CANCEL_PX;
      press = null;
      if (wasLong || moved || e.type === 'pointercancel') return;

      const now = performance.now();
      taps = taps.filter((t) => now - t < TAP_WINDOW_MS);
      taps.push(now);
      if (taps.length >= TAPS_FOR_TICKLE) return tickle();
      if (taps.length === 2 && now - taps[0] < DOUBLE_GAP_MS * 1.5) {
        clearTimeout(doubleTimer);
        doubleTimer = setTimeout(() => {
          if (taps.length === 2) {
            taps = [];
            onDoubleTap?.();
          }
        }, DOUBLE_GAP_MS);
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  Vern.Giggler = Giggler;
  Vern.attachCharacterGestures = attachCharacterGestures;
})();
