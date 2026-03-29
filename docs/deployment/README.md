# Deployment Overview

The primary hackathon deployment target is now **Stellar testnet**.

## Supported runtime

| Network | Status | Settlement | Notes |
|---------|--------|------------|-------|
| Stellar Testnet | Primary | USDC via SAC | current hackathon path |
| Polkadot Westend Asset Hub | Legacy | Circle USDC asset `31337` | archived demo path |

## Runtime components

The Stellar backend integration exposes these logical contracts/components:

| Component | Default id |
|----------|-------------|
| Session meter | `stellar:session-meter` |
| RWA registry / hub | `stellar:rwa-registry` |
| Asset NFT | `stellar:rwa-nft` |
| Attestation registry | `stellar:rwa-attestation` |
| Yield vault | `stellar:yield-vault` |
| Policy / compliance | `stellar:policy` |

These are surfaced through `GET /api/engine/catalog` and the backend env vars.

## Deployment notes

- the frontend no longer depends on direct contract writes for the active demo path
- browser and CLI integrations go through the backend relay/session model
- issuer approval is explicit and should be completed before mint demos
- session cancel/refund is now a first-class backend path

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
10. fund yield stream and claim yield

## Legacy note

The old Westend deployment docs still exist in the repo for historical reference, but they should not be treated as the primary hackathon path.
