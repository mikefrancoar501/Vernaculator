// Town panel strip: the chosen town members sit along the top of the screen. The one
// speaking is highlighted and their mouth moves; tap a member to make them your main character.
// Mobile-friendly: compact avatars, horizontal scroll, respects the notch/safe area.
(() => {
  const STYLE = `
    :host { all: initial; }
    .strip {
      --bg: rgba(255,255,255,.92); --fg: #1d1b26; --muted: #6c6880; --accent: #6b4eff; --line: #e4e1ee;
      display: flex; gap: 6px; padding: 6px 8px; margin-top: max(6px, env(safe-area-inset-top));
      max-width: calc(100vw - 16px); overflow-x: auto; scrollbar-width: none;
      background: var(--bg); border: 1px solid var(--line); border-radius: 999px;
      box-shadow: 0 6px 20px rgba(20,10,60,.16); backdrop-filter: blur(8px);
      font: 600 11px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg);
    }
    @media (prefers-color-scheme: dark) { .strip { --bg: rgba(30,28,39,.92); --fg: #f1effa; --muted: #a29eb8; --accent: #8f7bff; --line: #34313f; } }
    .strip::-webkit-scrollbar { display: none; }
    button { all: unset; cursor: pointer; display: grid; justify-items: center; gap: 2px; min-width: 56px; padding: 2px 4px; border-radius: 14px; transition: transform .15s ease; }
    button:focus-visible { outline: 2px solid var(--accent); }
    .face { width: 44px; height: 44px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; background: rgba(127,127,127,.12); box-shadow: 0 0 0 2px transparent; transition: box-shadow .15s; }
    .face img { width: 48px; height: 48px; object-fit: contain; pointer-events: none; }
    .name { color: var(--muted); max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    button[data-active="true"] { transform: translateY(1px) scale(1.08); }
    button[data-active="true"] .face { box-shadow: 0 0 0 2px var(--accent); }
    button[data-active="true"] .name { color: var(--fg); }
    @media (max-width: 480px) { .face { width: 38px; height: 38px; } .face img { width: 42px; height: 42px; } button { min-width: 48px; } }
  `;

  class TownStrip {
    constructor({ onPick }) {
      this.onPick = onPick;
      this.members = []; // { id, name, sprites: { idle, talking, hue } }
      this.active = null;
    }

    mount() {
      this.host = document.createElement('div');
      this.host.id = 'vernaculator-town';
      Object.assign(this.host.style, { position: 'fixed', top: '0', left: '50%', transform: 'translateX(-50%)', zIndex: '2147482999', display: 'none' });
      this.root = this.host.attachShadow({ mode: 'closed' });
      this.root.innerHTML = `<style>${STYLE}</style><div class="strip" role="toolbar" aria-label="Town panel"></div>`;
      this.strip = this.root.querySelector('.strip');
      this.strip.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-id]');
        if (b) this.onPick?.(b.dataset.id);
      });
      document.documentElement.appendChild(this.host);
    }

    setVisible(v) {
      if (!this.host) return;
      this.host.style.display = v && this.members.length ? '' : 'none';
    }

    setMembers(members) {
      this.members = members;
      if (!this.strip) return;
      this.strip.replaceChildren(...members.map((m) => {
        const b = document.createElement('button');
        b.dataset.id = m.id;
        b.title = m.name;
        b.innerHTML = '<span class="face"><img alt=""></span><span class="name"></span>';
        const img = b.querySelector('img');
        img.src = m.sprites.idle;
        if (m.sprites.hue) img.style.filter = `hue-rotate(${m.sprites.hue}deg)`;
        b.querySelector('.name').textContent = m.name;
        return b;
      }));
      this.setActive(this.active);
    }

    setActive(id) {
      this.active = id;
      if (!this.strip) return;
      for (const b of this.strip.querySelectorAll('button')) {
        const on = b.dataset.id === id;
        b.dataset.active = String(on);
        if (!on) {
          const m = this.members.find((x) => x.id === b.dataset.id);
          if (m) b.querySelector('img').src = m.sprites.idle;
        }
      }
    }

    /** Mirror the speaking character's mouth onto their avatar. */
    setMouth(open) {
      if (!this.strip) return;
      if (open === this.lastMouth) return;
      this.lastMouth = open;
      const m = this.members.find((x) => x.id === this.active);
      const img = this.strip.querySelector(`button[data-id="${CSS.escape(this.active || '')}"] img`);
      if (m && img) img.src = open ? m.sprites.talking : m.sprites.idle;
    }

    rect() {
      return this.host ? this.host.getBoundingClientRect() : DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 });
    }
  }

  Vern.TownStrip = TownStrip;
})();
