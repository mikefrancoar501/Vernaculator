# The Vernaculator

A Manifest V3 Chrome extension plus a Node middleware that reads AI chat replies (claude.ai, grok.com, gemini.google.com) aloud. Each reply is rewritten into a family-friendly character's vernacular by an LLM, voiced through Fish Audio's streaming TTS, and performed by an animated sprite in a draggable on-page widget.

```
 host page (claude.ai / grok / gemini)
 ┌──────────────────────────────────────────┐
 │ content scripts                           │        service worker            middleware (Node)                 Fish Audio
 │  MutationObserver ─ sentence chunks ──────┼─Port──► WebSocket relay ──WS──►  auth + quota gateway
 │  Shadow-DOM HUD  ◄─ captions / persona ───┼◄─────── (extension origin) ◄───  intent routing ─► persona prompt
 │  MediaSource <audio> ◄─ MP3 chunks ───────┼◄────────────────────────────────  LLM style transfer (streamed)
 │  AnalyserNode ─► idle/talking sprite      │                                    sentence split ─► guardrails ─WS─►  TTS live
 │  tickle ─► giggle.mp3 (Web Audio)         │                                    binary audio  ◄──────────────────  (msgpack)
 │  meme exporter ─► canvas + audio ─► MP4   │
 └──────────────────────────────────────────┘
```

## Big Sal and the plain-language controls

The point of the product: AI answers (medical, legal, technical) are often full of jargon. The Vernaculator lets anyone hear the same answer in a voice and at a level that works for them.

- **Big Sal** is the flagship and default character: a warm, wise, seriously smart old friend who cuts through jargon. He has his own bundled two-frame sprite (`extension/assets/sprites/big_sal_*.svg`), and intent routing sends "explain what my doctor meant" style questions to him when the character is set to *Auto*.
- **Reading level slider (1-5)**, from *Super simple* to *Expert*, works with **any** character. Default is 2 (*Plain*). It is always framed as reading level / plain language, never intelligence.
- **Add-ons that stack on any character:** Humor, Philosophy, and a Speaking style (Character's own, Slow & patient, British English, Old-time storyteller, Hype announcer, Friendly pirate). *Slow & patient* also slows the TTS voice (Fish `prosody.speed` 0.85). Styles describe delivery, never race or region.
- **Accuracy rule at every level:** simplify the words, never the facts. Numbers, doses, dates, warnings and "see a doctor / call emergency services" advice are kept exactly, and the rewrite may not add medical, legal or financial advice.

Levels and styles live in `server/src/styles.js` and are served to the HUD with the persona list, so adding a style is a server-only change. The extension sends them as `utterance.start { readingLevel: 1-5, style: { humor, philosophy, accent } }`; the server validates them against the catalog and echoes what it applied in `utterance.persona`.

## Repository layout

| Path | What it is |
|---|---|
| `shared/personas.json` | Character definitions (cleaned schema, Big Sal + 6 sample characters). Sprites can be https URLs or `assets/...` paths bundled in the extension. Served to the extension without prompts. |
| `shared/core-values.json` | The "15 core values" injected into every prompt. **Placeholder list, replace with yours.** |
| `server/` | Middleware: HTTP + WebSocket server, store, LLM + TTS providers, tests. |
| `extension/` | Unpacked MV3 extension: content scripts, service worker, options page, assets, e2e test. |

## Quick start (no API keys needed)

Both providers default to `mock`: the mock LLM prefixes the persona's name, and the mock TTS streams a bundled "babble" MP3 so the whole pipeline, HUD animation, and meme export work offline.

```bash
cd server
npm install
cp .env.example .env            # optional; defaults are mock/mock on port 8787
npm start
npm run token:create -- --plan pro   # prints a vk_... token (works while the server runs)
```

Then in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → pick `extension/`. The options page opens; enter `http://localhost:8787` and the token. Open claude.ai, ask something, and the reply is read aloud.

### Going live

In `server/.env`:

```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL=claude-opus-5-5      # default; set claude-haiku-5-5 for the spec's "fast, low-cost" tier
LLM_EFFORT=low
TTS_PROVIDER=fish
FISH_API_KEY=...
FISH_DEFAULT_VOICE_ID=<voice uuid>     # or per persona: FISH_VOICE_BIG_PLAY_RAY=<uuid>
```

Requests to `claude-opus-5-5` enable server-side refusal fallbacks (`fallbacks: "default"`), so if the model declines a passage the API retries it on a fallback model instead of going silent. If the whole chain still declines, the pipeline speaks the sanitized original text and the HUD shows a notice.

## How each spec section maps to code

| Spec | Implementation |
|---|---|
| 2.1 DOM interception | `extension/content/platforms.js` (per-site selectors + streaming detection), `observer.js` (MutationObserver, history skipping, sentence-level chunks while streaming, end-of-message on stability) |
| 2.2 Floating widget | `hud.js`: closed Shadow DOM, character dropdown (incl. *Auto*), reading-level slider, humor/philosophy chips, speaking style, auto-read toggle, play/pause/replay/stop, read-selection |
| 2.2 Amplitude sync | `player.js` AnalyserNode RMS → `viseme.js` hysteresis; rAF loop runs only while audio plays and touches the DOM only on state change |
| 2.3 Playback | `player.js`: MediaSource + `audio/mpeg` SourceBuffer in `sequence` mode; Blob fallback if MSE is unavailable |
| 3.1 Auth & metering | `server/src/auth.js`, `store.js`: sha256-hashed tokens, monthly character quotas per plan, checked before each chunk, recorded per spoken sentence |
| 3.2 Style transfer | `personas.js` builds the prompt, `llm.js` streams it; `pipeline.js` splits the stream into sentences and pipes them to TTS as they arrive |
| 3.2 Guardrails | Prompt rules + `guardrails.js` deterministic post-filter on every sentence before TTS |
| 3.2 Intent routing | `intent.js`: keyword scoring; `INTENT_MODE=llm` adds an LLM classifier (structured output) for ties |
| 3.3 Perspective simulator | `worldviewPerspective`, `vocabularyComplexity` (1-5) and `catchphrases` in personas.json; the listener's reading level and add-ons (`styles.js`) layer on top of any character |
| 3.4 Fish proxy | `server/src/tts/fish.js`: `wss://api.fish.audio/v1/tts/live`, msgpack `start/text/flush/stop` → `audio/finish` |
| 5.1 Dragging | Pointer events + `setPointerCapture`, `transform: translate(x,y)`, clamped to the viewport, position persisted |
| 5.2 Tickle | `tickle.js`: 3 taps in 900 ms or a fast back-and-forth rub; giggle is decoded once and mixed through Web Audio, so TTS keeps playing |
| 5.3 Meme export | `meme.js`: re-renders the last reply's audio + viseme swaps onto a 720×720 canvas, records with MediaRecorder (H.264 MP4 on Chrome 126+, WebM fallback), downloads |

### Wire protocol (`/v1/stream`)

Client → server JSON: `auth {token}`, `utterance.start {seq, personaId|'auto', readingLevel?: 1-5, style?: {humor, philosophy, accent}, text?, final?}`, `utterance.text {seq, text}`, `utterance.end {seq}`, `utterance.cancel {seq}`.
Server → client JSON: `auth.ok`, `utterance.persona`, `utterance.caption`, `utterance.done {text, usage}`, `utterance.cancelled`, `error {code}`.
Server → client binary: `[uint32 big-endian seq][MP3 bytes]`.

REST: `GET /health`, `GET /v1/personas` (public), `GET /v1/usage` and `POST /v1/transform` (Bearer token; text-only style transfer, useful for tuning personas).

## Design notes worth knowing

- **The WebSocket lives in the service worker, not the content script.** A content script's requests count as the host page's, and Chrome's Local Network Access checks blocked `claude.ai → localhost` outright in testing. Relaying through the extension's own context avoids that and any page network policy. Audio crosses the Port as base64 (about 33% overhead, negligible at 128 kbps).
- **Web Audio needs a user gesture.** Until the first click or keypress on the page, audio plays straight from the `<audio>` element and the sprite flaps on a timer; after that it is driven by real amplitude.
- **Site selectors will drift.** Everything site-specific is in `platforms.js`. The HUD's ❝ button (read selection, or the last reply) works on any of the three sites even when selectors break.
- **Personas.json cleanup:** the spec's `visemeAssets` URLs were Markdown links (`[url](url)`); they are plain URLs now and the loader rejects Markdown-looking URLs. The sample `cdn.example.com` sprites don't exist, so the HUD falls back to the bundled blob character, tinted per persona.

## Testing

```bash
cd server && npm test                      # 13 unit/integration tests (mock providers, fake Fish server)

# Extension end to end (real Chromium, unpacked extension, fake claude.ai page):
npm start &                                # in server/, mock mode
node extension/test/e2e.cjs <token> /tmp/vern-e2e
```

The e2e test checks HUD injection, dragging and persistence, auto-read of a streamed reply (intent routing, captions, MediaSource playback), amplitude-driven sprite swaps, tickle → giggle without interrupting TTS, MP4 export, read-selection, and a Big Sal run at reading level 1 with humor and the slow style (sprite, mouth movement, server-applied settings, MP4 export).

## Open decisions (need the product owner)

1. **LLM provider and model.** Wired for Anthropic; default `claude-opus-5-5` at low effort. The spec asks for "fast, low-cost": `claude-haiku-5-5` is a one-line env change, and the provider interface in `llm.js` takes another vendor easily.
2. **Database.** MVP uses a JSON file (`store.js`). For multiple server instances, swap in Postgres (users/tokens) + Redis (usage counters); the interface is four methods.
3. **Hosting.** Any Node 22 host with WebSocket support (Fly.io, Render, Railway, a VM, Cloud Run). Put it behind TLS and set `backendUrl` to `https://...`; the options page requests the host permission.
4. **User accounts and billing.** Tokens are minted with a CLI today. A real sign-up flow (and how plans map to quotas) is still open.
5. **The 15 core values** (`shared/core-values.json` is a placeholder) and the **real character roster** ("over a hundred"), voices (Fish reference IDs, starting with Big Sal's) and final sprite art.
6. **Meme branding** (watermark, aspect ratio for each platform).
