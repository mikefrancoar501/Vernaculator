// Client for the middleware's /v1/stream endpoint.
// The WebSocket itself lives in the service worker (background.js): a content script's
// requests count as the host page's, so Chrome's Local Network Access checks and page
// policies can block them, while the extension's own context is not subject to those.
// This class relays over a runtime Port and keeps the same connect/send/reset interface.
(() => {
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  class Connection {
    constructor({ onMessage, onAudio, onStatus }) {
      this.onMessage = onMessage;
      this.onAudio = onAudio;
      this.onStatus = onStatus;
      this.port = null;
      this.ready = null;
      this.backoff = 500;
      this.blockedUntil = 0;
    }

    get wsUrl() {
      const base = Vern.settings.values.backendUrl.replace(/\/+$/, '');
      return `${base.replace(/^http/, 'ws')}/v1/stream`;
    }

    /** Resolves once authenticated. Re-used while the socket stays open. */
    connect() {
      if (this.ready) return this.ready;
      const { token } = Vern.settings.values;
      if (!token) return Promise.reject(new Error('Add your session token in the extension options.'));
      this.ready = new Promise((resolve, reject) => {
        const port = chrome.runtime.connect({ name: 'vern-stream' });
        this.port = port;
        this.onStatus?.('connecting');
        let settled = false;
        const fail = (err) => {
          if (!settled) { settled = true; reject(err); }
        };

        port.onMessage.addListener((m) => {
          if (m.ev === 'open') {
            port.postMessage({ op: 'send', data: JSON.stringify({ type: 'auth', token }) });
          } else if (m.ev === 'audio') {
            this.onAudio?.(m.seq, b64ToBytes(m.b64));
          } else if (m.ev === 'message') {
            const msg = JSON.parse(m.data);
            if (msg.type === 'auth.ok') {
              settled = true;
              this.backoff = 500;
              this.onStatus?.('connected', msg);
              resolve(msg);
            } else if (msg.type === 'auth.error') {
              fail(new Error(msg.message));
            }
            this.onMessage?.(msg);
          } else if (m.ev === 'error') {
            fail(new Error(`Cannot reach the middleware at ${Vern.settings.values.backendUrl}`));
          } else if (m.ev === 'close') {
            this.#closed(m.code, fail);
          }
        });
        port.onDisconnect.addListener(() => this.#closed(0, fail));
        port.postMessage({ op: 'open', url: this.wsUrl });
      });
      this.ready.catch(() => {
        this.blockedUntil = Date.now() + this.backoff;
        this.backoff = Math.min(this.backoff * 2, 15000);
      });
      return this.ready;
    }

    #closed(code, fail) {
      if (!this.port) return;
      try { this.port.disconnect(); } catch { /* already gone */ }
      this.port = null;
      this.ready = null;
      this.onStatus?.('disconnected', { code });
      fail(new Error(code === 4401 ? 'Session token rejected.' : `Cannot reach the middleware at ${Vern.settings.values.backendUrl}`));
    }

    async send(obj) {
      if (!this.ready && Date.now() < this.blockedUntil) throw new Error('Reconnecting to the middleware...');
      await this.connect();
      this.port.postMessage({ op: 'send', data: JSON.stringify(obj) });
    }

    reset() {
      try { this.port?.postMessage({ op: 'close' }); this.port?.disconnect(); } catch { /* ignore */ }
      this.port = null;
      this.ready = null;
      this.blockedUntil = 0;
    }
  }

  /** JSON GET (or POST when `body` is given) through the service worker (same reason as above). */
  Vern.fetchJson = async (url, headers, body) => {
    const res = await chrome.runtime.sendMessage({ op: 'fetchJson', url, headers, body });
    if (!res?.ok) throw new Error(res?.error || 'request failed');
    return res.data;
  };

  Vern.Connection = Connection;
})();
