# Frequently Asked Questions

## General

### What is Stream Engine?

Stream Engine is an `x402`-compatible payment and settlement stack for AI agents and rental RWAs.

It combines:

- machine-readable HTTP payment discovery
- reusable payment streams for agent workloads
- verification, provenance, and yield streaming for rental assets

### What problem does Stream Engine solve?

It solves the agent payment efficiency problem.

Without a reusable settlement rail, a naive paid API flow can require a fresh onchain payment for every request. Stream Engine reduces that repeated execution overhead by letting an agent open one stream and reuse it across many requests.

### Is Stream Engine replacing x402?

No.

`x402` is the paywall handshake.
Stream Engine is the settlement layer behind that handshake.

The clean model is:

- `x402` says: "payment is required, here are the terms"
- `Stream Engine` says: "satisfy that requirement with direct settlement or a reusable stream"

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

The verified deployment target is **Polkadot Westend Asset Hub**.

### What payment asset does Stream Engine use?

Circle test **USDC** on Westend Asset Hub:

- asset id: `31337`
- decimals: `6`

### What does the middleware do?

The middleware is the enforcement bridge between HTTP and onchain state.

Its job is to:

1. inspect the request
2. determine whether the route is free, direct-pay, or streaming
3. return a 402 response when payment is required
4. verify stream or payment proof when the client retries
5. serve the resource when payment requirements are satisfied

### Does Stream Engine require a new payment for every API call?

Not when streaming is used.

The point of the system is to keep the `x402` negotiation layer while avoiding a fresh onchain payment for every repeated call.

### How is stream balance calculated?

```text
flowRate = totalAmount / duration
claimable = (flowRate * secondsElapsed) - amountWithdrawn
```

### Can a sender cancel a stream early?

Yes.

When a stream is cancelled:

- the recipient keeps what has already accrued
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

### Does Stream Engine only work for streaming payments?

No.

The architecture supports both:

- direct settlement for low-frequency routes
- reusable streaming for high-frequency routes

That is why route mode and runtime policy both matter.

## RWA

### How do RWAs fit into Stream Engine?

The RWA lane uses the same payment and streaming mindset for rental assets:

- owners keep the NFT and financial rights
- renters stream payment for real-world access
- metadata is pinned to IPFS
- QR or NFC payloads can be verified against the onchain registry and indexed activity

### What does verification check?

Verification checks:

1. metadata from IPFS
2. CID and tag hashes against the registry
3. indexed activity history for provenance

## Compatibility

### Why do I still see "FlowPay" names in code and contracts?

Because some identifiers are kept for compatibility while the product is now branded as **Stream Engine**.

Examples include:

- `FlowPaySDK`
- `FlowPayStream`
- `FlowPayRWAHub`

Those names are implementation-era carryovers, not the product name.
