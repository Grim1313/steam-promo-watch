import { CHECK_ALARM_NAME } from "./constants.js";
import { setRuntimeState } from "./runtime-state.js";
import { computeBackoffMs, minutesToMs } from "./utils.js";

export async function getCheckAlarm() {
  return chrome.alarms.get(CHECK_ALARM_NAME);
}

export async function scheduleCheckAt(whenMs) {
  await chrome.alarms.clear(CHECK_ALARM_NAME);
  await chrome.alarms.create(CHECK_ALARM_NAME, { when: whenMs });
  await setRuntimeState({ nextCheckAt: whenMs });
  return whenMs;
}

export async function scheduleCheckIn(delayMs) {
  const whenMs = Date.now() + Math.max(delayMs, 30 * 1000);
  return scheduleCheckAt(whenMs);
}

export async function ensureCheckAlarm(settings) {
  const existing = await getCheckAlarm();
  if (existing?.scheduledTime) {
    await setRuntimeState({ nextCheckAt: existing.scheduledTime });
    return existing.scheduledTime;
  }
  return scheduleCheckIn(minutesToMs(settings.checkIntervalMinutes));
}

export async function resetCheckAlarm(settings) {
  return scheduleCheckIn(minutesToMs(settings.checkIntervalMinutes));
}

export async function scheduleAfterError(settings, backoffLevel) {
  return scheduleCheckIn(computeBackoffMs(settings.checkIntervalMinutes, backoffLevel));
}

export async function scheduleAfterSuccess(settings) {
  return scheduleCheckIn(minutesToMs(settings.checkIntervalMinutes));
}
