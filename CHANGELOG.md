# Changelog

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

## What's new

- Initial release

**Full Changelog**: https://github.com/Grim1313/steam-promo-watch/commits/v0.1.0
