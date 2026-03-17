# Smart Contracts

Stream Engine uses Solidity contracts deployed on **Westend Asset Hub**.

## Payment Rail

| Contract | Purpose |
|----------|---------|
| `FlowPayStream` | reusable payment streams for x402-protected services |

## RWA Suite

| Contract | Purpose |
|----------|---------|
| `FlowPayAssetNFT` | rental asset NFT |
| `FlowPayAssetRegistry` | provenance and verification hashes |
| `FlowPayComplianceGuard` | compliance / freeze state |
| `FlowPayAssetStream` | asset-bound yield streams |
| `FlowPayRWAHub` | orchestration layer |

## Payment Asset

The contracts use **Circle USDC** on Westend Asset Hub:

- asset id: `31337`
- decimals: `6`
- precompile: `0x00007a6900000000000000000000000001200000`

## Next Steps

- [FlowPayStream Details](flowpaystream.md)
- [Circle USDC Integration](circle-usdc.md)
- [Events & Errors](events-errors.md)
