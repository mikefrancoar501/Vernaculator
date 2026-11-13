// Per-site adapters for the message observers (spec 2.1).
// These selectors target markup the host sites control and WILL drift; keep them in one place.
// Each adapter returns assistant message roots and says whether one is still streaming.
(() => {
  const outermost = (nodes, selector) => nodes.filter((n) => !n.parentElement?.closest(selector));

  const PLATFORMS = [
    {
      id: 'claude',
      host: /(^|\.)claude\.ai$/,
      selector: '.font-claude-response, .font-claude-message',
      find(root) {
        return outermost([...root.querySelectorAll(this.selector)], this.selector);
      },
      isStreaming(node) {
        return !!node.closest('[data-is-streaming="true"]');
      },
    },
    {
      id: 'gemini',
      host: /(^|\.)gemini\.google\.com$/,
      selector: 'model-response message-content, model-response .model-response-text',
      find(root) {
        return outermost([...root.querySelectorAll(this.selector)], this.selector);
      },
      isStreaming(node) {
        const resp = node.closest('model-response');
        return !!resp?.querySelector('[aria-busy="true"], .loading-indicator, pending-response');
      },
    },
    {
      id: 'grok',
      host: /(^|\.)grok\.com$/,
      selector: '.message-bubble',
      // Grok's animated companion avatar. Best guess at its markup; verify on the live site.
      companionSelector: '[data-testid*="companion" i], [class*="companion-avatar" i], [aria-label*="companion" i]',
      find(root) {
        // Grok right-aligns the user's own bubbles; keep the assistant ones.
        return outermost([...root.querySelectorAll(this.selector)], this.selector).filter(
          (n) => !n.closest('.items-end, [data-testid="user-message"]'),
        );
      },
      isStreaming(node) {
        return !!node.closest('[aria-busy="true"]');
      },
    },
    // Social sites: no AI replies to watch. The user picks a post and asks for crib notes or a
    // reply draft; nothing is ever posted for them. Placeholder selectors: verify on the live sites.
    {
      id: 'x',
      social: true,
      host: /(^|\.)(x|twitter)\.com$/,
      postSelector: 'article[data-testid="tweet"], article[role="article"]',
      textSelector: '[data-testid="tweetText"]',
      replySelector: '[data-testid="reply"]',
    },
    {
      id: 'facebook',
      social: true,
      host: /(^|\.)facebook\.com$/,
      postSelector: '[role="article"]',
      textSelector: '[data-ad-preview="message"], [data-ad-comet-preview="message"], [data-testid="post_message"]',
      replySelector: '[aria-label="Leave a comment" i], [aria-label="Comment" i]',
    },
    {
      id: 'instagram',
      social: true,
      host: /(^|\.)instagram\.com$/,
      postSelector: 'article',
      textSelector: 'h1, ul li span[dir="auto"]',
      replySelector: '[aria-label="Comment" i]',
    },
  ];

  /** Visible text of a social post: the platform's text node if found, else the whole post. */
  Vern.postText = (platform, el) => {
    const parts = platform.textSelector ? [...el.querySelectorAll(platform.textSelector)].map((n) => n.innerText) : [];
    const text = (parts.join('\n').trim() || el.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return text.slice(0, 5000);
  };

  Vern.platformFor = (hostname = location.hostname) => PLATFORMS.find((p) => p.host.test(hostname)) || null;
  Vern.PLATFORMS = PLATFORMS;
})();
