export const audioConfig = {
  microphone: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1
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
  const getSupportedConstraints = globalThis.navigator?.mediaDevices?.getSupportedConstraints;
  const supported = typeof getSupportedConstraints === 'function' ? getSupportedConstraints.call(globalThis.navigator.mediaDevices) : null;
  const audio = {};

  for (const name of ['echoCancellation', 'noiseSuppression', 'autoGainControl', 'channelCount']) {
    if (defaults[name] !== undefined && (!supported || supported[name] === true)) {
      audio[name] = defaults[name];
    }
  }
  return { audio };
}

function boundedNumber(value, fallback, minimum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(number, minimum) : fallback;
}

export function buildRealtimeSessionConfig({
  instructions,
  model,
  voice,
  noiseReduction = audioConfig.noiseReduction,
  vad = audioConfig.vad
} = {}) {
  if (!['near_field', 'far_field'].includes(noiseReduction)) {
    throw new RangeError('Realtime noise reduction must be near_field or far_field.');
  }

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
          threshold: Math.min(boundedNumber(vad.threshold, audioConfig.vad.threshold, 0.5), 0.8),
          prefix_padding_ms: boundedNumber(vad.prefixPaddingMs, audioConfig.vad.prefixPaddingMs, 300),
          silence_duration_ms: boundedNumber(vad.silenceDurationMs, audioConfig.vad.silenceDurationMs, 1000),
          create_response: Boolean(vad.createResponse ?? true),
          interrupt_response: Boolean(vad.interruptResponse ?? false)
        }
      },
      output: { voice: voice || 'ash' }
    }
  };
}
