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

The service worker caches a fixed allowlist of local assets. HTML/config use the
network when available; the installed shell remains usable offline, but ChatGPT
needs internet. Increment `VERSION` in `service-worker.js` after shell changes;
close all launcher tabs/windows and reopen twice online to activate a waiting
release. For development, unregister the worker through browser developer tools
if stale static files hide edits. Nothing from ChatGPT is cached by this launcher.

See [iPhone setup](../docs/iphone-installation.md) and [root README](../README.md).
