# Wall Lab

A Chrome extension for testing CNN paywalls on a local content-hub stack. You
toggle regional flags, location, page gates, and client env flags from one
popup, save combinations as named setups, and switch between them with a reload.
You do not edit `dynamic-config.json` or restart the app.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Pin **Wall Lab** to the toolbar.

After editing a source file, click the reload icon on the extension card, then
reload the CNN tab.

## Use

1. Open a local article, for example `https://localhost.cnn.com/2026/...`.
2. Open the popup. Click a preset or saved setup to load it into the form, or
   set fields by hand. Every field defaults to **inherit**, which keeps the
   local stack's value; the grey hint shows what the page has.
3. Click **Apply and reload**. A purple badge in the bottom-left corner names the
   active setup, so an overridden page is never mistaken for a clean one.
4. Use **Reset meters** to clear the paywall and regwall meter keys in
   `localStorage`, then reload.
5. **Save** stores the form under a name. Saving with an existing name replaces it.
6. **Clear overrides** drops the active setup, puts `countryCode`, `stateCode`, and `geoData` back to the values this host had before the first apply, and reloads. Env flags, regional flags, and page gates are the local stack's again.

Saved setups live in `chrome.storage.local` for your Chrome profile. The active
setup lives in the local origin's `localStorage` (`wallLab:active`), so each local
host keeps its own.

## How it works

`src/hook.js` runs in the page's main world at `document_start`, before the
inline `<script>window.env = {...}</script>` content-hub writes into `<head>`.
It reads the active setup, then:

| What             | How                                                                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Location         | Sets the `countryCode` cookie, which the consent library reads for geo. Choosing US, UK, or CA also adds that region to `ALL_ACCESS_ENABLED_REGIONS`, unless you override that key yourself. |
| Regional flags   | Merges your overrides into that region's entry in `window.env['DYNAMIC_CONFIG.paywall_regional_flags']`. `getRegionFlag()` reads it at call time.                                            |
| Client env flags | Merges into `window.env`, for example `PAYWALL_FEATURE_ENABLED` or `WATCH_PAYWALL_ENABLED`.                                                                                                  |
| Page gates       | Rewrites `data-show-paywall`, `data-show-regwall`, and `data-subscription-only` on elements that already carry them, as the page parses and before the client bundle runs.                   |

## What it cannot fake

- **Identity.** Logged in, subscriber, and All Access come from the real Zion
  session. Use real test accounts for those.
- **Server-side decisions.** Client env overrides change browser reads only.
  Anything the server decides from `.env` while rendering stays as rendered.
  The page-gate overrides cover the article and live-story wall attributes, but
  not other server-built markup or `window.CNN.metadata` (used by
  `trigger-wall.js` on non-article pages).
- **Prices.** Product and price data still come from the stack's normal sources.

## Keeping it in sync with content-hub

`src/popup/fields.js` mirrors keys from content-hub. Update it when one of these
changes:

- `FLAG_DEFAULTS` in `app/services/client/user-account-reg-wall/region-config.js`
- the client allowlist in `app/app.js`
- the wall data attributes in the `article` and `live-story` templates
- variation and offer values in `wall-data.js` and `subscription-offerings.js`

Presets live in `src/popup/presets.js`.
