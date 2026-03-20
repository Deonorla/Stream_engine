// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FlowPayStream
 * @dev Real-time per-second payment streaming for AI agent x402 settlements.
 * Uses OpenZeppelin SafeERC20 for safe token transfers and ReentrancyGuard
 * to protect withdrawal and cancellation flows.
 *
 * Agents authorize once via USDC approval; the stream settles continuously
 * without requiring per-request transaction signing.
 */
contract FlowPayStream is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable paymentToken;

    struct Stream {
        address sender;
        address recipient;
        uint256 totalAmount;
        uint256 flowRate;        // tokens per second
        uint256 startTime;
        uint256 stopTime;
        uint256 amountWithdrawn;
        bool isActive;
        string metadata;         // JSON agent identification payload
    }

    mapping(uint256 => Stream) public streams;
    uint256 private nextStreamId = 1;

    event StreamCreated(
        uint256 indexed streamId,
        address indexed sender,
        address indexed recipient,
        uint256 totalAmount,
        uint256 startTime,
        uint256 stopTime,
        string metadata
    );
    event Withdrawn(uint256 indexed streamId, address indexed recipient, uint256 amount);
    event StreamCancelled(
        uint256 indexed streamId,
        address sender,
        address recipient,
        uint256 senderBalance,
        uint256 recipientBalance
    );

    constructor(address _paymentToken) {
        require(_paymentToken != address(0), "FlowPayStream: token is zero");
        paymentToken = IERC20(_paymentToken);
    }

    /**
     * @dev Returns the amount accrued to the recipient at the current timestamp.
     */
    function getClaimableBalance(uint256 streamId) public view returns (uint256) {
        Stream storage stream = streams[streamId];
        require(stream.isActive, "FlowPayStream: stream not active");

        if (block.timestamp < stream.startTime) return 0;

        if (block.timestamp >= stream.stopTime) {
            return stream.totalAmount - stream.amountWithdrawn;
        }

        uint256 streamed = (block.timestamp - stream.startTime) * stream.flowRate;
        return streamed - stream.amountWithdrawn;
    }

    /**
     * @dev Opens a new payment stream. Transfers `amount` USDC from sender
     * into escrow. Subsequent API requests reference the stream ID instead
     * of signing individual transactions.
     */
    function createStream(
        address recipient,
        uint256 duration,
        uint256 amount,
        string calldata metadata
    ) external nonReentrant {
        require(amount > 0, "FlowPayStream: amount is zero");
        require(recipient != address(0), "FlowPayStream: recipient is zero");
        require(duration > 0, "FlowPayStream: duration is zero");

        uint256 flowRate = amount / duration;
        require(flowRate > 0, "FlowPayStream: flowRate would be zero");

        // SafeERC20 handles non-standard ERC20 return values
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 streamId = nextStreamId++;
        uint256 startTime = block.timestamp;
        uint256 stopTime = startTime + duration;

        streams[streamId] = Stream({
            sender: msg.sender,
            recipient: recipient,
            totalAmount: amount,
            flowRate: flowRate,
            startTime: startTime,
            stopTime: stopTime,
            amountWithdrawn: 0,
            isActive: true,
            metadata: metadata
        });

        emit StreamCreated(streamId, msg.sender, recipient, amount, startTime, stopTime, metadata);
    }

    /**
     * @dev Recipient withdraws accrued funds from an active stream.
     */
    function withdrawFromStream(uint256 streamId) external nonReentrant {
        Stream storage stream = streams[streamId];
        require(stream.isActive, "FlowPayStream: stream not active");
        require(msg.sender == stream.recipient, "FlowPayStream: caller is not recipient");

        uint256 claimable = getClaimableBalance(streamId);
        require(claimable > 0, "FlowPayStream: nothing to withdraw");

        stream.amountWithdrawn += claimable;
        paymentToken.safeTransfer(stream.recipient, claimable);

        emit Withdrawn(streamId, stream.recipient, claimable);
    }

    /**
     * @dev Cancels a stream and refunds both parties proportionally.
     */
    function cancelStream(uint256 streamId) external nonReentrant {
        Stream storage stream = streams[streamId];
        require(stream.isActive, "FlowPayStream: already cancelled");
        require(
            msg.sender == stream.sender || msg.sender == stream.recipient,
            "FlowPayStream: caller cannot cancel"
        );

        uint256 recipientBalance = getClaimableBalance(streamId);
        uint256 senderBalance = (stream.totalAmount - stream.amountWithdrawn) - recipientBalance;

        stream.isActive = false;

        if (recipientBalance > 0) paymentToken.safeTransfer(stream.recipient, recipientBalance);
        if (senderBalance > 0) paymentToken.safeTransfer(stream.sender, senderBalance);

        emit StreamCancelled(streamId, stream.sender, stream.recipient, senderBalance, recipientBalance);
    }

    function isStreamActive(uint256 streamId) external view returns (bool) {
        return streams[streamId].isActive;
    }
}
