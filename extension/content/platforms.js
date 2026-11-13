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
  ];

  Vern.platformFor = (hostname = location.hostname) => PLATFORMS.find((p) => p.host.test(hostname)) || null;
  Vern.PLATFORMS = PLATFORMS;
})();
