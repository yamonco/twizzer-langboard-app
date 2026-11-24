# Twizzer Langboard app

Twizzer is a standalone Langboard external app. It has no FractalOps runtime dependency.

The Chrome MV3 extension uses Langboard native OAuth with PKCE. Users choose their Langboard HTTPS instance, authenticate in the host SSO page, and select a board they can access. Twizzer stores no Langboard password.

The app declaration requests `cards.create`, `cards.read`, `resources.read`, and `attachments.write` for `site` resources. Langboard owns board Backlog mapping and resource consent. Twizzer submits element feedback through the Langboard SDK `AppCards` API and reads card and attachment receipts for idempotent retry handling.

## Catalog package

`manifest.json` is a portable Langboard app package. `assets/twizzer-cursor.svg` is the purple cursor app icon. The package contains no credentials, tenant identifiers, private URLs, or customer data.

Install through the Langboard administrator package catalog or manual package upload. Approve the declaration first, then grant the Twizzer app on the target board, select the approved `site` resource, and issue a connection credential. These are separate host-controlled actions.

## OAuth contract

The host supplies the current native OAuth discovery URL. Twizzer expects PKCE authorization, dynamic client registration, `mcp:access`, and `get_projects` board discovery. A deployment must expose the connection-scoped `/mcp/oauth` discovery and callback endpoints. The extension callback is registered by the host during dynamic client registration.

## Development

The app package is static and contains no build-time secret. The production panel is served by Langboard's package host. Keep the Twizzer service and MV3 extension in their own repositories and consume only the public package declaration and Langboard SDK contracts.
