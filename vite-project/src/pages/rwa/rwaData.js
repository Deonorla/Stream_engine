import { useEffect, useState } from 'react';

export const TYPE_META = {
  real_estate: {
    label: 'Real Estate',
    rentLabel: 'Real Estate',
    color: 'text-blue-400',
    dot: 'bg-blue-400',
    gradient: 'from-blue-600/20 to-cyan-600/20',
    border: 'border-blue-500/30',
  },
  vehicle: {
    label: 'Vehicle',
    rentLabel: 'Vehicles',
    color: 'text-purple-400',
    dot: 'bg-purple-400',
    gradient: 'from-purple-600/20 to-pink-600/20',
    border: 'border-purple-500/30',
  },
  commodity: {
    label: 'Commodities',
    rentLabel: 'Equipment',
    color: 'text-amber-400',
    dot: 'bg-amber-400',
    gradient: 'from-amber-600/20 to-orange-600/20',
    border: 'border-amber-500/30',
  },
};

export const TYPE_TO_CHAIN_ASSET_TYPE = {
  real_estate: 1,
  vehicle: 2,
  commodity: 3,
};

export const CHAIN_ASSET_TYPE_TO_UI_TYPE = {
  1: 'real_estate',
  2: 'vehicle',
  3: 'commodity',
};

const RAW_ASSETS = [
  {
    id: '79b1',
    type: 'commodity',
    assetAddress: '0xe560dc13c7ef2ed80fbc17992836b04ceff379b1',
    name: 'Heavy-duty Road Roller',
    location: 'Port Harcourt Yard',
    pricePerHour: 0.01386,
    yieldBalance: 0.9979,
    yieldRatePerSecond: 0.0000,
    description: 'Heavy-duty Road Roller ready for your construction project. 2023 model, well-maintained, operator available.',
    accessMechanism: 'Telematics unlock + operator dispatch',
  },
  {
    id: '7386',
    type: 'commodity',
    assetAddress: '0x9c0059f1e51f2a7bcab0e6179021f1ad4e637386',
    name: 'Heavy-duty Forklift',
    location: 'Apapa Warehouse Strip',
    pricePerHour: 0.01,
    yieldBalance: 1.9907,
    yieldRatePerSecond: 0.0,
    description: 'Heavy-duty Forklift ready for your construction project. 2023 model, well-maintained, operator available.',
    accessMechanism: 'Warehouse gate + ignition relay',
  },
  {
    id: '2109',
    type: 'real_estate',
    assetAddress: '0x31c6e9aaf0947cf1230ee5d2a60b82482e1a2109',
    name: 'Skyline Residence 2 Bed',
    location: 'Victoria Island, Lagos',
    pricePerHour: 0.041652,
    yieldBalance: 0,
    yieldRatePerSecond: 0.0,
    description: 'Live in luxury with 2 bed, 910 sqft. Premium amenities, 24/7 concierge, gym & pool access.',
    accessMechanism: 'Smart lock + concierge verification',
  },
  {
    id: '9743',
    type: 'real_estate',
    assetAddress: '0xe1e76fe5019c24f70f35c89b8dfab7a46d379743',
    name: 'Skyline Residence 3 Bed',
    location: 'Ikoyi, Lagos',
    pricePerHour: 0.041652,
    yieldBalance: 0,
    yieldRatePerSecond: 0.0,
    description: 'Live in luxury with 3 bed, 1279 sqft. Premium amenities, 24/7 concierge, gym & pool access.',
    accessMechanism: 'Smart lock + private elevator access',
  },
  {
    id: '0e5f',
    type: 'real_estate',
    assetAddress: '0xe17c133dc71266ab0ca70930f28d924485020e5f',
    name: 'Grand Penthouse 2 Bed',
    location: 'Maitama, Abuja',
    pricePerHour: 0.249984,
    yieldBalance: 0,
    yieldRatePerSecond: 0.0001,
    description: 'Live in luxury with 2 bed, 2174 sqft. Premium amenities, 24/7 concierge, gym & pool access.',
    accessMechanism: 'Biometric lobby + penthouse smart lock',
  },
  {
    id: '8086',
    type: 'real_estate',
    assetAddress: '0x502f21c0df11dd8f299c34f3419af49f35638086',
    name: 'Harbour Loft 1 Bed',
    location: 'Eko Atlantic, Lagos',
    pricePerHour: 0.249984,
    yieldBalance: 5.9996,
    yieldRatePerSecond: 0.0001,
    description: 'Live in luxury with 1 bed, 1661 sqft. Premium amenities, 24/7 concierge, gym & pool access.',
    accessMechanism: 'Smart lock + valet gate access',
  },
  {
    id: 'b195',
    type: 'vehicle',
    assetAddress: '0x197eb36ec1040bf4a8a0b4636ce13c0d5594b195',
    name: 'Sunset Orange BMW',
    location: 'Lekki Phase 1',
    pricePerHour: 0.01386,
    yieldBalance: 0.9979,
    yieldRatePerSecond: 0.0,
    description: 'Experience luxury driving in this Sunset Orange BMW. Premium interior, latest tech, perfect for business or pleasure.',
    accessMechanism: 'IoT ignition unlock',
  },
  {
    id: '10cf',
    type: 'commodity',
    assetAddress: '0x78122d475fdf9c8d7f0d15db0f5a03d8ebe610cf',
    name: 'Heavy-duty Tower Crane',
    location: 'Ibeju-Lekki Build Zone',
    pricePerHour: 0.041652,
    yieldBalance: 0.9996,
    yieldRatePerSecond: 0.0,
    description: 'Heavy-duty Tower Crane ready for your construction project. 2020 model, well-maintained, operator available.',
    accessMechanism: 'Controller unlock + safety interlock',
  },
  {
    id: '49e5',
    type: 'real_estate',
    assetAddress: '0x327801da2fbab010c1f27268e2093ff7dfcd49e5',
    name: 'Marina Studio 1 Bed',
    location: 'Marina, Lagos',
    pricePerHour: 0.012492,
    yieldBalance: 0,
    yieldRatePerSecond: 0.0,
    description: 'Live in luxury with 1 bed, 2495 sqft. Premium amenities, 24/7 concierge, gym & pool access.',
    accessMechanism: 'Smart lock + resident QR',
  },
  {
    id: '3733',
    type: 'real_estate',
    assetAddress: '0xd204ad24d0f23b10d7ac0c0e11d98ac48bf13733',
    name: 'Midtown Residence 3 Bed',
    location: 'Banana Island, Lagos',
    pricePerHour: 0.024984,
    yieldBalance: 5.9962,
    yieldRatePerSecond: 0.0,
    description: 'Live in luxury with 3 bed, 859 sqft. Premium amenities, 24/7 concierge, gym & pool access.',
    accessMechanism: 'Smart lock + garage gate token',
  },
  {
    id: '7574',
    type: 'real_estate',
    assetAddress: '0x286ff21aa2f87d8b094fb14d9e11950d5c7e7574',
    name: 'Cedar Heights 3 Bed',
    location: 'Wuse 2, Abuja',
    pricePerHour: 0.083304,
    yieldBalance: 0,
    yieldRatePerSecond: 0.0,
    description: 'Live in luxury with 3 bed, 1555 sqft. Premium amenities, 24/7 concierge, gym & pool access.',
    accessMechanism: 'Smart lock + guest access relay',
  },
  {
    id: '44ae',
    type: 'commodity',
    assetAddress: '0x31ed740fbb3b5e1c69d224a8d25e10a620b244ae',
    name: 'Heavy-duty Road Roller',
    location: 'Kano Logistics Yard',
    pricePerHour: 0.027756,
    yieldBalance: 1.9984,
    yieldRatePerSecond: 0.0,
    description: 'Heavy-duty Road Roller ready for your construction project. 2023 model, well-maintained, operator available.',
    accessMechanism: 'Telematics unlock + yard release',
  },
  {
    id: 'ee5c',
    type: 'vehicle',
    assetAddress: '0x189f5c6940ef1cd853e75d0bb3a71ec49595ee5c',
    name: 'Emerald Green Bentley',
    location: 'Victoria Island Chauffeur Hub',
    pricePerHour: 0.01,
    yieldBalance: 3.9813,
    yieldRatePerSecond: 0.0,
    description: 'Experience luxury driving in this Emerald Green Bentley. Premium interior, latest tech, perfect for business or pleasure.',
    accessMechanism: 'IoT ignition unlock + chauffeur release',
  },
  {
    id: 'b680',
    type: 'commodity',
    assetAddress: '0xe53c09704f2b6d13828f519b763df0998c84b680',
    name: 'Heavy-duty Road Roller',
    location: 'Onitsha Equipment Depot',
    pricePerHour: 0.01,
    yieldBalance: 0.9936,
    yieldRatePerSecond: 0.0,
    description: 'Heavy-duty Road Roller ready for your construction project. 2021 model, well-maintained, operator available.',
    accessMechanism: 'Remote telematics unlock',
  },
  {
    id: '7e3a',
    type: 'commodity',
    assetAddress: '0x2b53ebd3931dca12b0fe7d4d34103110d0da7e3a',
    name: 'Heavy-duty Excavator',
    location: 'Abeokuta Quarry Site',
    pricePerHour: 0.041652,
    yieldBalance: 0,
    yieldRatePerSecond: 0.0,
    description: 'Heavy-duty Excavator ready for your construction project. 2020 model, well-maintained, operator available.',
    accessMechanism: 'Hydraulic controller unlock',
  },
  {
    id: '9afe',
    type: 'real_estate',
    assetAddress: '0x5d1a47168490bfad9b4e5ad7d8f54a1f0f009afe',
    name: 'Canal View 1 Bed',
    location: 'Oniru, Lagos',
    pricePerHour: 0.01,
    yieldBalance: 0,
    yieldRatePerSecond: 0.0,
    description: 'Live in luxury with 1 bed, 2027 sqft. Premium amenities, 24/7 concierge, gym & pool access.',
    accessMechanism: 'Smart lock + building QR access',
  },
  {
    id: '55a1',
    type: 'real_estate',
    assetAddress: '0x65cd3d68f8f018d21deeff24d833f77d48af55a1',
    name: 'Harbour View 2 Bed',
    location: 'Ikate, Lagos',
    pricePerHour: 0.124992,
    yieldBalance: 2.9998,
    yieldRatePerSecond: 0.0,
    description: 'Live in luxury with 2 bed, 1144 sqft. Premium amenities, 24/7 concierge, gym & pool access.',
    accessMechanism: 'Smart lock + parking gate access',
  },
];

function shortAddress(address) {
  if (!address) {
    return 'Unassigned';
  }
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

function buildCid(id) {
  return `bafybeistreamenginerwa${id.toLowerCase()}metadata${id.toLowerCase()}`;
}

function buildActivity(asset) {
  return [
    {
      label: 'Minted',
      detail: `${asset.name} was tokenized and indexed in the RWA registry.`,
      timestamp: '2 days ago',
    },
    {
      label: 'Metadata pinned',
      detail: `Metadata for Asset #${asset.id} was pinned to IPFS and bound to its digital twin.`,
      timestamp: '2 days ago',
    },
    {
      label: 'Verification bound',
      detail: `QR / NFC tag binding was registered for ${asset.accessMechanism.toLowerCase()}.`,
      timestamp: '1 day ago',
    },
  ];
}

function enrichAsset(asset, index) {
  const verificationCid = buildCid(asset.id);
  const ipfsUri = `ipfs://${verificationCid}`;
  const tagSeed = `STREAMENGINE-${asset.id.toUpperCase()}-TAG`;
  const verificationPayload = `https://app.streamengine.so/rwa/verify?tokenId=${asset.id}&cid=${verificationCid}&tag=${encodeURIComponent(tagSeed)}`;
  const activity = buildActivity(asset);

  return {
    ...asset,
    tokenId: asset.id,
    displayAddress: shortAddress(asset.assetAddress),
    verificationCid,
    ipfsUri,
    tagSeed,
    verificationPayload,
    activity,
    status: 'Active',
    completionRatio: 1,
    monthlyYieldTarget: Number((asset.pricePerHour * 24 * 30).toFixed(2)),
    ownerAddress: asset.assetAddress,
    renterAddress: index % 4 === 0 ? `0x${asset.id}${asset.id}${asset.id}`.slice(0, 10) : null,
  };
}

export const PORTFOLIO_ASSETS = RAW_ASSETS.map(enrichAsset);

export function formatAssetTypeLabel(type) {
  return TYPE_META[type]?.label || 'Rental Asset';
}

export function normalizeUiAssetType(type) {
  if (TYPE_META[type]) {
    return type;
  }
  return CHAIN_ASSET_TYPE_TO_UI_TYPE[Number(type)] || 'real_estate';
}

export function normalizeVerificationCid(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('ipfs://')) {
    return trimmed.replace('ipfs://', '');
  }
  const gatewayIndex = trimmed.indexOf('/ipfs/');
  if (gatewayIndex >= 0) {
    return trimmed.slice(gatewayIndex + 6);
  }
  return trimmed;
}

export function parseVerificationPayload(payload = '') {
  const trimmed = String(payload || '').trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return {
      tokenId: (url.searchParams.get('tokenId') || '').trim(),
      cid: normalizeVerificationCid(url.searchParams.get('cid') || ''),
      tagSeed: (url.searchParams.get('tag') || '').trim(),
    };
  } catch {
    return null;
  }
}

export function formatActivityTimestamp(timestamp) {
  if (!timestamp) {
    return 'Pending sync';
  }

  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - Number(timestamp));
  if (seconds < 60) {
    return 'Just now';
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatActivityLabel(eventName = '') {
  return eventName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (value) => value.toUpperCase());
}

export function formatIndexerActivity(activity = {}) {
  const eventName = activity.eventName || activity.label || 'Activity';
  const metadata = activity.metadata || {};

  let detail = activity.detail;
  if (!detail) {
    switch (eventName) {
      case 'AssetMinted':
        detail = `Digital twin minted for issuer ${shortAddress(metadata.issuer || activity.actor || '')}.`;
        break;
      case 'AssetRegistered':
        detail = 'Registry entry stored with metadata and verification hashes.';
        break;
      case 'AssetYieldStreamCreated':
        detail = `Yield stream ${metadata.streamId || activity.streamId || ''} was attached to this asset.`;
        break;
      case 'YieldClaimed':
        detail = `Yield was claimed by ${shortAddress(metadata.recipient || activity.actor || '')}.`;
        break;
      case 'FlashAdvanceExecuted':
        detail = `Flash advance executed for ${metadata.amount || '0'} base units.`;
        break;
      case 'Transfer':
        detail = `Ownership moved from ${shortAddress(metadata.from || '')} to ${shortAddress(metadata.to || '')}.`;
        break;
      case 'ComplianceUpdated':
        detail = `Compliance record updated for ${shortAddress(metadata.user || activity.actor || '')}.`;
        break;
      case 'StreamFreezeUpdated':
        detail = metadata.frozen ? 'Stream frozen for compliance review.' : 'Stream unfrozen and re-enabled.';
        break;
      default:
        detail = 'Indexed on-chain activity recorded for this asset.';
    }
  }

  return {
    label: formatActivityLabel(eventName),
    detail,
    timestamp: activity.timestamp ? formatActivityTimestamp(activity.timestamp) : (activity.timestampLabel || 'Pending sync'),
  };
}

function resolveMetadataType(metadata, assetType) {
  const topLevelType = metadata?.assetType || metadata?.asset_type;
  if (TYPE_META[topLevelType]) {
    return topLevelType;
  }

  const attrType = metadata?.attributes?.find(
    (item) => item?.trait_type === 'Asset Type' || item?.trait_type === 'Asset Class'
  )?.value;
  if (TYPE_META[attrType]) {
    return attrType;
  }

  return normalizeUiAssetType(assetType);
}

function parseUnits(value, decimals = 6) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return numeric / 10 ** decimals;
}

export function mapApiAssetToUiAsset(asset = {}) {
  const metadata = asset.metadata || {};
  const type = resolveMetadataType(metadata, asset.assetType);
  const stream = asset.stream || {};
  const monthlyYieldTarget = Number(
    metadata.monthlyYieldTarget
    || metadata.monthlyYield
    || metadata.attributes?.find((item) => item?.trait_type === 'Monthly Yield Target')?.value
    || 0
  );
  const verificationCid = normalizeVerificationCid(asset.metadataURI || asset.tokenURI || '');
  const tagSeed = metadata.tagSeed || metadata.tag_seed || '';
  const activities = Array.isArray(asset.activity) ? asset.activity.map(formatIndexerActivity) : [];
  const totalAmount = parseUnits(stream.totalAmount, 6);
  const flowRatePerSecond = parseUnits(stream.flowRate, 6);
  const durationSeconds = Math.max(0, Number(stream.stopTime || 0) - Number(stream.startTime || 0));
  const fallbackPerHour = durationSeconds > 0 ? (totalAmount / durationSeconds) * 3600 : 0;
  const assetName = metadata.name || metadata.title || `Asset #${asset.tokenId}`;
  const assetDescription = metadata.description || 'Indexed rental asset';

  return {
    id: String(asset.tokenId),
    tokenId: String(asset.tokenId),
    type,
    name: assetName,
    location: metadata.location || metadata.properties?.location || 'Undisclosed',
    pricePerHour: Number((metadata.pricePerHour || fallbackPerHour || (monthlyYieldTarget / 720) || 0).toFixed(6)),
    yieldBalance: parseUnits(asset.claimableYield, 6),
    yieldRatePerSecond: Number(flowRatePerSecond.toFixed(6)),
    description: assetDescription,
    accessMechanism: metadata.accessMechanism || metadata.properties?.accessMechanism || 'Verification payload controlled access',
    assetAddress: asset.currentOwner || asset.issuer || '',
    displayAddress: shortAddress(asset.currentOwner || asset.issuer || ''),
    verificationCid,
    ipfsUri: asset.tokenURI || asset.metadataURI || (verificationCid ? `ipfs://${verificationCid}` : ''),
    tagSeed,
    verificationPayload: metadata.verificationPayload || '',
    verificationUrl: metadata.verificationUrl || '',
    status: stream.isFrozen ? 'Frozen' : (stream.isActive ? 'Active' : 'Ready'),
    completionRatio: durationSeconds > 0 && stream.startTime ? Math.min(1, Math.max(0, (Date.now() / 1000 - Number(stream.startTime)) / durationSeconds)) : 0,
    monthlyYieldTarget,
    imageUrl: metadata.image || metadata.imageUrl || '',
    ownerAddress: asset.currentOwner || asset.issuer || '',
    issuerAddress: asset.issuer || '',
    renterAddress: null,
    metadata,
    activity: activities,
    currentOwner: asset.currentOwner || '',
    activeStreamId: Number(asset.activeStreamId || stream.streamId || 0),
    stream,
    compliance: asset.compliance || null,
  };
}

export function verifyAssetRecord({ payload, tokenId, cidOrUri, tagSeed }, assets) {
  const parsed = parseVerificationPayload(payload);
  const resolvedTokenId = (parsed?.tokenId || tokenId || '').trim().toLowerCase();
  const resolvedCid = normalizeVerificationCid(parsed?.cid || cidOrUri || '');
  const resolvedTagSeed = (parsed?.tagSeed || tagSeed || '').trim();

  const asset =
    assets.find((item) => item.tokenId.toLowerCase() === resolvedTokenId)
    || assets.find((item) => item.verificationCid === resolvedCid);

  if (!asset) {
    return {
      authentic: false,
      asset: null,
      cidMatches: false,
      tagMatches: false,
      resolvedTokenId,
      resolvedCid,
      resolvedTagSeed,
      reason: 'No indexed asset matches the verification details you supplied.',
    };
  }

  const cidMatches = !resolvedCid || asset.verificationCid === resolvedCid;
  const tagMatches = !resolvedTagSeed || asset.tagSeed.toLowerCase() === resolvedTagSeed.toLowerCase();

  return {
    authentic: cidMatches && tagMatches,
    asset,
    cidMatches,
    tagMatches,
    resolvedTokenId: asset.tokenId,
    resolvedCid: asset.verificationCid,
    resolvedTagSeed: resolvedTagSeed || asset.tagSeed,
    reason: cidMatches && tagMatches
      ? 'Verification payload matches the indexed registry and metadata record.'
      : 'At least one supplied verification field does not match the indexed registry record.',
  };
}

export function createMintedAsset(form, sequence = 0) {
  const nextId = (Math.floor(Math.random() * 0xffff) + sequence + 1)
    .toString(16)
    .padStart(4, '0');
  const normalizedType = form.type || 'real_estate';
  const assetAddress = `0x${nextId}${'ab'.repeat(18)}`.slice(0, 42);
  const monthlyYieldTarget = Number(form.monthlyYieldTarget || 0);
  const pricePerHour = Number((monthlyYieldTarget / 720 || 0).toFixed(6));
  const verificationCid = buildCid(nextId);
  const tagSeed = (form.tagSeed || `STREAMENGINE-${nextId.toUpperCase()}-TAG`).trim();
  const ipfsUri = `ipfs://${verificationCid}`;
  const verificationPayload = `https://app.streamengine.so/rwa/verify?tokenId=${nextId}&cid=${verificationCid}&tag=${encodeURIComponent(tagSeed)}`;

  return {
    id: nextId,
    tokenId: nextId,
    type: normalizedType,
    name: form.name.trim() || 'Untitled rental asset',
    location: form.location.trim() || 'Undisclosed',
    pricePerHour,
    yieldBalance: 0,
    yieldRatePerSecond: Number((monthlyYieldTarget / (30 * 24 * 3600) || 0).toFixed(6)),
    description: form.description.trim() || 'Describe the unit, tenant profile, and income model.',
    accessMechanism: 'QR / NFC verification payload',
    assetAddress,
    displayAddress: shortAddress(assetAddress),
    verificationCid,
    ipfsUri,
    tagSeed,
    verificationPayload,
    status: 'Ready',
    completionRatio: 0,
    monthlyYieldTarget,
    imageUrl: form.imageUrl.trim(),
    ownerAddress: assetAddress,
    renterAddress: null,
    activity: [
      {
        label: 'Studio draft created',
        detail: 'Asset details were captured in the issuer workspace.',
        timestamp: 'Just now',
      },
      {
        label: 'Metadata pinned',
        detail: `Standard metadata was prepared for ${ipfsUri}.`,
        timestamp: 'Just now',
      },
      {
        label: 'Verification payload generated',
        detail: `QR / NFC binding seed ${tagSeed} is ready for sharing.`,
        timestamp: 'Just now',
      },
    ],
  };
}

export function calcYield(asset) {
  return asset.yieldBalance || 0;
}

export function calcRentPaid(asset) {
  return asset.pricePerHour || 0;
}

export function buildRentalStreamMetadata(asset, hours) {
  return JSON.stringify({
    type: 'rwa-rental',
    assetTokenId: asset.tokenId || asset.id,
    assetId: asset.id,
    assetName: asset.name,
    assetType: asset.type,
    durationHours: hours,
    startedFrom: 'rwa-studio',
  });
}

export function useLiveTick(fn, interval = 1000) {
  const [value, setValue] = useState(() => fn());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setValue(fn());
    }, interval);

    return () => window.clearInterval(intervalId);
  }, [fn, interval]);

  return value;
}
