import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { encode, decode } from '@msgpack/msgpack';
import { FishSession } from '../src/tts/fish.js';

test('FishSession speaks the Fish Audio msgpack protocol', async () => {
  const received = [];
  let headers;
  const wss = new WebSocketServer({ port: 0 });
  wss.on('connection', (ws, req) => {
    headers = req.headers;
    ws.on('message', (data) => {
      const msg = decode(data);
      received.push(msg);
      if (msg.event === 'text') ws.send(encode({ event: 'audio', audio: new Uint8Array([0xff, 0xfb, 1, 2]) }));
      if (msg.event === 'stop') {
        ws.send(encode({ event: 'finish', reason: 'stop' }));
        ws.close();
      }
    });
  });
  await new Promise((r) => wss.on('listening', r));

  const s = new FishSession({ apiKey: 'test-key', wsUrl: `ws://localhost:${wss.address().port}`, model: 's2.1-pro', latency: 'balanced', voiceId: 'voice-123' });
  const audio = [];
  s.on('audio', (b) => audio.push(b));
  const finished = new Promise((r) => s.on('finish', r));
  s.open();
  s.sendText('Hello there.'); // queued before the socket opens
  s.flush();
  s.stop();
  assert.equal(await finished, 'stop');
  wss.close();

  assert.equal(headers.authorization, 'Bearer test-key');
  assert.equal(headers.model, 's2.1-pro');
  assert.deepEqual(received.map((m) => m.event), ['start', 'text', 'flush', 'stop']);
  assert.equal(received[0].request.reference_id, 'voice-123');
  assert.equal(received[0].request.format, 'mp3');
  assert.equal(received[1].text, 'Hello there. ');
  assert.equal(audio.length, 1);
});
