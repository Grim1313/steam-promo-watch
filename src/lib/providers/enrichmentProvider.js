import {
  CONTENT_TYPES,
  MAX_METADATA_ITEMS,
  METADATA_TTL_MS,
  PROMO_TYPES,
  PROMOTION_DEADLINE_TTL_MS,
  SOURCE_IDS,
  STORAGE_KEYS
} from "../constants.js";
import { readKey } from "../storage.js";
import {
  chunkArray,
  fetchJsonWithTimeout,
  fetchTextWithTimeout,
  normalizeWhitespace,
  safeNumber,
  sanitizeSteamAssetUrl,
  sanitizeSteamReviewSummary,
  stripHtml,
  titleLooksLikeSoundtrack
} from "../utils.js";

const APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails";
const APP_REVIEWS_URL = "https://store.steampowered.com/appreviews";
const APP_PAGE_URL = "https://store.steampowered.com/app";
const STEAM_DEADLINE_CACHE_VERSION = 2;
const STEAM_DEADLINE_ROLLOVER_GRACE_MS = 2 * 24 * 60 * 60 * 1000;
const STEAM_DEADLINE_TIME_ZONE = "America/Los_Angeles";
const STEAM_DEADLINE_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: STEAM_DEADLINE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});
const STEAM_MONTHS = Object.freeze({
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11
});

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
      priceDiscountPercent: safeNumber(value.priceDiscountPercent, 0),
      priceFinalFormatted: typeof value.priceFinalFormatted === "string" ? value.priceFinalFormatted : "",
      freeToKeepEndsAt: safeNumber(value.freeToKeepEndsAt, 0),
      freeToKeepDeadlineUpdatedAt: safeNumber(value.freeToKeepDeadlineUpdatedAt, 0),
      freeToKeepDeadlineTimeZone: typeof value.freeToKeepDeadlineTimeZone === "string" ? value.freeToKeepDeadlineTimeZone : "",
      freeToKeepDeadlineVersion: safeNumber(value.freeToKeepDeadlineVersion, 0),
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
        priceDiscountPercent: data ? safeNumber(data.price_overview?.discount_percent, 0) : safeNumber(existing.priceDiscountPercent, 0),
        priceFinalFormatted: data && typeof data.price_overview?.final_formatted === "string"
          ? data.price_overview.final_formatted
          : (existing.priceFinalFormatted || ""),
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

function buildAppPageUrl(appId) {
  return `${APP_PAGE_URL}/${appId}/?l=english&cc=us`;
}

function decodeScriptEscapes(value) {
  return String(value || "")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\u([0-9a-f]{4})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function getSteamDeadlineDateParts(timestamp) {
  const values = {};
  for (const part of STEAM_DEADLINE_DATE_FORMATTER.formatToParts(timestamp)) {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  }
  return values;
}

function getSteamDeadlineTimeZoneOffsetMs(timestamp) {
  const parts = getSteamDeadlineDateParts(timestamp);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - timestamp;
}

function buildSteamDeadlineTimestamp(year, month, day, hour, minute) {
  const localAsUtc = Date.UTC(year, month, day, hour, minute, 0, 0);
  const firstOffset = getSteamDeadlineTimeZoneOffsetMs(localAsUtc);
  const firstCandidate = localAsUtc - firstOffset;
  const secondOffset = getSteamDeadlineTimeZoneOffsetMs(firstCandidate);
  return secondOffset === firstOffset ? firstCandidate : localAsUtc - secondOffset;
}

export function parseSteamFreeToKeepEndsAt(text, nowTs = Date.now()) {
  const normalized = normalizeWhitespace(stripHtml(text));
  const match = /\bbefore\s+([A-Za-z]{3,9})\s+(\d{1,2})(?:,\s*(\d{4}))?\s*@\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(normalized);
  if (!match || !/\bfree\s+to\s+keep\b/i.test(normalized)) {
    return 0;
  }

  const month = STEAM_MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  const explicitYear = match[3] ? Number(match[3]) : 0;
  const hourValue = Number(match[4]);
  const minute = match[5] ? Number(match[5]) : 0;
  const period = String(match[6] || "").toLowerCase();

  if (
    month === undefined ||
    day < 1 ||
    day > 31 ||
    hourValue < 0 ||
    hourValue > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return 0;
  }

  let hour = hourValue;
  if (period === "pm" && hour < 12) {
    hour += 12;
  } else if (period === "am" && hour === 12) {
    hour = 0;
  }

  const steamNow = getSteamDeadlineDateParts(nowTs);
  const year = explicitYear || steamNow.year;
  let candidate = buildSteamDeadlineTimestamp(year, month, day, hour, minute);
  if (!Number.isFinite(candidate)) {
    return 0;
  }

  if (!explicitYear && candidate < nowTs - STEAM_DEADLINE_ROLLOVER_GRACE_MS) {
    candidate = buildSteamDeadlineTimestamp(year + 1, month, day, hour, minute);
  }

  return candidate;
}

export function extractSteamFreeToKeepEndsAtFromHtml(html, nowTs = Date.now()) {
  const source = String(html || "");
  const purchaseNotes = source.match(/<p\b[^>]*class="[^"]*\bgame_purchase_discount_quantity\b[^"]*"[^>]*>[\s\S]*?<\/p>/gi) || [];
  for (const note of purchaseNotes) {
    const endsAt = parseSteamFreeToKeepEndsAt(note, nowTs);
    if (endsAt) {
      return endsAt;
    }
  }
  return parseSteamFreeToKeepEndsAt(source, nowTs) || parseSteamFreeToKeepEndsAt(decodeScriptEscapes(source), nowTs);
}

function shouldFetchFreeToKeepDeadline(metadata, nowTs) {
  const endsAt = safeNumber(metadata?.freeToKeepEndsAt, 0);
  const updatedAt = safeNumber(metadata?.freeToKeepDeadlineUpdatedAt, 0);
  if (
    metadata?.freeToKeepDeadlineTimeZone !== STEAM_DEADLINE_TIME_ZONE ||
    safeNumber(metadata?.freeToKeepDeadlineVersion, 0) !== STEAM_DEADLINE_CACHE_VERSION
  ) {
    return true;
  }
  if (endsAt > nowTs) {
    return false;
  }
  if (!endsAt) {
    return !updatedAt || (nowTs - updatedAt) >= PROMOTION_DEADLINE_TTL_MS;
  }
  return !updatedAt || (nowTs - updatedAt) >= PROMOTION_DEADLINE_TTL_MS;
}

async function fetchMissingPromotionDeadlines(cache, promotions) {
  const nowTs = Date.now();
  const next = { ...sanitizeMetadataCache(cache) };
  const warnings = [];
  const appIds = Array.from(new Set(
    promotions
      .filter((promotion) => {
        const appId = safeNumber(promotion?.appId, 0);
        const key = `app:${appId}`;
        return (
          promotion?.promoType === PROMO_TYPES.FREE_TO_KEEP &&
          appId > 0 &&
          !safeNumber(promotion?.endsAt, 0) &&
          shouldFetchFreeToKeepDeadline(next[key], nowTs)
        );
      })
      .map((promotion) => safeNumber(promotion.appId, 0))
  ));

  for (const batch of chunkArray(appIds, 4)) {
    const responses = await Promise.all(batch.map(async (appId) => {
      try {
        const html = await fetchTextWithTimeout(buildAppPageUrl(appId), {
          credentials: "omit",
          headers: {
            Accept: "text/html,application/xhtml+xml"
          }
        });
        const endsAt = extractSteamFreeToKeepEndsAtFromHtml(html, nowTs);
        return {
          appId,
          endsAt,
          htmlLength: html.length,
          hadResponse: true
        };
      } catch (error) {
        return {
          appId,
          endsAt: 0,
          error: error instanceof Error ? error.message : String(error),
          hadResponse: false
        };
      }
    }));

    for (const { appId, endsAt, htmlLength, error, hadResponse } of responses) {
      if (!hadResponse) {
        warnings.push(`Free-to-keep end time fetch failed for app ${appId}: ${error || "unknown error"}`);
        continue;
      }
      if (!endsAt) {
        const key = `app:${appId}`;
        const existing = next[key] || {};
        next[key] = {
          ...existing,
          freeToKeepEndsAt: 0,
          freeToKeepDeadlineUpdatedAt: nowTs,
          freeToKeepDeadlineTimeZone: STEAM_DEADLINE_TIME_ZONE,
          freeToKeepDeadlineVersion: STEAM_DEADLINE_CACHE_VERSION,
          updatedAt: safeNumber(existing.updatedAt, 0) || nowTs
        };
        warnings.push(`Free-to-keep end time not found for app ${appId}; Steam page HTML length ${htmlLength || 0}.`);
        continue;
      }

      const key = `app:${appId}`;
      const existing = next[key] || {};
      next[key] = {
        ...existing,
        freeToKeepEndsAt: endsAt,
        freeToKeepDeadlineUpdatedAt: nowTs,
        freeToKeepDeadlineTimeZone: STEAM_DEADLINE_TIME_ZONE,
        freeToKeepDeadlineVersion: STEAM_DEADLINE_CACHE_VERSION,
        updatedAt: safeNumber(existing.updatedAt, 0) || nowTs
      };
    }
  }

  return {
    metadataCache: pruneMetadataCache(next, nowTs),
    warnings
  };
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

  let metadataCache = await fetchMissingMetadata(existingCache, appIds);
  const deadlineResult = await fetchMissingPromotionDeadlines(metadataCache, promotions);
  metadataCache = deadlineResult.metadataCache;

  const enriched = promotions.map((promotion) => {
    const metadata = metadataCache[promotion.stableId];
    const priceInitial = safeNumber(metadata?.priceInitial, -1);
    const priceFinal = safeNumber(metadata?.priceFinal, -1);
    const priceDiscountPercent = safeNumber(metadata?.priceDiscountPercent, 0);
    const priceFinalFormatted = String(metadata?.priceFinalFormatted || "");
    const metadataConfirmedFreeToKeep = priceInitial < 0
      ? true
      : (priceInitial > 0 && (priceFinal === 0 || priceDiscountPercent >= 100 || /\bfree\b/i.test(priceFinalFormatted)));

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
      endsAt: safeNumber(promotion.endsAt, 0) || safeNumber(metadata?.freeToKeepEndsAt, 0),
      isLikelyFreeToKeep: promotion.promoType !== "free-to-keep"
        ? true
        : (isSourceConfirmedFreeToKeep(promotion) || metadataConfirmedFreeToKeep)
    };
  });

  return {
    promotions: enriched,
    metadataCache,
    warnings: deadlineResult.warnings
  };
}
