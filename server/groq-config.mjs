export const GROQ_MODELS = Object.freeze({
  stt: 'whisper-large-v3-turbo',
  llm: 'openai/gpt-oss-20b',
  tts: 'canopylabs/orpheus-v1-english',
  voice: 'troy'
});

export function loadGroqConfig(env = process.env) {
  const baseUrl = (env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  if (baseUrl !== 'https://api.groq.com/openai/v1') throw new Error('GROQ_BASE_URL must be https://api.groq.com/openai/v1.');
  for (const [key, expected] of Object.entries({
    GROQ_STT_MODEL: GROQ_MODELS.stt,
    GROQ_LLM_MODEL: GROQ_MODELS.llm,
    GROQ_TTS_MODEL: GROQ_MODELS.tts,
    GROQ_TTS_VOICE: GROQ_MODELS.voice
  })) {
    if (env[key] && env[key] !== expected) throw new Error(`${key} must be ${expected}; legacy model fallbacks are disabled.`);
  }
  const enabled = key => {
    const value = env[key] ?? 'true';
    if (typeof value !== 'string' || !['true', 'false'].includes(value.toLowerCase())) throw new Error(`${key} must be true or false.`);
    return value.toLowerCase() === 'true';
  };
  const number = (key, fallback, min, max) => {
    if (env[key] === undefined || env[key] === '') return fallback;
    const parsed = Number(env[key] ?? fallback);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${key} must be a number from ${min} to ${max}.`);
    return parsed;
  };
  const apiKey = env.GROQ_API_KEY || '';
  if (apiKey && typeof apiKey !== 'string') throw new Error('GROQ_API_KEY must be a string.');
  return {
    apiKey, baseUrl,
    sttModel: GROQ_MODELS.stt, llmModel: GROQ_MODELS.llm, ttsModel: GROQ_MODELS.tts, ttsVoice: GROQ_MODELS.voice,
    sttEnabled: enabled('GROQ_STT_ENABLED'), llmEnabled: enabled('GROQ_LLM_ENABLED'), ttsEnabled: enabled('GROQ_TTS_ENABLED'),
    maxAudioBytes: number('VOICE_MAX_AUDIO_BYTES', 20 * 1024 * 1024, 1024, 100 * 1024 * 1024),
    maxDailyUsd: number('GROQ_DAILY_SPEND_LIMIT_USD', 5, 0.01, 100000),
    requestTimeoutMs: number('GROQ_REQUEST_TIMEOUT_MS', 30000, 1000, 120000),
    vadEnabled: enabled('VOICE_VAD_ENABLED'),
    echoCancellation: enabled('VOICE_ECHO_CANCELLATION'),
    noiseSuppression: enabled('VOICE_NOISE_SUPPRESSION'),
    autoGainControl: enabled('VOICE_AUTO_GAIN_CONTROL'),
    endSilenceMs: number('VOICE_END_SILENCE_MS', 1000, 500, 3000),
    minSpeechMs: number('VOICE_MIN_SPEECH_MS', 200, 100, 1000),
    maxUtteranceMs: number('VOICE_MAX_UTTERANCE_MS', 15000, 3000, 60000),
    vadThreshold: number('VOICE_VAD_ABSOLUTE_THRESHOLD', 0.012, 0.003, 0.08),
    vadNoiseMultiplier: number('VOICE_VAD_NOISE_MULTIPLIER', 2.5, 1.2, 8),
    conversationMemoryEnabled: enabled('CONVERSATION_MEMORY_ENABLED'),
    sttCostPerHour: number('GROQ_STT_COST_PER_HOUR_USD', 0.04, 0, 10000),
    llmCostPerMillionInput: number('GROQ_LLM_COST_PER_M_INPUT_USD', 0.075, 0, 10000),
    llmCostPerMillionOutput: number('GROQ_LLM_COST_PER_M_OUTPUT_USD', 0.30, 0, 10000),
    ttsCostPerMillionChars: number('GROQ_TTS_COST_PER_M_CHARS_USD', 22, 0, 10000)
  };
}
