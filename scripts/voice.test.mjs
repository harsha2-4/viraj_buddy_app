import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuddyServer } from '../server/index.mjs';
import { sceneForText } from '../web/js/scenes.js';
import { VoiceSession } from '../web/js/voice.js';

test('scene follows the latest topic and keeps the previous illustration for unrelated speech', () => {
  assert.equal(sceneForText('We left the ocean. Here is a rocket!'), 'space');
  assert.equal(sceneForText('A dinosaur can stomp.'), 'dinosaurs');
  assert.equal(sceneForText('That sounds lovely.', 'garden'), 'garden');
  assert.equal(sceneForText('Someone has a thoughtful idea.'), 'home');
});

test('speech gestures end with audio playback, not with generation completion', () => {
  const states = [], captions = [];
  const session = Object.create(VoiceSession.prototype);
  session.onState = state => states.push(state);
  session.onTranscript = text => captions.push(text);
  session.handle({ type: 'response.created' });
  session.handle({ type: 'response.output_audio_transcript.delta', delta: 'A rocket' });
  session.handle({ type: 'output_audio_buffer.started' });
  session.handle({ type: 'response.done', response: { status: 'completed' } });
  assert.equal(states.at(-1), 'talking');
  session.handle({ type: 'output_audio_buffer.stopped' });
  assert.equal(states.at(-1), 'listening');
  assert.deepEqual(captions, ['A rocket']);
  session.handle({ type: 'input_audio_buffer.speech_started' });
  assert.equal(states.at(-1), 'listening');
});

test('backend allows direct voice access, checks origin, and forwards a fixed voice session', async t => {
  let outbound;
  const server = createBuddyServer({ env: { OPENAI_API_KEY: 'test-secret', BUDDY_ORIGIN: 'http://localhost' }, fetcher: async (url, options) => {
    outbound = { url, options };
    return new Response('v=0\r\nanswer');
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Origin: 'http://localhost', 'Content-Type': 'application/sdp' };
  const post = overrides => fetch(base + '/api/session', { method: 'POST', headers: { ...headers, ...overrides }, body: 'v=0\r\noffer' });
  assert.equal((await post({ Origin: 'https://evil.test' })).status, 403);
  assert.equal(outbound, undefined);
  const response = await post({});
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'v=0\r\nanswer');
  assert.equal(outbound.options.headers.Authorization, 'Bearer test-secret');
  const session = JSON.parse(outbound.options.body.get('session'));
  assert.equal(session.type, 'realtime');
  assert.equal(session.audio.input.turn_detection.interrupt_response, true);
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/server/index.mjs')).status, 404);
  assert.equal((await fetch(base + '/.env')).status, 404);
  assert.equal((await fetch(base + '/js/voice.js')).status, 200);
});

test('missing API key and upstream failure are explicit without exposing secrets', async t => {
  for (const configured of [false, true]) {
    const server = createBuddyServer({ env: configured ? { OPENAI_API_KEY: 'secret', BUDDY_ORIGIN: 'http://localhost' } : {}, fetcher: async () => new Response('private error', { status: 401 }) });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/session`, { method: 'POST', headers: { Origin: 'http://localhost', 'Content-Type': 'application/sdp' }, body: 'v=0' });
    assert.equal(response.status, configured ? 502 : 503);
    assert.doesNotMatch(await response.text(), /private error|secret/);
  }
});
