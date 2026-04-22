import { getContentTypeLabel, getPromotionTypeLabel } from "../lib/filters.js";
import { formatDateTime, formatRelativeTime, getPromotionImageUrl } from "../lib/utils.js";
import { getPopupStatusText, getVisiblePromotions } from "./popup-state.js";
import { buildSteamStoreAriaLabel, createSteamReviewBadge } from "./review-badge.js";

const RELEASES_URL = "https://github.com/Grim1313/steam-promo-watch/releases/latest";
const checkNowButton = document.querySelector("#check-now");
const statusText = document.querySelector("#status-text");
const lastSuccess = document.querySelector("#last-success");
const nextCheck = document.querySelector("#next-check");
const warningBox = document.querySelector("#warning-box");
const emptyState = document.querySelector("#empty-state");
const promotionList = document.querySelector("#promotion-list");
const promotionsHeading = document.querySelector("#promotions-heading");
const unreadPill = document.querySelector("#unread-pill");
const historyLink = document.querySelector("#open-history");
const optionsLink = document.querySelector("#open-options");
const appVersion = document.querySelector("#app-version");
const checkUpdatesLink = document.querySelector("#check-updates");

appVersion.textContent = `Version ${chrome.runtime.getManifest().version}`;
checkUpdatesLink.href = RELEASES_URL;

async function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function renderWarning(text) {
  warningBox.textContent = text || "";
  warningBox.classList.toggle("hidden", !text);
}

function renderPromotions(entries) {
  const visibleEntries = getVisiblePromotions(entries);

  promotionList.textContent = "";
  emptyState.classList.toggle("hidden", visibleEntries.length > 0);
  promotionsHeading.textContent = `Latest promotions (${visibleEntries.length})`;

  for (const entry of visibleEntries) {
    const item = document.createElement("li");
    item.className = "promotion-item";

    const imageUrl = getPromotionImageUrl(entry);
    if (imageUrl) {
      const mediaLink = document.createElement("a");
      mediaLink.className = "promotion-media";
      mediaLink.href = entry.url;
      mediaLink.target = "_blank";
      mediaLink.rel = "noreferrer";
      mediaLink.setAttribute("aria-label", buildSteamStoreAriaLabel(entry.title, entry));

      const image = document.createElement("img");
      image.className = "promotion-image";
      image.src = imageUrl;
      image.alt = `${entry.title} artwork`;
      image.loading = "lazy";

      mediaLink.append(image);
      const reviewBadge = createSteamReviewBadge(entry);
      if (reviewBadge) {
        mediaLink.append(reviewBadge);
      }
      item.append(mediaLink);
    }

    const head = document.createElement("div");
    head.className = "promotion-head";

    const title = document.createElement("a");
    title.className = "promotion-title";
    title.href = entry.url;
    title.target = "_blank";
    title.rel = "noreferrer";
    title.textContent = entry.title;

    const dismiss = document.createElement("button");
    dismiss.className = "ghost-button";
    dismiss.type = "button";
    dismiss.textContent = "Ignore";
    dismiss.addEventListener("click", async () => {
      dismiss.disabled = true;
      const response = await sendMessage("DISMISS_PROMOTION", { id: entry.id });
      if (!response?.ok) {
        dismiss.disabled = false;
        renderWarning(response?.error || "Failed to ignore promotion.");
        return;
      }
      await refresh("Promotion ignored. Restore it from Settings > Ignored promotions.");
    });

    head.append(title, dismiss);

    const meta = document.createElement("div");
    meta.className = "promotion-meta";

    const stack = document.createElement("div");
    stack.className = "meta-stack";

    const tags = document.createElement("div");
    tags.className = "meta-tags";

    const promoTag = document.createElement("span");
    promoTag.className = "tag";
    promoTag.textContent = getPromotionTypeLabel(entry.promoType);

    const contentTag = document.createElement("span");
    contentTag.className = "tag";
    contentTag.textContent = getContentTypeLabel(entry.contentType);

    tags.append(promoTag, contentTag);

    const seenLine = document.createElement("div");
    seenLine.className = "meta-line";
    seenLine.textContent = `Seen ${formatRelativeTime(entry.firstSeenAt)}`;

    const endLine = document.createElement("div");
    endLine.className = "meta-line";
    endLine.textContent = entry.endsAt ? `Ends ${formatDateTime(entry.endsAt)}` : `Last checked ${formatDateTime(entry.lastCheckedAt)}`;

    stack.append(tags, seenLine, endLine);
    meta.append(stack);

    item.append(head, meta);
    promotionList.append(item);
  }
}

function renderStatus(runtimeState) {
  statusText.textContent = getPopupStatusText(runtimeState);
  lastSuccess.textContent = formatDateTime(runtimeState.lastSuccessAt);
  nextCheck.textContent = runtimeState.nextCheckAt ? `${formatDateTime(runtimeState.nextCheckAt)} (${formatRelativeTime(runtimeState.nextCheckAt)})` : "Not scheduled";
  checkNowButton.disabled = runtimeState.checkInProgress;
}

async function refresh(temporaryWarning = "") {
  const response = await sendMessage("GET_POPUP_DATA");
  if (!response?.ok) {
    renderWarning(response?.error || "Unable to load popup data.");
    return;
  }

  renderStatus(response.runtimeState);
  renderPromotions(response.latestPromotions || []);

  const warning = temporaryWarning || response.runtimeState.lastErrorMessage || response.runtimeState.lastProviderSummary;
  renderWarning(warning);

  const unreadCount = Number(response.runtimeState.unreadCount) || 0;
  unreadPill.textContent = `${unreadCount} new`;
  unreadPill.classList.toggle("hidden", unreadCount === 0);

  if (unreadCount > 0) {
    await sendMessage("MARK_ALL_READ");
  }
}

checkNowButton.addEventListener("click", async () => {
  checkNowButton.disabled = true;
  statusText.textContent = "Checking now...";
  try {
    const response = await sendMessage("CHECK_NOW");
    if (!response?.ok) {
      renderWarning(response?.error || "Manual check failed.");
    }
  } catch (error) {
    renderWarning(error instanceof Error ? error.message : "Manual check failed.");
  } finally {
    try {
      await refresh();
    } catch (error) {
      checkNowButton.disabled = false;
      renderWarning(error instanceof Error ? error.message : String(error));
    }
  }
});

optionsLink.addEventListener("click", async (event) => {
  event.preventDefault();
  await chrome.runtime.openOptionsPage();
});

historyLink.addEventListener("click", async (event) => {
  event.preventDefault();
  await chrome.tabs.create({ url: chrome.runtime.getURL("src/ui/history.html") });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }
  if (changes.runtimeState || changes.latestPromotions) {
    refresh().catch(() => undefined);
  }
});

refresh().catch((error) => {
  renderWarning(error instanceof Error ? error.message : String(error));
});
