const WAKE_LOCK_MESSAGE = 'Keep Screen Awake During Conversation is on.';

export class WakeLockController {
  constructor({
    navigatorObject = globalThis.navigator,
    documentObject = globalThis.document,
    windowObject = globalThis.window,
    onStatus = () => {}
  } = {}) {
    this.navigator = navigatorObject;
    this.document = documentObject;
    this.window = windowObject;
    this.onStatus = onStatus;
    this.enabled = true;
    this.active = false;
    this.sentinel = null;
    this.pending = null;
    this.generation = 0;
    this.wasHidden = Boolean(this.document?.hidden);
    this.handleVisibility = () => {
      if (this.document.hidden) {
        this.wasHidden = true;
        return;
      }
      if (this.wasHidden && this.active && this.enabled) {
        this.wasHidden = false;
        this.acquire();
      }
    };
    this.handlePageShow = () => {
      if (this.active && this.enabled) this.acquire();
    };
    this.handleRelease = (event) => {
      if (this.sentinel !== event.currentTarget) return;
      this.sentinel = null;
      event.currentTarget.removeEventListener('release', this.handleRelease);
      if (this.active && this.enabled) {
        this.onStatus('released');
      }
    };
  }

  get supported() {
    return Boolean(this.navigator && 'wakeLock' in this.navigator && this.navigator.wakeLock?.request);
  }

  start() {
    this.active = true;
    this.generation++;
    this.document?.addEventListener('visibilitychange', this.handleVisibility);
    this.window?.addEventListener('pageshow', this.handlePageShow);
    return this.acquire();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.generation++;
      this.release();
      this.onStatus('disabled');
      return Promise.resolve();
    }
    if (this.active) return this.acquire();
    this.onStatus('ready');
    return Promise.resolve();
  }

  stop() {
    this.active = false;
    this.generation++;
    this.document?.removeEventListener('visibilitychange', this.handleVisibility);
    this.window?.removeEventListener('pageshow', this.handlePageShow);
    this.release();
  }

  async acquire() {
    if (!this.active || !this.enabled) return;
    if (!this.supported) {
      this.onStatus('unsupported');
      return;
    }
    if (this.document?.hidden) return;
    if (this.sentinel && !this.sentinel.released) {
      this.onStatus('active');
      return;
    }
    if (this.pending) return this.pending;

    const generation = this.generation;
    this.onStatus('requesting');
    this.pending = this.navigator.wakeLock.request('screen')
      .then(async (sentinel) => {
        if (generation !== this.generation || !this.active || !this.enabled || this.document?.hidden) {
          await sentinel.release();
          return;
        }
        this.sentinel = sentinel;
        sentinel.addEventListener('release', this.handleRelease);
        this.onStatus('active');
      })
      .catch((error) => {
        if (generation === this.generation && this.active && this.enabled) {
          this.onStatus(error?.name === 'NotAllowedError' ? 'restricted' : 'unavailable');
        }
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  release() {
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (!sentinel) return;
    sentinel.removeEventListener('release', this.handleRelease);
    if (!sentinel.released) {
      sentinel.release().catch(() => {
        if (this.active && this.enabled) this.onStatus('unavailable');
      });
    }
  }
}

export function wakeLockStatusMessage(status) {
  switch (status) {
    case 'active':
      return WAKE_LOCK_MESSAGE;
    case 'unsupported':
      return 'Screen wake lock is not supported here. To keep the screen on, adjust Auto-Lock or Display sleep in your device settings.';
    case 'restricted':
      return 'The browser or device did not allow a screen wake lock. Check Low Power Mode or battery settings, or adjust Auto-Lock / Display sleep manually.';
    case 'unavailable':
      return 'Could not keep the screen awake. Check browser and battery settings, or adjust Auto-Lock / Display sleep manually.';
    case 'released':
      return 'The screen wake lock was released by the browser or device. It will be requested again when the app is visible.';
    case 'disabled':
      return 'Screen wake lock is off. The display may dim according to device settings.';
    case 'ready':
      return 'Screen wake lock will be requested during the next voice conversation.';
    case 'requesting':
      return 'Requesting screen wake lock for this conversation.';
    default:
      return '';
  }
}
