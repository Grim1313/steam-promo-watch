import { getContentTypeLabel, getPromotionTypeLabel } from "../lib/filters.js";
import { formatDateTime } from "../lib/utils.js";

const form = document.querySelector("#settings-form");
const statusLine = document.querySelector("#form-status");
const testButton = document.querySelector("#test-notification");
const clearHistoryButton = document.querySelector("#clear-history");
const resetSettingsButton = document.querySelector("#reset-settings");
const ignoredNote = document.querySelector("#ignored-promotions-note");
const ignoredEmpty = document.querySelector("#ignored-promotions-empty");
const ignoredList = document.querySelector("#ignored-promotions-list");
const appVersion = document.querySelector("#app-version");
const STATUS_VARIANTS = Object.freeze({
  neutral: "neutral",
  success: "success",
  error: "error"
});
const STATUS_CLASS_NAMES = ["status-success", "status-error"];

appVersion.textContent = `Version ${chrome.runtime.getManifest().version}`;

const fieldIds = [
  "notificationsEnabled",
  "trackFreeToKeep",
  "checkIntervalMinutes",
  "quietHoursEnabled",
  "quietHoursStart",
  "quietHoursEnd",
  "badgeEnabled",
  "historyEnabled",
  "historyRetentionDays",
  "notifiedRetentionDays",
  "renotifyAfterRetention",
  "ignoreDlc",
  "ignoreSoundtracks",
  "ignoreDemos",
  "ignoreTools",
  "ignorePackages",
  "blockedAppIds",
  "blockedKeywords"
];

function field(id) {
  return document.getElementById(id);
}

async function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function setStatus(message, variant = STATUS_VARIANTS.neutral) {
  statusLine.textContent = message;
  statusLine.classList.remove(...STATUS_CLASS_NAMES);
  if (variant === STATUS_VARIANTS.success) {
    statusLine.classList.add("status-success");
  } else if (variant === STATUS_VARIANTS.error) {
    statusLine.classList.add("status-error");
  }
}

function fillForm(settings) {
  field("notificationsEnabled").checked = settings.notificationsEnabled;
  field("trackFreeToKeep").checked = settings.trackFreeToKeep;
  field("checkIntervalMinutes").value = String(settings.checkIntervalMinutes);
  field("quietHoursEnabled").checked = settings.quietHoursEnabled;
  field("quietHoursStart").value = settings.quietHoursStart;
  field("quietHoursEnd").value = settings.quietHoursEnd;
  field("badgeEnabled").checked = settings.badgeEnabled;
  field("historyEnabled").checked = settings.historyEnabled;
  field("historyRetentionDays").value = String(settings.historyRetentionDays);
  field("notifiedRetentionDays").value = String(settings.notifiedRetentionDays);
  field("renotifyAfterRetention").checked = settings.renotifyAfterRetention;
  field("ignoreDlc").checked = settings.filters.ignoreDlc;
  field("ignoreSoundtracks").checked = settings.filters.ignoreSoundtracks;
  field("ignoreDemos").checked = settings.filters.ignoreDemos;
  field("ignoreTools").checked = settings.filters.ignoreTools;
  field("ignorePackages").checked = settings.filters.ignorePackages;
  field("blockedAppIds").value = settings.filters.blockedAppIds.join("\n");
  field("blockedKeywords").value = settings.filters.blockedKeywords.join("\n");
}

function renderIgnoredPromotions(entries) {
  const ignoredEntries = Array.isArray(entries) ? entries : [];
  ignoredList.textContent = "";
  ignoredList.classList.toggle("hidden", ignoredEntries.length === 0);
  ignoredEmpty.classList.toggle("hidden", ignoredEntries.length > 0);
  ignoredNote.textContent = ignoredEntries.length > 0
    ? `${ignoredEntries.length} promotion(s) are currently ignored. Restore any title to make it visible again.`
    : "Ignored titles stay here until you restore them.";

  for (const entry of ignoredEntries) {
    const item = document.createElement("article");
    item.className = "ignored-item";

    const copy = document.createElement("div");
    copy.className = "ignored-copy";

    const title = document.createElement("a");
    title.className = "ignored-title";
    title.href = entry.url;
    title.target = "_blank";
    title.rel = "noreferrer";
    title.textContent = entry.title;

    const meta = document.createElement("div");
    meta.className = "ignored-meta";
    meta.textContent = `${getPromotionTypeLabel(entry.promoType)} • ${getContentTypeLabel(entry.contentType)} • Ignored ${formatDateTime(entry.dismissedAt)}`;

    const actions = document.createElement("div");
    actions.className = "ignored-actions";

    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.className = "secondary-button";
    restoreButton.textContent = "Restore";
    restoreButton.addEventListener("click", async () => {
      restoreButton.disabled = true;
      setStatus(`Restoring ${entry.title}...`);
      try {
        const response = await sendMessage("RESTORE_PROMOTION", { id: entry.id });
        if (!response?.ok) {
          setStatus(response?.error || "Failed to restore promotion.", STATUS_VARIANTS.error);
          restoreButton.disabled = false;
          return;
        }

        renderIgnoredPromotions(ignoredEntries.filter((ignoredEntry) => ignoredEntry.id !== entry.id));
        setStatus(`${entry.title} restored.`, STATUS_VARIANTS.success);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to restore promotion.", STATUS_VARIANTS.error);
        restoreButton.disabled = false;
      }
    });

    const openLink = document.createElement("a");
    openLink.className = "secondary-button";
    openLink.href = entry.url;
    openLink.target = "_blank";
    openLink.rel = "noreferrer";
    openLink.textContent = "Open on Steam";

    actions.append(restoreButton, openLink);
    copy.append(title, meta, actions);
    item.append(copy);
    ignoredList.append(item);
  }
}

function collectSettings() {
  return {
    notificationsEnabled: field("notificationsEnabled").checked,
    trackFreeToKeep: field("trackFreeToKeep").checked,
    checkIntervalMinutes: Number(field("checkIntervalMinutes").value),
    quietHoursEnabled: field("quietHoursEnabled").checked,
    quietHoursStart: field("quietHoursStart").value,
    quietHoursEnd: field("quietHoursEnd").value,
    badgeEnabled: field("badgeEnabled").checked,
    historyEnabled: field("historyEnabled").checked,
    historyRetentionDays: Number(field("historyRetentionDays").value),
    notifiedRetentionDays: Number(field("notifiedRetentionDays").value),
    renotifyAfterRetention: field("renotifyAfterRetention").checked,
    filters: {
      ignoreDlc: field("ignoreDlc").checked,
      ignoreSoundtracks: field("ignoreSoundtracks").checked,
      ignoreDemos: field("ignoreDemos").checked,
      ignoreTools: field("ignoreTools").checked,
      ignorePackages: field("ignorePackages").checked,
      blockedAppIds: field("blockedAppIds").value,
      blockedKeywords: field("blockedKeywords").value
    }
  };
}

async function loadSettings() {
  const response = await sendMessage("GET_OPTIONS_DATA");
  if (!response?.ok) {
    setStatus(response?.error || "Unable to load settings.", STATUS_VARIANTS.error);
    return;
  }
  fillForm(response.settings);
  renderIgnoredPromotions(response.ignoredPromotions || []);
  setStatus(
    response.runtimeState.lastErrorMessage || "Settings loaded.",
    response.runtimeState.lastErrorMessage ? STATUS_VARIANTS.error : STATUS_VARIANTS.success
  );
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Saving settings...");
  try {
    const response = await sendMessage("SAVE_SETTINGS", { settings: collectSettings() });
    if (!response?.ok) {
      setStatus(response?.error || "Failed to save settings.", STATUS_VARIANTS.error);
      return;
    }
    fillForm(response.settings);
    setStatus("Settings saved.", STATUS_VARIANTS.success);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to save settings.", STATUS_VARIANTS.error);
  }
});

testButton.addEventListener("click", async () => {
  setStatus("Sending test notification...");
  try {
    const response = await sendMessage("TEST_NOTIFICATION");
    setStatus(
      response?.ok ? "Test notification sent." : (response?.error || "Test notification failed."),
      response?.ok ? STATUS_VARIANTS.success : STATUS_VARIANTS.error
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Test notification failed.", STATUS_VARIANTS.error);
  }
});

clearHistoryButton.addEventListener("click", async () => {
  if (!window.confirm("Clear all stored promotion history? This action cannot be undone.")) {
    setStatus("Clear history canceled.");
    return;
  }

  setStatus("Clearing stored history...");
  try {
    const response = await sendMessage("CLEAR_HISTORY");
    setStatus(
      response?.ok ? "History cleared." : (response?.error || "Failed to clear history."),
      response?.ok ? STATUS_VARIANTS.success : STATUS_VARIANTS.error
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to clear history.", STATUS_VARIANTS.error);
  }
});

resetSettingsButton.addEventListener("click", async () => {
  if (!window.confirm("Reset all settings to defaults? This action cannot be undone.")) {
    setStatus("Reset settings canceled.");
    return;
  }

  setStatus("Resetting settings...");
  try {
    const response = await sendMessage("RESET_SETTINGS");
    if (!response?.ok) {
      setStatus(response?.error || "Failed to reset settings.", STATUS_VARIANTS.error);
      return;
    }
    fillForm(response.settings);
    setStatus("Settings reset to defaults.", STATUS_VARIANTS.success);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to reset settings.", STATUS_VARIANTS.error);
  }
});

for (const id of fieldIds) {
  field(id).addEventListener("input", () => {
    setStatus("Unsaved changes.");
  });
}

loadSettings().catch((error) => {
  setStatus(error instanceof Error ? error.message : String(error), STATUS_VARIANTS.error);
});
