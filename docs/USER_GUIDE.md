# Fancy Bot User Guide

**Fancy Bot by Say It Fancy Productions** · [getfancybot.com](https://getfancybot.com)

This guide is for everyone: parents, teachers, grandparents, and kids (with a grown-up's help). You don't need to know anything about computers beyond clicking and typing. Each step tells you exactly what to click.

> **The short version:** Fancy Bot puts a friendly cartoon character from Big Sal's World on your screen. When you use an AI chat (Claude, Grok or Gemini), the character reads the answer out loud, in plain words, in its own fun voice. You choose how simple or detailed it should be.

## Contents

1. [What Fancy Bot is](#1-what-fancy-bot-is)
2. [What you need](#2-what-you-need)
3. [Installing Fancy Bot (Windows)](#3-installing-fancy-bot-windows)
4. [First use](#4-first-use)
5. [Getting to know the widget](#5-getting-to-know-the-widget)
6. [The characters](#6-the-characters)
7. [Reading levels](#7-reading-levels)
8. [Add-ons and speaking styles](#8-add-ons-and-speaking-styles)
9. [The Town strip](#9-the-town-strip)
10. [Paraphrase, follow-up questions and going deeper](#10-paraphrase-follow-up-questions-and-going-deeper)
11. [The helper (double-tap)](#11-the-helper-double-tap)
12. [Making an MP4 video](#12-making-an-mp4-video)
13. [Crib notes on social media](#13-crib-notes-on-social-media)
14. [Your profile and language](#14-your-profile-and-language)
15. [Updating Fancy Bot](#15-updating-fancy-bot)
16. [Stopping Fancy Bot](#16-stopping-fancy-bot)
17. [Troubleshooting](#17-troubleshooting)
18. [Privacy](#18-privacy)
19. [Frequently asked questions](#19-frequently-asked-questions)

---

## 1. What Fancy Bot is

AI chat answers are often long and full of jargon: medical words, legal words, tech words. Fancy Bot turns them into something anyone can understand.

- **It reads AI answers out loud.** On **claude.ai**, **grok.com** and **gemini.google.com**, a little animated character sits on the page. When the AI answers you, the character reads the answer aloud and its mouth moves as it talks.
- **It explains things at your level.** A **Reading level** slider goes from **1 (Super simple)** to **5 (Expert)**. It starts at **2 (Plain)**. The words get simpler, but the facts stay the same: numbers, doses, dates and warnings are kept exactly.
- **It has characters with personality.** Big Sal (the default), Old Oakley, Big Play Ray, Elias Stillwater and more. Each one explains things in their own way, and you can add Humor, a bit of Philosophy, or a speaking style like *Slow & patient* or *Friendly pirate*.
- **It helps with social media too.** On **X**, **Facebook** and **Instagram**, a **🎭 Crib notes** button sums up a post in a few witty lines and can draft a reply or make a short video. **Fancy Bot never posts anything for you.** You copy it and post it yourself, if you want to.
- **It makes videos.** Turn the last answer into a short MP4 video of the character talking, with captions.

Fancy Bot has two parts that work together:

1. **The browser extension**: the character and buttons you see in Brave or Chrome.
2. **The Fancy Bot server**: a small program that runs in a window on your own PC. It writes the character's words and makes the voice. The extension talks to it at `http://localhost:8787` ("localhost" just means "this computer").

Both parts need to be running for Fancy Bot to work.

## 2. What you need

- **A Windows PC** (Windows 10 or 11).
- **Brave or Google Chrome** (Microsoft Edge also works). Chrome needs to be version 126 or newer, which any up-to-date browser is.
- **Node.js (the LTS version)**: a free program the Fancy Bot server runs on. Version **22.9 or newer** is needed. You'll install it in step 3.1.
- **The Fancy Bot files**, from the GitHub page `github.com/mikefrancoar501/Vernaculator` (or whoever gave you Fancy Bot).
- **For real voices and smart rewrites: two keys** (think of them as passwords for paid services):
  - an **Anthropic API key** (for the words; it starts with `sk-ant-`), from console.anthropic.com
  - a **Fish Audio API key** (for the voices), from fish.audio

  These services charge the account owner for what they use, so a grown-up should set them up. **Without keys, Fancy Bot still runs in "test mode"**: you'll see the character move and hear a babbling test sound instead of a real voice. That's a good way to check everything is installed before adding keys.
- **Optional: Git for Windows** (free, from git-scm.com). If it's installed, the setup can download updates for you automatically.

## 3. Installing Fancy Bot (Windows)

Set aside about 15 minutes the first time. After that, starting Fancy Bot is one double-click.

### 3.1 Install Node.js

1. Go to **nodejs.org** and download the **LTS** version for Windows.
2. Open the downloaded file and click **Next** through the installer, keeping the default choices.
3. When it says it's finished, you're done. You don't need to open Node.js yourself.

### 3.2 Get the Fancy Bot files

1. Open the Fancy Bot GitHub page: `github.com/mikefrancoar501/Vernaculator`.
2. Click the green **Code** button, then **Download ZIP**.
3. The file (named something like `Vernaculator-main.zip`) goes into your **Downloads** folder. **Leave the ZIP file there.** If you don't have Git, the setup uses that ZIP.
4. Right-click the ZIP and choose **Extract All...**, then **Extract**. A new folder opens.
5. Inside it, open the **scripts** folder. You'll use two files from here: `fancybot-keys.bat` and `fancybot-setup.bat`.

> If Windows shows a blue "Windows protected your PC" box or a security warning when you double-click these files, click **More info**, then **Run anyway** (or **Run**). These are the Fancy Bot setup scripts you just downloaded.

### 3.3 Add your keys (skip this for test mode)

1. Double-click **`fancybot-keys.bat`**. A blue or black window opens.
2. It asks for your **Anthropic API key**. Paste it and press **Enter**. *What you type or paste stays hidden; that's normal.*
3. It asks for your **Fish Audio API key**. Paste it and press **Enter**.
4. It asks for an optional **fallback voice ID**: a voice used for characters that don't have their own voice yet. **Just press Enter** to use Big Sal's voice.
5. The window shows where it saved your keys (`Documents\FancyBot\keys.env`) and says **Words:** and **Voices:**. `anthropic` and `fish` mean real services are on; `mock` means test mode.
6. Press **Enter** to close the window.

You can run this again any time to change a key. At each question, pressing **Enter** without typing anything keeps the key that's already saved.

### 3.4 Run the setup

1. Double-click **`fancybot-setup.bat`**.
2. The window does several things by itself. Let it work; the first time takes a minute or two:
   - It copies itself to **`Documents\FancyBot\scripts`** (from now on, use the copy there).
   - It puts the Fancy Bot code in **`Documents\FancyBot\code`**.
   - It checks Node.js and installs what the server needs.
   - It creates your **token** (a private sign-in code that starts with `vk_`), saves it in `Documents\FancyBot\token.txt`, and copies it to your clipboard.
   - It opens your browser's extensions page and the extension folder.
   - It starts the Fancy Bot server.
3. When you see **"Fancy Bot is running"**, it's ready.
4. **Keep this window open.** It *is* the Fancy Bot server. You can minimize it, but if you close it, Fancy Bot stops.

### 3.5 Add the extension to your browser

You only do this once.

**In Brave:**

1. In the address bar, type **`brave://extensions`** and press Enter. (The setup may already have opened this page.)
2. Turn on **Developer mode** (the switch at the top right).
3. Click **Load unpacked**.
4. Go to your **Documents** folder, then **FancyBot**, then **code**, and select the **extension** folder. Click **Select Folder**.
5. A **Fancy Bot** card appears on the page. The Fancy Bot settings page also opens.

**In Google Chrome:** the same steps, but type **`chrome://extensions`** in step 1.

**Pin it (recommended):** click the puzzle-piece icon next to the address bar and click the pin next to **Fancy Bot**. Clicking the Fancy Bot icon later shows or hides the character.

### 3.6 Check the settings page

The **Fancy Bot settings** page opens by itself after you load the extension.

1. Under **Connection**, **Middleware URL** should say `http://localhost:8787`. Leave it as is.
2. **Session token** usually fills itself in. If it's empty, paste the token from the setup window (it's on your clipboard, and also in `Documents\FancyBot\token.txt`).
3. Click **Save**. You should see **"Saved."** followed by how many characters you have left this month. If you see a different message, see Troubleshooting.

The **About you** part at the top is optional. See section 14.

## 4. First use

1. Make sure the **Fancy Bot server window is open** (section 3.4).
2. Open **claude.ai**, **grok.com** or **gemini.google.com** and sign in as usual.
3. The Fancy Bot character appears near the **bottom-right corner** of the page. It starts small (size **S**): just the character and a status line.
4. **Click anywhere on the page once.** Browsers only allow sound after you've clicked or typed on a page.
5. Ask the AI a question, for example: *"What does it mean when a doctor says my blood pressure is 140 over 90?"*
6. As the answer appears, Fancy Bot starts reading it out loud. The words show up in the caption box (in the bigger sizes) and the character's mouth moves.

**See all the controls:** press and hold on the character for about half a second. A menu opens. Under **Size**, choose **M** or **L**. Now you can see the buttons, the character list, the reading level slider and more.

> **Tip:** Fancy Bot only reads **new** answers. Older answers already on the page aren't read when you open it. To hear an older one, select its text with your mouse and press the **❝** button.

## 5. Getting to know the widget

The floating box is called the **widget**. Here's what everything does (at size **M** or **L**).

### The top bar

| Part | What it does |
|---|---|
| **Colored dot** | Green = connected and ready. Orange = working on something. Red = a problem (read the status line at the bottom). |
| **?** | Opens **How Fancy Bot works**, a quick built-in help menu. |
| **👤** | Opens the settings page (your name, about you, language, connection). |
| **▾ / ▸** | Collapses the widget to just its top bar, or opens it again. |
| **The bar itself** | **Drag the top bar to move the widget** anywhere on the screen. It remembers where you put it. |

### The character

| Gesture | What happens |
|---|---|
| **Press and hold** (about half a second) | Opens the menu: **Size** (S, M, L), **Custom size** slider, **Characters** (tap one to switch), **Paraphrase**, **Mute/Unmute**, **💬 Assistant**, **Settings**, **❓ How it works**. |
| **Double-tap** | Opens the helper, where you can type requests like "talk slower". See section 11. |
| **Tap three times fast, or rub back and forth** | Tickles the character. It giggles and wiggles. (It won't interrupt the reading.) |

### The play buttons

| Button | What it does |
|---|---|
| **▶ / ❚❚** | Play or pause. If nothing has played yet, it reads the latest answer. |
| **↻** | Replay the last reading from the start. |
| **■** | Stop. |
| **❝** | Read the text you've selected with your mouse, or the latest answer if nothing is selected. Handy if Fancy Bot ever misses an answer. |

### The tabs

- **Listen**: your main choices: **Character**, **Reading level**, **Paraphrase**, **Humor**, **Philosophy**, **Speaking style**, **Town panel**, **Auto-read replies**, and the **🎬 Meme** video button.
- **Ask**: tools for the last AI answer: **Key points**, **Paraphrase**, **🌳 Paraphrase with Oakley**, a box to ask a follow-up, and **Expound**. See section 10.
- **Post**: shows up instead of **Ask** on X, Facebook and Instagram. See section 13.

**Auto-read replies:** when this is ticked (it is, to start with), every new answer is read automatically. Untick it if you'd rather press **▶** or **❝** only when you want to listen.

**The status line** at the bottom tells you what's happening, such as "Thinking in character...", which character is talking, or how many characters (letters) you have left this month.

## 6. The characters

Characters live in **Big Sal's World**, a town where good values make a better city. Pick one from the **Character** list on the **Listen** tab (each shows as *Name · Type*), or press and hold the character and tap a name under **Characters**.

**The core four** are Big Sal, Old Oakley, Big Play Ray and Elias Stillwater. They're the default crew for the Town strip and the Writers' room.

| Character | Type | What they're like |
|---|---|---|
| **Big Sal** *(default)* | Wise Mentor | A warm, wise, seriously smart old friend who cuts through jargon with everyday comparisons. Calls you "my friend". Great for doctor, legal and insurance talk. |
| **Old Oakley** | Spirit Guide | An ancient oak-tree spirit. Calm, deep and poetic ("Roots first, then branches"). Wonderful for paraphrasing big ideas. |
| **Big Play Ray** | Sports Announcer | High-energy 1980s sportscaster. Everything is a big play. The default comedic voice for Crib notes. |
| **Elias Stillwater** | Philosopher | Grand words, lots of metaphors, deep thoughts about meaning. |
| **Rusty Peters** | Reformed Troublemaker | A gruff, fast-talking former troublemaker who's learning to be good. He starts with a grumble but always talks himself into the kind, honest choice. |
| **Dash Dawson** | Accidental Genius | Fixes bikes at Big Sal's, explains things in rapid-fire chains of reasoning, then shrugs it off. Talks very fast. |
| **Jaden** | Town Kid | A friendly, curious kid with short, upbeat sentences. |
| **Jack Midnight** | Late-Night Storyteller | Smooth, calm, late-night-radio storytelling with a little mystery. |
| **The Pirate** | Friendly Pirate | A family-film pirate captain: "Ahoy, matey!" |
| **Captain Ada Quill** | Starship Engineer | Explains things like a calm starship engineer giving a status report. Good for tech questions. |
| **Granny Marigold** | Storytelling Grandmother | A gently funny grandma with stories from the kitchen and garden. |
| **Professor Pip** | Kid Scientist | An excitable ten-year-old science whiz. "Whoa, get this!" |
| **Sir Reginald Ledger** | Victorian Banker | A polite, slightly pompous gentleman banker who sees everything as accounts and investments. |

**Auto (match the topic):** pick this at the top of the Character list and Fancy Bot chooses a character based on what the answer is about (for example Big Sal for health questions, Big Play Ray for sports). The status line says "(auto-picked)" when it does this.

**Good to know:**

- Right now **Big Sal** and **Old Oakley** have their own drawings. The other characters appear as a colorful stand-in figure (each in its own color) until their artwork is ready.
- **Big Sal, Old Oakley, Big Play Ray, Elias Stillwater, Jaden, Jack Midnight and The Pirate** have their own voices. The rest use a backup voice (Big Sal's, unless a different fallback voice was entered in section 3.3).
- Some newer characters (Jaden, Jack Midnight, The Pirate) are still being developed, so their personalities may change.
- Every character is family-friendly: no swearing, and kindness, honesty and fairness come first.

## 7. Reading levels

The **Reading level** slider on the **Listen** tab works with **every** character. Its current setting is shown in bold above the slider.

| Level | Name | What it sounds like |
|---|---|---|
| 1 | **Super simple** | Very short sentences, everyday words only, every technical word explained, one simple comparison, and a one-sentence "bottom line" at the end. Great for kids or anyone hearing about a topic for the first time. |
| 2 | **Plain** *(default)* | Short sentences and common words. Jargon is explained the first time. The most important part comes first. |
| 3 | **Everyday** | Natural, conversational language. Unusual words are briefly explained. |
| 4 | **Detailed** | More precise words and fuller explanations. Technical terms are used when they help. |
| 5 | **Expert** | Rich, exact vocabulary and nuance, still easy to follow when spoken. |

**The facts never change.** At every level, Fancy Bot keeps every number, dose, amount, date, step, warning and safety instruction exactly as the AI said it. If the answer says to see a doctor or call emergency services, that advice stays in and stays clear. Fancy Bot never adds medical, legal or money advice of its own.

The reading level is about *plain language*, not about how smart anyone is. Experts like plain language too!

## 8. Add-ons and speaking styles

These sit under the reading level on the **Listen** tab and work with any character. You can mix and match.

**Add-ons** (tick to turn on):

| Add-on | What it does |
|---|---|
| **Humor** | Adds light, wholesome jokes and playful comparisons. Never jokes about anyone's pain, illness or identity, and never lets a joke blur a fact. |
| **Philosophy** | Adds one short, thoughtful reflection that connects the topic to a bigger life lesson. |
| **Paraphrase** | Gives a short retelling instead of reading the whole answer. See section 10. |

**Speaking style** (pick one from the list):

| Style | What it sounds like |
|---|---|
| **Character's own** *(default)* | The character's normal way of talking. |
| **Slow & patient** | Unhurried and warm, with pauses between ideas, and the key point repeated at the end. The voice also slows down. |
| **British English** | Polite, cheerful British word choices ("brilliant", "have a go"). |
| **Old-time storyteller** | Folksy, campfire-style narration with a little suspense. |
| **Hype announcer** | Big energy, punchy short lines. A bit faster. |
| **Rapid-fire genius** | Races from idea to idea like a brilliant mind thinking out loud, then sums it up in one line. The voice speeds up a lot. How deep it goes depends on the reading level. |
| **Friendly pirate** | "Ahoy", "matey" and sea comparisons, with the facts kept crystal clear. |

Speaking styles change *how* things are said (words and pace). They're never about anyone's race or where they're from.

## 9. The Town strip

Instead of one character, a group of 2 to 6 characters can share an answer, like a little town meeting.

1. On the **Listen** tab, tick **Town panel**.
2. A row of character names appears. The core four (Big Sal, Old Oakley, Big Play Ray, Elias Stillwater) are ticked to start with. Tick or untick names to choose your group. **You need at least 2. Up to 6 take part**, so keep it to 6 or fewer.
3. A strip with the chosen characters' faces appears along the **top of the screen**.
4. When the next answer is read, it's split into parts. Each part goes to the character whose interests fit it best, and they take turns with short handoffs, each in their own voice. The one speaking is highlighted and their mouth moves.
5. **Tap a face in the strip** to make that character your main character.

The Town strip is used for normal read-alouds (auto-read, **▶** and **❝**). Tools like Key points, Ask and Expound use just your main character. Untick **Town panel** to go back to one character.

## 10. Paraphrase, follow-up questions and going deeper

### Paraphrase ("so basically...")

A paraphrase is a short retelling in the character's own words, about a quarter of the length of the answer and usually 3 to 6 sentences. Important numbers, warnings and "see a professional" advice are still kept.

- **For every answer:** tick **Paraphrase** on the **Listen** tab.
- **Just once:** on the **Ask** tab, press **Paraphrase**. (It's also in the press-and-hold menu.)
- **🌳 Paraphrase with Oakley** (Ask tab) has Old Oakley give the paraphrase, whoever your main character is.

If you've entered your name in the settings (section 14), the character talks to you directly, something like: *"Sam, basically what Claude is telling you is..."*

### The Ask tab

All of these work on the **last AI answer** on the page.

| Button | What it does |
|---|---|
| **Key points** | The short version: just the main points. |
| **Paraphrase** | A plain-words retelling (see above). |
| **🌳 Paraphrase with Oakley** | The same, by Old Oakley. |
| **Ask** | Type a follow-up question in the box ("Ask about what it just said...") and press **Ask** or Enter. The character answers about that answer. |
| **Expound** | Goes deeper than the answer did. With real keys turned on, Fancy Bot can look things up on the web, and links to its sources appear under the caption. Type something in the box first if you want it to focus on one part. |

## 11. The helper (double-tap)

**Double-tap the character** (or choose **💬 Assistant** in the press-and-hold menu) to open a small box titled **"Tell me what you'd like"**. Type a request and press **Ask**. If your browser supports it, a **🎤** button lets you say it out loud instead (this doesn't work in every browser, but typing always does).

Things you can say:

- "switch to Old Oakley" (use the character's full name, like "Big Play Ray")
- "talk slower" / "talk faster" / "British accent" / "normal voice"
- "talk like a genius" (this also switches you to Dash Dawson, the town genius)
- "simpler please" / "more detail"
- "make it funny" / "no jokes"
- "add some wisdom" / "no philosophy"
- "paraphrase" / "stop paraphrasing"
- "bigger" / "smaller"
- "mute" / "unmute"
- "who would explain this like a coach?" (it picks a character for you)

The helper changes the setting and tells you what it did.

## 12. Making an MP4 video

You can turn the last reading into a short video of the character talking, with captions, to share however you like.

1. Let Fancy Bot read an answer (or a crib note) all the way through.
2. On the **Listen** tab, press **🎬 Meme**. (On social media sites, use **🎬 Make video** on the **Post** tab.)
3. A progress bar appears. The video is made in **real time**, so a 30-second reading takes about 30 seconds. **Keep the tab open and in front** while it works. You won't hear anything during this; that's normal.
4. The video downloads to your **Downloads** folder, named after the character (for example `big-sal-1731500000000.mp4`).

The video is square (good for most social apps) and shows the character with its mouth moving, its name, and the words scrolling underneath. If several characters spoke (Town strip or Writers' room), they all appear along the top and the speaker is highlighted.

If your browser can't make MP4 files, Fancy Bot saves a **WebM** video instead and tells you so.

## 13. Crib notes on social media

On **X (Twitter)**, **Facebook** and **Instagram**, Fancy Bot doesn't read AI answers. Instead it helps you get the gist of a post and, if you like, write a reply.

> **Important: Fancy Bot never posts, comments, types or sends anything for you.** It only shows you text or makes a video. **You** decide whether to copy it, edit it, and post it yourself. Always read it first.

### Getting crib notes

1. Move your mouse over a post (or tap it on a touch screen). A purple **🎭 Crib notes** button appears on the post's top-right corner.
2. Click it. The character sums up the post in **2 or 3 short, witty lines** (under 280 characters), keeping the key facts.
3. The jokes are about ideas, never about the person. Serious or sad posts get a kind summary with no jokes.

You can also use the **Post** tab in the widget (it replaces the Ask tab on these sites) and press **🎭 Crib notes**. It uses the post that's most visible on your screen.

### The Post tab

| Control | What it does |
|---|---|
| **Comedic voice** | Who writes the crib notes and replies. Starts as **Big Play Ray**. Choose any character, or **Same as my character**. |
| **🎭 Crib notes** | Sums up the post (see above). |
| **💬 Draft reply** | Writes a short reply (1 to 3 sentences, under 280 characters) in the comedic voice. Type **Your angle for the reply (optional)** in the box below first if you want it to make a particular point. |
| **🎬 Writers' room scene** | A tiny comedy scene about the post (see below). |
| **🔥 What's hot on this page** | Optional. Ranks posts already on your screen (see below). |

When the crib notes, reply or scene is ready, three buttons appear:

- **📋 Copy text**: copies it so you can paste it wherever you like.
- **🎬 Make video**: makes an MP4 of the character saying it (section 12).
- **↩ Open reply box**: copies the text **and** opens the site's own reply box for that post. Then **you** paste the text, attach the video if you made one, and press the site's post button yourself, if you decide to.

The reminder **"You review it and post it yourself."** is always shown there.

### Writers' room scene

1. On the **Post** tab, under **🎬 Writers' room scene**, tick 2 to 4 characters for the cast (the core four are ticked to start with).
2. Pick a **Director** (Big Sal to start with).
3. Press **🎬 Writers' room scene**. Each cast member pitches a line, and the director turns the best ones into a short 4 to 8 line mini-scene. Each line is spoken by its own character, and the cast shows along the top of the screen.
4. Press **🎬 Make video** for a video with the whole cast.

The humor is original and clean: no copying of TV shows or comedians, no swearing, and no jokes about the person who posted.

### What's hot on this page

Tick **🔥 What's hot on this page** to see the top posts **already loaded on your screen**, ranked by the likes, reposts, replies and views shown on them, and by topics they share. Tap one to scroll to it and make it the post for Crib notes, Draft reply or the scene. Press **↻** to refresh the list after scrolling. It never looks anything up outside the page you're viewing.

### Limits

To keep Fancy Bot a personal helper (not a robot that churns out replies), crib notes, replies and scenes are limited to about **6 a minute and 120 a day**. If you go faster, you'll see "Slow down a little: try again in ... s."

## 14. Your profile and language

Click **👤** on the widget (or **Settings** in the press-and-hold menu) to open the settings page. The **About you** section is optional:

| Setting | What it does |
|---|---|
| **Your name** | Characters use it now and then, e.g. "Sam, basically what Claude is telling you is..." |
| **About me** | Your job, skills and interests. Characters pick examples from your world (for example, car comparisons for a mechanic). |
| **Age group** | Kid, Teen, Adult, Senior or Prefer not to say. Helps characters pitch the explanation. |
| **Language characters speak** | Starts as **Same as this browser**. Choose another language and the characters answer in it. |

The **Connection** section holds the **Middleware URL** (`http://localhost:8787`), your **Session token**, and **Auto-read new replies**. Click **Save** after any change.

The widget's buttons are in English or Spanish, depending on your browser's language. The characters can speak many more languages.

## 15. Updating Fancy Bot

1. Close the Fancy Bot server window if it's open.
2. **If you have Git for Windows:** just go to step 3. **If you don't:** download a fresh ZIP from the GitHub page (**Code > Download ZIP**) into your **Downloads** folder first. The setup always uses the newest ZIP there, and warns you if the ZIP looks old.
3. Open **Documents\\FancyBot\\scripts** and double-click **`fancybot-setup.bat`**. It updates the code, keeps your token and keys, and starts the server again.
4. In your browser, go to `brave://extensions` (or `chrome://extensions`) and click the **reload arrow** on the **Fancy Bot** card.
5. **Refresh** any Claude, Grok, Gemini, X, Facebook or Instagram tabs you have open.

## 16. Stopping Fancy Bot

| To... | Do this |
|---|---|
| **Hide the character** on the page | Click the Fancy Bot icon in the browser toolbar. Click it again to bring it back. |
| **Silence it** | Press and hold the character, then tap **Mute** (tap **Unmute** to undo). |
| **Stop it reading automatically** | Untick **Auto-read replies** on the Listen tab. |
| **Stop the current reading** | Press **■**. |
| **Turn Fancy Bot off completely** | Close the **Fancy Bot server window**. To start again later, double-click `fancybot-setup.bat` in **Documents\\FancyBot\\scripts**. |
| **Remove Fancy Bot** | On `brave://extensions` (or `chrome://extensions`), click **Remove** on the Fancy Bot card. Then delete the **Documents\\FancyBot** folder. (That also deletes your saved keys and token.) |

## 17. Troubleshooting

**First, check the two basics:** Is the **Fancy Bot server window open**? Is the **dot** on the widget green? Most problems come from one of these.

You can also check the server by opening `http://localhost:8787/health` in your browser. It should show `"ok": true`.

### The server window closed, or the widget says it can't reach the server

Messages like **"Middleware unreachable at http://localhost:8787"**, **"Cannot reach the middleware at..."** or, on the settings page, **"Saved, but no Fancy Bot server is answering..."** all mean the server isn't running.

- Double-click **`fancybot-setup.bat`** in **Documents\\FancyBot\\scripts** and wait for "Fancy Bot is running".
- Keep that window open (minimize it instead of closing it).
- Then refresh the AI page.

### The setup window shows an error

| Message | What to do |
|---|---|
| **"Node.js is not installed"** | Install the LTS version from nodejs.org (section 3.1), then run setup again. |
| **"Node.js ... is too old"** | Install the current LTS (22.9 or newer) from nodejs.org, then run setup again. |
| **"Could not download the code"** | A GitHub page opens. Click **Code > Download ZIP**, leave the ZIP in **Downloads**, and run setup again. |
| **"Port 8787 is being used by another program"** | Close the program named in the message (or restart your PC) and run setup again. |
| **"npm install failed"** | Check your internet connection and try again. |
| **"The Fancy Bot server did not start"** | Take a screenshot of the window and send it to whoever gave you Fancy Bot. |

### No sound

- **Click somewhere on the page once.** Browsers block sound until you've clicked or typed on the page. If the status line says **"Press ▶ to start audio (the browser blocked autoplay)"**, press **▶**.
- Check that Fancy Bot isn't muted: press and hold the character; if the menu shows **Unmute**, tap it.
- Check your computer's volume, and that the browser tab isn't muted (right-click the tab and look for **Unmute site**).
- **Only hearing babbling instead of words?** You're in **test mode**: no keys have been added, or the keys couldn't be read. See "Keys" below.
- **"This site blocked audio playback; captions only."** The page blocked sound. Try refreshing the page.

### Token missing or rejected

- **"Add your session token in the extension options."** or **"Paste your token first (it starts with vk_)."**: open the settings page (click **👤**), paste the token from `Documents\FancyBot\token.txt` into **Session token**, and click **Save**.
- **"Session token rejected."** or **"Saved, but the server does not recognize this token..."**: make sure only **one** Fancy Bot server window is open. Close them all, run `fancybot-setup.bat` once, then paste the token it shows and click **Save**.

### The widget isn't showing

- Fancy Bot only appears on **claude.ai, grok.com, gemini.google.com, x.com, facebook.com** and **instagram.com**.
- Click the **Fancy Bot icon** in the toolbar. It may have been hidden.
- **Refresh the page.** This is needed after installing, reloading or updating the extension.
- On `brave://extensions` (or `chrome://extensions`), check that the **Fancy Bot** card is switched **on**. If it shows **Errors**, click the reload arrow.
- It might be tiny or tucked in a corner: it starts small near the bottom-right of the page.

### The character didn't read an answer

- Check **Auto-read replies** is ticked on the Listen tab.
- AI websites change their design from time to time, which can confuse Fancy Bot. Select the answer's text with your mouse and press **❝**. That always works.
- Code samples in an answer are skipped (you'll hear "code sample" instead).

### Keys

- Run **`fancybot-keys.bat`** again (in **Documents\\FancyBot\\scripts**). At the end it shows **Words:** and **Voices:**. If either says `mock`, that part is still in test mode.
- An Anthropic key should start with `sk-ant-`. The window warns you if it doesn't.
- **After changing keys, close the server window and run `fancybot-setup.bat` again.** The server only reads your keys when it starts. The setup window then says "Using your keys from ... (words: anthropic, voices: fish)".
- If characters suddenly go quiet or show errors, check that the Anthropic and Fish Audio accounts still have credit.

### Other messages

| Message | Meaning |
|---|---|
| **"Monthly character quota reached."** | You've used this month's allowance (500,000 characters on the standard setup). It resets next month. |
| **"Slow down a little: try again in ... s."** | The social media limit (section 13). Wait a few seconds. |
| **"Message too long to read aloud; the rest was skipped."** | Very long answers are cut off. Select a part and press **❝**. |
| **"No post found. Scroll a post into view or tap 🎭 on one."** | On social media, scroll so a post is on screen, or use the 🎭 button on the post itself. |
| **"Could not find the reply button on this post."** | The text was still copied. Open the reply box yourself and paste it. |
| **"Play a reply first, then export it."** | Let Fancy Bot read something before pressing 🎬. |

## 18. Privacy

- **Your keys stay on your PC.** They're saved only in `Documents\FancyBot\keys.env` on your computer. The key window hides what you type. **Never share or upload that file**, and never paste keys into a chat or email.
- **Your token** is saved in `Documents\FancyBot\token.txt` and in your browser. It only works with the Fancy Bot server on your own PC.
- **Your profile** (name, about me, age group, language) is stored in your browser only. It's sent along with each request so the character can talk to you personally, and isn't saved by the server.
- **What leaves your PC:** to write the character's words and voice, the Fancy Bot server sends the text being read (the AI answer or social post, plus your profile and settings) to **Anthropic** (for the words) and **Fish Audio** (for the voice), using your keys. In test mode nothing is sent anywhere.
- **What Fancy Bot reads:** the extension only works on the six sites listed above, and only talks to your own Fancy Bot server.
- **No posting, ever.** Fancy Bot never posts, comments or sends messages on any site for you.
- **Grown-ups:** the AI websites themselves have their own age rules and privacy policies. Fancy Bot's characters are family-friendly, but please supervise kids on AI and social media sites.

## 19. Frequently asked questions

**Do I have to keep the server window open?**
Yes. That window is the Fancy Bot server. Minimize it, but don't close it while you're using Fancy Bot.

**Does Fancy Bot cost anything?**
The Fancy Bot files are free to download. Real voices and rewrites use Anthropic and Fish Audio, which charge the owner of the keys for what they use. Test mode is free.

**Do I have to run the setup every time I turn on my PC?**
Yes. After a restart, double-click `fancybot-setup.bat` in **Documents\\FancyBot\\scripts** to start the server again. It also checks for updates each time.

**Can I use it on a Mac, phone or tablet?**
The setup in this guide is for Windows PCs with Brave, Chrome or Edge.

**Does it work in other browsers like Firefox or Safari?**
No. It needs Brave, Google Chrome or Microsoft Edge.

**Will Fancy Bot post on my social media?**
No, never. It only shows you text and makes videos. You copy and post things yourself, if you choose to.

**Is it safe for kids?**
Characters are family-friendly by design: no swearing, kind humor, and jokes about ideas, never people. Facts and safety warnings are always kept. A grown-up should still supervise, and set up the keys.

**Does a lower reading level mean less accurate?**
No. The words get simpler, but numbers, doses, dates, warnings and "see a doctor" advice are always kept exactly.

**Why do most characters look like the same blob in different colors?**
Only Big Sal and Old Oakley have their finished artwork so far. The others use a colored stand-in until theirs is ready.

**Why does a character sound like Big Sal?**
Characters without their own voice yet borrow the fallback voice, which is Big Sal's unless you chose another in `fancybot-keys.bat`.

**Can I change my keys later?**
Yes. Run `fancybot-keys.bat` again, then close the server window and run `fancybot-setup.bat`.

**Where are my files?**
Everything lives in **Documents\\FancyBot**: `code` (the program), `data` (your account and usage), `scripts` (the setup and key files), `keys.env` (your keys) and `token.txt` (your token). Videos go to your **Downloads** folder.

**Can I move the character out of the way?**
Yes. Drag it by its top bar, make it smaller (press and hold, then **S**), collapse it with **▾**, or hide it with the toolbar icon.

---

*Fancy Bot by Say It Fancy Productions · getfancybot.com*
