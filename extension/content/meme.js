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
   * @param {{chunks: Uint8Array[], text: string, persona: {name: string}, sprites: {idle, talking, fallbackIdle, fallbackTalking}, hue?: number,
   *          segments?: {startByte: number, persona: {id, name}, sprites: {idle, talking, hue}, line?: string}[]}} session
   *   segments: town panel / writers' room speakers. The video switches to each speaker at their
   *   point in the audio, shows the cast along the top, and captions each line under its speaker.
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

    // Multi-character: one bitmap pair per cast member, start times from byte offsets (CBR MP3).
    const totalBytes = session.chunks.reduce((n, c) => n + c.length, 0);
    const segs = [];
    const castArt = new Map();
    for (const seg of session.segments || []) {
      const id = seg.persona?.id;
      if (!id) continue;
      if (!castArt.has(id)) {
        castArt.set(id, Promise.all([
          loadBitmap(seg.sprites?.idle, session.sprites.fallbackIdle),
          loadBitmap(seg.sprites?.talking, session.sprites.fallbackTalking),
        ]).then(([i, t]) => ({ idle: i, talking: t, hue: seg.sprites?.hue || 0, name: seg.persona.name })));
      }
      segs.push({ id, start: (seg.startByte / totalBytes) * audioBuf.duration, line: seg.line || '' });
    }
    for (const [id, p] of castArt) castArt.set(id, await p);

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

      let seg = null;
      for (const x of segs) if (x.start <= elapsed + 0.05) seg = x;
      seg ||= segs[0];
      const art = seg ? castArt.get(seg.id) : { idle, talking, hue: session.hue, name: session.persona?.name };

      // Cast row along the top (town strip look); the speaker gets a ring.
      if (castArt.size > 1) {
        const ids = [...castArt.keys()];
        const d = 64;
        const gap = 18;
        const x0 = (SIZE - (ids.length * d + (ids.length - 1) * gap)) / 2;
        ids.forEach((id, i) => {
          const a = castArt.get(id);
          const cx = x0 + i * (d + gap);
          g.fillStyle = id === seg?.id ? '#fff' : 'rgba(255,255,255,.25)';
          g.beginPath();
          g.arc(cx + d / 2, 20 + d / 2, d / 2 + 4, 0, Math.PI * 2);
          g.fill();
          g.save();
          if (a.hue) g.filter = `hue-rotate(${a.hue}deg)`;
          const img = id === seg?.id && open ? a.talking : a.idle;
          g.drawImage(img, cx + 4, 24, d - 8, (d - 8) * (img.height / img.width));
          g.restore();
        });
      }

      const sprite = open ? art.talking : art.idle;
      const s = castArt.size > 1 ? 320 : 380;
      const top = castArt.size > 1 ? 104 : 70;
      const bob = open ? -6 : 0;
      g.save();
      if (art.hue) g.filter = `hue-rotate(${art.hue}deg)`;
      g.drawImage(sprite, (SIZE - s) / 2, top + bob, s, s * (sprite.height / sprite.width));
      g.restore();

      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(24, SIZE - 210, SIZE - 48, 186);
      g.fillStyle = '#fff';
      g.font = '700 26px system-ui, sans-serif';
      g.fillText(art.name || 'The Vernaculator', 48, SIZE - 172);
      g.font = '500 24px system-ui, sans-serif';
      if (seg?.line) {
        // Writers' room: show the current speaker's own line.
        wrapLines(g, seg.line, SIZE - 96, VISIBLE).forEach((l, i) => g.fillText(l, 48, SIZE - 132 + i * 30));
      } else {
        // Scroll the caption with playback so long replies stay readable.
        const first = Math.max(0, Math.min(lines.length - VISIBLE, Math.floor((elapsed / duration) * lines.length) - 1));
        lines.slice(first, first + VISIBLE).forEach((l, i) => g.fillText(l, 48, SIZE - 132 + i * 30));
      }

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
