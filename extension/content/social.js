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

  // --- What's hot -------------------------------------------------------------------------
  // Ranks the posts already loaded on the page the user is looking at (nothing is fetched and
  // no accounts are looked up) by reach (likes, reposts, replies, views shown on the post) and
  // by trend relevance (topics many of the visible posts share). The user picks one to riff on.
  const STOP = new Set('about after again against being below between could doing during every from further having here hers herself himself into itself just more most other ours ourselves over same should some such than that their theirs them themselves then there these they this those through under until very what when where which while whom with would your yours yourself yourselves people today really thing things going want still know think like make made back even also been were will have just only much many said says because before little first great right years year time well never always'.split(' '));
  const METRIC = /(\d[\d.,]*\s*[KkMm]?)\s*(likes?|reposts?|retweets?|quotes?|replies|reply|comments?|views?|shares?|reactions?|bookmarks?)\b/g;

  /** "1.2K" -> 1200, "3,400" -> 3400, "2M" -> 2000000 */
  function parseCount(str) {
    const m = /^(\d[\d.,]*)\s*([KkMm]?)$/.exec(String(str).trim());
    if (!m) return 0;
    const n = parseFloat(m[1].replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
    return Math.round(n * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] || 1));
  }

  function reachOf(el) {
    let total = 0;
    const seen = new Set();
    for (const n of el.querySelectorAll('[aria-label], button, [role="button"], a[href*="/analytics"]')) {
      const label = `${n.getAttribute('aria-label') || ''} ${n.getAttribute('aria-label') ? '' : n.textContent || ''}`;
      for (const m of label.matchAll(METRIC)) {
        const key = `${m[2].toLowerCase().replace(/s$/, '')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        total += parseCount(m[1]);
      }
      if (!label.match(METRIC)) {
        // Icon buttons that only show a count (e.g. "💬 12").
        const bare = /^\D{0,3}(\d[\d.,]*\s*[KkMm]?)$/.exec((n.textContent || '').trim());
        if (bare && n.matches('button, [role="button"]')) total += parseCount(bare[1]);
      }
    }
    return total;
  }

  function topicsOf(text) {
    const tags = (text.match(/#[\p{L}\d_]{2,}/gu) || []).map((t) => t.toLowerCase());
    const words = (text.toLowerCase().match(/\p{L}{5,}/gu) || []).filter((w) => !STOP.has(w));
    return new Set([...tags, ...words]);
  }

  Vern.rankPosts = (platform, { limit = 5 } = {}) => {
    const posts = [...document.querySelectorAll(platform.postSelector)]
      .filter((el) => !el.parentElement?.closest(platform.postSelector))
      .map((el) => {
        const text = Vern.postText(platform, el);
        return { el, text, reach: reachOf(el), topics: topicsOf(text) };
      })
      .filter((p) => p.text.length >= 40);
    const df = new Map();
    for (const p of posts) for (const t of p.topics) df.set(t, (df.get(t) || 0) + 1);
    for (const p of posts) {
      const shared = [...p.topics].filter((t) => df.get(t) > 1).sort((a, b) => df.get(b) - df.get(a));
      p.trend = shared.reduce((n, t) => n + df.get(t) - 1, 0);
      p.topic = shared[0] || '';
    }
    const maxReach = Math.max(1, ...posts.map((p) => Math.log10(1 + p.reach)));
    const maxTrend = Math.max(1, ...posts.map((p) => p.trend));
    for (const p of posts) p.score = 0.6 * (Math.log10(1 + p.reach) / maxReach) + 0.4 * (p.trend / maxTrend);
    return posts.sort((a, b) => b.score - a.score).slice(0, limit);
  };
  Vern.parseCount = parseCount;

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

    // Sit to the left of the post's ••• / More menu (and Grok or other header
    // icons), so the site's own menu stays clickable. If the header is too
    // crowded, drop to just above the like/reply bar on the right instead.
    #place() {
      if (!this.post) return;
      const r = this.post.getBoundingClientRect();
      if (!this.post.isConnected || r.bottom < 40 || r.top > innerHeight - 20) {
        this.host.style.display = 'none';
        this.post = null;
        return;
      }
      const w = this.host.offsetWidth || 110;
      const h = this.host.offsetHeight || 28;
      const { x, y } = this.#pillPos(r, w, h);
      this.host.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }

    #pillPos(r, w, h) {
      const gap = 10;
      const minX = Math.max(8, r.left + 8);
      const maxX = Math.min(innerWidth - 8, r.right - 8) - w;
      const clamp = (x, y) => ({
        x: Math.min(Math.max(minX, x), Math.max(minX, maxX)),
        y: Math.min(Math.max(8, y), innerHeight - h - 8),
      });

      const cluster = this.#headerCluster(r);
      if (cluster) {
        const x = cluster.left - gap - w;
        const y = cluster.top + (cluster.height - h) / 2;
        if (x >= this.#headerLeftBound(r) + gap) return clamp(x, y);
      } else {
        // No menu found: inset ~140px from the right, clearing a typical ••• + Grok cluster.
        const x = r.right - w - 140;
        const y = r.top + 8;
        if (x >= this.#headerLeftBound(r) + gap) return clamp(x, y);
      }

      // Header is crowded: sit just above the action bar, right-aligned.
      const bar = this.#actionBarBox(r);
      if (bar && bar.top - gap - h >= r.top + 24) {
        return clamp(Math.min(r.right - 8 - w, bar.right - w), bar.top - gap - h);
      }
      // Last resort: top-left of the post content, under the header row.
      return clamp(minX, r.top + 44);
    }

    /** The post's More/caret button, if it sits in the header (top-right). */
    #moreButton(r) {
      const sel = [
        '[data-testid="caret"]',
        'button[aria-label="More" i]',
        '[aria-label="More options" i]',
        '[aria-label="Actions for this post" i]',
        '[aria-label*="More" i]',
      ].join(', ');
      const postSel = this.platform.postSelector;
      const hits = [...this.post.querySelectorAll(sel)].filter((el) => {
        if (el.closest(postSel) !== this.post) return false;
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && b.top >= r.top - 4 && b.top <= r.top + 80
          && b.right > r.left + r.width * 0.45;
      });
      hits.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
      return hits[0] || null;
    }

    /** Box of the More button plus any Grok/other icons sharing its header cluster. */
    #headerCluster(r) {
      const more = this.#moreButton(r);
      const extras = [...this.post.querySelectorAll(
        '[aria-label="Grok actions" i], [data-testid="grokTweet"], [aria-label*="Grok" i]',
      )].filter((el) => {
        if (el.closest(this.platform.postSelector) !== this.post) return false;
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && b.top >= r.top - 4 && b.top <= r.top + 80;
      });
      if (!more && !extras.length) return null;
      const boxes = [];
      if (more) {
        boxes.push(more.getBoundingClientRect());
        const group = more.parentElement;
        if (group) {
          const gb = group.getBoundingClientRect();
          // Tight right-aligned group (not the whole header row).
          if (gb.width > 0 && gb.width < r.width * 0.45 && gb.right > r.right - 100) boxes.push(gb);
          for (const child of group.children) {
            const b = child.getBoundingClientRect();
            if (b.width > 0 && b.height > 0 && Math.abs(b.top - boxes[0].top) < 24) boxes.push(b);
          }
        }
      }
      for (const el of extras) boxes.push(el.getBoundingClientRect());
      const left = Math.min(...boxes.map((b) => b.left));
      const right = Math.max(...boxes.map((b) => b.right));
      const top = Math.min(...boxes.map((b) => b.top));
      const bottom = Math.max(...boxes.map((b) => b.bottom));
      return { left, right, top, bottom, width: right - left, height: bottom - top };
    }

    /** Right edge of the name/avatar in the header, so the pill doesn't cover them. */
    #headerLeftBound(r) {
      const postSel = this.platform.postSelector;
      const sel = '[data-testid="User-Name"], [data-testid="Tweet-User-Avatar"], time, h2, h3';
      let bound = r.left + 8;
      for (const el of this.post.querySelectorAll(sel)) {
        if (el.closest(postSel) !== this.post) continue;
        const b = el.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) continue;
        if (b.top > r.top + 72 || b.left > r.left + r.width * 0.65) continue;
        bound = Math.max(bound, b.right);
      }
      return bound;
    }

    /** The like/reply/repost row, used when the header has no room for the pill. */
    #actionBarBox(r) {
      const postSel = this.platform.postSelector;
      const seed = [this.platform.replySelector, '[data-testid="like"]', '[data-testid="retweet"]', '[role="group"]']
        .filter(Boolean).join(', ');
      if (!seed) return null;
      for (const el of this.post.querySelectorAll(seed)) {
        if (el.closest(postSel) !== this.post) continue;
        const b = el.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) continue;
        let box = b;
        for (let n = el, i = 0; i < 6 && n && n !== this.post; i++, n = n.parentElement) {
          const pb = n.getBoundingClientRect();
          if (pb.width >= r.width * 0.55 && pb.height <= 80 && pb.top > r.top + 36) {
            box = pb;
            break;
          }
        }
        if (box.top > r.top + 36 && box.bottom <= r.bottom + 12) return box;
      }
      return null;
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
