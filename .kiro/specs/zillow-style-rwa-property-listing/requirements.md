# Requirements Document

## Introduction

This feature integrates the Zillow-inspired property listing UI (already designed and built) with the Continuum backend. The work is backend + frontend wiring only — no UI/UX changes. Two property types are supported: **ESTATE** (residential/commercial buildings) and **LAND** (raw parcels). Rich structured metadata is stored in IPFS JSON (schemaVersion 3) and referenced on-chain via the existing `rwa-registry` Soroban contract. No contract redeployment is required.

The integration covers: a new `propertyMetadataService.js` canonical schema builder/validator, a new `POST /api/rwa/photos` photo-upload route, extensions to `ipfsService.js` (binary file pinning), `evidenceVault.js` (client-side fingerprint acceptance), and `assetScreener.js` (updated yield extraction). The frontend `PropertyMint.tsx` form is wired to these endpoints, and `PropertyDetail.tsx` is wired to display rich metadata fetched from IPFS.

---

## Glossary

- **PropertyMetadataService**: The new `server/services/propertyMetadataService.js` module responsible for building and validating canonical Estate and Land metadata objects.
- **IPFSService**: The existing `server/services/ipfsService.js` module, extended with a `pinFile()` method for binary uploads.
- **EvidenceVaultService**: The existing `server/services/evidenceVault.js` module, extended to accept client-side SHA-256 fingerprints.
- **AssetScreener**: The existing `server/services/assetScreener.js` module; its `extractYieldRate()` function is updated to read the new `yieldParameters` block.
- **API**: The Express.js backend server (`server/index.js` and associated routes).
- **PropertyMint**: The frontend page at `/app/property-mint` (`vite-project/src/pages/PropertyMint.tsx`).
- **PropertyDetail**: The frontend page at `/app/property/:tokenId` (`vite-project/src/pages/PropertyDetail.tsx`).
- **EstateMetadata**: The canonical IPFS JSON object for ESTATE-type properties, conforming to schemaVersion 3.
- **LandMetadata**: The canonical IPFS JSON object for LAND-type properties, conforming to schemaVersion 3.
- **yieldParameters**: A sub-object within EstateMetadata or LandMetadata containing yield-related financial fields consumed by the AssetScreener.
- **evidenceRoot**: A deterministic SHA-256 hash of the evidence bundle, stored on-chain in the `rwa-registry` contract.
- **CID**: Content Identifier — the IPFS content address returned by Pinata or computed locally.
- **PhotoEntry**: An object with `cid`, `uri`, and `isCover` fields representing a single uploaded property photo.
- **schemaVersion**: An integer field in IPFS metadata indicating the schema revision; this feature uses version 3.

---

## Requirements

### Requirement 1: Property Metadata Builder

**User Story:** As a backend developer, I want a canonical metadata builder service, so that all property metadata objects are consistently structured and validated before being pinned to IPFS.

#### Acceptance Criteria

1. THE PropertyMetadataService SHALL expose a `buildPropertyMetadata()` function that accepts `propertyType`, `formPayload`, `photoCIDs`, and `coverCID` as inputs.
2. WHEN `propertyType` is `'ESTATE'`, THE PropertyMetadataService SHALL return an EstateMetadata object with `schemaVersion: 3` and `propertyType: 'ESTATE'`.
3. WHEN `propertyType` is `'LAND'`, THE PropertyMetadataService SHALL return a LandMetadata object with `schemaVersion: 3` and `propertyType: 'LAND'`.
4. WHEN a valid `formPayload` is provided for either property type, THE PropertyMetadataService SHALL complete without throwing and SHALL return a metadata object containing a `yieldParameters` field.
5. THE PropertyMetadataService SHALL derive a non-empty `name` field from the `formPayload` (e.g., `"{beds}bd/{baths}ba at {address.street}"` for Estate, `"{lotSizeAcres} acres at {address.street}"` for Land).
6. THE PropertyMetadataService SHALL set a `monthlyYieldTarget` field on the returned metadata object for backward compatibility with the existing AssetScreener.
7. WHEN `propertyType` is `'ESTATE'`, THE PropertyMetadataService SHALL populate the `yieldParameters` field with `yieldTargetPct`, `monthlyRentalIncome`, and `annualizedRentalIncome` (derived as `monthlyRentalIncome * 12`).
8. WHEN `propertyType` is `'LAND'`, THE PropertyMetadataService SHALL populate the `yieldParameters` field with `yieldTargetPct`, `annualLandLeaseIncome`, and `appreciationNotes`.
9. WHEN numeric fields are provided as strings in `formPayload`, THE PropertyMetadataService SHALL parse them to finite numbers or `undefined` — never `NaN`.

### Requirement 2: Property Metadata Validator

**User Story:** As a backend developer, I want a metadata validator, so that invalid or incomplete metadata is rejected before being pinned to IPFS or submitted to the Soroban contract.

#### Acceptance Criteria

1. THE PropertyMetadataService SHALL expose a `validatePropertyMetadata()` function that accepts any value as input.
2. WHEN `validatePropertyMetadata()` is called with a metadata object produced by `buildPropertyMetadata()` using valid inputs, THE PropertyMetadataService SHALL return `{ valid: true, errors: [] }`.
3. WHEN `validatePropertyMetadata()` is called with a `null`, `undefined`, or structurally invalid value, THE PropertyMetadataService SHALL return `{ valid: false, errors: [...] }` with at least one descriptive error message.
4. WHEN required fields (`propertyType`, `listPrice`, `address.street`, `address.city`, `address.state`, `address.zip`) are absent, THE PropertyMetadataService SHALL include a specific error message for each missing field in the `errors` array.
5. THE `validatePropertyMetadata()` function SHALL never throw; all validation errors SHALL be captured in the returned `errors` array.

### Requirement 3: IPFS Binary File Pinning

**User Story:** As a backend developer, I want to pin property photos to IPFS, so that photo CIDs can be embedded in the property metadata and displayed in the PropertyDetail page.

#### Acceptance Criteria

1. THE IPFSService SHALL expose a `pinFile()` method that accepts a `Buffer`, `filename` string, and `mimeType` string.
2. WHEN `pinFile()` is called with a valid image buffer and a Pinata JWT is configured, THE IPFSService SHALL pin the file to Pinata and return `{ cid, uri, pinned: true }`.
3. WHEN `pinFile()` is called and no Pinata JWT is configured, THE IPFSService SHALL compute a deterministic local CID and return `{ cid, uri, pinned: false }`.
4. THE IPFSService `pinFile()` SHALL set `uri` to `'ipfs://${cid}'` for all results regardless of whether the file was pinned remotely or locally.
5. THE IPFSService `pinFile()` SHALL update the `localPins` map with the result so subsequent `fetchJSON()` calls can resolve the CID from cache.

### Requirement 4: IPFS Round-Trip Integrity

**User Story:** As a backend developer, I want IPFS pin and fetch to be consistent, so that metadata stored during minting is retrievable without data loss.

#### Acceptance Criteria

1. WHEN `pinJSON()` is called with a metadata object followed by `fetchJSON()` with the returned CID, THE IPFSService SHALL return an object deeply equal to the original metadata object.

### Requirement 5: Evidence Vault Client-Side Fingerprints

**User Story:** As a property lister, I want to submit document fingerprints computed in my browser, so that sensitive legal documents (title deeds, appraisals) never leave my device.

#### Acceptance Criteria

1. THE EvidenceVaultService `normalizeDocumentEntry()` function SHALL accept a document entry object containing `hash`, `filename`, and `docType` fields in addition to the existing fields.
2. WHEN a document entry with a valid 64-character hexadecimal `hash` is provided, THE EvidenceVaultService SHALL preserve the hash value in the normalized entry without modification.
3. WHEN a document entry with a `docType` field is provided, THE EvidenceVaultService SHALL include `docType` in the normalized entry.
4. WHEN a document entry with `issuedAt`, `expiresAt`, `issuer`, or `reference` fields is provided, THE EvidenceVaultService SHALL preserve those fields in the normalized entry.
5. THE EvidenceVaultService SHALL accept `docType` values from the set: `'title_deed'`, `'appraisal'`, `'survey'`, `'inspection'`, `'insurance'`, `'tax'`, `'other'`.

### Requirement 6: Updated Yield Rate Extraction

**User Story:** As an agent operator, I want the asset screener to read yield parameters from the new metadata schema, so that Estate and Land assets are correctly ranked by yield.

#### Acceptance Criteria

1. WHEN an asset's `publicMetadata.yieldParameters.yieldTargetPct` is greater than zero and no live stream data is present, THE AssetScreener `extractYieldRate()` SHALL return `yieldTargetPct` as the yield rate.
2. WHEN `yieldTargetPct` is zero or absent but `yieldParameters.monthlyRentalIncome` and `metadata.listPrice` are both greater than zero, THE AssetScreener SHALL compute the yield rate as `(monthlyRentalIncome * 12 / listPrice) * 100`.
3. WHEN `yieldTargetPct` is zero or absent but `yieldParameters.annualLandLeaseIncome` and `metadata.listPrice` are both greater than zero, THE AssetScreener SHALL compute the yield rate as `(annualLandLeaseIncome / listPrice) * 100`.
4. WHEN live stream data is present with `totalAmount > 0` and `durationSeconds > 0`, THE AssetScreener SHALL use the stream-derived yield rate regardless of any `yieldParameters` values.
5. WHEN only legacy `metadata.monthlyYieldTarget` is present (no `yieldParameters` block), THE AssetScreener SHALL compute a non-zero yield rate using the legacy formula for backward compatibility.
6. WHEN only legacy `metadata.pricePerHour` is present (no `yieldParameters` block and no `monthlyYieldTarget`), THE AssetScreener SHALL compute a non-zero yield rate using the legacy formula for backward compatibility.
7. WHEN `yieldTargetPct` is increased on an otherwise identical asset (no stream data), THE AssetScreener `extractYieldRate()` SHALL return a value greater than or equal to the result for the lower `yieldTargetPct`.

### Requirement 7: Photo Upload API Endpoint

**User Story:** As a property lister, I want to upload property photos before minting, so that photo CIDs are available to embed in the metadata.

#### Acceptance Criteria

1. THE API SHALL expose a `POST /api/rwa/photos` endpoint that accepts `multipart/form-data` with one or more image files and an optional `coverIndex` field.
2. WHEN valid image files are submitted, THE API SHALL pin each file via `IPFSService.pinFile()` and return `{ photos: PhotoEntry[], coverCID: string }`.
3. WHEN more than 20 files are submitted in a single request, THE API SHALL return HTTP 400 with `{ error: "Maximum 20 photos allowed" }`.
4. WHEN any submitted file exceeds 10,485,760 bytes (10 MB), THE API SHALL return HTTP 400 with `{ error: "Photo exceeds 10MB limit", filename }`.
5. WHEN any submitted file has a MIME type that does not start with `'image/'`, THE API SHALL return HTTP 400 with `{ error: "Only image files are accepted" }`.
6. WHEN the Pinata service is unavailable and pinning fails, THE API SHALL return HTTP 502 with `{ error: "Photo storage failed", code: "ipfs_pin_failed" }`.

### Requirement 8: Property Mint API Endpoint

**User Story:** As a property lister, I want to submit a complete property form and mint an RWA token on Stellar, so that the property is registered on-chain with its full metadata stored in IPFS.

#### Acceptance Criteria

1. THE API SHALL expose a `POST /api/rwa/assets` endpoint that accepts a JSON body containing `propertyType`, `formPayload`, `photoCIDs`, `coverCID`, `evidenceRoot`, `evidenceManifestHash`, `issuer`, and `jurisdiction`.
2. WHEN a valid Estate or Land payload is submitted, THE API SHALL call `buildPropertyMetadata()`, pin the result to IPFS, invoke `mint_asset` on the Soroban `rwa-registry` contract, persist the asset to the store, and return `{ tokenId, metadataURI, txHash }`.
3. WHEN `propertyType` is absent from the request body, THE API SHALL return HTTP 400 with `{ error: "propertyType is required (ESTATE or LAND)" }`.
4. WHEN `listPrice` is absent from `formPayload`, THE API SHALL return HTTP 400 with `{ error: "listPrice is required" }`.
5. WHEN any of `address.street`, `address.city`, `address.state`, or `address.zip` are absent from `formPayload`, THE API SHALL return HTTP 400 with `{ error: "address.street, city, state, zip are required" }`.
6. WHEN `yieldTargetPct` is present but outside the range 0–100, THE API SHALL return HTTP 400 with `{ error: "yieldTargetPct must be between 0 and 100" }`.
7. WHEN the issuer is not approved on-chain, THE API SHALL return HTTP 409 with `{ error: "...", code: "issuer_not_onboarded" }`.
8. WHEN IPFS pinning fails, THE API SHALL return HTTP 502 with `{ error: "Metadata storage failed", code: "ipfs_pin_failed" }`.
9. WHEN the Soroban contract call fails, THE API SHALL return HTTP 500 with `{ error: "...", code: "contract_error" }`.

### Requirement 9: Evidence Fingerprint API Endpoint

**User Story:** As a property lister, I want to submit document fingerprints computed in my browser, so that the evidence bundle is registered on-chain without transmitting sensitive files to the server.

#### Acceptance Criteria

1. THE API `POST /api/rwa/evidence` endpoint SHALL accept a JSON body containing a `documents` map where each entry has a `hash` (64-char hex), `filename`, and `docType`.
2. WHEN valid document fingerprints are submitted, THE API SHALL call `EvidenceVaultService.storeBundle()` and return `{ evidenceRoot, evidenceManifestHash }`.
3. WHEN a `hash` value is not a 64-character hexadecimal string, THE API SHALL return HTTP 400 with a descriptive error.
4. WHEN a `docType` value is not in the allowed set, THE API SHALL return HTTP 400 with a descriptive error.

### Requirement 10: PropertyMint Frontend Integration

**User Story:** As a property lister, I want the PropertyMint form to submit data to the backend, so that I can mint an RWA token directly from the UI.

#### Acceptance Criteria

1. WHEN the user selects photos and submits the PropertyMint form, THE PropertyMint page SHALL call `POST /api/rwa/photos` with the selected image files before calling the mint endpoint.
2. WHEN the user attaches evidence documents, THE PropertyMint page SHALL compute SHA-256 fingerprints client-side using `crypto.subtle.digest` and call `POST /api/rwa/evidence` with the fingerprints — raw file bytes SHALL NOT be transmitted to the server.
3. WHEN the user clicks "MINT RWA TWIN ON STELLAR", THE PropertyMint page SHALL call `POST /api/rwa/assets` with the complete form payload, photo CIDs, and evidence hashes.
4. WHEN the mint API returns `{ tokenId, metadataURI, txHash }`, THE PropertyMint page SHALL display a success confirmation to the user.
5. WHEN the mint API returns an error, THE PropertyMint page SHALL display the error message to the user without navigating away from the form.
6. WHILE a mint request is in progress, THE PropertyMint page SHALL disable the submit button and show a loading indicator.

### Requirement 11: PropertyDetail Frontend Integration

**User Story:** As a property viewer, I want the PropertyDetail page to display rich metadata from IPFS, so that I can see all property facts, location, and on-chain information.

#### Acceptance Criteria

1. WHEN PropertyDetail loads for a given `tokenId`, THE PropertyDetail page SHALL fetch the asset from `GET /api/rwa/assets/:tokenId` and use the `publicMetadata` field to populate all display sections.
2. WHEN `publicMetadata` contains `latitude` and `longitude`, THE LocationTab SHALL render a Google Maps embed using those coordinates.
3. WHEN `publicMetadata` contains only an address (no coordinates), THE LocationTab SHALL render a Google Maps embed using the address string.
4. WHEN `publicMetadata.propertyType` is `'ESTATE'`, THE FactsTab SHALL render the Estate-specific sections (Interior, Construction, Parking & Lot).
5. WHEN `publicMetadata.propertyType` is `'LAND'`, THE FactsTab SHALL render the Land-specific sections (Land Details, Infrastructure, Land Use).
6. WHEN the asset has a `yieldParameters` field, THE OverviewTab SHALL display the monthly yield, yield balance, and rate per hour in the Financial Overview section.
7. IF the asset cannot be fetched (network error or 404), THEN THE PropertyDetail page SHALL display a user-friendly error message.

### Requirement 12: Soroban Contract Compatibility

**User Story:** As a platform operator, I want the new metadata schema to be compatible with the existing deployed Soroban contracts, so that no contract redeployment is required.

#### Acceptance Criteria

1. THE API SHALL pass `asset_type: 1` for both ESTATE and LAND property types when calling `mint_asset` on the `rwa-registry` contract.
2. THE API SHALL pass `public_metadata_uri` as the IPFS URI of the pinned EstateMetadata or LandMetadata JSON object.
3. THE API SHALL pass `public_metadata_hash` as the SHA-256 hex digest of the stable-stringified metadata object.
4. THE API SHALL pass `evidence_root` and `evidence_manifest_hash` as returned by `EvidenceVaultService.storeBundle()`.
5. THE `yield-vault` contract interface SHALL remain unchanged; yield streaming operates on token amounts and stream IDs independent of property metadata.
