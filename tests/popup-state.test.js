import test from "node:test";
import assert from "node:assert/strict";

import { getPopupStatusText, getVisiblePromotions } from "../src/ui/popup-state.js";

test("getVisiblePromotions keeps only active entries for the popup", () => {
  const visible = getVisiblePromotions([
    { id: "expired-1", status: "expired" },
    { id: "active-1", status: "active" },
    { id: "dismissed-1", status: "dismissed" },
    { id: "active-2", status: "active" }
  ]);

  assert.deepEqual(
    visible.map((entry) => entry.id),
    ["active-1", "active-2"]
  );
});

test("getPopupStatusText reports when no new free promotions were found", () => {
  assert.equal(
    getPopupStatusText({ lastCheckOutcome: "success", lastResultCount: 0 }),
    "No new free promotions found"
  );
});
