import {
  MAX_DISMISSED_ITEMS,
  MAX_NOTIFIED_ITEMS
} from "./constants.js";
import { safeNumber } from "./utils.js";

export function sanitizeNotifiedMap(raw = {}) {
  const source = typeof raw === "object" && raw ? raw : {};
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (!key || typeof value !== "object" || !value) {
      continue;
    }
    result[key] = {
      fingerprint: typeof value.fingerprint === "string" ? value.fingerprint : "",
      firstNotifiedAt: safeNumber(value.firstNotifiedAt, 0),
      lastNotifiedAt: safeNumber(value.lastNotifiedAt, 0)
    };
  }
  return result;
}

export function sanitizeDismissedMap(raw = {}) {
  const source = typeof raw === "object" && raw ? raw : {};
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (!key || typeof value !== "object" || !value) {
      continue;
    }
    result[key] = {
      fingerprint: typeof value.fingerprint === "string" ? value.fingerprint : "",
      title: typeof value.title === "string" ? value.title : "",
      dismissedAt: safeNumber(value.dismissedAt, 0),
      stableId: typeof value.stableId === "string" ? value.stableId : ""
    };
  }
  return result;
}

export function buildPromotionIdentity(promotion) {
  return `${promotion.stableId}|${promotion.promoType}|${promotion.sourceId}`;
}

export function buildPromotionFingerprint(promotion) {
  const payload = [
    buildPromotionIdentity(promotion),
    promotion.startsAt || "",
    promotion.endsAt || "",
    promotion.sourceFingerprint || "",
    promotion.rawTypeLabel || ""
  ].join("|");

  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function shouldNotifyPromotion(promotion, notifiedMap, settings, nowTs) {
  const record = notifiedMap[promotion.id];
  if (!record) {
    return { shouldNotify: true, reason: "new" };
  }
  if (record.fingerprint !== promotion.fingerprint) {
    return { shouldNotify: true, reason: "changed" };
  }
  if (
    settings.renotifyAfterRetention &&
    settings.notifiedRetentionDays > 0 &&
    (nowTs - record.lastNotifiedAt) >= (settings.notifiedRetentionDays * 24 * 60 * 60 * 1000)
  ) {
    return { shouldNotify: true, reason: "ttl-expired" };
  }
  return { shouldNotify: false, reason: "already-notified" };
}

export function markPromotionsNotified(notifiedMap, promotions, nowTs, settings) {
  const next = { ...sanitizeNotifiedMap(notifiedMap) };
  for (const promotion of promotions) {
    const existing = next[promotion.id];
    next[promotion.id] = {
      fingerprint: promotion.fingerprint,
      firstNotifiedAt: existing?.firstNotifiedAt || nowTs,
      lastNotifiedAt: nowTs
    };
  }
  return pruneNotifiedMap(next, settings, nowTs);
}

export function pruneNotifiedMap(notifiedMap, settings, nowTs) {
  const entries = Object.entries(sanitizeNotifiedMap(notifiedMap));
  const filtered = [];
  for (const entry of entries) {
    const [, value] = entry;
    if (!value.lastNotifiedAt) {
      continue;
    }
    if (
      settings.renotifyAfterRetention &&
      settings.notifiedRetentionDays > 0 &&
      (nowTs - value.lastNotifiedAt) >= (settings.notifiedRetentionDays * 24 * 60 * 60 * 1000)
    ) {
      continue;
    }
    filtered.push(entry);
  }

  filtered.sort((left, right) => right[1].lastNotifiedAt - left[1].lastNotifiedAt);
  return Object.fromEntries(filtered.slice(0, MAX_NOTIFIED_ITEMS));
}

export function isPromotionDismissed(promotion, dismissedMap) {
  const record = dismissedMap[promotion.id];
  return Boolean(record && record.fingerprint === promotion.fingerprint);
}

export function dismissPromotionRecord(dismissedMap, promotion, nowTs) {
  const next = { ...sanitizeDismissedMap(dismissedMap) };
  next[promotion.id] = {
    fingerprint: promotion.fingerprint,
    title: promotion.title,
    dismissedAt: nowTs,
    stableId: promotion.stableId
  };
  return pruneDismissedMap(next);
}

export function pruneDismissedMap(dismissedMap) {
  const entries = Object.entries(sanitizeDismissedMap(dismissedMap));
  entries.sort((left, right) => right[1].dismissedAt - left[1].dismissedAt);
  return Object.fromEntries(entries.slice(0, MAX_DISMISSED_ITEMS));
}
