# Animated voice app

For live voice, run the Node server from the repository root using `npm start`.
Follow [voice setup](../docs/voice-setup.md) to configure credentials and HTTPS.
The static preview instructions below do not provide `/api/session`.

Plain HTML, CSS, ES modules and SVG. No package installation or build step.

From this directory:

```sh
python -m http.server 8080
```

Open **http://localhost:8080**. Do not open `index.html` with `file://`; modules and
service workers need HTTP(S). Localhost supports service workers. A LAN HTTP URL
can preview the screen on another device but cannot provide a fully installable
offline PWA; use an HTTPS deployment for iPhone installation.

Change **`CONFIG.chatgptUrl` in `js/config.js`** to the URL copied from the parent’s
ChatGPT project/conversation. Keep the double-quoted literal. The Android build
reads this same value. The placeholder safely shows parent setup instead of navigating.

Other web settings: `childName`, `appName`, `enableCameraButton`,
`enableAnimations`, `debugMode`. Names in the manifest/Apple metadata and native
strings are branding, so update those separately if renaming the whole app.

Talk to Buddy starts the in-app voice flow directly; the browser asks permission to use the microphone.
Show Buddy Something opens the configured external ChatGPT destination for photos.
These conversations are independent.

`AvatarController` implements idle, happy, listening, thinking and talking poses.
`VoiceSession` handles WebRTC audio and playback events; `SceneController` maps
reply text to bundled illustrations. Reduced motion and `enableAnimations: false`
disable animation. No lip sync is used.

Buddy's voice behavior is defined in `server/master-prompt.md`. Edit that
Markdown file to update Buddy's instructions; changes apply to new voice
sessions. Conversation
transcripts are saved in this browser's local storage, can be reviewed or cleared
from **Parents → Conversation history**, and are not uploaded to this app's server.
The next voice session sends a short excerpt of recent history to OpenAI as
context. The browser keeps up to 50 conversations; older ones are removed as
new sessions are saved. The separate ChatGPT/photo conversations are not included.

The service worker caches a fixed allowlist of local assets. HTML/config use the
network when available; the installed shell remains usable offline, but ChatGPT
needs internet. Increment `VERSION` in `service-worker.js` after shell changes;
close all launcher tabs/windows and reopen twice online to activate a waiting
release. For development, unregister the worker through browser developer tools
if stale static files hide edits. Saved transcripts are browser data, not service
worker cache data; the browser or OS may clear them.

See [iPhone setup](../docs/iphone-installation.md) and [root README](../README.md).
