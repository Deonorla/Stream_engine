# Middleware

The backend middleware is the bridge between HTTP and onchain state.

## Payment Responsibilities

- emit x402-compatible `402 Payment Required` responses
- describe accepted token, recipient, and settlement mode
- validate direct-payment proof or stream proof
- allow free routes to bypass payment checks

## RWA Responsibilities

The RWA endpoints are separate from the payment middleware, but they follow the same principle:

- accept structured requests
- anchor state onchain
- hydrate results from the indexer and private evidence vault
- return machine-readable verification results

## Why This Matters

Without middleware, the contracts are only contracts. Middleware turns them into usable web payment and verification primitives.
