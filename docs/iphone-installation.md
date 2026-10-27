# Install on either iPhone

1. Deploy the Node voice server and web app together over HTTPS using the root
   README. GitHub Pages alone cannot run voice.
2. On the iPhone, open the **voice app URL** in Safari while online.
3. Let the screen finish loading, then tap **Share** (the square with the up arrow).
4. Select **Add to Home Screen**. Depending on iOS, this may be under more actions.
5. Keep the name **AI Buddy**. If shown, leave **Open as Web App** enabled. Tap **Add**.
6. Open the new Home Screen icon. Choose **New user** to set up a profile, or
   **Existing user** to reopen one saved on this device.
7. A parent or guardian approves the short voice setup before recording. Voice
   settings and conversation history stay on this device for each profile.
8. Tap **Talk to Buddy** and allow microphone access; no server access code is
   required. Keep Safari in the foreground.
9. Repeat on the second iPhone. Profiles and history are local to each device.

Voice uses the configured Groq backend. The photo action still opens the separate
ChatGPT destination in `web/js/config.js`. Do not place Groq credentials in that
public configuration file.

Stay with the child during voice activities. Keep the page visible; iOS may
suspend microphone access when locked or backgrounded.

## If something does not work

- **Voice setup fails:** check the Groq key, model access and HTTPS host.
- **Cannot add an icon:** use Safari and the HTTPS launcher URL, not a local file.
- **Old design:** close all launcher windows/tabs, then reopen online twice. Make
  sure the release increased the service worker `VERSION`.
- **Offline:** the cached shell may open, but the voice server needs internet.
- **Microphone stops:** return Safari to the foreground and start the session again.
