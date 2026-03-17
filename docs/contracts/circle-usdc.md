# Circle USDC Integration

The project uses **Circle test USDC** on **Westend Asset Hub**.

## Asset Details

| Item | Value |
|------|-------|
| Symbol | `USDC` |
| Decimals | `6` |
| Asset ID | `31337` |
| Precompile | `0x00007a6900000000000000000000000001200000` |

## How It Is Used

- x402 payment streams
- direct settlement fallback
- rental RWA funding
- yield withdrawals and flash-advance accounting

## Important Constraint

This asset is not mintable from the app. Test balances must be funded externally on Westend Asset Hub.
