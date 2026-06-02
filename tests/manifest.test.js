import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

test("manifest version is prepared for the 0.4.1 release", () => {
  assert.equal(manifest.version, "0.4.1");
});

test("manifest uses the Chrome Web Store release name and summary", () => {
  assert.equal(manifest.name, "Steam Promo Watch: Free Game Alerts");
  assert.equal(
    manifest.description,
    "Find limited-time free Steam games and get giveaway alerts. No Steam login required."
  );
  assert.equal(manifest.action.default_title, "Steam Promo Watch: Free Game Alerts");
});

test("manifest does not request the tabs permission", () => {
  assert.ok(!manifest.permissions.includes("tabs"));
});

test("manifest allows Steam Store API deadline lookups", () => {
  assert.ok(manifest.host_permissions.includes("https://api.steampowered.com/*"));
});
