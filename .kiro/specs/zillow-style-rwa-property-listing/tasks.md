# Implementation Plan: Zillow-Style RWA Property Listing

## Overview

Wire the existing Zillow-inspired UI to the Continuum backend. No UI/UX changes — integration only. The work proceeds in five phases: (1) add dependencies, (2) build the new `propertyMetadataService.js` and extend existing services, (3) add the photo-upload route and update the mint endpoint, (4) wire the frontend, and (5) write tests.

## Tasks

- [x] 1. Add dependencies to server/package.json
  - Add `multer` to `dependencies` in `server/package.json`
  - Add `fast-check` to `devDependencies` in `server/package.json`
  - Run `npm install` inside `server/` to update `package-lock.json`
  - _Requirements: 3.1, 7.1_

- [x] 2. Create server/services/propertyMetadataService.js
  - [x] 2.1 Implement `buildPropertyMetadata(opts)` for ESTATE type
    - Accept `{ propertyType, formPayload, photoCIDs, coverCID }` and return an `EstateMetadata` object with `schemaVersion: 3`, `propertyType: 'ESTATE'`, derived `name`, `location`, `monthlyYieldTarget`, and a populated `yieldParameters` block (`yieldTargetPct`, `monthlyRentalIncome`, `annualizedRentalIncome`)
    - Parse all numeric string fields to finite numbers or `undefined` — never `NaN`
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.9_

  - [x] 2.2 Implement `buildPropertyMetadata(opts)` for LAND type
    - Return a `LandMetadata` object with `schemaVersion: 3`, `propertyType: 'LAND'`, derived `name` (`"{lotSizeAcres} acres at {address.street}"`), `location`, `monthlyYieldTarget` (alias: `annualLandLeaseIncome / 12`), and `yieldParameters` block (`yieldTargetPct`, `annualLandLeaseIncome`, `appreciationNotes`)
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9_

  - [x] 2.3 Implement `validatePropertyMetadata(metadata)`
    - Return `{ valid: true, errors: [] }` for valid metadata; `{ valid: false, errors: [...] }` with per-field messages for missing/invalid required fields (`propertyType`, `listPrice`, `address.street`, `address.city`, `address.state`, `address.zip`)
    - Never throw — all errors captured in the returned array
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.4 Implement `extractYieldFieldsForChain(metadata)`
    - Return `{ yieldTargetPct, primaryIncomeUsd, incomeType }` from the metadata's `yieldParameters` block
    - _Requirements: 1.7, 1.8, 12.2_

  - [ ]* 2.5 Write property test: `buildPropertyMetadata` is total and always returns schemaVersion 3
    - **Property 1: buildPropertyMetadata is total and always returns schemaVersion 3**
    - Use `fast-check` to generate arbitrary objects with `propertyType: 'ESTATE'` and a non-empty `listPrice`; assert the function never throws and always returns `schemaVersion: 3`
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5**

  - [ ]* 2.6 Write property test: `buildPropertyMetadata` output always passes `validatePropertyMetadata`
    - **Property 2: buildPropertyMetadata output always passes validatePropertyMetadata**
    - Generate valid Estate and Land `formPayload` objects with `fast-check`; assert `validatePropertyMetadata(buildPropertyMetadata(...))` returns `{ valid: true, errors: [] }`
    - **Validates: Requirements 1.1, 1.2, 1.3, 2.2, 2.5**

- [x] 3. Extend server/services/ipfsService.js — add pinFile()
  - Add `async pinFile(buffer, filename, mimeType)` method to `IPFSService`
  - When Pinata JWT is configured: POST to `https://api.pinata.cloud/pinning/pinFileToIPFS` using `FormData`, return `{ cid, uri: 'ipfs://${cid}', pinned: true }`
  - When no JWT: compute deterministic local CID via SHA-256 of buffer, return `{ cid, uri: 'ipfs://${cid}', pinned: false }`
  - Update `localPins` map with the result in both paths
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 3.1 Write property test: pinFile always sets uri to `ipfs://cid`
    - **Property 5: pinFile always sets uri to ipfs://cid**
    - Generate arbitrary buffers and filenames with `fast-check`; assert `result.uri === 'ipfs://' + result.cid` for every call
    - **Validates: Requirement 3.4**

  - [ ]* 3.2 Write property test: IPFS round-trip preserves metadata
    - **Property 4: IPFS round-trip preserves metadata**
    - Generate arbitrary metadata objects with `fast-check`; call `pinJSON(metadata)` then `fetchJSON(cid)` and assert deep equality with the original
    - **Validates: Requirement 4.1**

- [x] 4. Extend server/services/evidenceVault.js — accept client-side fingerprints
  - Update `normalizeDocumentEntry()` to accept and preserve `filename` and `docType` fields alongside existing fields
  - Preserve a valid 64-character hex `hash` without modification
  - Accept `docType` values from: `'title_deed'`, `'appraisal'`, `'survey'`, `'inspection'`, `'insurance'`, `'tax'`, `'other'`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 4.1 Write property test: normalizeDocumentEntry preserves valid hash values
    - **Property 6: normalizeDocumentEntry preserves valid hash values**
    - Generate arbitrary 64-character hex strings with `fast-check`; assert the returned entry's `hash` field equals the input hash exactly
    - **Validates: Requirements 5.2, 5.3**

- [x] 5. Update server/services/assetScreener.js — update extractYieldRate()
  - Update `extractYieldRate()` to read `publicMetadata.yieldParameters` before falling back to legacy fields, following the priority order defined in the design:
    1. Live stream data (unchanged)
    2. `yieldParameters.yieldTargetPct` (new)
    3. `yieldParameters.monthlyRentalIncome` annualized against `listPrice` (Estate)
    4. `yieldParameters.annualLandLeaseIncome` against `listPrice` (Land)
    5. Legacy `monthlyYieldTarget` (backward compat)
    6. Legacy `pricePerHour` (backward compat)
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 5.1 Write property test: extractYieldRate is monotone with respect to yieldTargetPct
    - **Property 3: extractYieldRate is monotone with respect to yieldTargetPct**
    - Generate pairs of otherwise-identical assets where asset A has a higher `yieldTargetPct` than asset B (no stream data); assert `extractYieldRate(A) >= extractYieldRate(B)`
    - **Validates: Requirements 6.1, 6.7**

- [x] 6. Checkpoint — Ensure all service-layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Add POST /api/rwa/photos route in server/routes/continuum.js
  - Add `multer` middleware configured for memory storage with a 10 MB file size limit
  - Add `POST /api/rwa/photos` route that:
    - Rejects requests with > 20 files (HTTP 400, `{ error: "Maximum 20 photos allowed" }`)
    - Rejects files with non-`image/` MIME types (HTTP 400, `{ error: "Only image files are accepted" }`)
    - Rejects files > 10,485,760 bytes (HTTP 400, `{ error: "Photo exceeds 10MB limit", filename }`)
    - Calls `ipfsService.pinFile()` for each accepted file (up to 3 in parallel)
    - Returns `{ photos: PhotoEntry[], coverCID }` on success
    - Returns HTTP 502 `{ error: "Photo storage failed", code: "ipfs_pin_failed" }` if Pinata fails
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 8. Update POST /api/rwa/assets in server/index.js — wire propertyMetadataService
  - Import `propertyMetadataService` at the top of `server/index.js`
  - Update the existing `POST /api/rwa/assets` handler to:
    - Accept `propertyType`, `formPayload`, `photoCIDs`, `coverCID` in the request body
    - Validate `propertyType` is `'ESTATE'` or `'LAND'` (HTTP 400 if missing)
    - Validate `formPayload.listPrice` is present (HTTP 400 if missing)
    - Validate `formPayload.address` fields are present (HTTP 400 if missing)
    - Validate `yieldTargetPct` is 0–100 if provided (HTTP 400 if out of range)
    - Call `buildPropertyMetadata()` and `validatePropertyMetadata()` before pinning
    - Pin metadata via `ipfsService.pinJSON()`, catching failures and returning HTTP 502 `{ error: "Metadata storage failed", code: "ipfs_pin_failed" }`
    - Pass `asset_type: 1` for both ESTATE and LAND to the Soroban `mint_asset` call
    - Return `{ tokenId, metadataURI, txHash }` on success
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 12.1, 12.2, 12.3, 12.4_

- [x] 9. Update POST /api/rwa/evidence in server/index.js — validate fingerprints
  - Update the existing `POST /api/rwa/evidence` handler to:
    - Accept a `documents` map where each entry has `hash` (64-char hex), `filename`, and `docType`
    - Validate each `hash` is a 64-character hex string (HTTP 400 with descriptive error if not)
    - Validate each `docType` is in the allowed set (HTTP 400 with descriptive error if not)
    - Pass the validated documents to `evidenceVault.storeBundle()`
    - Return `{ evidenceRoot, evidenceManifestHash }`
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 10. Checkpoint — Ensure all API-layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Add uploadPhotos() and submitEvidence() to vite-project/src/services/rwaApi.js
  - Add `uploadPhotos(files, coverIndex)` — builds a `FormData` object and POSTs to `/api/rwa/photos`; returns `{ photos, coverCID }`
  - Add `submitEvidence(documents)` — POSTs to `/api/rwa/evidence` with the documents map; returns `{ evidenceRoot, evidenceManifestHash }`
  - _Requirements: 10.1, 10.2_

- [x] 12. Wire vite-project/src/pages/PropertyMint.tsx to backend APIs
  - On photo selection, store the actual `File` objects (not just preview URLs) in component state
  - On evidence document selection, compute SHA-256 fingerprints client-side using `crypto.subtle.digest` — do not store raw file bytes in state or transmit them to the server
  - On form submit ("MINT RWA TWIN ON STELLAR"):
    1. Call `uploadPhotos()` with the selected photo `File` objects and `coverIndex`
    2. Call `submitEvidence()` with the computed fingerprint map
    3. Call `mintRwaAsset()` with `{ propertyType, formPayload, photoCIDs, coverCID, evidenceRoot, evidenceManifestHash, issuer, jurisdiction }`
  - Disable the submit button and show a loading indicator while any request is in progress
  - Display `{ tokenId, metadataURI, txHash }` as a success confirmation when mint succeeds
  - Display the error message returned by the API without navigating away from the form on failure
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [x] 13. Wire vite-project/src/pages/PropertyDetail.tsx to rich metadata
  - On mount, fetch the asset from `GET /api/rwa/assets/:tokenId` using `fetchRwaAsset(tokenId)` from `rwaApi.js`
  - Populate all display sections from `asset.publicMetadata`
  - Ensure `LocationTab` renders a Google Maps embed using `latitude`/`longitude` when present, falling back to the address string
  - Ensure `FactsTab` renders Estate sections when `publicMetadata.propertyType === 'ESTATE'` and Land sections when `'LAND'`
  - Ensure `OverviewTab` Financial Overview reads from `yieldParameters` when present
  - Display a user-friendly error message if the fetch fails (network error or 404)
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

- [x] 14. Write server/test/propertyMetadata.test.js
  - [x] 14.1 Write unit tests for buildPropertyMetadata (Estate)
    - Complete Estate payload → assert `schemaVersion: 3`, `propertyType: 'ESTATE'`, non-empty `name`, `yieldParameters` present with correct fields
    - Minimal required-only payload → assert no throw, `monthlyYieldTarget` set
    - String numeric inputs → assert parsed to finite numbers, no `NaN`
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.9_

  - [x] 14.2 Write unit tests for buildPropertyMetadata (Land)
    - Complete Land payload → assert `schemaVersion: 3`, `propertyType: 'LAND'`, name contains `"acres at"`, `yieldParameters.annualLandLeaseIncome` present
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.8_

  - [x] 14.3 Write unit tests for validatePropertyMetadata
    - Valid Estate metadata → `{ valid: true, errors: [] }`
    - `null` / `undefined` input → `{ valid: false, errors: [...] }` with at least one error
    - Missing each required field individually → specific error message per field
    - Assert function never throws for any input
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 14.4 Write unit tests for extractYieldRate (updated)
    - Asset with `yieldParameters.yieldTargetPct: 8.5` → returns `8.5`
    - Asset with `yieldParameters.monthlyRentalIncome: 3500` and `listPrice: 500000` → returns `(3500 * 12 / 500000) * 100`
    - Asset with `yieldParameters.annualLandLeaseIncome: 12000` and `listPrice: 200000` → returns `(12000 / 200000) * 100`
    - Asset with live stream data → stream-derived rate takes priority over `yieldParameters`
    - Legacy asset with only `monthlyYieldTarget` → non-zero rate returned
    - Legacy asset with only `pricePerHour` → non-zero rate returned
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 14.5 Write property tests (fast-check) for all 6 correctness properties
    - Property 1: `buildPropertyMetadata` is total — never throws, always returns `schemaVersion: 3`
    - Property 2: `buildPropertyMetadata` output always passes `validatePropertyMetadata`
    - Property 3: `extractYieldRate` is monotone with respect to `yieldTargetPct`
    - Property 4: IPFS round-trip — `pinJSON` then `fetchJSON` returns deeply equal object
    - Property 5: `pinFile` always sets `uri === 'ipfs://' + cid`
    - Property 6: `normalizeDocumentEntry` preserves valid 64-char hex hash values
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.2, 2.5, 3.4, 4.1, 5.2, 5.3, 6.1, 6.7_

- [x] 15. Final checkpoint — Ensure all tests pass
  - Run `npm test` in `server/` and verify all unit and property tests pass.
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties; unit tests validate specific examples and edge cases
- No Soroban contract redeployment is required — both ESTATE and LAND map to `asset_type: 1`
