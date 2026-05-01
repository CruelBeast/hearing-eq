// storage.js — localStorage helpers for EARMATCH saved profiles

const STORAGE_KEY = 'earmatch_profiles';
const MAX_SAVED   = 10;

/**
 * Persist a profile payload to localStorage.
 * Stores up to MAX_SAVED entries, newest first.
 * Returns the generated entry ID, or null if storage is unavailable.
 *
 * @param {object} payload - Full profile payload (from buildPayload in ProfileStep)
 * @returns {string|null}
 */
export function saveProfile(payload) {
  const existing = loadProfiles();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const entry = {
    id,
    savedAt:       new Date().toISOString(),
    strengthLabel: payload.strengthLabel ?? 'Unknown',
    data:          payload,
  };
  const trimmed = [entry, ...existing].slice(0, MAX_SAVED);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    return id;
  } catch (e) {
    console.warn('EARMATCH: could not save profile to localStorage:', e);
    return null;
  }
}

/**
 * Load all saved profiles from localStorage, newest first.
 * Returns an empty array if storage is unavailable or empty.
 *
 * @returns {Array<{id, savedAt, strengthLabel, data}>}
 */
export function loadProfiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Remove a single saved profile by its ID.
 *
 * @param {string} id
 */
export function deleteProfile(id) {
  const profiles = loadProfiles().filter(p => p.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch (e) {
    console.warn('EARMATCH: could not update localStorage after delete:', e);
  }
}
