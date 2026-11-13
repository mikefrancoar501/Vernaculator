// One-click meme exporter (spec 5.3): re-renders the last utterance's audio with the
// two-state viseme sprites onto a canvas and records it to an MP4 (WebM fallback).
(() => {
  const SIZE = 720;
  const FPS = 30;
  const MIME_CANDIDATES = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,opus',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm',
  ];

  function pickMime() {
    return MIME_CANDIDATES.find((m) => window.MediaRecorder?.isTypeSupported(m)) || '';
  }

  /** Load an image as an untainted ImageBitmap (fetching bytes keeps the canvas exportable). */
  async function loadBitmap(url, fallbackUrl) {
    for (const u of [url, fallbackUrl]) {
      if (!u) continue;
      try {
        const res = await fetch(u, { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await createImageBitmap(await res.blob());
      } catch {
        // SVGs can't go through createImageBitmap(blob) in every Chrome; decode via <img> from a blob URL.
        try {
          const res = await fetch(u);
          const blobUrl = URL.createObjectURL(await res.blob());
          const img = new Image();
          img.src = blobUrl;
          await img.decode();
          const bmp = await createImageBitmap(img);
          URL.revokeObjectURL(blobUrl);
          return bmp;
        } catch { /* try fallback */ }
      }
    }
    throw new Error('Could not load character sprites for export');
  }

  function wrapLines(ctx, text, maxWidth, maxLines) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines.slice(0, maxLines);
  }

  /**
   * @param {{chunks: Uint8Array[], text: string, persona: {name: string}, sprites: {idle, talking, fallbackIdle, fallbackTalking}, hue?: number}} session
   * @param {(fraction: number) => void} onProgress
   * @returns {Promise<{blob: Blob, ext: string}>}
   */
  async function exportMeme(session, onProgress = () => {}) {
    if (!session?.chunks?.length) throw new Error('Nothing to export yet: play a reply first.');
    const mimeType = pickMime();
    if (!mimeType) throw new Error('This browser cannot record video.');

    const ctx = new AudioContext();
    const mp3 = new Blob(session.chunks, { type: 'audio/mpeg' });
    const audioBuf = await ctx.decodeAudioData(await mp3.arrayBuffer());
    const [idle, talking] = await Promise.all([
      loadBitmap(session.sprites.idle, session.sprites.fallbackIdle),
      loadBitmap(session.sprites.talking, session.sprites.fallbackTalking),
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const g = canvas.getContext('2d');

    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const levelBuf = new Uint8Array(analyser.fftSize);
    const dest = ctx.createMediaStreamDestination();
    src.connect(analyser);
    analyser.connect(dest);

    const stream = new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
    const parts = [];
    recorder.ondataavailable = (e) => e.data.size && parts.push(e.data);
    const stopped = new Promise((r) => (recorder.onstop = r));

    const mouth = new Vern.MouthState();
    const duration = audioBuf.duration;
    g.font = '500 24px system-ui, sans-serif';
    const lines = wrapLines(g, session.text || '', SIZE - 96, Infinity);
    const VISIBLE = 4;

    const draw = (elapsed) => {
      analyser.getByteTimeDomainData(levelBuf);
      let sum = 0;
      for (const v of levelBuf) sum += ((v - 128) / 128) ** 2;
      const open = mouth.update(Math.sqrt(sum / levelBuf.length), performance.now());

      const bg = g.createLinearGradient(0, 0, SIZE, SIZE);
      bg.addColorStop(0, '#2a1b6e');
      bg.addColorStop(1, '#ff6fa8');
      g.fillStyle = bg;
      g.fillRect(0, 0, SIZE, SIZE);

      const sprite = open ? talking : idle;
      const s = 380;
      const bob = open ? -6 : 0;
      g.save();
      if (session.hue) g.filter = `hue-rotate(${session.hue}deg)`;
      g.drawImage(sprite, (SIZE - s) / 2, 70 + bob, s, s * (sprite.height / sprite.width));
      g.restore();

      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(24, SIZE - 210, SIZE - 48, 186);
      g.fillStyle = '#fff';
      g.font = '700 26px system-ui, sans-serif';
      g.fillText(session.persona?.name || 'The Vernaculator', 48, SIZE - 172);
      g.font = '500 24px system-ui, sans-serif';
      // Scroll the caption with playback so long replies stay readable.
      const first = Math.max(0, Math.min(lines.length - VISIBLE, Math.floor((elapsed / duration) * lines.length) - 1));
      lines.slice(first, first + VISIBLE).forEach((l, i) => g.fillText(l, 48, SIZE - 132 + i * 30));

      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillRect(24, SIZE - 14, (SIZE - 48) * Math.min(1, elapsed / duration), 4);
    };

    draw(0);
    recorder.start(250);
    const t0 = ctx.currentTime;
    src.start();
    await new Promise((resolve) => {
      src.onended = resolve;
      const tick = () => {
        const elapsed = ctx.currentTime - t0;
        draw(elapsed);
        onProgress(Math.min(1, elapsed / duration));
        if (elapsed < duration + 0.2) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await new Promise((r) => setTimeout(r, 300)); // let the last frames flush
    recorder.stop();
    await stopped;
    ctx.close();
    onProgress(1);

    const type = mimeType.split(';')[0];
    return { blob: new Blob(parts, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm' };
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  Vern.exportMeme = exportMeme;
  Vern.downloadBlob = download;
  Vern.pickVideoMime = pickMime;
})();
