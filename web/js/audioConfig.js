export const audioConfig = {
  microphone: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000
  },
  noiseReduction: 'near_field',
  vad: {
    type: 'server_vad',
    threshold: 0.7,
    prefixPaddingMs: 300,
    silenceDurationMs: 1000,
    createResponse: true,
    interruptResponse: false
  },
  debug: {
    enabled: false
  }
};

export function buildMicrophoneConstraints(overrides = {}) {
  const defaults = { ...audioConfig.microphone, ...overrides };
  const media = typeof navigator !== 'undefined' && navigator.mediaDevices?.getSupportedConstraints ? navigator.mediaDevices.getSupportedConstraints() : {};
  const audio = {
    channelCount: 1,
    echoCancellation: Boolean(defaults.echoCancellation)
  };

  if (media.noiseSuppression !== undefined || defaults.noiseSuppression !== undefined) {
    audio.noiseSuppression = Boolean(defaults.noiseSuppression);
  }
  if (media.autoGainControl !== undefined || defaults.autoGainControl !== undefined) {
    audio.autoGainControl = Boolean(defaults.autoGainControl);
  }
  if (defaults.channelCount) {
    audio.channelCount = defaults.channelCount;
  }
  if (defaults.sampleRate) {
    audio.sampleRate = defaults.sampleRate;
  }

  return { audio };
}

export function buildRealtimeSessionConfig({
  instructions,
  model,
  voice,
  noiseReduction = audioConfig.noiseReduction,
  vad = audioConfig.vad
} = {}) {
  return {
    type: 'realtime',
    model,
    instructions,
    max_output_tokens: 400,
    audio: {
      input: {
        noise_reduction: { type: noiseReduction },
        transcription: { model: 'gpt-4o-mini-transcribe' },
        turn_detection: {
          type: 'server_vad',
          threshold: Number(vad.threshold ?? 0.7),
          prefix_padding_ms: Number(vad.prefixPaddingMs ?? 300),
          silence_duration_ms: Number(vad.silenceDurationMs ?? 1000),
          create_response: Boolean(vad.createResponse ?? true),
          interrupt_response: Boolean(vad.interruptResponse ?? false)
        }
      },
      output: { voice: voice || 'ash' }
    }
  };
}
