# API Reference

The backend exposes two main surfaces:

- **x402/payment endpoints** for paid HTTP resources
- **RWA endpoints** for productive rental twins, evidence, attestations, and verification

## Core Ideas

- HTTP 402 is the payment negotiation layer
- stream contracts are the settlement layer
- RWA v2 verification is evidence + attestation + status driven

## Important Note

RWA v2 does **not** expose raw deed, tax, insurance, or KYC documents publicly. Those stay in the private evidence vault. API responses expose:

- public metadata
- evidence roots / manifest hashes
- evidence summaries
- attestation coverage
- verification status

See [x402 Headers](x402-headers.md), [Middleware](middleware.md), and [Endpoints](endpoints.md).
