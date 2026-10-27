const STORAGE_KEY = 'viraj-buddy:user-profiles:v1';
const ACTIVE_PROFILE_KEY = 'viraj-buddy:active-profile:v1';
const MAX_NAME_LENGTH = 60;

function getStorage(storage) {
  if (storage) return storage;
  if (!globalThis.localStorage) throw new Error('User profiles are unavailable in this browser.');
  return globalThis.localStorage;
}

function normalizeName(value) {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

function read(storage) {
  const saved = getStorage(storage).getItem(STORAGE_KEY);
  if (saved === null) return [];
  const profiles = JSON.parse(saved);
  if (!Array.isArray(profiles) || profiles.some(profile =>
    !profile || typeof profile.id !== 'string' || typeof profile.name !== 'string' ||
    !profile.name.trim() || typeof profile.createdAt !== 'string')) {
    throw new Error('Saved user profiles are invalid. Ask a grown-up for help before clearing browser data.');
  }
  const ids = new Set();
  const names = new Set();
  for (const profile of profiles) {
    const name = normalizeName(profile.name);
    if (ids.has(profile.id) || names.has(name)) throw new Error('Saved user profiles contain duplicates and need grown-up help.');
    ids.add(profile.id);
    names.add(name);
  }
  return profiles;
}

function write(profiles, storage) {
  getStorage(storage).setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function getActiveProfileId(storage) {
  return getStorage(storage).getItem(ACTIVE_PROFILE_KEY);
}

export function setActiveProfileId(id, storage) {
  if (typeof id !== 'string' || !id) throw new TypeError('An active user profile is required.');
  getStorage(storage).setItem(ACTIVE_PROFILE_KEY, id);
}

export function clearActiveProfileId(storage) {
  getStorage(storage).removeItem(ACTIVE_PROFILE_KEY);
}

export function validateProfileName(value) {
  if (typeof value !== 'string') throw new TypeError('Enter a name to continue.');
  const name = value.trim().replace(/\s+/gu, ' ');
  if (!name) throw new TypeError('Enter a name to continue.');
  if (Array.from(name).length > MAX_NAME_LENGTH) throw new TypeError(`Names must be ${MAX_NAME_LENGTH} characters or fewer.`);
  if (/[\u0000-\u001f\u007f]/u.test(name)) throw new TypeError('Please use a name without control characters.');
  return name;
}

export function listProfiles(storage) {
  return read(storage).sort((left, right) => left.name.localeCompare(right.name));
}

export function findProfile(name, storage) {
  const normalized = normalizeName(validateProfileName(name));
  return read(storage).find(profile => normalizeName(profile.name) === normalized) || null;
}

export function getProfile(id, storage) {
  if (typeof id !== 'string' || !id) return null;
  return read(storage).find(profile => profile.id === id) || null;
}

export function createProfile(value, storage, now = new Date(), id = globalThis.crypto.randomUUID()) {
  const name = validateProfileName(value);
  const profiles = read(storage);
  const duplicate = profiles.find(profile => normalizeName(profile.name) === normalizeName(name));
  if (duplicate) {
    const error = new Error(`A profile named ${duplicate.name} already exists.`);
    error.code = 'PROFILE_EXISTS';
    error.profile = duplicate;
    throw error;
  }
  if (profiles.some(profile => profile.id === id)) throw new Error('A profile with this identifier already exists.');
  const profile = { id, name, createdAt: now.toISOString() };
  write([...profiles, profile], storage);
  return profile;
}

export function removeProfile(id, storage) {
  const profiles = read(storage);
  write(profiles.filter(profile => profile.id !== id), storage);
}
