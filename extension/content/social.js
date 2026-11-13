// Social overlay (X, Facebook, Instagram): a small "Crib notes" pill appears on the post under
// the pointer (or the finger, on touch). Tapping it hands the post to the HUD. Nothing here
// writes into the site or posts anything: the user copies, downloads and posts it themselves.
(() => {
  const STYLE = `
    :host { all: initial; }
    button {
      all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;
      padding: 5px 10px; border-radius: 999px; background: #6b4eff; color: #fff;
      font: 600 12px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
      box-shadow: 0 4px 14px rgba(20,10,60,.28);
    }
    button:hover { background: #5a3ef0; }
    button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  `;

  class SocialOverlay {
    constructor(platform, { onCrib }) {
      this.platform = platform;
      this.onCrib = onCrib;
      this.post = null;
    }

    mount() {
      this.host = document.createElement('div');
      this.host.id = 'vernaculator-crib';
      Object.assign(this.host.style, { position: 'fixed', top: '0', left: '0', zIndex: '2147482998', display: 'none' });
      const root = this.host.attachShadow({ mode: 'closed' });
      root.innerHTML = `<style>${STYLE}</style><button type="button"></button>`;
      this.btn = root.querySelector('button');
      this.btn.textContent = Vern.t('socialCribPill', '🎭 Crib notes');
      this.btn.title = Vern.t('socialCribPillTitle', 'Sum up this post in a few witty lines');
      this.btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.post?.isConnected) this.onCrib(this.post);
      });
      document.documentElement.appendChild(this.host);

      // pointerover covers mouse hover and the first tap on touch screens.
      document.addEventListener('pointerover', (e) => {
        if (e.composedPath().includes(this.host)) return;
        const post = e.target.closest?.(this.platform.postSelector);
        if (post && post !== this.post) this.#show(post);
      }, { passive: true });
      let raf = 0;
      window.addEventListener('scroll', () => {
        if (raf) return;
        raf = requestAnimationFrame(() => { raf = 0; this.#place(); });
      }, { passive: true, capture: true });
      window.addEventListener('resize', () => this.#place(), { passive: true });
    }

    #show(post) {
      if (Vern.settings.values.socialPill === false) return;
      this.post = post;
      this.host.style.display = '';
      this.#place();
    }

    #place() {
      if (!this.post) return;
      const r = this.post.getBoundingClientRect();
      if (!this.post.isConnected || r.bottom < 40 || r.top > innerHeight - 20) {
        this.host.style.display = 'none';
        this.post = null;
        return;
      }
      const w = this.host.offsetWidth || 110;
      const x = Math.min(Math.max(8, r.right - w - 8), innerWidth - w - 8);
      const y = Math.min(Math.max(8, r.top + 8), innerHeight - 40);
      this.host.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }

    /** The post taking up the most of the viewport (for the HUD's "post on screen" button). */
    postInView() {
      let best = null;
      let bestArea = 0;
      for (const el of document.querySelectorAll(this.platform.postSelector)) {
        if (el.parentElement?.closest(this.platform.postSelector)) continue; // quoted post inside a post
        const r = el.getBoundingClientRect();
        const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
        const area = h > 0 ? h * r.width : 0;
        if (area > bestArea) { best = el; bestArea = area; }
      }
      return best;
    }

    /** Opens the site's own reply box for the post, if the button can be found. Never types or sends. */
    openReply(post) {
      const btn = post?.isConnected && this.platform.replySelector && post.querySelector(this.platform.replySelector);
      const target = btn?.closest('button, [role="button"]') || btn;
      if (!target) return false;
      target.click();
      return true;
    }
  }

  Vern.SocialOverlay = SocialOverlay;
})();
