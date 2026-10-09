# Web launcher

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

Both child-facing buttons open that destination; photo capture and Voice activation
are handled manually inside ChatGPT. Browser/app support determines availability.
This is an adult-led launcher, not an independent ChatGPT account for a child.

`AvatarController` implements idle and happy. The CSS respects reduced motion;
`enableAnimations: false` stops animation. There is no listening or speech simulation.

The service worker caches a fixed allowlist of local assets. HTML/config use the
network when available; the installed shell remains usable offline, but ChatGPT
needs internet. Increment `VERSION` in `service-worker.js` after shell changes;
close all launcher tabs/windows and reopen twice online to activate a waiting
release. For development, unregister the worker through browser developer tools
if stale static files hide edits. Nothing from ChatGPT is cached by this launcher.

See [iPhone setup](../docs/iphone-installation.md) and [root README](../README.md).
