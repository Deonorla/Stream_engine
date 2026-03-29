# Troubleshooting

> Legacy note: Westend/Substrate troubleshooting below applies to the archived Polkadot demo path. Use the Stellar runbook first for the active hackathon flow.

## `ERR_CONNECTION_REFUSED` on `localhost:3001`

The backend is not running. Use:

```bash
npm run start:all
```

## Stream created but not visible in the UI

Confirm the frontend is not relying on unsupported `eth_newFilter` subscriptions for Westend and refresh the registry view.

## RWA verify returns `legacy_*`

The asset is still using the old CID/tag model. Migrate it to the v2 evidence + attestation workflow.

## RWA verify returns `verified_with_warnings`

The frontend is likely using its cached registry snapshot because the backend verifier is unavailable. Start the backend with `npm run start:all` and re-run the verification flow to get live evidence and attestation checks.

## Native approval setup errors on Westend

The wallet may only be exposing an EVM account. Native Westend approvals require the mapped Substrate account when the app uses the native approval path.
