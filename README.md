# Pump!

Pump! is a Chromium extension that makes time spent on distracting websites visible. Add a site, choose a limit, and Pump! shows a moving circular timer directly on the page. The timer grows as the limit approaches and exits the current site screen when time is up.

## Features

- Local website rules with custom minute limits.
- A circular in-page timer bubble with progress, percentage, and status text.
- Timer continuity across same-site navigation and reloads during the same tab session.
- Bubble movement that continues as the page changes.
- Optional GIF background for the bubble, with adaptive text contrast for readability.
- Optional local launch audio, with playback synced to timer progress.
- One clear page action: `Close everything`.
- Reduced-motion support.
- No accounts, backend, analytics, tracking, or remote scripts.

## Install Locally

1. Open Chrome or another Chromium browser.
2. Go to `chrome://extensions`.
3. Enable Developer Mode.
4. Select **Load unpacked**.
5. Choose this repository folder.
6. Pin Pump! to the toolbar.
7. Open the popup and add a website rule.

## GIF Backgrounds

Pump! can use a remote GIF URL as the bubble background. Open the popup, paste an `http` or `https` GIF URL into **Bubble background**, and save it.

The GIF file is not stored in this repository. If you save a remote GIF URL, your browser requests that image from the GIF host when the overlay is rendered.

Pump! samples readable image URLs to choose light or dark overlay text. If the image cannot be sampled, for example because the host blocks canvas access, Pump! uses a high-contrast fallback so the timer remains readable.

## Launch Audio

Pump! plays the packaged launch sound by default when the overlay starts. The default audio file lives at:

```text
assets/mountains.mp3
```

Open the popup to turn launch sound on or off, adjust volume, test playback, or import your own audio file. Imported audio is stored locally in `chrome.storage.local` and overrides the packaged default until you clear it.

When launch audio is enabled, Pump! syncs playback to timer progress:

- 0-15%: loop 0s-10s.
- 15-30%: loop 10s-32s.
- 30-45%: loop 32s-81s.
- 45-60%: loop 81s-108.5s.
- 60-72%: loop 108.5s-135s.
- 72-84%: loop 135s-151s.
- 84-95%: loop 151s-190s.
- 95-100%: stop looping and seek toward the capped ending.

Playback is capped at 3:28.

## Privacy

- Rules are stored locally in the browser.
- Pump! checks only the current hostname against your saved rules.
- No browsing data is sent to a server.
- No analytics are collected.
- The packaged default launch audio is bundled with the extension.
- Imported launch audio stays in local extension storage.
- Optional GIF URLs are stored locally, but the browser requests the remote GIF from the URL you save.
- The background worker only handles the `Close everything` overlay action.

## Permissions

Pump! requests `storage` to save rules, visual settings, and launch-sound settings locally with `chrome.storage.local`.

It requests `unlimitedStorage` so imported local audio can fit without the small default extension-storage quota.

The content script currently matches `<all_urls>` for MVP reliability. It immediately checks the current hostname and does nothing unless the hostname matches an enabled rule.
