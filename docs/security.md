# Security boundary

- Langboard owns identity, OAuth, board membership, app approval, site resource consent, and connection credentials.
- Twizzer never asks for or stores a Langboard password.
- The extension uses HTTPS origins, PKCE, state validation, issuer validation, and connection-scoped tokens.
- App cards use stable request IDs. Unknown writes are reconciled through Langboard receipt reads before retry.
- Capture files are temporary and expire after upload or a bounded retention period.
- This public repository must contain no secrets, customer URLs, tokens, cookies, or exported screenshots.
