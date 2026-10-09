# Validation

## Automated checks

- `python scripts/validate.py`: checks HTML and module references, PNG dimensions,
  manifest scope, cached files, Android package/resource references, shared URL
  configuration, official wrapper checksum, and local documentation links.
- `node --test scripts/web.test.mjs`: checks URL
  validation plus cache isolation, excluded requests and offline fallback behavior.
- `.github/workflows/validate.yml`: repeats both, then builds/lints Android with
  Java 17 and uploads the resulting debug APK on a successful run.

## Local build limits

This development computer has no detected JDK, Android Studio or Android SDK.
Android source, XML and resource references can be checked here, but an actual
APK build/lint needs the toolchain described in the Fire installation guide or
the included GitHub Actions workflow. Do not treat structural validation as a
successful Kotlin/Gradle compilation or a produced APK.

## Browser checks performed

Headless Chrome 154 on this computer passed the following checks. These used
Playwright from the local development environment; the launcher has no Playwright
or other npm runtime dependency.

| Viewport | Result |
| --- | --- |
| 390 × 844 (iPhone-sized portrait) | No horizontal overflow; large touch targets |
| 320 × 568 (small phone) | No horizontal overflow; controls remain reachable |
| 844 × 390 (iPhone-sized landscape) | Two-column layout; large touch targets |
| 800 × 1280 (tablet portrait) | No horizontal overflow; large touch targets |
| 1280 × 800 (tablet landscape) | No horizontal overflow; large touch targets |
| 1440 × 900 (desktop) | No horizontal overflow; large touch targets |

Also passed: placeholder destination opens setup without navigation; dialog
Escape/Close restores focus; reduced motion disables animation; configuration
flags hide the photo control/disable animation; both configured actions show the
correct feedback then navigate to an intercepted test destination; Back restores
controls; offline navigation shows reconnect help. There were no JavaScript page
errors or failing application resource requests. Desktop and phone screenshots
were visually inspected.

A separate real service-worker test confirmed registration under a subdirectory,
12 local cached assets, and a working launcher/avatar/settings after an offline
reload. External ChatGPT navigation was intercepted during testing: no user
account, credentials or real conversation was accessed.

The repository's five Node tests and 88 structural checks also passed. Chrome
viewport emulation does not establish iOS Safari or Fire browser compatibility.

## Physical-device acceptance checklist

- iPhone 1 and 2: install via Safari over HTTPS, verify Home Screen icon and
  standalone display, safe areas, landscape, correct destination and authentication.
- Fire HD 10: build/install APK, verify both buttons and parent settings,
  rotate the screen, test Back/resume and enabled/restricted/missing browser cases.
- All devices: verify manual Voice/photo availability in the opened ChatGPT context.
- Web: after a successful online visit, reopen offline. The launcher should render
  while ChatGPT navigation requires a connection.
- Set a real private destination, redeploy the PWA, rebuild the APK, and confirm the
  account that signs in can access it. A URL validation pass cannot establish access.
- Use reduced motion / disabled system animations and a screen reader. Confirm
  the parent dialog can be closed and all buttons remain reachable at large text sizes.

No physical iPhone/Fire, ChatGPT login, real conversation navigation, deployment,
repository push, or GitHub Actions run has been performed by generating this starter.
