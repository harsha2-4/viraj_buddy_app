import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { getChatGptDestination } from '../web/js/navigation.js';
import { addConversationMessage, buildHistoryContext, clearConversations, endConversation, listConversations, startConversation } from '../web/js/history.js';
import { hasLegacyHistory, migrateLegacyHistory } from '../web/js/history.js';
import { createProfile, findProfile, listProfiles, validateProfileName } from '../web/js/profiles.js';
import { showExperienceScreen } from '../web/js/onboarding.js';

test('destination accepts authenticated ChatGPT paths and retains query/hash', () => {
  for (const value of ['https://chatgpt.com/g/g-p-123/project', 'https://chatgpt.com/c/123?model=auto#latest', 'https://chat.openai.com/c/123']) {
    assert.equal(getChatGptDestination(value), value);
  }
});

test('destination rejects placeholders, script URLs, spoofed hosts and credentials', () => {
  for (const value of [undefined, null, '', 'REPLACE_WITH_CHATGPT_PROJECT_URL', '/c/123',
    'javascript:alert(1)', 'intent://chatgpt.com', 'http://chatgpt.com',
    'https://chatgpt.com.evil.test', 'https://evilchatgpt.com',
    'https://chatgpt.com@evil.test', 'https://user:secret@chatgpt.com',
    'https://chatgpt.com:8443/c/123', 'https://example.com']) {
    assert.equal(getChatGptDestination(value), null, String(value));
  }
});

test('conversation history persists messages locally and builds bounded context from recent sessions', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
  const first = startConversation(storage, new Date('2026-01-01T10:00:00Z'), 'first');
  addConversationMessage(first, 'user', 'Let us explore the ocean.', storage);
  addConversationMessage(first, 'assistant', 'We can look for dolphins.', storage);
  endConversation(first, storage);
  const second = startConversation(storage, new Date('2026-01-02T10:00:00Z'), 'second');
  addConversationMessage(second, 'user', 'Can we find a rocket next?', storage);
  assert.deepEqual(listConversations(storage).map((conversation) => conversation.id), ['second', 'first']);
  assert.match(buildHistoryContext(storage), /Child: Let us explore the ocean/);
  assert.match(buildHistoryContext(storage), /Buddy: We can look for dolphins/);
  assert.match(buildHistoryContext(storage), /Child: Can we find a rocket next/);
  clearConversations(storage);
  assert.deepEqual(listConversations(storage), []);
});

test('history context is bounded and malformed saved records fail explicitly', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
  const id = startConversation(storage, new Date(), 'bounded');
  addConversationMessage(id, 'user', 'x'.repeat(3000), storage);
  assert.ok(buildHistoryContext(storage).length <= 2000);
  values.set('viraj-buddy:conversation-history:v1', '{');
  assert.throws(() => listConversations(storage), SyntaxError);
});

test('profile names are trimmed, required, and looked up case-insensitively without overwriting duplicates', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
  assert.throws(() => validateProfileName('  \t '), /Enter a name/);
  assert.equal(validateProfileName('  Sam   Lee  '), 'Sam Lee');
  const profile = createProfile('  Sam   Lee ', storage, new Date('2026-01-01T10:00:00Z'), 'sam-id');
  assert.equal(findProfile('sAM lEe', storage).id, profile.id);
  assert.throws(() => createProfile('SAM LEE', storage, new Date(), 'other-id'), error => error.code === 'PROFILE_EXISTS' && error.profile.id === 'sam-id');
  assert.deepEqual(listProfiles(storage), [profile]);
});

test('conversation history is isolated per profile', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
  const first = startConversation(storage, new Date('2026-01-01T10:00:00Z'), 'first', 'user-a');
  addConversationMessage(first, 'user', 'A private first-user topic.', storage, new Date(), 'user-a');
  const second = startConversation(storage, new Date('2026-01-02T10:00:00Z'), 'second', 'user-b');
  addConversationMessage(second, 'user', 'A different second-user topic.', storage, new Date(), 'user-b');
  assert.equal(listConversations(storage, 'user-a')[0].messages[0].text, 'A private first-user topic.');
  assert.equal(listConversations(storage, 'user-b')[0].messages[0].text, 'A different second-user topic.');
  clearConversations(storage, 'user-a');
  assert.deepEqual(listConversations(storage, 'user-a'), []);
  assert.equal(listConversations(storage, 'user-b').length, 1);
});

test('legacy history stays unassigned until explicit restore and is never overwritten', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
  const id = startConversation(storage, new Date('2026-01-01T10:00:00Z'), 'legacy');
  addConversationMessage(id, 'user', 'Old conversation.', storage);
  assert.equal(hasLegacyHistory(storage), true);
  assert.equal(listConversations(storage, 'new-user').length, 0);
  assert.deepEqual(migrateLegacyHistory('new-user', storage), { migrated: true, conversations: 1 });
  assert.equal(listConversations(storage, 'new-user')[0].messages[0].text, 'Old conversation.');
  assert.equal(hasLegacyHistory(storage), false);

  const existingId = startConversation(storage, new Date('2026-02-01T10:00:00Z'), 'legacy-two');
  addConversationMessage(existingId, 'user', 'Do not overwrite.', storage);
  startConversation(storage, new Date('2026-03-01T10:00:00Z'), 'existing', 'existing-user');
  assert.deepEqual(migrateLegacyHistory('existing-user', storage), { migrated: false, conversations: 0 });
  assert.equal(hasLegacyHistory(storage), true);
  assert.equal(listConversations(storage, 'existing-user').length, 1);
});

test('welcome and onboarding screen transitions expose one focused panel at a time', () => {
  const focusCalls = [];
  const panels = Object.fromEntries(['welcome', 'newUser', 'existingUser', 'session'].map(name => [name, {
    hidden: true,
    querySelector(selector) {
      assert.equal(selector, 'input, button, h1');
      return { focus() { focusCalls.push(name); } };
    }
  }]));
  showExperienceScreen('newUser', panels);
  assert.deepEqual(Object.fromEntries(Object.entries(panels).map(([name, panel]) => [name, panel.hidden])), {
    welcome: true, newUser: false, existingUser: true, session: true
  });
  showExperienceScreen('existingUser', panels);
  assert.equal(panels.newUser.hidden, true);
  assert.equal(panels.existingUser.hidden, false);
  showExperienceScreen('session', panels);
  assert.equal(panels.session.hidden, false);
  showExperienceScreen('welcome', panels);
  assert.deepEqual(focusCalls, ['newUser', 'existingUser', 'session', 'welcome']);
  assert.throws(() => showExperienceScreen('unknown', panels), RangeError);
});

test('recording errors explain microphone denial, missing devices, unsupported browsers, and retry', async () => {
  const { recordingFailureMessage } = await import('../web/js/onboarding.js');
  assert.match(recordingFailureMessage({ name: 'NotAllowedError' }), /denied.*retry/i);
  assert.match(recordingFailureMessage({ name: 'NotFoundError' }), /No microphone/);
  assert.match(recordingFailureMessage(new Error('Voice profiling needs a supported browser using HTTPS or localhost.')), /secure connection/);
  assert.match(recordingFailureMessage(new Error('I could not hear a clear voice sample. Try again somewhere quiet.')), /Try again somewhere quiet/);
});

async function workerHarness() {
  const source = await readFile(new URL('../web/service-worker.js', import.meta.url), 'utf8');
  const listeners = {};
  const stored = new Map();
  const deleted = [];
  const requests = [];
  const scope = 'https://example.test/viraj-ai-buddy/';
  const prefix = `viraj-buddy:${scope}:`;
  const keys = [prefix + 'v0', prefix + 'v2', 'viraj-buddy:https://example.test/another/:v0', 'other-app'];
  let offline = false;
  let claimed = false;
  let skippedWaiting = false;
  const cache = {
    async addAll(urls) { urls.forEach(url => stored.set(url, new Response('cached ' + url))); },
    async match(request) { return stored.get(typeof request === 'string' ? request : request.url)?.clone(); },
    async put(request, response) { stored.set(request.url, response); }
  };
  vm.runInNewContext(source, {
    URL, Response,
    self: { registration: { scope }, location: new URL(scope),
      async skipWaiting() { skippedWaiting = true; },
      clients: { async claim() { claimed = true; } },
      addEventListener(name, listener) { listeners[name] = listener; } },
    caches: { async open() { return cache; }, async keys() { return keys; }, async delete(key) { deleted.push(key); } },
    async fetch(request) {
      requests.push(request.url);
      if (offline) throw new Error('offline');
      return new Response('fresh ' + request.url);
    }
  });
  async function lifecycle(name) {
    let pending;
    listeners[name]({ waitUntil(promise) { pending = promise; } });
    await pending;
  }
  function get(url, options = {}) {
    let response;
    listeners.fetch({ request: { url, method: 'GET', mode: 'cors', ...options }, respondWith(promise) { response = promise; } });
    return response;
  }
  return { scope, prefix, stored, deleted, requests, lifecycle, get,
    setOffline() { offline = true; }, get claimed() { return claimed; }, get skippedWaiting() { return skippedWaiting; } };
}

test('worker precaches only own repository path and cleans only its own old cache', async () => {
  const worker = await workerHarness();
  await worker.lifecycle('install');
  assert.equal(worker.stored.size, 20);
  assert.ok([...worker.stored.keys()].some(url => url.endsWith('/js/audioConfig.js')));
  assert.ok([...worker.stored.keys()].some(url => url.endsWith('/js/profiles.js')));
  assert.ok([...worker.stored.keys()].some(url => url.endsWith('/js/onboarding.js')));
  assert.ok([...worker.stored.keys()].some(url => url.endsWith('/js/voiceProfile.js')));
  assert.ok([...worker.stored.keys()].some(url => url.endsWith('/js/wakeLock.js')));
  for (const url of worker.stored.keys()) assert.ok(url.startsWith(worker.scope));
  await worker.lifecycle('activate');
  assert.deepEqual(worker.deleted, [worker.prefix + 'v0', worker.prefix + 'v2']);
  assert.equal(worker.claimed, true);
  assert.equal(worker.skippedWaiting, true);
});

test('worker ignores ChatGPT, unknown paths, other apps, query URLs and POST', async () => {
  const worker = await workerHarness();
  for (const url of ['https://chatgpt.com/c/123', 'https://example.test/private',
    worker.scope + 'unknown.js', worker.scope + '?secret=example']) assert.equal(worker.get(url), undefined);
  assert.equal(worker.get(worker.scope, { method: 'POST' }), undefined);
  assert.deepEqual(worker.requests, []);
});

test('worker refreshes config online and restores the cached launcher/config offline', async () => {
  const worker = await workerHarness();
  await worker.lifecycle('install');
  const config = worker.scope + 'js/config.js';
  assert.equal(await (await worker.get(config)).text(), 'fresh ' + config);
  worker.setOffline();
  assert.equal(await (await worker.get(config)).text(), 'fresh ' + config);
  assert.equal(await (await worker.get(worker.scope, { mode: 'navigate' })).text(), 'cached ' + worker.scope);
  assert.equal(await (await worker.get(worker.scope + 'css/styles.css')).text(), 'cached ' + worker.scope + 'css/styles.css');
});
