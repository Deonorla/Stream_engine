# Production Checklist

This repo currently targets **Westend Asset Hub** for active testing. Before any production-like deployment, confirm:

## Payment

- x402 middleware routes are configured
- Circle USDC asset and decimals are correct
- stream contract and recipient addresses are set

## RWA v2

- attestation registry is deployed and configured
- issuer approval policy is active
- attestation policy is defined per asset type
- private evidence vault storage is configured
- public metadata pinning is configured
- indexer persistence is configured

## Product Claims

Do not market the RWA NFT as direct legal deed transfer unless you add jurisdiction-specific legal integration. The current model is:

- verified rental twin
- evidence-backed verification
- ownership-linked rental yield
