# Frequently Asked Questions

## General

### What is Stella's Stream Engine?

Stella's Stream Engine is an `x402`-compatible payment and settlement stack for AI agents and rental RWAs.

It combines:

- machine-readable HTTP payment discovery
- reusable payment sessions for agent workloads
- verification, provenance, and yield streaming for rental assets

### What problem does Stella's Stream Engine solve?

It solves the agent payment efficiency problem.

Without a reusable settlement rail, a naive paid API flow can require a fresh onchain payment for every request. Stella's Stream Engine reduces that repeated execution overhead by letting an agent open one session and reuse it across many requests.

### Is Stella's Stream Engine replacing x402?

No.

`x402` is the paywall handshake.
Stella's Stream Engine is the settlement layer behind that handshake.

The clean model is:

- `x402` says: "payment is required, here are the terms"
- `Stella's Stream Engine` says: "satisfy that requirement with direct settlement or a reusable session"

### Why is x402 useful here?

Because agents need a standard way to discover:

- that payment is required
- which token is accepted
- who should be paid
- how much is required
- what proof the server expects

That is the role of `HTTP 402 Payment Required` plus machine-readable headers.

## Technical

### Which network is the current target?

The active hackathon runtime is **Stellar testnet**.

### What payment asset does Stella's Stream Engine use?

Stellar test **USDC** via SAC:

- settlement mode: `soroban-sac`
- asset code: `USDC`
- decimals: `7`

### What does the middleware do?

The middleware is the enforcement bridge between HTTP and onchain state.

Its job is to:

1. inspect the request
2. determine whether the route is free, direct-pay, or streaming
3. return a 402 response when payment is required
4. verify session or payment proof when the client retries
5. serve the resource when payment requirements are satisfied

### Does Stella's Stream Engine require a new payment for every API call?

Not when streaming is used.

The point of the system is to keep the `x402` negotiation layer while avoiding a fresh onchain payment for every repeated call.

### How is session balance calculated?

```text
flowRate = totalAmount / duration
claimable = (flowRate * secondsElapsed) - amountWithdrawn
```

### Can a sender end a session early?

Yes.

When a session is cancelled:

- the service keeps what has already accrued
- the sender recovers unused balance

## Agent Usage

### Why is this especially useful for AI agents?

Agents need:

- programmatic payment discovery
- automatic authorization
- low-friction repeated access
- clear limits and controls

Human billing flows tolerate checkout pages and manual confirmations. Agent workloads do not.

### What does the SDK actually do?

The SDK is the runtime that:

1. makes a request
2. receives a 402 response
3. parses the payment terms
4. decides direct settlement vs streaming
5. executes the payment path
6. retries the request

### Does Stella's Stream Engine only work for streaming payments?

No.

The architecture supports both:

- direct settlement for low-frequency routes
- reusable sessions for high-frequency routes

That is why route mode and runtime policy both matter.

## RWA

### How do RWAs fit into Stella's Stream Engine?

The RWA lane uses the same payment and streaming mindset for rental assets:

- owners keep the NFT and financial rights
- renters open a metered payment session for real-world access
- metadata is pinned to IPFS
- QR or NFC payloads can be verified against the onchain registry and indexed activity

### What does verification check?

Verification checks:

1. sanitized public metadata from IPFS
2. property reference, public metadata hash, and evidence roots against the registry
3. attestation coverage and document freshness
4. indexed activity history and policy state for provenance

## Naming

### Why do I still see "FlowPay" names in code?

Some internal classes still use earlier implementation-era names such as `FlowPaySDK` and `FlowPayRWAClient`. The product name and runtime story are Stella's Stream Engine.
