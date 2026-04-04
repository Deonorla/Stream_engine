# Deployment Overview

The primary deployment target is **Stellar testnet**.

## Runtime components

The Stellar backend integration exposes these logical contracts/components:

| Component | Default id |
|----------|-------------|
| Session meter | `CDS4XG3PAOWRNFVFKMK7LKJEXFQIJXFAMX54F5T3EBNFLNOL3RMGSECX` |
| RWA registry / hub | `CCQ7RAHNLTGH2CF5BNNWAGFJLCB6EUV76K5ZQ4CWU42VF3FGZ5PJHNYK` |
| Asset twin | `CCQ7RAHNLTGH2CF5BNNWAGFJLCB6EUV76K5ZQ4CWU42VF3FGZ5PJHNYK` |
| Attestation registry | `CCSNBJYDCM546LAUAVUFXABRWRCAP7U77TTEU4CKHNXYQMU7BEWTYCGJ` |
| Yield vault | `CBBAIM4NMQEZ5RX3ZIII7SLTZSG5GYZ6DOCEPTQV6N37NYPCYLBL6ZQO` |
| Policy orchestrator | `stellar:policy-orchestrator` |

These are surfaced through `GET /api/engine/catalog`, the deployment manifest, and the backend env vars.

## Deployment notes

- the frontend, SDK, and CLI all point at the same Soroban session meter and Stellar runtime ids
- browser user actions use Freighter-backed Soroban signing where available
- the backend still handles admin/operator actions and indexed read views
- the active Stellar mint path should be low-friction and not require issuer signatures or issuer pre-approval
- placeholder aliases like `stellar:rwa-registry` should not be left in local runtime env files; use the real deployment ids or rely on manifest fallback
- session cancel/refund is a first-class backend path, and session metadata is synced back after live opens

## Demo checklist

1. `GET /api/health`
2. `GET /api/engine/catalog`
3. confirm Freighter is on Stellar testnet
4. confirm `DEMO_STELLAR_SENDER` is configured for CLI smoke
5. confirm the backend is pointed at the permissionless-mint registry deployment
6. mint asset
7. verify asset
8. start rental session
9. cancel/end rental and inspect refund state
10. fund yield and claim yield
