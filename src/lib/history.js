import {
  ENTRY_STATUS,
  MAX_HISTORY_ITEMS,
  MAX_LATEST_ITEMS,
  NOTIFICATION_STATUS,
  PROMO_TYPES,
  STORAGE_KEYS
} from "./constants.js";
import { readKey } from "./storage.js";
import { daysToMs, safeArray, safeNumber, sanitizeSteamAssetUrl } from "./utils.js";

export function sanitizePromotionEntry(raw = {}) {
  const source = typeof raw === "object" && raw ? raw : {};
  return {
    id: typeof source.id === "string" ? source.id : "",
    fingerprint: typeof source.fingerprint === "string" ? source.fingerprint : "",
    stableId: typeof source.stableId === "string" ? source.stableId : "",
    appId: safeNumber(source.appId, 0),
    packageId: safeNumber(source.packageId, 0),
    title: typeof source.title === "string" ? source.title : "",
    promoType: typeof source.promoType === "string" ? source.promoType : "free-to-keep",
    rawTypeLabel: typeof source.rawTypeLabel === "string" ? source.rawTypeLabel : "",
    contentType: typeof source.contentType === "string" ? source.contentType : "unknown",
    url: typeof source.url === "string" ? source.url : "https://store.steampowered.com/",
    headerImage: sanitizeSteamAssetUrl(source.headerImage),
    capsuleImage: sanitizeSteamAssetUrl(source.capsuleImage),
    screenshotThumbnail: sanitizeSteamAssetUrl(source.screenshotThumbnail),
    screenshotFull: sanitizeSteamAssetUrl(source.screenshotFull),
    sourceId: typeof source.sourceId === "string" ? source.sourceId : "",
    sourceFingerprint: typeof source.sourceFingerprint === "string" ? source.sourceFingerprint : "",
    startsAt: safeNumber(source.startsAt, 0),
    endsAt: safeNumber(source.endsAt, 0),
    firstSeenAt: safeNumber(source.firstSeenAt, 0),
    lastSeenAt: safeNumber(source.lastSeenAt, 0),
    lastCheckedAt: safeNumber(source.lastCheckedAt, 0),
    lastNotifiedAt: safeNumber(source.lastNotifiedAt, 0),
    unread: Boolean(source.unread),
    status: typeof source.status === "string" ? source.status : ENTRY_STATUS.ACTIVE,
    notificationStatus: typeof source.notificationStatus === "string" ? source.notificationStatus : NOTIFICATION_STATUS.PENDING,
    lastStateChangeAt: safeNumber(source.lastStateChangeAt, 0)
  };
}

export function sanitizePromotionEntries(raw) {
  return safeArray(raw)
    .map((entry) => sanitizePromotionEntry(entry))
    .filter((entry) => entry.id);
}

export async function getHistoryEntries() {
  const stored = await readKey(STORAGE_KEYS.history, []);
  return sanitizePromotionEntries(stored);
}

export async function getLatestPromotionEntries() {
  const stored = await readKey(STORAGE_KEYS.latestPromotions, []);
  return sanitizePromotionEntries(stored);
}

export function mergePromotionEntries(existingEntries, promotions, nowTs, options = {}) {
  const currentMap = new Map(sanitizePromotionEntries(existingEntries).map((entry) => [entry.id, entry]));
  const activeIds = new Set();
  const newEntries = [];
  const merged = [];

  for (const promotion of promotions) {
    activeIds.add(promotion.id);
    const existing = currentMap.get(promotion.id);
    const isChangedCycle = !existing || existing.fingerprint !== promotion.fingerprint;
    const next = sanitizePromotionEntry({
      ...existing,
      ...promotion,
      firstSeenAt: isChangedCycle ? nowTs : (existing?.firstSeenAt || nowTs),
      lastSeenAt: nowTs,
      lastCheckedAt: nowTs,
      lastStateChangeAt: isChangedCycle ? nowTs : (existing?.lastStateChangeAt || nowTs),
      unread: isChangedCycle ? true : Boolean(existing?.unread),
      status: ENTRY_STATUS.ACTIVE,
      notificationStatus: isChangedCycle
        ? NOTIFICATION_STATUS.PENDING
        : (existing?.notificationStatus || NOTIFICATION_STATUS.PENDING)
    });
    if (isChangedCycle) {
      newEntries.push(next);
    }
    merged.push(next);
  }

  for (const entry of currentMap.values()) {
    if (activeIds.has(entry.id)) {
      continue;
    }
    const expired = sanitizePromotionEntry({
      ...entry,
      status: entry.status === ENTRY_STATUS.DISMISSED ? ENTRY_STATUS.DISMISSED : ENTRY_STATUS.EXPIRED,
      unread: false,
      lastCheckedAt: nowTs
    });
    merged.push(expired);
  }

  merged.sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === ENTRY_STATUS.ACTIVE ? -1 : 1;
    }
    return Math.max(right.lastSeenAt, right.firstSeenAt) - Math.max(left.lastSeenAt, left.firstSeenAt);
  });

  const retentionDays = options.retentionDays || 30;
  const maxItems = options.maxItems || MAX_HISTORY_ITEMS;
  const cutoff = nowTs - daysToMs(retentionDays);

  const pruned = merged.filter((entry) => {
    if (entry.status === ENTRY_STATUS.ACTIVE) {
      return true;
    }
    return Math.max(entry.lastSeenAt, entry.firstSeenAt) >= cutoff;
  }).slice(0, maxItems);

  return {
    entries: pruned,
    newEntries
  };
}

export function markEntriesRead(entries) {
  return sanitizePromotionEntries(entries).map((entry) => ({
    ...entry,
    unread: false
  }));
}

export function dismissEntry(entries, id, nowTs) {
  return sanitizePromotionEntries(entries).map((entry) => {
    if (entry.id !== id) {
      return entry;
    }
    return {
      ...entry,
      status: ENTRY_STATUS.DISMISSED,
      notificationStatus: NOTIFICATION_STATUS.DISMISSED,
      unread: false,
      lastStateChangeAt: nowTs
    };
  });
}

export function countUnreadActive(entries) {
  return sanitizePromotionEntries(entries).filter((entry) => entry.status === ENTRY_STATUS.ACTIVE && entry.unread).length;
}

export function countActivePromotions(entries, promoType = PROMO_TYPES.FREE_TO_KEEP) {
  return sanitizePromotionEntries(entries)
    .filter((entry) => entry.status === ENTRY_STATUS.ACTIVE && entry.promoType === promoType)
    .length;
}

export function buildLatestEntries(entries) {
  return sanitizePromotionEntries(entries).slice(0, MAX_LATEST_ITEMS);
}
