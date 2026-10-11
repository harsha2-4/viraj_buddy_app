# Web application

The plain HTML, CSS, SVG and ES modules are served by `server/index.mjs` along
with the same-origin Groq API routes. For live voice, configure the repository
root `.env` and run `npm start`; see [voice setup](../docs/voice-setup.md). A
static preview can be served with `python -m http.server 8080`, but it cannot
provide the API.

The server uses Groq Whisper Large V3 Turbo for STT, GPT-OSS 20B for conversation,
and Orpheus English (`troy`) for WAV TTS. Conversation personality and safety
come from `server/master-prompt.md`, which must stay byte-identical to the
recorded hash in `server/master-prompt.sha256`.

`Talk to Buddy` starts local voice activity detection and uploads complete speech
segments. The browser uses the best supported MediaRecorder MIME type, waits for
end-of-speech silence, mutes capture during generated playback and resumes while
the foreground page is active. `AvatarController` maps voice states to the
existing character, and `SceneController` maps reply topics to bundled art.
Conversation history remains in browser local storage on that device and can be
reviewed or cleared in Parents settings.

`CONFIG.chatgptUrl` in `js/config.js` remains the separate photo destination.
`CONFIG.voiceAppUrl` is used by the Android wrapper to locate the hosted voice
server. The service worker caches the local shell only, never API responses or
credentials. Increment `VERSION` in `service-worker.js` after shell changes.
