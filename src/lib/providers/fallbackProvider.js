import { PROMO_TYPES, SOURCE_IDS } from "../constants.js";
import { buildSteamUrlFromStableId, createHash, fetchJsonWithTimeout } from "../utils.js";

const FEATURED_URL = "https://store.steampowered.com/api/featuredcategories/?cc=us&l=english";

export const fallbackProvider = {
  id: SOURCE_IDS.STORE_FEATURED,
  async fetchPromotions() {
    const data = await fetchJsonWithTimeout(FEATURED_URL);
    const items = Array.isArray(data?.specials?.items) ? data.specials.items : [];
    const promotions = items
      .filter((item) => Number(item?.final_price) === 0 && Number(item?.original_price) > 0 && Number(item?.id) > 0)
      .map((item) => {
        const stableId = `app:${item.id}`;
        return {
          stableId,
          appId: Number(item.id),
          packageId: 0,
          title: String(item.name || "").trim(),
          url: buildSteamUrlFromStableId(stableId),
          promoType: PROMO_TYPES.FREE_TO_KEEP,
          rawTypeLabel: "Featured special",
          sourceId: SOURCE_IDS.STORE_FEATURED,
          sourceFingerprint: createHash(`${item.id}|${item.name}|${item.original_price}|${item.final_price}`)
        };
      });

    return {
      promotions,
      warnings: [],
      success: true
    };
  }
};
