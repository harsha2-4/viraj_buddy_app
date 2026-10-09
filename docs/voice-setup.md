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
2. Set `OPENAI_API_KEY` and a long, private `BUDDY_ACCESS_CODE` there.
3. Run `npm start`, then open `http://localhost:8080`.
4. Choose **Talk to Buddy**, enter the family access code, and start with a grown-up.
5. Allow microphone access. Use **Mute microphone** or **End conversation** at any time.

Never enter your API key in the app or commit it. Only the server uses it.
The family code is a shared access credential: use a strong random value and keep
it private. The app holds it only in page memory. Audio goes directly to OpenAI;
the server exchanges connection offers and does not record audio or transcripts.
This is a new API conversation, not the existing ChatGPT project's history.
API usage requires a funded API account and is separate from a ChatGPT subscription.

## Host for phones and Fire tablets

Run the Node server behind HTTPS on a host that supports a persistent Node process.
Set `HOST=0.0.0.0`, the host's `PORT`, and `BUDDY_ORIGIN` to the exact HTTPS origin
(no trailing slash). Serve the app and `/api/session` together at the origin root.
Store the two secrets using the host's environment settings. Static GitHub Pages
hosting alone cannot run voice. The existing Pages workflow only deploys the UI.

For Android, set `voiceAppUrl` in `web/js/config.js` to this hosted HTTPS URL and
rebuild the APK. **Talk to Buddy** opens the hosted experience inside a restricted
WebView; only the configured origin can request microphone permission. External
links open outside the voice screen. Use an updated Android System WebView with
WebRTC support; test on the actual Fire device before distributing. iPhone uses
the same hosted app in Safari or as a Home Screen PWA.

Leaving or backgrounding the voice screen ends the media session. Sessions in the
UI stop after ten minutes. The backend limits connection attempts to eight per
minute per source address; this is a small-family starter, not multi-user account
authentication or a hard billing limit. Configure API project spending controls
before public deployment. Behind a proxy, the per-address limit is shared unless
the host preserves source addresses; forwarded headers are deliberately untrusted.

## Validation

`npm test` exercises scene selection, playback state handling, origin/auth checks,
server failures, static-file boundaries, and offline caching. `python scripts/validate.py`
checks asset references and Android resources. Live calls require your credentials,
HTTPS, and microphone access; mocked tests cannot verify voice quality or device support.
With Playwright and Chromium available, run `node scripts/voice-browser.cjs` for
responsive screenshots and mocked browser call lifecycle checks. Optional environment
overrides: `BUDDY_PLAYWRIGHT_MODULE` (module path), `BUDDY_CHROME_PATH` (browser executable).

Integration follows [OpenAI WebRTC documentation](https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime)
and [Realtime conversation events](https://developers.openai.com/api/docs/guides/realtime-conversations).
