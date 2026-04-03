function normalizeIssuer(value) {
  return String(value || '').trim().toUpperCase();
}

export function buildIssuerAuthorizationMessage(payload = {}) {
  return [
    'Stream Engine RWA Mint Authorization',
    `issuer:${normalizeIssuer(payload.issuer)}`,
    `rightsModel:${payload.rightsModel || ''}`,
    `jurisdiction:${payload.jurisdiction || ''}`,
    `propertyRef:${payload.propertyRef || ''}`,
    `publicMetadataHash:${payload.publicMetadataHash || ''}`,
    `evidenceRoot:${payload.evidenceRoot || ''}`,
    `issuedAt:${payload.issuedAt || ''}`,
    `nonce:${payload.nonce || ''}`,
  ].join('\n');
}

function buildNonce(prefix = 'mint') {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export async function createIssuerAuthorization({
  signer,
  issuer,
  rightsModel,
  jurisdiction = '',
  propertyRef,
  publicMetadataHash,
  evidenceRoot,
  issuedAt = new Date().toISOString(),
  nonce = buildNonce('mint'),
}) {
  if (!signer?.signMessage) {
    throw new Error('A Stellar wallet signer is required to authorize this mint.');
  }

  const signerAddress = normalizeIssuer(
    issuer || (typeof signer.getAddress === 'function' ? await signer.getAddress() : ''),
  );

  if (!signerAddress) {
    throw new Error('Could not resolve the Stellar issuer address for mint authorization.');
  }

  const message = buildIssuerAuthorizationMessage({
    issuer: signerAddress,
    rightsModel,
    jurisdiction,
    propertyRef,
    publicMetadataHash,
    evidenceRoot,
    issuedAt,
    nonce,
  });

  const signature = await signer.signMessage(message);

  if (!signature) {
    throw new Error('Freighter returned an empty issuer authorization signature.');
  }

  return {
    issuedAt,
    nonce,
    signerAddress,
    signatureType: 'stellar',
    signature,
    message,
  };
}
