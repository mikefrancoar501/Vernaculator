// Floating control widget (spec 2.2 / 5.1): Shadow-DOM isolated, draggable with pointer
// events (mouse + touch), positioned with transform: translate(x, y), collapsible.
(() => {
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .card {
      --bg: #ffffff; --fg: #1d1b26; --muted: #6c6880; --line: #e4e1ee; --accent: #6b4eff; --accent-fg: #fff; --chip: #f3f1fa;
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg); background: var(--bg);
      width: 300px; border: 1px solid var(--line); border-radius: 16px; overflow: hidden;
      box-shadow: 0 12px 32px rgba(20, 10, 60, .18), 0 2px 6px rgba(20, 10, 60, .08);
      user-select: none; -webkit-user-select: none;
    }
    @media (prefers-color-scheme: dark) {
      .card { --bg: #1e1c27; --fg: #f1effa; --muted: #a29eb8; --line: #34313f; --accent: #8f7bff; --chip: #2a2735; }
    }
    header { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: grab; touch-action: none; border-bottom: 1px solid var(--line); }
    header:active { cursor: grabbing; }
    .title { font-weight: 700; flex: 1; letter-spacing: .2px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
    .dot[data-tone="ok"] { background: #2fbf71; } .dot[data-tone="busy"] { background: #f5a524; } .dot[data-tone="err"] { background: #e5484d; }
    button { font: inherit; color: inherit; background: var(--chip); border: 1px solid var(--line); border-radius: 10px; padding: 6px 10px; cursor: pointer; min-width: 36px; min-height: 32px; }
    button:hover { border-color: var(--accent); }
    button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    button.primary { background: var(--accent); color: var(--accent-fg); border-color: transparent; }
    button.icon { padding: 4px 8px; background: transparent; border-color: transparent; }
    .body { padding: 10px; display: grid; gap: 10px; max-height: calc(100vh - 56px); overflow-y: auto; overscroll-behavior: contain; }
    .card.collapsed .body { display: none; }
    .card.collapsed { width: auto; }
    .stage { position: relative; height: 150px; border-radius: 12px; background: radial-gradient(circle at 50% 40%, var(--chip), transparent 70%); display: grid; place-items: center; touch-action: none; cursor: pointer; }
    .stage img { max-height: 140px; max-width: 100%; pointer-events: none; transition: transform .08s ease-out; }
    .stage img[data-mouth="open"] { transform: translateY(-2px) scale(1.02); }
    .stage.giggle img { animation: wiggle .5s ease-in-out; }
    @keyframes wiggle { 0%,100% { transform: rotate(0) } 20% { transform: rotate(-8deg) } 40% { transform: rotate(7deg) } 60% { transform: rotate(-5deg) } 80% { transform: rotate(3deg) } }
    .who { position: absolute; left: 8px; bottom: 6px; font-size: 11px; color: var(--muted); }
    .caption { min-height: 2.8em; max-height: 6.5em; overflow: auto; color: var(--fg); font-size: 12.5px; user-select: text; -webkit-user-select: text; }
    .caption:empty::before { content: attr(data-placeholder); color: var(--muted); }
    .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .row.controls button { flex: 1; }
    label.field { display: grid; gap: 3px; flex: 1; font-size: 11px; color: var(--muted); }
    select { font: inherit; color: var(--fg); background: var(--chip); border: 1px solid var(--line); border-radius: 10px; padding: 6px 8px; width: 100%; }
    .level { display: grid; gap: 2px; }
    .level-head { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); }
    .level-head b { color: var(--fg); font-weight: 600; }
    .level-ends { display: flex; justify-content: space-between; font-size: 10px; color: var(--muted); }
    input[type="range"] { width: 100%; accent-color: var(--accent); margin: 2px 0; }
    .chip { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 999px; background: var(--chip); cursor: pointer; }
    .chip:has(input:checked) { border-color: var(--accent); }
    .chip input { margin: 0; accent-color: var(--accent); }
    label.field.style-field { flex: 1 1 100%; }
    .toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }
    .status { font-size: 11px; color: var(--muted); min-height: 1.2em; }
    progress { width: 100%; height: 6px; accent-color: var(--accent); }
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); }
    .tabs button { flex: 1; border: 0; border-radius: 8px 8px 0 0; background: transparent; color: var(--muted); font-weight: 600; min-height: 30px; }
    .tabs button[aria-selected="true"] { color: var(--fg); box-shadow: inset 0 -2px 0 var(--accent); }
    section { display: grid; gap: 10px; }
    .chip.strong { font-weight: 600; }
    .town-box { display: grid; gap: 6px; }
    .town-members { display: flex; flex-wrap: wrap; gap: 4px; }
    .town-members .chip { font-size: 11px; padding: 3px 7px; }
    .town-box:has([data-setting="townEnabled"]:not(:checked)) .town-members { display: none; }
    .hint { font-size: 11px; color: var(--muted); }
    .quick button { flex: 1 1 auto; font-size: 12px; }
    .quick .oak { flex-basis: 100%; background: #2f4a26; color: #fff7c2; border-color: transparent; }
    form.ask { display: grid; gap: 6px; }
    form.ask input { font: inherit; color: var(--fg); background: var(--chip); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; width: 100%; user-select: text; -webkit-user-select: text; }
    form.ask .row button { flex: 1; }
    .sources { margin: 0; padding: 0 0 0 16px; font-size: 11px; max-height: 5em; overflow: auto; }
    .sources a { color: var(--accent); }
    .wrap { position: relative; }
    .card[data-size="S"] { width: 128px; }
    .card[data-size="S"] .title, .card[data-size="S"] [data-action="profile"] { display: none; }
    .card[data-size="S"] header { padding: 4px 6px; justify-content: space-between; }
    .card[data-size="S"] .body { padding: 4px; }
    .card[data-size="S"] .body > :not(.stage):not(.status) { display: none; }
    .card[data-size="S"] .stage { height: 100px; }
    .card[data-size="S"] .stage img { max-height: 96px; }
    .card[data-size="S"] .who { display: none; }
    .card[data-size="S"] .status { font-size: 10px; text-align: center; min-height: 0; }
    .card[data-size="L"] { width: 380px; font-size: 14px; }
    .card[data-size="L"] .stage { height: 210px; }
    .card[data-size="L"] .stage img { max-height: 200px; }
    .card[data-size="L"] .caption { max-height: 9em; font-size: 14px; }
    .pop { position: absolute; left: 0; bottom: calc(100% + 8px); width: 260px; z-index: 2; display: grid; gap: 8px; padding: 10px;
      background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 12px 32px rgba(20,10,60,.22);
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; --bg: #fff; --fg: #1d1b26; --muted: #6c6880; --line: #e4e1ee; --accent: #6b4eff; --chip: #f3f1fa; }
    @media (prefers-color-scheme: dark) { .pop { --bg: #1e1c27; --fg: #f1effa; --muted: #a29eb8; --line: #34313f; --accent: #8f7bff; --chip: #2a2735; } }
    .pop.below { bottom: auto; top: calc(100% + 8px); }
    .pop-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: var(--muted); }
    .pop button { font: inherit; color: inherit; background: var(--chip); border: 1px solid var(--line); border-radius: 10px; padding: 6px 10px; cursor: pointer; min-height: 32px; }
    .pop button.primary, .pop .sizes button[aria-pressed="true"] { background: var(--accent); color: #fff; border-color: transparent; }
    .sizes button { flex: 1; font-weight: 700; }
    .persona-list { display: flex; flex-wrap: wrap; gap: 4px; max-height: 120px; overflow: auto; }
    .persona-list button { font-size: 12px; padding: 4px 8px; min-height: 28px; }
    .persona-list button[aria-pressed="true"] { border-color: var(--accent); font-weight: 600; }
    .menu-actions button { flex: 1 1 45%; font-size: 12px; }
    form.asst input { flex: 1; min-width: 0; font: inherit; color: var(--fg); background: var(--chip); border: 1px solid var(--line); border-radius: 10px; padding: 6px 8px; user-select: text; -webkit-user-select: text; }
    .mic.listening { background: #e5484d; color: #fff; }
    .asst-reply { font-size: 12px; min-height: 1.2em; color: var(--fg); }
    .pop .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .pop label.field { display: grid; gap: 3px; font-size: 11px; color: var(--muted); }
    .caption { white-space: pre-line; }
    .scene-box { display: grid; gap: 6px; padding: 8px; border: 1px solid var(--line); border-radius: 12px; }
    .scene-members { display: flex; flex-wrap: wrap; gap: 4px; }
    .scene-members .chip { font-size: 11px; padding: 3px 7px; }
    .hot-list { display: grid; gap: 4px; max-height: 190px; overflow: auto; }
    .hot-list button { text-align: left; font-size: 12px; display: grid; gap: 2px; }
    .hot-list small { color: var(--muted); font-size: 10.5px; }
    .hot-box:has([data-setting="whatsHot"]:not(:checked)) .hot-body { display: none; }
    .social-out { display: grid; gap: 6px; padding: 8px; border: 1px dashed var(--line); border-radius: 12px; }
    form.angle input { font: inherit; color: var(--fg); background: var(--chip); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; width: 100%; user-select: text; -webkit-user-select: text; }
    .pop.over { bottom: auto; top: 44px; }
    .help { width: 290px; max-height: min(70vh, 460px); overflow: auto; gap: 4px; }
    .help details { border-top: 1px solid var(--line); padding: 6px 0 2px; }
    .help summary { cursor: pointer; font-weight: 600; list-style-position: inside; }
    .help p { margin: 4px 0 2px; font-size: 12px; color: var(--fg); }
    .help .help-intro { font-size: 12px; color: var(--muted); margin: 0 0 4px; }
    [hidden] { display: none !important; }
  `;

  // Text comes from _locales via chrome.i18n (data-i18n*), with English fallbacks in the markup.
  const HTML = `
    <div class="wrap">
    <div class="card" part="card" data-size="M">
      <header>
        <span class="dot" data-tone="idle"></span>
        <span class="title" data-i18n="extShortName">Fancy Bot</span>
        <button class="icon" data-action="help" data-i18n-title="hudHelp" title="How it works" aria-label="How it works">?</button>
        <button class="icon" data-action="profile" data-i18n-title="hudProfile" title="About you" aria-label="About you">👤</button>
        <button class="icon" data-action="collapse" data-i18n-title="hudCollapse" title="Collapse" aria-label="Collapse">▾</button>
      </header>
      <div class="body">
        <div class="stage" data-i18n-title="hudTickle" title="Tap me rapidly...">
          <img alt="" draggable="false">
          <span class="who"></span>
        </div>
        <div class="caption" aria-live="polite" data-i18n-placeholder="hudCaptionPlaceholder" data-placeholder="New replies will be read aloud here."></div>
        <ul class="sources" hidden></ul>
        <div class="row controls">
          <button class="primary" data-action="playpause" data-i18n-title="hudPlayPause" title="Play / pause" aria-label="Play or pause">▶</button>
          <button data-action="replay" data-i18n-title="hudReplay" title="Replay last" aria-label="Replay">↻</button>
          <button data-action="stop" data-i18n-title="hudStop" title="Stop" aria-label="Stop">■</button>
          <button data-action="readSelection" data-i18n-title="hudReadSelection" title="Read selected text (or last reply)" aria-label="Read selection">❝</button>
        </div>
        <div class="tabs" role="tablist">
          <button role="tab" data-tab="listen" aria-selected="true" data-i18n="hudTabListen">Listen</button>
          <button role="tab" data-tab="ask" aria-selected="false" data-i18n="hudTabAsk">Ask</button>
          <button role="tab" data-tab="social" aria-selected="false" data-i18n="hudTabPost" hidden>Post</button>
        </div>
        <section data-panel="listen">
          <label class="field"><span data-i18n="hudCharacter">Character</span><select data-setting="personaId"></select></label>
          <div class="level">
            <div class="level-head"><span data-i18n="hudReadingLevel">Reading level</span><b class="level-name"></b></div>
            <input type="range" min="1" max="5" step="1" data-setting="readingLevel" data-i18n-aria="hudReadingLevel" aria-label="Reading level">
            <div class="level-ends"><span data-i18n="hudLevelLow">Plain &amp; simple</span><span data-i18n="hudLevelHigh">Expert</span></div>
          </div>
          <div class="row">
            <label class="chip strong"><input type="checkbox" data-setting="paraphrase"> <span data-i18n="hudParaphrase">Paraphrase</span></label>
            <label class="chip"><input type="checkbox" data-setting="humor"> <span data-i18n="hudHumor">Humor</span></label>
            <label class="chip"><input type="checkbox" data-setting="philosophy"> <span data-i18n="hudPhilosophy">Philosophy</span></label>
            <label class="field style-field"><span data-i18n="hudSpeakingStyle">Speaking style</span><select data-setting="accent"></select></label>
          </div>
          <div class="town-box">
            <label class="chip strong"><input type="checkbox" data-setting="townEnabled"> <span data-i18n="hudTown">Town panel</span></label>
            <div class="town-members" data-i18n-aria="hudTownMembers" aria-label="Town members"></div>
          </div>
          <div class="row">
            <label class="toggle"><input type="checkbox" data-setting="autoRead"> <span data-i18n="hudAutoRead">Auto-read replies</span></label>
            <span style="flex:1"></span>
            <button data-action="export" data-i18n-title="hudMemeTitle" title="Export the last reply as a video">🎬 <span data-i18n="hudMeme">Meme</span></button>
          </div>
        </section>
        <section data-panel="ask" hidden>
          <div class="hint" data-i18n="hudAskHint">About the last AI answer:</div>
          <div class="row quick">
            <button data-action="keypoints" data-i18n="hudKeyPoints">Key points</button>
            <button data-action="paraphraseNow" data-i18n="hudParaphraseNow">Paraphrase</button>
            <button data-action="oakley" class="oak" data-i18n="hudOakley">🌳 Paraphrase with Oakley</button>
          </div>
          <form class="ask">
            <input type="text" name="q" maxlength="500" autocomplete="off" data-i18n-placeholder="hudAskPlaceholder" placeholder="Ask about what it just said...">
            <div class="row">
              <button type="submit" class="primary" data-i18n="hudAsk">Ask</button>
              <button type="button" data-action="expound" data-i18n-title="hudExpoundTitle" title="Go deeper, with research" data-i18n="hudExpound">Expound</button>
            </div>
          </form>
        </section>
        <section data-panel="social" hidden>
          <div class="hint" data-i18n="socialHint">Tap 🎭 on any post, or use the post on screen:</div>
          <label class="field"><span data-i18n="socialVoice">Comedic voice</span><select data-setting="cribPersonaId"></select></label>
          <div class="row quick">
            <button data-action="crib" data-i18n="socialCrib">🎭 Crib notes</button>
            <button data-action="reply" data-i18n="socialReply">💬 Draft reply</button>
          </div>
          <div class="scene-box">
            <button data-action="scene" class="primary" data-i18n="sceneButton">🎬 Writers' room scene</button>
            <div class="hint" data-i18n="sceneHint">The cast pitch lines and the director turns them into a mini-scene.</div>
            <div class="scene-members" data-i18n-aria="sceneCast" aria-label="Scene cast (2 to 4)"></div>
            <label class="field"><span data-i18n="sceneDirector">Director</span><select data-setting="sceneDirector"></select></label>
          </div>
          <div class="hot-box">
            <label class="chip strong"><input type="checkbox" data-setting="whatsHot"> <span data-i18n="hotToggle">🔥 What's hot on this page</span></label>
            <div class="hot-body">
              <div class="row"><span class="hint" style="flex:1" data-i18n="hotHint">Posts you're viewing, by reach and shared topics. Pick one:</span><button class="icon" data-action="refreshHot" title="Refresh" aria-label="Refresh">↻</button></div>
              <div class="hot-list"></div>
            </div>
          </div>
          <form class="angle"><input type="text" name="q" maxlength="200" autocomplete="off" data-i18n-placeholder="socialAngle" placeholder="Your angle for the reply (optional)"></form>
          <div class="social-out" hidden>
            <div class="row quick">
              <button data-action="copyText" data-i18n="socialCopy">📋 Copy text</button>
              <button data-action="export" data-i18n="socialVideo">🎬 Make video</button>
              <button data-action="openReply" data-i18n="socialOpenReply">↩ Open reply box</button>
            </div>
            <div class="hint" data-i18n="socialYouPost">You review it and post it yourself.</div>
          </div>
        </section>
        <progress hidden max="1" value="0"></progress>
        <div class="status"></div>
      </div>
    </div>
    <div class="pop menu" role="menu" hidden>
      <div class="pop-title" data-i18n="menuSize">Size</div>
      <div class="row sizes">
        <button data-size-pick="S">S</button><button data-size-pick="M">M</button><button data-size-pick="L">L</button>
      </div>
      <label class="field"><span data-i18n="menuCustomSize">Custom size</span><input type="range" min="0.7" max="1.6" step="0.05" data-setting="hudScale"></label>
      <div class="pop-title" data-i18n="menuCharacters">Characters</div>
      <div class="persona-list"></div>
      <div class="row menu-actions">
        <button data-action="paraphraseNow" data-i18n="hudParaphraseNow">Paraphrase</button>
        <button data-action="toggleMute" class="mute-btn" data-i18n="menuMute">Mute</button>
        <button data-action="openAssistant" data-i18n="menuAssistant">💬 Assistant</button>
        <button data-action="profile" data-i18n="menuSettings">Settings</button>
        <button data-action="help" data-i18n="menuHelp">❓ How it works</button>
      </div>
    </div>
    <div class="pop help" hidden>
      <div class="pop-title" data-i18n="helpTitle">How Fancy Bot works</div>
      <p class="help-intro" data-i18n="helpIntro">I read AI answers out loud in fun voices and help you understand them. Tap a topic:</p>
      <details><summary data-i18n="helpListenTitle">🎧 Listening to answers</summary><p data-i18n="helpListenBody">Ask Claude, Grok or Gemini anything. When the answer finishes, your character reads it out loud. Use the reading level slider: 1 is super simple, 5 is expert. Pick a voice style too.</p></details>
      <details><summary data-i18n="helpGesturesTitle">👆 Gestures</summary><p data-i18n="helpGesturesBody">Drag me by the top bar. Long-press me for the menu (size, characters, mute). Double-tap me to open the helper. Tap me fast or rub me to tickle me.</p></details>
      <details><summary data-i18n="helpHelperTitle">💬 Helper commands</summary><p data-i18n="helpHelperBody">Double-tap and type or say things like "switch to Old Oakley", "talk slower", "simpler please" or "talk like a genius". I change the setting for you.</p></details>
      <details><summary data-i18n="helpAskTitle">❓ Ask tab</summary><p data-i18n="helpAskBody">Key points gives the short version. Paraphrase says it in plain words. Oakley adds a wise thought. Ask a follow-up, or Expound to go deeper.</p></details>
      <details><summary data-i18n="helpTownTitle">🏘️ The town</summary><p data-i18n="helpTownBody">Pick a few characters and they each take a part of the answer, like a little town meeting. Big Sal, Old Oakley, Big Play Ray and Elias are the core crew.</p></details>
      <details><summary data-i18n="helpSocialTitle">📱 Social posts</summary><p data-i18n="helpSocialBody">On X, Facebook and Instagram, tap the "Crib notes" pill on a post. Get crib notes (a witty summary) or a draft reply. Then copy it, make a video, or open the reply box. I never post for you: you choose what to post.</p></details>
      <details><summary data-i18n="helpRoomTitle">🎬 Writers' room</summary><p data-i18n="helpRoomBody">Pick 2 to 4 characters and a director. They pitch lines, the director picks the best, and you get a short scene about the post. Jokes are about ideas, never people.</p></details>
      <details><summary data-i18n="helpHotTitle">🔥 What's hot</summary><p data-i18n="helpHotBody">Turn it on to rank the posts already on your screen by likes and shared topics. Pick one to riff on.</p></details>
      <details><summary data-i18n="helpVideoTitle">🎞️ Meme video</summary><p data-i18n="helpVideoBody">After a narration, tap Video to download a clip with the character and captions, ready for you to upload.</p></details>
      <details><summary data-i18n="helpSettingsTitle">👤 Settings</summary><p data-i18n="helpSettingsBody">Tap the person icon to set your name, a little about you, your age range and language. Answers get tailored to you.</p></details>
    </div>
    <div class="pop assistant" hidden>
      <div class="pop-title" data-i18n="asstTitle">Tell me what you'd like</div>
      <form class="asst">
        <div class="row">
          <input type="text" name="q" maxlength="300" autocomplete="off" data-i18n-placeholder="asstPlaceholder" placeholder="e.g. switch to Old Oakley, talk slower">
          <button type="button" class="mic" data-i18n-title="asstMic" title="Speak" hidden>🎤</button>
          <button type="submit" class="primary" data-i18n="hudAsk">Ask</button>
        </div>
      </form>
      <div class="asst-reply" aria-live="polite"></div>
    </div>
    </div>
  `;

  class Hud {
    constructor({ onAction, onSetting }) {
      this.onAction = onAction;
      this.onSetting = onSetting;
      this.pos = { x: 0, y: 0 };
    }

    mount(settings) {
      this.host = document.createElement('div');
      this.host.id = 'vernaculator-hud';
      Object.assign(this.host.style, { position: 'fixed', top: '0', left: '0', zIndex: '2147483000', willChange: 'transform' });
      this.root = this.host.attachShadow({ mode: 'closed' });
      this.root.innerHTML = `<style>${CSS}</style>${HTML}`;
      document.documentElement.appendChild(this.host);
      this.#localize();

      const $ = (s) => this.root.querySelector(s);
      this.card = $('.card');
      this.img = $('.stage img');
      this.stage = $('.stage');
      this.who = $('.who');
      this.caption = $('.caption');
      this.statusEl = $('.status');
      this.dot = $('.dot');
      this.playBtn = $('[data-action="playpause"]');
      this.progress = $('progress');
      this.personaSelect = $('[data-setting="personaId"]');
      this.levelInput = $('[data-setting="readingLevel"]');
      this.levelName = $('.level-name');
      this.styleSelect = $('[data-setting="accent"]');
      this.levelLabels = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, Vern.t(`level${n}`, ['Super simple', 'Plain', 'Everyday', 'Detailed', 'Expert'][n - 1])]));
      this.sourcesEl = $('.sources');
      this.menu = $('.menu');
      this.assistant = $('.assistant');
      this.help = $('.help');
      this.asstForm = $('form.asst');
      this.asstReply = $('.asst-reply');
      this.personaList = $('.persona-list');
      this.asstForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = this.asstForm.q.value.trim();
        if (q) this.onAction('assistant', q);
      });
      this.root.addEventListener('click', (e) => {
        const size = e.target.closest('[data-size-pick]');
        if (size) {
          this.onSetting('hudSize', size.dataset.sizePick);
          this.onSetting('hudScale', 1);
        }
        const pick = e.target.closest('[data-persona-pick]');
        if (pick) {
          this.onSetting('personaId', pick.dataset.personaPick);
          this.closePopovers();
        }
      });
      // Clicks outside the widget close any open popover.
      document.addEventListener('pointerdown', (e) => {
        if (!e.composedPath().includes(this.host)) this.closePopovers();
      }, true);
      this.levelInputScale = $('[data-setting="hudScale"]');
      this.levelInputScale.addEventListener('input', () => this.onSetting('hudScale', Number(this.levelInputScale.value)));
      this.#initVoiceInput($('.mic'));
      this.askForm = $('form.ask');
      this.askForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = this.askForm.q.value.trim();
        if (q) this.onAction('ask', q);
      });
      for (const tab of this.root.querySelectorAll('[data-tab]')) {
        tab.addEventListener('click', () => this.showTab(tab.dataset.tab));
      }
      // Keep typing in the Ask box from triggering the host page's keyboard shortcuts.
      this.angleForm = $('form.angle');
      this.angleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.onAction('reply', this.angleForm.q.value.trim());
      });
      this.socialOut = $('.social-out');
      this.cribSelect = $('[data-setting="cribPersonaId"]');
      for (const ev of ['keydown', 'keyup', 'keypress']) {
        this.angleForm.addEventListener(ev, (e) => e.stopPropagation());
        this.askForm.addEventListener(ev, (e) => e.stopPropagation());
        this.asstForm.addEventListener(ev, (e) => e.stopPropagation());
      }
      this.levelInput.addEventListener('input', () => this.#showLevel());

      this.root.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        if (btn.dataset.action === 'collapse') return this.setCollapsed(!this.collapsed, true);
        if (btn.dataset.action === 'help') return this.toggleHelp();
        const arg = { expound: () => this.askForm.q.value.trim(), reply: () => this.angleForm.q.value.trim() }[btn.dataset.action];
        this.onAction(btn.dataset.action, arg ? arg() : undefined);
      });
      this.root.addEventListener('click', (e) => {
        const hot = e.target.closest('[data-hot]');
        if (hot) this.onAction('pickHot', Number(hot.dataset.hot));
      });
      this.root.addEventListener('change', (e) => {
        if (e.target.dataset?.sceneMember) {
          const boxes = [...this.root.querySelectorAll('[data-scene-member]')];
          let ids = boxes.filter((i) => i.checked).map((i) => i.dataset.sceneMember);
          if (ids.length > 4) { e.target.checked = false; ids = ids.filter((id) => id !== e.target.dataset.sceneMember); }
          return this.onSetting('sceneCast', ids);
        }
        if (e.target.dataset?.townMember) {
          const ids = [...this.root.querySelectorAll('[data-town-member]:checked')].map((i) => i.dataset.townMember);
          return this.onSetting('townMembers', ids);
        }
        const el = e.target.closest('[data-setting]');
        if (!el) return;
        const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
        this.onSetting(el.dataset.setting, v);
      });

      this.applySettings(settings);
      this.setCollapsed(!!settings.hudCollapsed, false);
      this.#initDrag(settings.hudPos);
    }

    applySettings(s) {
      for (const el of this.root.querySelectorAll('[data-setting]')) {
        const v = s[el.dataset.setting];
        if (v === undefined) continue;
        if (el.type === 'checkbox') el.checked = !!v;
        else if (el.type === 'range') el.value = String(v);
        else if ([...el.options].some((o) => o.value === v)) el.value = v;
        else if (el.dataset.setting === 'accent') this.pendingAccent = v; // options arrive with the catalog
      }
      this.#showLevel();
      if ('hudVisible' in s) this.host.style.display = s.hudVisible === false ? 'none' : '';
      if ('hudSize' in s) {
        this.card.dataset.size = ['S', 'M', 'L'].includes(s.hudSize) ? s.hudSize : 'M';
        for (const b of this.root.querySelectorAll('[data-size-pick]')) b.setAttribute('aria-pressed', String(b.dataset.sizePick === this.card.dataset.size));
        requestAnimationFrame(() => this.#apply(this.pos));
      }
      if ('hudScale' in s) {
        this.host.style.zoom = String(Math.min(1.6, Math.max(0.7, Number(s.hudScale) || 1)));
        requestAnimationFrame(() => this.#apply(this.pos));
      }
      if ('townMembers' in s) this.#syncTownMembers(s.townMembers || []);
      if ('sceneCast' in s) this.#syncSceneCast(s.sceneCast || []);
      if ('muted' in s) this.root.querySelector('.mute-btn').textContent = s.muted ? Vern.t('menuUnmute', 'Unmute') : Vern.t('menuMute', 'Mute');
    }

    #localize() {
      for (const el of this.root.querySelectorAll('[data-i18n]')) el.textContent = Vern.t(el.dataset.i18n, el.textContent);
      for (const el of this.root.querySelectorAll('[data-i18n-title]')) {
        el.title = Vern.t(el.dataset.i18nTitle, el.title);
        el.setAttribute('aria-label', el.title);
      }
      for (const el of this.root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', Vern.t(el.dataset.i18nAria, el.getAttribute('aria-label')));
      for (const el of this.root.querySelectorAll('[data-i18n-placeholder]')) {
        const v = Vern.t(el.dataset.i18nPlaceholder, el.getAttribute('placeholder') || el.dataset.placeholder);
        if (el.tagName === 'INPUT') el.placeholder = v;
        else el.dataset.placeholder = v;
      }
    }

    /** Menu/assistant open above the widget, or below it when there's no room. */
    #openPopover(pop) {
      this.closePopovers();
      pop.hidden = false;
      const r = this.host.getBoundingClientRect();
      pop.style.maxHeight = '';
      pop.classList.remove('over');
      const z = Number(this.host.style.zoom) || 1;
      const above = r.top - 16;
      const below = window.innerHeight - r.bottom - 16;
      const goBelow = above < pop.offsetHeight && below > above;
      pop.classList.toggle('below', goBelow);
      if (pop === this.help) {
        const room = goBelow ? below : above;
        if (room < Math.min(pop.offsetHeight, 300)) {
          // Not enough room above or below: lay the help over the card, under its header.
          pop.classList.remove('below');
          pop.classList.add('over');
          pop.style.maxHeight = `${Math.floor((window.innerHeight - Math.max(r.top, 0) - 56) / z)}px`;
        } else {
          pop.style.maxHeight = `${Math.floor(room / z)}px`;
        }
      }
      const overflowRight = r.left + pop.offsetWidth - window.innerWidth + 8;
      pop.style.left = overflowRight > 0 ? `${-overflowRight}px` : '0';
    }

    openMenu(personas, currentId) {
      this.personaList.replaceChildren(...personas.map((p) => {
        const b = document.createElement('button');
        b.dataset.personaPick = p.id;
        b.textContent = p.name;
        b.setAttribute('aria-pressed', String(p.id === currentId));
        return b;
      }));
      this.#openPopover(this.menu);
    }

    openAssistant() {
      this.asstReply.textContent = '';
      this.#openPopover(this.assistant);
      this.asstForm.q.focus();
    }

    setAssistantReply(text) {
      this.asstReply.textContent = text;
      this.asstForm.q.value = '';
    }

    /** "How it works" dropdown; the ? button toggles it. */
    toggleHelp() {
      if (!this.help.hidden) return this.closePopovers();
      for (const d of this.help.querySelectorAll('details')) d.open = false;
      this.#openPopover(this.help);
    }

    closePopovers() {
      this.menu.hidden = true;
      this.assistant.hidden = true;
      this.help.hidden = true;
    }

    get popoverOpen() {
      return !this.menu.hidden || !this.assistant.hidden || !this.help.hidden;
    }

    /** Voice input for the mini-assistant (Web Speech API, where the browser offers it). */
    #initVoiceInput(btn) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return;
      btn.hidden = false;
      btn.addEventListener('click', () => {
        const rec = new SR();
        rec.lang = Vern.profile().language;
        rec.interimResults = false;
        btn.classList.add('listening');
        rec.onresult = (e) => {
          const text = e.results[0][0].transcript;
          this.asstForm.q.value = text;
          this.onAction('assistant', text);
        };
        rec.onend = () => btn.classList.remove('listening');
        rec.onerror = () => btn.classList.remove('listening');
        rec.start();
      });
    }

    /** Sit exactly where another element was (used to replace Grok's companion avatar). */
    placeOver(rect) {
      const r = this.host.getBoundingClientRect();
      this.#apply({ x: rect.left + rect.width / 2 - r.width / 2, y: rect.top + rect.height / 2 - r.height / 2 });
    }

    #syncSceneCast(ids) {
      this.sceneCast = ids;
      for (const i of this.root.querySelectorAll('[data-scene-member]')) i.checked = ids.includes(i.dataset.sceneMember);
    }

    /** What's hot list: [{ text, reach, topic }] */
    setHotList(items) {
      const list = this.root.querySelector('.hot-list');
      if (!items.length) {
        const p = document.createElement('div');
        p.className = 'hint';
        p.textContent = Vern.t('hotEmpty', 'No posts with enough text on screen yet. Scroll a little and refresh.');
        return list.replaceChildren(p);
      }
      list.replaceChildren(...items.map((it, i) => {
        const b = document.createElement('button');
        b.dataset.hot = String(i);
        const t = document.createElement('span');
        t.textContent = it.text.length > 90 ? `${it.text.slice(0, 88)}…` : it.text;
        const m = document.createElement('small');
        m.textContent = [it.reach ? `🔥 ${it.reach.toLocaleString()}` : '', it.topic ? `#${it.topic.replace(/^#/, '')}` : ''].filter(Boolean).join(' · ');
        b.append(t, m);
        return b;
      }));
      requestAnimationFrame(() => this.#apply(this.pos));
    }

    #syncTownMembers(ids) {
      this.townMembers = ids;
      for (const i of this.root.querySelectorAll('[data-town-member]')) i.checked = ids.includes(i.dataset.townMember);
    }

    showTab(name, focus = true) {
      for (const t of this.root.querySelectorAll('[data-tab]')) t.setAttribute('aria-selected', String(t.dataset.tab === name));
      for (const p of this.root.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== name;
      if (name === 'ask' && focus) this.askForm.q.focus();
      requestAnimationFrame(() => this.#apply(this.pos));
    }

    /** On social sites the Post tab replaces Ask (there is no AI answer to ask about). */
    setSocial(on) {
      this.root.querySelector('[data-tab="social"]').hidden = !on;
      this.root.querySelector('[data-tab="ask"]').hidden = on;
      this.caption.dataset.placeholder = on ? Vern.t('socialPlaceholder', 'Tap 🎭 Crib notes on a post.') : this.caption.dataset.placeholder;
      if (on) this.showTab('social', false);
    }

    /** Show Copy / Make video / Open reply once there is something to share. */
    setSocialResult(has) {
      this.socialOut.hidden = !has;
      requestAnimationFrame(() => this.#apply(this.pos));
    }

    clearQuestion() {
      this.askForm.q.value = '';
    }

    setSources(list) {
      this.sourcesEl.replaceChildren(...(list || []).map((s) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = /^https?:\/\//.test(s.url) ? s.url : '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = s.title || s.url;
        li.append(a);
        return li;
      }));
      this.sourcesEl.hidden = !list?.length;
    }

    setPersonas(list, selectedId) {
      this.personaSelect.replaceChildren(
        new Option(Vern.t('hudAutoCharacter', 'Auto (match the topic)'), 'auto'),
        ...list.map((p) => new Option(`${p.name} · ${p.archetype}`, p.id)),
      );
      this.personaSelect.value = list.some((p) => p.id === selectedId) ? selectedId : 'auto';
      this.cribSelect.replaceChildren(
        new Option(Vern.t('socialSameCharacter', 'Same as my character'), ''),
        ...list.map((p) => new Option(p.name, p.id)),
      );
      const scene = this.root.querySelector('.scene-members');
      scene.replaceChildren(...list.map((p) => {
        const label = document.createElement('label');
        label.className = 'chip';
        label.innerHTML = '<input type="checkbox"> <span></span>';
        label.querySelector('input').dataset.sceneMember = p.id;
        label.querySelector('span').textContent = p.name;
        return label;
      }));
      this.#syncSceneCast(this.sceneCast || Vern.settings.values.sceneCast || []);
      const dirSel = this.root.querySelector('[data-setting="sceneDirector"]');
      dirSel.replaceChildren(...list.map((p) => new Option(p.name, p.id)));
      dirSel.value = list.some((p) => p.id === Vern.settings.values.sceneDirector) ? Vern.settings.values.sceneDirector : list[0]?.id;
      const crib = Vern.settings.values.cribPersonaId || '';
      this.cribSelect.value = list.some((p) => p.id === crib) ? crib : '';
      const box = this.root.querySelector('.town-members');
      box.replaceChildren(...list.map((p) => {
        const label = document.createElement('label');
        label.className = 'chip';
        label.innerHTML = '<input type="checkbox"> <span></span>';
        label.querySelector('input').dataset.townMember = p.id;
        label.querySelector('span').textContent = p.name;
        return label;
      }));
      this.#syncTownMembers(this.townMembers || []);
    }

    /** Server-provided labels for reading levels and speaking styles. */
    setStyleCatalog(catalog) {
      // Local translations win; the server's English labels are the fallback (e.g. for new styles).
      if (catalog?.readingLevels) for (const [k, v] of Object.entries(catalog.readingLevels)) this.levelLabels[k] = Vern.t(`level${k}`, v);
      const styles = catalog?.speakingStyles || { none: "Character's own" };
      for (const k of Object.keys(styles)) styles[k] = Vern.t(`style_${k}`, styles[k]);
      const want = this.pendingAccent ?? this.styleSelect.value ?? 'none';
      this.styleSelect.replaceChildren(...Object.entries(styles).map(([k, label]) => new Option(label, k)));
      this.styleSelect.value = Object.hasOwn(styles, want) ? want : 'none';
      this.pendingAccent = undefined;
      this.#showLevel();
    }

    #showLevel() {
      this.levelName.textContent = this.levelLabels[this.levelInput.value] || '';
    }

    setActivePersona(p) {
      this.who.textContent = p ? `${p.name}` : '';
    }

    setStatus(text, tone) {
      this.statusEl.textContent = text || '';
      if (tone) this.dot.dataset.tone = tone;
    }

    setCaption(text) {
      this.caption.textContent = text;
      this.caption.scrollTop = this.caption.scrollHeight;
    }

    appendCaption(text) {
      this.setCaption(this.caption.textContent ? `${this.caption.textContent} ${text}` : text);
    }

    setPlaying(playing) {
      this.playBtn.textContent = playing ? '❚❚' : '▶';
    }

    setExportProgress(f) {
      this.progress.hidden = f === null;
      if (f !== null) this.progress.value = f;
    }

    giggle() {
      this.stage.classList.remove('giggle');
      void this.stage.offsetWidth; // restart animation
      this.stage.classList.add('giggle');
    }

    setCollapsed(c, persist) {
      this.collapsed = c;
      this.card.classList.toggle('collapsed', c);
      this.root.querySelector('[data-action="collapse"]').textContent = c ? '▸' : '▾';
      if (persist) this.onSetting('hudCollapsed', c);
      requestAnimationFrame(() => this.#apply(this.pos));
    }

    // --- Dragging -----------------------------------------------------------
    #clamp({ x, y }) {
      const r = this.host.getBoundingClientRect();
      const maxX = Math.max(0, window.innerWidth - r.width - 4);
      const maxY = Math.max(0, window.innerHeight - r.height - 4);
      return { x: Math.min(Math.max(4, x), maxX), y: Math.min(Math.max(4, y), maxY) };
    }

    #apply(pos) {
      this.pos = this.#clamp(pos);
      this.host.style.transform = `translate(${Math.round(this.pos.x)}px, ${Math.round(this.pos.y)}px)`;
    }

    #initDrag(saved) {
      const header = this.root.querySelector('header');
      requestAnimationFrame(() => {
        const r = this.host.getBoundingClientRect();
        this.#apply(saved || { x: window.innerWidth - r.width - 24, y: window.innerHeight - r.height - 24 });
      });

      let drag = null;
      header.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('button')) return;
        drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: this.pos.x, oy: this.pos.y };
        header.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      header.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        this.#apply({ x: drag.ox + e.clientX - drag.sx, y: drag.oy + e.clientY - drag.sy });
      });
      const end = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag = null;
        this.onSetting('hudPos', this.pos);
      };
      header.addEventListener('pointerup', end);
      header.addEventListener('pointercancel', end);
      window.addEventListener('resize', () => this.#apply(this.pos));
    }
  }

  Vern.Hud = Hud;
})();
