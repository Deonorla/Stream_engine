async function testMintRequest() {
  const payload = {
    issuer: "0x0000000000000000000000000000000000000003",
    assetType: 1,
    rightsModel: 1,
    jurisdiction: "NG-LA",
    authorization: "test",
    signature: "0xTest",
    evidenceBundle: { manifestHash: "0x123", evidenceRoot: "0x123" },
    propertyRef: "TEST-123",
    name: "TEST",
    publicMetadata: { name: "TEST", description: "test" },
    issuerSignature: "0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001c"
  };

  try {
    const res = await fetch("http://localhost:3001/api/rwa/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}

testMintRequest();
