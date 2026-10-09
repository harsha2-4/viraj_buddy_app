import { CONFIG } from './config.js';
import { AvatarController } from './animations.js';
import { getChatGptDestination } from './navigation.js';

const byId = (id) => document.getElementById(id);
const avatar = new AvatarController(byId('avatar'), { enabled: CONFIG.enableAnimations });
const talkButton = byId('talk-button');
const photoButton = byId('photo-button');
const dialog = byId('parent-dialog');
const status = byId('status');
let navigationTimer;
let opening = false;

document.title = CONFIG.appName;
// textContent keeps the configurable name from becoming HTML.
byId('greeting').firstChild.textContent = `Hi ${CONFIG.childName}! `;
byId('settings-title').textContent = CONFIG.appName;
photoButton.hidden = !CONFIG.enableCameraButton;

function showSettings() {
  const configured = Boolean(getChatGptDestination(CONFIG.chatgptUrl));
  byId('destination-status').textContent = configured ? 'Configured' : 'Not Configured';
  byId('setup-help').hidden = configured;
  if (!dialog.open) dialog.showModal();
}

function resetLauncher() {
  clearTimeout(navigationTimer);
  opening = false;
  talkButton.disabled = false;
  photoButton.disabled = false;
  avatar.setState('idle');
  status.textContent = 'What should we talk about today?';
}

/** Both actions hand off to ChatGPT. Photo capture is deliberately not implemented. */
function openBuddy(mode) {
  if (opening) return;
  const destination = getChatGptDestination(CONFIG.chatgptUrl);
  if (!destination) {
    status.textContent = 'A grown-up can help set up Buddy.';
    showSettings();
    return;
  }
  if (!navigator.onLine) {
    status.textContent = 'Ask a grown-up to connect to the internet, then try again.';
    return;
  }
  opening = true;
  talkButton.disabled = true;
  photoButton.disabled = true;
  avatar.celebrate();
  status.textContent = mode === 'photo' ? "Cool! Let's show Buddy! 📸" : "Yay! Let's talk! 🎉";
  // Same-tab navigation avoids popup blockers and unsupported Voice deep links.
  navigationTimer = setTimeout(() => window.location.assign(destination), 450);
}

talkButton.addEventListener('click', () => openBuddy('talk'));
photoButton.addEventListener('click', () => openBuddy('photo'));
byId('parent-button').addEventListener('click', showSettings);
dialog.addEventListener('click', (event) => {
  const box = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
});
// Restore controls after returning via Back (including iOS's back/forward cache).
window.addEventListener('pageshow', resetLauncher);
window.addEventListener('pagehide', () => clearTimeout(navigationTimer));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && opening) resetLauncher();
});

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', { scope: './', updateViaCache: 'none' })
      .catch((error) => {
        // The launcher still works online if caching is unavailable.
        if (CONFIG.debugMode) console.warn('Buddy offline setup unavailable:', error);
      });
  });
}
