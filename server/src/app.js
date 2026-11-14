import http from 'node:http';
import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import { JsonStore } from './store.js';
import { Gateway, bearer } from './auth.js';
import { loadPersonas, publicPersona, buildSystemPrompt } from './personas.js';
import { createLLM } from './llm.js';
import { routeIntent } from './intent.js';
import { sanitize } from './guardrails.js';
import { Utterance } from './pipeline.js';
import { styleCatalog } from './styles.js';
import { parseTask, SOCIAL_TASKS } from './tasks.js';
import { runAssistant } from './assistant.js';
import { VoicePreviews } from './preview.js';

const AUTH_TIMEOUT_MS = 10_000;
const MAX_JSON_BYTES = 64 * 1024;

export function createApp(cfg, { store, llm, fetchImpl, synthesize } = {}) {
  store ??= new JsonStore(cfg.dataFile);
  const gateway = new Gateway(store, cfg.quotas, cfg.socialRate);
  const personas = loadPersonas(cfg.personasFile);
  const coreValues = JSON.parse(fs.readFileSync(cfg.coreValuesFile, 'utf8')).values;
  llm ??= createLLM(cfg);
  const deps = { cfg, personas, coreValues, llm, gateway };
  const previews = new VoicePreviews(cfg, { gateway, fetchImpl, synthesize });

  const originAllowed = (origin) => {
    if (!origin) return true; // non-browser clients (curl, tests)
    if (cfg.allowedOrigins.includes(origin)) return true;
    if (origin.startsWith('chrome-extension://')) return !cfg.extensionId || origin === `chrome-extension://${cfg.extensionId}`;
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  };

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && originAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') return end(res, 204);
    const url = new URL(req.url, 'http://x');

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return json(res, 200, { ok: true, llm: cfg.llm.provider, tts: cfg.tts.provider });
      }
      if (req.method === 'GET' && url.pathname === '/v1/personas') {
        return json(res, 200, {
          defaultPersonaId: personas.defaultPersona().id,
          characters: personas.list.map(publicPersona),
          categories: personas.categories,
          categoryGroups: personas.categoryGroups,
          styles: styleCatalog(),
        });
      }

      const user = gateway.authenticate(bearer(req));
      if (url.pathname.startsWith('/v1/') && !user) return json(res, 401, { error: 'unauthorized' });

      const previewMatch = req.method === 'GET' && /^\/v1\/personas\/([a-z0-9_]{1,64})\/preview$/.exec(url.pathname);
      if (previewMatch) {
        const persona = personas.get(previewMatch[1]);
        if (!persona) return json(res, 404, { error: 'unknown_persona' });
        const out = await previews.get(user, persona);
        if (out.error) return json(res, out.status, { error: out.error, ...(out.retryAfterMs ? { retryAfterMs: out.retryAfterMs } : {}) });
        res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': out.audio.length, 'Cache-Control': 'private, max-age=3600', 'X-Preview-Source': out.source });
        return res.end(out.audio);
      }
      if (req.method === 'GET' && url.pathname === '/v1/usage') {
        return json(res, 200, gateway.usage(user));
      }
      if (req.method === 'POST' && url.pathname === '/v1/assistant') {
        const body = await readJson(req);
        return json(res, 200, await runAssistant(body.text, { personas, llm, current: body.current || {} }));
      }
      if (req.method === 'POST' && url.pathname === '/v1/transform') {
        // Text-only style transfer (no audio). Handy for testing personas and for the caption-only mode.
        const body = await readJson(req);
        const text = String(body.text || '').slice(0, 8000);
        if (!text) return json(res, 400, { error: 'text required' });
        if (!gateway.canSpend(user, text.length)) return json(res, 402, { error: 'quota_exceeded', usage: gateway.usage(user) });
        let persona = personas.get(body.personaId);
        let method = 'manual';
        if (!persona) {
          const routed = await routeIntent(text, personas, { mode: cfg.intentMode, llm });
          persona = personas.get(routed.personaId);
          method = routed.method;
        }
        const task = parseTask(body.task);
        if (task === 'scene') return json(res, 400, { error: 'scenes are voiced: use the /v1/stream WebSocket' });
        if (SOCIAL_TASKS.has(task)) {
          const rate = gateway.takeGeneration(user);
          if (!rate.ok) return json(res, 429, { error: 'rate_limited', retryAfterMs: rate.retryAfterMs });
        }
        const system = buildSystemPrompt(persona, { coreValues, readingLevel: body.readingLevel, style: body.style, task, profile: body.profile, source: body.source, text });
        let out = '';
        let sources = [];
        const question = String(body.question || '').slice(0, 1000);
        for await (const d of llm.stream({ system, task, text, question, research: task === 'expound', onSources: (s) => (sources = s) })) out += d;
        const { clean, flagged } = sanitize(out);
        gateway.record(user, clean.length);
        return json(res, 200, { persona: publicPersona(persona), method, task, text: clean, filtered: flagged, sources });
      }
      return json(res, 404, { error: 'not_found' });
    } catch (err) {
      console.error('[http]', err);
      return json(res, err.status || 500, { error: err.status ? err.message : 'internal' });
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_JSON_BYTES });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/v1/stream' || !originAllowed(req.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => handleSocket(ws));
  });

  function handleSocket(ws) {
    let user = null;
    let current = null;
    const send = {
      json: (obj) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(obj)),
      binary: (buf) => ws.readyState === ws.OPEN && ws.send(buf, { binary: true }),
    };
    const authTimer = setTimeout(() => !user && ws.close(4401, 'auth timeout'), AUTH_TIMEOUT_MS);

    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return send.json({ type: 'error', code: 'bad_json' });
      }

      if (msg.type === 'auth') {
        user = gateway.authenticate(msg.token);
        if (!user) {
          send.json({ type: 'auth.error', message: 'Invalid or expired token' });
          return ws.close(4401, 'unauthorized');
        }
        clearTimeout(authTimer);
        return send.json({ type: 'auth.ok', userId: user.id, usage: gateway.usage(user), voices: cfg.tts.provider === 'fish' ? 'real' : 'test' });
      }
      if (!user) return send.json({ type: 'error', code: 'unauthenticated' });

      const seq = Number(msg.seq) >>> 0;
      switch (msg.type) {
        case 'utterance.start':
          current?.cancel('superseded');
          current = new Utterance({
            seq,
            user,
            opts: { personaId: msg.personaId || 'auto', readingLevel: msg.readingLevel, style: msg.style, task: msg.task, question: msg.question, profile: msg.profile, source: msg.source, town: msg.town, director: msg.director },
            deps,
            send,
          });
          if (msg.text) current.append(String(msg.text));
          if (msg.final) current.end();
          break;
        case 'utterance.text':
          if (current?.seq === seq) current.append(String(msg.text || ''));
          break;
        case 'utterance.end':
          if (current?.seq === seq) current.end();
          break;
        case 'utterance.cancel':
          if (current?.seq === seq) current.cancel('client');
          break;
        case 'ping':
          send.json({ type: 'pong', t: msg.t });
          break;
        default:
          send.json({ type: 'error', code: 'unknown_type' });
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      current?.cancel('disconnected');
    });
  }

  return { server, wss, store, gateway, personas, deps };
}

function end(res, status) {
  res.writeHead(status);
  res.end();
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_JSON_BYTES) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {});
      } catch {
        reject(Object.assign(new Error('invalid json'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}
