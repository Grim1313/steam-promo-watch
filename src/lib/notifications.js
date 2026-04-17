import {
  APP_NAME,
  MAX_NOTIFICATION_LINKS,
  MAX_NOTIFICATIONS_PER_BATCH,
  NOTIFICATION_LINK_TTL_MS,
  NOTIFICATION_PREFIX,
  STORAGE_KEYS
} from "./constants.js";
import { readKey, writeLocal } from "./storage.js";
import {
  buildSteamHeaderImageUrl,
  buildSteamUrlFromStableId,
  formatSteamReviewNotificationSummary,
  getPromotionImageUrl,
  sanitizeSteamUrl
} from "./utils.js";
import { getPromotionTypeLabel } from "./filters.js";

function getNotificationIconUrl() {
  return chrome.runtime.getURL("resources/icons/icon128.png");
}

function sanitizeNotificationLinks(raw = {}) {
  const source = typeof raw === "object" && raw ? raw : {};
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (!key || typeof value !== "object" || !value) {
      continue;
    }
    result[key] = {
      url: sanitizeSteamUrl(value.url),
      createdAt: Number(value.createdAt) || 0
    };
  }
  return result;
}

async function getNotificationLinks() {
  const stored = await readKey(STORAGE_KEYS.notificationLinks, {});
  return sanitizeNotificationLinks(stored);
}

function pruneNotificationLinks(links, nowTs) {
  const entries = Object.entries(sanitizeNotificationLinks(links))
    .filter(([, value]) => (nowTs - value.createdAt) <= NOTIFICATION_LINK_TTL_MS)
    .sort((left, right) => right[1].createdAt - left[1].createdAt)
    .slice(0, MAX_NOTIFICATION_LINKS);

  return Object.fromEntries(entries);
}

export async function createPromotionNotifications(promotions) {
  const nowTs = Date.now();
  const limited = promotions.slice(0, MAX_NOTIFICATIONS_PER_BATCH);
  const notificationLinks = await getNotificationLinks();
  const createdIds = [];

  for (const promotion of limited) {
    const notificationId = `${NOTIFICATION_PREFIX}:${promotion.id}:${nowTs}`;
    const imageUrl = getPromotionImageUrl(promotion, { preferScreenshot: false });
    const reviewSummary = formatSteamReviewNotificationSummary(promotion);
    const options = {
      type: imageUrl ? "image" : "basic",
      iconUrl: getNotificationIconUrl(),
      title: promotion.title,
      message: `${getPromotionTypeLabel(promotion.promoType)} on Steam`,
      priority: 0,
      silent: false
    };

    if (imageUrl) {
      options.imageUrl = imageUrl;
    }
    if (reviewSummary) {
      options.contextMessage = reviewSummary;
    }

    await chrome.notifications.create(notificationId, options);

    notificationLinks[notificationId] = {
      url: sanitizeSteamUrl(promotion.url || buildSteamUrlFromStableId(promotion.stableId)),
      createdAt: nowTs
    };
    createdIds.push(notificationId);
  }

  if (promotions.length > MAX_NOTIFICATIONS_PER_BATCH) {
    const remainder = promotions.length - MAX_NOTIFICATIONS_PER_BATCH;
    const notificationId = `${NOTIFICATION_PREFIX}:summary:${nowTs}`;
    await chrome.notifications.create(notificationId, {
      type: "basic",
      iconUrl: getNotificationIconUrl(),
      title: APP_NAME,
      message: `And ${remainder} more new promotions.`,
      priority: 0,
      silent: false
    });
    notificationLinks[notificationId] = {
      url: "https://store.steampowered.com/",
      createdAt: nowTs
    };
    createdIds.push(notificationId);
  }

  await writeLocal({
    [STORAGE_KEYS.notificationLinks]: pruneNotificationLinks(notificationLinks, nowTs)
  });

  return createdIds;
}

export async function openNotificationTarget(notificationId) {
  const links = await getNotificationLinks();
  const target = links[notificationId];
  const url = target?.url || "https://store.steampowered.com/";
  await chrome.tabs.create({ url });
}

export async function clearNotificationTarget(notificationId) {
  const links = await getNotificationLinks();
  delete links[notificationId];
  await writeLocal({
    [STORAGE_KEYS.notificationLinks]: pruneNotificationLinks(links, Date.now())
  });
}

export async function sendTestNotification() {
  const promotion = {
    id: "test-notification",
    stableId: "app:599140",
    appId: 599140,
    title: "Test notification: Graveyard Keeper",
    promoType: "free-to-keep",
    reviewScore: 8,
    reviewScoreDesc: "Very Positive",
    reviewPositive: 42320,
    reviewNegative: 7033,
    reviewTotal: 49353,
    reviewPercent: 86,
    headerImage: buildSteamHeaderImageUrl(599140),
    capsuleImage: "",
    screenshotThumbnail: "",
    screenshotFull: "",
    url: "https://store.steampowered.com/app/599140/Graveyard_Keeper/"
  };
  await createPromotionNotifications([promotion]);
}
