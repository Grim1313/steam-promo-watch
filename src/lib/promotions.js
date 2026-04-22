import {
  ENTRY_STATUS,
  MAX_HISTORY_ITEMS,
  MAX_LATEST_ITEMS,
  NOTIFICATION_STATUS,
  PROMO_TYPES,
  SOURCE_PRIORITIES,
  STORAGE_KEYS
} from "./constants.js";
import {
  buildPromotionFingerprint,
  buildPromotionIdentity,
  dismissPromotionRecord,
  isPromotionDismissed,
  markPromotionsNotified,
  pruneDismissedMap,
  restorePromotionRecord,
  sanitizeDismissedMap,
  sanitizeNotifiedMap,
  shouldNotifyPromotion
} from "./dedupe.js";
import { applyPromotionFilters } from "./filters.js";
import {
  buildIgnoredPromotionEntries,
  buildLatestEntries,
  countActivePromotions,
  countUnreadActive,
  dismissEntry,
  getHistoryEntries,
  getLatestPromotionEntries,
  markEntriesRead,
  mergePromotionEntries,
  restoreEntry
} from "./history.js";
import { createPromotionNotifications } from "./notifications.js";
import { fetchPromotionsFromProviders } from "./providers/index.js";
import { buildRecoveredRuntimeState, getRuntimeState, setRuntimeState } from "./runtime-state.js";
import { getSettings } from "./settings.js";
import { readKey, writeLocal } from "./storage.js";
import { createHash, isQuietHoursActive } from "./utils.js";

let activeCheckPromise = null;

export async function recoverInterruptedCheckState(nowTs = Date.now()) {
  if (activeCheckPromise) {
    return getRuntimeState();
  }

  const runtimeState = await getRuntimeState();
  if (!runtimeState.checkInProgress) {
    return runtimeState;
  }

  const recoveredState = buildRecoveredRuntimeState(runtimeState, nowTs);
  await writeLocal({ [STORAGE_KEYS.runtimeState]: recoveredState });
  return recoveredState;
}

function getPromotionMatchKey(promotion) {
  const stableId = typeof promotion?.stableId === "string" ? promotion.stableId : "";
  const promoType = typeof promotion?.promoType === "string" ? promotion.promoType : "";
  if (stableId && promoType) {
    return `${stableId}|${promoType}`;
  }
  return "";
}

function dedupePromotions(promotions) {
  const map = new Map();

  for (const promotion of promotions) {
    const id = buildPromotionIdentity(promotion);
    const fingerprint = buildPromotionFingerprint({ ...promotion, id });
    const normalized = { ...promotion, id, fingerprint };
    const existing = map.get(id);
    if (!existing) {
      map.set(id, normalized);
      continue;
    }

    const currentPriority = SOURCE_PRIORITIES[normalized.sourceId] || 0;
    const existingPriority = SOURCE_PRIORITIES[existing.sourceId] || 0;
    if (currentPriority > existingPriority) {
      map.set(id, normalized);
      continue;
    }
    if (currentPriority === existingPriority && normalized.sourceFingerprint.length > existing.sourceFingerprint.length) {
      map.set(id, normalized);
    }
  }

  return Array.from(map.values());
}

function buildSnapshotFingerprint(promotions) {
  return createHash(
    promotions
      .map((promotion) => `${promotion.id}|${promotion.fingerprint}`)
      .sort()
      .join("||")
  );
}

function applyDismissedState(entries, dismissedMap) {
  const dismissedMatchKeys = new Set(
    Object.values(dismissedMap)
      .map((record) => getPromotionMatchKey(record))
      .filter(Boolean)
  );

  return entries.map((entry) => {
    const dismissed = dismissedMap[entry.id];
    const matchKey = getPromotionMatchKey(entry);
    if (dismissed?.fingerprint === entry.fingerprint || (matchKey && dismissedMatchKeys.has(matchKey))) {
      return {
        ...entry,
        status: ENTRY_STATUS.DISMISSED,
        notificationStatus: NOTIFICATION_STATUS.DISMISSED,
        unread: false
      };
    }
    if (entry.status === ENTRY_STATUS.DISMISSED) {
      return {
        ...entry,
        status: entry.lastSeenAt === entry.lastCheckedAt ? ENTRY_STATUS.ACTIVE : ENTRY_STATUS.EXPIRED,
        notificationStatus: entry.notificationStatus === NOTIFICATION_STATUS.DISMISSED
          ? NOTIFICATION_STATUS.PENDING
          : entry.notificationStatus
      };
    }
    return entry;
  });
}

function applyNotificationState(entries, sentPromotions, nowTs, quietHoursActive) {
  const sentIds = new Set(sentPromotions.map((promotion) => promotion.id));
  return entries.map((entry) => {
    if (entry.status !== ENTRY_STATUS.ACTIVE) {
      return entry;
    }
    if (sentIds.has(entry.id)) {
      return {
        ...entry,
        lastNotifiedAt: nowTs,
        notificationStatus: NOTIFICATION_STATUS.SENT
      };
    }
    if (entry.notificationStatus === NOTIFICATION_STATUS.PENDING && quietHoursActive) {
      return {
        ...entry,
        notificationStatus: NOTIFICATION_STATUS.QUIET
      };
    }
    return entry;
  });
}

async function performPromotionCheck(trigger) {
  const nowTs = Date.now();
  const settings = await getSettings();
  await setRuntimeState({
    checkInProgress: true,
    lastCheckStartedAt: nowTs,
    lastCheckOutcome: "running",
    lastErrorMessage: "",
    lastTrigger: trigger
  });

  const [historyEntries, latestEntries, notifiedMap, dismissedMap] = await Promise.all([
    getHistoryEntries(),
    getLatestPromotionEntries(),
    readKey(STORAGE_KEYS.notifiedPromotions, {}),
    readKey(STORAGE_KEYS.dismissedPromotions, {})
  ]);

  try {
    const providerResult = await fetchPromotionsFromProviders(settings);
    if (!providerResult.hadSuccess && providerResult.promotions.length === 0) {
      throw new Error(providerResult.warnings.join(" ") || "No provider returned usable data.");
    }
    const filtered = applyPromotionFilters(dedupePromotions(providerResult.promotions), settings);
    const promotions = filtered.accepted;
    const snapshotFingerprint = buildSnapshotFingerprint(promotions);
    const quietHoursActive = isQuietHoursActive(settings, nowTs);
    const sanitizedDismissedMap = sanitizeDismissedMap(dismissedMap);
    const sanitizedNotifiedMap = sanitizeNotifiedMap(notifiedMap);

    const historyMerge = settings.historyEnabled
      ? mergePromotionEntries(historyEntries, promotions, nowTs, {
        maxItems: MAX_HISTORY_ITEMS,
        retentionDays: settings.historyRetentionDays
      })
      : { entries: historyEntries, newEntries: [] };

    const latestMerge = mergePromotionEntries(latestEntries, promotions, nowTs, {
      maxItems: MAX_LATEST_ITEMS,
      retentionDays: Math.max(settings.historyRetentionDays, 14)
    });

    let nextHistoryEntries = applyDismissedState(historyMerge.entries, sanitizedDismissedMap);
    let nextLatestEntries = buildLatestEntries(applyDismissedState(latestMerge.entries, sanitizedDismissedMap));

    const notificationsToSend = [];
    let pendingQuietCount = 0;

    if (settings.notificationsEnabled) {
      for (const promotion of promotions) {
        if (isPromotionDismissed(promotion, sanitizedDismissedMap)) {
          continue;
        }
        const decision = shouldNotifyPromotion(promotion, sanitizedNotifiedMap, settings, nowTs);
        if (!decision.shouldNotify) {
          continue;
        }
        if (quietHoursActive) {
          pendingQuietCount += 1;
        } else {
          notificationsToSend.push(promotion);
        }
      }
    }

    const sentNotificationIds = quietHoursActive ? [] : await createPromotionNotifications(notificationsToSend);
    const nextNotifiedMap = notificationsToSend.length
      ? markPromotionsNotified(sanitizedNotifiedMap, notificationsToSend, nowTs, settings)
      : sanitizedNotifiedMap;

    nextHistoryEntries = applyNotificationState(nextHistoryEntries, notificationsToSend, nowTs, quietHoursActive);
    nextLatestEntries = buildLatestEntries(applyNotificationState(nextLatestEntries, notificationsToSend, nowTs, quietHoursActive));

    const unreadCount = countUnreadActive(nextLatestEntries);
    const activeFreeToKeepCount = countActivePromotions(nextLatestEntries, PROMO_TYPES.FREE_TO_KEEP);
    const providerSummary = providerResult.warnings.filter(Boolean).join(" ");

    await writeLocal({
      [STORAGE_KEYS.history]: nextHistoryEntries,
      [STORAGE_KEYS.latestPromotions]: nextLatestEntries,
      [STORAGE_KEYS.notifiedPromotions]: nextNotifiedMap,
      [STORAGE_KEYS.dismissedPromotions]: pruneDismissedMap(sanitizedDismissedMap),
      [STORAGE_KEYS.metadataCache]: providerResult.metadataCache
    });

    const runtimeState = await setRuntimeState({
      checkInProgress: false,
      lastCheckFinishedAt: nowTs,
      lastSuccessAt: nowTs,
      lastCheckOutcome: "success",
      lastErrorMessage: "",
      lastProviderSummary: providerSummary,
      unreadCount,
      activeFreeToKeepCount,
      pendingQuietCount,
      backoffLevel: 0,
      lastResultFingerprint: snapshotFingerprint,
      lastResultCount: promotions.length
    });

    return {
      ok: true,
      sentNotificationIds,
      notificationsSent: notificationsToSend.length,
      promotionsFound: promotions.length,
      unreadCount,
      runtimeState,
      providerWarnings: providerResult.warnings
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const currentState = await getRuntimeState();
    const nextBackoffLevel = Math.min((currentState.backoffLevel || 0) + 1, 6);
    const runtimeState = await setRuntimeState({
      checkInProgress: false,
      lastCheckFinishedAt: nowTs,
      lastCheckOutcome: "error",
      lastErrorMessage: message,
      backoffLevel: nextBackoffLevel
    });
    return {
      ok: false,
      error: message,
      runtimeState
    };
  }
}

export async function runPromotionCheck(trigger = "manual") {
  if (activeCheckPromise) {
    return activeCheckPromise;
  }
  activeCheckPromise = performPromotionCheck(trigger).finally(() => {
    activeCheckPromise = null;
  });
  return activeCheckPromise;
}

export async function markAllPromotionsRead() {
  const [historyEntries, latestEntries] = await Promise.all([
    getHistoryEntries(),
    getLatestPromotionEntries()
  ]);

  const nextHistoryEntries = markEntriesRead(historyEntries);
  const nextLatestEntries = buildLatestEntries(markEntriesRead(latestEntries));

  await writeLocal({
    [STORAGE_KEYS.history]: nextHistoryEntries,
    [STORAGE_KEYS.latestPromotions]: nextLatestEntries
  });

  const runtimeState = await setRuntimeState({
    unreadCount: 0,
    activeFreeToKeepCount: countActivePromotions(nextLatestEntries, PROMO_TYPES.FREE_TO_KEEP)
  });
  return { ok: true, runtimeState };
}

export async function dismissPromotionById(promotionId) {
  const nowTs = Date.now();
  const [historyEntries, latestEntries, dismissedMap] = await Promise.all([
    getHistoryEntries(),
    getLatestPromotionEntries(),
    readKey(STORAGE_KEYS.dismissedPromotions, {})
  ]);

  const target = latestEntries.find((entry) => entry.id === promotionId) || historyEntries.find((entry) => entry.id === promotionId);
  if (!target) {
    return { ok: false, error: "Promotion not found." };
  }

  const targetMatchKey = getPromotionMatchKey(target);
  const nextDismissedMap = dismissPromotionRecord(dismissedMap, target, nowTs);
  const nextHistoryEntries = dismissEntry(historyEntries, promotionId, nowTs, targetMatchKey);
  const nextLatestEntries = buildLatestEntries(dismissEntry(latestEntries, promotionId, nowTs, targetMatchKey));
  const unreadCount = countUnreadActive(nextLatestEntries);
  const activeFreeToKeepCount = countActivePromotions(nextLatestEntries, PROMO_TYPES.FREE_TO_KEEP);

  await writeLocal({
    [STORAGE_KEYS.dismissedPromotions]: nextDismissedMap,
    [STORAGE_KEYS.history]: nextHistoryEntries,
    [STORAGE_KEYS.latestPromotions]: nextLatestEntries
  });

  await setRuntimeState({ unreadCount, activeFreeToKeepCount });
  return { ok: true };
}

export async function restorePromotionById(promotionId) {
  const nowTs = Date.now();
  const [historyEntries, latestEntries, dismissedMap, notifiedMap] = await Promise.all([
    getHistoryEntries(),
    getLatestPromotionEntries(),
    readKey(STORAGE_KEYS.dismissedPromotions, {}),
    readKey(STORAGE_KEYS.notifiedPromotions, {})
  ]);

  const sanitizedDismissedMap = sanitizeDismissedMap(dismissedMap);
  const dismissedTarget = sanitizedDismissedMap[promotionId];
  if (!dismissedTarget) {
    return { ok: false, error: "Ignored promotion not found." };
  }

  const sanitizedNotifiedMap = sanitizeNotifiedMap(notifiedMap);
  const targetMatchKey = getPromotionMatchKey(dismissedTarget);
  const nextDismissedMap = restorePromotionRecord(sanitizedDismissedMap, promotionId);
  const nextHistoryEntries = restoreEntry(historyEntries, promotionId, nowTs, sanitizedNotifiedMap, targetMatchKey);
  const nextLatestEntries = buildLatestEntries(restoreEntry(latestEntries, promotionId, nowTs, sanitizedNotifiedMap, targetMatchKey));
  const unreadCount = countUnreadActive(nextLatestEntries);
  const activeFreeToKeepCount = countActivePromotions(nextLatestEntries, PROMO_TYPES.FREE_TO_KEEP);

  await writeLocal({
    [STORAGE_KEYS.dismissedPromotions]: nextDismissedMap,
    [STORAGE_KEYS.history]: nextHistoryEntries,
    [STORAGE_KEYS.latestPromotions]: nextLatestEntries
  });

  await setRuntimeState({ unreadCount, activeFreeToKeepCount });
  return { ok: true };
}

export async function getIgnoredPromotions() {
  const [historyEntries, latestEntries, dismissedMap] = await Promise.all([
    getHistoryEntries(),
    getLatestPromotionEntries(),
    readKey(STORAGE_KEYS.dismissedPromotions, {})
  ]);

  return buildIgnoredPromotionEntries(dismissedMap, latestEntries, historyEntries);
}

export async function clearStoredHistory() {
  await writeLocal({
    [STORAGE_KEYS.history]: [],
    [STORAGE_KEYS.latestPromotions]: []
  });
  await setRuntimeState({ unreadCount: 0, activeFreeToKeepCount: 0, pendingQuietCount: 0 });
  return { ok: true };
}
