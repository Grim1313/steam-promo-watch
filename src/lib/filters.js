import { CONTENT_TYPES, ENTRY_STATUS, NOTIFICATION_STATUS, PROMO_TYPES } from "./constants.js";
import { getContentTypeLabel, getPromotionTypeLabel } from "./utils.js";

export function applyPromotionFilters(promotions, settings) {
  const blockedIds = new Set((settings.filters.blockedAppIds || []).map((value) => Number(value)));
  const blockedKeywords = (settings.filters.blockedKeywords || []).map((value) => String(value).toLowerCase());

  const accepted = [];
  const rejected = [];

  for (const promotion of promotions) {
    const title = String(promotion.title || "").toLowerCase();
    const contentType = promotion.contentType || CONTENT_TYPES.UNKNOWN;
    const numericId = promotion.appId || promotion.packageId || 0;

    let reason = "";
    if (settings.trackFreeToKeep === false && promotion.promoType === PROMO_TYPES.FREE_TO_KEEP) {
      reason = "free-to-keep-disabled";
    } else if (settings.filters.ignoreDlc && contentType === CONTENT_TYPES.DLC) {
      reason = "dlc-filter";
    } else if (settings.filters.ignoreSoundtracks && contentType === CONTENT_TYPES.SOUNDTRACK) {
      reason = "soundtrack-filter";
    } else if (settings.filters.ignoreDemos && contentType === CONTENT_TYPES.DEMO) {
      reason = "demo-filter";
    } else if (settings.filters.ignoreTools && contentType === CONTENT_TYPES.TOOL) {
      reason = "tool-filter";
    } else if (settings.filters.ignorePackages && contentType === CONTENT_TYPES.PACKAGE) {
      reason = "package-filter";
    } else if (blockedIds.has(numericId)) {
      reason = "id-blocklist";
    } else if (blockedKeywords.some((keyword) => title.includes(keyword))) {
      reason = "keyword-blocklist";
    } else if (promotion.promoType === PROMO_TYPES.FREE_TO_KEEP && promotion.isLikelyFreeToKeep === false) {
      reason = "not-confirmed-free-to-keep";
    }

    if (reason) {
      rejected.push({ promotion, reason });
    } else {
      accepted.push(promotion);
    }
  }

  return { accepted, rejected };
}

export function getStatusLabel(status, notificationStatus) {
  if (status === ENTRY_STATUS.DISMISSED || notificationStatus === NOTIFICATION_STATUS.DISMISSED) {
    return "Ignored";
  }
  if (notificationStatus === NOTIFICATION_STATUS.QUIET) {
    return "Queued by quiet hours";
  }
  if (notificationStatus === NOTIFICATION_STATUS.SENT) {
    return "Notified";
  }
  if (status === ENTRY_STATUS.EXPIRED) {
    return "Ended";
  }
  return "New";
}

export { getContentTypeLabel, getPromotionTypeLabel };
