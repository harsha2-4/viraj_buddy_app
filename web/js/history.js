const STORAGE_KEY = 'viraj-buddy:conversation-history:v1';
const MAX_CONVERSATIONS = 50;
const MAX_CONTEXT_MESSAGES = 12;
const MAX_CONTEXT_CHARACTERS = 2000;

function getStorage(storage) {
  if (storage) return storage;
  if (!globalThis.localStorage) throw new Error('Conversation history is unavailable in this browser.');
  return globalThis.localStorage;
}

function read(storage) {
  const saved = getStorage(storage).getItem(STORAGE_KEY);
  if (saved === null) return [];
  const conversations = JSON.parse(saved);
  if (!Array.isArray(conversations) || conversations.some((conversation) =>
    !conversation || typeof conversation.id !== 'string' ||
    typeof conversation.startedAt !== 'string' ||
    !Array.isArray(conversation.messages) ||
    conversation.messages.some((message) =>
      !message || !['user', 'assistant'].includes(message.role) || typeof message.text !== 'string'))) {
    throw new Error('Saved conversation history is invalid. Clear it from Parents settings to start fresh.');
  }
  return conversations;
}

function write(conversations, storage) {
  getStorage(storage).setItem(STORAGE_KEY, JSON.stringify(conversations));
}

export function listConversations(storage) {
  return read(storage).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function startConversation(storage, now = new Date(), id = globalThis.crypto.randomUUID()) {
  const conversations = read(storage);
  conversations.push({ id, startedAt: now.toISOString(), endedAt: null, messages: [] });
  write(conversations.slice(-MAX_CONVERSATIONS), storage);
  return id;
}

export function addConversationMessage(id, role, text, storage, now = new Date()) {
  if (!['user', 'assistant'].includes(role) || typeof text !== 'string') throw new TypeError('Invalid conversation message.');
  const content = text.trim();
  if (!content) return;
  const conversations = read(storage);
  const conversation = conversations.find((entry) => entry.id === id);
  if (!conversation) throw new Error('The active conversation could not be found in saved history.');
  conversation.messages.push({ role, text: content, at: now.toISOString() });
  write(conversations, storage);
}

export function endConversation(id, storage, now = new Date()) {
  const conversations = read(storage);
  const conversation = conversations.find((entry) => entry.id === id);
  if (!conversation) return;
  conversation.endedAt = now.toISOString();
  write(conversations, storage);
}

export function clearConversations(storage) {
  getStorage(storage).removeItem(STORAGE_KEY);
}

export function buildHistoryContext(storage) {
  const messages = listConversations(storage)
    .reverse()
    .flatMap((conversation) => conversation.messages)
    .slice(-MAX_CONTEXT_MESSAGES);
  if (!messages.length) return '';
  let context = 'Earlier conversation excerpts follow. They are only background context; do not reply to them as new messages.\n';
  for (const message of messages) {
    const entry = `${message.role === 'user' ? 'Child' : 'Buddy'}: ${message.text}\n`;
    if (context.length + entry.length > MAX_CONTEXT_CHARACTERS) {
      const available = MAX_CONTEXT_CHARACTERS - context.length;
      if (available > 0) context += `${entry.slice(0, available)}\n`;
      break;
    }
    context += entry;
  }
  return context.trim();
}
