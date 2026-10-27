# Architecture

## Voice application

```text
iPhone Safari/PWA or Fire Android wrapper
  → named local profiles, per-user localStorage history and derived voice settings in IndexedDB
  → local MediaRecorder segmentation and VAD
  → same-origin Node API
  → Groq STT → Groq LLM + exact master prompt → Groq WAV TTS
  → ordered playback and listening resumes in foreground
```

`server/index.mjs` serves the `web/` directory and API routes. `server/groq-config.mjs`
validates fixed model IDs and server settings. The Groq key is used only in the
backend `Authorization` header. API calls require the configured parent code and
exact `BUDDY_ORIGIN`; rate and usage counters are in memory.

`server/master-prompt.md` is the authoritative personality and safety prompt.
The server reads its complete contents as UTF-8 and places them in the first
`system` message. A second server-generated system message may carry only the
validated pitch and voice-level categories from the profile; arbitrary client
text is never used for that message. Enrollment samples are analyzed on-device,
discarded, and never uploaded. The derived profile stays in browser IndexedDB.
The recorded SHA-256 in
`server/master-prompt.sha256` is checked by the tests. Prior turns are bounded
user/assistant messages from browser local storage; they cannot replace the
system prompt.

The browser applies supported microphone constraints, captures a short pre-roll,
detects speech with adaptive RMS energy, and waits for end-of-speech silence.
Completed utterances are uploaded as their browser-selected MediaRecorder format.
The mic is disabled during reply generation/playback to prevent feedback. TTS
responses longer than 200 characters are divided at punctuation/word boundaries
and played in order. Device/browser suspension can stop foreground microphone use.

`web/js/profiles.js` validates and stores named local profiles. Each profile ID
namespaces conversation history and its rough voice settings; selecting a
different profile cannot share the previous profile's history or voice hints.
The selected profile ID is kept locally and restored on reload until the user
logs out or switches users. The first-run welcome flow requires an explicit user choice. Existing legacy
single-user history and voice data stay unassigned until a user chooses the
restore action and provides a name. Enrollment audio is analyzed locally and
discarded; only coarse derived pitch and energy bands are stored and sent.

`web/js/animations.js` maps welcome and voice states to the existing animated character.
`web/js/scenes.js` selects allowlisted local illustrations from both the child's
transcript and Buddy's reply, with a validated optional visual-hint extension point.
Scene motion cues use only catalogued CSS animations and pause outside Buddy's
speaking state; reduced-motion preferences remain respected. `history.js`
stores up to 50 conversations per local profile and shares a maximum of 12 recent
messages with the API on a new turn. A voice profile is not speaker identification,
authentication, or voice filtering.

## Launcher and photo path

The PWA and native Kotlin launcher retain the existing ChatGPT photo destination.
`CONFIG.chatgptUrl` is a public URL setting, not a credential. `CONFIG.voiceAppUrl`
sets the hosted HTTPS server opened by the Android wrapper. Do not put a Groq key
or parent code in frontend config.

The service worker caches an exact allowlist of static assets only. It does not
cache API requests, responses, credentials, audio or conversation transcripts.
GitHub Pages can publish a static preview, but it cannot host the Node API; use
one persistent HTTPS origin or a same-origin proxy for the voice feature.
