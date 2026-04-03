# Deployment Overview

The primary deployment target is **Stellar testnet**.

## Runtime components

The Stellar backend integration exposes these logical contracts/components:

| Component | Default id |
|----------|-------------|
| Session meter | `stellar:session-meter` |
| RWA registry / hub | `stellar:rwa-registry` |
| Asset twin | `stellar:rwa-twin` |
| Attestation registry | `stellar:rwa-attestation` |
| Yield vault | `stellar:yield-vault` |
| Policy orchestrator | `stellar:policy-orchestrator` |

These are surfaced through `GET /api/engine/catalog`, the deployment manifest, and the backend env vars.

## Deployment notes

- the frontend, SDK, and CLI all point at the same Soroban session meter and Stellar runtime ids
- browser user actions use Freighter-backed Soroban signing where available
- the backend still handles admin/operator actions and indexed read views
- issuer approval is explicit and should be completed before mint demos
- session cancel/refund is a first-class backend path, and session metadata is synced back after live opens

## Demo checklist

1. `GET /api/health`
2. `GET /api/engine/catalog`
3. confirm Freighter is on Stellar testnet
4. confirm `DEMO_STELLAR_SENDER` is configured for CLI smoke
5. confirm the backend admin signer is configured so issuer onboarding can happen automatically during mint
6. mint asset
7. verify asset
8. start rental session
9. cancel/end rental and inspect refund state
10. fund yield and claim yield
