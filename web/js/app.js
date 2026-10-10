import { CONFIG } from './config.js';
import { audioConfig } from './audioConfig.js';
import { AvatarController } from './animations.js';
import { getChatGptDestination } from './navigation.js';
import { VoiceSession } from './voice.js';
import { SceneController } from './scenes.js';
import { addConversationMessage, buildHistoryContext, clearConversations, endConversation, listConversations, startConversation } from './history.js';

const byId = (id) => document.getElementById(id);
const showHistoryWarning = (message = '') => {
  byId('history-warning').textContent = message;
  byId('history-warning').hidden = !message;
};
const avatar = new AvatarController(byId('avatar'), { enabled: CONFIG.enableAnimations });
const talkButton = byId('talk-button');
const photoButton = byId('photo-button');
const dialog = byId('parent-dialog');
const status = byId('status');
let navigationTimer;
let opening = false;
let active = false;
let muted = false;
let activeConversationId;
const scene = new SceneController(byId('scene'));
const states = { idle: 'Your AI adventure buddy', connecting: 'Connecting…', listening: 'I’m listening', thinking: 'Let me think…', talking: 'Buddy is talking' };
if (audioConfig.debug.enabled) {
  console.info('[Buddy audio config]', audioConfig);
}
const voice = new VoiceSession({
  onState(state) {
    avatar.setState(state);
    byId('buddy-state').textContent = states[state];
    byId('scene').dataset.talking = String(state === 'talking' && CONFIG.enableAnimations);
    if (state !== 'idle') status.textContent = states[state];
  },
  onTranscript(text) {
    byId('transcript').hidden = !text;
    byId('transcript').textContent = text;
    scene.follow(text);
  },
  onMessage(role, text) {
    if (!activeConversationId) return;
    try {
      addConversationMessage(activeConversationId, role, text);
      byId('history-status').textContent = 'Conversation history is saved on this device.';
      showHistoryWarning();
    } catch (error) {
      byId('history-status').textContent = `History could not be saved: ${error.message}`;
      showHistoryWarning(`Conversation history could not be saved: ${error.message}`);
    }
  },
  onSessionEnd() {
    if (!activeConversationId) return;
    try {
      endConversation(activeConversationId);
    } catch (error) {
      byId('history-status').textContent = `Conversation could not be finalized: ${error.message}`;
      showHistoryWarning(`Conversation could not be finalized: ${error.message}`);
    }
    activeConversationId = undefined;
  },
  onError(message) { status.textContent = message; },
  onActive(value) {
    active = value;
    talkButton.hidden = value;
    photoButton.hidden = value || !CONFIG.enableCameraButton;
    byId('voice-controls').hidden = !value;
    if (!value) {
      muted = false;
      byId('mute-button').textContent = 'Mute microphone';
      byId('mute-button').setAttribute('aria-pressed', 'false');
    }
  },
  onAudioBlocked(value) { byId('enable-audio').hidden = !value; }
});

document.title = CONFIG.appName;
// textContent keeps the configurable name from becoming HTML.
byId('greeting').firstChild.textContent = `Hi ${CONFIG.childName}! `;
byId('settings-title').textContent = CONFIG.appName;
photoButton.hidden = !CONFIG.enableCameraButton;

function showSettings() {
  const configured = Boolean(getChatGptDestination(CONFIG.chatgptUrl));
  byId('destination-status').textContent = configured ? 'Configured' : 'Not Configured';
  byId('setup-help').hidden = configured;
  renderHistory();
  if (!dialog.open) dialog.showModal();
}

function renderHistory() {
  const list = byId('history-list');
  list.replaceChildren();
  try {
    const conversations = listConversations();
    byId('history-status').textContent = conversations.length
      ? `Saved on this device only. The most recent ${conversations.length} conversation${conversations.length === 1 ? '' : 's'} are shown.`
      : 'No saved conversations yet.';
    for (const conversation of conversations) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      const firstUserMessage = conversation.messages.find((message) => message.role === 'user')?.text;
      summary.textContent = `${new Date(conversation.startedAt).toLocaleString()} — ${firstUserMessage || 'Conversation started'}`;
      details.append(summary);
      for (const message of conversation.messages) {
        const line = document.createElement('p');
        line.className = 'history-message';
        line.textContent = `${message.role === 'user' ? 'Viraj' : 'Buddy'}: ${message.text}`;
        details.append(line);
      }
      list.append(details);
    }
  } catch (error) {
    byId('history-status').textContent = `Conversation history could not be read: ${error.message}`;
  }
}

function resetLauncher() {
  clearTimeout(navigationTimer);
  opening = false;
  talkButton.disabled = false;
  photoButton.disabled = false;
  if (!active) {
    avatar.setState('idle');
    status.textContent = 'What should we talk about today?';
  }
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
  voice.stop();
  talkButton.disabled = true;
  photoButton.disabled = true;
  avatar.celebrate();
  status.textContent = mode === 'photo' ? "Cool! Let's show Buddy! 📸" : "Yay! Let's talk! 🎉";
  // Same-tab navigation avoids popup blockers and unsupported Voice deep links.
  navigationTimer = setTimeout(() => window.location.assign(destination), 450);
}

function startVoice() {
  try {
    activeConversationId = startConversation();
    voice.historyContext = buildHistoryContext();
    showHistoryWarning();
  } catch (error) {
    activeConversationId = undefined;
    voice.historyContext = '';
    byId('history-status').textContent = `Conversation history is unavailable: ${error.message}`;
    showHistoryWarning(`Conversation history is unavailable: ${error.message}`);
  }
  byId('transcript').hidden = true;
  byId('transcript').textContent = '';
  scene.show('home');
  voice.start();
}
talkButton.addEventListener('click', startVoice);
byId('end-button').addEventListener('click', () => {
  voice.stop();
  status.textContent = 'See you on our next adventure!';
  talkButton.focus();
});
byId('mute-button').addEventListener('click', () => {
  muted = !muted;
  voice.mute(muted);
  byId('mute-button').textContent = muted ? 'Unmute microphone' : 'Mute microphone';
  byId('mute-button').setAttribute('aria-pressed', String(muted));
});
byId('enable-audio').addEventListener('click', () => voice.enableAudio());
photoButton.addEventListener('click', () => openBuddy('photo'));
byId('parent-button').addEventListener('click', showSettings);
dialog.addEventListener('click', (event) => {
  const box = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
});
byId('clear-history').addEventListener('click', () => {
  if (!window.confirm('Clear all conversation history saved on this device? This cannot be undone.')) return;
  try {
    clearConversations();
    renderHistory();
  } catch (error) {
    byId('history-status').textContent = `Conversation history could not be cleared: ${error.message}`;
  }
});
// Restore controls after returning via Back (including iOS's back/forward cache).
window.addEventListener('pageshow', resetLauncher);
window.addEventListener('pagehide', () => { clearTimeout(navigationTimer); voice.stop(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && active) { voice.stop(); status.textContent = 'Conversation paused. Tap Talk to Buddy to start again.'; }
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
