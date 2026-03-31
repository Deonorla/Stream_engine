# AI Decision Engine

Stella's Stream Engine uses an AI-assisted strategy layer to decide **how** to satisfy a payment request, not whether a route is paid.

## What It Does

Given an x402-style payment challenge, the decision layer can choose between:

- direct payment
- reusable stream creation
- reuse of an existing stream

## Current Implementation

The active SDK runtime wires this through:

- `StreamEngineSDK`
- `GeminiPaymentBrain`
- `SpendingMonitor`

The decision layer is advisory. Settlement still happens through the payment contracts and middleware checks.

## Why It Matters

Agent workloads often call the same paid route repeatedly. The decision engine helps move those requests away from repeated one-off transfers and toward cheaper reusable streams when that is appropriate.

## RWA Relation

On the productive-RWA side, the same idea applies:

- decide when to fund or extend a rental stream
- decide when an existing stream is enough
- enforce spending guardrails before the renter overspends
