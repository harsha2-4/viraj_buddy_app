# Architecture

## Voice application

```text
iPhone Safari/PWA or Fire Android wrapper
  → web assets and localStorage history
  → local MediaRecorder segmentation and VAD
  → same-origin Node API
  → Groq STT → Groq LLM + exact master prompt → Groq WAV TTS
  → ordered playback and listening resumes in foreground
```

`server/index.mjs` serves the `web/` directory and API routes. `server/groq-config.mjs`
validates fixed model IDs and server settings. The Groq key is used only in the
backend `Authorization` header. API calls require the configured parent code and
exact `BUDDY_ORIGIN`; rate and usage counters are in memory.

`server/master-prompt.md` is the only conversational instruction source. The
server reads its complete contents as UTF-8 and places them in the `system`
message. The recorded SHA-256 in `server/master-prompt.sha256` is checked by the
tests. Prior turns are bounded user/assistant messages from browser local storage;
they cannot replace the system prompt.

The browser applies supported microphone constraints, captures a short pre-roll,
detects speech with adaptive RMS energy, and waits for end-of-speech silence.
Completed utterances are uploaded as their browser-selected MediaRecorder format.
The mic is disabled during reply generation/playback to prevent feedback. TTS
responses longer than 200 characters are divided at punctuation/word boundaries
and played in order. Device/browser suspension can stop foreground microphone use.

`web/js/animations.js` maps voice states to the existing animated character.
`web/js/scenes.js` selects local illustrations from conversation text. `history.js`
stores up to 50 conversations in local storage and shares a maximum of 12 recent
messages with the API on a new turn. Raw audio is not persisted by the app.

## Launcher and photo path

The PWA and native Kotlin launcher retain the existing ChatGPT photo destination.
`CONFIG.chatgptUrl` is a public URL setting, not a credential. `CONFIG.voiceAppUrl`
sets the hosted HTTPS server opened by the Android wrapper. Do not put a Groq key
or parent code in frontend config.

The service worker caches an exact allowlist of static assets only. It does not
cache API requests, responses, credentials, audio or conversation transcripts.
GitHub Pages can publish a static preview, but it cannot host the Node API; use
one persistent HTTPS origin or a same-origin proxy for the voice feature.
