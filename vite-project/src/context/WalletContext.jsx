import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { ethers } from "ethers";
import {
  getNetworkDetails as getFreighterNetworkDetails,
  signMessage as signFreighterMessage,
} from "@stellar/freighter-api";
import { StrKey } from "@stellar/stellar-sdk";
import {
  paymentTokenDecimals,
  paymentTokenSymbol,
} from "../contactInfo.js";
import { useToast } from "../components/ui";
import { ACTIVE_NETWORK } from "../networkConfig.js";
import { getAvailableWallets, resolveWalletSelection } from "../lib/wallets.js";
import {
  claimPaymentSession,
  openPaymentSession,
  cancelPaymentSession,
  fetchPaymentSessions,
  fetchPaymentSession,
} from "../services/rwaApi.js";

const WalletContext = createContext(null);
const STORED_WALLET_KEY = "se_wallet";

function formatAddress(address) {
  if (!address) {
    return "Unavailable";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function parseSessionMetadata(metadata) {
  if (!metadata) {
    return {};
  }

  if (typeof metadata === "object") {
    return metadata;
  }

  try {
    return JSON.parse(String(metadata));
  } catch {
    return {};
  }
}

function computeSessionClaimable(session) {
  const totalAmount = BigInt(String(session?.totalAmount || 0));
  const durationSeconds = Math.max(
    1,
    Number(
      session?.durationSeconds
      || (Number(session?.stopTime || 0) - Number(session?.startTime || 0))
      || 1,
    ),
  );
  const now = Math.floor(Date.now() / 1000);
  const elapsed = Math.max(
    0,
    Math.min(Number(session?.stopTime || now), now) - Number(session?.startTime || now),
  );
  const streamed = (totalAmount * BigInt(elapsed)) / BigInt(durationSeconds);
  const withdrawn = BigInt(String(session?.amountWithdrawn || 0));
  return streamed > withdrawn ? streamed - withdrawn : 0n;
}

function mapSessionToStreamCard(session) {
  return {
    id: Number(session.id),
    sender: session.sender,
    recipient: session.recipient,
    totalAmount: BigInt(String(session.totalAmount || 0)),
    flowRate: BigInt(String(session.flowRate || 0)),
    startTime: Number(session.startTime || 0),
    stopTime: Number(session.stopTime || 0),
    amountWithdrawn: BigInt(String(session.amountWithdrawn || 0)),
    isActive: Boolean(session.isActive),
    isFrozen: Boolean(session.isFrozen),
    metadata: typeof session.metadata === "string"
      ? session.metadata
      : JSON.stringify(session.metadata || {}),
    parsedMetadata: parseSessionMetadata(session.metadata),
    claimableInitial: BigInt(String(session.claimableInitial || computeSessionClaimable(session))),
    refundableAmount: BigInt(String(session.refundableAmount || 0)),
    sessionKind: "stellar",
  };
}

function createFreighterSigner(address) {
  return {
    kind: "stellar",
    async getAddress() {
      return address;
    },
    async signMessage(message) {
      const response = await signFreighterMessage(message, {
        address,
        networkPassphrase: ACTIVE_NETWORK.passphrase,
      });
      if (response?.error) {
        throw new Error(response.error.message || "Freighter could not sign the message.");
      }
      if (!response?.signedMessage) {
        throw new Error("Freighter returned an empty signature.");
      }
      if (typeof response.signedMessage === "string") {
        return response.signedMessage;
      }

      const bytes = Array.from(new Uint8Array(response.signedMessage));
      const binary = bytes.map((value) => String.fromCharCode(value)).join("");
      return window.btoa(binary);
    },
  };
}

async function fetchStellarPaymentBalance(address) {
  if (!address || !ACTIVE_NETWORK.horizonUrl) {
    return "0.0";
  }

  if (!ACTIVE_NETWORK.paymentAssetCode || !ACTIVE_NETWORK.paymentAssetIssuer) {
    return "0.0";
  }

  const response = await fetch(
    `${String(ACTIVE_NETWORK.horizonUrl).replace(/\/$/, "")}/accounts/${encodeURIComponent(address)}`,
  );
  if (!response.ok) {
    throw new Error(`Unable to load Stellar account ${address}`);
  }

  const account = await response.json();
  const balanceEntry = Array.isArray(account?.balances)
    ? account.balances.find(
        (entry) =>
          entry?.asset_code === ACTIVE_NETWORK.paymentAssetCode
          && entry?.asset_issuer === ACTIVE_NETWORK.paymentAssetIssuer,
      )
    : null;

  return balanceEntry?.balance || "0.0";
}

function normalizeSessionSort(sessions = []) {
  return [...sessions].sort((left, right) => Number(right.startTime || 0) - Number(left.startTime || 0));
}

export function WalletProvider({ children }) {
  const toast = useToast();
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [chainId, setChainId] = useState(ACTIVE_NETWORK.chainId || 0);
  const [status, setStatus] = useState(`Connect Freighter to use ${ACTIVE_NETWORK.name}.`);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [paymentBalance, setPaymentBalance] = useState("0.0");
  const [incomingStreams, setIncomingStreams] = useState([]);
  const [outgoingStreams, setOutgoingStreams] = useState([]);
  const [isLoadingStreams, setIsLoadingStreams] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [availableWallets, setAvailableWallets] = useState([]);
  const [activeWallet, setActiveWallet] = useState(null);
  const [isWalletPickerOpen, setIsWalletPickerOpen] = useState(false);
  const autoConnectAttempted = useRef(false);

  const contractWithProvider = useMemo(
    () => (provider ? { kind: "stellar-session-meter", address: ACTIVE_NETWORK.contractAddress } : null),
    [provider],
  );
  const contractWithSigner = useMemo(
    () => (signer ? { kind: "stellar-session-meter", address: ACTIVE_NETWORK.contractAddress, signer } : null),
    [signer],
  );

  const getNetworkName = useCallback(() => ACTIVE_NETWORK.name, []);

  const refreshAvailableWallets = useCallback(async () => {
    const wallets = await getAvailableWallets();
    setAvailableWallets(wallets);
    return wallets;
  }, []);

  const openWalletPicker = useCallback(async () => {
    await refreshAvailableWallets();
    setIsWalletPickerOpen(true);
  }, [refreshAvailableWallets]);

  const closeWalletPicker = useCallback(() => {
    setIsWalletPickerOpen(false);
  }, []);

  const fetchPaymentBalance = useCallback(async () => {
    if (!walletAddress) {
      setPaymentBalance("0.0");
      return "0.0";
    }

    try {
      const balance = await fetchStellarPaymentBalance(walletAddress);
      setPaymentBalance(balance);
      return balance;
    } catch (error) {
      console.error("Failed to load Stellar payment balance", error);
      setPaymentBalance("0.0");
      return "0.0";
    }
  }, [walletAddress]);

  const refreshStreams = useCallback(async () => {
    if (!walletAddress) {
      setIncomingStreams([]);
      setOutgoingStreams([]);
      setIsLoadingStreams(false);
      setIsInitialLoad(false);
      return;
    }

    setIsLoadingStreams(true);
    try {
      const sessions = await fetchPaymentSessions(walletAddress);
      const cards = normalizeSessionSort(sessions.map(mapSessionToStreamCard));
      const normalizedWallet = String(walletAddress).trim().toUpperCase();
      setOutgoingStreams(
        cards.filter((session) => String(session.sender || "").trim().toUpperCase() === normalizedWallet),
      );
      setIncomingStreams(
        cards.filter((session) => String(session.recipient || "").trim().toUpperCase() === normalizedWallet),
      );
    } catch (error) {
      console.error("Failed to refresh payment sessions", error);
      setIncomingStreams([]);
      setOutgoingStreams([]);
    } finally {
      setIsLoadingStreams(false);
      setIsInitialLoad(false);
    }
  }, [walletAddress]);

  const disconnectWallet = useCallback(async ({ silent = false } = {}) => {
    setProvider(null);
    setSigner(null);
    setWalletAddress("");
    setActiveWallet(null);
    setPaymentBalance("0.0");
    setIncomingStreams([]);
    setOutgoingStreams([]);
    setChainId(ACTIVE_NETWORK.chainId || 0);
    setStatus(`Connect Freighter to use ${ACTIVE_NETWORK.name}.`);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORED_WALLET_KEY);
    }

    if (!silent) {
      toast.info("Disconnected Freighter.", { title: "Wallet disconnected" });
    }
  }, [toast]);

  const connectWallet = useCallback(async (selection) => {
    setIsConnectingWallet(true);
    try {
      const wallets = availableWallets.length ? availableWallets : await refreshAvailableWallets();
      const wallet = await resolveWalletSelection(selection, wallets);
      if (!wallet?.provider) {
        throw new Error("Freighter is not available. Install it or unlock the extension first.");
      }

      const address = await wallet.provider.connect();
      if (!StrKey.isValidEd25519PublicKey(String(address || ""))) {
        throw new Error("Freighter did not return a valid Stellar account.");
      }

      const network = await getFreighterNetworkDetails();
      const networkPassphrase = network?.networkPassphrase || ACTIVE_NETWORK.passphrase;
      if (networkPassphrase !== ACTIVE_NETWORK.passphrase) {
        throw new Error(`Switch Freighter to ${ACTIVE_NETWORK.name} before continuing.`);
      }

      const nextSigner = createFreighterSigner(address);
      setProvider({
        kind: "stellar",
        walletId: wallet.id,
        networkPassphrase,
      });
      setSigner(nextSigner);
      setWalletAddress(address);
      setActiveWallet(wallet);
      setChainId(ACTIVE_NETWORK.chainId || 0);
      setStatus(`Connected via ${wallet.name}`);
      setIsWalletPickerOpen(false);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORED_WALLET_KEY, wallet.id);
      }

      toast.success(`Connected ${formatAddress(address)}`, { title: wallet.name });
      return address;
    } catch (error) {
      console.error("Failed to connect Stellar wallet", error);
      setStatus(error.message || "Unable to connect Freighter.");
      toast.error(error.message || "Unable to connect Freighter.", {
        title: "Wallet connection failed",
      });
      throw error;
    } finally {
      setIsConnectingWallet(false);
    }
  }, [availableWallets, refreshAvailableWallets, toast]);

  const requestTestFunds = useCallback(async () => {
    if (!walletAddress) {
      toast.warning("Connect Freighter before requesting test funds.", {
        title: "Wallet required",
      });
      return;
    }

    const friendbotUrl = `https://friendbot.stellar.org/?addr=${encodeURIComponent(walletAddress)}`;
    window.open(friendbotUrl, "_blank", "noopener,noreferrer");
    toast.info("Opened Stellar Friendbot in a new tab.", { title: "Test funds" });
  }, [toast, walletAddress]);

  const withdraw = useCallback(async (streamId) => {
    setIsProcessing(true);
    try {
      await claimPaymentSession(streamId, { claimer: walletAddress || "" });
      await Promise.all([refreshStreams(), fetchPaymentBalance()]);
      setStatus("Session balance claimed.");
      toast.success(`Claimed from Session #${streamId}`, {
        title: "Session Claim Complete",
      });
    } catch (error) {
      console.error("Session claim failed", error);
      setStatus("Session claim failed.");
      toast.error(error.message || "Session claim failed", {
        title: "Session Claim Failed",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [fetchPaymentBalance, refreshStreams, toast, walletAddress]);

  const cancel = useCallback(async (streamId) => {
    setIsProcessing(true);
    try {
      await cancelPaymentSession(streamId, { cancelledBy: walletAddress || "" });
      await Promise.all([refreshStreams(), fetchPaymentBalance()]);
      setStatus("Session ended.");
      toast.info(`Session #${streamId} ended.`, {
        title: "Session Ended",
      });
    } catch (error) {
      console.error("Session end failed", error);
      setStatus("Session end failed.");
      toast.error(error.message || "Session end failed", {
        title: "Session End Failed",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [fetchPaymentBalance, refreshStreams, toast, walletAddress]);

  const createStream = useCallback(async (recipient, durationSeconds, amountValue, metadata = {}) => {
    if (!walletAddress) {
      toast.warning("Connect Freighter before opening a payment session.", {
        title: "Wallet required",
      });
      return null;
    }

    const trimmedRecipient = String(recipient || "").trim();
    if (!StrKey.isValidEd25519PublicKey(trimmedRecipient)) {
      toast.warning("Enter a valid Stellar recipient account.", {
        title: "Recipient required",
      });
      return null;
    }

    const duration = Number(durationSeconds || 0);
    if (!Number.isFinite(duration) || duration <= 0) {
      toast.warning("Enter a valid session duration.", {
        title: "Duration required",
      });
      return null;
    }

    const normalizedAmount = String(amountValue || "0").trim();
    if (!normalizedAmount || Number(normalizedAmount) <= 0) {
      toast.warning("Enter a valid USDC budget.", {
        title: "Amount required",
      });
      return null;
    }

    setIsProcessing(true);
    try {
      const response = await openPaymentSession({
        sender: walletAddress,
        recipient: trimmedRecipient,
        duration,
        amount: ethers.parseUnits(normalizedAmount, paymentTokenDecimals).toString(),
        metadata: typeof metadata === "string" ? metadata : JSON.stringify(metadata || {}),
      });
      const createdId = response?.streamId ?? response?.session?.id ?? null;
      await Promise.all([refreshStreams(), fetchPaymentBalance()]);
      setStatus("Session opened.");
      if (createdId != null) {
        toast.success(`Session #${createdId} is ready to use.`, {
          title: "Session Opened",
        });
      }
      return createdId;
    } catch (error) {
      console.error("Session creation failed", error);
      setStatus("Session setup failed.");
      toast.error(error.message || "Unable to open the payment session.", {
        title: "Session Setup Failed",
      });
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [fetchPaymentBalance, refreshStreams, toast, walletAddress]);

  const getClaimableBalance = useCallback(async (streamId) => {
    try {
      const session = await fetchPaymentSession(streamId);
      return ethers.formatUnits(
        BigInt(String(session?.claimableInitial || computeSessionClaimable(session))),
        paymentTokenDecimals,
      );
    } catch {
      return "0.0";
    }
  }, []);

  const formatEth = useCallback((value) => {
    try {
      if (typeof value === "string" && !value.startsWith("0x")) {
        return Number(value || 0).toFixed(4);
      }
      return Number(ethers.formatUnits(value || 0n, paymentTokenDecimals)).toFixed(4);
    } catch {
      return "0.0000";
    }
  }, []);

  useEffect(() => {
    refreshAvailableWallets();
  }, [refreshAvailableWallets]);

  useEffect(() => {
    if (autoConnectAttempted.current) {
      return;
    }
    autoConnectAttempted.current = true;

    if (typeof window === "undefined") {
      return;
    }

    const storedWallet = window.localStorage.getItem(STORED_WALLET_KEY);
    if (!storedWallet) {
      setIsInitialLoad(false);
      return;
    }

    connectWallet(storedWallet).catch(() => {
      window.localStorage.removeItem(STORED_WALLET_KEY);
      setIsInitialLoad(false);
    });
  }, [connectWallet]);

  useEffect(() => {
    if (!walletAddress) {
      setIsInitialLoad(false);
      return;
    }

    refreshStreams();
    fetchPaymentBalance();

    const interval = setInterval(() => {
      refreshStreams();
      fetchPaymentBalance();
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchPaymentBalance, refreshStreams, walletAddress]);

  const value = {
    provider,
    signer,
    walletAddress,
    walletDisplayAddress: walletAddress,
    chainId,
    status,
    setStatus,
    isProcessing,
    setIsProcessing,
    isConnectingWallet,
    paymentBalance,
    incomingStreams,
    setIncomingStreams,
    outgoingStreams,
    isLoadingStreams,
    isInitialLoad,
    contractWithProvider,
    contractWithSigner,
    getNetworkName,
    connectWallet,
    disconnectWallet,
    openWalletPicker,
    closeWalletPicker,
    isWalletPickerOpen,
    availableWallets,
    activeWallet,
    refreshAvailableWallets,
    fetchPaymentBalance,
    requestTestFunds,
    refreshStreams,
    withdraw,
    cancel,
    createStream,
    getClaimableBalance,
    formatEth,
    toast,
    paymentTokenSymbol,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
};
