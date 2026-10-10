import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildRealtimeSessionConfig } from '../web/js/audioConfig.js';

const web = path.resolve(fileURLToPath(new URL('../web/', import.meta.url)));
const masterPromptPath = fileURLToPath(new URL('./master-prompt.md', import.meta.url));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
export function createBuddyServer({ env = process.env, fetcher = fetch } = {}) {
  const attempts = new Map();
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'microphone=(self), camera=()');
    const send = (status, body, type = 'application/json') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(type === 'application/json' ? JSON.stringify(body) : body);
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/session') {
        if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
        if (!env.OPENAI_API_KEY) return send(503, { error: 'Voice service is not configured. Ask the owner to check the server.' });
        const expectedOrigin = env.BUDDY_ORIGIN || 'http://localhost:8080';
        if (req.headers.origin !== expectedOrigin) return send(403, { error: 'Open Buddy at its configured address.' });
        const now = Date.now();
        for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
        const ip = req.socket.remoteAddress;
        const entry = attempts.get(ip) || { count: 0, until: now + 60000 };
        attempts.set(ip, entry);
        if (++entry.count > 8) return send(429, { error: 'Please wait a minute before trying again.' });
        if (!(req.headers['content-type'] || '').startsWith('application/sdp')) return send(415, { error: 'Expected a voice connection offer.' });
        let instructions;
        try {
          instructions = (await readFile(masterPromptPath, 'utf8')).trim();
        } catch (error) {
          if (error.code === 'ENOENT') return send(503, { error: 'Buddy master prompt is missing. Restore server/master-prompt.md.' });
          throw error;
        }
        if (!instructions) return send(503, { error: 'Buddy master prompt is empty. Add Buddy instructions to server/master-prompt.md.' });
        let sdp = '';
        for await (const chunk of req) {
          sdp += chunk;
          if (sdp.length > 65536) return send(413, { error: 'Connection offer too large.' });
        }
        if (!sdp.startsWith('v=0')) return send(400, { error: 'Invalid connection offer.' });
        const form = new FormData();
        form.set('sdp', sdp);
        const sessionBody = buildRealtimeSessionConfig({
          instructions,
          model: env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
          voice: env.OPENAI_REALTIME_VOICE || 'ash',
          noiseReduction: env.OPENAI_REALTIME_NOISE_REDUCTION || 'near_field',
          vad: {
            threshold: Number(env.OPENAI_REALTIME_VAD_THRESHOLD || 0.7),
            prefixPaddingMs: Number(env.OPENAI_REALTIME_VAD_PREFIX_PADDING_MS || 300),
            silenceDurationMs: Number(env.OPENAI_REALTIME_VAD_SILENCE_DURATION_MS || 1000),
            createResponse: true,
            interruptResponse: false
          }
        });
        form.set('session', JSON.stringify(sessionBody));
        const upstream = await fetcher('https://api.openai.com/v1/realtime/calls', {
          method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
          body: form, signal: AbortSignal.timeout(25000)
        });
        if (!upstream.ok) return send(502, { error: 'Voice could not connect. A grown-up can check the API account and model access.' });
        return send(200, await upstream.text(), 'application/sdp');
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, { error: 'Method not allowed.' });
      const pathname = decodeURIComponent(url.pathname);
      const target = path.resolve(web, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
      if (!target.startsWith(web + path.sep) || !mime[path.extname(target)]) return send(404, { error: 'Not found.' });
      const data = await readFile(target);
      res.writeHead(200, { 'Content-Type': mime[path.extname(target)], 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      send(error.code === 'ENOENT' ? 404 : 500, { error: error.code === 'ENOENT' ? 'Not found.' : 'Connection failed. Please try again.' });
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  createBuddyServer().listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Buddy: ${process.env.BUDDY_ORIGIN || `http://localhost:${port}`}`));
}
