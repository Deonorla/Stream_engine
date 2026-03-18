# GeminiPaymentBrain

`GeminiPaymentBrain` is the AI-assisted strategy helper used by the SDK.

## Purpose

- inspect expected usage
- estimate whether repeated access is likely
- prefer stream reuse when that is cheaper or safer

## Boundary

It does **not** settle payments itself. Settlement still happens through the SDK, contracts, and middleware.
