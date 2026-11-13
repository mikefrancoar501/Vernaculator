/** Tiny MPEG-1/2 Layer III frame splitter (used by the mock TTS to emit whole frames). */
const BITRATES = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

export function splitFrames(buf) {
  const frames = [];
  let i = 0;
  if (buf.slice(0, 3).toString('latin1') === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    i = 10 + size;
  }
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const versionBits = (buf[i + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer = (buf[i + 1] >> 1) & 3; // 1 = Layer III
    const brIdx = buf[i + 2] >> 4;
    const srIdx = (buf[i + 2] >> 2) & 3;
    const pad = (buf[i + 2] >> 1) & 1;
    if (versionBits === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) { i++; continue; }
    const bitrate = BITRATES[versionBits === 3 ? 1 : 2][brIdx] * 1000;
    const sr = RATES[versionBits][srIdx];
    const len = Math.floor(((versionBits === 3 ? 144 : 72) * bitrate) / sr) + pad;
    if (len < 4 || i + len > buf.length) break;
    frames.push(buf.subarray(i, i + len));
    i += len;
  }
  return frames;
}

/** Seconds of audio per frame for the given buffer's first frame. */
export function frameDuration(buf) {
  const versionBits = (buf[1] >> 3) & 3;
  const sr = RATES[versionBits][(buf[2] >> 2) & 3];
  return (versionBits === 3 ? 1152 : 576) / sr;
}
