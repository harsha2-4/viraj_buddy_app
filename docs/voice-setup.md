# Animated voice Buddy (0.2)

The web app now keeps the conversation on screen using OpenAI Realtime WebRTC.
Buddy is an illustrated boy with a fixed smile: his head and arms gesture during
audio playback, with listening and thinking poses between turns. No lip sync is
attempted. Transcript topic words select eight bundled SVG scenes (home, space,
ocean, garden, animals, dinosaurs, music, counting). Pictures animate while Buddy
speaks and respect reduced motion. They are illustrative topic matches, not
generated images or exact depictions of every sentence. Captions appear as the
response arrives; topic changes may slightly precede the corresponding audio.

## Run locally

Use Node 22.9 or newer. There are no npm dependencies.

1. Copy `.env.example` to `.env` in the repository root.
2. Set `OPENAI_API_KEY` there.
3. Run `npm start`, then open `http://localhost:8080`.
4. Choose **Talk to Buddy** and allow microphone access. Use **Mute microphone** or
   **End conversation** at any time.

Never enter your API key in the app or commit it. Only the server uses it.
The voice endpoint is intentionally available without a family code. Anyone who
can reach the public app can start a session. The Origin check rejects ordinary
cross-site browser requests, but is not authentication. The server limits
connection attempts to eight per minute per source address; this is not a billing
cap. Set the lowest available API usage budget and billing alerts, and verify
whether your budget blocks requests or only sends notifications. Audio goes
directly to OpenAI; the server exchanges connection offers and does not record
audio or transcripts. Voice transcripts are saved in the browser's local storage
on that device, not on the server. Parents can review and clear them in
**Parents → Conversation history**. The browser retains up to 50 conversations.
At the start of a later voice session, a bounded excerpt of recent history is sent
to OpenAI for conversational context. The app does not access the separate
ChatGPT project's history, and the photo/ChatGPT flow remains independent.
API usage requires a funded API account and is separate from a ChatGPT subscription.

## Buddy's master prompt and history

Edit `server/master-prompt.md` to change Buddy's consistent voice behavior and
safety guidance. The server reads this Markdown file when each new voice session
starts, so edits apply to new sessions without a code change. It is sent as the
Realtime session instruction; it is separate from the short welcome instruction
used to begin each session. The prompt is guidance, not a substitute for adult
supervision or product safety controls.

The voice output defaults to OpenAI Realtime's `ash` voice, a masculine-sounding
option; set `OPENAI_REALTIME_VOICE` in the server environment to another
supported Realtime voice if desired. Realtime voice choices are separate from
the voice selected in the ChatGPT app, so the API cannot automatically mirror an
account's ChatGPT voice. Sillyface opens each session with a fresh topic and
uses the recent conversation excerpt, when available, to avoid repeating the
most recent theme.

Voice activity detection uses a higher speech threshold and a longer silence
window so incidental sounds are less likely to start a turn. Barge-in is disabled,
and Sillyface's session instructions prioritize Viraj's words when voices
overlap. The defaults request browser echo cancellation, noise suppression, and
automatic gain control when the browser reports support. Realtime noise
reduction defaults to `near_field`; `far_field` is available for more distant
tablet microphones. VAD configuration cannot be lowered below a 0.5 threshold,
300 ms prefix padding, or 1000 ms silence window, preserving time for a child's
soft or paused speech. These features reduce noise; they do not identify who is
speaking.

The server defaults are `OPENAI_REALTIME_NOISE_REDUCTION=near_field`,
`OPENAI_REALTIME_VAD_THRESHOLD=0.7`,
`OPENAI_REALTIME_VAD_PREFIX_PADDING_MS=300`, and
`OPENAI_REALTIME_VAD_SILENCE_DURATION_MS=1000`. Use `far_field` only when the
tablet microphone is farther away. The threshold can be tuned from 0.5 to 0.8;
prefix padding and silence are kept at or above 300 ms and 1000 ms so a child's
pauses are not prematurely treated as a completed turn.

User transcripts are captured using Realtime input transcription and stored
locally alongside Buddy's completed reply transcripts. Audio is not saved by the
app. Browser storage can be removed by clearing site data, uninstalling the PWA,
or browser/OS storage cleanup. Use **Clear conversation history** in Parents
settings to delete the saved records yourself.

## Host for phones and Fire tablets

Run the Node server behind HTTPS on a host that supports a persistent Node process.
Set `HOST=0.0.0.0`, the host's `PORT`, and `BUDDY_ORIGIN` to the exact HTTPS origin
(no trailing slash). Serve the app and `/api/session` together at the origin root.
Store the API key using the host's environment settings. Static GitHub Pages
hosting alone cannot run voice. The existing Pages workflow only deploys the UI.

For Android, set `voiceAppUrl` in `web/js/config.js` to this hosted HTTPS URL and
rebuild the APK. **Talk to Buddy** opens the hosted experience inside a restricted
WebView; only the configured origin can request microphone permission. External
links open outside the voice screen. Use an updated Android System WebView with
WebRTC support; test on the actual Fire device before distributing. iPhone uses
the same hosted app in Safari or as a Home Screen PWA.

Leaving or backgrounding the voice screen ends the media session. Sessions in the
UI stop after ten minutes. The endpoint is public and the backend limits connection
attempts to eight per minute per source address; this is not authentication or a
hard billing limit. Configure API usage budgets and alerts before public deployment.
Behind a proxy, the per-address limit is shared unless
the host preserves source addresses; forwarded headers are deliberately untrusted.

## Validation

`npm test` exercises scene selection, playback state handling, origin checks,
server failures, static-file boundaries, and offline caching. `python scripts/validate.py`
checks asset references and Android resources. Live calls require your credentials,
HTTPS, and microphone access; mocked tests cannot verify voice quality or device support.
With Playwright and Chromium available, run `node scripts/voice-browser.cjs` for
responsive screenshots and mocked browser call lifecycle checks. Optional environment
overrides: `BUDDY_PLAYWRIGHT_MODULE` (module path), `BUDDY_CHROME_PATH` (browser executable).

Integration follows [OpenAI WebRTC documentation](https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime)
and [Realtime conversation events](https://developers.openai.com/api/docs/guides/realtime-conversations).
