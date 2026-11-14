# Fancy Bot

**Fancy Bot** by Say It Fancy Productions ([getfancybot.com](https://getfancybot.com)). The code base and some internal names still say "Vernaculator" (the project's working name).

Fancy Bot is a Manifest V3 Chrome extension plus a Node middleware that reads AI chat replies (claude.ai, grok.com, gemini.google.com) aloud. Each reply is rewritten into a family-friendly character's vernacular by an LLM, voiced through Fish Audio's streaming TTS, and performed by an animated sprite in a draggable on-page widget.

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

## Big Sal's World: the core four and redemption

The Vernaculator is a social-emotional learning (SEL) tool for kids, and for adults too. Its characters live in Big Sal's town, a place where good values make a better city. Learning from the first nine episodes, **Big Sal, Old Oakley, Big Play Ray and Elias Stillwater** are the core four: they are the default cast for both the town panel and the writers' room, and together they fill every beat (Ray sets up, Elias overthinks, Oakley takes the left turn, Sal lands it).

**Rusty Peters** is a sample character with a redemption arc (`"arc": "redemption"` in personas.json): a gruff former troublemaker who is learning to be good. His lines may start with a grumble or an old (always harmless) instinct, but he talks himself into the kind or honest choice and finds it more fun. When he is in a scene, the director makes sure his last line lands on the good side. Every scene also models kindness, honesty and fairness, even while characters tease each other's ideas.

**Dash Dawson** is the town genius who has no idea he is a genius: a regular guy who fixes bikes at Big Sal's and explains things in rapid-fire chains of reasoning, then shrugs it off. His voice runs at 1.7x, roughly 250-270 words per minute (`"voiceSpeed"` in personas.json; Rusty Peters talks fast too, at 1.2x). Set `VOICE_SPEED_<ID>` (for example `VOICE_SPEED_DASH_DAWSON=1.9`) to tune a character's pace without a code change; Fish caps speed at 2.0. Any character can borrow the delivery with the **Rapid-fire genius** speaking style (1.5x). The reading level slider controls how deep he goes: simple words and everyday examples at level 1 for kids, named mechanisms and landmark findings at level 5 for PhDs. The prompt forbids invented studies or quotes. A pacing reference clip may be used only to tune the speaking rate, never to copy anyone's voice.

## Big Sal and the plain-language controls

The point of the product: AI answers (medical, legal, technical) are often full of jargon. The Vernaculator lets anyone hear the same answer in a voice and at a level that works for them.

- **Big Sal** is the flagship and default character: a warm, wise, seriously smart old friend who cuts through jargon. He has his own bundled two-frame sprite (`extension/assets/sprites/big_sal_*.svg`), and intent routing sends "explain what my doctor meant" style questions to him when the character is set to *Auto*.
- **Reading level slider (1-5)**, from *Super simple* to *Expert*, works with **any** character. Default is 2 (*Plain*). It is always framed as reading level / plain language, never intelligence.
- **Add-ons that stack on any character:** Humor, Philosophy, and a Speaking style (Character's own, Slow & patient, British English, Old-time storyteller, Hype announcer, Rapid-fire genius, Friendly pirate). *Slow & patient* also slows the TTS voice (Fish `prosody.speed` 0.85). Styles describe delivery, never race or region.
- **Accuracy rule at every level:** simplify the words, never the facts. Numbers, doses, dates, warnings and "see a doctor / call emergency services" advice are kept exactly, and the rewrite may not add medical, legal or financial advice.

Levels and styles live in `server/src/styles.js` and are served to the HUD with the persona list, so adding a style is a server-only change. The extension sends them as `utterance.start { readingLevel: 1-5, style: { humor, philosophy, accent } }`; the server validates them against the catalog and echoes what it applied in `utterance.persona`.

## Paraphrase assistant, profile and language

- **Paraphrase** (chip on the Listen tab) condenses the answer while keeping every fact, number and warning, with any character and reading level. If the user gave a name, the character talks to them and treats the AI as a third party: "Sergio, basically what Claude is telling you is...".
- **Ask tab:** Key points, Paraphrase now, *Paraphrase with Oakley*, a follow-up question about the last answer, and **Expound** (the server researches with Claude's web search tool and the HUD lists the sources).
- **Profile** (options page, stored only in the browser): name, a free-text "about me" (profession, skills, education), age group (kid, teen, adult, senior). It is sent per request to tailor examples and level; nothing is stored on the server.
- **Language** defaults to the browser language and can be overridden. The UI uses `chrome.i18n` (`extension/_locales/en` and `es` today); the LLM answers in that language, and Fish voices can be set per language (`fishAudioVoicesByLanguage` in personas.json or `FISH_VOICE_<ID>_<LANG>`).
- **Old Oakley** is a spirit-guide narrator with an authoritative, poetic voice and his own sprite. He is built for paraphrasing and still follows the accuracy rule.

## Gestures, Grok companion and the mini-assistant

- The HUD starts compact (size S). Drag only by the header, so gestures on the character never fight with dragging.
- **Long-press the character:** menu with size S/M/L or a custom scale, quick character switch, Paraphrase, mute and settings.
- **Double-tap:** a small voice/text assistant ("switch to Old Oakley", "who would explain this like a coach?", "slower please"). Simple commands are handled by rules; anything else goes to `POST /v1/assistant`. It waits 320 ms so a triple-tap still counts as a tickle.
- **Triple-tap or rub:** tickle and giggle, as before.
- **On grok.com** the HUD can hide Grok's animated companion and sit in its place (option "Replace Grok's companion", on by default). The companion selector in `platforms.js` is a best guess and needs checking on the live site.

## Town panel

Turn on *Town* in the HUD and pick 2 to 6 characters. They sit in a strip along the top of the screen (scrolls sideways on phones, respects the notch). The server splits the answer by paragraphs, gives each part to the member whose interests fit it best (`server/src/town.js`), and each member speaks their part in their own voice with a short handoff to the next. The speaking member is highlighted and their mouth moves; tap a member to make them your main character.

## Social media crib notes (X, Facebook, Instagram)

On x.com, facebook.com and instagram.com the extension does not watch for AI replies. Instead:

- Hover or tap a post and a **🎭 Crib notes** pill appears on it. Tap it and the character sums the post up in 2 or 3 witty lines (under 280 characters, key facts kept, jokes about ideas never about the person, and no jokes on serious topics). The HUD's **Post** tab (it replaces Ask on these sites) also has *Crib notes* for the post on screen.
- **Comedic voice** defaults to Big Play Ray and can be any character (or "same as my character").
- **💬 Draft reply** writes a short reply in that voice, optionally following "your angle".
- Then **📋 Copy text**, **🎬 Make video** (the same MP4 export, with the character's voice and moving mouth) or **↩ Open reply box**, which copies the text and clicks the site's own reply button.
- **Nothing is ever posted or typed for the user.** They paste the text, attach the video and press post themselves, which keeps the extension within the platforms' automation rules.

### Writers' room scenes and What's hot

- **🎬 Writers' room scene** (Post tab): pick a cast of 2 to 4 characters and a director (Big Sal by default). Each cast member fills a role slot and pitches one line in their own voice, all in parallel: the **Realist** sets up the premise, the **Overthinker** escalates a tiny detail, the **Free spirit** offers a left-field fix, and the **Straight shooter** lands the clean summary line. The director pass then picks and edits the pitches into a 4 to 8 line mini-scene in that beat order. Each line is voiced by its own character, the cast sits in the strip along the top with the speaker highlighted, and **Make video** renders a multi-character MP4 (cast row, speaker in the middle, each line captioned under its speaker).
- Preferred slots live in personas.json (`writersRoomRole`); any character can fill any slot. The humor is observational and original: prompts forbid imitating existing shows or comedians, profanity, and jokes about the poster, and serious posts get a kind, joke-free scene. Code: `server/src/writersroom.js`.
- Every cast member gets a line: pitches that fail (usually the AI provider's rate limit after several scenes in a row) are retried one at a time, the director call is retried once, and anyone the director leaves out gets their pitch slotted in before the closing line. If someone still can't speak, the server sends `scene.notice` and the widget says who sat out and why, instead of quietly playing a smaller scene. Failures are logged in the server window.
- **🔥 What's hot on this page** (optional, off by default) ranks only the posts already loaded on the page you are viewing, by the reach shown on them (likes, reposts, replies, views) and by topics they share with the other visible posts. Tap one to scroll to it and make it the target. It never fetches other posts or looks up accounts or follower counts. A real trend feed can be plugged in later.
- **Rate limit:** crib notes, replies and scenes are limited per user (`SOCIAL_RATE_PER_MIN`, default 6, and `SOCIAL_RATE_PER_DAY`, default 120) on top of the monthly quota, so the tool stays a personal helper and never a bulk-reply engine. There is still no auto-posting, auto-typing or scheduled replying.

Server side these are the `crib`, `reply` and `scene` tasks (`server/src/tasks.js`) with sources `x`, `facebook` and `instagram`; the prompt treats the text as a real person's post, not an AI answer. Post selectors in `platforms.js` are placeholders to verify on the live sites.

## Voice library and the character picker

Besides Big Sal's World and the Comics, Fancy Bot ships 50 voice-library characters: Southern and Texas, British, Irish, Scottish, Australian, New York, Canadian and other accents, plus narrators, announcers and radio voices, grandparents and kids, and fun or spooky voices (robot, vampire, witch, wizard, noir detective...). Each one is an original character name with an accent label, shown as "Tex Calloway (Texas cowboy)".

- **Picking:** under the Character dropdown, a **category** dropdown (All, Big Sal's World, Comics, Accents → Southern, British..., Narrators, Announcers & radio, Grandparents & kids, Fun & spooky) narrows the list, and the **search box** filters as you type by name, accent, role and tags ("southern", "brit", "pirate", "texas cowboy"; every word has to match the start of a word). Matches show as chips: tap one, or press Enter for the first. Spanish searches work too ("vaquero", "pirata", "abuela") through `pickerSynonyms` in `_locales/es`. The picker only changes the one `personaId` setting, the same one the Character dropdown always used.
- **Preview:** ▶ Preview plays the voice's demo clip from Fish Audio. The server looks the clip up through Fish's public model API and proxies it (`GET /v1/personas/<id>/preview`, token required), so it needs no key and uses no quota. Voices without a public clip (the original cast's private voices) speak their short `previewLine` with Fish TTS instead, a few dozen characters of quota and cached per voice. In test mode (no Fish key) those answer "needs the real voices" instead of playing placeholder beeps. Max 20 previews per minute per user; `PREVIEW_SAMPLES=0` turns the Fish clip lookup off.
- **Cast lists stay short:** the writers' room, town and crib-voice pickers list the original cast plus whoever you have picked, so the library doesn't bury them.
- **Data:** in `shared/personas.json` (schema v2) each library character has `category`, `accent`, `tags`, `fishAudioReferenceId`, `previewLine` and a `voice` block (Fish title, author, whether it is a Fish Official voice, model page). They have no `intentKeywords`, so Auto never picks them: they speak only when you choose them. `categories` and `categoryGroups` at the top drive the dropdown. To add a voice: find it on fish.audio, copy its id into a new entry with a category from the list, and run `npm test` (the loader rejects unknown categories). `FISH_VOICE_<ID>` still overrides any voice.
- **Voice sources:** 42 are Fish Audio's own "Fish Official" voices; 8 are community voices with original, non-celebrity descriptions (cowboy, auctioneer, Scottish grandpa, sportscaster, 1950s announcer, robot, noir detective, wizard). None is titled or described as a real person or a known character; for community voices the training audio isn't published, so listen before shipping one widely.

## Repository layout

| Path | What it is |
|---|---|
| `shared/personas.json` | Character definitions (cleaned schema: Big Sal, the core four, Rusty Peters and sample characters). Sprites can be https URLs or `assets/...` paths bundled in the extension. Served to the extension without prompts. |
| `shared/core-values.json` | The "15 core values" injected into every prompt. **Placeholder list, replace with yours.** |
| `server/` | Middleware: HTTP + WebSocket server, store, LLM + TTS providers, tests. |
| `extension/` | Unpacked MV3 extension: content scripts, service worker, options page, assets, e2e test. |

## One-click setup on Windows

`scripts/fancybot-setup.bat` (with `fancybot-setup.ps1` next to it) does everything for local testing: it clones or updates the code into `Documents\FancyBot\code` (Git for Windows asks you to sign in to GitHub the first time; without Git it uses a `Vernaculator*.zip` from GitHub's Code > Download ZIP in Downloads), checks Node.js 22+, runs `npm install`, creates a token once and saves it in `Documents\FancyBot\token.txt` (copied to the clipboard), opens `chrome://extensions` and the extension folder, and starts the server in mock mode. The server data lives in `Documents\FancyBot\data`, so updates never lose the token. Double-click it again any time to update and restart. To use real services, double-click `scripts/fancybot-keys.bat` first: it asks for the Anthropic API key, the Fish Audio API key and voice IDs (typed hidden) and saves them in `Documents\\FancyBot\\keys.env`, which the setup script loads on every start.

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

Client → server JSON: `auth {token}`, `utterance.start {seq, personaId|'auto', readingLevel?: 1-5, style?: {paraphrase, humor, philosophy, accent}, task?: speak|keypoints|ask|expound|crib|reply|scene, question?, profile?: {name, about, ageGroup, language}, source?: claude|grok|gemini|x|facebook|instagram, town?: [personaIds] (scene cast for `scene`), director?: personaId, text?, final?}`, `utterance.text {seq, text}`, `utterance.end {seq}`, `utterance.cancel {seq}`.
Server → client JSON: `auth.ok`, `utterance.persona`, `utterance.status`, `utterance.segment`, `town.plan`, `scene.cast`, `utterance.caption` (with `speaker` in scenes), `utterance.sources`, `utterance.done {text, script?, usage}`, `utterance.cancelled`, `error {code}`.
Server → client binary: `[uint32 big-endian seq][MP3 bytes]`.

REST: `GET /health`, `GET /v1/personas` (public), `GET /v1/usage` and `POST /v1/transform` (Bearer token; text-only style transfer with task/style/profile, useful for tuning personas), `POST /v1/assistant` (Bearer token; the double-tap assistant).

## Design notes worth knowing

- **The WebSocket lives in the service worker, not the content script.** A content script's requests count as the host page's, and Chrome's Local Network Access checks blocked `claude.ai → localhost` outright in testing. Relaying through the extension's own context avoids that and any page network policy. Audio crosses the Port as base64 (about 33% overhead, negligible at 128 kbps).
- **Web Audio needs a user gesture.** Until the first click or keypress on the page, audio plays straight from the `<audio>` element and the sprite flaps on a timer; after that it is driven by real amplitude.
- **Site selectors will drift.** Everything site-specific is in `platforms.js`. The HUD's ❝ button (read selection, or the last reply) works on any of the three sites even when selectors break.
- **Personas.json cleanup:** the spec's `visemeAssets` URLs were Markdown links (`[url](url)`); they are plain URLs now and the loader rejects Markdown-looking URLs. The sample `cdn.example.com` sprites don't exist, so the HUD falls back to the bundled blob character, tinted per persona.

## Testing

```bash
cd server && npm test                      # 27 unit/integration tests (mock providers, fake Fish server)

# Extension end to end (real Chromium, unpacked extension, fake claude.ai page):
npm start &                                # in server/, mock mode
node extension/test/e2e.cjs <token> /tmp/vern-e2e

# Character picker search and categories (no browser):
node --test extension/test/picker.test.cjs
```

The e2e test checks HUD injection, dragging and persistence, auto-read of a streamed reply (intent routing, captions, MediaSource playback), amplitude-driven sprite swaps, tickle → giggle without interrupting TTS, MP4 export, read-selection, and a Big Sal run at reading level 1 with humor and the slow style (sprite, mouth movement, server-applied settings, MP4 export), paraphrase with a name and profile, Old Oakley, key points, ask, expound with sources, long-press menu and sizes, double-tap assistant without triggering a tickle, triple-tap tickle, assistant-driven character switch, a three-member town panel with handoffs, and on a fake X timeline: the Crib notes pill, crib notes in Big Play Ray's voice, a reply draft, Open reply box (copies, never types), the reply video, the What's hot ranking, and a four-character writers' room scene with its video.

## Open decisions (need the product owner)

1. **LLM provider and model.** Wired for Anthropic; default `claude-opus-5-5` at low effort. The spec asks for "fast, low-cost": `claude-haiku-5-5` is a one-line env change, and the provider interface in `llm.js` takes another vendor easily.
2. **Database.** MVP uses a JSON file (`store.js`). For multiple server instances, swap in Postgres (users/tokens) + Redis (usage counters); the interface is four methods.
3. **Hosting.** Any Node 22 host with WebSocket support (Fly.io, Render, Railway, a VM, Cloud Run). Put it behind TLS and set `backendUrl` to `https://...`; the options page requests the host permission.
4. **User accounts and billing.** Tokens are minted with a CLI today. A real sign-up flow (and how plans map to quotas) is still open.
5. **The 15 core values** (`shared/core-values.json` is a placeholder) and the **real character roster** ("over a hundred"), voices (Fish reference IDs, starting with Big Sal's) and final sprite art.
6. **Meme branding** (watermark, aspect ratio for each platform).
7. **Grok companion selector and live-site checks.** All sites (including X, Facebook, Instagram) were tested against a fake page only; the selectors in `platforms.js` need a pass on the real sites.
8. **More UI languages** beyond English and Spanish (add a folder under `extension/_locales/`).
