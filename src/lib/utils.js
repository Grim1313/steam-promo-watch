import { DEBUG, FETCH_TIMEOUT_MS, PROMO_TYPES, CONTENT_TYPES } from "./constants.js";

const STEAM_STORE_HOST = "store.steampowered.com";
const STEAM_ASSET_HOST_RE = /(^|\.)steamstatic\.com$/i;
const STEAM_CDN_ASSET_HOST = "https://cdn.cloudflare.steamstatic.com";

export function debugLog(...args) {
  if (DEBUG) {
    console.log("[Steam Promo Watch]", ...args);
  }
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function minutesToMs(minutes) {
  return minutes * 60 * 1000;
}

export function daysToMs(days) {
  return days * 24 * 60 * 60 * 1000;
}

export function createHash(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function decodeHtmlEntities(html) {
  return String(html || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export function stripHtml(html) {
  const withoutScripts = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li|section|article|h1|h2|h3|h4|h5|h6|span)>/gi, " ");
  return normalizeWhitespace(decodeHtmlEntities(withoutScripts.replace(/<[^>]+>/g, " ")));
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function chunkArray(items, size) {
  const chunks = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

export function formatDateTime(timestamp) {
  if (!timestamp) {
    return "Never";
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(timestamp);
}

export function formatRelativeTime(timestamp) {
  if (!timestamp) {
    return "Never";
  }

  const diff = timestamp - Date.now();
  const abs = Math.abs(diff);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (abs < hour) {
    return rtf.format(Math.round(diff / minute), "minute");
  }
  if (abs < day) {
    return rtf.format(Math.round(diff / hour), "hour");
  }
  return rtf.format(Math.round(diff / day), "day");
}

export function parseTimeString(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return (hours * 60) + minutes;
}

export function isQuietHoursActive(settings, timestamp = Date.now()) {
  if (!settings?.quietHoursEnabled) {
    return false;
  }
  const start = parseTimeString(settings.quietHoursStart);
  const end = parseTimeString(settings.quietHoursEnd);
  if (start === null || end === null || start === end) {
    return false;
  }

  const local = new Date(timestamp);
  const currentMinutes = (local.getHours() * 60) + local.getMinutes();

  if (start < end) {
    return currentMinutes >= start && currentMinutes < end;
  }
  return currentMinutes >= start || currentMinutes < end;
}

export function textAreaToList(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);
}

export function uniqueLowerList(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const normalized = normalizeWhitespace(item).toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function buildSteamUrlFromStableId(stableId) {
  const match = /^(app|sub):(\d+)$/.exec(String(stableId || ""));
  if (!match) {
    return "https://store.steampowered.com/";
  }
  return `https://store.steampowered.com/${match[1]}/${match[2]}/`;
}

export function sanitizeSteamUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== STEAM_STORE_HOST) {
      return "https://store.steampowered.com/";
    }
    return parsed.toString();
  } catch {
    return "https://store.steampowered.com/";
  }
}

export function sanitizeSteamAssetUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return "";
    }
    if (STEAM_ASSET_HOST_RE.test(parsed.hostname) || parsed.hostname === STEAM_STORE_HOST) {
      return parsed.toString();
    }
    return "";
  } catch {
    return "";
  }
}

export function buildSteamHeaderImageUrl(appId) {
  const normalizedAppId = Number(appId);
  if (!Number.isInteger(normalizedAppId) || normalizedAppId <= 0) {
    return "";
  }
  return `${STEAM_CDN_ASSET_HOST}/steam/apps/${normalizedAppId}/header.jpg`;
}

export function getPromotionImageUrl(promotion, options = {}) {
  const source = typeof promotion === "object" && promotion ? promotion : {};
  const preferScreenshot = options.preferScreenshot !== false;
  const screenshotKey = options.fullSize ? "screenshotFull" : "screenshotThumbnail";
  const stableIdMatch = /^app:(\d+)$/.exec(String(source.stableId || ""));
  const fallbackHeaderImage = buildSteamHeaderImageUrl(source.appId || stableIdMatch?.[1] || 0);
  const ordered = preferScreenshot
    ? [source[screenshotKey], source.headerImage, source.capsuleImage, fallbackHeaderImage]
    : [source.headerImage, source.capsuleImage, fallbackHeaderImage, source[screenshotKey]];

  for (const candidate of ordered) {
    const sanitized = sanitizeSteamAssetUrl(candidate);
    if (sanitized) {
      return sanitized;
    }
  }

  return "";
}

export function computeBackoffMs(intervalMinutes, backoffLevel) {
  const base = minutesToMs(intervalMinutes);
  const factor = Math.max(1, Math.pow(2, Math.max(0, backoffLevel)));
  return Math.min(base * factor, Math.max(base, 6 * 60 * 60 * 1000));
}

export async function fetchJsonWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const response = await fetchWithTimeout(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  }, timeoutMs);
  return response.json();
}

export async function fetchTextWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  return response.text();
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      ...options,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getPromotionTypeLabel(type) {
  return "Free to Keep";
}

export function getContentTypeLabel(type) {
  switch (type) {
    case CONTENT_TYPES.DLC:
      return "DLC";
    case CONTENT_TYPES.SOUNDTRACK:
      return "Soundtrack";
    case CONTENT_TYPES.DEMO:
      return "Demo";
    case CONTENT_TYPES.TOOL:
      return "Tool";
    case CONTENT_TYPES.PACKAGE:
      return "Package";
    case CONTENT_TYPES.GAME:
      return "Game";
    default:
      return "Unknown";
  }
}

export function titleLooksLikeSoundtrack(value) {
  return /\b(soundtrack|ost|original soundtrack)\b/i.test(String(value || ""));
}
