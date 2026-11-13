import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { ROOT } from '../config.js';
import { splitFrames, frameDuration } from './mp3.js';

let FRAMES = null;
let FRAME_SEC = 0.026;
function frames() {
  if (!FRAMES) {
    const buf = fs.readFileSync(path.join(ROOT, 'assets', 'mock-babble.mp3'));
    FRAMES = splitFrames(buf);
    FRAME_SEC = frameDuration(FRAMES[0]);
  }
  return FRAMES;
}

const SEC_PER_CHAR = 0.065; // ~15 characters per second of speech

/**
 * Mock TTS session with the same interface as FishSession. Streams a looped
 * "babble" MP3 whose length is proportional to the text, so the HUD sprite
 * animates and the MediaSource path is exercised without a Fish Audio key.
 */
export class MockSession extends EventEmitter {
  constructor({ realtime = true } = {}) {
    super();
    this.cursor = 0;
    this.queue = Promise.resolve();
    this.closed = false;
    this.realtime = realtime;
  }

  open() {
    frames();
    queueMicrotask(() => this.emit('open'));
  }

  sendText(text) {
    const n = Math.max(4, Math.round((text.length * SEC_PER_CHAR) / FRAME_SEC));
    this.queue = this.queue.then(() => this.#emitFrames(n));
  }

  async #emitFrames(n) {
    const all = frames();
    const batch = 10; // ~260ms of audio per message
    for (let sent = 0; sent < n && !this.closed; sent += batch) {
      const chunk = [];
      for (let k = 0; k < Math.min(batch, n - sent); k++) {
        chunk.push(all[this.cursor]);
        this.cursor = (this.cursor + 1) % all.length;
      }
      this.emit('audio', Buffer.concat(chunk));
      // Generate a bit faster than realtime, like a real streaming TTS.
      if (this.realtime) await new Promise((r) => setTimeout(r, chunk.length * FRAME_SEC * 400));
    }
  }

  flush() {}

  stop() {
    this.queue = this.queue.then(() => {
      if (!this.closed) this.emit('finish', 'stop');
      this.closed = true;
    });
  }

  close() {
    this.closed = true;
  }
}
