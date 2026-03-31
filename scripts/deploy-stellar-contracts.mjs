import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const sorobanRoot = path.join(repoRoot, "soroban");
const distDir = path.join(sorobanRoot, "dist");
const deploymentsDir = path.join(sorobanRoot, "deployments");
const manifestPath = path.join(deploymentsDir, "testnet.json");

dotenv.config({ path: path.join(repoRoot, ".env") });

const rpcUrl = process.env.STELLAR_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const networkPassphrase =
  process.env.STELLAR_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015";
const operatorSecret = process.env.STELLAR_OPERATOR_SECRET || "";
const operatorPublicKey =
  process.env.STELLAR_OPERATOR_PUBLIC_KEY || process.env.STELLAR_PLATFORM_ADDRESS || "";
const usdcIssuer = process.env.STELLAR_ASSET_ISSUER || "";
const usdcCode = process.env.STELLAR_ASSET_CODE || "USDC";

if (!operatorSecret) {
  throw new Error("STELLAR_OPERATOR_SECRET is required to deploy Soroban contracts.");
}
if (!operatorPublicKey) {
  throw new Error("STELLAR_OPERATOR_PUBLIC_KEY or STELLAR_PLATFORM_ADDRESS is required.");
}

const contractSpecs = [
  {
    key: "sessionMeter",
    alias: "stream-engine-session-meter",
    wasm: path.join(distDir, "session_meter.wasm"),
    packageName: "session_meter",
  },
  {
    key: "rwaRegistry",
    alias: "stream-engine-rwa-registry",
    wasm: path.join(distDir, "rwa_registry.wasm"),
    packageName: "rwa_registry",
  },
  {
    key: "attestationRegistry",
    alias: "stream-engine-attestation-registry",
    wasm: path.join(distDir, "attestation_registry.wasm"),
    packageName: "attestation_registry",
  },
  {
    key: "yieldVault",
    alias: "stream-engine-yield-vault",
    wasm: path.join(distDir, "yield_vault.wasm"),
    packageName: "yield_vault",
  },
];

function run(command, args, { cwd = repoRoot, allowFailure = false } = {}) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });

  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        result.stdout?.trim(),
        result.stderr?.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return {
    status: result.status ?? 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function extractContractId(output) {
  const match = output.match(/\bC[A-Z2-7]{55}\b/);
  if (!match) {
    throw new Error(`Could not find contract id in output:\n${output}`);
  }
  return match[0];
}

function invoke(contractId, fn, args = []) {
  console.log(`Bootstrapping ${fn} on ${contractId}`);
  return run("stellar", [
    "contract",
    "invoke",
    "--id",
    contractId,
    "--source-account",
    operatorSecret,
    "--rpc-url",
    rpcUrl,
    "--network-passphrase",
    networkPassphrase,
    "--send",
    "yes",
    "--",
    fn,
    ...args,
  ], { cwd: repoRoot, allowFailure: true });
}

function ensureBuiltArtifacts() {
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }

  run("stellar", [
    "contract",
    "build",
    "--manifest-path",
    path.join("soroban", "Cargo.toml"),
    "--out-dir",
    path.join("soroban", "dist"),
    "--optimize",
  ], { cwd: repoRoot });
}

function deployContracts() {
  const deployed = {};
  for (const spec of contractSpecs) {
    console.log(`Deploying ${spec.packageName}...`);
    const result = run("stellar", [
      "contract",
      "deploy",
      "--wasm",
      spec.wasm,
      "--source-account",
      operatorSecret,
      "--rpc-url",
      rpcUrl,
      "--network-passphrase",
      networkPassphrase,
      "--alias",
      spec.alias,
    ], { cwd: repoRoot });

    deployed[spec.key] = {
      alias: spec.alias,
      contractId: extractContractId(`${result.stdout}\n${result.stderr}`),
      wasm: path.relative(repoRoot, spec.wasm),
      packageName: spec.packageName,
    };
  }
  return deployed;
}

function bootstrapContracts(deployment) {
  console.log("Initializing deployed contracts...");
  const initTargets = [
    { key: "sessionMeter", fn: "initialize", args: ["--admin", operatorPublicKey] },
    { key: "rwaRegistry", fn: "initialize", args: ["--admin", operatorPublicKey] },
    { key: "attestationRegistry", fn: "initialize", args: ["--admin", operatorPublicKey] },
    {
      key: "yieldVault",
      fn: "initialize",
      args: ["--admin", operatorPublicKey, "--registry", deployment.rwaRegistry.contractId],
    },
  ];

  for (const target of initTargets) {
    invoke(deployment[target.key].contractId, target.fn, target.args);
  }

  const registryId = deployment.rwaRegistry.contractId;
  const attestationRegistryId = deployment.attestationRegistry.contractId;

  const assetTypePolicies = [
    { assetType: 1, requiresAttestation: true },
    { assetType: 2, requiresAttestation: true },
    { assetType: 3, requiresAttestation: true },
  ];

  for (const policy of assetTypePolicies) {
    console.log(`Setting registry asset type policy for ${policy.assetType}`);
    invoke(registryId, "set_asset_type_policy", [
      "--admin",
      operatorPublicKey,
      "--asset-type",
      String(policy.assetType),
      "--requires-attestation",
      String(policy.requiresAttestation),
    ]);
  }

  const attestationPolicies = [
    { assetType: 1, role: 2, required: true, maxAge: 15_552_000 },
    { assetType: 1, role: 4, required: true, maxAge: 15_552_000 },
    { assetType: 2, role: 4, required: true, maxAge: 7_776_000 },
    { assetType: 2, role: 6, required: true, maxAge: 15_552_000 },
    { assetType: 3, role: 4, required: true, maxAge: 7_776_000 },
    { assetType: 3, role: 6, required: true, maxAge: 15_552_000 },
  ];

  for (const policy of attestationPolicies) {
    console.log(`Setting attestation policy assetType=${policy.assetType} role=${policy.role}`);
    invoke(attestationRegistryId, "set_policy", [
      "--admin",
      operatorPublicKey,
      "--asset-type",
      String(policy.assetType),
      "--role",
      String(policy.role),
      "--required",
      String(policy.required),
      "--max-age",
      String(policy.maxAge),
    ]);
  }
}

function resolveAssetContractId(asset) {
  const result = run("stellar", [
    "contract",
    "id",
    "asset",
    "--asset",
    asset,
    "--rpc-url",
    rpcUrl,
    "--network-passphrase",
    networkPassphrase,
  ], { cwd: repoRoot });

  return extractContractId(`${result.stdout}\n${result.stderr}`);
}

function writeManifest(manifest) {
  mkdirSync(deploymentsDir, { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function main() {
  console.log("Building Soroban contracts...");
  ensureBuiltArtifacts();

  console.log("Deploying Soroban contracts to Stellar testnet...");
  const deployed = deployContracts();
  bootstrapContracts(deployed);

  console.log("Resolving SAC contract ids...");
  const xlmSac = resolveAssetContractId("native");
  const usdcSac = usdcIssuer
    ? resolveAssetContractId(`${usdcCode}:${usdcIssuer}`)
    : "";

  const manifest = {
    network: {
      kind: "stellar",
      name: process.env.STREAM_ENGINE_NETWORK_NAME || "Stellar Testnet",
      rpcUrl,
      networkPassphrase,
      updatedAt: new Date().toISOString(),
    },
    operator: {
      publicKey: operatorPublicKey,
    },
    contracts: deployed,
    sac: {
      nativeXlm: xlmSac,
      usdc: usdcSac,
    },
  };

  writeManifest(manifest);

  console.log(JSON.stringify(manifest, null, 2));
}

main();
