/**
 * propertyMetadataService.js
 *
 * Canonical builder and validator for Estate and Land metadata objects.
 * Single source of truth for schemaVersion 3 property metadata.
 *
 * Exports:
 *   buildPropertyMetadata(opts)       — build EstateMetadata or LandMetadata
 *   validatePropertyMetadata(metadata) — validate required fields
 *   extractYieldFieldsForChain(metadata) — extract yield fields for on-chain use
 */

'use strict';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a value to a finite number. Returns undefined (never NaN) if the
 * value cannot be parsed or is not finite.
 * @param {*} val
 * @returns {number|undefined}
 */
function toFiniteNumber(val) {
  if (val === undefined || val === null || val === '') return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse a comma-separated string into a trimmed string array.
 * @param {*} val
 * @returns {string[]}
 */
function toStringArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  return String(val)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build a PhotoEntry array from photoCIDs and coverCID.
 * @param {Array<{cid:string,uri:string}|string>} photoCIDs
 * @param {string} coverCID
 * @returns {Array<{cid:string,uri:string,isCover:boolean}>}
 */
function buildPhotoEntries(photoCIDs, coverCID) {
  if (!Array.isArray(photoCIDs)) return [];
  return photoCIDs.map((entry) => {
    const cid = typeof entry === 'string' ? entry : entry.cid;
    const uri = typeof entry === 'string' ? `ipfs://${cid}` : (entry.uri || `ipfs://${cid}`);
    return { cid, uri, isCover: cid === coverCID };
  });
}

// ---------------------------------------------------------------------------
// buildPropertyMetadata
// ---------------------------------------------------------------------------

/**
 * Build a canonical EstateMetadata or LandMetadata object from raw form input.
 *
 * @param {{
 *   propertyType: 'ESTATE'|'LAND',
 *   formPayload: object,
 *   photoCIDs: Array,
 *   coverCID: string
 * }} opts
 * @returns {object} EstateMetadata | LandMetadata
 */
function buildPropertyMetadata({ propertyType, formPayload, photoCIDs, coverCID }) {
  if (propertyType === 'ESTATE') {
    return buildEstateMetadata(formPayload, photoCIDs, coverCID);
  }
  if (propertyType === 'LAND') {
    return buildLandMetadata(formPayload, photoCIDs, coverCID);
  }
  throw new Error(`Unknown propertyType: ${propertyType}. Must be 'ESTATE' or 'LAND'.`);
}

// ---------------------------------------------------------------------------
// Estate builder (Task 2.1)
// ---------------------------------------------------------------------------

function buildEstateMetadata(fp, photoCIDs, coverCID) {
  fp = fp || {};

  const address = fp.address || {};
  const interior = fp.interior || {};
  const construction = fp.construction || {};
  const parkingAndLot = fp.parkingAndLot || {};
  const listing = fp.listing || {};
  const description = fp.description || {};
  const yp = fp.yieldParameters || {};

  const beds = toFiniteNumber(fp.beds) ?? toFiniteNumber(interior.bedroomsCount) ?? 0;
  const baths =
    toFiniteNumber(fp.baths) ??
    ((toFiniteNumber(interior.fullBaths) ?? 0) + (toFiniteNumber(interior.halfBaths) ?? 0) * 0.5) ??
    0;
  const street = address.street || '';

  // Derived fields
  const name = `${beds}bd/${baths}ba at ${street}`;
  const location = `${address.city || ''}, ${address.state || ''}`;

  // Yield parameters
  const yieldTargetPct = toFiniteNumber(yp.yieldTargetPct);
  const monthlyRentalIncome = toFiniteNumber(yp.monthlyRentalIncome);
  const annualizedRentalIncome =
    monthlyRentalIncome !== undefined ? monthlyRentalIncome * 12 : undefined;

  const yieldParameters = {
    yieldTargetPct,
    monthlyRentalIncome,
    annualizedRentalIncome,
  };

  // Legacy compat
  const monthlyYieldTarget = monthlyRentalIncome;

  const listPrice = toFiniteNumber(fp.listPrice);
  const sqft = toFiniteNumber(fp.sqft);
  const pricePerSqft =
    listPrice !== undefined && sqft !== undefined && sqft > 0
      ? toFiniteNumber(fp.pricePerSqft) ?? listPrice / sqft
      : toFiniteNumber(fp.pricePerSqft);

  return {
    schemaVersion: 3,
    propertyType: 'ESTATE',

    // Overview
    listPrice,
    zestimate: toFiniteNumber(fp.zestimate),
    beds,
    baths,
    sqft,
    yearBuilt: toFiniteNumber(fp.yearBuilt),
    lotSizeSqft: toFiniteNumber(fp.lotSizeSqft),
    pricePerSqft,
    hoaMonthly: toFiniteNumber(fp.hoaMonthly),
    estMonthlyPayment: toFiniteNumber(fp.estMonthlyPayment),
    propertySubtype: fp.propertySubtype || undefined,
    propertySubtypeDetail: fp.propertySubtypeDetail || undefined,

    address: {
      street: address.street || '',
      city: address.city || '',
      state: address.state || '',
      zip: address.zip || '',
      parcelNumber: address.parcelNumber || '',
      latitude: toFiniteNumber(address.latitude),
      longitude: toFiniteNumber(address.longitude),
    },

    listing: {
      mlsNumber: listing.mlsNumber || undefined,
      agentName: listing.agentName || undefined,
      source: listing.source || undefined,
    },

    description: {
      tags: toStringArray(description.tags),
      text: description.text || '',
    },

    interior: {
      bedroomsCount: toFiniteNumber(interior.bedroomsCount) ?? beds,
      fullBaths: toFiniteNumber(interior.fullBaths),
      halfBaths: toFiniteNumber(interior.halfBaths),
      roomDimensions: {
        primaryBedroom: interior.roomDimensions?.primaryBedroom || undefined,
        bedroom2: interior.roomDimensions?.bedroom2 || undefined,
        bedroom3: interior.roomDimensions?.bedroom3 || undefined,
        kitchen: interior.roomDimensions?.kitchen || undefined,
        livingRoom: interior.roomDimensions?.livingRoom || undefined,
      },
      heating: interior.heating || undefined,
      cooling: interior.cooling || undefined,
      appliances: toStringArray(interior.appliances),
      interiorFeatures: interior.interiorFeatures || undefined,
    },

    construction: {
      homeType: construction.homeType || undefined,
      architecturalStyle: construction.architecturalStyle || undefined,
      levels: construction.levels || undefined,
      stories: toFiniteNumber(construction.stories),
      patioPorch: construction.patioPorch || undefined,
      spa: construction.spa || undefined,
      exteriorMaterials: toStringArray(construction.exteriorMaterials),
      foundation: construction.foundation || undefined,
      roof: construction.roof || undefined,
      condition: construction.condition || undefined,
    },

    parkingAndLot: {
      parkingFeatures: parkingAndLot.parkingFeatures || undefined,
      carportSpaces: toFiniteNumber(parkingAndLot.carportSpaces),
      uncoveredSpaces: toFiniteNumber(parkingAndLot.uncoveredSpaces),
      lotSizeAcres: toFiniteNumber(parkingAndLot.lotSizeAcres),
      lotDimensions: parkingAndLot.lotDimensions || undefined,
      otherEquipment: toStringArray(parkingAndLot.otherEquipment),
      lotFeatures: parkingAndLot.lotFeatures || undefined,
    },

    photos: buildPhotoEntries(photoCIDs, coverCID),
    yieldParameters,

    // Legacy compat
    name,
    location,
    monthlyYieldTarget,
    propertyRef: fp.propertyRef || '',
    tagSeed: fp.tagSeed || '',
    rightsModel: fp.rightsModel || 'fractional',
  };
}

// ---------------------------------------------------------------------------
// Land builder (Task 2.2)
// ---------------------------------------------------------------------------

function buildLandMetadata(fp, photoCIDs, coverCID) {
  fp = fp || {};

  const address = fp.address || {};
  const listing = fp.listing || {};
  const description = fp.description || {};
  const landDetails = fp.landDetails || {};
  const landUse = fp.landUse || {};
  const yp = fp.yieldParameters || {};

  const lotSizeAcres = toFiniteNumber(fp.lotSizeAcres) ?? toFiniteNumber(fp.parkingAndLot?.lotSizeAcres);
  const street = address.street || '';

  // Derived fields
  const name = `${lotSizeAcres !== undefined ? lotSizeAcres : ''} acres at ${street}`;
  const location = `${address.city || ''}, ${address.state || ''}`;

  // Yield parameters
  const yieldTargetPct = toFiniteNumber(yp.yieldTargetPct);
  const annualLandLeaseIncome = toFiniteNumber(yp.annualLandLeaseIncome);
  const appreciationNotes = yp.appreciationNotes || '';

  const yieldParameters = {
    yieldTargetPct,
    annualLandLeaseIncome,
    appreciationNotes,
  };

  // Legacy compat: monthlyYieldTarget = annualLandLeaseIncome / 12
  const monthlyYieldTarget =
    annualLandLeaseIncome !== undefined ? annualLandLeaseIncome / 12 : undefined;

  return {
    schemaVersion: 3,
    propertyType: 'LAND',

    // Land Overview
    listPrice: toFiniteNumber(fp.listPrice),
    zestimate: toFiniteNumber(fp.zestimate),
    lotSizeAcres,
    lotDimensions: fp.lotDimensions || undefined,
    hoaAnnual: toFiniteNumber(fp.hoaAnnual),
    zoning: fp.zoning || undefined,
    landType: fp.landType || undefined,

    address: {
      street: address.street || '',
      city: address.city || '',
      state: address.state || '',
      zip: address.zip || '',
      parcelNumber: address.parcelNumber || '',
      latitude: toFiniteNumber(address.latitude),
      longitude: toFiniteNumber(address.longitude),
    },

    listing: {
      mlsNumber: listing.mlsNumber || undefined,
      agentName: listing.agentName || undefined,
      source: listing.source || undefined,
    },

    description: {
      tags: toStringArray(description.tags),
      text: description.text || '',
    },

    landDetails: {
      topography: landDetails.topography || undefined,
      soilType: landDetails.soilType || undefined,
      roadAccess: landDetails.roadAccess || undefined,
      utilities: toStringArray(landDetails.utilities),
      waterSource: landDetails.waterSource || undefined,
      floodZone: landDetails.floodZone || undefined,
      treeCover: landDetails.treeCover || undefined,
      surveyAvailable: landDetails.surveyAvailable || undefined,
    },

    landUse: {
      history: landUse.history || undefined,
      additionalNotes: landUse.additionalNotes || undefined,
    },

    photos: buildPhotoEntries(photoCIDs, coverCID),
    yieldParameters,

    // Legacy compat
    name,
    location,
    monthlyYieldTarget,
    propertyRef: fp.propertyRef || '',
    tagSeed: fp.tagSeed || '',
    rightsModel: fp.rightsModel || 'fractional',
  };
}

// ---------------------------------------------------------------------------
// validatePropertyMetadata (Task 2.3)
// ---------------------------------------------------------------------------

/**
 * Validate a metadata object. Never throws.
 *
 * @param {*} metadata
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePropertyMetadata(metadata) {
  const errors = [];

  try {
    if (metadata === null || metadata === undefined || typeof metadata !== 'object') {
      errors.push('metadata must be a non-null object');
      return { valid: false, errors };
    }

    // Required: propertyType
    if (!metadata.propertyType) {
      errors.push('propertyType is required (ESTATE or LAND)');
    } else if (metadata.propertyType !== 'ESTATE' && metadata.propertyType !== 'LAND') {
      errors.push(`propertyType must be 'ESTATE' or 'LAND', got '${metadata.propertyType}'`);
    }

    // Required: listPrice
    if (metadata.listPrice === undefined || metadata.listPrice === null || metadata.listPrice === '') {
      errors.push('listPrice is required');
    } else if (!Number.isFinite(Number(metadata.listPrice))) {
      errors.push('listPrice must be a finite number');
    }

    // Required: address fields
    const addr = metadata.address;
    if (!addr || typeof addr !== 'object') {
      errors.push('address is required');
      errors.push('address.street is required');
      errors.push('address.city is required');
      errors.push('address.state is required');
      errors.push('address.zip is required');
    } else {
      if (!addr.street) errors.push('address.street is required');
      if (!addr.city) errors.push('address.city is required');
      if (!addr.state) errors.push('address.state is required');
      if (!addr.zip) errors.push('address.zip is required');
    }
  } catch (err) {
    errors.push(`Unexpected validation error: ${err.message}`);
  }

  return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
}

// ---------------------------------------------------------------------------
// extractYieldFieldsForChain (Task 2.4)
// ---------------------------------------------------------------------------

/**
 * Extract yield fields from metadata for on-chain use.
 *
 * @param {object} metadata - EstateMetadata or LandMetadata
 * @returns {{ yieldTargetPct: number, primaryIncomeUsd: number, incomeType: string }}
 */
function extractYieldFieldsForChain(metadata) {
  const yp = (metadata && metadata.yieldParameters) || {};
  const propertyType = metadata && metadata.propertyType;

  const yieldTargetPct = toFiniteNumber(yp.yieldTargetPct) ?? 0;

  if (propertyType === 'LAND') {
    return {
      yieldTargetPct,
      primaryIncomeUsd: toFiniteNumber(yp.annualLandLeaseIncome) ?? 0,
      incomeType: 'annual_lease',
    };
  }

  // Default to ESTATE
  return {
    yieldTargetPct,
    primaryIncomeUsd: toFiniteNumber(yp.monthlyRentalIncome) ?? 0,
    incomeType: 'monthly_rental',
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  buildPropertyMetadata,
  validatePropertyMetadata,
  extractYieldFieldsForChain,
};
