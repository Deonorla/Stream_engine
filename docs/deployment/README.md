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

These are surfaced through `GET /api/engine/catalog` and the backend env vars.

## Deployment notes

- the frontend uses backend relay/session endpoints for the active runtime
- browser and CLI integrations go through the same Stellar session model
- issuer approval is explicit and should be completed before mint demos
- session cancel/refund is a first-class backend path

## Demo checklist

1. `GET /api/health`
2. `GET /api/engine/catalog`
3. confirm Freighter is on Stellar testnet
4. confirm `DEMO_STELLAR_SENDER` is configured for CLI smoke
5. confirm issuer onboarding exists before mint
6. mint asset
7. verify asset
8. start rental session
9. cancel/end rental and inspect refund state
10. fund yield and claim yield
