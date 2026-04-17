import test from "node:test";
import assert from "node:assert/strict";

import { createPromotionNotifications, sendTestNotification } from "../src/lib/notifications.js";
import { STORAGE_KEYS } from "../src/lib/constants.js";

function createChromeMock() {
  const notificationCalls = [];
  const storageState = {};

  globalThis.chrome = {
    runtime: {
      getURL(path) {
        return `chrome-extension://test/${path}`;
      }
    },
    notifications: {
      async create(id, options) {
        notificationCalls.push([id, options]);
      }
    },
    storage: {
      local: {
        async get(key) {
          if (typeof key === "string") {
            return { [key]: storageState[key] };
          }
          return {};
        },
        async set(values) {
          Object.assign(storageState, values);
        }
      }
    }
  };

  return { notificationCalls, storageState };
}

test("createPromotionNotifications uses image notifications when artwork is available", async (t) => {
  const { notificationCalls, storageState } = createChromeMock();
  t.after(() => {
    delete globalThis.chrome;
  });

  await createPromotionNotifications([{
    id: "app:599140",
    stableId: "app:599140",
    title: "Graveyard Keeper",
    promoType: "free-to-keep",
    reviewScoreDesc: "Very Positive",
    reviewPositive: 42320,
    reviewNegative: 7033,
    reviewTotal: 49353,
    reviewPercent: 86,
    url: "https://store.steampowered.com/app/599140/Graveyard_Keeper/",
    screenshotFull: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/shot_1920.jpg",
    screenshotThumbnail: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/shot_600.jpg",
    headerImage: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/header.jpg",
    capsuleImage: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/capsule.jpg"
  }]);

  assert.equal(notificationCalls.length, 1);
  assert.equal(notificationCalls[0][1].type, "image");
  assert.equal(notificationCalls[0][1].imageUrl, "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/599140/header.jpg");
  assert.equal(notificationCalls[0][1].contextMessage, "Very Positive · 86% positive · 49.4K reviews");
  assert.ok(storageState[STORAGE_KEYS.notificationLinks]);
});

test("sendTestNotification includes review summary text", async (t) => {
  const { notificationCalls } = createChromeMock();
  t.after(() => {
    delete globalThis.chrome;
  });

  await sendTestNotification();

  assert.equal(notificationCalls.length, 1);
  assert.equal(notificationCalls[0][1].contextMessage, "Very Positive · 86% positive · 49.4K reviews");
});
