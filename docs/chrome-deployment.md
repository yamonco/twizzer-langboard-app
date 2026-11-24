# Deploy the Twizzer Chrome extension

Twizzer ships a Chrome extension and a Langboard catalog package. Install the
catalog package on the Langboard instance and distribute the extension through
the Chrome Web Store. Use an unpacked build only for development and QA.

| Artifact | Installer | Source |
| --- | --- | --- |
| `twizzer-chrome-<version>.zip` | Chrome Web Store Developer Dashboard | `extension/` |
| `twizzer-<version>.zip` | Langboard official catalog or administrator package upload | Root app manifest and `panel/` |

## Build the Chrome ZIP

Build from a clean, reviewed commit using Node.js 22, npm and Python 3:

```sh
npm ci
node --test extension/langboard.test.js
npm run build:extension
python3 scripts/validate_package.py
python3 scripts/package_extension.py
```

The build produces `dist/extension/` and `dist/twizzer-chrome-<version>.zip`.
The ZIP places the MV3 `manifest.json` at its root and contains only extension
runtime assets. Record the source commit and printed SHA-256 in the release
notes. Increment `extension/manifest.json`'s version before uploading a Chrome
Web Store update. Catalog and extension versions can change independently.

## Run an unpacked QA build

1. Open `chrome://extensions` in a designated QA Chrome profile. Enable Developer
   mode and load `dist/extension/` using **Load unpacked**. If using a ZIP, verify
   its SHA-256, then extract it first.
2. Read the installed ID on that page. The current source manifest pins the
   unpacked QA ID `acnaiajbmlbcgdfpecnbcmaaoncnaopi` with a public key.
3. Configure the Langboard QA host for the installed ID using the settings below.
   Install the Twizzer catalog package on that host. Grant the app on a QA board,
   map Backlog, select an approved site resource and obtain an authorized Twizzer
   connection credential from the board administrator.

## Configure Langboard and OAuth

Set the server to the Langboard API HTTPS origin. Twizzer expects the native
OAuth issuer at `<api-origin>/mcp/oauth` and uses dynamic public-client
registration with PKCE S256 and the `mcp:access` scope.

| Setting | Required value |
| --- | --- |
| Browser extension origin | `chrome-extension://<installed-extension-id>` |
| Browser OAuth redirect | `https://<installed-extension-id>.chromiumapp.org/callback` |
| Upstream identity provider redirect, such as Keycloak | `<api-origin>/mcp/oauth/auth/callback` |
| Authorization-server metadata | `<api-origin>/.well-known/oauth-authorization-server/mcp/oauth` |
| Native OAuth readiness | `<api-origin>/mcp/oauth/readyz` |

Use exact origins and redirects. Confirm discovery returns JSON with the expected
issuer and that readiness returns HTTP 200. The browser redirect belongs to the
native OAuth public client. The upstream callback belongs to the dedicated
identity provider client. Keep its secret and the Langboard OAuth signing key in
the host's secret store. See [Chrome identity](https://developer.chrome.com/docs/extensions/reference/api/identity).

The site grant and connection credential authorize app-card creation on the
selected board. The signed-in person's Langboard account needs card update
permission to attach screenshots to the created card. Do not publish or share
connection credentials.

## Publish through the Chrome Web Store

1. Use the project's publisher account in the Chrome Developer Dashboard. Create
   the Twizzer item once. For updates, upload to that same item to preserve the
   production identity.
2. Upload `dist/twizzer-chrome-<version>.zip`. Confirm the version and the Store
   item ID. The generated unpacked QA ID may differ. To test with the Store ID in
   an unpacked build, use that item's public key and verify the actual Chrome ID.
   Update the production OAuth origin and redirect to match before rollout.
3. Complete the English listing, screenshot assets, privacy disclosures and
   distribution settings. Explain that Twizzer sends the selected element, issue
   text and both user-reviewed screenshots to the chosen Langboard instance.
   Explain that it requests host access when the user connects to their API.
   Supply a privacy policy and use sample pages and a non-production board in
   review instructions. Keep reviewer access details in the Store dashboard.
4. Submit for review. Install the approved build from the Store and run the
   acceptance flow below before broad distribution. Record the Store item ID,
   extension version, source commit and ZIP digest.

See Google's [publishing guide](https://developer.chrome.com/docs/webstore/publish),
[manifest key guide](https://developer.chrome.com/docs/extensions/reference/manifest/key)
and [user data guidance](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

## Verify the installed release

On an authorized test page, open Twizzer, sign in through Langboard OAuth, select
a board and then a page element. Inspect the current-screen and full-page
previews. Submit one issue and confirm that Langboard shows Twizzer as the owning
app. Open both attachments from that card and verify that the full-page image
includes content below the first viewport. Save the card link and attachment
identities in the release record. Keep customer screenshots and credentials out
of the repository and release assets.

If a request is interrupted, keep the panel open while reconciling the card and
attachment records. Check for the existing card before recreating a submission
from a closed panel. Sign in again if the user OAuth session expires.

## Release the Langboard catalog package

Build the separate catalog artifact with `python3 scripts/build_package.py`.
Publish it with the stable GitHub release and its light/dark catalog icons. Use
the exact asset name configured in the Langboard official catalog for the
target release. A Chrome QA prerelease must leave the stable catalog ZIP and
catalog release selection intact. Install the catalog package and verify board
consent before testing the Chrome release.
