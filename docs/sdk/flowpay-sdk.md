# FlowPaySDK

`FlowPaySDK` is the main agent runtime class. The product is now **Stream Engine**, but the exported class name remains for compatibility.

## Role

The SDK:

1. makes the HTTP request
2. intercepts `402 Payment Required`
3. parses the payment requirements
4. chooses direct payment vs streaming
5. executes settlement
6. retries automatically

## Constructor Shape

```typescript
const sdk = new FlowPaySDK({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  privateKey: process.env.PRIVATE_KEY,
  adapter, // optional runtime adapter such as FlowPayStellarAdapter
  token: {
    symbol: 'USDC',
    decimals: 7,
  },
  agentId: 'stream-engine-agent',
});
```

## Important Notes

- the current runtime token is Circle `USDC`
- the SDK can operate with a direct signer or a runtime adapter such as `FlowPayStellarAdapter`
- on the active hackathon path, the SDK consumes the catalog and session endpoints instead of talking directly to a Westend stream contract
