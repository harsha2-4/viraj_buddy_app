import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { GROQ_MODELS, loadGroqConfig } from './groq-config.mjs';

const web = path.resolve(fileURLToPath(new URL('../web/', import.meta.url)));
const masterPromptPath = fileURLToPath(new URL('./master-prompt.md', import.meta.url));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const safeText = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';

function voiceProfileNote(value) {
  if (value === undefined) return null;
  const validPitch = ['lower', 'middle', 'higher'].includes(value?.pitchBand);
  const validEnergy = ['soft', 'steady', 'strong'].includes(value?.energy);
  if (!validPitch || !validEnergy) return undefined;
  return `A rough, local acoustic sample suggests a ${value.energy} speaking level and ${value.pitchBand} pitch. These are uncertain sound measurements, not speaker identification. Use them only as gentle delivery hints. Do not infer identity, age, gender, mood, health, or intent from them.`;
}

async function readJson(req, limit = 128 * 1024) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw Object.assign(new Error('Request body too large.'), { status: 413 });
  }
  try { return JSON.parse(body || '{}'); }
  catch { throw Object.assign(new Error('Invalid request data.'), { status: 400 }); }
}

export function createBuddyServer({ env = process.env, fetcher = fetch, now = () => Date.now() } = {}) {
  const config = loadGroqConfig(env);
  const attempts = new Map();
  const dedupe = new Map();
  let usage = { day: new Date(now()).toISOString().slice(0, 10), sttRequests: 0, audioSeconds: 0, llmRequests: 0, inputTokens: 0, outputTokens: 0, ttsRequests: 0, ttsCharacters: 0, estimatedUsd: 0, rateLimitErrors: 0, latencyMs: 0 };
  const resetUsage = () => {
    const day = new Date(now()).toISOString().slice(0, 10);
    if (usage.day !== day) usage = { day, sttRequests: 0, audioSeconds: 0, llmRequests: 0, inputTokens: 0, outputTokens: 0, ttsRequests: 0, ttsCharacters: 0, estimatedUsd: 0, rateLimitErrors: 0, latencyMs: 0 };
  };
  const send = (res, status, body, type = 'application/json') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(type === 'application/json' ? JSON.stringify(body) : body);
  };
  const routeError = (error, res) => {
    if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter).slice(0, 64));
    return send(res, error.status || 500, { error: error.status ? error.message : 'Voice service failed. Please try again.', code: error.code || 'VOICE_ERROR' });
  };
  const originOk = req => {
    const expectedOrigin = env.BUDDY_ORIGIN || 'http://localhost:8080';
    if (req.headers.origin) return req.headers.origin === expectedOrigin;
    return req.method === 'GET' && req.headers.host === new URL(expectedOrigin).host;
  };
  const rateAllowed = req => {
    const time = now();
    for (const [key, entry] of attempts) if (entry.until <= time) attempts.delete(key);
    const ip = req.socket.remoteAddress || 'unknown';
    const entry = attempts.get(ip) || { count: 0, until: time + 60000 };
    attempts.set(ip, entry);
    return ++entry.count <= 30;
  };
  const groq = async (endpoint, options = {}) => {
    if (!config.apiKey) throw Object.assign(new Error('Groq is not configured. Set GROQ_API_KEY on the server.'), { status: 503, code: 'CONFIG_MISSING' });
    const started = now();
    let response;
    try {
      response = await fetcher(`${config.baseUrl}${endpoint}`, {
        ...options,
        headers: { Authorization: `Bearer ${config.apiKey}`, ...options.headers },
        signal: AbortSignal.timeout(config.requestTimeoutMs)
      });
    } catch (error) {
      const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
      throw Object.assign(new Error(timedOut ? 'Groq took too long to respond. Please try again.' : 'The voice service is offline. Check the connection and try again.'), { status: timedOut ? 504 : 502, code: timedOut ? 'GROQ_TIMEOUT' : 'GROQ_NETWORK_ERROR' });
    }
    usage.latencyMs += now() - started;
    if (!response.ok) {
      if (response.status === 429) usage.rateLimitErrors++;
      let providerError;
      try { providerError = await response.json(); }
      catch { providerError = null; }
      if (providerError?.error?.code === 'model_terms_required') {
        throw Object.assign(new Error('A grown-up must accept the Groq Orpheus speech model terms in the Groq Console, then try again.'), { status: 503, code: 'GROQ_MODEL_TERMS_REQUIRED' });
      }
      const status = response.status === 429 ? 429 : response.status >= 500 ? 502 : response.status === 401 ? 503 : 502;
      const providerMessage = safeText(providerError?.error?.message, 240);
      const message = response.status === 429
        ? 'Buddy needs a short rest. Please try again in a little while.'
        : response.status === 400 && providerMessage
          ? `Groq rejected the voice request: ${providerMessage}`
          : 'Groq could not complete that request. Ask a grown-up to check the server settings.';
      throw Object.assign(new Error(message), { status, code: `GROQ_${response.status}`, retryAfter: response.headers.get('retry-after') });
    }
    return response;
  };
  const deduplicated = async (key, work) => {
    const cacheKey = safeText(key, 160);
    if (!cacheKey) return work();
    const existing = dedupe.get(cacheKey);
    if (existing) return existing;
    const pending = Promise.resolve().then(work);
    dedupe.set(cacheKey, pending);
    try { return await pending; }
    finally { setTimeout(() => { if (dedupe.get(cacheKey) === pending) dedupe.delete(cacheKey); }, 120000).unref?.(); }
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'microphone=(self), camera=()');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        if (req.method !== 'POST' && !(req.method === 'GET' && ['/api/voice/models', '/api/voice/usage'].includes(url.pathname))) return send(res, 405, { error: 'Method not allowed.' });
        if (!originOk(req)) return send(res, 403, { error: 'Open Buddy at its configured address.' });
        if (!config.apiKey) return send(res, 503, { error: 'Set GROQ_API_KEY on the server before starting voice.' });
        if (!rateAllowed(req)) return send(res, 429, { error: 'Please wait a minute before trying again.' });
        resetUsage();

        if (url.pathname === '/api/voice/models') {
          const response = await groq('/models', { method: 'GET' });
          const data = await response.json();
          const available = new Set((data.data || []).map(model => model.id));
          const models = { stt: available.has(GROQ_MODELS.stt), llm: available.has(GROQ_MODELS.llm), tts: available.has(GROQ_MODELS.tts) };
          const allAvailable = Object.values(models).every(Boolean);
          return send(res, allAvailable ? 200 : 503, {
            ...(allAvailable ? {} : { error: 'One or more configured Groq models are unavailable to this account.' }),
            models, configured: { stt: config.sttModel, llm: config.llmModel, tts: config.ttsModel },
            voice: { vadEnabled: config.vadEnabled, echoCancellation: config.echoCancellation, noiseSuppression: config.noiseSuppression, autoGainControl: config.autoGainControl, endSilenceMs: config.endSilenceMs, minSpeechMs: config.minSpeechMs, maxUtteranceMs: config.maxUtteranceMs, vadThreshold: config.vadThreshold, vadNoiseMultiplier: config.vadNoiseMultiplier, conversationMemoryEnabled: config.conversationMemoryEnabled }
          });
        }
        if (url.pathname === '/api/voice/usage') return send(res, 200, { ...usage, costIsEstimate: true, ttsRateConfigured: config.ttsCostPerMillionChars > 0, dailyLimitUsd: config.maxDailyUsd });

        if (url.pathname === '/api/voice/transcribe') {
          if (!config.sttEnabled) return send(res, 503, { error: 'Speech recognition is disabled in server settings.' });
          if (usage.estimatedUsd >= config.maxDailyUsd) return send(res, 429, { error: 'Buddy has reached today’s voice limit. A grown-up can check the server settings.' });
          const contentType = req.headers['content-type'] || '';
          if (!contentType.startsWith('multipart/form-data;')) return send(res, 415, { error: 'Send a supported audio recording.' });
          let chunks = [], total = 0;
          for await (const chunk of req) { total += chunk.length; if (total > config.maxAudioBytes) return send(res, 413, { error: 'That recording is too large. Try a shorter turn.' }); chunks.push(chunk); }
          const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.slice(1).find(Boolean);
          if (!boundary || total === 0) return send(res, 400, { error: 'The recording was empty or invalid.' });
          const body = Buffer.concat(chunks);
          const parts = body.toString('latin1').split(`--${boundary}`);
          const filePart = parts.find(part => /name="audio"/.test(part) && /filename="[^"]+"/.test(part));
          if (!filePart) return send(res, 400, { error: 'The audio recording was missing.' });
          const splitAt = filePart.indexOf('\r\n\r\n');
          const header = filePart.slice(0, splitAt);
          const filename = header.match(/filename="([^"]+)"/)?.[1] || 'utterance.webm';
          const fileType = header.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim() || 'audio/webm';
          if (!/^audio\/(webm|mp4|ogg|wav|mpeg|mp4|x-m4a|3gpp|aac)/i.test(fileType)) return send(res, 415, { error: 'This browser recording format is not supported.' });
          const bytes = Buffer.from(filePart.slice(splitAt + 4).replace(/\r\n$/, ''), 'latin1');
          if (!bytes.length) return send(res, 400, { error: 'The recording was empty.' });
          const turnId = safeText(req.headers['x-turn-id'], 100);
          if (!turnId) return send(res, 400, { error: 'A turn identifier is required.' });
          const form = new FormData();
          form.set('file', new Blob([bytes], { type: fileType }), path.basename(filename));
          form.set('model', config.sttModel);
          form.set('response_format', 'json');
          const seconds = Math.max(0, Math.min(Number(req.headers['x-audio-seconds']) || 0, 120));
          const transcript = await deduplicated(`stt:${turnId}`, async () => {
            const response = await groq('/audio/transcriptions', { method: 'POST', body: form });
            const data = await response.json();
            const text = safeText(data.text, 4000).trim();
            if (!text) throw Object.assign(new Error('I didn’t quite hear that. Try once more.'), { status: 422, code: 'EMPTY_TRANSCRIPT' });
            usage.sttRequests++; usage.audioSeconds += seconds; usage.estimatedUsd += seconds / 3600 * config.sttCostPerHour;
            return text;
          });
          return send(res, 200, { turnId, transcript });
        }

        if (url.pathname === '/api/voice/reply') {
          if (!config.llmEnabled) return send(res, 503, { error: 'Buddy’s conversation service is disabled in server settings.' });
          const input = await readJson(req);
          const turnId = safeText(input.turnId, 100);
          const transcript = safeText(input.transcript, 4000).trim();
          const opening = input.opening === true;
          const followUp = input.followUp === true;
          const profileNote = voiceProfileNote(input.voiceProfile);
          if (!turnId) return send(res, 400, { error: 'A turn identifier is required.' });
          if (opening && followUp) return send(res, 400, { error: 'A reply cannot be both an opening and a follow-up.' });
          if ((opening || followUp) && usage.estimatedUsd >= config.maxDailyUsd) return send(res, 429, { error: 'Buddy has reached today’s voice limit. A grown-up can check the server settings.' });
          if (!opening && !followUp && !transcript) return send(res, 400, { error: 'A transcript is needed before Buddy can answer.' });
          if (profileNote === undefined) return send(res, 400, { error: 'Voice profile data was invalid. Please ask a grown-up to set up the profile again.' });
          const messages = [{ role: 'system', content: await readFile(masterPromptPath, 'utf8') }];
          if (profileNote) messages.push({ role: 'system', content: profileNote });
          for (const item of Array.isArray(input.history) ? input.history.slice(-12) : []) {
            if (['user', 'assistant'].includes(item?.role) && typeof item.content === 'string') messages.push({ role: item.role, content: item.content.slice(0, 1200) });
          }
          const userMessage = opening
            ? 'Begin this voice conversation now. Follow your system instructions.'
            : followUp
              ? 'About 20 seconds have passed since your last spoken turn and the child has not responded. Gently follow up once, changing to a fresh playful topic or activity. Keep it brief, offer an easy way to join in, and do not pressure the child.'
              : transcript;
          messages.push({ role: 'user', content: userMessage });
          const result = await deduplicated(`llm:${turnId}`, async () => {
            const response = await groq('/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.llmModel, messages, max_completion_tokens: 1024 }) });
            const data = await response.json();
            const text = safeText(data.choices?.[0]?.message?.content, 4000).trim();
            if (!text) throw Object.assign(new Error('Buddy could not form a reply. Please try again.'), { status: 502, code: 'EMPTY_REPLY' });
            usage.llmRequests++;
            usage.inputTokens += data.usage?.prompt_tokens || 0;
            usage.outputTokens += data.usage?.completion_tokens || 0;
            usage.estimatedUsd += (data.usage?.prompt_tokens || 0) / 1e6 * config.llmCostPerMillionInput + (data.usage?.completion_tokens || 0) / 1e6 * config.llmCostPerMillionOutput;
            return text;
          });
          return send(res, 200, { turnId, reply: result });
        }

        if (url.pathname === '/api/voice/speak') {
          if (!config.ttsEnabled) return send(res, 503, { error: 'Buddy’s voice is disabled in server settings.' });
          const input = await readJson(req, 16 * 1024);
          if (typeof input.text !== 'string' || Array.from(input.text).length > 200) return send(res, 400, { error: 'Split spoken text into chunks of 200 characters or fewer.' });
          const text = input.text.trim();
          if (!safeText(input.requestId, 160)) return send(res, 400, { error: 'A speech request identifier is required.' });
          if (!text) return send(res, 400, { error: 'There is no text to speak.' });
          if (Array.from(text).length > 200) return send(res, 400, { error: 'Split spoken text into chunks of 200 characters or fewer.' });
          const wav = await deduplicated(`tts:${safeText(input.requestId, 160)}`, async () => {
            const response = await groq('/audio/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.ttsModel, voice: config.ttsVoice, input: text, response_format: 'wav' }) });
            const audio = Buffer.from(await response.arrayBuffer());
            usage.ttsRequests++; usage.ttsCharacters += Array.from(text).length; usage.estimatedUsd += Array.from(text).length / 1e6 * config.ttsCostPerMillionChars;
            return audio;
          });
          return send(res, 200, wav, 'audio/wav');
        }
        return send(res, 404, { error: 'Not found.' });
      }

      if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { error: 'Method not allowed.' });
      const pathname = decodeURIComponent(url.pathname);
      const target = path.resolve(web, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
      if (!target.startsWith(web + path.sep) || !mime[path.extname(target)]) return send(res, 404, { error: 'Not found.' });
      const data = await readFile(target);
      res.writeHead(200, { 'Content-Type': mime[path.extname(target)], 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) { routeError(error, res); }
  });
  server.usage = () => ({ ...usage, costIsEstimate: true });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  createBuddyServer().listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Buddy voice server listening on port ${port}`));
}
