# Validation

## Checks run for the Groq migration

- Node test suite: **20 passed, 0 failed** using mocked Groq responses. This
  includes the exact system prompt and SHA-256 regression check; no billable API
  calls were made.
- `python scripts/validate.py`: **96 structural checks passed** for web assets,
  PWA references, Android resources and documentation links.
- `scripts/voice-browser.cjs`: **passed** mocked Chromium checks at 390 × 844,
  320 × 568, 1280 × 800 and 1440 × 1000; checked parent access, voice UI,
  playback states, mute, reduced motion, end cleanup and permission errors.
- Groq model access and live STT/LLM/TTS were not called because no live
  credential smoke test was requested or performed.
- `android/gradlew.bat assembleDebug lintDebug`: **not run to completion**;
  this computer has no Java/JDK (`JAVA_HOME` unset and no `java` on PATH).
- The project has no separate production build step; the Node server serves the
  static web modules directly.
- Master prompt: original and final SHA-256 both equal
  `5620f5c5fa30b2e99eecb998f209554793d7ccb272a094033bc5b5f61365536b`.

The test command was run with the bundled Node executable because `npm` is not
available on this computer. Run `npm test` with a standard Node.js installation.

## Manual device checks still needed

- iPhone Safari and installed Home Screen PWA: microphone permission, MediaRecorder
  codec, audio context resume, autoplay recovery, WAV playback and foreground
  suspension/resume.
- Second iPhone: confirm independent access and local history.
- Actual Amazon Fire HD 10 browser/WebView: microphone permissions, MediaRecorder
  support, playback and app lifecycle.
- Physical devices are the only way to validate soft child speech and background
  noise. The implemented VAD is adaptive RMS volume detection; it is not a
  trained speech-probability detector and cannot identify the speaker.

Automated tests do not demonstrate production reliability, live model access,
voice quality, deployment security, or behavior on a locked phone. Use the
checklist in [voice setup](voice-setup.md) before relying on the deployed service.
