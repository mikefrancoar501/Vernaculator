import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { encode, decode } from '@msgpack/msgpack';

/**
 * Fish Audio streaming proxy session (spec 3.4).
 * Protocol (docs.fish.audio, WebSocket "tts live"): every frame is MessagePack.
 *   client -> { event: "start", request: {...} }, { event: "text", text }, { event: "flush" }, { event: "stop" }
 *   server -> { event: "audio", audio: <bytes> }, { event: "finish", reason: "stop" | "error" }
 *
 * Emits: 'open', 'audio' (Buffer), 'finish' (reason), 'error' (Error).
 */
export class FishSession extends EventEmitter {
  constructor({ apiKey, wsUrl, model, latency, voiceId, format = 'mp3' }) {
    super();
    this.opts = { apiKey, wsUrl, model, latency, voiceId, format };
    this.ws = null;
    this.pending = [];
    this.ready = false;
    this.finished = false;
  }

  open() {
    const { apiKey, wsUrl, model } = this.opts;
    if (!apiKey) {
      queueMicrotask(() => this.emit('error', new Error('FISH_API_KEY is not set')));
      return;
    }
    this.ws = new WebSocket(wsUrl, { headers: { Authorization: `Bearer ${apiKey}`, model } });
    this.ws.binaryType = 'nodebuffer';

    this.ws.on('open', () => {
      this.#send({
        event: 'start',
        request: {
          text: '',
          reference_id: this.opts.voiceId || null,
          format: this.opts.format,
          mp3_bitrate: 128,
          latency: this.opts.latency,
          normalize: true,
          chunk_length: 100, // smaller chunks = lower time-to-first-audio
        },
      }, true);
      this.ready = true;
      for (const msg of this.pending.splice(0)) this.#send(msg, true);
      this.emit('open');
    });

    this.ws.on('message', (data) => {
      let msg;
      try {
        msg = decode(data);
      } catch {
        return; // ignore undecodable frames
      }
      if (msg.event === 'audio' && msg.audio) {
        this.emit('audio', Buffer.from(msg.audio));
      } else if (msg.event === 'finish') {
        this.finished = true;
        if (msg.reason === 'error') this.emit('error', new Error('Fish Audio reported a synthesis error'));
        this.emit('finish', msg.reason);
      }
      // Unknown events are ignored per the protocol's forward-compat guidance.
    });

    this.ws.on('unexpected-response', (_req, res) => {
      this.emit('error', new Error(`Fish Audio handshake failed: HTTP ${res.statusCode}`));
    });
    this.ws.on('error', (err) => this.emit('error', err));
    this.ws.on('close', () => {
      if (!this.finished) this.emit('finish', 'closed');
      this.finished = true;
    });
  }

  #send(msg, force = false) {
    if (!force && !this.ready) {
      this.pending.push(msg);
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encode(msg));
  }

  sendText(text) {
    // Trailing space keeps Fish from gluing words across chunks.
    this.#send({ event: 'text', text: text.endsWith(' ') ? text : `${text} ` });
  }

  flush() {
    this.#send({ event: 'flush' });
  }

  stop() {
    this.#send({ event: 'stop' });
  }

  close() {
    this.finished = true;
    try { this.ws?.close(); } catch { /* already closed */ }
  }
}
