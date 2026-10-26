# Viraj AI Buddy

Viraj AI Buddy is a voice conversation PWA with an animated character, topic
illustrations, on-device conversation history, parent settings, and a separate
ChatGPT photo launcher. The voice backend is a small Node.js server. Browser
audio is segmented locally and sent to Groq only after speech is detected.

## Voice architecture

```text
Browser microphone → local VAD and MediaRecorder → Node API
  → Groq Whisper STT → Groq chat with server/master-prompt.md
  → Groq Orpheus WAV TTS (device speech fallback) → listen again
```

The backend uses these fixed model IDs:

| Service | Groq model | Endpoint |
| --- | --- | --- |
| Speech recognition | `whisper-large-v3-turbo` | `/audio/transcriptions` |
| Conversation | `openai/gpt-oss-20b` | `/chat/completions` |
| Speech | `canopylabs/orpheus-v1-english`, voice `troy` | `/audio/speech` |

The API key stays on the server. Voice starts directly from **Talk to Buddy**;
there is no app access-code prompt. API routes check the exact app origin and
have an in-memory per-IP rate limit. Keep the server private or behind HTTPS and
configure a host-level spend limit as well as the local estimated daily guard.

## Master prompt integrity

`server/master-prompt.md` is the authoritative personality and safety prompt.
The server reads the file as UTF-8 without trimming it and sends those exact
contents as the LLM system message. Its current SHA-256 is recorded in
`server/master-prompt.sha256`; `npm test` fails if any prompt byte changes. The
hash was updated with this authorized child-voice prompt change.

## Setup and run

Use Node.js 22.9 or newer. The repository uses Node's built-in HTTP server and
`fetch`; there are no installed npm dependencies.

```powershell
Copy-Item .env.example .env
# Edit .env: set GROQ_API_KEY.
npm start
```

Open `http://localhost:8080`, choose **Talk to Buddy**, and allow microphone
access. Before the first voice adventure, **Parents** asks a grown-up to approve
and record a short child voice sample. The raw sample and derived profile are
kept in browser IndexedDB until deleted in Parents settings. Only rough pitch
and voice-level categories accompany reply requests to Groq; the raw sample is
never uploaded. Live conversation recordings are still sent to Groq for
transcription. The profile cannot identify a speaker or filter other voices.
In **Parents**, **Check voice setup** calls Groq's models API to confirm
the configured account exposes all three model IDs. Local development works on
localhost; phones and PWAs need the hosted service over HTTPS.
If Groq's Orpheus TTS is unavailable (for example, while its terms are pending),
Buddy uses the device's built-in speech synthesis for spoken replies.

## Configuration

`.env.example` documents the full server configuration. The required production
secret is `GROQ_API_KEY`. Model settings are pinned to the required IDs; attempts
to override them with a legacy model are rejected.
`BUDDY_ORIGIN` must match the exact origin serving the app. Keep actual secrets in
the hosting provider's secret manager and never commit `.env`.

Microphone VAD and browser constraints can be tuned with `VOICE_*` settings.
`GROQ_DAILY_SPEND_LIMIT_USD` is an in-memory server-side estimate guard that resets
at UTC midnight; it is not a billing meter or a substitute for Groq account
limits. Unit rates are configurable and estimates can differ from provider
invoices. Authenticated `GET /api/voice/usage` reports daily request counts,
tokens, audio seconds, latency and the estimated cost.

The Orpheus endpoint accepts at most 200 characters per request. The browser
splits longer replies at sentence and word boundaries, requests WAV chunks in
order, and plays them sequentially. If a Groq speech request fails, it reads the
remaining reply aloud using the browser's built-in speech synthesis; no alternate
paid TTS provider is configured.

## Test and validate

```powershell
npm test
python scripts/validate.py
```

`npm test` uses mocked Groq responses; it makes no billable API calls. Check
availability with **Parents → Check voice setup** or call authenticated
`GET /api/voice/models`. There is no production build step. Run the backend with
`npm start` to verify server initialization and frontend delivery. The automated
suite exercises API routing and prompt integrity, but physical microphone, audio
playback and voice quality still need iPhone Safari, iPhone Home Screen PWA, and
Fire HD 10 browser/WebView testing.

## Deployment

GitHub Pages hosts only static files and cannot provide the voice API. Deploy the
Node process on an HTTPS host, serve the web app and `/api/voice/*` at one origin,
and set these host values:

```text
HOST=0.0.0.0
PORT=<host-provided port>
BUDDY_ORIGIN=https://your-voice-host.example
GROQ_API_KEY=<host secret>
```

The voice API has no app access-code gate; keep the server private or add
host-level access controls before exposing it publicly. Keep the static app and
API same-origin, or configure a same-origin reverse proxy.
For Android's native launcher, set `voiceAppUrl` in `web/js/config.js` to the
HTTPS server URL and rebuild the APK. For iPhone, open that URL in Safari and use
**Add to Home Screen**. Existing PWA icons should receive the updated service
worker shell without removing and reinstalling the shortcut. See
[voice setup](docs/voice-setup.md), [iPhone installation](docs/iphone-installation.md),
and [Fire tablet installation](docs/fire-tablet-installation.md).

## Privacy and limitations

The app does not persist raw conversation audio on its server. The short
enrollment sample is intentionally saved in browser IndexedDB on that device
until removed with **Parents → Delete voice profile**. Its approximate pitch
and voice-level categories accompany reply requests to Groq; live conversation
audio is sent to Groq for transcription, and transcripts/replies are saved in
browser local storage and sent as bounded recent history. Enrollment does not
identify speakers, authenticate the child, or filter out other voices. A parent
should stay with the child and remove the saved profile when it is no longer
needed. Rate and spend counters are in memory and reset when the server
restarts. HTTPS, host-level authentication/rate controls and provider billing
limits are needed for a public deployment. Browser microphone access cannot
continue while an iPhone is locked or the browser suspends the page. No actual
iPhone or Fire device was tested by the repository checks.

The separate photo action still opens the configured ChatGPT destination. It is
not part of the Groq voice session. Change that destination only in
`web/js/config.js`; never put a token or API key there.
