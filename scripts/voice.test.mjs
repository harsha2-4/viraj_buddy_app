import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createBuddyServer } from '../server/index.mjs';
import { GROQ_MODELS, loadGroqConfig } from '../server/groq-config.mjs';
import { audioConfig, chooseRecordingType, splitConversationalSpeech, splitSpeechText } from '../web/js/audioConfig.js';
import { VoiceSession } from '../web/js/voice.js';
import { analyzeVoiceFrames, clearVoiceProfile, getVoiceProfile, migrateLegacyVoiceProfile, recordVoiceProfile, saveVoiceProfile } from '../web/js/voiceProfile.js';

const promptUrl = new URL('../server/master-prompt.md', import.meta.url);
const baselineUrl = new URL('../server/master-prompt.sha256', import.meta.url);
const expectedPromptHash = (await readFile(baselineUrl, 'utf8')).trim();

test('authoritative master prompt matches its recorded SHA-256 baseline byte for byte', async () => {
  const prompt = await readFile(promptUrl);
  assert.equal(createHash('sha256').update(prompt).digest('hex'), expectedPromptHash);
});

test('Groq config uses the required model IDs and rejects legacy overrides', () => {
  const config = loadGroqConfig({ GROQ_API_KEY: 'secret' });
  assert.equal(config.sttModel, 'whisper-large-v3-turbo');
  assert.equal(config.llmModel, 'openai/gpt-oss-20b');
  assert.equal(config.ttsModel, 'canopylabs/orpheus-v1-english');
  assert.equal(config.ttsVoice, 'troy');
  assert.equal(config.baseUrl, 'https://api.groq.com/openai/v1');
  assert.equal(GROQ_MODELS.llm, 'openai/gpt-oss-20b');
  assert.throws(() => loadGroqConfig({ GROQ_LLM_MODEL: 'gpt-realtime' }), /legacy model fallbacks are disabled/);
  assert.throws(() => loadGroqConfig({ GROQ_BASE_URL: 'https://api.openai.com/v1' }), /GROQ_BASE_URL must be/);
  assert.throws(() => loadGroqConfig({ VOICE_MAX_AUDIO_BYTES: 'not-a-number' }), /must be a number/);
  assert.throws(() => loadGroqConfig({ GROQ_TTS_ENABLED: 'yes' }), /must be true or false/);
});

test('recording negotiation and TTS chunks retain full text within 200 characters', () => {
  const recorder = { isTypeSupported(type) { return ['audio/mp4', 'audio/webm;codecs=opus'].includes(type); } };
  assert.equal(chooseRecordingType(recorder), 'audio/webm;codecs=opus');
  assert.equal(chooseRecordingType({ isTypeSupported: type => type === 'audio/mp4' }), 'audio/mp4');
  assert.equal(audioConfig.vad.endSilenceMs, 1000);
  assert.equal(audioConfig.vad.maxUtteranceMs, 15000);
  assert.equal(audioConfig.followUpDelayMs, 20000);
  for (const text of [
    'A small reply.',
    'A very long story about a friendly dinosaur. '.repeat(30),
    'Telugu words నమస్కారం and English mixed together. '.repeat(8)
  ]) {
    const chunks = splitSpeechText(text, 200);
    assert.ok(chunks.every(chunk => Array.from(chunk).length <= 200));
    assert.equal(chunks.join(' ').replace(/\s+/g, ' ').trim(), text.replace(/\s+/g, ' ').trim());
  }
  assert.deepEqual(splitSpeechText(''), []);
});

test('voice profiling derives broad pitch and energy bands without retaining transcript text', () => {
  const sampleRate = 48000;
  const frames = Array.from({ length: 6 }, (_, frameIndex) => {
    const samples = new Float32Array(2048);
    for (let index = 0; index < samples.length; index++) {
      samples[index] = 0.04 * Math.sin(2 * Math.PI * 220 * (frameIndex * samples.length + index) / sampleRate);
    }
    return samples;
  });
  const profile = analyzeVoiceFrames(frames, sampleRate);
  assert.equal(profile.pitchBand, 'middle');
  assert.equal(profile.energy, 'steady');
  assert.equal(typeof profile.profiledAt, 'string');
  assert.throws(() => analyzeVoiceFrames([], sampleRate), /clear voice sample/);
});

function indexedDbHarness() {
  const values = new Map();
  const database = {
    createObjectStore() {},
    close() {},
    transaction() {
      let pending = 0;
      let completed = false;
      const transaction = {};
      const finish = () => {
        if (completed || pending) return;
        queueMicrotask(() => {
          if (completed || pending) return;
          completed = true;
          transaction.oncomplete?.();
        });
      };
      const request = (work) => {
        const listeners = {};
        const result = {
          result: undefined,
          addEventListener(name, handler) { (listeners[name] ||= []).push(handler); }
        };
        pending++;
        queueMicrotask(() => {
          try {
            result.result = work();
            for (const handler of listeners.success || []) handler();
            result.onsuccess?.();
          } catch (error) {
            result.error = error;
            transaction.error = error;
            transaction.onerror?.();
            transaction.onabort?.();
          } finally {
            pending--;
            finish();
          }
        });
        return result;
      };
      transaction.objectStore = () => ({
        get: key => request(() => values.get(key)),
        put: (value, key) => request(() => { values.set(key, value); return key; }),
        delete: key => request(() => values.delete(key))
      });
      return transaction;
    }
  };
  const factory = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = database;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
  return factory;
}

test('voice settings and legacy migration stay isolated by profile and discard raw samples', async () => {
  const factory = indexedDbHarness();
  const sample = new Blob(['sample audio']);
  const firstProfile = { pitchBand: 'lower', energy: 'soft', profiledAt: '2026-01-01T00:00:00Z' };
  const secondProfile = { pitchBand: 'higher', energy: 'strong', profiledAt: '2026-01-02T00:00:00Z' };
  await saveVoiceProfile(firstProfile, sample, factory, 'user-a');
  await saveVoiceProfile(secondProfile, sample, factory, 'user-b');
  assert.deepEqual((await getVoiceProfile(factory, 'user-a')).profile, firstProfile);
  assert.deepEqual((await getVoiceProfile(factory, 'user-b')).profile, secondProfile);
  assert.equal((await getVoiceProfile(factory, 'user-a')).sample, undefined);
  await saveVoiceProfile(firstProfile, sample, factory);
  assert.equal(await migrateLegacyVoiceProfile('restored-user', factory), true);
  assert.deepEqual((await getVoiceProfile(factory, 'restored-user')).profile, firstProfile);
  assert.equal(await getVoiceProfile(factory), null);
  await clearVoiceProfile(factory, 'user-a');
  assert.equal(await getVoiceProfile(factory, 'user-a'), null);
  assert.deepEqual((await getVoiceProfile(factory, 'user-b')).profile, secondProfile);
});

test('voice recording reports unsupported browsers, permission denial, empty samples, and unclear audio', async () => {
  await assert.rejects(recordVoiceProfile({
    mediaDevices: { getUserMedia: async () => { throw new Error('must not request microphone'); } },
    MediaRecorderImpl: null,
    AudioContextImpl: null
  }), /supported browser/);

  class FakeRecorder {
    static isTypeSupported() { return false; }
    constructor() { this.mimeType = 'audio/webm'; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop?.(); }
  }
  class FakeAudioContext {
    sampleRate = 48000;
    async resume() {}
    async close() {}
    createAnalyser() { return { fftSize: 64, getFloatTimeDomainData(data) { data.fill(0); } }; }
    createMediaStreamSource() { return { connect() {} }; }
  }
  await assert.rejects(recordVoiceProfile({
    mediaDevices: { getUserMedia: async () => { throw Object.assign(new Error('Denied'), { name: 'NotAllowedError' }); } },
    MediaRecorderImpl: FakeRecorder,
    AudioContextImpl: FakeAudioContext
  }), error => error.name === 'NotAllowedError');

  const mediaDevices = { async getUserMedia() { return { getTracks: () => [{ stop() {} }] }; } };
  await assert.rejects(recordVoiceProfile({
    durationMs: 1, mediaDevices, MediaRecorderImpl: FakeRecorder, AudioContextImpl: FakeAudioContext
  }), /sample was empty/);

  class RecordedAudio extends FakeRecorder {
    stop() {
      this.ondataavailable?.({ data: new Blob(['audio']) });
      super.stop();
    }
  }
  await assert.rejects(recordVoiceProfile({
    durationMs: 1, mediaDevices, MediaRecorderImpl: RecordedAudio, AudioContextImpl: FakeAudioContext
  }), /clear voice sample/);
});

test('spoken replies remove visual markup and emojis and preserve natural sentence pauses', () => {
  assert.deepEqual(
    splitConversationalSpeech('Whoa! **Elephants** eat leaves. 🌿 What do you think? 🐘'),
    ['Whoa! Elephants eat leaves. What do you think?']
  );
  assert.deepEqual(splitConversationalSpeech('Short thought. '.repeat(30)).map(chunk => chunk.length <= 200), Array(3).fill(true));
  assert.deepEqual(splitConversationalSpeech(''), []);
});

test('local VAD requires multiple speech frames and waits through the silence window', () => {
  const session = Object.create(VoiceSession.prototype);
  session.analyser = { getByteTimeDomainData(data) { data.fill(140); } };
  session.samples = new Uint8Array(64);
  session.speechFrames = 0;
  let starts = 0;
  session.beginCapture = () => { starts++; };
  session.detectSpeech(() => true);
  assert.equal(starts, 0);
  session.detectSpeech(() => true);
  assert.equal(starts, 1);

  session.capturing = true;
  session.lastSpeechAt = Date.now() - audioConfig.vad.endSilenceMs - 10;
  session.analyser.getByteTimeDomainData = data => data.fill(128);
  let finishes = 0;
  session.finishCapture = () => { finishes++; };
  session.detectSpeech(() => true);
  assert.equal(finishes, 1);
});

test('recorder preserves the container header while buffering recent pre-roll audio', async () => {
  const originalWindow = globalThis.window;
  const originalMediaRecorder = globalThis.MediaRecorder;
  class FakeMediaRecorder {
    mimeType = 'audio/webm';
    state = 'recording';
    constructor() {}
    start() {}
  }
  globalThis.window = { MediaRecorder: FakeMediaRecorder };
  globalThis.MediaRecorder = FakeMediaRecorder;
  try {
    const session = Object.create(VoiceSession.prototype);
    session.stream = {};
    session.createRecorder(() => true);
    for (let i = 0; i < 10; i++) session.recorder.ondataavailable({ data: new Blob([String(i)]) });
    assert.equal(session.preRoll.length, 6);
    assert.deepEqual(await Promise.all(session.preRoll.map(chunk => chunk.text())), ['0', '5', '6', '7', '8', '9']);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalMediaRecorder === undefined) delete globalThis.MediaRecorder;
    else globalThis.MediaRecorder = originalMediaRecorder;
  }
});

test('voice recovery shows its error after returning to the listening state', () => {
  const events = [];
  const session = Object.create(VoiceSession.prototype);
  session.onState = state => events.push(`state:${state}`);
  session.onError = message => events.push(`error:${message}`);
  session.recover(new Error('Accept the Groq speech model terms.'), () => true);
  assert.deepEqual(events, [
    'state:listening',
    'error:Accept the Groq speech model terms.'
  ]);
});

test('a 20-second silence triggers one conversational follow-up', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const originalDocument = globalThis.document;
  let timerCallback;
  let delay;
  let request;
  const session = Object.create(VoiceSession.prototype);
  session.followUpAvailable = true;
  session.busy = false;
  session.outputActive = false;
  session.muted = false;
  session.stream = { getAudioTracks: () => [{ enabled: true }] };
  session.reply = (...args) => { request = args; return Promise.resolve(); };
  globalThis.setTimeout = callback => { timerCallback = callback; return 1; };
  globalThis.clearTimeout = () => {};
  globalThis.document = { hidden: false };
  try {
    session.armFollowUp(() => true);
    delay = audioConfig.followUpDelayMs;
    assert.equal(delay, 20000);
    timerCallback();
    assert.equal(session.followUpAvailable, false);
    assert.equal(session.busy, true);
    assert.equal(request[0], '');
    assert.equal(request[2], false);
    assert.equal(request[4], true);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('local speech speaks the reply when Groq speech synthesis is unavailable', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  class FakeUtterance {
    constructor(text) { this.text = text; }
  }
  const spoken = [];
  globalThis.window = {
    SpeechSynthesisUtterance: FakeUtterance,
    speechSynthesis: {
      getVoices: () => [
        { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true },
        { name: 'Microsoft Mark - English (United States)', lang: 'en-US', localService: true },
        { name: 'Other Language', lang: 'fr-FR', localService: true }
      ],
      speak: utterance => { spoken.push(utterance); queueMicrotask(() => utterance.onend()); }
    }
  };
  globalThis.document = { hidden: false };
  try {
    const states = [];
    const session = Object.create(VoiceSession.prototype);
    session.request = async () => { throw new Error('Groq speech model terms required.'); };
    session.onState = state => states.push(state);
    session.stream = null;
    session.busy = true;
    await session.speak('Hello there, Viraj! How are you? 🌟', 'turn-1', () => true);
    assert.deepEqual(spoken.map(utterance => utterance.text), ['Hello there, Viraj! How are you?']);
    assert.equal(spoken[0].rate, 0.9);
    assert.equal(spoken[0].pitch, 1.12);
    assert.equal(spoken[0].voice.name, 'Microsoft Mark - English (United States)');
    assert.ok(states.includes('talking'));
    assert.equal(states.at(-1), 'listening');
    assert.equal(session.busy, false);
    assert.equal(session.localSpeechSynthesis, null);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('voice sends earlier turns from the active session as conversation context', async () => {
  const replies = [];
  let transcript = 'I like elephants.';
  const session = Object.create(VoiceSession.prototype);
  session.history = [{ role: 'assistant', content: 'We are playing an animal game.' }];
  session.voiceProfile = { pitchBand: 'higher', energy: 'soft' };
  session.turns = new Set();
  session.recordingMime = 'audio/webm';
  session.onState = () => {};
  session.onTranscript = () => {};
  session.onMessage = () => {};
  session.speak = async () => {};
  session.request = async (url, options) => {
    if (url.endsWith('/transcribe')) return { transcript };
    const body = JSON.parse(options.body);
    replies.push(body);
    return { reply: transcript === 'I like elephants.' ? 'Elephants have trunks!' : 'They can spray water.' };
  };
  await session.process(new Blob(['first recording']), 1000, () => true);
  transcript = 'They spray water.';
  await session.process(new Blob(['second recording']), 1000, () => true);
  assert.deepEqual(replies[0].history, [{ role: 'assistant', content: 'We are playing an animal game.' }, { role: 'user', content: 'I like elephants.' }]);
  assert.deepEqual(replies[0].voiceProfile, { pitchBand: 'higher', energy: 'soft' });
  assert.deepEqual(replies[1].history, [
    { role: 'assistant', content: 'We are playing an animal game.' },
    { role: 'user', content: 'I like elephants.' },
    { role: 'assistant', content: 'Elephants have trunks!' },
    { role: 'user', content: 'They spray water.' }
  ]);
});

test('server serves model availability without an app access code', async t => {
  const calls = [];
  const env = { GROQ_API_KEY: 'test-secret', BUDDY_ORIGIN: 'http://localhost' };
  const server = createBuddyServer({
    env,
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ data: Object.values(GROQ_MODELS).filter(id => id !== 'troy').map(id => ({ id })) }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  env.BUDDY_ORIGIN = base;
  const response = await fetch(base + '/api/voice/models');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).models, { stt: true, llm: true, tts: true });
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/models');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-secret');
});

test('STT, LLM and WAV TTS use Groq APIs and send the exact master prompt as system message', async t => {
  const calls = [];
  let promptSystem;
  const prompt = await readFile(promptUrl, 'utf8');
  const server = createBuddyServer({
    env: { GROQ_API_KEY: 'server-only-secret', BUDDY_ORIGIN: 'http://localhost' },
    fetcher: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/audio/transcriptions')) return new Response(JSON.stringify({ text: 'Yes!' }));
      if (url.endsWith('/chat/completions')) {
        const body = JSON.parse(options.body);
        promptSystem = body.messages[0];
        return new Response(JSON.stringify({ choices: [{ message: { content: 'Wonderful! Shall we count two trucks?' } }], usage: { prompt_tokens: 10, completion_tokens: 9 } }));
      }
      if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]));
      throw new Error(`Unexpected Groq URL: ${url}`);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Origin: 'http://localhost' };
  const form = new FormData();
  form.append('audio', new Blob(['test audio'], { type: 'audio/webm' }), 'utterance.webm');
  const stt = await fetch(base + '/api/voice/transcribe', { method: 'POST', headers: { ...headers, 'X-Turn-Id': 'turn-1', 'X-Audio-Seconds': '1.2' }, body: form });
  assert.deepEqual(await stt.json(), { turnId: 'turn-1', transcript: 'Yes!' });
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.match(await calls[0].options.body.get('file').text(), /test audio/);
  assert.equal(calls[0].options.body.get('model'), 'whisper-large-v3-turbo');
  const reply = await fetch(base + '/api/voice/reply', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ turnId: 'turn-1', transcript: 'Yes!', history: [{ role: 'assistant', content: 'We can play!' }], voiceProfile: { pitchBand: 'higher', energy: 'soft' } }) });
  assert.equal((await reply.json()).reply, 'Wonderful! Shall we count two trucks?');
  assert.equal(calls[1].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.deepEqual(promptSystem, { role: 'system', content: prompt });
  const llmBody = JSON.parse(calls[1].options.body);
  assert.equal(llmBody.model, 'openai/gpt-oss-20b');
  assert.equal(llmBody.max_completion_tokens, 1024);
  assert.deepEqual(llmBody.messages[1], {
    role: 'system',
    content: 'A rough, local acoustic sample suggests a soft speaking level and higher pitch. These are uncertain sound measurements, not speaker identification. Use them only as gentle delivery hints. Do not infer identity, age, gender, mood, health, or intent from them.'
  });
  assert.deepEqual(llmBody.messages[2], { role: 'assistant', content: 'We can play!' });
  assert.deepEqual(llmBody.messages[3], { role: 'user', content: 'Yes!' });
  const speech = await fetch(base + '/api/voice/speak', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Wonderful!', requestId: 'turn-1:0' }) });
  assert.equal(speech.headers.get('content-type'), 'audio/wav');
  assert.deepEqual([...new Uint8Array(await speech.arrayBuffer())], [82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]);
  assert.equal(calls[2].url, 'https://api.groq.com/openai/v1/audio/speech');
  assert.deepEqual(JSON.parse(calls[2].options.body), { model: 'canopylabs/orpheus-v1-english', voice: 'troy', input: 'Wonderful!', response_format: 'wav' });
  const followUp = await fetch(base + '/api/voice/reply', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ turnId: 'follow-up-1', transcript: '', followUp: true, history: [{ role: 'assistant', content: 'Which animal should we meet?' }] })
  });
  assert.equal((await followUp.json()).reply, 'Wonderful! Shall we count two trucks?');
  assert.equal(calls[3].url, 'https://api.groq.com/openai/v1/chat/completions');
  const followUpBody = JSON.parse(calls[3].options.body);
  assert.deepEqual(followUpBody.messages.at(-1), {
    role: 'user',
    content: 'About 20 seconds have passed since your last spoken turn and the child has not responded. Gently follow up once, changing to a fresh playful topic or activity. Keep it brief, offer an easy way to join in, and do not pressure the child.'
  });
  const invalidProfile = await fetch(base + '/api/voice/reply', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ turnId: 'turn-invalid-profile', transcript: 'Hello!', voiceProfile: { pitchBand: 'my voice', energy: 'soft' } })
  });
  assert.equal(invalidProfile.status, 400);
  const browserSources = await Promise.all(['../web/js/app.js', '../web/js/voice.js', '../web/js/config.js'].map(file => readFile(new URL(file, import.meta.url), 'utf8')));
  assert.equal(browserSources.some(source => source.includes('server-only-secret') || source.includes('GROQ_API_KEY')), false);
});

test('TTS model terms errors explain the required Groq Console action', async t => {
  const server = createBuddyServer({
    env: { GROQ_API_KEY: 'test-secret', BUDDY_ORIGIN: 'http://localhost' },
    fetcher: async () => new Response(JSON.stringify({ error: { code: 'model_terms_required' } }), { status: 400 })
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/voice/speak`, {
    method: 'POST',
    headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Hello!', requestId: 'terms-check' })
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'A grown-up must accept the Groq Orpheus speech model terms in the Groq Console, then try again.',
    code: 'GROQ_MODEL_TERMS_REQUIRED'
  });
});

test('Groq audio rejection detail is preserved for microphone troubleshooting', async t => {
  const server = createBuddyServer({
    env: { GROQ_API_KEY: 'test-secret', BUDDY_ORIGIN: 'http://localhost' },
    fetcher: async () => new Response(JSON.stringify({ error: { message: 'Invalid file format', code: 'invalid_file_format' } }), { status: 400 })
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const form = new FormData();
  form.append('audio', new Blob(['fake audio'], { type: 'audio/webm' }), 'utterance.webm');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/voice/transcribe`, {
    method: 'POST',
    headers: { Origin: 'http://localhost', 'X-Turn-Id': 'format-check', 'X-Audio-Seconds': '1' },
    body: form
  });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: 'Groq rejected the voice request: Invalid file format',
    code: 'GROQ_400'
  });
});

test('empty replies/transcripts and overlong TTS text are rejected before invalid downstream calls', async t => {
  let calls = 0;
  const server = createBuddyServer({ env: { GROQ_API_KEY: 'secret', BUDDY_ORIGIN: 'http://localhost' }, fetcher: async () => { calls++; return new Response(JSON.stringify({ choices: [{ message: { content: '' } }] })); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Origin: 'http://localhost', 'Content-Type': 'application/json' };
  assert.equal((await fetch(base + '/api/voice/reply', { method: 'POST', headers, body: JSON.stringify({ transcript: '' }) })).status, 400);
  assert.equal((await fetch(base + '/api/voice/speak', { method: 'POST', headers, body: JSON.stringify({ text: 'x'.repeat(201) }) })).status, 400);
  assert.equal(calls, 0);
});

test('legacy OpenAI realtime paths are absent from active server and browser voice modules', async () => {
  const sources = await Promise.all(['../server/index.mjs', '../web/js/voice.js', '../web/js/audioConfig.js'].map(path => readFile(new URL(path, import.meta.url), 'utf8')));
  for (const source of sources) assert.doesNotMatch(source, /OPENAI_API_KEY|gpt-realtime|gpt-4o-mini-transcribe|api\.openai\.com\/v1\/realtime/);
});
