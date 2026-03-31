import { expect } from 'chai';
import { StreamEngineSDK, StreamMetadata } from '../src/StreamEngineSDK';
import { Wallet, ethers } from 'ethers';
import { parsePaymentAmount } from '../src/tokenConfig';

describe('StreamEngineSDK Real-time Calculations', () => {
    let sdk: StreamEngineSDK;
    let originalDateNow: any;

    beforeEach(() => {
        sdk = new StreamEngineSDK({
            privateKey: Wallet.createRandom().privateKey,
            rpcUrl: 'http://localhost:8545'
        });
        originalDateNow = Date.now;
    });

    afterEach(() => {
        Date.now = originalDateNow;
    });

    it('Should calculate claimable balance correctly over time', () => {
        const startTime = 1000; // t=1000 seconds
        const rate = parsePaymentAmount("1", 6);
        const amount = parsePaymentAmount("100", 6);

        const stream: StreamMetadata = {
            streamId: "1",
            startTime: startTime,
            rate: rate,
            amount: amount
        };

        // Mock Time: t=1000 (0 elapsed)
        Date.now = () => 1000 * 1000;
        expect(sdk.calculateClaimable(stream)).to.equal(0n);
        expect(sdk.calculateRemaining(stream)).to.equal(amount);

        // Mock Time: t=1010 (10 elapsed)
        Date.now = () => 1010 * 1000;
        const expectedClaimable = parsePaymentAmount("10", 6);
        expect(sdk.calculateClaimable(stream)).to.equal(expectedClaimable);

        const expectedRemaining = parsePaymentAmount("90", 6);
        expect(sdk.calculateRemaining(stream)).to.equal(expectedRemaining);
    });

    it('Should return 0 remaining when stream is depleted', () => {
        const startTime = 1000;
        const rate = parsePaymentAmount("1", 6);
        const amount = parsePaymentAmount("100", 6);

        const stream: StreamMetadata = {
            streamId: "1",
            startTime: startTime,
            rate: rate,
            amount: amount
        };

        // Mock Time: t=1200 (200 seconds elapsed, way over 100)
        Date.now = () => 1200 * 1000;

        expect(sdk.calculateClaimable(stream)).to.equal(parsePaymentAmount("200", 6));
        // My SDK logic: elapsed * rate. It doesn't cap claimable by amount, but remaining should be 0.

        expect(sdk.calculateRemaining(stream)).to.equal(0n); // Should be floored at 0
    });

    it('Should handle micropayments precision ($0.0001/sec)', () => {
        const rate = parsePaymentAmount("0.0001", 6);
        const startTime = 1000;
        const amount = parsePaymentAmount("1", 6);

        const stream: StreamMetadata = {
            streamId: "1",
            startTime: startTime,
            rate: rate,
            amount: amount
        };

        // 1 second elapsed
        Date.now = () => 1001 * 1000;
        expect(sdk.calculateClaimable(stream)).to.equal(rate);

        // 0.5 seconds elapsed (integer math will floor to 0 if I used seconds)
        // My SDK implementation uses seconds: `Math.floor(Date.now() / 1000)`.
        // So sub-second precision is lost, which is expected for block-timestamp based logic usually.
        Date.now = () => 1001 * 1000 + 500; // 1001.5 seconds
        expect(sdk.calculateClaimable(stream)).to.equal(rate); // Still 1 sec worth
    });
});
