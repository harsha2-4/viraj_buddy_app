# Groq voice setup

The Node server provides three separate Groq calls. The browser never receives
the Groq API key.

| Purpose | Model | Endpoint |
| --- | --- | --- |
| STT | `whisper-large-v3-turbo` | `POST /audio/transcriptions` |
| LLM | `openai/gpt-oss-20b` | `POST /chat/completions` |
| TTS | `canopylabs/orpheus-v1-english`, voice `troy`, WAV | `POST /audio/speech` |

All upstream requests use `https://api.groq.com/openai/v1`. See the [Groq speech
recognition docs](https://console.groq.com/docs/speech-to-text), [chat API
reference](https://console.groq.com/docs/api-reference), [Orpheus TTS
docs](https://console.groq.com/docs/text-to-speech/orpheus), and [models
API](https://console.groq.com/docs/models).

## Local start

Node.js 22.9 or newer is required. No package install is needed.

```powershell
Copy-Item .env.example .env
# Edit .env and set GROQ_API_KEY.
npm start
```

Open `http://localhost:8080` and tap **Talk to Buddy** to start; no server access
code is required. Voice requires microphone permission. In **Parents**, **Check
voice setup** checks the account's model list. Use **Mute
microphone** or **End conversation** to stop audio capture.
If Groq rejects an Orpheus speech request (including when the organization has
not accepted its model terms), Buddy reads the reply using the device's built-in
speech synthesis instead.

## Environment

Required:

- `GROQ_API_KEY`: server-side Groq secret.
- `BUDDY_ORIGIN`: exact origin of the app, with no trailing slash.

See `.env.example` for model IDs, enable flags, recording size/time limits,
browser audio constraints, timeout, daily estimated spend guard and configurable
price assumptions. Model IDs and base URL are validated; the runtime refuses
legacy-model overrides. Keep production values in the host's secret manager.

The Groq usage list is available in Parents settings. `GET /api/voice/models`
checks model access; `GET /api/voice/usage` reports in-memory daily
counts and the local cost estimate. The estimate uses configurable STT, LLM and
TTS rates. Orpheus English defaults to $22 per million characters. The estimate
resets at UTC midnight and on server restart; configure provider-side
spend limits as well.

## Prompt, profiles, history and privacy

`server/master-prompt.md` is the authoritative personality and safety prompt.
The backend loads the full UTF-8 content without trimming and sends it as the
first LLM `system` message on every reply. A second server-generated system
message may contain the profile's validated rough pitch and voice-level bands;
arbitrary client profile text is never sent as instructions.
`server/master-prompt.sha256` contains the current prompt hash. `npm test`
checks its byte-for-byte integrity. Named profiles, separate conversation
histories, and derived voice settings are stored on this device. At most 12
recent messages from the active profile are sent with a turn. The server does
not persist audio, transcripts or replies, but Groq receives submitted live
audio, text and the rough profile categories.

Creating each profile requires a parent or guardian to approve recording a
short prompted line before the browser asks for microphone access. The sample
is analyzed on-device and discarded; only coarse pitch and voice-level bands
are stored under that profile in IndexedDB. These settings are a rough acoustic
hint, not speaker identification or authentication, and cannot filter speakers.
The live conversation microphone path still sends detected speech to Groq for
transcription. Existing data from older installations remains unassigned until
the user explicitly chooses **Existing user → Restore previous on-device data**
and enters a name.

The voice API has no app access-code gate. API origin validation, a per-IP
in-memory rate limit, an audio upload cap and the estimated daily limit provide
basic controls; keep the server private or deploy behind HTTPS with host-level
access and rate controls before public exposure. Avoid unnecessary personal data.
A parent should remain present during use.

## Browser behavior

After a voice profile has been enrolled, Talk requests microphone permission,
applies the
supported echo cancellation, noise suppression and automatic gain settings, then
uses a local adaptive-volume VAD. It keeps a short pre-roll, waits for the
configured end-of-speech pause, rejects very short segments, and caps each
recording. It detects MediaRecorder formats at runtime and preserves the chosen
MIME type and extension for Safari/WebKit and Chromium. Silence never calls STT.

The browser pauses its microphone while Buddy's WAV or built-in speech plays, then listens
again while the foreground page remains active. Orpheus input is limited to 200
characters; longer replies are split at punctuation and word boundaries, then
synthesized and played sequentially. Backgrounded or locked devices may suspend
microphone access; continuous listening is not supported in those states. After
about 20 seconds without detected speech following a reply, Buddy makes one
gentle follow-up with a fresh activity or topic. The timer pauses when the page
is hidden, the microphone is muted, or speech is detected; Buddy does not keep
prompting if the child remains quiet.

## Host deployment

Run the Node server as a persistent process behind HTTPS. It serves both `web/`
and `/api/voice/*` from one origin. Set `HOST=0.0.0.0`, the host `PORT`, exact
`BUDDY_ORIGIN` and `GROQ_API_KEY` in the host's environment.
Static GitHub Pages alone cannot run the API. If a platform requires separate
static hosting, configure a same-origin reverse proxy; the client routes are
relative and do not send API keys. Set `voiceAppUrl` in `web/js/config.js` for the
Android wrapper, then rebuild the APK.

## Troubleshooting and rollback

- **Missing key / service unconfigured:** set `GROQ_API_KEY` in the server environment and restart.
- **A model is unavailable:** check model permissions and availability for the Groq project; do not silently change the pinned model.
- **Device voice is being used:** Groq Orpheus is unavailable, often because its organization terms have not been accepted. Buddy continues using built-in browser speech; a Groq organization admin can accept the `canopylabs/orpheus-v1-english` terms in the Groq Console to restore Orpheus voice.
- **429:** respect Groq limits, wait for the provider's retry period and check the configured account spend/rate limits.
- **No microphone:** use HTTPS or localhost, grant site microphone permission and keep the app visible.
- **No speech detected:** check device input level and tune `VOICE_END_SILENCE_MS` or local VAD settings; short answers remain valid if detected.
- **No spoken reply:** check browser speech support and audio output. If Groq TTS is unavailable, Buddy uses the browser's built-in speech synthesis.
- **Old PWA assets:** the shell cache version is incremented on release; reopen online to receive it.

Rollback by deploying the last known server and web release together, then set
the prior APK if the native launcher changed. Never restore an OpenAI Realtime
credential or active legacy route as a silent fallback.

## Checks

```powershell
npm test
python scripts/validate.py
npm start
```

Tests mock Groq and do not make billable calls. The repository does not perform
physical-device verification. Test iPhone Safari, installed iPhone PWA and the
actual Fire HD 10 browser/WebView for microphone permissions, codec negotiation,
WAV playback, page suspension and version update behavior.
