import test from "node:test";
import assert from "node:assert/strict";

import { buildSteamHeaderImageUrl, getPromotionImageUrl, sanitizeSteamAssetUrl } from "../src/lib/utils.js";

test("sanitizeSteamAssetUrl allows Steam-hosted https artwork only", () => {
  assert.equal(
    sanitizeSteamAssetUrl("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/header.jpg"),
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/header.jpg"
  );
  assert.equal(
    sanitizeSteamAssetUrl("http://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/header.jpg"),
    ""
  );
  assert.equal(
    sanitizeSteamAssetUrl("https://example.com/header.jpg"),
    ""
  );
});

test("getPromotionImageUrl prefers screenshots and falls back to cover art", () => {
  const promotion = {
    appId: 599140,
    screenshotThumbnail: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/shot_600.jpg",
    screenshotFull: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/shot_1920.jpg",
    headerImage: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/header.jpg",
    capsuleImage: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/capsule.jpg"
  };

  assert.equal(
    getPromotionImageUrl(promotion),
    promotion.screenshotThumbnail
  );
  assert.equal(
    getPromotionImageUrl(promotion, { fullSize: true }),
    promotion.screenshotFull
  );
  assert.equal(
    getPromotionImageUrl({
      appId: 599140,
      screenshotThumbnail: "",
      screenshotFull: "",
      headerImage: promotion.headerImage,
      capsuleImage: promotion.capsuleImage
    }),
    promotion.headerImage
  );
  assert.equal(
    getPromotionImageUrl({
      appId: 599140,
      screenshotThumbnail: "",
      screenshotFull: "",
      headerImage: "",
      capsuleImage: ""
    }),
    buildSteamHeaderImageUrl(599140)
  );
});
