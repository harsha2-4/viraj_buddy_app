import test from 'node:test';
import assert from 'node:assert/strict';
import { WakeLockController, wakeLockStatusMessage } from '../web/js/wakeLock.js';

function fakeSentinel() {
  const listeners = new Map();
  return {
    released: false,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    async release() {
      this.released = true;
      listeners.get('release')?.({ currentTarget: this });
    },
    emitRelease() {
      this.released = true;
      listeners.get('release')?.({ currentTarget: this });
    }
  };
}

function harness({ supported = true, requestError } = {}) {
  const documentObject = new EventTarget();
  documentObject.hidden = false;
  const windowObject = new EventTarget();
  const statuses = [];
  const sentinels = [];
  let requests = 0;
  const navigatorObject = supported ? {
    wakeLock: {
      async request(type) {
        assert.equal(type, 'screen');
        requests++;
        if (requestError) throw requestError;
        const sentinel = fakeSentinel();
        sentinels.push(sentinel);
        return sentinel;
      }
    }
  } : {};
  const controller = new WakeLockController({
    navigatorObject,
    documentObject,
    windowObject,
    onStatus: status => statuses.push(status)
  });
  return {
    controller,
    documentObject,
    windowObject,
    statuses,
    sentinels,
    get requests() { return requests; }
  };
}

test('wake lock is requested once per active session and retained through silence', async () => {
  const app = harness();
  await app.controller.start();
  await app.controller.acquire();
  assert.equal(app.requests, 1);
  assert.equal(app.statuses.at(-1), 'active');
  assert.equal(app.statuses.filter(status => status === 'requesting').length, 1);

  app.documentObject.hidden = true;
  app.documentObject.dispatchEvent(new Event('visibilitychange'));
  assert.equal(app.requests, 1);
  app.documentObject.hidden = false;
  app.documentObject.dispatchEvent(new Event('visibilitychange'));
  assert.equal(app.requests, 1);

  app.controller.stop();
  assert.equal(app.sentinels[0].released, true);
});

test('unexpected release is reported and reacquired only when visible', async () => {
  const app = harness();
  await app.controller.start();
  app.sentinels[0].emitRelease();
  assert.equal(app.statuses.at(-1), 'released');
  assert.equal(app.requests, 1);

  app.documentObject.hidden = true;
  app.documentObject.dispatchEvent(new Event('visibilitychange'));
  assert.equal(app.requests, 1);
  app.documentObject.hidden = false;
  app.documentObject.dispatchEvent(new Event('visibilitychange'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.requests, 2);
  app.controller.stop();
});

test('wake lock setting releases on disable and resumes on enable', async () => {
  const app = harness();
  await app.controller.start();
  await app.controller.setEnabled(false);
  assert.equal(app.sentinels[0].released, true);
  await app.controller.setEnabled(true);
  assert.equal(app.requests, 2);
  app.controller.stop();
});

test('unsupported wake lock reports manual device guidance without blocking sessions', async () => {
  const app = harness({ supported: false });
  await app.controller.start();
  assert.equal(app.requests, 0);
  assert.equal(app.statuses.at(-1), 'unsupported');
  assert.match(wakeLockStatusMessage('unsupported'), /Auto-Lock|Display sleep/);
  app.controller.stop();
});

test('denied wake lock does not retry until a real visibility return', async () => {
  const app = harness({ requestError: Object.assign(new Error('blocked'), { name: 'NotAllowedError' }) });
  await app.controller.start();
  assert.equal(app.statuses.at(-1), 'restricted');
  app.documentObject.dispatchEvent(new Event('visibilitychange'));
  assert.equal(app.requests, 1);

  app.documentObject.hidden = true;
  app.documentObject.dispatchEvent(new Event('visibilitychange'));
  app.documentObject.hidden = false;
  app.documentObject.dispatchEvent(new Event('visibilitychange'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.requests, 2);
  app.controller.stop();
});
