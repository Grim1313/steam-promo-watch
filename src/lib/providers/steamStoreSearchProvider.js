import { PROMO_TYPES, SOURCE_IDS } from "../constants.js";
import { buildSteamUrlFromStableId, createHash, decodeHtmlEntities, fetchJsonWithTimeout, normalizeWhitespace, stripHtml } from "../utils.js";

const SEARCH_RESULTS_URL = "https://store.steampowered.com/search/results/?query&start=0&count=100&dynamic_data=&sort_by=_ASC&specials=1&maxprice=free&supportedlang=english&ndl=1&infinite=1";

function isDiscountedToZero(priceText, row) {
  const finalPriceMatch = /data-price-final="(\d+)"/i.exec(row);
  const discountMatch = /data-discount="(\d+)"/i.exec(row);
  const originalPriceMatch = /class="discount_original_price[^"]*">([\s\S]*?)<\/div>/i.exec(row);
  const originalPriceText = normalizeWhitespace(stripHtml(originalPriceMatch ? originalPriceMatch[1] : ""));
  const normalizedFinalPrice = priceText.replace(/[^\d.,]/g, "");
  const normalizedOriginalPrice = originalPriceText.replace(/[^\d.,]/g, "");
  const hasZeroFinalPrice = (finalPriceMatch ? Number(finalPriceMatch[1]) : NaN) === 0 || /^0(?:[.,]00)?$/.test(normalizedFinalPrice);
  const hasDiscountedOriginalPrice = Boolean(normalizedOriginalPrice) && !/^0(?:[.,]00)?$/.test(normalizedOriginalPrice);
  const hasFullDiscount = (discountMatch ? Number(discountMatch[1]) : 0) >= 100;

  return hasZeroFinalPrice && (hasDiscountedOriginalPrice || hasFullDiscount);
}

export function parseSearchRows(html) {
  const rows = String(html || "").match(/<a\b[\s\S]*?class="[^"]*search_result_row[^"]*"[\s\S]*?<\/a>/gi) || [];
  const promotions = [];

  for (const row of rows) {
    const hrefMatch = /href="([^"]+)"/i.exec(row);
    const titleMatch = /class="title">([\s\S]*?)<\/span>/i.exec(row);
    const priceMatch = /class="(?:discount_final_price|search_price)[^"]*">([\s\S]*?)<\/div>/i.exec(row);
    const href = hrefMatch ? decodeHtmlEntities(hrefMatch[1]) : "";
    const title = titleMatch ? normalizeWhitespace(decodeHtmlEntities(stripHtml(titleMatch[1]))) : "";
    const priceText = normalizeWhitespace(stripHtml(priceMatch ? priceMatch[1] : ""));
    const isFreeLabel = /\bfree\b/i.test(priceText);

    if (!href || !title || (!isFreeLabel && !isDiscountedToZero(priceText, row))) {
      continue;
    }

    const stableIdMatch = /\/(app|sub)\/(\d+)\//i.exec(href);
    if (!stableIdMatch) {
      continue;
    }

    const stableId = `${stableIdMatch[1].toLowerCase()}:${stableIdMatch[2]}`;
    const appId = stableId.startsWith("app:") ? Number(stableIdMatch[2]) : 0;
    const packageId = stableId.startsWith("sub:") ? Number(stableIdMatch[2]) : 0;
    const rowText = stripHtml(row);

    promotions.push({
      stableId,
      appId,
      packageId,
      title,
      url: href || buildSteamUrlFromStableId(stableId),
      promoType: PROMO_TYPES.FREE_TO_KEEP,
      rawTypeLabel: "Store special",
      sourceId: SOURCE_IDS.STORE_SEARCH,
      sourceFingerprint: createHash(row),
      rowText
    });
  }

  return promotions;
}

export const steamStoreSearchProvider = {
  id: SOURCE_IDS.STORE_SEARCH,
  async fetchPromotions() {
    const response = await fetchJsonWithTimeout(SEARCH_RESULTS_URL);
    const promotions = parseSearchRows(response?.results_html || "");

    return {
      promotions,
      warnings: promotions.length === 0 ? ["Steam search returned no free special rows."] : [],
      success: true
    };
  }
};
