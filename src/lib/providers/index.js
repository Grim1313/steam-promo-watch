import { enrichPromotions, getMetadataCache } from "./enrichmentProvider.js";
import { fallbackProvider } from "./fallbackProvider.js";
import { steamStoreSearchProvider } from "./steamStoreSearchProvider.js";

export async function fetchPromotionsFromProviders(settings) {
  const warnings = [];
  const providerIds = [];
  const promotions = [];
  let hadSuccess = false;

  if (settings.trackFreeToKeep) {
    try {
      const primary = await steamStoreSearchProvider.fetchPromotions();
      providerIds.push(steamStoreSearchProvider.id);
      warnings.push(...(primary.warnings || []));
      promotions.push(...(primary.promotions || []));
      hadSuccess = hadSuccess || primary.success;

      if (!primary.promotions?.length) {
        const fallback = await fallbackProvider.fetchPromotions();
        providerIds.push(fallbackProvider.id);
        warnings.push(...(fallback.warnings || []));
        promotions.push(...(fallback.promotions || []));
        hadSuccess = hadSuccess || fallback.success;
      }
    } catch (error) {
      warnings.push(`Free to Keep provider failed: ${error instanceof Error ? error.message : String(error)}`);
      try {
        const fallback = await fallbackProvider.fetchPromotions();
        providerIds.push(fallbackProvider.id);
        warnings.push(...(fallback.warnings || []));
        promotions.push(...(fallback.promotions || []));
        hadSuccess = hadSuccess || fallback.success;
      } catch (fallbackError) {
        warnings.push(`Fallback provider failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
      }
    }
  }

  const metadataCache = await getMetadataCache();
  const enriched = await enrichPromotions(promotions, metadataCache);

  return {
    promotions: enriched.promotions,
    metadataCache: enriched.metadataCache,
    warnings,
    providerIds: Array.from(new Set(providerIds)),
    hadSuccess
  };
}
