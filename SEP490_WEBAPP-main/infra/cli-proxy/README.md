# CLIProxyAPI sidecar (optional POC)

This service lets the SEP490 backend call OAuth-backed Codex/Claude accounts through an OpenAI-compatible private gateway. It does not replace the existing API-key providers.

The compose file pins the reviewed upstream release `v7.2.47` instead of tracking `latest`. Review upstream changes before overriding `CLI_PROXY_IMAGE`.

## Security boundary

- OAuth files stay in `infra/cli-proxy/auths/` and are never stored in MongoDB or returned to the browser.
- Port 8317 and OAuth callback ports bind to `127.0.0.1` for the local demonstration. `allow-remote` is enabled inside the container only to accept Docker bridge traffic; the strong Management key remains mandatory.
- The Management API is disabled until `remote-management.secret-key` is configured.
- Only an Admin-facing backend route may call Management API endpoints.
- Keep API-key fallback enabled because subscription OAuth availability and quotas are provider-specific.

## Local setup

1. Run `powershell -ExecutionPolicy Bypass -File scripts/setup-cli-proxy.ps1`. It creates ignored runtime files and does not print secrets.
2. Do not rerun with `-RotateSecrets` while the sidecar/backend are running; that switch intentionally rotates both local secrets.
3. Start with:

   `docker compose -f docker-compose.oauth.yml --profile oauth-gateway up -d`

Do not publish these ports on a public server without TLS, reverse-proxy callback validation, per-user account isolation, and a separate management network.
