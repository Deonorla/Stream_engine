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
const agentConsolePagePath = path.resolve(__dirname, "../src/pages/AgentConsolePage.tsx");
const stellarContractsPath = path.resolve(__dirname, "../src/lib/stellarRwaContracts.ts");
const agentAuthStoragePath = path.resolve(__dirname, "../src/lib/agentAuthStorage.ts");

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
  assert.match(source, /Land/);
  assert.match(source, /mintRwaAsset\(/);
  assert.match(source, /transferAssetOwnershipOnChain/);
  assert.match(source, /createMarketAuction/);
  assert.match(source, /Mint \+ Auction Live/);
});

test("Docs page source states the v2 legal boundary clearly", async () => {
  const source = await fs.readFile(docsPagePath, "utf8");

  assert.match(source, /verified productive rental twin/i);
  assert.match(source, /not pretending to be a court-ready deed transfer/i);
  assert.match(source, /raw deeds, tax files, and inspections stay private/i);
});

test("Marketplace source keeps the lighter auction-first layout", async () => {
  const source = await fs.readFile(marketplacePagePath, "utf8");

  assert.match(source, /Discover, rent, and trade productive real estate and land twins/i);
  assert.match(source, /Top Agents/);
  assert.match(source, /My Positions/);
  assert.match(source, /Premium Analytics/);
  assert.match(source, /Timed Auction/);
  assert.match(source, /Available Only/);
});

test("Agent Console source surfaces the managed session rail and widened mandate controls", async () => {
  const source = await fs.readFile(agentConsolePagePath, "utf8");

  assert.match(source, /Autonomous Brain/);
  assert.match(source, /Current Thesis/);
  assert.match(source, /Why No Action \/ Blocker/);
  assert.match(source, /Objective & Chat/);
  assert.match(source, /Agent Chat/);
  assert.match(source, /Current Goal/);
  assert.match(source, /Live Mandate/);
  assert.match(source, /Capital Base/);
  assert.match(source, /Issuer Cap/);
  assert.match(source, /Asset Cap/);
  assert.match(source, /Max Drawdown/);
  assert.match(source, /Approved Asset Classes/);
  assert.match(source, /Treasury Strategies/);
  assert.match(source, /Land/);
  assert.match(source, /Blend Lending/);
  assert.match(source, /Session Rail/);
  assert.match(source, /Open .* Session/);
  assert.match(source, /\bEnd\b/);
  assert.match(source, /Optimize Treasury/);
  assert.match(source, /\bClaim\b/);
  assert.match(source, /\bRoute\b/);
});

test("Stellar RWA contract client prefers the live backend catalog over stale env ids", async () => {
  const source = await fs.readFile(stellarContractsPath, "utf8");

  assert.match(source, /fetchProtocolCatalog/);
  assert.match(source, /resolveRuntimeContractIds/);
  assert.match(source, /catalog\?\.rwa\?\.assetRegistryAddress/);
});

test("Agent auth storage source keeps per-owner managed agent sessions", async () => {
  const source = await fs.readFile(agentAuthStoragePath, "utf8");

  assert.match(source, /agent_session_tokens_by_owner/);
  assert.match(source, /agent_session_active_owner/);
  assert.match(source, /getAgentTokenOwner/);
  assert.match(source, /setActiveAgentOwner/);
  assert.match(source, /getPreferredAgentAuthToken\(ownerPublicKey\?: string \| null\)/);
});
