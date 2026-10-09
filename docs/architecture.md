# Phase 1 architecture

**Historical launcher architecture.** Version 0.2 adds `server/index.mjs`,
WebRTC voice in `web/js/voice.js`, topic illustrations in `web/js/scenes.js`,
and an Android `VoiceActivity` WebView restricted to the configured HTTPS origin.
It requests microphone permission only for voice. See [current voice architecture
and setup](voice-setup.md). The diagram and constraints below describe only the
original external ChatGPT launcher, retained for the photo action.

```text
iPhone 1 / iPhone 2                     Fire HD 10
Safari → installed PWA                  installed native Kotlin APK
           ↓                                      ↓
local HTML/CSS/SVG launcher             Activity / native buttons / image
           ↓                                      ↓
normal HTTPS navigation                ACTION_VIEW + CATEGORY_BROWSABLE
           └───────────────────┬──────────────────┘
                               ↓
                   configured ChatGPT destination
                               ↓
                  adult uses ChatGPT voice / photos
```

There is no backend, API key, custom login, AI SDK, microphone permission, camera
permission, analytics, billing integration or Google Play Services dependency.
ChatGPT authenticates and provides conversations. The launcher neither reads nor
controls those conversations. An installed ChatGPT app may handle its supported
HTTPS links depending on the OS defaults; the shell does not force a package.

## One destination setting

`web/js/config.js` → `CONFIG.chatgptUrl` is the only editable URL.
The browser imports it directly. `android/app/build.gradle.kts` reads that literal
and generates `BuildConfig.CHATGPT_URL`; `AppConfig.kt` accesses it centrally.
An APK embeds the value at build time. Rebuild/reinstall after a change; changing
the website cannot update an already installed APK.

Only HTTPS links on `chatgpt.com` or legacy `chat.openai.com` are accepted. Embedded
credentials, custom ports and unrelated hosts are rejected. The parent dialog
shows Configured/Not Configured without exposing the destination. A configured
status indicates URL validity, not verified conversation access or authentication.

## Web boundaries

`app.js` handles controls and parent dialog. `navigation.js` validates destinations.
`animations.js` owns the replaceable avatar controller. Idle and happy only;
listening/thinking/talking are reserved names with an idle fallback. The photo
action is a separate mode in one navigation function, ready for future redesign.

Relative paths, scoped cache names, and manifest start/scope `./` support a GitHub
Pages repository subpath. The service worker never caches external requests or
conversation history. Voice transcripts are saved separately in browser local
storage on the device, with a bounded excerpt used as context in a later voice
session. The server does not persist conversation records, photos or audio.
Browser storage/caching is best-effort: the OS can evict stored data. The initial
online visit must finish caching first.

## Native boundaries

One `Activity`, native widgets, a scrollable responsive layout and a lightweight
idle animation. It stops animations and pending handoffs when backgrounded and
resets on return. System animation settings are respected. Missing or restricted
browser handlers produce a helpful message. No WebView is used.

Minimum SDK 23 supports Fire OS 6/7/8 devices whose Android APIs meet that minimum;
Fire OS 5/API 22 is outside this starter's support. Browser support for ChatGPT
voice on any given Fire device must be checked on that device. SDK compatibility
alone does not establish browser voice support.

Build versions are pinned: AGP 8.9.2, Gradle 8.11.1, Kotlin 2.1.20,
compile/target SDK 35, Java 17. See [AGP compatibility](https://developer.android.com/build/releases/agp-8-9-0-release-notes)
and [Amazon Fire OS 7](https://developer.amazon.com/docs/fire-tablets/fire-os-7.html).
