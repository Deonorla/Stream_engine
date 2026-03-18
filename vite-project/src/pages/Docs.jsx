import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Blocks,
  BookOpen,
  Bot,
  Building2,
  Coins,
  Database,
  ExternalLink,
  FileSearch,
  Link2,
  ScanLine,
  ShieldCheck,
  Wallet,
  Waypoints,
} from "lucide-react";
import { useProtocolCatalog } from "../hooks/useProtocolCatalog";
import { ACTIVE_NETWORK } from "../networkConfig.js";

const DEPLOYED_CONTRACT_DEFAULTS = {
  stream: {
    name: "Stream Engine Stream",
    onchainName: "FlowPayStream",
    group: "Payment Rail",
    address: "0x75edbf3d9857521f5fb2f581c896779f5110a8a0",
    role: "Reusable payment stream rail for x402-compatible API and access payments.",
  },
  rwaHub: {
    name: "Stream Engine RWA Hub",
    onchainName: "FlowPayRWAHub",
    group: "RWA Rail",
    address: "0x1286a0fe3413dd70083df2d654677a7c39096753",
    role: "Main RWA orchestrator for minting, yield funding, claims, flash advance, and admin actions.",
  },
  assetNft: {
    name: "Stream Engine Asset NFT",
    onchainName: "FlowPayAssetNFT",
    group: "RWA Rail",
    address: "0x0340b3f493bae901f740c494b2f7744f5fffe348",
    role: "ERC-721 digital twin contract for productive real-world rental assets.",
  },
  assetRegistry: {
    name: "Stream Engine Asset Registry",
    onchainName: "FlowPayAssetRegistry",
    group: "RWA Rail",
    address: "0x9db31d67bd603508cfac61dcd31d98dfbd46cf5f",
    role: "Onchain asset identity registry for rights model, property reference hash, public metadata hash, evidence roots, and verification status.",
  },
  attestationRegistry: {
    name: "Stream Engine Attestation Registry",
    onchainName: "FlowPayAssetAttestationRegistry",
    group: "RWA Rail",
    address: "",
    role: "Role-based attestation registry for lawyers, inspectors, valuers, insurers, registrars, issuers, and compliance operators.",
  },
  assetStream: {
    name: "Stream Engine Asset Stream",
    onchainName: "FlowPayAssetStream",
    group: "RWA Rail",
    address: "0x2d6bda7095b2d6c9d4eee9f754f2a1eba6114396",
    role: "Asset-linked yield engine that keeps future revenue coupled to NFT ownership.",
  },
  complianceGuard: {
    name: "Stream Engine Compliance Guard",
    onchainName: "FlowPayComplianceGuard",
    group: "RWA Rail",
    address: "0x72a979756061c5993a4c9c95e87519e9492dd721",
    role: "Compliance and freeze control layer for regulated RWA actions.",
  },
};

function getDeployedContractDescriptors(catalog) {
  return [
    {
      ...DEPLOYED_CONTRACT_DEFAULTS.stream,
      address:
        catalog?.payments?.contractAddress || DEPLOYED_CONTRACT_DEFAULTS.stream.address,
      note:
        "This is the contract the payment runtime uses for sender budgets, claims, and stream cancellation.",
    },
    {
      ...DEPLOYED_CONTRACT_DEFAULTS.rwaHub,
      address: catalog?.rwa?.hubAddress || DEPLOYED_CONTRACT_DEFAULTS.rwaHub.address,
      note:
        "This is the user-facing entrypoint for the RWA subsystem. It ties together minting, yield funding, claims, compliance, and freezes.",
    },
    {
      ...DEPLOYED_CONTRACT_DEFAULTS.assetNft,
      address:
        catalog?.rwa?.assetNFTAddress || DEPLOYED_CONTRACT_DEFAULTS.assetNft.address,
      note:
        "This NFT is the digital twin. Ownership of this token is what future uncaptured yield follows.",
    },
    {
      ...DEPLOYED_CONTRACT_DEFAULTS.assetRegistry,
      address:
        catalog?.rwa?.assetRegistryAddress
        || DEPLOYED_CONTRACT_DEFAULTS.assetRegistry.address,
      note:
        "This registry stores the durable asset identity: rights model, public metadata hash, property reference hash, evidence roots, and verification state.",
    },
    {
      ...DEPLOYED_CONTRACT_DEFAULTS.attestationRegistry,
      address:
        catalog?.rwa?.attestationRegistryAddress
        || DEPLOYED_CONTRACT_DEFAULTS.attestationRegistry.address,
      note:
        "This registry stores who attested to what, when it was signed, when it expires, and whether it was revoked.",
    },
    {
      ...DEPLOYED_CONTRACT_DEFAULTS.assetStream,
      address:
        catalog?.rwa?.assetStreamAddress
        || DEPLOYED_CONTRACT_DEFAULTS.assetStream.address,
      note:
        "This contract is where productive RWA logic becomes real. It tracks time-based yield and supports flash-advance behavior.",
    },
    {
      ...DEPLOYED_CONTRACT_DEFAULTS.complianceGuard,
      address:
        catalog?.rwa?.complianceGuardAddress
        || DEPLOYED_CONTRACT_DEFAULTS.complianceGuard.address,
      note:
        "This guard blocks claims or funding when compliance rules or freeze controls say the action should not proceed.",
    },
  ];
}

function buildRouteRows(routes = [], tokenSymbol = "USDC") {
  if (!routes.length) {
    return [
      ["/api/free", "free", "0"],
      ["/api/weather", "streaming", `0.0001 ${tokenSymbol}/sec`],
      ["/api/premium", "per-request", `1 ${tokenSymbol}`],
    ];
  }

  return routes.map((route) => [
    route.path,
    route.mode,
    `${route.price} ${tokenSymbol}${route.mode === "streaming" ? "/sec" : ""}`,
  ]);
}

function buildContractRows(catalog) {
  return getDeployedContractDescriptors(catalog).map((contract) => [
    contract.name,
    contract.address || "Not configured",
    `${contract.role} Onchain deployment id: ${contract.onchainName}.`,
  ]);
}

function buildContractLinks(catalog) {
  const explorerBase = String(
    ACTIVE_NETWORK.explorerUrl || "https://westmint.subscan.io",
  ).replace(/\/$/, "");
  return getDeployedContractDescriptors(catalog)
    .filter((contract) => Boolean(contract.address))
    .map((contract) => ({
      label: contract.name,
      value: contract.address,
      href: `${explorerBase}/account/${contract.address}`,
      note: `Onchain deployment id: ${contract.onchainName}`,
    }));
}

function buildSections(catalog) {
  const networkName = catalog?.network?.name || "Westend Asset Hub";
  const chainId = catalog?.network?.chainId || 420420421;
  const tokenSymbol = catalog?.payments?.tokenSymbol || "USDC";
  const paymentAssetId = catalog?.payments?.paymentAssetId || 31337;
  const recipientAddress =
    catalog?.payments?.recipientAddress || "Not configured";

  return [
    {
      id: "overview",
      icon: BookOpen,
      title: "Overview",
      eyebrow: "Start Here",
      summary:
        "What Stream Engine is, what problem it solves, and how the pieces fit together.",
      plainEnglish:
        'If x402 is the sign on the shop door saying "you must pay before entry", Stream Engine is the running tab that lets the agent pay once, keep using the service, and settle fairly over time.',
      takeaways: [
        "x402 is the payment handshake, not the payment engine.",
        "Streaming is the reusable settlement rail that makes repeated paid usage practical.",
        "The RWA side extends the same streaming logic into real-world rental assets and asset-linked yield.",
      ],
      points: [
        {
          title: "What the project is",
          body: `Stream Engine is a machine-payments and rental-RWA system running on ${networkName}. It combines payment negotiation, stream settlement, and asset verification in one product.`,
        },
        {
          title: "What problem it solves",
          body: "Repeated onchain payments are too expensive and too slow for agents. Stream Engine replaces repeated checkout with one reusable payment stream.",
        },
        {
          title: "What the moving parts are",
          body: "x402 handles payment negotiation, the stream contracts handle settlement, middleware checks payment state, and RWA Studio handles minting, verification, renting, and yield.",
        },
        {
          title: "What not to confuse",
          body: "x402 is not the stream. x402 says payment is required. Stream Engine decides how to satisfy that payment requirement efficiently.",
        },
      ],
      stepsTitle: "The full product loop",
      steps: [
        "An agent or user hits a paid route or rental workflow.",
        "The service explains the payment terms in a machine-readable way.",
        `The payer approves ${tokenSymbol} and opens a reusable stream or executes a direct payment when that is cheaper.`,
        "Middleware checks the stream or payment proof before serving the resource.",
        "If the session ends early, unused balance is left with the payer instead of being burned through repeated checkout.",
      ],
      tables: [
        {
          title: "Runtime facts",
          headers: ["Item", "Value"],
          rows: [
            ["Network", networkName],
            ["Chain ID", String(chainId)],
            ["Gas token", "WND"],
            ["Payment token", `Circle ${tokenSymbol}`],
            ["Payment asset id", String(paymentAssetId)],
            ["Service recipient", recipientAddress],
          ],
        },
      ],
      faqs: [
        {
          question: "Is Stream Engine only for API payments?",
          answer:
            "No. It handles API payments and rental RWAs. The same stream logic can power machine payments, rental access, and asset-linked revenue flows.",
        },
        {
          question: "Why keep x402 if streams already exist?",
          answer:
            "Because streams solve settlement, not discovery. x402 tells the client what it must pay, who to pay, and which mode is allowed.",
        },
      ],
    },
    {
      id: "system-stack",
      icon: Blocks,
      title: "System Stack",
      eyebrow: "Layer By Layer",
      summary:
        "The cleanest way to understand the product is to separate the protocol layer, settlement layer, enforcement layer, and asset layer.",
      plainEnglish:
        "Do not cram the whole product into one sentence. Think in layers. One layer says payment is needed. One layer moves value. One layer enforces access. One layer handles assets and provenance.",
      takeaways: [
        "The protocol layer explains payment terms.",
        "The settlement layer moves money through direct payments or streams.",
        "The enforcement layer decides whether a request or asset action is allowed right now.",
      ],
      points: [
        {
          title: "Protocol layer",
          body: "This is the x402-style handshake. It says payment is required and explains the terms in machine-readable form.",
        },
        {
          title: "Settlement layer",
          body: `This is where ${tokenSymbol} actually moves. It can happen through direct settlement or through reusable stream contracts.`,
        },
        {
          title: "Enforcement layer",
          body: "Middleware checks whether the client has actually satisfied the payment requirement. On the RWA side, the same idea applies to claims, compliance, and freezes.",
        },
        {
          title: "Asset layer",
          body: "This is where asset NFTs, metadata, provenance, tag verification, rental access, and yield coupling live.",
        },
      ],
      tables: [
        {
          title: "System layers",
          headers: ["Layer", "Main job", "Question it answers"],
          rows: [
            [
              "x402 / route policy",
              "Describe payment requirements",
              "What must be paid, to whom, and in which mode?",
            ],
            [
              "Stream / payment contracts",
              "Move and settle value",
              "How does value accrue or get claimed?",
            ],
            [
              "Middleware / compliance",
              "Enforce access and safety",
              "Should this request or withdrawal be allowed right now?",
            ],
            [
              "RWA registry / NFT / verification",
              "Track asset truth",
              "What is this asset, and is its story consistent?",
            ],
          ],
        },
      ],
      faqs: [
        {
          question: "Why split the system into layers at all?",
          answer:
            "Because it prevents confusion. If you mix negotiation, settlement, access control, and asset ownership together, every bug becomes harder to reason about and every explanation becomes vague.",
        },
      ],
    },
    {
      id: "streaming",
      icon: Coins,
      title: "Streaming 101",
      eyebrow: "Money Flow",
      summary:
        "What a payment stream is and why it is better than repeated onchain payments for high-frequency usage.",
      plainEnglish:
        "A stream is a money meter. Think taxi meter, electricity meter, or prepaid running tab. Value unlocks gradually as time passes. If you stop early, the unused part stays yours.",
      takeaways: [
        "A stream is closer to a metered tab than to a one-off transfer.",
        "The receiver only gets the accrued part, not the whole budget immediately.",
        "Cancellation matters because it protects the sender from overpaying for unused time.",
      ],
      points: [
        {
          title: "Direct payment",
          body: "One request, one payment. Simple, but too costly for high-frequency agent usage.",
        },
        {
          title: "Subscription",
          body: "Pay one big amount up front for a long period. Easy for humans, but wasteful when usage is unpredictable.",
        },
        {
          title: "Stream",
          body: "Lock a budget, release value over time, and cancel when you are done. This is what makes autonomous usage practical.",
        },
        {
          title: "Refund logic",
          body: "When a stream ends early, the unconsumed portion does not belong to the service. It remains with the sender and stops accruing.",
        },
      ],
      code: `flowRate = totalAmount / durationSeconds
elapsed = min(now, stopTime) - startTime
claimable = (flowRate * elapsed) - amountWithdrawn`,
      stepsTitle: "How a payment stream behaves",
      steps: [
        `The payer approves ${tokenSymbol} to the stream contract.`,
        "The stream starts with a sender, a recipient, a budget, and a duration.",
        "Claimable balance grows over time instead of arriving in one lump sum.",
        "The recipient withdraws only what has actually accrued.",
        "If the stream is cancelled early, the remaining budget stops flowing.",
      ],
      tables: [
        {
          title: "Why streams matter",
          headers: ["Model", "Best for", "Problem"],
          rows: [
            [
              "Direct payment",
              "Small or infrequent calls",
              "Too many signatures when used repeatedly",
            ],
            [
              "Subscription",
              "Fixed predictable access",
              "Overpays when usage is uncertain",
            ],
            [
              "Streaming",
              "High-frequency or session-based usage",
              "Needs stream lifecycle logic, but has the best economics",
            ],
          ],
        },
      ],
      faqs: [
        {
          question: "Does the recipient get all the money immediately?",
          answer:
            "No. They only get the portion that has accrued so far. The rest is still unspent budget.",
        },
        {
          question: "Is a stream the same as escrow?",
          answer:
            "Close, but not identical. Escrow only holds funds. A stream also defines time-based release rules and cancellation behavior.",
        },
      ],
    },
    {
      id: "x402",
      icon: Waypoints,
      title: "x402 Negotiation",
      eyebrow: "Payment Handshake",
      summary:
        "How the product uses HTTP 402 as the machine-readable paywall and why that matters for agents.",
      plainEnglish:
        'x402 is the sentence that says "you must pay first, and here is exactly how". It does not move money. It tells the client how money should be moved.',
      takeaways: [
        "x402 is the language of the paywall.",
        "It standardizes discovery of price, token, recipient, and mode.",
        "Stream Engine plugs into x402 instead of replacing it.",
      ],
      points: [
        {
          title: "What x402 does",
          body: "Signals that a route is paid, describes price, token, recipient, and expected payment mode, and gives the client enough information to continue automatically.",
        },
        {
          title: "What x402 does not do",
          body: "It does not force one payment method. You can satisfy the requirement with direct settlement or a reusable stream.",
        },
        {
          title: "Why agents need it",
          body: "Agents cannot survive random checkout flows. They need a standard handshake so they can parse cost, decide on a strategy, and continue without human help.",
        },
        {
          title: "Why Stream Engine fits",
          body: "Stream Engine is the settlement backend behind the x402 response. The protocol says payment is required; Stream Engine makes satisfying that payment cheap enough to use in practice.",
        },
      ],
      stepsTitle: "Request flow with x402",
      steps: [
        "Client sends a request to a paid route.",
        "Server replies with HTTP 402 and machine-readable payment terms.",
        "The runtime reads mode, price, token, recipient, and contract details.",
        "The runtime picks direct payment or streaming.",
        "The client retries with a stream id or direct payment proof.",
        "Middleware verifies that proof before returning the resource.",
      ],
      tables: [
        {
          title: "Important payment headers",
          headers: ["Header", "Meaning"],
          rows: [
            [
              "X-FlowPay-Mode",
              "Whether the route expects streaming, direct payment, or a hybrid path",
            ],
            ["X-FlowPay-Rate", "How much value is required"],
            ["X-FlowPay-Token", "Which token is accepted"],
            [
              "X-FlowPay-Recipient",
              "Which service wallet should receive value",
            ],
            [
              "X-FlowPay-Contract",
              "Which stream contract the runtime should use",
            ],
          ],
        },
        {
          title: "Live route catalog",
          headers: ["Path", "Mode", "Price"],
          rows: buildRouteRows(catalog?.routes, tokenSymbol),
        },
      ],
      faqs: [
        {
          question: "Is HTTP 402 an error here?",
          answer:
            "No. For paid routes, 402 is the correct response. It is the payment negotiation step, not a bug.",
        },
        {
          question: "Why not just use API keys?",
          answer:
            "API keys identify a client. They do not solve pricing, per-route payment terms, or onchain settlement for autonomous agents.",
        },
        {
          question: "Why do some payment headers still say FlowPay?",
          answer:
            "Those are legacy wire-format names kept for compatibility with the current runtime and SDK. Product-facing branding is Stream Engine, but the live HTTP header keys still use the older X-FlowPay-* prefix today.",
        },
      ],
    },
    {
      id: "agentic-streaming",
      icon: Bot,
      title: "Agentic Streaming",
      eyebrow: "For AI Agents",
      summary:
        "Why this system is built for autonomous software, not just for human dashboards.",
      plainEnglish:
        "A human can click buttons, approve every purchase, and tolerate messy checkout. An agent cannot. Agentic streaming means the money flow is predictable enough that software can use it safely.",
      takeaways: [
        "Agents need machine-readable pricing and machine-safe spending controls.",
        "The goal is not “AI magic”; the goal is predictable automated payment behavior.",
        "One stream reused many times is what makes the economics work for agents.",
      ],
      points: [
        {
          title: "Why agents break normal payment flows",
          body: "Agents may call a route many times per session. A one-payment-per-call model turns useful work into fee burn.",
        },
        {
          title: "How Stream Engine helps",
          body: "Once the stream is open, the agent can keep working against the same payment session instead of repeating the same checkout step.",
        },
        {
          title: "Direct vs stream decision",
          body: "Low-frequency usage can still use direct settlement. Higher-frequency usage shifts to streaming because the fixed setup cost is paid once.",
        },
        {
          title: "Safety controls",
          body: "The runtime can apply budgets, rate limits, emergency pause controls, and spend monitoring instead of letting the agent spend blindly.",
        },
      ],
      stepsTitle: "How the runtime thinks",
      steps: [
        "Estimate expected usage.",
        "Compare direct payment cost with stream setup cost.",
        "Choose the cheapest safe mode for the session.",
        "Track the active stream and reuse it while it remains valid.",
        "Stop, renew, or cancel when risk or balance thresholds are hit.",
      ],
      tables: [
        {
          title: "Why agents and humans differ",
          headers: ["Question", "Human flow", "Agent flow"],
          rows: [
            [
              "Can they tolerate manual checkout?",
              "Yes, sometimes",
              "No, not repeatedly",
            ],
            [
              "Can they use one-off approvals every minute?",
              "Maybe",
              "No, too much friction",
            ],
            ["Do they need machine-readable pricing?", "Helpful", "Required"],
            [
              "Do they need hard spending controls?",
              "Nice to have",
              "Mandatory",
            ],
          ],
        },
      ],
      faqs: [
        {
          question: "Is the AI model deciding whether to pay?",
          answer:
            "Not in a magical way. The model or heuristic is only deciding which settlement path is more economical or safer once the payment terms are already known.",
        },
      ],
    },
    {
      id: "roles",
      icon: ShieldCheck,
      title: "Who Does What",
      eyebrow: "Actors",
      summary:
        "The product makes more sense when you understand the roles separately: provider, payer, agent, owner, renter, verifier, and admin.",
      plainEnglish:
        "Every person or system in Stream Engine has a job. Confusion usually starts when people mix up the owner, renter, payer, and verifier as if they are the same party.",
      takeaways: [
        "The payer is not always the same as the owner.",
        "The renter is not the owner of the NFT.",
        "The verifier is checking truth, not taking custody of the asset.",
      ],
      points: [
        {
          title: "Provider",
          body: "Runs a paid route or a rental listing and expects payment before access is granted.",
        },
        {
          title: "Agent or payer",
          body: "Consumes the route or funds the stream. This can be a human-controlled wallet or an automated agent runtime.",
        },
        {
          title: "Owner",
          body: "Holds the RWA NFT and therefore holds the long-term asset record and future uncaptured yield rights.",
        },
        {
          title: "Renter",
          body: "Pays for temporary access to the asset. The renter does not become the owner of the NFT.",
        },
        {
          title: "Verifier or auditor",
          body: "Checks whether the public metadata, private evidence roots, attestation set, and activity history all tell the same asset story.",
        },
        {
          title: "Admin or compliance operator",
          body: "Controls compliance flags, freezes, and registry-level safety actions when required.",
        },
      ],
      tables: [
        {
          title: "Role map",
          headers: ["Role", "Main power", "Main responsibility"],
          rows: [
            [
              "Provider",
              "Sets route pricing or rental terms",
              "Serve access only after payment is satisfied",
            ],
            [
              "Agent / payer",
              "Funds direct payments or streams",
              "Stay within budget and policy",
            ],
            [
              "Owner",
              "Controls the asset NFT",
              "Manage asset metadata and future yield rights",
            ],
            ["Renter", "Receives temporary access", "Pay only for usage"],
            [
              "Verifier",
              "Reads registry and history",
              "Judge evidence, attestation coverage, and provenance",
            ],
            [
              "Admin",
              "Can freeze or approve",
              "Keep the system safe and compliant",
            ],
          ],
        },
      ],
      faqs: [
        {
          question: "Can one person play multiple roles?",
          answer:
            "Yes. In a demo, the same wallet might be owner, payer, and admin. But the model is cleaner if you still think of those powers separately.",
        },
      ],
    },
    {
      id: "rwa",
      icon: Building2,
      title: "RWA Studio",
      eyebrow: "Assets",
      summary:
        "How the rental asset side works now: minting a verified rental twin, anchoring private evidence, collecting attestations, renting, and managing yield.",
      plainEnglish:
        "RWA Studio turns a house, vehicle, or machine into a verified productive rental twin. The NFT is not pretending to be a court-ready deed transfer. It is the onchain asset twin plus the future rental-yield record, while raw deeds, tax files, and inspections stay private by default.",
      takeaways: [
        "The NFT is the verified rental twin, not the physical asset itself.",
        "Renting means paying for access, not buying ownership.",
        "Verification now depends on public metadata, private evidence roots, attestation coverage, and policy state.",
      ],
      points: [
        {
          title: "Minting",
          body: "The owner now uses a guided mint flow. They describe the asset in plain language, attach the supporting documents, and let the app generate the internal property reference, verification tag seed, and document fingerprints automatically. The backend still anchors evidence roots, verifies the owner's mint authorization, and auto-onboards a first-time issuer when the platform operator is configured, so ordinary owners do not face a separate issuer-approval step.",
        },
        {
          title: "Verification",
          body: "Buyers, renters, and auditors can verify the asset through public metadata, evidence roots, required attestation roles, freshness rules, and onchain policy state.",
        },
        {
          title: "Renting",
          body: "Renters stream payment for access. They do not take ownership of the NFT. They are paying for usage, not ownership.",
        },
        {
          title: "Yield",
          body: "Asset-linked revenue can be funded into a yield stream so the owner receives revenue according to onchain ownership rules.",
        },
        {
          title: "Why this module exists",
          body: "Most onchain RWAs today stop at tokenization. They prove that something was minted, but they do not make the asset operational or rental-aware. Stream Engine focuses on productive assets that can be verified, rented, and linked to future yield.",
        },
      ],
      stepsTitle: "The RWA Studio workflow",
      steps: [
        "Describe the asset in plain language: what it is, where it is, and what monthly yield the owner expects.",
        "Attach the supporting documents. Stream Engine fingerprints them in-browser and keeps the raw files private by default.",
        "Let the app generate the internal property reference, verification tag seed, and public metadata package automatically while the platform handles issuer onboarding in the background.",
        "Mint the rental twin and read the signed v2 verification payload that comes back from the API.",
        "If the asset type has required attestation roles, collect and record them to move from Pending Attestation to verified.",
        "Fund the asset-linked yield stream.",
        "Let renters stream payment for access while the owner keeps the NFT and revenue rights.",
      ],
      tables: [
        {
          title: "Main studio workspaces",
          headers: ["Workspace", "Purpose"],
          rows: [
            ["Minting", "Create the rental twin, public metadata, and evidence anchors"],
            ["Verify", "Check trust status, evidence coverage, and attestation coverage"],
            ["Rent Assets", "Start real-world rental sessions"],
            ["Active Rentals", "Monitor live rental streams and refunds"],
            ["My Portfolio", "Track owned yield-bearing assets"],
            ["Asset Workspace", "Inspect evidence, policies, attestations, and yield controls"],
          ],
        },
        {
          title: "What this RWA layer supports",
          headers: ["Asset type", "Why it fits Stream Engine"],
          rows: [
            [
              "Houses / apartments",
              "Can be rented and can produce recurring cash flow",
            ],
            [
              "Cars / fleets",
              "Can be rented per session and paired with smart lock or engine controls",
            ],
            ["Heavy machinery", "Can be rented per job, hour, or usage window"],
            [
              "Gold / silver / passive commodities",
              "Not supported as the core model because they do not naturally generate rental revenue",
            ],
          ],
        },
      ],
      faqs: [
        {
          question:
            "Does owning the NFT automatically mean you physically possess the asset?",
          answer:
            "No. The NFT is the verified rental twin and revenue-rights record. Physical custody, legal title records, and access controls still exist in the real world.",
        },
      ],
    },
    {
      id: "productive-assets",
      icon: Wallet,
      title: "Productive RWAs",
      eyebrow: "Revenue Assets",
      summary:
        "What “productive” means and why a revenue-producing asset matters more than a static collectible.",
      plainEnglish:
        "A productive asset is an asset that makes money while it exists. A house can earn rent. A car can earn rental fees. A machine can earn usage fees. A static collectible just sits there.",
      takeaways: [
        "Productive means cash flow, not just resale hope.",
        "A productive RWA is easier to model because there is revenue to observe.",
        "Streaming is a natural fit for productive assets because their value often accrues over time.",
      ],
      points: [
        {
          title: "Static asset",
          body: "A collectible or proof item may hold value, but it does not necessarily produce cash flow.",
        },
        {
          title: "Productive asset",
          body: "A productive asset has operating income. It can generate rent, lease income, equipment fees, or usage fees.",
        },
        {
          title: "Why investors care",
          body: "Productive assets are easier to model because there is a revenue stream to watch, not just a hope that resale price rises later.",
        },
        {
          title: "Why Stream Engine cares",
          body: "Once an asset produces ongoing cash flow, it makes sense to stream and track that cash flow instead of pretending the asset is just a JPEG with metadata.",
        },
        {
          title: "Why we do not start with gold or silver",
          body: "Gold and silver can be valuable, but they are passive holdings. Owning them does not automatically create a revenue stream. Stream Engine starts with assets that can be rented because rental flows are where streaming and coupling add real utility.",
        },
      ],
      tables: [
        {
          title: "Static vs productive assets",
          headers: ["Type", "What it mainly offers", "What Stream Engine adds"],
          rows: [
            [
              "Collectible NFT",
              "Scarcity or community value",
              "Verification and ownership history",
            ],
            [
              "Rental RWA",
              "Ownership plus recurring cash flow",
              "Rental access, verification, and yield coupling",
            ],
            [
              "Revenue-producing equipment",
              "Usage fees over time",
              "Metered revenue and transparent ownership-linked yield",
            ],
          ],
        },
      ],
      faqs: [
        {
          question: "Can every real-world asset be treated as productive?",
          answer:
            "No. Productive means it reliably throws off revenue. If there is no revenue stream, there is nothing meaningful to couple to ownership.",
        },
        {
          question: "So why not tokenize gold first and add streams later?",
          answer:
            "Because the product thesis is not just “put assets onchain.” The thesis is “make onchain assets operational and revenue-aware.” Gold does not naturally give you rent to meter, refund, or couple to ownership.",
        },
      ],
    },
    {
      id: "coupling",
      icon: Link2,
      title: "Revenue Coupling",
      eyebrow: "Ownership Logic",
      summary:
        "How revenue rights stay attached to the NFT instead of getting stranded with an old owner.",
      plainEnglish:
        "Coupling means the money belongs to whoever owns the asset NFT now, not to whoever used to own it. If ownership changes, the right to claim future revenue changes with it.",
      takeaways: [
        "Future yield should follow current ownership.",
        "Secondary sales should not leave revenue stuck with the old owner.",
        "Coupling is what makes the NFT more than a decorative wrapper around the asset.",
      ],
      points: [
        {
          title: "Why coupling matters",
          body: "Without coupling, an old owner can keep collecting revenue after selling the asset. That creates messy reconciliation and weakens trust.",
        },
        {
          title: "Why this was the core inspiration",
          body: "A lot of RWA NFTs today are still passive wrappers around non-productive assets. Stream Engine makes coupling central because productive assets are only truly useful when future revenue cleanly follows the NFT that represents the asset.",
        },
        {
          title: "How Stream Engine handles it",
          body: "The stream checks the current NFT owner when claims happen. That means claim rights follow live ownership.",
        },
        {
          title: "What renters get",
          body: "Renters only get paid access to the asset. They do not take the NFT and they do not take the long-term revenue rights.",
        },
        {
          title: "What the owner keeps",
          body: "The owner keeps the NFT, the verification record, and the right to claim future asset-linked yield.",
        },
      ],
      stepsTitle: "What happens after a secondary sale",
      steps: [
        "Alice owns the rental asset NFT and the attached yield rights.",
        "Alice sells the NFT to Bob.",
        "The next claim checks ownership again.",
        "Bob, not Alice, is now the rightful claimant for future yield.",
        "The activity trail shows the transfer so auditors can understand why the claimant changed.",
      ],
      tables: [
        {
          title: "Who gets what",
          headers: ["Role", "What they control"],
          rows: [
            [
              "Owner",
              "NFT ownership, verification record, long-term yield rights",
            ],
            ["Renter", "Temporary physical access through payment streaming"],
            [
              "Verifier",
              "Authenticity checks through registry, metadata, and activity history",
            ],
            [
              "Issuer/Admin",
              "Compliance, freeze controls, and registry management",
            ],
          ],
        },
      ],
      faqs: [
        {
          question:
            "Does the NFT transfer automatically move past revenue too?",
          answer:
            "No. Past revenue that has already been claimed stays claimed. Coupling mainly affects who is entitled to future unclaimed value.",
        },
        {
          question:
            "Why is coupling more important for houses, cars, and machines than for passive assets?",
          answer:
            "Because those assets can keep generating value while they are owned. If future revenue does not follow ownership, the asset is tokenized badly and the NFT becomes operationally misleading.",
        },
      ],
    },
    {
      id: "verification",
      icon: ScanLine,
      title: "Verification",
      eyebrow: "Trust Layer",
      summary:
        "How QR, NFC, IPFS, the private evidence vault, the attestation registry, and the status engine work together to prove whether a productive asset is ready to trust.",
      plainEnglish:
        'Verification answers a stricter question than before: "Is this productive asset record complete, current, and trusted enough to rent or underwrite?" The app now checks public metadata, private evidence roots, attestation coverage, freshness, and onchain freeze or dispute state instead of returning a shallow yes-or-no pass/fail verdict.',
      takeaways: [
        "Verification is about trust state, not only metadata consistency.",
        "A good verifier explains what is missing, stale, frozen, revoked, or disputed.",
        "QR, NFC, CID, and token id are just entry points into the same evidence-backed check.",
      ],
      points: [
        {
          title: "IPFS metadata",
          body: "Sanitized public metadata is pinned to IPFS so the asset has a public content identity without exposing raw deeds or tenant-sensitive documents.",
        },
        {
          title: "Registry anchors",
          body: "The registry stores the public metadata hash, property reference hash, evidence root, evidence manifest hash, rights model, and verification status.",
        },
        {
          title: "Evidence vault",
          body: "Raw deed, survey, valuation, inspection, insurance, and tax files stay private by default. The app anchors their roots onchain and verifies them server-side.",
        },
        {
          title: "Attestation coverage",
          body: "Lawyers, inspectors, valuers, insurers, registrars, issuers, and compliance operators can attest to specific evidence hashes. Expired or missing roles downgrade the trust state.",
        },
        {
          title: "Status engine",
          body: 'A useful verification result should say whether the asset is verified, verified with warnings, stale, frozen, revoked, disputed, incomplete, mismatched, or only legacy-verified. The result should explain why, not just output a single pass/fail flag.',
        },
        {
          title: "IoT and smart access",
          body: "Verification can be tied to physical control systems. A smart car, smart lock, or industrial controller can reference the same payment, evidence, and policy state when deciding whether access should remain active.",
        },
      ],
      stepsTitle: "Verification flow",
      steps: [
        "Read the QR or NFC payload, or accept a token id, URI, or property reference directly.",
        "Fetch sanitized public metadata from IPFS.",
        "Load the onchain asset identity, evidence root, and verification state.",
        "Check private evidence coverage and required attestation roles.",
        "Return a structured trust verdict plus the history needed for audit.",
      ],
      tables: [
        {
          title: "Accepted verification inputs",
          headers: ["Input", "Best use"],
          rows: [
            ["Full verification payload", "Fastest verifier flow with v2 status and evidence anchors"],
            ["IPFS URI or raw CID", "Public metadata-first investigations"],
            [
              "Token id + optional property reference",
              "Internal review when the asset is already known",
            ],
          ],
        },
      ],
      faqs: [
        {
          question: "Why use both IPFS and onchain hashes?",
          answer:
            "IPFS stores the sanitized public content. Onchain hashes prove that the content, property reference, and private evidence roots being discussed are the same ones that were bound to the asset.",
        },
        {
          question: "What happens with a smart rented car if the stream ends?",
          answer:
            "That is one of the strongest real-world examples for this model. A smart vehicle can watch the stream state, revoke access when the funded usage window is over, and require return or settlement before new usage continues.",
        },
      ],
    },
    {
      id: "architecture",
      icon: Database,
      title: "Architecture",
      eyebrow: "System Design",
      summary:
        "How the frontend, backend, Solidity contracts, indexer, and verification stack fit together, plus the live deployed addresses so readers can inspect the contracts themselves.",
      plainEnglish:
        "Think of the system like a small company. The frontend talks to users. The backend handles coordination, metadata pinning, and indexing. The Solidity contracts are the accountants and rule enforcers. The explorer links let anyone inspect the live deployed workers directly.",
      takeaways: [
        "Each contract should have a narrow, understandable job.",
        "The backend makes the system usable, but contracts remain the source of truth.",
        "If you do not know where a fact lives, look for which contract owns that responsibility.",
      ],
      points: [
        {
          title: "Built with Solidity",
          body: "The live stream rail and RWA contract suite are Solidity contracts deployed to the Polkadot environment. The point is not only to talk about architecture abstractly, but to let readers verify the deployed code and addresses themselves.",
        },
        {
          title: "Payment contract",
          body: `The stream contract manages sender budget, recipient claims, cancellation, and metadata for payment sessions in ${tokenSymbol}.`,
        },
        {
          title: "RWA contracts",
          body: "The RWA side is deliberately split into multiple Solidity contracts because productive assets need more than ownership. The NFT records the digital twin, the registry stores asset identity anchors, the attestation registry stores verifier claims, the asset stream contract handles revenue flow, the compliance guard controls regulated actions, and the hub ties those pieces together.",
        },
        {
          title: "How the RWA half really works",
          body: "The RWA architecture is not just 'mint NFT, done.' First the issuer signs a mint authorization and anchors public metadata plus private evidence roots. The platform operator can auto-approve a first-time issuer during that mint, so the owner does not need a separate onboarding transaction. The new twin then starts either in Verified or Pending Attestation depending on the policy for that asset type. If roles are required, they are collected and recorded next. Then rental revenue can be routed into the asset stream contract so future yield follows whoever owns the NFT. That is the difference between a productive asset system and a passive onchain collectible.",
        },
        {
          title: "Why we only care about productive assets here",
          body: "Gold, silver, and passive commodity wrappers can be tokenized, but they do not naturally produce rental cash flow. Stream Engine focuses on houses, fleets, heavy machinery, and other rent-producing assets because those assets justify streaming, refund logic, live metering, and ownership-linked yield.",
        },
        {
          title: "IoT and machine enforcement",
          body: "The RWA side also expects physical access controls. A smart car, smart lock, or industrial controller can watch the payment stream, revoke access when funding ends, and let unused budget remain with the renter when the session ends early.",
        },
        {
          title: "Middleware and APIs",
          body: "The backend exposes route catalogs, verification endpoints, metadata pinning, and asset activity views. Middleware is what turns onchain state into actual web access.",
        },
        {
          title: "Why productive RWAs need this architecture",
          body: "Most onchain RWAs today are passive wrappers around assets that do not naturally produce cash flow. Stream Engine focuses on productive assets like houses, fleets, and heavy machinery because they can be rented, measured, refunded when returned early, and paired with IoT or smart-lock controls.",
        },
        {
          title: "Trust boundary",
          body: "The UI is a client. The backend helps with indexing and metadata. The contract layer is the final source of truth for streams, ownership, and verification hashes.",
        },
      ],
      stepsTitle: "How one action moves through the system",
      steps: [
        "The frontend collects user intent: start a stream, mint an asset, verify a payload, or claim yield.",
        "The backend helps with metadata pinning, registry views, and indexed history when needed.",
        "The Solidity contracts enforce the payment, ownership, compliance, and yield rules.",
        "The indexer rebuilds the public activity trail so the UI can show understandable history.",
        "The explorer links let anyone verify the live deployment state independently of the app UI.",
      ],
      tables: [
        {
          title: "Architecture layers",
          headers: ["Layer", "Built with", "Main job"],
          rows: [
            [
              "Frontend",
              "React + Vite",
              "Wallet connection, dashboard flows, minting, renting, and verification UX",
            ],
            [
              "Backend",
              "Node.js + Express",
              "Catalog, public IPFS pinning, private evidence storage, verification API, indexed views, and middleware enforcement",
            ],
            [
              "Stream contracts",
              "Solidity",
              "Payment streaming, withdrawal, and cancellation",
            ],
            [
              "RWA contracts",
              "Solidity",
              "NFT minting, asset identity storage, attestations, compliance, and asset-linked yield",
            ],
            [
              "Indexer / provenance",
              "Backend service + chain reads",
              "Activity reconstruction for audit-friendly history",
            ],
          ],
        },
        {
          title: "Live contract map",
          headers: ["Solidity Contract", "Address", "What it does"],
          rows: buildContractRows(catalog),
        },
        {
          title: "RWA contract choreography",
          headers: ["RWA piece", "What it stores or controls", "Why the system needs it"],
          rows: [
            [
              "Stream Engine Asset NFT",
              "The digital twin and current owner",
              "Without it there is no durable ownership anchor for the productive asset",
            ],
            [
              "Stream Engine Asset Registry",
              "Rights model, property reference hash, public metadata hash, evidence roots, status, linked stream facts",
              "Without it buyers and auditors cannot prove that the asset record is complete and current",
            ],
            [
              "Stream Engine Attestation Registry",
              "Role-based attestations, expiries, and revocations",
              "Without it the verifier cannot prove that lawyers, inspectors, valuers, or insurers actually signed off on the evidence set",
            ],
            [
              "Stream Engine Asset Stream",
              "Time-based yield logic, flash-advance behavior, future revenue state",
              "Without it the asset becomes just another static NFT with no revenue engine",
            ],
            [
              "Stream Engine Compliance Guard",
              "Freeze and compliance flags",
              "Without it there is no contract-level stop switch for regulated or disputed actions",
            ],
            [
              "Stream Engine RWA Hub",
              "High-level orchestration across minting, funding, claims, and admin actions",
              "Without it the app would need to coordinate too many raw calls manually",
            ],
          ],
        },
        {
          title: "Primary contract responsibilities",
          headers: ["Contract", "Why it exists", "What breaks without it"],
          rows: [
            [
              "Stream Engine Stream",
              "Create, cancel, and settle reusable payment streams",
              "Agents fall back to repeated checkout and high-fee per-request settlement",
            ],
            [
              "Stream Engine Asset NFT",
              "Mint the productive rental asset NFT",
              "There is no durable digital twin for the real asset",
            ],
            [
              "Stream Engine Asset Registry",
              "Store asset identity, evidence roots, rights model, and verification state",
              "Verifiers cannot prove the asset record that the NFT is supposed to represent",
            ],
            [
              "Stream Engine Attestation Registry",
              "Store attestation roles, signatures, expiry, and revocation state",
              "Verifiers cannot tell whether legal, inspection, insurance, or valuation review was actually completed",
            ],
            [
              "Stream Engine Asset Stream",
              "Handle asset-linked yield and flash advance behavior",
              "Future rental revenue cannot be streamed or coupled cleanly to NFT ownership",
            ],
            [
              "Stream Engine Compliance Guard",
              "Store compliance and freeze state",
              "Admins cannot block claims or withdrawals when policy or regulation requires intervention",
            ],
            [
              "Stream Engine RWA Hub",
              "Coordinate minting, funding, claims, and admin actions",
              "Frontend and backend would need to orchestrate too many raw contract calls directly",
            ],
          ],
        },
        {
          title: "Why the RWA side is different from passive tokenization",
          headers: ["RWA model", "What ownership gives you", "Why Stream Engine prefers it"],
          rows: [
            [
              "Passive asset NFT",
              "Mainly provenance and resale exposure",
              "Useful for simple provenance, but weak for ongoing operational finance",
            ],
            [
              "Productive rental NFT",
              "Provenance plus future rental yield rights",
              "Lets revenue follow ownership and makes streaming economically meaningful",
            ],
            [
              "IoT-aware rental asset",
              "Ownership, verification, and machine-enforced access control",
              "A car, lock, or machine can react to stream state and cut access when funding ends",
            ],
          ],
        },
        {
          title: "Productive RWA lifecycle",
          headers: ["Stage", "What happens", "Which part is responsible"],
          rows: [
            [
              "Mint",
              "Issuer creates the digital twin, signs the mint request, and pins sanitized metadata",
              "RWAHub + AssetNFT + backend IPFS service",
            ],
            [
              "Bind truth",
              "Property reference hash, metadata hash, and evidence roots are recorded for future verification",
              "AssetRegistry + backend evidence vault",
            ],
            [
              "Attest",
              "Required roles review the evidence and record attestations",
              "AttestationRegistry + RWAHub",
            ],
            [
              "Rent",
              "User funds access and pays only for actual usage time",
              "Stream Engine Stream + app access controls",
            ],
            [
              "Generate yield",
              "Rental revenue is routed into asset-linked yield logic",
              "AssetStream",
            ],
            [
              "Claim",
              "Current NFT owner claims the unclaimed revenue",
              "AssetStream + AssetNFT ownership checks",
            ],
            [
              "Transfer",
              "NFT moves to a new owner and future yield follows it",
              "AssetNFT + AssetStream coupling rules",
            ],
          ],
        },
        {
          title: "Backend endpoints",
          headers: ["Endpoint", "Purpose"],
          rows: [
            [
              "GET /api/engine/catalog",
              "Returns runtime and route configuration",
            ],
            [
              "POST /api/rwa/ipfs/metadata",
              "Pins sanitized public metadata and returns CID / URI",
            ],
            [
              "POST /api/rwa/evidence",
              "Stores the private evidence bundle and returns evidence roots",
            ],
            [
              "POST /api/rwa/assets",
              "Mints a new rental twin and returns the signed v2 verification payload plus the current verification state",
            ],
            [
              "POST /api/rwa/attestations",
              "Registers or revokes evidence-backed attestations",
            ],
            ["GET /api/rwa/assets/:tokenId", "Reads asset detail"],
            [
              "GET /api/rwa/assets/:tokenId/activity",
              "Reads indexed asset activity",
            ],
            ["POST /api/rwa/verify", "Runs evidence, attestation, freshness, and policy checks"],
          ],
        },
      ],
      links: buildContractLinks(catalog),
      faqs: [
        {
          question:
            "Why does the frontend still need the backend if contracts exist?",
          answer:
            "Because verification, indexing, metadata pinning, and route catalogs are easier to expose through a service layer. The contracts remain the final source of truth for settlement and ownership state.",
        },
        {
          question:
            "Why include the contract addresses directly in the handbook?",
          answer:
            "Because readers should not have to trust screenshots or slide decks. They should be able to open the live deployed addresses themselves and verify that the system is actually implemented as Solidity contracts onchain.",
        },
        {
          question:
            "Why do the onchain deployment ids still say FlowPay?",
          answer:
            "Those are the actual deployed Solidity contract identifiers. The product is now Stream Engine, but the deployed contract names were kept so the existing chain deployment, ABI references, and tooling did not have to be broken or redeployed just for naming.",
        },
        {
          question:
            "Why not just use one NFT contract for the entire RWA story?",
          answer:
            "Because productive RWAs are not just ownership records. They need ownership, provenance, verification hashes, rental income streaming, and compliance controls. Keeping those responsibilities separate makes the system easier to audit and reason about.",
        },
      ],
    },
    {
      id: "glossary",
      icon: FileSearch,
      title: "Glossary",
      eyebrow: "Plain Words",
      summary: "Simple definitions for the terms used across the product.",
      plainEnglish:
        "This is the translation layer. If a term sounds fancy, reduce it to the simplest useful sentence and keep moving.",
      takeaways: [
        "Most confusion disappears once the terms are separated properly.",
        "The same words should mean the same thing everywhere in the product.",
        "When in doubt, reduce the concept to who pays, who owns, who can verify, and who can claim.",
      ],
      tables: [
        {
          title: "Core terms",
          headers: ["Term", "Plain meaning"],
          rows: [
            [
              "x402",
              "The HTTP 402 payment handshake that says a route is paid and explains how to pay",
            ],
            [
              "Payment stream",
              "A budget that releases value over time instead of paying everything at once",
            ],
            [
              "Agentic streaming",
              "Streaming designed so software agents can use paid services repeatedly without repeated checkout",
            ],
            [
              "RWA",
              "A real-world asset represented by an onchain digital twin",
            ],
            [
              "Productive asset",
              "An asset that generates cash flow, such as rent or usage fees",
            ],
            [
              "CID",
              "The content fingerprint for a file or metadata object on IPFS",
            ],
            [
              "Verification tag",
              "The QR or NFC-linked identifier checked against the registry",
            ],
            [
              "Yield coupling",
              "The rule that future asset-linked revenue follows current NFT ownership",
            ],
            ["Claimable balance", "How much value can be withdrawn right now"],
            [
              "Flash advance",
              "Taking some future yield early and letting time catch up later",
            ],
          ],
        },
      ],
      faqs: [
        {
          question: "What is the fastest way to understand Stream Engine?",
          answer:
            "Remember this sentence: x402 tells the client that payment is required, and Stream Engine makes that payment reusable through streams so agents and rental flows stay economical.",
        },
      ],
    },
  ];
}

function renderContent(md) {
  return md.split("\n").map((line, i) => {
    if (line.startsWith("# "))
      return (
        <h1 key={i} className="text-2xl font-bold text-white mb-4 mt-2">
          {line.slice(2)}
        </h1>
      );
    if (line.startsWith("## "))
      return (
        <h2 key={i} className="text-lg font-semibold text-white mb-3 mt-6">
          {line.slice(3)}
        </h2>
      );
    if (line.startsWith("### "))
      return (
        <h3 key={i} className="text-base font-semibold text-cyan-300 mb-2 mt-4">
          {line.slice(4)}
        </h3>
      );
    if (line.startsWith("```")) return null; // handled below
    if (line.startsWith("| ")) {
      const cells = line
        .split("|")
        .filter(Boolean)
        .map((c) => c.trim());
      const isHeader = cells.every((c) => c);
      return (
        <tr key={i}>
          {cells.map((c, j) =>
            isHeader ? (
              <td
                key={j}
                className="px-3 py-2 text-white/70 text-sm border-b border-white/5"
              >
                {c}
              </td>
            ) : (
              <td
                key={j}
                className="px-3 py-2 text-white/50 text-sm border-b border-white/5"
              >
                {c}
              </td>
            ),
          )}
        </tr>
      );
    }
    if (line.startsWith("- ") || line.startsWith("* "))
      return (
        <li key={i} className="text-white/60 text-sm ml-4 list-disc">
          {line.slice(2)}
        </li>
      );
    if (line === "") return <div key={i} className="h-2" />;
    return (
      <p key={i} className="text-white/60 text-sm leading-relaxed">
        {line}
      </p>
    );
  });
}

// Simple but readable markdown renderer
function DocContent({ content }) {
  const blocks = [];
  let codeLines = [];
  let inCode = false;
  let inTable = false;
  let tableRows = [];

  const flushTable = () => {
    if (tableRows.length) {
      blocks.push(
        <div key={blocks.length} className="overflow-x-auto my-4">
          <table className="w-full border border-white/10 rounded-lg overflow-hidden text-sm">
            <tbody>{tableRows}</tbody>
          </table>
        </div>,
      );
      tableRows = [];
      inTable = false;
    }
  };

  content.split("\n").forEach((line, i) => {
    if (line.startsWith("```")) {
      if (!inCode) {
        inCode = true;
        codeLines = [];
        return;
      }
      blocks.push(
        <pre
          key={blocks.length}
          className="bg-black/40 border border-white/10 rounded-lg p-4 overflow-x-auto my-3 text-xs text-cyan-200 font-mono leading-relaxed"
        >
          {codeLines.join("\n")}
        </pre>,
      );
      inCode = false;
      return;
    }
    if (inCode) {
      codeLines.push(line);
      return;
    }

    if (line.startsWith("| ")) {
      inTable = true;
      const cells = line
        .split("|")
        .filter((c) => c.trim() && !c.trim().match(/^[-:]+$/));
      if (cells.length) {
        tableRows.push(
          <tr
            key={tableRows.length}
            className="border-b border-white/5 last:border-0"
          >
            {cells.map((c, j) => (
              <td
                key={j}
                className={`px-3 py-2 text-sm ${
                  j === 0 ? "text-white/80 font-medium" : "text-white/50"
                }`}
              >
                {c.trim().replace(/`([^`]+)`/g, (_, m) => m)}
              </td>
            ))}
          </tr>,
        );
      }
      return;
    }
    if (inTable) flushTable();

    if (line.startsWith("# ")) {
      blocks.push(
        <h1
          key={blocks.length}
          className="text-2xl font-bold text-white mb-3 mt-2"
        >
          {line.slice(2)}
        </h1>,
      );
      return;
    }
    if (line.startsWith("## ")) {
      blocks.push(
        <h2
          key={blocks.length}
          className="text-lg font-semibold text-white mb-2 mt-6 pb-2 border-b border-white/10"
        >
          {line.slice(3)}
        </h2>,
      );
      return;
    }
    if (line.startsWith("### ")) {
      blocks.push(
        <h3
          key={blocks.length}
          className="text-sm font-semibold text-cyan-300 mb-2 mt-4"
        >
          {line.slice(4)}
        </h3>,
      );
      return;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      blocks.push(
        <li
          key={blocks.length}
          className="text-white/60 text-sm ml-5 list-disc leading-relaxed"
        >
          {line.slice(2)}
        </li>,
      );
      return;
    }
    if (line === "") {
      blocks.push(<div key={blocks.length} className="h-2" />);
      return;
    }
    // inline code
    const parts = line.split(/`([^`]+)`/);
    blocks.push(
      <p key={blocks.length} className="text-white/60 text-sm leading-relaxed">
        {parts.map((p, j) =>
          j % 2 === 1 ? (
            <code
              key={j}
              className="bg-white/10 text-cyan-300 px-1 py-0.5 rounded text-xs font-mono"
            >
              {p}
            </code>
          ) : (
            p
          ),
        )}
      </p>,
    );
  });
  if (inTable) flushTable();
  return <div className="space-y-1">{blocks}</div>;
}

function StatusBanner({ isLoading, error }) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
        Loading the live runtime catalog. The handbook can still render from built-in defaults while data arrives.
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
        The backend catalog is offline, so this handbook is using local fallback values. Start the backend with <code className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-xs">npm run start:all</code> if you want live route and contract config.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
      Live runtime data loaded. Route, token, and contract sections are reading from the current catalog.
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-white/35">
        {label}
      </div>
      <div className="mt-2 break-words text-lg font-semibold text-white">
        {value}
      </div>
    </div>
  );
}

function PlainLanguageCard({ text }) {
  if (!text) {
    return null;
  }

  return (
    <div className="rounded-[28px] border border-cyan-400/15 bg-cyan-400/[0.08] p-6">
      <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">
        Plain English
      </div>
      <p className="mt-3 text-base leading-8 text-cyan-50/90">{text}</p>
    </div>
  );
}

function TakeawayPanel({ items = [] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
      <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">
        If You Remember Three Things
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <div
            key={item}
            className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-white/65"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightGrid({ items = [] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.title}
          className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6"
        >
          <div className="text-sm font-semibold text-white">{item.title}</div>
          <p className="mt-3 text-sm leading-7 text-white/60">{item.body}</p>
        </div>
      ))}
    </div>
  );
}

function CodeCard({ code }) {
  if (!code) {
    return null;
  }

  return (
    <div className="rounded-[28px] border border-white/10 bg-black/25 p-6">
      <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">
        Core Logic
      </div>
      <pre className="mt-4 overflow-x-auto rounded-2xl bg-black/30 p-4 text-sm leading-7 text-cyan-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function StepList({ title, steps = [] }) {
  if (!steps.length) {
    return null;
  }

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
      <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">
        {title}
      </div>
      <div className="mt-4 space-y-3">
        {steps.map((step, index) => (
          <div
            key={`${index + 1}-${step}`}
            className="flex items-start gap-4 rounded-2xl border border-white/10 bg-black/20 p-4"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-400/15 text-sm font-semibold text-cyan-100">
              {index + 1}
            </div>
            <div className="pt-0.5 text-sm leading-7 text-white/65">{step}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataTable({ title, headers = [], rows = [] }) {
  if (!rows.length) {
    return null;
  }

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
      <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">
        {title}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className="border-b border-white/10 px-4 py-3 text-left text-[11px] uppercase tracking-[0.2em] text-white/40"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${title}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${title}-${index}-${cellIndex}`}
                    className="border-b border-white/6 px-4 py-4 align-top text-sm leading-7 text-white/65"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExplorerLinks({ items = [] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
      <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">
        Explorer Links
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <a
            key={`${item.label}-${item.value}`}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-white/10 bg-black/20 p-4 transition-colors hover:border-cyan-400/30 hover:bg-cyan-400/[0.06]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">{item.label}</div>
                <div className="mt-2 break-all font-mono text-xs text-cyan-200">
                  {item.value}
                </div>
              </div>
              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-white/45" />
            </div>
            <div className="mt-3 text-xs text-white/45">{item.note}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function FaqList({ items = [] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <details
          key={item.question}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
        >
          <summary className="cursor-pointer list-none text-sm font-semibold text-white">
            {item.question}
          </summary>
          <p className="mt-3 text-sm leading-7 text-white/60">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

function ArchitectureDiagram({ catalog }) {
  const tokenSymbol = catalog?.payments?.tokenSymbol || "USDC";
  const paymentAssetId = catalog?.payments?.paymentAssetId || 31337;
  const paymentRecipient =
    catalog?.payments?.recipientAddress || "Not configured";
  const paymentTokenAddress =
    catalog?.payments?.paymentTokenAddress
    || "0x00007a6900000000000000000000000001200000";
  const contracts = getDeployedContractDescriptors(catalog);
  const paymentContracts = contracts.filter((contract) => contract.group === "Payment Rail");
  const rwaContracts = contracts.filter((contract) => contract.group === "RWA Rail");

  return (
    <div className="space-y-4">
      <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">
        Full Project Architecture
      </div>
      <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 md:p-6">
        <div className="space-y-6">
          <div>
            <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-white/35">
              1. People, agents, and devices
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                {
                  title: "AI agents + API clients",
                  body: "Hit x402-protected routes, open streams, and reuse them for repeated paid requests.",
                },
                {
                  title: "Owners, renters, auditors",
                  body: "Mint productive assets, rent them, verify them, and claim coupled revenue when they own the NFT.",
                },
                {
                  title: "IoT and smart access",
                  body: "Cars, locks, and machinery can react to stream state so access ends when funding ends and unused budget remains refundable.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="text-sm font-semibold text-white">
                    {item.title}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/55">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-200">
              Requests, rentals, and verification flow into the app layer
            </div>
          </div>

          <div>
            <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-white/35">
              2. App and coordination layer
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              {[
                {
                  title: "Frontend",
                  body: "Handles wallet connection, stream creation, RWA Studio, verification UX, and the docs handbook.",
                },
                {
                  title: "Backend + x402 middleware",
                  body: "Serves route catalog, enforces paywalls, pins sanitized IPFS metadata, stores private evidence bundles, exposes verification endpoints, and turns onchain state into web access.",
                },
                {
                  title: "Indexer + provenance service",
                  body: "Reads chain history so the app can show mint, transfer, freeze, claim, and verification activity in plain language.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="text-sm font-semibold text-white">
                    {item.title}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/55">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-200">
              App calls split into the payment rail and the productive RWA rail
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
            <div className="rounded-[26px] border border-white/10 bg-black/20 p-5">
              <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">
                3. Payment Rail
              </div>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-sm font-semibold text-white">
                    Service recipient wallet
                  </div>
                  <div className="mt-2 break-all font-mono text-xs text-cyan-200">
                    {paymentRecipient}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/55">
                    Final receiver for API settlement and paid-route revenue.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-sm font-semibold text-white">
                    Circle {tokenSymbol} asset precompile
                  </div>
                  <div className="mt-2 break-all font-mono text-xs text-cyan-200">
                    {paymentTokenAddress}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/55">
                    Native payment asset {paymentAssetId} used for approvals, direct settlement, rental funding, and yield operations.
                  </p>
                </div>
                {paymentContracts.map((contract) => (
                  <div
                    key={contract.name}
                    className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.06] p-4"
                  >
                    <div className="text-sm font-semibold text-white">
                      {contract.name}
                    </div>
                    <div className="mt-2 break-all font-mono text-xs text-cyan-200">
                      {contract.address}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-white/55">
                      {contract.role}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-black/20 p-5">
              <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">
                4. Productive RWA Rail
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {rwaContracts.map((contract) => (
                  <div
                    key={contract.name}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="text-sm font-semibold text-white">
                      {contract.name}
                    </div>
                    <div className="mt-2 break-all font-mono text-xs text-cyan-200">
                      {contract.address}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-white/55">
                      {contract.role}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.06] p-4 text-sm leading-7 text-white/65">
                This is the part many RWA projects skip. Stream Engine does not stop at proving that a house, fleet, or machine exists. It also tracks who owns the digital twin, what metadata and verification facts are bound to it, how rental revenue is generated, and why future yield must follow whoever owns the NFT now.
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-200">
              Onchain truth connects back to physical assets and public verification
            </div>
          </div>

          <div>
            <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-white/35">
              5. External truth, physical control, and public proof
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              {[
                {
                  title: "IPFS metadata",
                  body: "Stores sanitized public metadata and media by CID so the verifier can compare content with registry hashes.",
                },
                {
                  title: "Private evidence vault",
                  body: "Keeps raw deeds, inspections, tax records, and insurance files private while exposing only evidence roots and summaries to the verifier.",
                },
                {
                  title: "QR / NFC + attestations",
                  body: "Bind the physical asset tag to the digital twin and give auditors a fast path into evidence-backed verification and role attestations.",
                },
                {
                  title: "Physical asset + IoT",
                  body: "Cars, locks, and machines can use stream status to grant or revoke access and stop usage when payment ends.",
                },
                {
                  title: "Explorer / public chain history",
                  body: "Lets anyone inspect every deployed Solidity contract address and verify the architecture independently.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="text-sm font-semibold text-white">
                    {item.title}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/55">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeployedContractCards({ catalog }) {
  const explorerBase = String(
    ACTIVE_NETWORK.explorerUrl || "https://westmint.subscan.io",
  ).replace(/\/$/, "");
  const contracts = getDeployedContractDescriptors(catalog);

  return (
    <div className="space-y-4">
      <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">
        Live Deployed Solidity Contracts
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {contracts.map((contract) => (
          <div
            key={contract.name}
            className="rounded-[26px] border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">
                  {contract.name}
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-cyan-300">
                  {contract.group} · Solidity contract
                </div>
                <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-white/35">
                  Onchain deployment id: {contract.onchainName}
                </div>
              </div>
              <a
                href={`${explorerBase}/account/${contract.address}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs text-white/55 transition-colors hover:text-white"
              >
                Explorer
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="mt-4 rounded-2xl bg-black/25 p-3 font-mono text-xs text-cyan-200 break-all">
              {contract.address}
            </div>

            <p className="mt-4 text-sm leading-6 text-white/60">
              {contract.role}
            </p>
            <p className="mt-3 text-sm leading-6 text-white/45">
              {contract.note}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionButton({ section, isActive, onClick }) {
  const Icon = section.icon || BookOpen;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-2xl border px-4 py-3 text-left transition-all",
        isActive
          ? "border-cyan-400/40 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]"
          : "border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
            isActive
              ? "border-cyan-400/30 bg-cyan-400/15 text-cyan-200"
              : "border-white/10 bg-black/20 text-white/55",
          ].join(" ")}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">{section.title}</div>
          <div className="mt-1 text-xs leading-5 text-white/45">
            {section.summary}
          </div>
        </div>
      </div>
    </button>
  );
}


export default function Docs() {
  const { catalog, isLoading, error } = useProtocolCatalog();
  const { section } = useParams();
  const navigate = useNavigate();
  const sections = useMemo(() => buildSections(catalog), [catalog]);
  const resolvedSection = section === "contracts" ? "architecture" : section;
  const activeSection =
    sections.find((entry) => entry.id === resolvedSection) || sections[0];
  const routeCount = catalog?.routes?.length || 3;
  const configuredContractCount = buildContractRows(catalog).filter(
    ([, value]) => value && value !== "Not configured",
  ).length;

  return (
    <div className="min-h-screen bg-surface-950 text-white">
      <div className="sticky top-0 z-50 border-b border-surface-700 bg-surface-900/90 px-4 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4">
          <Link
            to="/app"
            className="flex items-center gap-1.5 text-sm text-white/50 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            App
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-semibold text-white">
              Stream Engine Handbook
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl gap-8 px-4 py-8">
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-20 space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-cyan-300">
                Docs Map
              </div>
              <div className="mt-2 text-xl font-semibold text-white">
                Understand every moving part
              </div>
              <p className="mt-3 text-sm leading-7 text-white/55">
                This page explains the full product model in plain language:
                payment negotiation, stream settlement, agent flows, RWAs,
                verification, and contracts.
              </p>
            </div>
            <div className="space-y-2">
              {sections.map((entry) => (
                <SectionButton
                  key={entry.id}
                  section={entry}
                  isActive={activeSection.id === entry.id}
                  onClick={() => navigate(`/app/docs/${entry.id}`)}
                />
              ))}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="space-y-6">
            {isLoading && <div className="text-xs text-white/40 px-1">Loading...</div>}
            {error && <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">{error}</div>}

            <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 md:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">
                    {activeSection.eyebrow}
                  </div>
                  <h1 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">
                    {activeSection.title}
                  </h1>
                  <p className="mt-4 max-w-2xl text-sm leading-8 text-white/60 md:text-base">
                    {activeSection.summary}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">
                    Current section
                  </div>
                  <div className="mt-2 text-sm font-medium text-white">
                    {activeSection.title}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <StatCard
                  label="Network"
                  value={catalog?.network?.name || "Westend Asset Hub"}
                />
                <StatCard
                  label="Payment Token"
                  value={`Circle ${catalog?.payments?.tokenSymbol || "USDC"}`}
                />
                <StatCard
                  label="Asset Id"
                  value={String(catalog?.payments?.paymentAssetId || 31337)}
                />
                <StatCard label="Paid Routes" value={String(routeCount)} />
                <StatCard
                  label="Contracts Wired"
                  value={String(configuredContractCount)}
                />
              </div>
            </div>

            <div className="lg:hidden">
              <select
                value={activeSection.id}
                onChange={(event) =>
                  navigate(`/app/docs/${event.target.value}`)
                }
                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none"
              >
                {sections.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.title}
                  </option>
                ))}
              </select>
            </div>

            <PlainLanguageCard text={activeSection.plainEnglish} />

            <TakeawayPanel items={activeSection.takeaways} />

            <InsightGrid items={activeSection.points} />

            {activeSection.id === "architecture" ? (
              <ArchitectureDiagram catalog={catalog} />
            ) : null}

            {activeSection.code ? <CodeCard code={activeSection.code} /> : null}

            {activeSection.steps?.length ? (
              <StepList
                title={activeSection.stepsTitle || "How it works"}
                steps={activeSection.steps}
              />
            ) : null}

            {activeSection.tables?.map((table) => (
              <DataTable
                key={table.title}
                title={table.title}
                headers={table.headers}
                rows={table.rows}
              />
            ))}

            {activeSection.id === "architecture" ? (
              <DeployedContractCards catalog={catalog} />
            ) : null}

            <ExplorerLinks items={activeSection.links} />

            {activeSection.faqs?.length ? (
              <div className="space-y-4">
                <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">
                  Common Questions
                </div>
                <FaqList items={activeSection.faqs} />
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
