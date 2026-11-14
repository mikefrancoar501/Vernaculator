// MV3 service worker:
//  - seeds default settings and toggles the HUD from the toolbar button
//  - owns the WebSocket(s) to the middleware and relays them to content scripts over Ports
//    (requests from the extension's own context avoid the host page's network restrictions).
//    An open WebSocket with traffic keeps the worker alive (Chrome 116+).
const DEFAULTS = {
  backendUrl: 'http://localhost:8787',
  token: '',
  personaId: 'big_sal',
  readingLevel: 2,
  paraphrase: false,
  userName: '',
  aboutMe: '',
  ageGroup: '',
  language: 'auto',
  humor: false,
  philosophy: false,
  accent: 'none',
  autoRead: true,
  hudVisible: true,
};

/**
 * The Windows setup script writes extension/local-config.json ({ backendUrl, token }, git-ignored).
 * If the extension has no token yet (first install, or re-added from the folder, which gives it
 * fresh storage), fill it in from there so testers never have to paste it again. Also runs when
 * the options page opens (it asks over runtime messaging).
 */
async function adoptLocalConfig() {
  const { token, localConfigToken } = await chrome.storage.local.get(['token', 'localConfigToken']);
  try {
    const res = await fetch(chrome.runtime.getURL('local-config.json'), { cache: 'no-store' });
    if (!res.ok) return false;
    const cfg = await res.json();
    if (typeof cfg.token !== 'string' || !/^vk_[A-Za-z0-9_-]+$/.test(cfg.token)) return false;
    // Fill an empty token, or replace one that came from an older local config (the setup script
    // made a new token). A token the user typed in themselves is left alone.
    if (token && token !== localConfigToken) return false;
    if (token === cfg.token) return false;
    const patch = { token: cfg.token, localConfigToken: cfg.token };
    if (typeof cfg.backendUrl === 'string' && /^https?:\/\/[^/]+/.test(cfg.backendUrl)) patch.backendUrl = cfg.backendUrl;
    await chrome.storage.local.set(patch);
    return true;
  } catch {
    return false; // no local config: normal installs paste the token on the options page
  }
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const current = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const missing = Object.fromEntries(Object.entries(DEFAULTS).filter(([k]) => current[k] === undefined));
  if (Object.keys(missing).length) await chrome.storage.local.set(missing);
  await adoptLocalConfig();
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(adoptLocalConfig);
chrome.runtime.onMessage.addListener((m, _sender, sendResponse) => {
  if (m?.op !== 'adoptLocalConfig') return false;
  adoptLocalConfig().then(sendResponse);
  return true;
});

chrome.action.onClicked.addListener(async () => {
  const { hudVisible = true } = await chrome.storage.local.get('hudVisible');
  await chrome.storage.local.set({ hudVisible: !hudVisible });
});

// Only talk to the middleware the user configured.
async function allowed(url) {
  const { backendUrl = DEFAULTS.backendUrl } = await chrome.storage.local.get('backendUrl');
  const base = new URL(backendUrl);
  const u = new URL(url);
  return u.host === base.host && u.protocol.replace('ws', 'http') === base.protocol;
}

function bytesToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'vern-stream') return;
  let ws = null;
  const post = (m) => {
    try { port.postMessage(m); } catch { /* port closed */ }
  };

  port.onMessage.addListener(async (m) => {
    if (m.op === 'open') {
      if (!/^wss?:\/\//.test(m.url) || !(await allowed(m.url))) return post({ ev: 'error' });
      ws = new WebSocket(m.url);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => post({ ev: 'open' });
      ws.onmessage = (e) => {
        if (typeof e.data === 'string') return post({ ev: 'message', data: e.data });
        const seq = new DataView(e.data).getUint32(0);
        post({ ev: 'audio', seq, b64: bytesToB64(e.data.slice(4)) });
      };
      ws.onerror = () => post({ ev: 'error' });
      ws.onclose = (e) => post({ ev: 'close', code: e.code });
    } else if (m.op === 'send') {
      if (ws?.readyState === WebSocket.OPEN) ws.send(m.data);
    } else if (m.op === 'close') {
      ws?.close();
    }
  });
  port.onDisconnect.addListener(() => ws?.close());
});

chrome.runtime.onMessage.addListener((m, _sender, reply) => {
  if (m.op === 'openOptions') {
    chrome.runtime.openOptionsPage();
    return false;
  }
  if (m.op === 'fetchAudio') {
    // Short voice preview clip (character picker). Same middleware-only rule as fetchJson.
    allowed(m.url)
      .then((ok) => {
        if (!ok) throw new Error('URL is not the configured middleware');
        return fetch(m.url, { headers: m.headers || {} });
      })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          return reply({ ok: false, status: r.status, error: body.error || `HTTP ${r.status}`, retryAfterMs: body.retryAfterMs });
        }
        const type = r.headers.get('content-type') || 'audio/mpeg';
        reply({ ok: true, type, source: r.headers.get('x-preview-source') || '', b64: bytesToB64(await r.arrayBuffer()) });
      })
      .catch((err) => reply({ ok: false, error: err.message }));
    return true;
  }
  if (m.op !== 'fetchJson') return false;
  allowed(m.url)
    .then((ok) => {
      if (!ok) throw new Error('URL is not the configured middleware');
      const init = { headers: m.headers || {} };
      if (m.body !== undefined) {
        init.method = 'POST';
        init.headers = { ...init.headers, 'Content-Type': 'application/json' };
        init.body = JSON.stringify(m.body);
      }
      return fetch(m.url, init);
    })
    .then(async (r) => reply(r.ok ? { ok: true, data: await r.json() } : { ok: false, error: `HTTP ${r.status}` }))
    .catch((err) => reply({ ok: false, error: err.message }));
  return true; // async reply
});
