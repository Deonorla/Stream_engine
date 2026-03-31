const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StreamEngineStream", function () {
    let StreamEngineStream;
    let stellaStream;
    let MockUSDC;
    let mockUSDC;
    let owner;
    let recipient;
    let otherAccount;
    const parseUsdc = (value) => ethers.parseUnits(value, 6);

    beforeEach(async function () {
        [owner, recipient, otherAccount] = await ethers.getSigners();

        MockUSDC = await ethers.getContractFactory("MockUSDC");
        mockUSDC = await MockUSDC.deploy();
        await mockUSDC.waitForDeployment();

        StreamEngineStream = await ethers.getContractFactory("StreamEngineStream");
        stellaStream = await StreamEngineStream.deploy(await mockUSDC.getAddress());
        await stellaStream.waitForDeployment();

        await mockUSDC.mint(owner.address, parseUsdc("1000"));
    });

    describe("Deployment", function () {
        it("Should set the right payment token address", async function () {
            expect(await stellaStream.paymentToken()).to.equal(await mockUSDC.getAddress());
        });
    });

    describe("Stream Creation", function () {
        it("Should create a stream successfully", async function () {
            const amount = parseUsdc("100");
            const duration = 100;

            await mockUSDC.approve(await stellaStream.getAddress(), amount);

            const tx = await stellaStream.createStream(recipient.address, duration, amount, "metadata");
            const receipt = await tx.wait();

            // Check event
            const event = receipt.logs.find(log => {
                try {
                    return stellaStream.interface.parseLog(log).name === 'StreamCreated';
                } catch (e) {
                    return false;
                }
            });
            expect(event).to.not.be.undefined;

            const args = stellaStream.interface.parseLog(event).args;
            expect(args.recipient).to.equal(recipient.address);
            expect(args.totalAmount).to.equal(amount);
            expect(args.metadata).to.equal("metadata");
        });

        it("Should fail if allowance is insufficient", async function () {
            const amount = parseUsdc("100");
            const duration = 100;

            await expect(
                stellaStream.createStream(recipient.address, duration, amount, "metadata")
            ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
        });
    });

    describe("Withdrawal", function () {
        it("Should allow withdrawal of accrued tokens", async function () {
            const amount = parseUsdc("100");
            const duration = 100;

            await mockUSDC.approve(await stellaStream.getAddress(), amount);
            await stellaStream.createStream(recipient.address, duration, amount, "metadata");

            await ethers.provider.send("evm_increaseTime", [50]);
            await ethers.provider.send("evm_mine");

            const streamId = 1;
            const claimable = await stellaStream.getClaimableBalance(streamId);

            expect(claimable).to.be.closeTo(parseUsdc("50"), parseUsdc("1"));

            const recipientBalanceBefore = await mockUSDC.balanceOf(recipient.address);
            await stellaStream.connect(recipient).withdrawFromStream(streamId);
            const recipientBalanceAfter = await mockUSDC.balanceOf(recipient.address);

            expect(recipientBalanceAfter - recipientBalanceBefore).to.be.closeTo(claimable, parseUsdc("2"));
        });
    });

    describe("Cancellation", function () {
        it("Should allow sender to cancel and refund remaining", async function () {
            const amount = parseUsdc("100");
            const duration = 100;

            await mockUSDC.approve(await stellaStream.getAddress(), amount);
            await stellaStream.createStream(recipient.address, duration, amount, "metadata");

            await ethers.provider.send("evm_increaseTime", [50]);
            await ethers.provider.send("evm_mine");

            const streamId = 1;

            const senderBalanceBefore = await mockUSDC.balanceOf(owner.address);
            await stellaStream.cancelStream(streamId);
            const senderBalanceAfter = await mockUSDC.balanceOf(owner.address);

            expect(senderBalanceAfter - senderBalanceBefore).to.be.closeTo(parseUsdc("50"), parseUsdc("1"));

            expect(await stellaStream.isStreamActive(streamId)).to.be.false;
        });
    });

    describe("Active Check", function () {
        it("Should return true for active stream", async function () {
            const amount = parseUsdc("100");
            const duration = 100;
            await mockUSDC.approve(await stellaStream.getAddress(), amount);
            await stellaStream.createStream(recipient.address, duration, amount, "metadata");
            expect(await stellaStream.isStreamActive(1)).to.be.true;
        });
    });
});
