import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

test("manifest version is prepared for the 0.3.3 release", () => {
  assert.equal(manifest.version, "0.3.3");
});

test("manifest does not request the tabs permission", () => {
  assert.ok(!manifest.permissions.includes("tabs"));
});
