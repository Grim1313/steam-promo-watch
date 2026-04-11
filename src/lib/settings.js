import {
  CHECK_INTERVAL_OPTIONS,
  DEFAULT_CHECK_INTERVAL_MINUTES,
  DEFAULT_HISTORY_RETENTION_DAYS,
  DEFAULT_NOTIFIED_RETENTION_DAYS,
  DEFAULT_QUIET_END,
  DEFAULT_QUIET_START,
  STORAGE_KEYS
} from "./constants.js";
import { readKey, writeLocal } from "./storage.js";
import { clamp, textAreaToList, uniqueLowerList } from "./utils.js";

export const DEFAULT_SETTINGS = Object.freeze({
  notificationsEnabled: true,
  trackFreeToKeep: true,
  checkIntervalMinutes: DEFAULT_CHECK_INTERVAL_MINUTES,
  quietHoursEnabled: false,
  quietHoursStart: DEFAULT_QUIET_START,
  quietHoursEnd: DEFAULT_QUIET_END,
  badgeEnabled: true,
  historyEnabled: true,
  historyRetentionDays: DEFAULT_HISTORY_RETENTION_DAYS,
  notifiedRetentionDays: DEFAULT_NOTIFIED_RETENTION_DAYS,
  renotifyAfterRetention: true,
  filters: {
    ignoreDlc: true,
    ignoreSoundtracks: true,
    ignoreDemos: true,
    ignoreTools: true,
    ignorePackages: false,
    blockedAppIds: [],
    blockedKeywords: []
  }
});

function sanitizeCheckInterval(value) {
  const numeric = Number(value);
  return CHECK_INTERVAL_OPTIONS.includes(numeric) ? numeric : DEFAULT_CHECK_INTERVAL_MINUTES;
}

function sanitizePositiveDayCount(value, fallback) {
  return clamp(Math.round(Number(value) || fallback), 1, 365);
}

export function sanitizeSettings(raw = {}) {
  const source = typeof raw === "object" && raw ? raw : {};
  const filters = typeof source.filters === "object" && source.filters ? source.filters : {};

  const blockedAppIds = Array.from(new Set(
    textAreaToList(Array.isArray(filters.blockedAppIds) ? filters.blockedAppIds.join("\n") : filters.blockedAppIds)
      .map((value) => Number.parseInt(String(value), 10))
      .filter((value) => Number.isInteger(value) && value > 0)
  ));

  const blockedKeywords = uniqueLowerList(
    Array.isArray(filters.blockedKeywords)
      ? filters.blockedKeywords
      : textAreaToList(filters.blockedKeywords)
  );

  return {
    notificationsEnabled: Boolean(source.notificationsEnabled ?? DEFAULT_SETTINGS.notificationsEnabled),
    trackFreeToKeep: Boolean(source.trackFreeToKeep ?? DEFAULT_SETTINGS.trackFreeToKeep),
    checkIntervalMinutes: sanitizeCheckInterval(source.checkIntervalMinutes),
    quietHoursEnabled: Boolean(source.quietHoursEnabled ?? DEFAULT_SETTINGS.quietHoursEnabled),
    quietHoursStart: typeof source.quietHoursStart === "string" ? source.quietHoursStart : DEFAULT_QUIET_START,
    quietHoursEnd: typeof source.quietHoursEnd === "string" ? source.quietHoursEnd : DEFAULT_QUIET_END,
    badgeEnabled: Boolean(source.badgeEnabled ?? DEFAULT_SETTINGS.badgeEnabled),
    historyEnabled: Boolean(source.historyEnabled ?? DEFAULT_SETTINGS.historyEnabled),
    historyRetentionDays: sanitizePositiveDayCount(source.historyRetentionDays, DEFAULT_HISTORY_RETENTION_DAYS),
    notifiedRetentionDays: sanitizePositiveDayCount(source.notifiedRetentionDays, DEFAULT_NOTIFIED_RETENTION_DAYS),
    renotifyAfterRetention: Boolean(source.renotifyAfterRetention ?? DEFAULT_SETTINGS.renotifyAfterRetention),
    filters: {
      ignoreDlc: Boolean(filters.ignoreDlc ?? DEFAULT_SETTINGS.filters.ignoreDlc),
      ignoreSoundtracks: Boolean(filters.ignoreSoundtracks ?? DEFAULT_SETTINGS.filters.ignoreSoundtracks),
      ignoreDemos: Boolean(filters.ignoreDemos ?? DEFAULT_SETTINGS.filters.ignoreDemos),
      ignoreTools: Boolean(filters.ignoreTools ?? DEFAULT_SETTINGS.filters.ignoreTools),
      ignorePackages: Boolean(filters.ignorePackages ?? DEFAULT_SETTINGS.filters.ignorePackages),
      blockedAppIds,
      blockedKeywords
    }
  };
}

export async function getSettings() {
  const stored = await readKey(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  return sanitizeSettings(stored);
}

export async function saveSettings(nextSettings) {
  const current = await getSettings();
  const merged = sanitizeSettings({
    ...current,
    ...nextSettings,
    filters: {
      ...current.filters,
      ...(nextSettings?.filters || {})
    }
  });
  await writeLocal({ [STORAGE_KEYS.settings]: merged });
  return merged;
}

export async function resetSettings() {
  const sanitized = sanitizeSettings(DEFAULT_SETTINGS);
  await writeLocal({ [STORAGE_KEYS.settings]: sanitized });
  return sanitized;
}
