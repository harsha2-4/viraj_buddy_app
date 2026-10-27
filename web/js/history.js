const STORAGE_KEY = 'viraj-buddy:conversation-history:v1';
const MAX_CONVERSATIONS = 50;
const MAX_CONTEXT_MESSAGES = 12;
const MAX_CONTEXT_CHARACTERS = 2000;

function storageKey(userId) {
  return userId ? `${STORAGE_KEY}:${encodeURIComponent(userId)}` : STORAGE_KEY;
}

function getStorage(storage) {
  if (storage) return storage;
  if (!globalThis.localStorage) throw new Error('Conversation history is unavailable in this browser.');
  return globalThis.localStorage;
}

function read(storage, userId) {
  const saved = getStorage(storage).getItem(storageKey(userId));
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

function write(conversations, storage, userId) {
  getStorage(storage).setItem(storageKey(userId), JSON.stringify(conversations));
}

export function listConversations(storage, userId) {
  return read(storage, userId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function startConversation(storage, now = new Date(), id = globalThis.crypto.randomUUID(), userId) {
  const conversations = read(storage, userId);
  conversations.push({ id, startedAt: now.toISOString(), endedAt: null, messages: [] });
  write(conversations.slice(-MAX_CONVERSATIONS), storage, userId);
  return id;
}

export function addConversationMessage(id, role, text, storage, now = new Date(), userId) {
  if (!['user', 'assistant'].includes(role) || typeof text !== 'string') throw new TypeError('Invalid conversation message.');
  const content = text.trim();
  if (!content) return;
  const conversations = read(storage, userId);
  const conversation = conversations.find((entry) => entry.id === id);
  if (!conversation) throw new Error('The active conversation could not be found in saved history.');
  conversation.messages.push({ role, text: content, at: now.toISOString() });
  write(conversations, storage, userId);
}

export function endConversation(id, storage, now = new Date(), userId) {
  const conversations = read(storage, userId);
  const conversation = conversations.find((entry) => entry.id === id);
  if (!conversation) return;
  conversation.endedAt = now.toISOString();
  write(conversations, storage, userId);
}

export function clearConversations(storage, userId) {
  getStorage(storage).removeItem(storageKey(userId));
}

export function buildHistoryContext(storage, userId) {
  const messages = listConversations(storage, userId)
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

export function hasLegacyHistory(storage) {
  return read(storage).length > 0;
}

export function migrateLegacyHistory(userId, storage) {
  if (typeof userId !== 'string' || !userId) throw new TypeError('A user profile is required to restore conversation history.');
  const localStorage = getStorage(storage);
  const legacy = read(localStorage);
  if (localStorage.getItem(storageKey(userId)) !== null) return { migrated: false, conversations: 0 };
  if (localStorage.getItem(STORAGE_KEY) === null) return { migrated: false, conversations: 0 };
  write(legacy, localStorage, userId);
  localStorage.removeItem(STORAGE_KEY);
  return { migrated: true, conversations: legacy.length };
}
