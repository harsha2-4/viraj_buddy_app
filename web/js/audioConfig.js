export const audioConfig = {
  microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  vad: {
    absoluteThreshold: 0.012,
    noiseMultiplier: 2.5,
    startFrames: 2,
    endSilenceMs: 1000,
    maxUtteranceMs: 15000
  },
  followUpDelayMs: 20000,
  minSpeechMs: 200,
  debug: { enabled: false }
};

export function chooseRecordingType(MediaRecorderImpl = globalThis.MediaRecorder) {
  if (!MediaRecorderImpl?.isTypeSupported) return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus']
    .find(type => MediaRecorderImpl.isTypeSupported(type)) || '';
}

export function splitSpeechText(value, limit = 200) {
  const text = String(value || '').trim();
  if (!text) return [];
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]?/gu) || [text];
  const chunks = [];
  let current = '';
  const append = part => {
    const words = part.trim().split(/\s+/u);
    for (const word of words) {
      if (Array.from(word).length > limit) {
        if (current) chunks.push(current.trim());
        current = '';
        let segment = '';
        for (const character of Array.from(word)) {
          if (Array.from(segment).length >= limit) { chunks.push(segment); segment = ''; }
          segment += character;
        }
        current = segment;
      } else if (current && Array.from(`${current} ${word}`).length > limit) {
        chunks.push(current.trim()); current = word;
      } else current += `${current ? ' ' : ''}${word}`;
    }
  };
  for (const sentence of sentences) {
    if (Array.from(sentence.trim()).length > limit) {
      append(sentence);
      if (current) { chunks.push(current.trim()); current = ''; }
    } else if (current && Array.from(`${current} ${sentence.trim()}`).length > limit) {
      chunks.push(current.trim()); current = sentence.trim();
    } else current += `${current ? ' ' : ''}${sentence.trim()}`;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

export function splitConversationalSpeech(value, limit = 200) {
  const text = String(value || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/[*_~`#]/gu, '')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/[—–]/gu, ', ')
    .replace(/\s+/gu, ' ')
    .trim();
  return splitSpeechText(text, limit);
}
