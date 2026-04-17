import test from "node:test";
import assert from "node:assert/strict";

import { enrichPromotions } from "../src/lib/providers/enrichmentProvider.js";

test("enrichPromotions adds Steam review summary fields from appreviews", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    if (url.includes("/api/appdetails?")) {
      return {
        ok: true,
        async json() {
          return {
            599140: {
              success: true,
              data: {
                name: "Graveyard Keeper",
                type: "game",
                genres: [{ description: "Simulation" }],
                categories: [{ description: "Single-player" }],
                header_image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/header.jpg",
                capsule_image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/capsule.jpg",
                screenshots: [
                  {
                    path_thumbnail: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/shot_600.jpg",
                    path_full: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/shot_1920.jpg"
                  }
                ],
                price_overview: {
                  initial: 999,
                  final: 0
                }
              }
            }
          };
        }
      };
    }

    if (url.includes("/appreviews/599140?")) {
      return {
        ok: true,
        async json() {
          return {
            success: 1,
            query_summary: {
              review_score: 8,
              review_score_desc: "Very Positive",
              total_positive: 42320,
              total_negative: 7033,
              total_reviews: 49353
            }
          };
        }
      };
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await enrichPromotions([
    {
      id: "app:599140|free-to-keep|steam-store-search",
      stableId: "app:599140",
      appId: 599140,
      title: "",
      promoType: "free-to-keep",
      sourceId: "steam-store-search"
    }
  ], {});

  assert.equal(result.promotions.length, 1);
  assert.equal(result.promotions[0].reviewScore, 8);
  assert.equal(result.promotions[0].reviewScoreDesc, "Very Positive");
  assert.equal(result.promotions[0].reviewPositive, 42320);
  assert.equal(result.promotions[0].reviewNegative, 7033);
  assert.equal(result.promotions[0].reviewTotal, 49353);
  assert.equal(result.promotions[0].reviewPercent, 86);

  assert.equal(result.metadataCache["app:599140"].reviewScore, 8);
  assert.equal(result.metadataCache["app:599140"].reviewPercent, 86);
});

test("enrichPromotions backfills reviews for fresh cached metadata created before review support", async (t) => {
  const originalFetch = globalThis.fetch;
  const nowTs = Date.now();

  globalThis.fetch = async (url) => {
    if (url.includes("/api/appdetails?")) {
      return {
        ok: true,
        async json() {
          return {
            599140: {
              success: true,
              data: {
                name: "Graveyard Keeper",
                type: "game",
                genres: [{ description: "Simulation" }],
                categories: [{ description: "Single-player" }],
                header_image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/header.jpg",
                capsule_image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/capsule.jpg",
                screenshots: [
                  {
                    path_thumbnail: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/shot_600.jpg",
                    path_full: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/shot_1920.jpg"
                  }
                ],
                price_overview: {
                  initial: 999,
                  final: 0
                }
              }
            }
          };
        }
      };
    }

    if (url.includes("/appreviews/599140?")) {
      return {
        ok: true,
        async json() {
          return {
            success: 1,
            query_summary: {
              review_score: 8,
              review_score_desc: "Very Positive",
              total_positive: 42320,
              total_negative: 7033,
              total_reviews: 49353
            }
          };
        }
      };
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await enrichPromotions([
    {
      id: "app:599140|free-to-keep|steam-store-search",
      stableId: "app:599140",
      appId: 599140,
      title: "",
      promoType: "free-to-keep",
      sourceId: "steam-store-search"
    }
  ], {
    "app:599140": {
      title: "Graveyard Keeper",
      type: "game",
      genres: ["Simulation"],
      categories: ["Single-player"],
      headerImage: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/header.jpg",
      capsuleImage: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/capsule.jpg",
      screenshotThumbnail: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/shot_600.jpg",
      screenshotFull: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/shot_1920.jpg",
      priceInitial: 999,
      priceFinal: 0,
      updatedAt: nowTs
    }
  });

  assert.equal(result.promotions[0].reviewTotal, 49353);
  assert.equal(result.promotions[0].reviewPercent, 86);
  assert.ok(result.metadataCache["app:599140"].reviewUpdatedAt > 0);
});
