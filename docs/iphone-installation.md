# Install on either iPhone

1. Set `chatgptUrl` in `web/js/config.js`, then deploy `web/` over HTTPS using the
   root README. You will have a URL like `https://USERNAME.github.io/viraj-ai-buddy/`.
2. On the iPhone, open that **launcher URL** in Safari while online.
3. Let the screen finish loading, then tap **Share** (the square with the up arrow).
4. Select **Add to Home Screen**. Depending on iOS, this may be under more actions.
5. Keep the name **Viraj Buddy**. If shown, leave **Open as Web App** enabled. Tap **Add**.
6. Open the new Home Screen icon. You should see Buddy, the greeting and two large buttons.
7. As the parent, tap **Talk to Buddy**. Sign in to ChatGPT with your own account
   if asked and confirm that the intended project/conversation opens. Returning to
   the launcher should leave its controls ready to use again.
8. Use ChatGPT's Voice button or image attachment control if available. Allow
   microphone/camera access there when you choose to use those features.
9. Repeat on the second iPhone. Both launchers use the same hosted configuration.

The launcher opens ChatGPT; it cannot start Voice Mode automatically. iOS can open
links in a browser or a supported installed app according to system settings.
Login state may differ between Safari, a standalone web app, and the ChatGPT app;
sign in in the context that actually opens. No credentials belong in this project.

This is intended for adult-led activities. ChatGPT is not intended for children
under 13; OpenAI says an adult must conduct the actual ChatGPT interaction when
it is used educationally with children under 13. See [OpenAI's age guidance](https://help.openai.com/en/articles/8313401-is-chatgpt-safe-for-all-ages).

## If something does not work

- **Not Configured:** update the single URL setting and redeploy. Reopen online.
- **Cannot add an icon:** use Safari and the HTTPS launcher URL, not a local file.
- **Old design:** close all launcher windows/tabs, then reopen online twice. Make
  sure the release increased the service worker `VERSION`.
- **Offline:** the previously cached home screen can open, but ChatGPT needs internet.
- **No Voice button:** check ChatGPT's current support in that browser/app. This
  shell cannot add a feature the destination does not expose.
- **Wrong project or access denied:** copy the parent account's real project or
  conversation URL, and sign in to the account that has access. Do not create a
  public conversation share simply to make this launcher work.
