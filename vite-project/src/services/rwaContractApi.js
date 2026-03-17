import { Contract, ethers } from 'ethers';
import { ACTIVE_NETWORK } from '../networkConfig.js';
import { paymentAssetId } from '../contactInfo.js';
import { substrateApproveTransfer } from '../lib/substrateAssets.js';

const TOKEN_APPROVAL_GAS_LIMIT = 500000n;
const ASSET_STREAM_CREATION_GAS_LIMIT = 1500000n;

const HUB_ABI = [
  'function createAssetYieldStream(uint256 tokenId, uint256 totalAmount, uint256 duration) external returns (uint256)',
  'function claimYield(uint256 tokenId) external returns (uint256)',
  'function flashAdvance(uint256 tokenId, uint256 amount) external',
  'function claimableYield(uint256 tokenId) external view returns (uint256)',
  'function setCompliance(address user, uint8 assetType, bool approved, uint64 expiry, string jurisdiction) external',
  'function freezeStream(uint256 streamId, bool frozen, string reason) external',
  'function updateAssetMetadata(uint256 tokenId, string metadataURI, bytes32 cidHash) external',
  'function updateVerificationTag(uint256 tokenId, bytes32 tagHash) external',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
];

function requireAddress(label, value) {
  if (!value) {
    throw new Error(`${label} is not configured`);
  }
}

export function hashText(value) {
  return ethers.keccak256(ethers.toUtf8Bytes(value || ''));
}

export function parseTokenAmount(value, decimals = 6) {
  return ethers.parseUnits(String(value || 0), decimals);
}

export async function approveAndCreateAssetYieldStream({
  signer,
  tokenAddress,
  streamAddress,
  hubAddress,
  tokenId,
  totalAmount,
  duration,
}) {
  requireAddress('Token address', tokenAddress);
  requireAddress('Asset stream address', streamAddress);
  requireAddress('RWA hub address', hubAddress);

  const ownerAddress = await signer.getAddress();
  if (ACTIVE_NETWORK.chainId === 420420421) {
    try {
      await substrateApproveTransfer(ownerAddress, paymentAssetId, streamAddress, totalAmount);
    } catch (error) {
      console.warn('[rwaContractApi] Native asset approval failed. Falling back to EVM approval.', error);
      const token = new Contract(tokenAddress, ERC20_ABI, signer);
      let shouldApprove = true;
      try {
        const allowance = await token.allowance(ownerAddress, streamAddress);
        shouldApprove = allowance < totalAmount;
      } catch (allowanceError) {
        console.warn('[rwaContractApi] Unable to read token allowance. Falling back to direct approval.', allowanceError);
      }

      if (shouldApprove) {
        const approveTx = await token.approve(streamAddress, totalAmount, {
          gasLimit: TOKEN_APPROVAL_GAS_LIMIT,
        });
        await approveTx.wait();
      }
    }
  } else {
    const token = new Contract(tokenAddress, ERC20_ABI, signer);
    let shouldApprove = true;
    try {
      const allowance = await token.allowance(ownerAddress, streamAddress);
      shouldApprove = allowance < totalAmount;
    } catch (error) {
      console.warn('[rwaContractApi] Unable to read token allowance. Falling back to direct approval.', error);
    }

    if (shouldApprove) {
      const approveTx = await token.approve(streamAddress, totalAmount, {
        gasLimit: TOKEN_APPROVAL_GAS_LIMIT,
      });
      await approveTx.wait();
    }
  }

  const hub = new Contract(hubAddress, HUB_ABI, signer);
  const tx = await hub.createAssetYieldStream(tokenId, totalAmount, duration, {
    gasLimit: ASSET_STREAM_CREATION_GAS_LIMIT,
  });
  return tx.wait();
}

export async function claimAssetYield({ signer, hubAddress, tokenId }) {
  requireAddress('RWA hub address', hubAddress);
  const hub = new Contract(hubAddress, HUB_ABI, signer);
  const tx = await hub.claimYield(tokenId);
  return tx.wait();
}

export async function flashAdvanceAssetYield({ signer, hubAddress, tokenId, amount }) {
  requireAddress('RWA hub address', hubAddress);
  const hub = new Contract(hubAddress, HUB_ABI, signer);
  const tx = await hub.flashAdvance(tokenId, amount);
  return tx.wait();
}

export async function setAssetCompliance({
  signer,
  hubAddress,
  user,
  assetType,
  approved,
  expiry,
  jurisdiction,
}) {
  requireAddress('RWA hub address', hubAddress);
  const hub = new Contract(hubAddress, HUB_ABI, signer);
  const tx = await hub.setCompliance(user, assetType, approved, expiry, jurisdiction);
  return tx.wait();
}

export async function setAssetStreamFreeze({ signer, hubAddress, streamId, frozen, reason }) {
  requireAddress('RWA hub address', hubAddress);
  const hub = new Contract(hubAddress, HUB_ABI, signer);
  const tx = await hub.freezeStream(streamId, frozen, reason);
  return tx.wait();
}

export async function updateAssetMetadataOnChain({ signer, hubAddress, tokenId, metadataURI }) {
  requireAddress('RWA hub address', hubAddress);
  const hub = new Contract(hubAddress, HUB_ABI, signer);
  const tx = await hub.updateAssetMetadata(tokenId, metadataURI, hashText(metadataURI));
  return tx.wait();
}

export async function updateAssetVerificationTag({ signer, hubAddress, tokenId, tag }) {
  requireAddress('RWA hub address', hubAddress);
  const hub = new Contract(hubAddress, HUB_ABI, signer);
  const tx = await hub.updateVerificationTag(tokenId, hashText(tag));
  return tx.wait();
}

export async function readClaimableYield({ provider, hubAddress, tokenId }) {
  requireAddress('RWA hub address', hubAddress);
  const hub = new Contract(hubAddress, HUB_ABI, provider);
  return hub.claimableYield(tokenId);
}
