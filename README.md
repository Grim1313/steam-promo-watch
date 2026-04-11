# Steam Promo Watch

Steam Promo Watch is a lightweight Chrome / Edge extension that watches Steam for `Free to Keep` promotions and notifies you when something new appears.

> Early alpha: the extension is still in active development.
> Behavior may change, some features may be incomplete, and bugs are still expected.

## What it is

Steam Promo Watch helps you catch Steam games that become free to keep for a limited time.

It works locally in your browser:

- no server
- no Steam login
- no account connection

## Why use it

Use it if you want a simple way to keep an eye on Steam giveaways without manually checking the store all the time.

It is built for people who want:

- automatic checks in the background
- browser notifications when a new promotion appears
- a small popup with recent results and status
- simple settings without extra complexity

## How it works

The extension periodically checks Steam for `Free to Keep` promotions.

When it finds a new one, it can:

- show a browser notification
- update the extension badge
- save a short local history so you can see recent detections

You can also open the popup at any time to:

- see the latest promotions
- check when the last scan happened
- see when the next scan is planned
- start a manual check with `Check now`

## What it tracks

This extension intentionally tracks only `Free to Keep` promotions.

It does not currently track temporary free play events such as `Free Weekend` or `Play for Free`.

## How to install in Chrome

1. Open the repository's `Releases` page on GitHub.
2. Download the asset `steam-promo-watch-<version>.zip`.
3. Extract the archive to a local folder.
4. Open `chrome://extensions/`.
5. Turn on `Developer mode`.
6. Click `Load unpacked`.
7. Select the extracted `steam-promo-watch` folder.

The release archive contains only the extension runtime files needed by the browser:

- `manifest.json`
- `src/`
- `resources/icons/`
- `LICENSE`

Do not use GitHub's auto-generated `Source code (zip)` archive for installation. That archive is a repository snapshot and may include development files that are not part of the release package.

For Microsoft Edge, use the same steps on `edge://extensions/`.

## How to use it

1. Click the extension icon in the browser toolbar.
2. Open `Settings` if you want to change the check interval, notifications, badge, or quiet hours.
3. Use `Check now` when you want an immediate scan.
4. Keep the browser installed and enabled so scheduled checks can continue.

## Limitations

- The extension is still in alpha.
- Steam can change store pages or data sources, which may require updates.
- No localization yet.
- No settings import/export yet.

## Technical details

Technical notes for developers and advanced troubleshooting were moved to [TECHNICAL.md](TECHNICAL.md).
