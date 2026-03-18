# Provider Integration

Providers integrate Stream Engine in two layers:

## HTTP Layer

- expose paid routes
- return x402-compatible `402` responses
- verify proof on retry

## Optional RWA Layer

If the provider issues productive RWAs, it can also:

- mint rental twins
- anchor evidence roots
- record attestations
- return verification reports

## Minimum Inputs

- recipient address
- stream contract address
- payment token address
- route pricing / mode
