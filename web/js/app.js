import { CONFIG } from './config.js';
import { audioConfig } from './audioConfig.js';
import { WakeLockController, wakeLockStatusMessage } from './wakeLock.js';
import { AvatarController } from './animations.js';
import { getChatGptDestination } from './navigation.js';
import { VoiceSession } from './voice.js';
import { SceneController } from './scenes.js';
import { addConversationMessage, clearConversations, endConversation, hasLegacyHistory, listConversations, migrateLegacyHistory, startConversation } from './history.js';
import { createProfile, findProfile, listProfiles, removeProfile, validateProfileName } from './profiles.js';
import { recordingFailureMessage, showExperienceScreen } from './onboarding.js';
import { clearVoiceProfile, getVoiceProfile, hasLegacyVoiceProfile, migrateLegacyVoiceProfile, recordVoiceProfile, saveVoiceProfile } from './voiceProfile.js';

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
let activeProfile;
let profileAbortController;
let pendingEnrollment;
let duplicateProfile;
let restoreTargetProfile;
let legacyDataAvailable = false;
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
    if (!activeConversationId || !activeProfile) return;
    try {
      addConversationMessage(activeConversationId, role, text, undefined, undefined, activeProfile.id);
      byId('history-status').textContent = 'Conversation history is saved on this device.';
      showHistoryWarning();
    } catch (error) {
      byId('history-status').textContent = `History could not be saved: ${error.message}`;
      showHistoryWarning(`Conversation history could not be saved: ${error.message}`);
    }
  },
  onSessionEnd() {
    if (!activeConversationId || !activeProfile) return;
    try {
      endConversation(activeConversationId, undefined, undefined, activeProfile.id);
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
byId('settings-title').textContent = CONFIG.appName;
photoButton.hidden = !CONFIG.enableCameraButton;
avatar.setState('welcome');

const screens = {
  welcome: byId('welcome-screen'),
  newUser: byId('new-user-screen'),
  existingUser: byId('existing-user-screen'),
  session: byId('session-screen')
};

function showScreen(name) {
  showExperienceScreen(name, screens);
}

function refreshUserSuggestions() {
  const suggestions = byId('saved-users');
  if (!suggestions) return;
  try {
    suggestions.replaceChildren(...listProfiles().map(profile => {
      const option = document.createElement('option');
      option.value = profile.name;
      return option;
    }));
  } catch (error) {
    byId('welcome-status').textContent = `Saved profiles could not be read: ${error.message}`;
  }
}

function showSettings() {
  const configured = Boolean(getChatGptDestination(CONFIG.chatgptUrl));
  byId('destination-status').textContent = configured ? 'Configured' : 'Not Configured';
  byId('setup-help').hidden = configured;
  byId('settings-user-name').textContent = activeProfile?.name || 'your selected user';
  renderHistory();
  renderVoiceProfile();
  byId('voice-profile-heading').parentElement.hidden = !activeProfile;
  byId('history-heading').parentElement.hidden = !activeProfile;
  if (!dialog.open) dialog.showModal();
}

async function renderVoiceProfile() {
  const profile = activeProfile;
  if (!profile) {
    byId('voice-profile-status').textContent = 'Choose a user to view or update their voice profile.';
    byId('delete-voice-profile').hidden = true;
    return;
  }
  try {
    const record = await getVoiceProfile(undefined, profile.id);
    if (activeProfile?.id !== profile.id) return;
    byId('voice-profile-status').textContent = record
      ? `Saved on this device for ${profile.name}. Rough profile: ${record.profile.energy} voice level, ${record.profile.pitchBand} pitch.`
      : `No voice profile is saved for ${profile.name}. A grown-up can record one here.`;
    byId('delete-voice-profile').hidden = !record;
  } catch (error) {
    if (activeProfile?.id !== profile.id) return;
    byId('voice-profile-status').textContent = `Voice profile could not be read: ${error.message}`;
    byId('delete-voice-profile').hidden = false;
  }
}

function renderHistory() {
  const list = byId('history-list');
  list.replaceChildren();
  if (!activeProfile) {
    byId('history-status').textContent = 'Choose a user to view their history.';
    return;
  }
  try {
    const conversations = listConversations(undefined, activeProfile.id);
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
        line.textContent = `${message.role === 'user' ? activeProfile.name : 'Buddy'}: ${message.text}`;
        details.append(line);
      }
      list.append(details);
    }
  } catch (error) {
    byId('history-status').textContent = `Conversation history could not be read: ${error.message}`;
  }
}

function activateProfile(profile) {
  if (active) voice.stop();
  activeProfile = profile;
  duplicateProfile = null;
  byId('switch-user-button').hidden = false;
  byId('scene').hidden = false;
  byId('greeting').firstChild.textContent = `Hi ${profile.name}! `;
  byId('buddy-state').textContent = 'Your AI adventure buddy';
  avatar.setState('idle');
  byId('status').textContent = 'What should we talk about today?';
  showScreen('session');
  renderHistory();
  renderVoiceProfile();
  byId('settings-user-name').textContent = profile.name;
  refreshUserSuggestions();
}

function returnToWelcome() {
  if (active) voice.stop();
  activeProfile = null;
  activeConversationId = undefined;
  restoreTargetProfile = null;
  byId('open-existing-user').hidden = true;
  byId('restore-legacy-user').hidden = true;
  byId('switch-user-button').hidden = true;
  byId('scene').hidden = true;
  byId('transcript').hidden = true;
  byId('history-warning').hidden = true;
  byId('buddy-state').textContent = 'Your AI adventure buddy';
  avatar.setState('welcome');
  showScreen('welcome');
  refreshUserSuggestions();
}

async function findLegacyData() {
  try {
    const [voiceProfile, history] = await Promise.all([hasLegacyVoiceProfile(), Promise.resolve(hasLegacyHistory())]);
    legacyDataAvailable = voiceProfile || history;
    return legacyDataAvailable;
  } catch (error) {
    legacyDataAvailable = false;
    throw new Error(`Previous on-device data could not be checked: ${error.message}`);
  }
}

function resetLauncher() {
  clearTimeout(navigationTimer);
  opening = false;
  talkButton.disabled = false;
  photoButton.disabled = false;
  if (!active) {
    avatar.setState(activeProfile ? 'idle' : 'welcome');
    status.textContent = activeProfile ? 'What should we talk about today?' : '';
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
  if (!activeProfile || active) return;
  talkButton.disabled = true;
  try {
    const profileRecord = await getVoiceProfile(undefined, activeProfile.id);
    if (!profileRecord) {
      status.textContent = 'A grown-up needs to record a voice profile in Parents settings before starting.';
      showSettings();
      byId('voice-profile-status').textContent = `Please ask a grown-up to review the notice and record a short sample for ${activeProfile.name}.`;
      talkButton.disabled = false;
      return;
    }
    voiceErrorVisible = false;
    activeConversationId = startConversation(undefined, new Date(), crypto.randomUUID(), activeProfile.id);
    const history = (conversationMemoryEnabled ? listConversations(undefined, activeProfile.id).reverse().flatMap(conversation => conversation.messages) : [])
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
  if (!activeProfile) return;
  if (!window.confirm('Clear all conversation history saved on this device? This cannot be undone.')) return;
  try {
    clearConversations(undefined, activeProfile.id);
    renderHistory();
  } catch (error) {
    byId('history-status').textContent = `Conversation history could not be cleared: ${error.message}`;
  }
});
byId('create-voice-profile').addEventListener('click', async () => {
  const button = byId('create-voice-profile');
  if (!activeProfile || profileAbortController) return;
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
  byId('voice-profile-status').textContent = `Recording now for ${activeProfile.name}. Please read the three prompts one at a time.`;
  try {
    const { profile, sample } = await recordVoiceProfile({ signal: controller.signal });
    if (controller.signal.aborted) throw new Error('Voice profile recording was canceled.');
    await saveVoiceProfile(profile, sample, undefined, activeProfile.id);
    byId('voice-profile-status').textContent = `Voice settings saved for ${activeProfile.name}. The raw sample was discarded after on-device analysis.`;
    await renderVoiceProfile();
  } catch (error) {
    byId('voice-profile-status').textContent = controller.signal.aborted
      ? 'Voice recording was canceled. No new sample was saved.'
      : `Voice profile needs to be retried: ${recordingFailureMessage(error)}`;
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
  if (!activeProfile) return;
  if (!window.confirm('Delete the saved child voice sample and profile from this device?')) return;
  try {
    profileAbortController?.abort();
    if (active) voice.stop();
    await clearVoiceProfile(undefined, activeProfile.id);
    await renderVoiceProfile();
    status.textContent = `The voice settings for ${activeProfile.name} were deleted from this device.`;
  } catch (error) {
    byId('voice-profile-status').textContent = `Voice profile could not be deleted: ${error.message}`;
  }
});

byId('new-user-button').addEventListener('click', () => {
  pendingEnrollment = null;
  duplicateProfile = null;
  byId('new-user-form').reset();
  byId('save-new-user').disabled = true;
  byId('open-duplicate-user').hidden = true;
  byId('new-user-status').textContent = 'Your sample is analyzed on this device and discarded. Its rough pitch and voice-level settings stay here; they do not identify or authenticate anyone.';
  showScreen('newUser');
});
byId('existing-user-button').addEventListener('click', () => {
  restoreTargetProfile = null;
  refreshUserSuggestions();
  byId('existing-user-form').reset();
  byId('existing-user-status').textContent = '';
  byId('open-existing-user').hidden = true;
  byId('restore-legacy-user').hidden = true;
  showScreen('existingUser');
});
for (const button of document.querySelectorAll('.back-to-welcome')) {
  button.addEventListener('click', returnToWelcome);
}
byId('switch-user-button').addEventListener('click', returnToWelcome);

byId('record-new-user').addEventListener('click', async () => {
  if (profileAbortController) return;
  let name;
  try {
    name = validateProfileName(byId('new-user-name').value);
    const duplicate = findProfile(name);
    if (duplicate) {
      duplicateProfile = duplicate;
      byId('new-user-status').textContent = `${duplicate.name} already has a profile. No profile or recording was changed.`;
      byId('open-duplicate-user').hidden = false;
      return;
    }
  } catch (error) {
    byId('new-user-status').textContent = error.message;
    byId('new-user-name').focus();
    return;
  }
  if (!byId('new-user-consent').checked) {
    byId('new-user-status').textContent = 'A parent or guardian must review the notice and agree before recording.';
    byId('new-user-consent').focus();
    return;
  }
  const controller = new AbortController();
  profileAbortController = controller;
  const recordButton = byId('record-new-user');
  const cancelButton = byId('cancel-new-user-recording');
  recordButton.disabled = true;
  byId('save-new-user').disabled = true;
  cancelButton.hidden = false;
  byId('new-user-status').textContent = `Recording for ${name}. Please say: “I love exploring and learning new things with AI Buddy!”`;
  try {
    pendingEnrollment = await recordVoiceProfile({ signal: controller.signal });
    if (controller.signal.aborted) throw new Error('Voice profile recording was canceled.');
    byId('new-user-status').textContent = 'Recording complete. Your sample was analyzed on this device and discarded. Save your profile or record again.';
    byId('save-new-user').disabled = false;
  } catch (error) {
    pendingEnrollment = null;
    byId('new-user-status').textContent = controller.signal.aborted
      ? 'Recording canceled. Your name is still here; you can try again.'
      : `Recording needs to be retried: ${recordingFailureMessage(error)}`;
  } finally {
    profileAbortController = null;
    cancelButton.hidden = true;
    recordButton.disabled = false;
  }
});
byId('cancel-new-user-recording').addEventListener('click', () => profileAbortController?.abort());
byId('new-user-consent').addEventListener('change', event => {
  if (!event.currentTarget.checked) profileAbortController?.abort();
});

byId('new-user-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (profileAbortController) return;
  let profile;
  try {
    const name = validateProfileName(byId('new-user-name').value);
    const duplicate = findProfile(name);
    if (duplicate) {
      duplicateProfile = duplicate;
      byId('new-user-status').textContent = `${duplicate.name} already has a profile. The existing profile and history were left unchanged.`;
      byId('open-duplicate-user').hidden = false;
      return;
    }
    if (!pendingEnrollment) {
      byId('new-user-status').textContent = 'Record a voice sample before saving your profile.';
      byId('record-new-user').focus();
      return;
    }
    profile = createProfile(name);
    await saveVoiceProfile(pendingEnrollment.profile, pendingEnrollment.sample, undefined, profile.id);
  } catch (error) {
    if (error.code === 'PROFILE_EXISTS') {
      duplicateProfile = error.profile;
      byId('new-user-status').textContent = `${error.profile.name} already has a profile. The existing profile and history were left unchanged.`;
      byId('open-duplicate-user').hidden = false;
      return;
    }
    if (profile) removeProfile(profile.id);
    byId('new-user-status').textContent = `Profile could not be saved: ${error.message}`;
    return;
  }
  pendingEnrollment = null;
  byId('new-user-consent').checked = false;
  activateProfile(profile);
});
byId('open-duplicate-user').addEventListener('click', () => {
  if (duplicateProfile) activateProfile(duplicateProfile);
});

byId('existing-user-form').addEventListener('submit', async event => {
  event.preventDefault();
  restoreTargetProfile = null;
  byId('open-existing-user').hidden = true;
  byId('restore-legacy-user').hidden = true;
  try {
    const name = validateProfileName(byId('existing-user-name').value);
    const profile = findProfile(name);
    if (profile) {
      if (await findLegacyData()) {
        restoreTargetProfile = profile;
        byId('existing-user-status').textContent = `Older data is still unassigned. You can open ${profile.name}'s saved profile without assigning it, or restore the older data to this profile.`;
        byId('open-existing-user').textContent = `Open ${profile.name}'s saved profile`;
        byId('open-existing-user').hidden = false;
        byId('restore-legacy-user').textContent = `Restore previous data to ${profile.name}`;
        byId('restore-legacy-user').hidden = false;
        return;
      }
      activateProfile(profile);
      return;
    }
    await findLegacyData();
    byId('existing-user-status').textContent = legacyDataAvailable
      ? `No profile named ${name} was found. Older saved data is available, but has not been assigned to anyone.`
      : `No profile named ${name} was found. Check the spelling or create a new profile.`;
    byId('open-existing-user').hidden = true;
    byId('restore-legacy-user').hidden = !legacyDataAvailable;
    byId('restore-legacy-user').textContent = `Restore previous on-device data for ${name}`;
  } catch (error) {
    byId('existing-user-status').textContent = error.message;
    byId('existing-user-name').focus();
  }
});

byId('open-existing-user').addEventListener('click', () => {
  if (!restoreTargetProfile) return;
  const profile = restoreTargetProfile;
  restoreTargetProfile = null;
  activateProfile(profile);
});

byId('restore-legacy-user').addEventListener('click', async () => {
  let profile;
  try {
    const name = validateProfileName(byId('existing-user-name').value);
    if (!legacyDataAvailable) await findLegacyData();
    if (!legacyDataAvailable) throw new Error('No previous on-device data is available to restore.');
    profile = restoreTargetProfile || findProfile(name);
    if (!profile) profile = createProfile(name);
    const voiceProfile = await migrateLegacyVoiceProfile(profile.id);
    const history = migrateLegacyHistory(profile.id);
    await findLegacyData();
    restoreTargetProfile = null;
    activateProfile(profile);
    const savedVoiceProfile = await getVoiceProfile(undefined, profile.id);
    byId('status').textContent = `Previous on-device data was restored for ${profile.name}${history.conversations ? `, including ${history.conversations} conversation${history.conversations === 1 ? '' : 's'}` : ''}.`;
    if (!savedVoiceProfile) byId('voice-profile-status').textContent = `No voice settings were found for ${profile.name}. A grown-up can record new settings in Parents.`;
    if (legacyDataAvailable && (voiceProfile || history.migrated)) {
      byId('existing-user-status').textContent = 'Some older data remains unassigned because this profile already had saved data. You can keep it unassigned or restore it to a different profile.';
    }
  } catch (error) {
    byId('existing-user-status').textContent = `${profile ? `A profile for ${profile.name} was created, but ` : ''}previous data could not be fully restored: ${error.message}. Reopen the profile or ask a grown-up for help.`;
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
