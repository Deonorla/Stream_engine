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
  return [
    ["Stream contract", catalog?.payments?.contractAddress || "Not configured"],
    ["RWA Hub", catalog?.rwa?.hubAddress || "Not configured"],
    ["Asset NFT", catalog?.rwa?.assetNFTAddress || "Not configured"],
    ["Asset Registry", catalog?.rwa?.assetRegistryAddress || "Not configured"],
    ["Asset Stream", catalog?.rwa?.assetStreamAddress || "Not configured"],
    [
      "Compliance Guard",
      catalog?.rwa?.complianceGuardAddress || "Not configured",
    ],
  ];
}

function buildContractLinks(catalog) {
  const explorerBase = String(
    ACTIVE_NETWORK.explorerUrl || "https://westmint.subscan.io",
  ).replace(/\/$/, "");
  const contracts = [
    ["Stream contract", catalog?.payments?.contractAddress],
    ["RWA Hub", catalog?.rwa?.hubAddress],
    ["Asset NFT", catalog?.rwa?.assetNFTAddress],
    ["Asset Registry", catalog?.rwa?.assetRegistryAddress],
    ["Asset Stream", catalog?.rwa?.assetStreamAddress],
    ["Compliance Guard", catalog?.rwa?.complianceGuardAddress],
  ];

  return contracts
    .filter(([, address]) => Boolean(address))
    .map(([label, address]) => ({
      label,
      value: address,
      href: `${explorerBase}/account/${address}`,
      note: "View on explorer",
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
          body: "Uses QR, NFC, CID, and activity history to decide whether the asset story is consistent.",
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
              "Judge authenticity and provenance",
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
        "How the rental asset side works: minting, verification, renting, and yield management.",
      plainEnglish:
        "RWA Studio turns a real asset into a digital twin that can be verified, rented, and linked to revenue. The NFT represents the digital ownership record. The real-world usage still happens off-chain.",
      takeaways: [
        "The NFT is the digital twin, not the physical asset itself.",
        "Renting means paying for access, not buying ownership.",
        "Verification and metadata matter because RWAs are trust-heavy by nature.",
      ],
      points: [
        {
          title: "Minting",
          body: "The issuer creates the asset NFT, pins metadata to IPFS, and binds a verification payload to the registry.",
        },
        {
          title: "Verification",
          body: "Buyers, renters, and auditors can check QR, NFC, CID, and onchain registry data to confirm the asset is what it claims to be.",
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
          body: "Most onchain RWAs today stop at tokenization. They prove ownership, but they do not make the asset more operational. Stream Engine focuses on assets that can actually be put to work and rented in the real world.",
        },
      ],
      stepsTitle: "The RWA Studio workflow",
      steps: [
        "Mint the digital twin for the physical asset.",
        "Pin standard metadata to IPFS and record the CID hash onchain.",
        "Bind a verification tag for QR or NFC checks.",
        "Fund the asset-linked yield stream.",
        "Let renters stream payment for access while the owner keeps the NFT and revenue rights.",
      ],
      tables: [
        {
          title: "Main studio workspaces",
          headers: ["Workspace", "Purpose"],
          rows: [
            ["Minting", "Create the asset NFT and metadata"],
            ["Verify", "Check authenticity and provenance"],
            ["Rent Assets", "Start real-world rental sessions"],
            ["Active Rentals", "Monitor live rental streams and refunds"],
            ["My Portfolio", "Track owned yield-bearing assets"],
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
            "No. The NFT is the digital ownership and revenue record. Physical custody and access controls still exist in the real world.",
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
        "How QR, NFC, IPFS, and the registry work together to prove authenticity and history.",
      plainEnglish:
        'Verification answers a very simple question: "Is this asset real, and is its story consistent everywhere?" The QR or NFC points to metadata, the registry stores hashes, and the activity log shows the history.',
      takeaways: [
        "Verification is about consistency across metadata, registry facts, and activity history.",
        "A good verifier does not only say valid or invalid; it explains why.",
        "QR, NFC, CID, and token id are just different doors into the same truth-checking process.",
      ],
      points: [
        {
          title: "IPFS metadata",
          body: "The metadata JSON is pinned to IPFS. That gives the asset a content-based identity through its CID.",
        },
        {
          title: "Registry hashes",
          body: "The contract stores hashes of the CID and verification tag so the app can compare the live metadata and tag against onchain truth.",
        },
        {
          title: "QR and NFC payloads",
          body: "The same asset can be checked through a QR code, an NFC tag, a raw CID, or a token id plus tag seed.",
        },
        {
          title: "Activity trail",
          body: 'A useful verification result should not only say "valid" or "invalid". It should also explain the provenance trail: mint, stream setup, transfers, freezes, and updates.',
        },
        {
          title: "IoT and smart access",
          body: "Verification can be tied to physical control systems. A smart car, smart lock, or industrial controller can reference the same payment and provenance state when deciding whether access should remain active.",
        },
      ],
      stepsTitle: "Verification flow",
      steps: [
        "Read the QR or NFC payload, or accept a CID/token id directly.",
        "Fetch metadata from IPFS.",
        "Compare the CID hash and tag hash against the onchain registry.",
        "Read indexed activity to understand provenance.",
        "Return an authenticity verdict plus the history needed for audit.",
      ],
      tables: [
        {
          title: "Accepted verification inputs",
          headers: ["Input", "Best use"],
          rows: [
            ["Full verification payload", "Fastest buyer or auditor check"],
            ["IPFS URI or raw CID", "Metadata-first investigations"],
            [
              "Token id + optional tag seed",
              "Internal review when the token is already known",
            ],
          ],
        },
      ],
      faqs: [
        {
          question: "Why use both IPFS and onchain hashes?",
          answer:
            "IPFS stores the content. Onchain hashes let the app prove that the content being shown is the same content that was bound to the asset.",
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
          body: "The NFT contract represents the digital twin, the registry stores provenance facts, the asset stream contract handles yield, and the hub orchestrates user-facing actions.",
        },
        {
          title: "Middleware and APIs",
          body: "The backend exposes route catalogs, verification endpoints, metadata pinning, and asset activity views. Middleware is what turns onchain state into actual web access.",
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
              "Catalog, IPFS pinning, verification API, indexed views, and middleware enforcement",
            ],
            [
              "Stream contracts",
              "Solidity",
              "Payment streaming, withdrawal, and cancellation",
            ],
            [
              "RWA contracts",
              "Solidity",
              "NFT minting, registry storage, compliance, and asset-linked yield",
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
          headers: ["Contract", "Address"],
          rows: buildContractRows(catalog),
        },
        {
          title: "Primary contract responsibilities",
          headers: ["Contract", "Job"],
          rows: [
            ["FlowPayStream", "Create, cancel, and settle payment streams"],
            ["FlowPayAssetNFT", "Mint the rental asset NFT"],
            [
              "FlowPayAssetRegistry",
              "Store CID hash, tag hash, issuer, and active stream mapping",
            ],
            [
              "FlowPayAssetStream",
              "Handle asset-linked yield and flash advance behavior",
            ],
            ["FlowPayComplianceGuard", "Store compliance and freeze state"],
            [
              "FlowPayRWAHub",
              "Coordinate minting, funding, claims, and admin actions",
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
              "Pins metadata and returns CID / URI",
            ],
            [
              "POST /api/rwa/assets",
              "Mints a new asset and verification payload",
            ],
            ["GET /api/rwa/assets/:tokenId", "Reads asset detail"],
            [
              "GET /api/rwa/assets/:tokenId/activity",
              "Reads indexed asset activity",
            ],
            ["POST /api/rwa/verify", "Runs authenticity checks"],
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
            <StatusBanner isLoading={isLoading} error={error} />

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
