/** Accept normal HTTPS ChatGPT destinations only, never arbitrary app schemes. */
export function getChatGptDestination(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const allowedHost = ['chatgpt.com', 'chat.openai.com'].includes(url.hostname);
    if (url.protocol !== 'https:' || !allowedHost || url.username || url.password || url.port) return null;
    return url.href;
  } catch {
    return null;
  }
}
