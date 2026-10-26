import { CONFIG } from './config.js';
import { audioConfig } from './audioConfig.js';
import { WakeLockController, wakeLockStatusMessage } from './wakeLock.js';
import { AvatarController } from './animations.js';
import { getChatGptDestination } from './navigation.js';
import { VoiceSession } from './voice.js';
import { SceneController } from './scenes.js';
import { addConversationMessage, clearConversations, endConversation, listConversations, startConversation } from './history.js';
import { clearVoiceProfile, getVoiceProfile, recordVoiceProfile, saveVoiceProfile } from './voiceProfile.js';

const byId = (id) => document.getElementById(id);
const showHistoryWarning = (message = '') => {
  byId('history-warning').textContent = message;
  byId('history-warning').hidden = !message;
};
const screenAwakeKey = 'viraj-buddy:keep-screen-awake:v1';
const screenAwakeToggle = byId('keep-screen-awake');
const screenAwakeValue = byId('screen-awake-value');
const screenAwakeStatus = byId('screen-awake-status');
let keepScreenAwake = true;
try {
  keepScreenAwake = localStorage.getItem(screenAwakeKey) !== 'false';
} catch {
  screenAwakeStatus.textContent = 'This browser cannot save the screen-awake preference. It will remain on for this page.';
}
screenAwakeToggle.checked = keepScreenAwake;
screenAwakeValue.textContent = keepScreenAwake ? 'ON' : 'OFF';
const wakeLock = new WakeLockController({
  onStatus(state) {
    screenAwakeStatus.textContent = wakeLockStatusMessage(state);
  }
});
if (!wakeLock.supported) {
  screenAwakeStatus.textContent = wakeLockStatusMessage('unsupported');
} else {
  screenAwakeStatus.textContent = wakeLockStatusMessage(keepScreenAwake ? 'ready' : 'disabled');
}
const avatar = new AvatarController(byId('avatar'), { enabled: CONFIG.enableAnimations });
const talkButton = byId('talk-button');
const photoButton = byId('photo-button');
const dialog = byId('parent-dialog');
const status = byId('status');
let navigationTimer;
let opening = false;
let active = false;
let voiceErrorVisible = false;
let muted = false;
let activeConversationId;
let profileAbortController;
dialog.addEventListener('close', () => profileAbortController?.abort());
const scene = new SceneController(byId('scene'));
const states = { idle: 'Your AI adventure buddy', connecting: 'Connecting…', listening: 'I’m listening', thinking: 'Let me think…', transcribing: 'I’m listening', generating: 'Let me think…', generatingSpeech: 'Getting ready to speak…', talking: 'Buddy is talking' };
let conversationMemoryEnabled = true;
if (audioConfig.debug.enabled) {
  console.info('[Buddy audio config]', audioConfig);
}
const voice = new VoiceSession({
  onTranscript(text) {
    voiceErrorVisible = false;
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
  onError(message) {
    voiceErrorVisible = true;
    status.textContent = message;
  },
  onState(state) {
    avatar.setState(state);
    byId('buddy-state').textContent = states[state];
    byId('scene').dataset.talking = String(state === 'talking' && CONFIG.enableAnimations);
    if (state === 'transcribing') voiceErrorVisible = false;
    if (state !== 'idle' && !voiceErrorVisible) status.textContent = states[state];
  },
  onActive(value) {
    active = value;
    if (value && keepScreenAwake) wakeLock.start();
    else wakeLock.stop();
    talkButton.hidden = value;
    if (!value) talkButton.disabled = false;
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
  renderVoiceProfile();
  if (!dialog.open) dialog.showModal();
}

async function renderVoiceProfile() {
  try {
    const record = await getVoiceProfile();
    byId('voice-profile-status').textContent = record
      ? `Saved on this device. Rough profile: ${record.profile.energy} voice level, ${record.profile.pitchBand} pitch.`
      : 'No voice profile is saved on this device.';
    byId('delete-voice-profile').hidden = !record;
  } catch (error) {
    byId('voice-profile-status').textContent = `Voice profile could not be read: ${error.message}`;
    byId('delete-voice-profile').hidden = false;
  }
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

async function startVoice() {
  talkButton.disabled = true;
  try {
    const profileRecord = await getVoiceProfile();
    if (!profileRecord) {
      status.textContent = 'A grown-up needs to set up the child voice profile before the first voice adventure.';
      showSettings();
      byId('voice-profile-status').textContent = 'Please ask a grown-up to review the voice-profile notice and record a short sample first.';
      talkButton.disabled = false;
      return;
    }
    voiceErrorVisible = false;
    activeConversationId = startConversation();
    const history = (conversationMemoryEnabled ? listConversations().reverse().flatMap(conversation => conversation.messages) : [])
      .slice(-12).map(message => ({ role: message.role, content: message.text }));
    showHistoryWarning();
    byId('transcript').hidden = true;
    byId('transcript').textContent = '';
    scene.show('home');
    await voice.start({ history, voiceProfile: profileRecord.profile, initialTurnId: crypto.randomUUID() });
  } catch (error) {
    activeConversationId = undefined;
    status.textContent = `Voice could not start: ${error.message}`;
    if (dialog.open) byId('voice-profile-status').textContent = `Voice profile could not be read: ${error.message}`;
  } finally {
    if (!active) talkButton.disabled = false;
  }
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
byId('verify-voice-setup').addEventListener('click', async () => {
  byId('voice-setup-status').textContent = 'Checking Groq model availability…';
  try {
    const response = await fetch('/api/voice/models', { signal: AbortSignal.timeout(15000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not check voice setup.');
    Object.assign(audioConfig.microphone, {
      echoCancellation: result.voice?.echoCancellation !== false,
      noiseSuppression: result.voice?.noiseSuppression !== false,
      autoGainControl: result.voice?.autoGainControl !== false
    });
    if (Number.isFinite(result.voice?.endSilenceMs)) audioConfig.vad.endSilenceMs = result.voice.endSilenceMs;
    if (Number.isFinite(result.voice?.minSpeechMs)) audioConfig.minSpeechMs = result.voice.minSpeechMs;
    if (Number.isFinite(result.voice?.maxUtteranceMs)) audioConfig.vad.maxUtteranceMs = result.voice.maxUtteranceMs;
    if (Number.isFinite(result.voice?.vadThreshold)) audioConfig.vad.absoluteThreshold = result.voice.vadThreshold;
    if (Number.isFinite(result.voice?.vadNoiseMultiplier)) audioConfig.vad.noiseMultiplier = result.voice.vadNoiseMultiplier;
    conversationMemoryEnabled = result.voice?.conversationMemoryEnabled !== false;
    byId('conversation-memory-status')?.replaceChildren(document.createTextNode(result.voice?.conversationMemoryEnabled === false ? 'Recent history will not be sent to Groq.' : 'Recent history helps Buddy continue the conversation.'));
    if (result.voice?.vadEnabled === false) throw new Error('Local speech detection is disabled in server settings.');
    byId('voice-setup-status').textContent = 'All three models are listed. If Groq speech is unavailable, Buddy will use this device’s voice.';
    const usageResponse = await fetch('/api/voice/usage', { signal: AbortSignal.timeout(10000) });
    if (usageResponse.ok) {
      const usage = await usageResponse.json();
      const latencyCalls = usage.sttRequests + usage.llmRequests + usage.ttsRequests;
      const averageLatency = latencyCalls ? Math.round(usage.latencyMs / latencyCalls) : 0;
      byId('voice-usage-status').textContent = `${usage.day} UTC · STT ${usage.sttRequests} requests / ${Math.round(usage.audioSeconds)} audio seconds · LLM ${usage.llmRequests} requests / ${usage.inputTokens + usage.outputTokens} tokens · TTS ${usage.ttsRequests} requests / ${usage.ttsCharacters} characters · ${usage.rateLimitErrors} rate-limit errors · ${averageLatency} ms average latency · estimated $${Number(usage.estimatedUsd).toFixed(4)} of $${Number(usage.dailyLimitUsd).toFixed(2)} daily limit.`;
    } else byId('voice-usage-status').textContent = 'Daily usage counters are not available right now.';
  } catch (error) {
    byId('voice-setup-status').textContent = error.message;
  }
});
screenAwakeToggle.addEventListener('change', () => {
  keepScreenAwake = screenAwakeToggle.checked;
  screenAwakeValue.textContent = keepScreenAwake ? 'ON' : 'OFF';
  wakeLock.setEnabled(keepScreenAwake);
  try {
    localStorage.setItem(screenAwakeKey, String(keepScreenAwake));
  } catch {
    screenAwakeStatus.textContent = 'This browser cannot save the screen-awake preference. The current choice still applies until the page closes.';
  }
});
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
byId('create-voice-profile').addEventListener('click', async () => {
  const button = byId('create-voice-profile');
  if (!byId('voice-profile-consent').checked) {
    byId('voice-profile-status').textContent = 'A parent or guardian must review and agree to the voice-sample storage notice first.';
    byId('voice-profile-consent').focus();
    return;
  }
  const consent = byId('voice-profile-consent');
  const deleteButton = byId('delete-voice-profile');
  const cancelButton = byId('cancel-voice-profile');
  const controller = new AbortController();
  profileAbortController = controller;
  button.disabled = true;
  deleteButton.disabled = true;
  consent.disabled = true;
  cancelButton.hidden = false;
  byId('voice-profile-status').textContent = 'Recording for a few seconds. Please ask the child to answer the three prompts.';
  try {
    const { profile, sample } = await recordVoiceProfile({ signal: controller.signal });
    if (controller.signal.aborted) throw new Error('Voice profile recording was canceled.');
    await saveVoiceProfile(profile, sample);
    byId('voice-profile-status').textContent = 'Voice profile saved on this device. The raw sample stays here until deleted.';
    await renderVoiceProfile();
  } catch (error) {
    byId('voice-profile-status').textContent = controller.signal.aborted
      ? 'Voice recording was canceled. No new sample was saved.'
      : `Voice profile could not be saved: ${error.message}`;
  } finally {
    profileAbortController = null;
    cancelButton.hidden = true;
    deleteButton.disabled = false;
    consent.disabled = false;
    button.disabled = false;
  }
});
byId('cancel-voice-profile').addEventListener('click', () => profileAbortController?.abort());
byId('voice-profile-consent').addEventListener('change', (event) => {
  if (!event.currentTarget.checked) profileAbortController?.abort();
});
byId('delete-voice-profile').addEventListener('click', async () => {
  if (!window.confirm('Delete the saved child voice sample and profile from this device?')) return;
  try {
    profileAbortController?.abort();
    if (active) voice.stop();
    await clearVoiceProfile();
    await renderVoiceProfile();
    status.textContent = 'The child voice profile was deleted from this device.';
  } catch (error) {
    byId('voice-profile-status').textContent = `Voice profile could not be deleted: ${error.message}`;
  }
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
