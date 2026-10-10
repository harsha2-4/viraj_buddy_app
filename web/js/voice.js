import { audioConfig, buildMicrophoneConstraints } from './audioConfig.js';

export class VoiceSession {
  constructor({ onState, onTranscript, onMessage, onSessionEnd, onError, onActive, onAudioBlocked }) {
    Object.assign(this, { onState, onTranscript, onMessage, onSessionEnd, onError, onActive, onAudioBlocked });
    this.audio = document.createElement('audio');
    this.audio.autoplay = true;
    this.audio.setAttribute('playsinline', '');
    document.body.append(this.audio);
    this.generation = 0;
    this.responseInFlight = false;
    this.outputActive = false;
  }

  logDebug(...args) {
    if (audioConfig.debug.enabled && typeof console !== 'undefined') {
      console.info('[Buddy audio]', ...args);
    }
  }

  async start() {
    this.stop(true);
    const generation = this.generation;
    const current = () => generation === this.generation;
    this.onActive(true);
    this.onState('connecting');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('Voice needs a supported browser using HTTPS or localhost.');
      const stream = await navigator.mediaDevices.getUserMedia(buildMicrophoneConstraints(audioConfig.microphone));
      if (!current()) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      this.logDebug('Microphone acquired', stream.getAudioTracks().map(track => ({ enabled: track.enabled, readyState: track.readyState, constraints: track.getSettings() })));
      const pc = this.pc = new RTCPeerConnection();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      pc.ontrack = event => {
        if (!current()) return;
        this.audio.srcObject = event.streams[0] || new MediaStream([event.track]);
        this.audio.play().catch(() => { if (current()) this.onAudioBlocked(true); });
      };
      pc.onconnectionstatechange = () => {
        if (current() && ['failed', 'disconnected'].includes(pc.connectionState)) this.fail('Voice disconnected. Tap Talk to Buddy to reconnect.');
      };
      const channel = this.channel = pc.createDataChannel('oai-events');
      channel.onopen = () => {
        if (!current()) return;
        clearTimeout(this.connectTimer);
        this.onState('listening');
        this.logDebug('Realtime channel opened', { noiseReduction: audioConfig.noiseReduction, vad: audioConfig.vad });
        if (this.historyContext) {
          this.send({ type: 'conversation.item.create', item: {
            type: 'message', role: 'user',
            content: [{ type: 'input_text', text: this.historyContext }]
          } });
        }
        this.send({
          type: 'response.create',
          response: {
            instructions: 'Introduce yourself as Sillyface. Start this session with a fresh, playful topic that is different from the recent topic in the earlier conversation context when possible. Mix a fun idea with one simple fact or thinking game. Keep it short, ask Viraj one easy question, and wait for his answer. Do not ask whether he wants to continue.'
          }
        });
      };
      channel.onmessage = event => {
        if (!current()) return;
        try { this.handle(JSON.parse(event.data)); } catch { /* Ignore malformed control events. */ }
      };
      channel.onclose = () => { if (current()) this.fail('The voice session ended. You can start again.'); };
      channel.onerror = () => { if (current()) this.fail('Voice connection failed. Please try again.'); };
      this.connectTimer = setTimeout(() => { if (current()) this.fail('Voice took too long to connect. Please try again.'); }, 35000);
      this.controller = new AbortController();
      const offer = await pc.createOffer();
      if (!current()) return;
      await pc.setLocalDescription(offer);
      const response = await fetch('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp, signal: this.controller.signal
      });
      if (!current()) return;
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Voice server unavailable. Ask a grown-up to check setup.');
      }
      const sdp = await response.text();
      if (current()) await pc.setRemoteDescription({ type: 'answer', sdp });
      if (current()) this.limitTimer = setTimeout(() => this.fail('Time for a little break! Start again with a grown-up when ready.'), 10 * 60 * 1000);
    } catch (error) {
      if (current()) this.fail(error.name === 'NotAllowedError' ? 'Microphone access was not allowed. A grown-up can enable it and try again.' : error.message);
    }
  }

  send(event) { if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify(event)); }

  handle(event) {
    switch (event.type) {
      case 'conversation.item.input_audio_transcription.completed':
      case 'input_audio_transcription.completed':
        {
          const transcript = `${event.transcript || ''}`.trim();
          if (!transcript) break;
          this.logDebug('User transcript received', transcript);
          this.onMessage?.('user', transcript);
          break;
        }
      case 'input_audio_buffer.speech_started':
        this.responseInFlight = false;
        this.onState('listening');
        this.logDebug('Speech started');
        break;
      case 'input_audio_buffer.speech_stopped':
        this.onState('thinking');
        this.logDebug('Speech stopped');
        break;
      case 'response.created':
        this.responseInFlight = true;
        this.transcript = '';
        this.onState('thinking');
        this.logDebug('Response created');
        break;
      case 'output_audio_buffer.started':
        this.outputActive = true;
        this.onState('talking');
        this.logDebug('Output audio started');
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        this.outputActive = false;
        this.onState('listening');
        this.logDebug('Output audio stopped');
        break;
      case 'response.output_audio_transcript.delta':
        this.transcript = (this.transcript || '') + event.delta;
        this.onTranscript(this.transcript); break;
      case 'response.output_audio_transcript.done':
        {
          const transcript = `${event.transcript || this.transcript || ''}`.trim();
          this.onTranscript(transcript);
          if (transcript) this.onMessage?.('assistant', transcript);
          break;
        }
      case 'response.done':
        this.responseInFlight = false;
        if (['failed', 'cancelled', 'incomplete'].includes(event.response?.status)) this.onState('listening');
        if (event.response?.status === 'failed') this.fail('Buddy could not answer. Please reconnect and try again.');
        this.logDebug('Response finished', event.response?.status);
        break;
      case 'error':
        this.logDebug('Realtime error', event);
        this.fail('There was a voice error. Please reconnect and try again.');
        break;
    }
  }

  mute(value) { this.stream?.getAudioTracks().forEach(track => { track.enabled = !value; }); }
  async enableAudio() {
    try { await this.audio.play(); this.onAudioBlocked(false); }
    catch { this.onError('Sound is blocked. Check the browser sound settings.'); }
  }
  fail(message) { this.stop(); this.onError(message); }
  stop(preserveConversation = false) {
    this.generation++;
    clearTimeout(this.connectTimer);
    clearTimeout(this.limitTimer);
    this.controller?.abort();
    this.channel?.close();
    this.pc?.close();
    this.stream?.getTracks().forEach(track => track.stop());
    this.audio.pause();
    this.audio.srcObject = null;
    this.channel = this.pc = this.stream = null;
    this.responseInFlight = false;
    this.outputActive = false;
    this.onAudioBlocked(false);
    this.onActive(false);
    this.onState('idle');
    if (!preserveConversation) this.onSessionEnd?.();
  }
}
