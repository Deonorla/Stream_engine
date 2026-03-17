# Deployment Overview

The supported deployment target for this repo is **Westend Asset Hub**.

## Supported Runtime

| Network | Status | Chain ID | Gas | Payment Asset |
|---------|--------|----------|-----|---------------|
| Westend Asset Hub | Active | `420420421` | `WND` | `Circle USDC (31337)` |

## Deployed Contracts

| Contract | Address |
|----------|---------|
| FlowPayStream | `0x75edbf3d9857521f5fb2f581c896779f5110a8a0` |
| FlowPayAssetNFT | `0x0340b3f493bae901f740c494b2f7744f5fffe348` |
| FlowPayAssetRegistry | `0x9db31d67bd603508cfac61dcd31d98dfbd46cf5f` |
| FlowPayComplianceGuard | `0x72a979756061c5993a4c9c95e87519e9492dd721` |
| FlowPayAssetStream | `0x2d6bda7095b2d6c9d4eee9f754f2a1eba6114396` |
| FlowPayRWAHub | `0x1286a0fe3413dd70083df2d654677a7c39096753` |

## Deploy Commands

```bash
npm run deploy:westend:substrate
npm run deploy:rwa:westend:substrate
```

## Notes

- the verified path uses native Substrate `revive` reads and writes
- Circle test USDC lives on Westend Asset Hub as asset id `31337`
- legacy `westmint` script names still exist as aliases for compatibility
