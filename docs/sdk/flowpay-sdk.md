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
  rpcUrl: 'https://westend-asset-hub-eth-rpc.polkadot.io',
  privateKey: process.env.PRIVATE_KEY,
  adapter, // optional Substrate adapter
  token: {
    symbol: 'USDC',
    decimals: 6,
  },
  agentId: 'stream-engine-agent',
});
```

## Important Notes

- the current runtime token is Circle `USDC`
- the SDK can operate with an EVM signer or the `FlowPaySubstrateAdapter`
- the SDK expects `paymentToken()` on the stream contract when it needs to resolve the token address on-chain
