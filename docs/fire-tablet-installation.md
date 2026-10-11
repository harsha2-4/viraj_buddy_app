# Build and install on Amazon Fire HD 10

## On the development computer

1. Install Android Studio and its Android SDK tools from the official Android site.
2. Keep the full repository together. Open its **android/** folder in Android Studio.
3. Use JDK 17 for Gradle (Settings → Build Tools → Gradle → Gradle JDK). Install
   Android SDK Platform 35 and Build Tools 35.0.0 using SDK Manager, reviewing and
   accepting the SDK licenses yourself. Let Gradle sync finish; first sync needs internet.
4. In `web/js/config.js`, set `voiceAppUrl` to the hosted HTTPS voice app URL.
   Android automatically includes this value when it builds. `chatgptUrl` remains
   only the separate photo destination.
5. Select the debug build variant, then use **Build → Build App Bundle(s) / APK(s)
   → Build APK(s)** (menu names vary by Studio version). Or in PowerShell:

   ```powershell
   cd android
   .\gradlew.bat assembleDebug lintDebug
   ```

   On macOS/Linux: `cd android && bash ./gradlew assembleDebug lintDebug`.
6. Find **android/app/build/outputs/apk/debug/app-debug.apk**. This debug APK is
   signed automatically for local testing; no signing key needs to be committed.

The official Gradle wrapper is included. A command-line build needs `JAVA_HOME`
pointing to JDK 17 and `ANDROID_HOME` pointing to the installed SDK, or Android
Studio's generated `local.properties` (ignored by Git).

## On the Fire tablet

1. Check that the tablet runs Fire OS 6 or later with Android API 23+. Older Fire
   OS 5/API 22 devices are not supported. Update the installed browser.
2. Transfer the APK over USB to Downloads, or download it through a private
   transfer you control. Do not make the APK or your private destination public unnecessarily.
3. In Fire settings, look for **Security & Privacy → Apps from Unknown Sources**
   (wording varies). Allow installation for the browser/file manager used to open
   the APK. Some older Fire releases use a single unknown-sources switch.
4. Open the APK with that source and tap **Install**. Afterwards, turn off the
   unknown-source permission again if it is no longer needed.
5. Launch **Viraj AI Buddy**. Move its icon to a prominent place on the Home screen
   using the tablet's normal icon arrangement controls.
6. Tap **Talk to Buddy** and allow microphone access; no server access code is
   required. Keep the app in the foreground during the activity.
7. Use **Show Buddy Something** to open the separate configured ChatGPT destination.
   Use Back/the launcher icon to return to Buddy.

No Google Play Services or Google Play installation is required. The launcher is
native, so authentication and microphone access are never forced into a WebView.
Fire child profiles can restrict sideloaded apps and browser access; the parent
must manage those restrictions through Amazon's normal controls.

For a preschooler, conduct the actual ChatGPT interaction as an adult. See
[OpenAI age guidance](https://help.openai.com/en/articles/8313401-is-chatgpt-safe-for-all-ages).

## Limits and troubleshooting

- Browser support for ChatGPT (especially Voice) must be verified on your exact
  Fire model/browser. An installable launcher does not guarantee Voice support.
- **Voice setup fails:** check the Groq key, model access and HTTPS host.
- **Not Configured:** set `voiceAppUrl`, rebuild, and reinstall the APK. Website changes
  alone do not update a previously built APK.
- **No browser:** install/enable a suitable browser using the tablet's supported
  options. Buddy handles missing handlers with a message.
- **No internet:** the native screen still works; voice needs the hosted server.
- **Install rejected:** check minimum OS, free space and source permissions. For an
  update, use the same signing key; builds from different machines/CI can have
  different debug keys. Uninstall the old test app first if signatures conflict.
- Release distribution and signing are future operational work. Keep keys outside
  Git and do not use debug signing for production distribution.
