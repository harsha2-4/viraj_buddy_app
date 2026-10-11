// Optional browser check: use the workspace Playwright install or set BUDDY_PLAYWRIGHT_MODULE.
const { chromium } = require(process.env.BUDDY_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
require('node:fs').mkdirSync('.local', { recursive: true });
(async () => {
  const { createBuddyServer } = await import('../server/index.mjs');
  const server = createBuddyServer({ env: {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.BUDDY_CHROME_PATH || undefined, headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript(() => {
      window.trackStopped = false;
      window.mic = { enabled: true, stop() { window.trackStopped = true; } };
      Object.defineProperty(navigator.mediaDevices, 'getSupportedConstraints', { value: () => ({ echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: true }) });
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { writable: true, configurable: true, value: async () => ({ getTracks: () => [window.mic], getAudioTracks: () => [window.mic] }) });
      class FakeRecorder {
        static isTypeSupported(type) { return type === 'audio/webm'; }
        constructor(stream, options = {}) { this.stream = stream; this.mimeType = options.mimeType || 'audio/webm'; this.state = 'inactive'; }
        start() { this.state = 'recording'; }
        requestData() { this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) }); }
        stop() { this.state = 'inactive'; this.onstop?.(); }
      }
      window.MediaRecorder = FakeRecorder;
      class FakeAudioContext {
        async resume() {}
        createAnalyser() { return { fftSize: 512, getByteTimeDomainData: data => data.fill(128) }; }
        createMediaStreamSource() { return { connect() {} }; }
        async close() {}
      }
      window.AudioContext = FakeAudioContext;
      HTMLMediaElement.prototype.play = function () {
        setTimeout(() => this.dispatchEvent(new Event('ended')), 700);
        return Promise.resolve();
      };
    });
    const page = await context.newPage();
    const errors = [];
    const apiCalls = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/voice/models', route => { apiCalls.push('models'); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: { stt: true, llm: true, tts: true }, voice: { vadEnabled: true, echoCancellation: true, noiseSuppression: true, autoGainControl: true, endSilenceMs: 1000, minSpeechMs: 200 } }) }); });
    await page.route('**/api/voice/usage', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ day: '2026-10-11', sttRequests: 0, audioSeconds: 0, llmRequests: 0, inputTokens: 0, outputTokens: 0, ttsRequests: 0, ttsCharacters: 0, rateLimitErrors: 0, latencyMs: 0, estimatedUsd: 0, dailyLimitUsd: 5 }) }));
    await page.route('**/api/voice/reply', route => { apiCalls.push('reply'); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'Let’s fly a rocket to the moon!' }) }); });
    await page.route('**/api/voice/speak', route => { apiCalls.push('speak'); return route.fulfill({ status: 200, contentType: 'audio/wav', body: Buffer.from('RIFF0000WAVE') }); });
    for (const [name, width, height] of [['phone', 390, 844], ['small', 320, 568], ['tablet', 1280, 800], ['desktop', 1440, 1000]]) {
      await page.setViewportSize({ width, height });
      await page.goto(base);
      await page.waitForFunction(() => document.querySelector('#avatar').dataset.animated === 'true', null, { timeout: 10000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' overflow');
      await page.screenshot({ path: `.local/voice-${name}.png`, fullPage: true });
    }
    await page.click('#parent-button');
    await page.locator('#voice-access-code').fill('parent-code-123');
    await page.click('#verify-voice-access');
    await page.waitForFunction(() => document.querySelector('#voice-access-status').textContent.includes('Voice is ready'), null, { timeout: 10000 });
    await page.locator('#parent-dialog .close-button').click();
    await page.evaluate(() => {
      window.voiceStates = [];
      new MutationObserver(() => window.voiceStates.push(document.querySelector('#avatar')?.dataset.state))
        .observe(document.querySelector('#avatar'), { attributes: true, attributeFilter: ['data-state'] });
    });
    await page.click('#talk-button');
    await page.waitForFunction(() => document.querySelector('#avatar').dataset.state === 'listening', null, { timeout: 10000 });
    await page.waitForFunction(() => window.voiceStates.includes('talking'), null, { timeout: 10000 }).catch(async error => {
      console.error('Playback debug:', await page.evaluate(() => ({ state: document.querySelector('#avatar').dataset.state, states: window.voiceStates, status: document.querySelector('#status').textContent, transcript: document.querySelector('#transcript').textContent })), apiCalls);
      throw error;
    });
    assert.equal(await page.locator('#scene').getAttribute('data-scene'), 'space');
    await page.waitForFunction(() => document.querySelector('#avatar').dataset.state === 'listening', null, { timeout: 10000 });
    await page.click('#mute-button');
    assert.equal(await page.evaluate(() => window.mic.enabled), false);
    await page.click('#mute-button');
    assert.equal(await page.evaluate(() => window.mic.enabled), true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.boy-head').evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.click('#end-button');
    assert.ok(await page.evaluate(() => window.trackStopped));
    assert.equal(await page.locator('#avatar').getAttribute('data-state'), 'idle');
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => new Promise(resolve => window.resolveMic = resolve); });
    await page.click('#talk-button');
    await page.click('#end-button');
    await page.evaluate(() => window.resolveMic({ getTracks: () => [window.mic], getAudioTracks: () => [window.mic] }));
    await page.waitForFunction(() => window.trackStopped);
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
    await page.click('#talk-button');
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('not allowed'), null, { timeout: 10000 });
    assert.deepEqual(errors, []);
    console.log('PASS: four responsive layouts, Groq mocked session, sequential WAV playback, scene updates, mute, reduced motion, session cleanup, permission cancellation and denied microphone; no browser exceptions.');
  } finally { await browser.close(); server.closeAllConnections(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
