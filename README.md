# Twizzer Langboard app

Twizzer is a standalone Langboard external app. It has no FractalOps runtime dependency.

## Chrome extension

Build with Node.js 22 or later.

```sh
npm ci
npm run build:extension
node --test extension/langboard.test.js
```

Load `dist/extension` as an unpacked extension, then click Twizzer in the toolbar on the page you want to review. Enter your Langboard API HTTPS origin and sign in using its native OAuth provider. Twizzer lists the boards visible to your account. Pick a board and supply its approved site resource ID and a Twizzer app-connection credential for that board. The credential fields and access token stay in the open side panel’s memory.

Select an element, review both screenshots and submit. The app-connection credential creates the app-owned card. The signed-in user must have native permission to edit the card and add attachments. Twizzer uploads through the Langboard native attachment action and reads back both attachment records. Keep the panel open until completion to retain the request identity and captures for reconciliation.

The extension requires the Langboard OAuth server at `/mcp/oauth`, dynamic public-client registration, PKCE and `mcp:access`. Allow the exact installed extension origin and its Chrome identity redirect URL. The QA host operator configures the upstream identity provider callback separately.

See the [Chrome deployment guide](docs/chrome-deployment.md) for release packaging, OAuth configuration, and Chrome Web Store publication.

## Catalog package

`manifest.json` is a portable Langboard app package. `panel/assets/twizzer-cursor.svg` is the purple cursor app icon. The package contains no credentials, tenant identifiers, private URLs, or customer data.

Install through the Langboard administrator package catalog or manual package upload. Approve the declaration first, then grant the Twizzer app on the target board, select the approved `site` resource, and issue a connection credential. These are separate host-controlled actions.
