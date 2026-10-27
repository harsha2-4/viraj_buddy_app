import { chooseRecordingType } from './audioConfig.js';

const DATABASE_NAME = 'viraj-buddy-voice-profile';
const STORE_NAME = 'profile';
const PROFILE_KEY = 'child';

function openDatabase(factory = globalThis.indexedDB) {
  if (!factory) throw new Error('Voice profile storage is unavailable in this browser.');
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Voice profile storage could not be opened.'));
  });
}

async function useStore(operation, factory) {
  const database = await openDatabase(factory);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      let result;
      const request = operation(transaction.objectStore(STORE_NAME), value => { result = value; });
      request?.addEventListener('error', () => reject(request.error || new Error('Voice profile storage failed.')));
      transaction.onabort = () => reject(transaction.error || new Error('Voice profile storage failed.'));
      transaction.onerror = () => reject(transaction.error || new Error('Voice profile storage failed.'));
      transaction.oncomplete = () => resolve(result === undefined ? request?.result : result);
    });
  } finally {
    database.close();
  }
}

export function analyzeVoiceFrames(frames, sampleRate) {
  if (!Array.isArray(frames) || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new TypeError('Voice sample data is invalid.');
  }
  const pitches = [];
  let totalRms = 0;
  for (const frame of frames) {
    if (!(frame instanceof Float32Array) || frame.length < 64) continue;
    let energy = 0;
    for (const sample of frame) energy += sample * sample;
    const rms = Math.sqrt(energy / frame.length);
    if (rms < 0.008) continue;
    const decimation = Math.max(1, Math.floor(sampleRate / 8000));
    const signal = new Float32Array(Math.floor(frame.length / decimation));
    let signalEnergy = 0;
    for (let index = 0; index < signal.length; index++) {
      signal[index] = frame[index * decimation];
      signalEnergy += signal[index] * signal[index];
    }
    const analysisRate = sampleRate / decimation;
    const minLag = Math.floor(analysisRate / 350);
    const maxLag = Math.min(Math.floor(analysisRate / 70), Math.floor(signal.length / 2));
    let bestLag = 0;
    let bestCorrelation = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let correlation = 0;
      for (let index = 0; index < signal.length - lag; index++) correlation += signal[index] * signal[index + lag];
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }
    if (bestLag && bestCorrelation / signalEnergy >= 0.45) {
      pitches.push(analysisRate / bestLag);
      totalRms += rms;
    }
  }
  if (pitches.length < 3) throw new Error('I could not hear a clear voice sample. Try again somewhere quiet.');
  pitches.sort((left, right) => left - right);
  const medianPitch = pitches[Math.floor(pitches.length / 2)];
  const averageRms = totalRms / pitches.length;
  return {
    pitchBand: medianPitch < 170 ? 'lower' : medianPitch < 260 ? 'middle' : 'higher',
    energy: averageRms < 0.025 ? 'soft' : averageRms < 0.09 ? 'steady' : 'strong',
    profiledAt: new Date().toISOString()
  };
}

export async function saveVoiceProfile(profile, sample, factory = globalThis.indexedDB, profileId = 'child') {
  if (!(sample instanceof Blob) || sample.size === 0) throw new TypeError('A voice sample is required.');
  if (!profile || !['lower', 'middle', 'higher'].includes(profile.pitchBand) ||
      !['soft', 'steady', 'strong'].includes(profile.energy) || typeof profile.profiledAt !== 'string') {
    throw new TypeError('Voice profile data is invalid.');
  }
  if (typeof profileId !== 'string' || !profileId) throw new TypeError('A user profile is required to save voice settings.');
  await useStore(store => store.put({ profile }, profileId === 'child' ? PROFILE_KEY : profileId), factory);
}

export async function getVoiceProfile(factory = globalThis.indexedDB, profileId = 'child') {
  if (typeof profileId !== 'string' || !profileId) throw new TypeError('A user profile is required to read voice settings.');
  const record = (await useStore(store => store.get(profileId === 'child' ? PROFILE_KEY : profileId), factory)) || null;
  if (!record) return null;
  if (!record.profile ||
      !['lower', 'middle', 'higher'].includes(record.profile.pitchBand) ||
      !['soft', 'steady', 'strong'].includes(record.profile.energy) ||
      typeof record.profile.profiledAt !== 'string') {
    throw new Error('Saved voice profile data is invalid. Delete it and ask a grown-up to record a new profile.');
  }
  return record;
}

export async function clearVoiceProfile(factory = globalThis.indexedDB, profileId = 'child') {
  if (typeof profileId !== 'string' || !profileId) throw new TypeError('A user profile is required to delete voice settings.');
  await useStore(store => store.delete(profileId === 'child' ? PROFILE_KEY : profileId), factory);
}

export async function migrateLegacyVoiceProfile(profileId, factory = globalThis.indexedDB) {
  if (typeof profileId !== 'string' || !profileId || profileId === 'child') throw new TypeError('A new user profile is required to restore voice settings.');
  return useStore((store, setResult) => {
    const legacy = store.get(PROFILE_KEY);
    legacy.addEventListener('success', () => {
      if (!legacy.result?.profile) {
        setResult(false);
        return;
      }
      const destination = store.get(profileId);
      destination.addEventListener('success', () => {
        if (destination.result) {
          setResult(false);
          return;
        }
        store.put({ profile: legacy.result.profile }, profileId);
        store.delete(PROFILE_KEY);
        setResult(true);
      });
    });
    return legacy;
  }, factory);
}

export async function hasLegacyVoiceProfile(factory = globalThis.indexedDB) {
  return Boolean(await getVoiceProfile(factory, 'child'));
}

export async function recordVoiceProfile({
  durationMs = 9000,
  mediaDevices = globalThis.navigator?.mediaDevices,
  MediaRecorderImpl = globalThis.MediaRecorder,
  AudioContextImpl = globalThis.AudioContext || globalThis.webkitAudioContext,
  signal
} = {}) {
  if (!mediaDevices?.getUserMedia || !MediaRecorderImpl || !AudioContextImpl) {
    throw new Error('Voice profiling needs a supported browser using HTTPS or localhost.');
  }
  const stream = await mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  let context;
  let recorder;
  let timer;
  let sampleTimer;
  let recorderStopped;
  let cancelRecording;
  try {
    if (signal?.aborted) throw new Error('Voice profile recording was canceled.');
    context = new AudioContextImpl();
    await context.resume();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    context.createMediaStreamSource(stream).connect(analyser);
    const frame = new Float32Array(analyser.fftSize);
    const frames = [];
    const chunks = [];
    const mediaType = chooseRecordingType(MediaRecorderImpl);
    recorder = mediaType ? new MediaRecorderImpl(stream, { mimeType: mediaType }) : new MediaRecorderImpl(stream);
    recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
    recorderStopped = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = () => reject(new Error('The voice sample could not be recorded.'));
    });
    recorderStopped.catch(() => {});
    recorder.start(250);
    sampleTimer = setInterval(() => {
      analyser.getFloatTimeDomainData(frame);
      frames.push(new Float32Array(frame));
    }, 50);
    try {
      await new Promise((resolve, reject) => {
        timer = setTimeout(resolve, durationMs);
        if (signal) {
          cancelRecording = () => reject(new Error('Voice profile recording was canceled.'));
          if (signal.aborted) cancelRecording();
          else signal.addEventListener('abort', cancelRecording, { once: true });
        }
      });
    } finally {
      clearInterval(sampleTimer);
      if (cancelRecording) signal.removeEventListener('abort', cancelRecording);
    }
    recorder.stop();
    await recorderStopped;
    const sample = new Blob(chunks, { type: recorder.mimeType || mediaType || 'audio/webm' });
    if (!sample.size) throw new Error('The voice sample was empty. Please try again.');
    return { profile: analyzeVoiceFrames(frames, context.sampleRate), sample };
  } finally {
    clearTimeout(timer);
    clearInterval(sampleTimer);
    if (recorder?.state !== 'inactive') recorder?.stop();
    stream.getTracks().forEach(track => track.stop());
    if (context) await context.close();
  }
}
