import { audioConfig, chooseRecordingType, splitConversationalSpeech } from './audioConfig.js';

export class VoiceSession {
  constructor({ onState, onTranscript, onMessage, onSessionEnd, onError, onActive, onAudioBlocked }) {
    Object.assign(this, { onState, onTranscript, onMessage, onSessionEnd, onError, onActive, onAudioBlocked });
    this.audio = document.createElement('audio');
    this.audio.setAttribute('playsinline', '');
    document.body.append(this.audio);
    this.generation = 0;
    this.turns = new Set();
  }

  async start({ history = [], initialTurnId = '' } = {}) {
    this.stop(true);
    const generation = this.generation;
    const current = () => generation === this.generation;
    this.sessionCurrent = current;
    this.history = history.slice(-12);
    this.onActive(true);
    this.onState('connecting');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Voice needs a supported browser using HTTPS or localhost.');
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: this.microphoneConstraints() });
      if (!current()) { this.stopTracks(); return; }
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      await this.context.resume();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 512;
      this.context.createMediaStreamSource(this.stream).connect(this.analyser);
      this.samples = new Uint8Array(this.analyser.fftSize);
      this.createRecorder(current);
      this.onState('listening');
      this.listenTimer = setInterval(() => this.detectSpeech(current), 100);
      this.visibilityHandler = () => {
        if (!current()) return;
        if (document.hidden) {
          this.stream?.getAudioTracks().forEach(track => { track.enabled = false; });
          if (this.capturing) {
            this.capturing = false;
            this.chunks = [];
            this.finalizePending = false;
            if (this.recorder?.state === 'recording') this.recorder.stop();
          }
        } else {
          this.context?.resume().catch(() => {});
          if (!this.busy && !this.outputActive) this.stream?.getAudioTracks().forEach(track => { track.enabled = true; });
          if (this.recorder?.state === 'inactive' && !this.busy && !this.outputActive) this.createRecorder(current);
          if (!this.busy && !this.outputActive) this.onState('listening');
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
      if (initialTurnId) {
        this.busy = true;
        this.stream.getAudioTracks().forEach(track => { track.enabled = false; });
        this.reply('', initialTurnId, true, current).catch(error => this.recover(error, current));
      }
    } catch (error) {
      if (current()) this.fail(error.name === 'NotAllowedError' ? 'Microphone access was not allowed. A grown-up can enable it and try again.' : error.message);
    }
  }

  microphoneConstraints() {
    const supported = navigator.mediaDevices.getSupportedConstraints?.() || {};
    const audio = {};
    for (const [name, value] of Object.entries(audioConfig.microphone)) if (!Object.keys(supported).length || supported[name]) audio[name] = value;
    return audio;
  }

  createRecorder(current) {
    if (!current()) return;
    this.preRoll = [];
    const type = chooseRecordingType(window.MediaRecorder);
    this.recorder = type ? new MediaRecorder(this.stream, { mimeType: type }) : new MediaRecorder(this.stream);
    this.recorder.ondataavailable = event => {
      if (!event.data?.size) return;
      if (this.capturing) this.chunks.push(event.data);
      else {
        this.preRoll.push(event.data);
        if (this.preRoll.length > 6) this.preRoll.splice(1, 1);
      }
    };
    this.recorder.onstop = () => {
      if (!current()) return;
      if (this.finalizePending) {
        this.finalizePending = false;
        const chunks = this.chunks;
        const duration = Date.now() - this.speechStartedAt;
        this.chunks = [];
        this.capturing = false;
        this.createRecorder(current);
        if (duration >= audioConfig.minSpeechMs && chunks.some(chunk => chunk.size)) {
          this.busy = true;
          this.stream?.getAudioTracks().forEach(track => { track.enabled = false; });
          this.process(new Blob(chunks, { type: this.recordingMime }), duration, current).catch(error => this.recover(error, current));
        }
        else this.onState('listening');
      }
    };
    this.recorder.start(200);
  }

  detectSpeech(current) {
    if (!current() || !this.analyser || this.outputActive || this.finalizePending || this.busy) return;
    this.analyser.getByteTimeDomainData(this.samples);
    let sum = 0;
    for (const value of this.samples) { const sample = (value - 128) / 128; sum += sample * sample; }
    const rms = Math.sqrt(sum / this.samples.length);
    if (!this.capturing) {
      this.noiseFloor = this.noiseFloor === undefined ? Math.min(rms, audioConfig.vad.absoluteThreshold / 3) : this.noiseFloor * 0.97 + Math.min(rms, audioConfig.vad.absoluteThreshold * 2) * 0.03;
      const threshold = Math.max(audioConfig.vad.absoluteThreshold, this.noiseFloor * audioConfig.vad.noiseMultiplier);
      if (rms >= threshold) this.speechFrames = (this.speechFrames || 0) + 1;
      else this.speechFrames = 0;
      if (this.speechFrames >= audioConfig.vad.startFrames) this.beginCapture(current);
      return;
    }
    if (rms >= Math.max(audioConfig.vad.absoluteThreshold * 0.7, this.noiseFloor * 1.7)) this.lastSpeechAt = Date.now();
    if (Date.now() - this.speechStartedAt >= audioConfig.vad.maxUtteranceMs || Date.now() - this.lastSpeechAt >= audioConfig.vad.endSilenceMs) this.finishCapture(current);
  }

  beginCapture(current) {
    if (this.capturing || this.outputActive) return;
    this.speechFrames = 0;
    this.capturing = true;
    this.lastSpeechAt = Date.now();
    this.speechStartedAt = Date.now();
    this.chunks = [...this.preRoll];
    this.preRoll = [];
    this.recordingMime = this.recorder.mimeType || 'audio/webm';
    this.onState('listening');
    this.logDebug('Speech detected');
    if (this.recorder.state === 'recording') this.recorder.requestData();
    this.maxTimer = setTimeout(() => { if (current()) this.finishCapture(current); }, audioConfig.vad.maxUtteranceMs);
  }

  finishCapture(current) {
    if (!this.capturing || this.finalizePending) return;
    clearTimeout(this.maxTimer);
    this.finalizePending = true;
    this.onState('thinking');
    if (this.recorder?.state === 'recording') this.recorder.stop();
  }

  async process(blob, durationMs, current) {
    if (!current() || !blob.size || this.outputActive) return;
    const turnId = crypto.randomUUID();
    if (this.turns.has(turnId)) return;
    this.turns.add(turnId);
    this.onState('transcribing');
    const form = new FormData();
    const type = blob.type || this.recordingMime;
    const extension = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm';
    form.append('audio', blob, `utterance.${extension}`);
    const transcriptResult = await this.request('/api/voice/transcribe', { method: 'POST', headers: { 'X-Turn-Id': turnId, 'X-Audio-Seconds': String(durationMs / 1000) }, body: form });
    if (!current()) return;
    const transcript = String(transcriptResult.transcript || '').trim();
    if (!transcript) throw new Error('I didn’t quite hear that. Try once more.');
    this.onTranscript(transcript);
    this.onMessage?.('user', transcript);
    this.history.push({ role: 'user', content: transcript });
    this.history = this.history.slice(-12);
    await this.reply(transcript, turnId, false, current);
  }

  async reply(transcript, turnId, opening, current) {
    this.onState('generating');
    const result = await this.request('/api/voice/reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turnId, transcript, opening, history: this.history }) });
    if (!current()) return;
    const reply = String(result.reply || '').trim();
    if (!reply) throw new Error('Buddy could not form a reply. Please try again.');
    this.onTranscript(reply);
    this.onMessage?.('assistant', reply);
    this.history.push({ role: 'assistant', content: reply });
    this.history = this.history.slice(-12);
    await this.speak(reply, turnId, current);
  }

  async speak(text, turnId, current, queuedChunks = null) {
    const chunks = queuedChunks || splitConversationalSpeech(text, 200);
    if (!chunks.length) { this.onState('listening'); return; }
    this.outputActive = true;
    if (this.stream) this.stream.getAudioTracks().forEach(track => { track.enabled = false; });
    try {
      for (let i = 0; i < chunks.length; i++) {
        if (!current()) return;
        this.onState('generatingSpeech');
        let wav;
        try {
          wav = await this.request('/api/voice/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: chunks[i], requestId: `${turnId}:${i}` }), binary: true });
        } catch (error) {
          this.logDebug('Groq speech unavailable; using device speech.', error.message);
          await this.speakLocally(chunks.slice(i), current);
          return;
        }
        if (!current()) return;
        const source = URL.createObjectURL(wav);
        try {
          this.audio.src = source;
          this.onState('talking');
          try { await this.audio.play(); }
          catch (error) {
            if (error.name === 'NotAllowedError') {
              this.pendingSpeech = { chunks: chunks.slice(i), turnId };
              this.onAudioBlocked(true);
            }
            throw error;
          }
          await new Promise((resolve, reject) => {
            this.audio.onended = resolve;
            this.audio.onerror = () => reject(new Error('Buddy’s voice could not play on this device.'));
          });
        } finally { URL.revokeObjectURL(source); }
        if (i < chunks.length - 1) await new Promise(resolve => setTimeout(resolve, 180));
      }
    } finally {
      this.outputActive = false;
      this.busy = false;
      this.stream?.getAudioTracks().forEach(track => { track.enabled = !document.hidden; });
      if (current()) {
        this.onState('listening');
        if (this.recorder?.state === 'inactive') this.createRecorder(current);
      }
    }
  }

  async speakLocally(chunks, current) {
    const speech = window.speechSynthesis;
    const Utterance = window.SpeechSynthesisUtterance;
    if (!speech || typeof Utterance !== 'function') {
      throw new Error('Buddy’s online speech is unavailable, and this browser cannot speak replies aloud.');
    }
    this.localSpeechSynthesis = speech;
    try {
      for (const chunk of chunks) {
        if (!current()) return;
        const utterance = new Utterance(chunk);
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        utterance.pitch = 1.12;
        const voice = this.conversationalVoice(speech.getVoices?.() || []);
        if (voice) utterance.voice = voice;
        this.onState('talking');
        await new Promise((resolve, reject) => {
          utterance.onend = resolve;
          utterance.onerror = event => reject(new Error(`Buddy’s device voice could not play${event.error ? ` (${event.error})` : ''}.`));
          speech.speak(utterance);
        });
        if (current()) await new Promise(resolve => setTimeout(resolve, 220));
      }
    } finally {
      if (this.localSpeechSynthesis === speech) this.localSpeechSynthesis = null;
    }
  }

  conversationalVoice(voices) {
    return voices
      .filter(voice => typeof voice.lang === 'string' && /^en(?:-|$)/iu.test(voice.lang))
      .sort((left, right) => {
        const score = voice =>
          (voice.lang.toLowerCase() === 'en-us' ? 4 : 0) +
          (voice.localService ? 1 : 0) +
          (/\b(?:natural|neural|enhanced|premium)\b/iu.test(voice.name) ? 4 : 0) +
          (/\bmark\b/iu.test(voice.name) ? 3 : /\bdavid\b/iu.test(voice.name) ? 2 : 0);
        return score(right) - score(left);
      })[0];
  }

  async request(url, options = {}) {
    const headers = { ...options.headers };
    const { binary, ...fetchOptions } = options;
    const response = await fetch(url, { ...fetchOptions, headers, signal: AbortSignal.timeout(35000) });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      const error = new Error(result.error || 'Voice service is unavailable. Please try again.');
      error.status = response.status;
      throw error;
    }
    return binary ? response.blob() : response.json();
  }

  recover(error, current) {
    if (!current()) return;
    this.busy = false;
    this.stream?.getAudioTracks().forEach(track => { track.enabled = true; });
    if (this.recorder?.state === 'inactive') this.createRecorder(current);
    this.onState('listening');
    this.onError(error.message || 'Voice had a little hiccup. Try speaking again.');
  }

  logDebug(...args) { if (audioConfig.debug.enabled) console.info('[Buddy audio]', ...args); }
  mute(value) { this.stream?.getAudioTracks().forEach(track => { track.enabled = !value; }); }
  async enableAudio() {
    try {
      if (this.pendingSpeech && this.sessionCurrent?.()) {
        const pending = this.pendingSpeech;
        this.pendingSpeech = null;
        await this.speak('', pending.turnId, this.sessionCurrent, pending.chunks);
      } else await this.audio.play();
      this.onAudioBlocked(false);
    } catch { this.onAudioBlocked(true); this.onError('Sound is blocked. Tap to hear Buddy again.'); }
  }
  stopTracks() { this.stream?.getTracks().forEach(track => track.stop()); }
  fail(message) { this.stop(); this.onError(message); }
  stop(preserveConversation = false) {
    this.generation++;
    clearInterval(this.listenTimer); clearTimeout(this.maxTimer);
    this.localSpeechSynthesis?.cancel();
    this.localSpeechSynthesis = null;
    if (this.visibilityHandler) document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.audio.pause(); this.audio.removeAttribute('src');
    this.recorder?.stream?.getTracks?.().forEach(track => track.stop());
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.stopTracks();
    this.context?.close().catch(() => {});
    this.stream = this.analyser = this.recorder = this.context = null;
    this.capturing = this.finalizePending = this.outputActive = this.busy = false;
    this.turns.clear();
    this.pendingSpeech = null;
    this.sessionCurrent = null;
    this.onAudioBlocked(false);
    this.onActive(false);
    this.onState('idle');
    if (!preserveConversation) this.onSessionEnd?.();
  }
}
