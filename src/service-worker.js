import { CHECK_ALARM_NAME, PROMO_TYPES, STORAGE_KEYS } from "./lib/constants.js";
import { updateBadge } from "./lib/badge.js";
import { countActivePromotions, countUnreadActive, getLatestPromotionEntries, getHistoryEntries } from "./lib/history.js";
import { clearNotificationTarget, openNotificationTarget, sendTestNotification } from "./lib/notifications.js";
import {
  clearStoredHistory,
  dismissPromotionById,
  markAllPromotionsRead,
  runPromotionCheck
} from "./lib/promotions.js";
import { getRuntimeState, setRuntimeState } from "./lib/runtime-state.js";
import { getSettings, resetSettings, saveSettings } from "./lib/settings.js";
import { ensureSchemaVersion, writeLocal } from "./lib/storage.js";
import {
  ensureCheckAlarm,
  resetCheckAlarm,
  scheduleAfterError,
  scheduleAfterSuccess
} from "./lib/scheduler.js";

async function bootstrap() {
  await ensureSchemaVersion();
  const settings = await getSettings();
  const runtimeState = await getRuntimeState();

  const [historyEntries, latestPromotions] = await Promise.all([
    getHistoryEntries(),
    getLatestPromotionEntries()
  ]);

  const derivedRuntimePatch = {
    unreadCount: countUnreadActive(latestPromotions),
    activeFreeToKeepCount: countActivePromotions(latestPromotions, PROMO_TYPES.FREE_TO_KEEP)
  };
  const normalizedRuntimeState = (
    runtimeState.unreadCount === derivedRuntimePatch.unreadCount &&
    runtimeState.activeFreeToKeepCount === derivedRuntimePatch.activeFreeToKeepCount
  )
    ? runtimeState
    : await setRuntimeState(derivedRuntimePatch);

  await writeLocal({
    [STORAGE_KEYS.settings]: settings,
    [STORAGE_KEYS.runtimeState]: normalizedRuntimeState,
    [STORAGE_KEYS.history]: historyEntries,
    [STORAGE_KEYS.latestPromotions]: latestPromotions
  });

  await ensureCheckAlarm(settings);
  await updateBadge(normalizedRuntimeState, settings);
}

async function finalizeCheck(result, trigger) {
  const settings = await getSettings();
  if (result.ok) {
    if (trigger !== "manual") {
      await scheduleAfterSuccess(settings);
    } else {
      await ensureCheckAlarm(settings);
    }
  } else {
    await scheduleAfterError(settings, result.runtimeState.backoffLevel || 1);
  }

  const runtimeState = await getRuntimeState();
  await updateBadge(runtimeState, settings);
  return result;
}

async function runAndReschedule(trigger) {
  const result = await runPromotionCheck(trigger);
  return finalizeCheck(result, trigger);
}

async function getPopupData() {
  const [settings, runtimeState, latestPromotions] = await Promise.all([
    getSettings(),
    getRuntimeState(),
    getLatestPromotionEntries()
  ]);
  return {
    ok: true,
    settings,
    runtimeState,
    latestPromotions
  };
}

async function getOptionsData() {
  const [settings, runtimeState] = await Promise.all([
    getSettings(),
    getRuntimeState()
  ]);
  return {
    ok: true,
    settings,
    runtimeState
  };
}

async function getHistoryData() {
  const [settings, runtimeState, historyEntries, latestPromotions] = await Promise.all([
    getSettings(),
    getRuntimeState(),
    getHistoryEntries(),
    getLatestPromotionEntries()
  ]);

  return {
    ok: true,
    settings,
    runtimeState,
    historyEntries,
    latestPromotions
  };
}

async function saveSettingsAndReschedule(payload) {
  const settings = await saveSettings(payload);
  await resetCheckAlarm(settings);
  const runtimeState = await getRuntimeState();
  await updateBadge(runtimeState, settings);
  return { ok: true, settings };
}

chrome.runtime.onInstalled.addListener(() => {
  bootstrap()
    .then(() => runAndReschedule("install"))
    .catch(async (error) => {
      await setRuntimeState({
        checkInProgress: false,
        lastCheckOutcome: "error",
        lastErrorMessage: error instanceof Error ? error.message : String(error)
      });
    });
});

chrome.runtime.onStartup.addListener(() => {
  bootstrap().catch(() => undefined);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== CHECK_ALARM_NAME) {
    return;
  }
  runAndReschedule("scheduled").catch(() => undefined);
});

chrome.notifications.onClicked.addListener((notificationId) => {
  openNotificationTarget(notificationId)
    .then(() => chrome.notifications.clear(notificationId))
    .then(() => clearNotificationTarget(notificationId))
    .catch(() => undefined);
});

chrome.notifications.onClosed.addListener((notificationId) => {
  clearNotificationTarget(notificationId).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "GET_POPUP_DATA":
        return getPopupData();
      case "GET_OPTIONS_DATA":
        return getOptionsData();
      case "GET_HISTORY_DATA":
        return getHistoryData();
      case "CHECK_NOW":
        return runAndReschedule("manual");
      case "MARK_ALL_READ": {
        const result = await markAllPromotionsRead();
        const settings = await getSettings();
        await updateBadge(result.runtimeState, settings);
        return result;
      }
      case "DISMISS_PROMOTION": {
        const result = await dismissPromotionById(message.id);
        const [settings, runtimeState] = await Promise.all([getSettings(), getRuntimeState()]);
        await updateBadge(runtimeState, settings);
        return result;
      }
      case "SAVE_SETTINGS":
        return saveSettingsAndReschedule(message.settings || {});
      case "CLEAR_HISTORY": {
        const result = await clearStoredHistory();
        const settings = await getSettings();
        await updateBadge({ unreadCount: 0, activeFreeToKeepCount: 0 }, settings);
        return result;
      }
      case "RESET_SETTINGS": {
        const settings = await resetSettings();
        await resetCheckAlarm(settings);
        const runtimeState = await getRuntimeState();
        await updateBadge(runtimeState, settings);
        return { ok: true, settings };
      }
      case "TEST_NOTIFICATION":
        await sendTestNotification();
        return { ok: true };
      default:
        return { ok: false, error: "Unknown message type." };
    }
  })()
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});
