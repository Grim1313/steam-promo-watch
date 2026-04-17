# Changelog

## 0.3.0

### What's new

- Added an `Ignored promotions` section in Settings so ignored titles stay visible, can be opened on Steam, and can be restored without clearing all local data.
- Improved ignore/restore matching so the same Steam promotion stays ignored even when it appears from another provider or source entry.
- Added Steam user review badges to popup and history cards, plus review summary text in notifications when review data is available.
- Added a `Check for updates` link in the popup that opens the latest GitHub release.
- Updated the release workflow so GitHub Releases use the matching `CHANGELOG.md` entry as `What's new` while still attaching the packaged zip asset.

## 0.2.1

### What's new

- Updated the GitHub Actions release workflow to use `actions/checkout@v6`, which is compatible with Node 24.
- Fixed the release workflow so it actually runs the packaging script and captures the generated archive path.
- Made the release workflow idempotent: if a GitHub release already exists for the tag, the workflow now uploads or replaces the asset instead of failing.

## 0.2.0

### What's new

- Empty `Free to Keep` results are now treated as a normal successful check instead of a source warning.
- The popup now clearly shows `No new free promotions found` when the check succeeds but there are no active giveaways.
- The popup list now keeps only active promotions visible, which removes stale non-active entries from the main view.
- The toolbar badge is now hidden when there are no active `Free to Keep` promotions.
- When active promotions exist, the badge still shows the active count: red for unread items, green when everything is already seen.

## 0.1.0

### What's new

- Initial release

