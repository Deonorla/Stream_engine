import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIssuerAuthorizationMessage,
  createIssuerAuthorization,
} from "../src/lib/rwaAuthorization.js";

test("buildIssuerAuthorizationMessage matches backend mint authorization shape", () => {
  const message = buildIssuerAuthorizationMessage({
    issuer: "gabc123",
    rightsModel: "verified_rental_asset",
    jurisdiction: "NG-LA",
    propertyRef: "STREAM-REA-LAGOS-001",
    publicMetadataHash: "0xmeta",
    evidenceRoot: "0xevidence",
    issuedAt: "2026-04-03T22:30:00.000Z",
    nonce: "mint-123",
  });

  assert.equal(
    message,
    [
      "Stream Engine RWA Mint Authorization",
      "issuer:GABC123",
      "rightsModel:verified_rental_asset",
      "jurisdiction:NG-LA",
      "propertyRef:STREAM-REA-LAGOS-001",
      "publicMetadataHash:0xmeta",
      "evidenceRoot:0xevidence",
      "issuedAt:2026-04-03T22:30:00.000Z",
      "nonce:mint-123",
    ].join("\n"),
  );
});

test("createIssuerAuthorization signs the mint message with the connected signer", async () => {
  const signedMessages = [];
  const signer = {
    async getAddress() {
      return "gagentissuer123";
    },
    async signMessage(message) {
      signedMessages.push(message);
      return "signed-message";
    },
  };

  const authorization = await createIssuerAuthorization({
    signer,
    rightsModel: "verified_rental_asset",
    jurisdiction: "NG-LA",
    propertyRef: "STREAM-VEH-LAGOS-002",
    publicMetadataHash: "0xmeta",
    evidenceRoot: "0xevidence",
    issuedAt: "2026-04-03T22:31:00.000Z",
    nonce: "mint-456",
  });

  assert.equal(authorization.signerAddress, "GAGENTISSUER123");
  assert.equal(authorization.signatureType, "stellar");
  assert.equal(authorization.signature, "signed-message");
  assert.equal(authorization.issuedAt, "2026-04-03T22:31:00.000Z");
  assert.equal(authorization.nonce, "mint-456");
  assert.equal(signedMessages.length, 1);
  assert.equal(signedMessages[0], authorization.message);
  assert.match(authorization.message, /issuer:GAGENTISSUER123/);
});
