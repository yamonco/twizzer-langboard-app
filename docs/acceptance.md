# Acceptance gates

This repository is the public Twizzer package boundary. It is intentionally independent from FractalOps.

## Complete in this repository

- Langboard package declaration schema 2 with `panels.render`, `cards.create`, `cards.read`, and `resources.read`.
- Explicit `card_lifecycle` policy for element feedback cards.
- Deterministic package build and public-data scan.
- Purple cursor store icon.
- Public GitHub release asset.

## Host gates

- Langboard administrator installs and approves the release package.
- A board administrator grants the declared capabilities and selects a `site` resource.
- The MV3 extension completes native OAuth PKCE and board discovery through the selected Langboard host.
- The extension's selected-element workflow calls the approved native card command.
- Current-screen and full-page evidence require a separately approved Langboard attachment capability. The current SDK declaration set does not define `attachments.write`, so no attachment success is claimed by this release.
- VM105 Chrome acceptance must prove one created card, duplicate-safe retry, expired-session recovery, and both evidence receipts after the host attachment contract exists.
