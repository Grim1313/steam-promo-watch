# Technical Details

This document contains architecture, structure, debugging, testing, and implementation notes that were removed from the main `README`.

## Architecture

The extension is split into small modules so each part has one job:

- `manifest.json`: extension manifest and minimal permissions.
- `src/service-worker.js`: background entry point, alarms, notifications, message router.
- `src/lib/`: storage, settings, scheduler, filters, dedupe, badge updates, notifications, provider orchestration.
- `src/lib/providers/`: data-source adapters and enrichment.
- `src/ui/`: popup, options page, and history page.
- `resources/icons/`: local icons used by the extension and notifications.

Core behavior:

- `chrome.alarms` schedules the next check without `setInterval`.
- Only one check can run at a time.
- A failed check increases soft backoff.
- Local storage keeps settings, runtime state, dedupe data, and limited history.
- Notifications use a stable identity (`stableId + promoType + sourceId`) plus a campaign fingerprint.

## File structure

```text
steam-promo-watch/
|-- manifest.json
|-- README.md
|-- TECHNICAL.md
|-- LICENSE
|-- resources/
|   `-- icons/
|       |-- icon16.png
|       |-- icon32.png
|       |-- icon48.png
|       `-- icon128.png
`-- src/
    |-- service-worker.js
    |-- lib/
    |   |-- badge.js
    |   |-- constants.js
    |   |-- dedupe.js
    |   |-- filters.js
    |   |-- history.js
    |   |-- notifications.js
    |   |-- promotions.js
    |   |-- runtime-state.js
    |   |-- scheduler.js
    |   |-- settings.js
    |   |-- storage.js
    |   |-- utils.js
    |   `-- providers/
    |       |-- enrichmentProvider.js
    |       |-- fallbackProvider.js
    |       |-- index.js
    |       `-- steamStoreSearchProvider.js
    `-- ui/
        |-- history.css
        |-- history.html
        |-- history.js
        |-- options.css
        |-- options.html
        |-- options.js
        |-- popup.css
        |-- popup.html
        `-- popup.js
```

## Key technical defaults

- Default check interval: `3 hours`
- `Free to Keep`: enabled by default
- Quiet hours: disabled by default
- Notifications: enabled by default
- Badge: enabled by default
- History retention: `30 days`
- Dedupe retention: `14 days`
- Low-overhead strategy:
  - single scheduled alarm
  - one active check at a time
  - timeout-protected `fetch`
  - batched app-details enrichment
  - limited cache and bounded history

## Scope

This extension intentionally tracks only `Free to Keep` promotions.

`Temporary Free / Free Weekend / Play for Free` campaigns are not included because there is no simple, low-overhead, reliable public source that fits the extension's design goals.

## Project folder setup

1. Create a folder named `steam-promo-watch`.
2. Put all files from this repository into that folder.
3. Make sure the structure matches the tree shown above.

If you already cloned the repository, this step is already done.

## Popup and settings notes

### Popup contents

The popup shows:

- latest promotions
- last successful check
- next planned check
- source errors or warnings
- quick action buttons

### Open settings

Use either of these ways:

1. Right-click the extension icon and choose `Options`.
2. Or open the popup and click `Settings`.

## Troubleshooting and debugging

### Check that alarms work

1. Open settings.
2. Set check interval to `15 minutes` for testing.
3. Click `Save settings`.
4. Open the popup and verify that `Next check` changed.
5. Wait until the next scheduled time or use `Check now`.

Important:

- `Check now` triggers an immediate check.
- It does not cancel the regular schedule.

### Test notifications

1. Open settings.
2. Make sure `Enable browser notifications` is on.
3. Click `Send test notification`.
4. A browser notification should appear.
5. Clicking the notification should open Steam in a new tab.

If notifications do not appear:

1. Check browser notification permissions in the OS.
2. Make sure the browser itself is allowed to show notifications.
3. Check the service worker logs as described below.

### Inspect service worker errors

1. Open `chrome://extensions/`.
2. Find `Steam Promo Watch`.
3. Click `Service worker` or `Inspect views`.
4. A DevTools window will open.
5. Look at:
   - `Console`
   - `Network`
   - `Application` if needed

This is the main place to debug background logic, alarms, fetch errors, and notifications.

### Debug without experience

Use this order:

1. Load the unpacked extension.
2. Open the popup and confirm it opens without a blank screen.
3. Open options and save settings once.
4. Send a test notification.
5. Click `Check now`.
6. Inspect the service worker console if something looks wrong.

Useful checks:

- If popup is blank, look for JavaScript errors in popup DevTools.
- If scheduled checks do not happen, inspect the service worker.
- If no data arrives, look for fetch errors in the service worker console.
- If notification click does nothing, inspect the notification click handler logs.

## Assumptions

- Chrome `120+` is acceptable because current Chrome alarms support a 30-second minimum, and this project only uses intervals of 15 minutes or more.
- The best practical MVP is a focused `Free to Keep` tracker.
- Steam Store endpoints are stable enough for an MVP when wrapped in provider abstraction and fallback logic.
- English store responses are acceptable for parsing consistency.
- Local storage size is enough because history, metadata, and dedupe maps are capped.

## Current limitations

- The main Steam search endpoint used here is not officially documented as a public product API, so future HTML changes may require parser updates.
- Package enrichment is intentionally shallow to avoid extra network cost.
- No import/export of settings yet.
- No localization yet.

## Possible next improvements

- Add optional per-promotion snooze durations.
- Add a dedicated diagnostics page with provider test output.
- Add stronger migration support for future schema updates.
- Add optional region / language settings.
- Add richer campaign start/end detection when a better source is available.

## Testing

### Automated parser test

If you have Node.js available locally, run:

```bash
npm test
```

This executes a small `node:test` suite that locks the Steam search parser against the current zero-price / `-100%` free-to-keep markup.

### Manual testing checklist

#### First install

- [ ] Load the unpacked extension.
- [ ] Confirm the popup opens.
- [ ] Confirm options page opens.
- [ ] Confirm the service worker starts without syntax errors.

#### Notification enablement

- [ ] Enable notifications in settings.
- [ ] Send a test notification.
- [ ] Click the notification and confirm Steam opens.

#### Manual check

- [ ] Click `Check now` in the popup.
- [ ] Confirm the status changes to checking.
- [ ] Confirm the popup later shows the new runtime state.

#### Dedupe behavior

- [ ] Run `Check now` twice with the same result set.
- [ ] Confirm the same promotion is not notified twice immediately.

#### Badge behavior

- [ ] Trigger a new unread promotion entry.
- [ ] Confirm the badge count appears.
- [ ] Open the popup and confirm unread count clears.

#### Quiet hours

- [ ] Enable quiet hours.
- [ ] Set a range that includes the current local time.
- [ ] Run `Check now`.
- [ ] Confirm items are queued as unread instead of notifying immediately.

#### Alarm restore after browser restart

- [ ] Close the browser fully.
- [ ] Reopen the browser.
- [ ] Open the popup.
- [ ] Confirm `Next check` is still scheduled.

#### Network error behavior

- [ ] Disconnect the network or block Steam temporarily.
- [ ] Run `Check now`.
- [ ] Confirm the popup shows a source error.
- [ ] Confirm the extension does not crash and keeps working after connectivity returns.
