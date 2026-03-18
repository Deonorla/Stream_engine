# Endpoints

## Payment and Catalog

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/engine/catalog` | runtime config for frontend and SDK |
| `GET` | `/api/free` | free sample route |
| `GET` | `/api/weather` | paid route used in x402 demos |
| `GET` | `/api/premium` | premium paid route |

## RWA v2

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/rwa/ipfs/metadata` | pin sanitized public metadata |
| `POST` | `/api/rwa/evidence` | store private evidence bundle and return roots |
| `POST` | `/api/rwa/assets` | mint a verified rental twin |
| `GET` | `/api/rwa/assets` | list hydrated assets |
| `GET` | `/api/rwa/assets/:tokenId` | fetch one hydrated asset |
| `GET` | `/api/rwa/assets/:tokenId/activity` | fetch indexed activity |
| `POST` | `/api/rwa/attestations` | register or revoke attestation |
| `POST` | `/api/rwa/verify` | return structured verification result |

## Verification Response Shape

`POST /api/rwa/verify` returns:

- `status`
- `checks`
- `warnings`
- `failures`
- `requiredActions`
- `evidenceCoverage`
- `attestationCoverage`
- `documentFreshness`
- `asset`
- `activity`

## Migration Note

Legacy v1 assets are still supported. They return:

- `legacy_verified`
- `legacy_incomplete`

Those statuses mean the asset is still using the older CID/tag model instead of the v2 evidence + attestation workflow.
