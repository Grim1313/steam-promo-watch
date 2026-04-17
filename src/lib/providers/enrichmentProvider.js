import {
  CONTENT_TYPES,
  MAX_METADATA_ITEMS,
  METADATA_TTL_MS,
  SOURCE_IDS,
  STORAGE_KEYS
} from "../constants.js";
import { readKey } from "../storage.js";
import {
  chunkArray,
  fetchJsonWithTimeout,
  safeNumber,
  sanitizeSteamAssetUrl,
  sanitizeSteamReviewSummary,
  titleLooksLikeSoundtrack
} from "../utils.js";

const APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails";
const APP_REVIEWS_URL = "https://store.steampowered.com/appreviews";

export function sanitizeMetadataCache(raw = {}) {
  const source = typeof raw === "object" && raw ? raw : {};
  const result = {};

  for (const [key, value] of Object.entries(source)) {
    if (!key || typeof value !== "object" || !value) {
      continue;
    }
    result[key] = {
      title: typeof value.title === "string" ? value.title : "",
      type: typeof value.type === "string" ? value.type : "",
      genres: Array.isArray(value.genres) ? value.genres.map(String) : [],
      categories: Array.isArray(value.categories) ? value.categories.map(String) : [],
      headerImage: sanitizeSteamAssetUrl(value.headerImage),
      capsuleImage: sanitizeSteamAssetUrl(value.capsuleImage),
      screenshotThumbnail: sanitizeSteamAssetUrl(value.screenshotThumbnail),
      screenshotFull: sanitizeSteamAssetUrl(value.screenshotFull),
      priceInitial: safeNumber(value.priceInitial, 0),
      priceFinal: safeNumber(value.priceFinal, 0),
      ...sanitizeSteamReviewSummary(value),
      reviewUpdatedAt: safeNumber(value.reviewUpdatedAt, 0),
      updatedAt: safeNumber(value.updatedAt, 0)
    };
  }

  return result;
}

export async function getMetadataCache() {
  const stored = await readKey(STORAGE_KEYS.metadataCache, {});
  return sanitizeMetadataCache(stored);
}

export function pruneMetadataCache(cache, nowTs) {
  const entries = Object.entries(sanitizeMetadataCache(cache))
    .filter(([, value]) => value.updatedAt && (nowTs - value.updatedAt) <= METADATA_TTL_MS)
    .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    .slice(0, MAX_METADATA_ITEMS);

  return Object.fromEntries(entries);
}

async function fetchMissingMetadata(cache, appIds) {
  const nowTs = Date.now();
  const next = { ...sanitizeMetadataCache(cache) };
  const freshIds = [];

  for (const appId of appIds) {
    const key = `app:${appId}`;
    const entry = next[key];
    const metadataFresh = entry && (nowTs - entry.updatedAt) < METADATA_TTL_MS;
    const reviewsFresh = entry && entry.reviewUpdatedAt && (nowTs - entry.reviewUpdatedAt) < METADATA_TTL_MS;
    if (metadataFresh && reviewsFresh) {
      continue;
    }
    freshIds.push(appId);
  }

  // Steam currently returns HTTP 400 for batched appdetails requests with multiple appids.
  for (const batch of chunkArray(freshIds, 5)) {
    const responses = await Promise.all(batch.map(async (appId) => {
      const detailsUrl = `${APP_DETAILS_URL}?appids=${appId}&l=english&filters=basic,screenshots,price_overview,genres,categories`;
      const reviewsUrl = `${APP_REVIEWS_URL}/${appId}?json=1&language=all&review_type=all&purchase_type=steam&filter=recent&cursor=*&num_per_page=1`;

      const [detailsResponse, reviewsResponse] = await Promise.all([
        fetchJsonWithTimeout(detailsUrl).catch(() => null),
        fetchJsonWithTimeout(reviewsUrl).catch(() => null)
      ]);

      return {
        appId,
        detailsPayload: detailsResponse?.[appId],
        reviewsPayload: reviewsResponse?.query_summary || null,
        hadReviewsResponse: Boolean(reviewsResponse && typeof reviewsResponse === "object")
      };
    }));

    for (const { appId, detailsPayload, reviewsPayload, hadReviewsResponse } of responses) {
      const existing = next[`app:${appId}`] || {};
      const data = detailsPayload?.success && detailsPayload.data ? detailsPayload.data : null;
      const reviewSummary = sanitizeSteamReviewSummary(reviewsPayload);

      if (!data && !existing.updatedAt && reviewSummary.reviewTotal <= 0) {
        continue;
      }

      next[`app:${appId}`] = {
        ...existing,
        title: typeof data?.name === "string" ? data.name : (existing.title || ""),
        type: typeof data?.type === "string" ? data.type : (existing.type || ""),
        genres: Array.isArray(data?.genres) ? data.genres.map((genre) => String(genre?.description || "")) : (existing.genres || []),
        categories: Array.isArray(data?.categories) ? data.categories.map((category) => String(category?.description || "")) : (existing.categories || []),
        headerImage: data ? sanitizeSteamAssetUrl(data.header_image) : (existing.headerImage || ""),
        capsuleImage: data ? sanitizeSteamAssetUrl(data.capsule_image) : (existing.capsuleImage || ""),
        screenshotThumbnail: data ? sanitizeSteamAssetUrl(data.screenshots?.[0]?.path_thumbnail) : (existing.screenshotThumbnail || ""),
        screenshotFull: data ? sanitizeSteamAssetUrl(data.screenshots?.[0]?.path_full) : (existing.screenshotFull || ""),
        priceInitial: data ? safeNumber(data.price_overview?.initial, 0) : safeNumber(existing.priceInitial, 0),
        priceFinal: data ? safeNumber(data.price_overview?.final, 0) : safeNumber(existing.priceFinal, 0),
        reviewScore: reviewSummary.reviewScore || safeNumber(existing.reviewScore, 0),
        reviewScoreDesc: reviewSummary.reviewScoreDesc || existing.reviewScoreDesc || "",
        reviewPositive: reviewSummary.reviewPositive || safeNumber(existing.reviewPositive, 0),
        reviewNegative: reviewSummary.reviewNegative || safeNumber(existing.reviewNegative, 0),
        reviewTotal: reviewSummary.reviewTotal || safeNumber(existing.reviewTotal, 0),
        reviewPercent: reviewSummary.reviewTotal > 0
          ? reviewSummary.reviewPercent
          : safeNumber(existing.reviewPercent, 0),
        reviewUpdatedAt: hadReviewsResponse ? nowTs : safeNumber(existing.reviewUpdatedAt, 0),
        updatedAt: nowTs
      };
    }
  }

  return pruneMetadataCache(next, nowTs);
}

function inferContentType(promotion, metadataCache) {
  if (promotion.stableId.startsWith("sub:")) {
    return CONTENT_TYPES.PACKAGE;
  }

  const metadata = metadataCache[promotion.stableId];
  const title = promotion.title || metadata?.title || "";

  if (titleLooksLikeSoundtrack(title)) {
    return CONTENT_TYPES.SOUNDTRACK;
  }

  switch (metadata?.type) {
    case "dlc":
      return CONTENT_TYPES.DLC;
    case "demo":
      return CONTENT_TYPES.DEMO;
    case "software":
    case "tool":
      return CONTENT_TYPES.TOOL;
    default:
      return CONTENT_TYPES.GAME;
  }
}

function isSourceConfirmedFreeToKeep(promotion) {
  return promotion.sourceId === SOURCE_IDS.STORE_SEARCH || promotion.sourceId === SOURCE_IDS.STORE_FEATURED;
}

export async function enrichPromotions(promotions, existingCache) {
  const appIds = Array.from(new Set(
    promotions
      .map((promotion) => promotion.appId)
      .filter((value) => Number.isInteger(value) && value > 0)
  ));

  const metadataCache = await fetchMissingMetadata(existingCache, appIds);

  const enriched = promotions.map((promotion) => {
    const metadata = metadataCache[promotion.stableId];
    const priceInitial = safeNumber(metadata?.priceInitial, -1);
    const priceFinal = safeNumber(metadata?.priceFinal, -1);
    // Steam appdetails may report final_formatted="Free" while keeping a non-zero numeric final price.
    const metadataConfirmedFreeToKeep = priceInitial < 0 ? true : (priceInitial > 0 && priceFinal === 0);

    return {
      ...promotion,
      title: promotion.title || metadata?.title || promotion.title,
      headerImage: metadata?.headerImage || "",
      capsuleImage: metadata?.capsuleImage || "",
      screenshotThumbnail: metadata?.screenshotThumbnail || "",
      screenshotFull: metadata?.screenshotFull || "",
      reviewScore: safeNumber(metadata?.reviewScore, 0),
      reviewScoreDesc: metadata?.reviewScoreDesc || "",
      reviewPositive: safeNumber(metadata?.reviewPositive, 0),
      reviewNegative: safeNumber(metadata?.reviewNegative, 0),
      reviewTotal: safeNumber(metadata?.reviewTotal, 0),
      reviewPercent: safeNumber(metadata?.reviewPercent, 0),
      contentType: inferContentType(promotion, metadataCache),
      isLikelyFreeToKeep: promotion.promoType !== "free-to-keep"
        ? true
        : (isSourceConfirmedFreeToKeep(promotion) || metadataConfirmedFreeToKeep)
    };
  });

  return {
    promotions: enriched,
    metadataCache
  };
}
