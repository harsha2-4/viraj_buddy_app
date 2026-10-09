# Viraj AI Buddy

**Version 0.2 adds an animated boy and in-app AI voice conversations**, with
gestures during speech and illustrated scenes that follow conversation topics.
Voice behavior is in `server/master-prompt.md`; voice transcripts are saved
locally in the browser and can inform later sessions. See [voice setup](docs/voice-setup.md)
for the Node backend, API credentials, history behavior, HTTPS hosting, and
Android configuration. The original Phase 1 instructions below describe the
retained external ChatGPT/photo launcher, not the new voice mode.

The Phase 1 shell application for Viraj AI Buddy: a calm, friendly launchpad for
adult-led adventures, using an existing ChatGPT destination. No OpenAI API,
Realtime API, paid backend, or custom AI integration is used.

## Goal

One simple home screen for two iPhones (Home Screen PWA) and an Amazon Fire HD 10
(native Android APK): a friendly animated Buddy, **Hi Viraj!**, **Talk to Buddy**,
and **Show Buddy Something**. Both buttons open the configured ChatGPT destination.

Because Viraj is four, this is an adult-led activity launcher. ChatGPT is not
intended for under-13s; an adult must conduct the actual ChatGPT interaction in
an educational activity with a child under 13. See [OpenAI's age guidance](https://help.openai.com/en/articles/8313401-is-chatgpt-safe-for-all-ages).

## Architecture

```text
iPhone → Home Screen PWA → launcher → normal HTTPS navigation → ChatGPT
Fire HD 10 → native Kotlin APK → launcher → ACTION_VIEW → browser → ChatGPT
```

ChatGPT handles authentication, conversations, voice and images. The launcher has
no access to them. No WebView, own login UI, ads, analytics, recording or API keys.
See [architecture details](docs/architecture.md).

## Repository Structure

```text
viraj-ai-buddy/
├── web/                         # Deploy this directory, not the repository root
│   ├── index.html
│   ├── manifest.json
│   ├── service-worker.js
│   ├── css/styles.css
│   ├── js/{app,config,animations,navigation}.js
│   ├── assets/
│   │   ├── icons/{icon-192,icon-512,apple-touch-icon}.png
│   │   ├── images/placeholder-avatar.svg
│   │   └── sounds/.gitkeep
│   └── README.md
├── android/
│   ├── app/
│   │   ├── build.gradle.kts
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       ├── java/com/viraj/aibuddy/{MainActivity,AppConfig}.kt
│   │       └── res/
│   │           ├── drawable/buddy.png
│   │           ├── mipmap-{mdpi,hdpi,xhdpi,xxhdpi}/ic_launcher.png
│   │           ├── values/{colors,strings,themes}.xml
│   │           └── xml/network_security_config.xml
│   ├── gradle/wrapper/{gradle-wrapper.jar,gradle-wrapper.properties}
│   ├── gradlew
│   ├── gradlew.bat
│   ├── build.gradle.kts
│   ├── settings.gradle.kts
│   └── gradle.properties
├── docs/
│   ├── architecture.md
│   ├── iphone-installation.md
│   ├── fire-tablet-installation.md
│   ├── roadmap.md
│   └── validation.md
├── scripts/{validate.py,web.test.mjs}
├── .github/workflows/{pages,validate}.yml
├── .gitattributes
├── .gitignore
├── LICENSE
└── README.md
```

The local folder can remain named `viraj_buddy_app`; name the remote repository
`viraj-ai-buddy`. There is no extra nested repository folder.

## Running the Web App Locally

From the repository root:

```powershell
cd web
python -m http.server 8080
```

Open **http://localhost:8080**. Use Ctrl+C to stop the server. No Node build system
or package installation is needed. Do not double-click `index.html`; ES modules
and service workers need HTTP(S). An unset destination opens parent setup help.

## Deploying to GitHub Pages

1. Push to your private repository using the commands below.
2. Check plan eligibility: Pages from a private personal repository requires an
   eligible paid GitHub plan, such as Pro; GitHub Free supports Pages from public
   repositories. Do not change repository visibility just to enable Pages without
   considering what will be exposed. See [GitHub Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
3. Open repository **Settings → Pages → Build and deployment → Source** and choose
   **GitHub Actions**.
4. Open **Actions → Deploy launcher to GitHub Pages → Run workflow**. This manual
   workflow uploads only `web/` and publishes it to Pages. Pushing alone does not
   publish the site. Do not choose branch/root publishing: it would serve the wrong folder.
5. Visit the URL shown by the workflow, normally
   `https://USERNAME.github.io/viraj-ai-buddy/`.
6. Rerun the deployment workflow after configuration or content changes. Increment
   `VERSION` in `web/service-worker.js` when changing shell assets.

Private repository visibility does **not** ordinarily make the Pages website
private. The published files, child name and configured URL are inspectable by
site visitors. The destination is still protected by ChatGPT account access; never
put a share token, password or other secret in the configuration. If private-repo
Pages is unavailable, keep the repo private and use an HTTPS static host you
control instead. Local development does not require any hosting plan.

## Installing on iPhone

Open the HTTPS launcher in Safari → **Share → Add to Home Screen → Add**. Repeat
on the second iPhone. The parent signs in to ChatGPT in the browser/app that opens.
See [the parent-friendly iPhone guide](docs/iphone-installation.md).

## Building the Fire HD 10 APK

Open `android/` in Android Studio, use JDK 17, install SDK Platform 35 and Build
Tools 35.0.0, and let Gradle sync. The complete repository must stay together
because Android reads the shared URL in `web/js/config.js`.

From the repository root in PowerShell:

```powershell
cd android
.\gradlew.bat assembleDebug lintDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.
Transfer it to the tablet and temporarily allow installation from the source
used to open it. See [the Fire installation guide](docs/fire-tablet-installation.md).

Minimum SDK is 23; no Google Play Services dependency. The included validation
workflow also builds a debug APK and uploads it as an Actions artifact after a
successful run. CI artifacts are test builds; signing may differ from local builds.

## Configuration

Change exactly **one URL value** in **`web/js/config.js`**:

```js
chatgptUrl: "REPLACE_WITH_CHATGPT_PROJECT_URL",
```

Replace the placeholder with the HTTPS URL copied from your own ChatGPT project
or conversation, keeping the double quotes and comma. Accepted hosts are
`chatgpt.com` and legacy `chat.openai.com`. Use a normal authenticated destination;
you do not need to create a publicly shared conversation.

The PWA imports it directly. Android's Gradle build copies it into generated
`BuildConfig.CHATGPT_URL`, accessed through `AppConfig.kt`. **Redeploy the web app
and rebuild/reinstall the APK after changing it.** Do not edit generated files.

Optional web settings live alongside the URL: name, camera-button visibility,
animation and debugging flags. The native visibility/animation flags live in
`AppConfig.kt`; native display strings live in `strings.xml`.

## Security

- No OpenAI API key is required. ChatGPT Plus remains managed by ChatGPT.
- Never commit signing keys, passwords, authentication cookies, access tokens or
  API keys. The `.gitignore` covers common secret and build files, but still review
  staged changes before committing.
- Settings shows only Configured/Not Configured. It is informational, not a parent
  authentication system, URL access check or child-safety boundary.
- Only HTTPS ChatGPT destinations are accepted. The launcher requests no camera
  or microphone permission. Those permissions belong to ChatGPT/browser use.
- Only this launcher's static assets are cached. No ChatGPT content is cached by it.
- Use an adult's account under that adult's control; this app does not create a
  child account or change ChatGPT eligibility or controls.

## Current Limitations

The launcher can open ChatGPT, but starting ChatGPT Voice Mode automatically is
dependent on ChatGPT-supported navigation/deep-link capabilities. The app should
not use unsupported hacks to simulate or bypass that behavior.

This version uses normal HTTPS navigation only. The adult may need to tap Voice
or attach a photo inside ChatGPT. Feature availability depends on the device,
browser, account and ChatGPT. In particular, Fire browser Voice support needs
real-device verification. Authentication may be separate between iOS contexts.

The avatar is decorative, with no lip sync or live listening state. There is no
direct photo upload, conversation state or device synchronization. Only the local
launcher works offline. An APK must be rebuilt for a new destination URL.

See [validation results and device checklist](docs/validation.md) for what was
actually tested and what still requires an Android toolchain or physical device.

## Phase 2 Roadmap

Future documentation covers Realtime API, speech, camera, parent controls,
activity modes and richer avatars. None is implemented or billed in Phase 1.
See [the Phase 2/3 roadmap](docs/roadmap.md).

## Validate the Starter

Optional developer checks (Python 3 and Node 22+, no npm install):

```powershell
python scripts/validate.py
node --test scripts/web.test.mjs
```

Run the Android build/lint command above with the installed SDK/JDK. Also test
installation, browser authentication and Voice availability on each physical device.

## Create the Private GitHub Repository

From the local repository root:

```powershell
git init
git add .
git commit -m "Initial Viraj AI Buddy shell"
```

If Git asks for your identity, set your own `user.name` and `user.email` first.
On GitHub, select **New repository**, enter **viraj-ai-buddy**, choose **Private**,
and leave README, license and .gitignore initialization unchecked (they exist locally).
Click **Create repository**, then run, replacing `USERNAME` with your GitHub name:

```powershell
git branch -M main
git remote add origin https://github.com/USERNAME/viraj-ai-buddy.git
git push -u origin main
```

Use Git's normal credential manager/browser sign-in; do not put a token in the
remote URL. If `origin` already exists, inspect `git remote -v` before changing it.
These instructions do not themselves create, commit, push, or publish anything.
