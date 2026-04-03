import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  mapApiAssetToUiAsset,
  verifyAssetRecord,
} from "../src/pages/rwa/rwaData.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rwaPagePath = path.resolve(__dirname, "../src/pages/RWA.tsx");
const docsPagePath = path.resolve(__dirname, "../src/pages/Docs.tsx");
const marketplacePagePath = path.resolve(__dirname, "../src/pages/Marketplace.tsx");

test("mapApiAssetToUiAsset preserves v2 verification fields", () => {
  const mapped = mapApiAssetToUiAsset({
    tokenId: 11,
    assetType: 1,
    rightsModelLabel: "verified_rental_asset",
    verificationStatusLabel: "pending_attestation",
    statusReason: "awaiting lawyer and inspector attestations",
    propertyRefHash: "0xprop",
    publicMetadataHash: "0xmeta",
    evidenceRoot: "0xevidence",
    evidenceManifestHash: "0xmanifest",
    verificationUpdatedAt: 1710720000,
    currentOwner: "0x1234",
    issuer: "0x1234",
    activeStreamId: 9,
    claimableYield: "1500000",
    stream: { streamId: 9, totalAmount: "0", flowRate: "0", isFrozen: false },
    publicMetadata: {
      name: "Lagos Rental Twin",
      location: "Victoria Island",
      rightsModel: "verified_rental_asset",
      monthlyYieldTarget: 1200,
    },
    attestationPolicies: [],
    attestations: [],
    assetPolicy: { frozen: false, disputed: false, revoked: false, reason: "" },
  });

  assert.equal(mapped.propertyRefHash, "0xprop");
  assert.equal(mapped.evidenceManifestHash, "0xmanifest");
  assert.equal(mapped.verificationUpdatedAt, 1710720000);
  assert.equal(mapped.verificationStatus, "pending_attestation");
  assert.equal(mapped.activeStreamId, 9);
});

test("verifyAssetRecord still returns structured fallback results", () => {
  const asset = {
    tokenId: "11",
    verificationCid: "bafyexamplecid",
    publicMetadata: { propertyRef: "plot-42-block-7" },
    verificationStatus: "verified",
  };

  const result = verifyAssetRecord(
    {
      tokenId: "11",
      cidOrUri: "ipfs://bafyexamplecid",
      propertyRef: "plot-42-block-7",
    },
    [asset],
  );

  assert.equal(result.status, "verified_with_warnings");
  assert.ok(Array.isArray(result.warnings));
  assert.ok(Array.isArray(result.failures));
  assert.ok(Array.isArray(result.requiredActions));
  assert.ok("documentFreshness" in result);
  assert.ok("attestationCoverage" in result);
});

test("RWA page source still exposes the active Stellar studio layout", async () => {
  const source = await fs.readFile(rwaPagePath, "utf8");

  assert.match(source, /RWA Studio/);
  assert.match(source, /My Portfolio/);
  assert.match(source, /Stellar network/i);
  assert.match(source, /Equipment/);
});

test("Docs page source states the v2 legal boundary clearly", async () => {
  const source = await fs.readFile(docsPagePath, "utf8");

  assert.match(source, /verified productive rental twin/i);
  assert.match(source, /not pretending to be a court-ready deed transfer/i);
  assert.match(source, /raw deeds, tax files, and inspections stay private/i);
});

test("Marketplace source surfaces autonomous attention and bid guardrails", async () => {
  const source = await fs.readFile(marketplacePagePath, "utf8");

  assert.match(source, /Autonomous Attention/);
  assert.match(source, /Current Bid Focus/);
  assert.match(source, /live shortlist hits, watchlist signals, and current bid focus/i);
  assert.match(source, /Bid Guardrails/);
  assert.match(source, /Max Guided Bid/);
  assert.match(source, /Reserve Book/);
});
