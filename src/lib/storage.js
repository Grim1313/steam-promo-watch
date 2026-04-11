import { STORAGE_KEYS, STORAGE_SCHEMA_VERSION } from "./constants.js";

export async function readLocal(keys = null) {
  return chrome.storage.local.get(keys);
}

export async function writeLocal(values) {
  await chrome.storage.local.set(values);
  return values;
}

export async function removeLocal(keys) {
  await chrome.storage.local.remove(keys);
}

export async function readKey(key, fallback) {
  const result = await chrome.storage.local.get(key);
  return Object.prototype.hasOwnProperty.call(result, key) ? result[key] : fallback;
}

export async function updateKey(key, fallback, updater) {
  const current = await readKey(key, fallback);
  const next = await updater(current);
  await writeLocal({ [key]: next });
  return next;
}

export async function ensureSchemaVersion() {
  const current = await readKey(STORAGE_KEYS.schemaVersion, 0);
  if (current !== STORAGE_SCHEMA_VERSION) {
    await writeLocal({ [STORAGE_KEYS.schemaVersion]: STORAGE_SCHEMA_VERSION });
  }
}
