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
} from '@stellar/freighter-api';
import { StrKey } from '@stellar/stellar-sdk';
import {
  contractAddress,
  contractABI,
  paymentTokenAddress,
  paymentTokenABI,
  paymentTokenDecimals,
  paymentTokenSymbol,
  paymentAssetId,
} from '../contactInfo.js';
import { useToast } from '../components/ui';
import { ACTIVE_NETWORK } from '../networkConfig.js';
import { getAvailableWallets, resolveWalletSelection } from '../lib/wallets.js';
import {
  claimPaymentSession,
  openPaymentSession,
  cancelPaymentSession,
  fetchPaymentSessions,
  fetchPaymentSession,
} from '../services/rwaApi.js';
import {
  connectInjectedSubstrateWallet,
  disconnectInjectedSubstrateWallet,
  inspectSubstrateApprovalAccount,
  readNativeAssetBalance,
  normalizeContractAddressInput,
  substrateApproveTransfer,
  substrateApproveTransferForSession,
  substrateCallContract,
  substrateReadContract,
} from '../lib/substrateAssets.js';

const WalletContext = createContext(null);

const TARGET_CHAIN_ID_DEC = ACTIVE_NETWORK.chainId;
const TARGET_CHAIN_ID_HEX = ACTIVE_NETWORK.chainIdHex;
const TOKEN_APPROVAL_GAS_LIMIT = 500000n;
const STREAM_CREATION_GAS_LIMIT = 1200000n;
const STREAM_SCAN_LIMIT = 256;
const IS_STELLAR_RUNTIME = ACTIVE_NETWORK.kind === 'stellar';

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

  if (typeof metadata === 'object') {
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
    Number(session?.durationSeconds || (Number(session?.stopTime || 0) - Number(session?.startTime || 0)) || 1),
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
    metadata: typeof session.metadata === 'string'
      ? session.metadata
      : JSON.stringify(session.metadata || {}),
    claimableInitial: BigInt(String(session.claimableInitial || computeSessionClaimable(session))),
    refundableAmount: BigInt(String(session.refundableAmount || 0)),
    sessionKind: 'stellar',
  };
}

function createFreighterSigner(address) {
  return {
    async getAddress() {
      return address;
    },
    async signMessage(message) {
      const response = await signFreighterMessage(message, {
        address,
        networkPassphrase: ACTIVE_NETWORK.passphrase,
      });
      if (response?.error) {
        throw new Error(response.error.message || 'Freighter could not sign the message.');
      }
      if (!response?.signedMessage) {
        throw new Error('Freighter returned an empty signature.');
      }
      if (typeof response.signedMessage === 'string') {
        return response.signedMessage;
      }

      const bytes = Array.from(new Uint8Array(response.signedMessage));
      const binary = bytes.map((value) => String.fromCharCode(value)).join('');
      return window.btoa(binary);
    },
  };
}

async function fetchStellarXlmBalance(address) {
  if (!address || !ACTIVE_NETWORK.horizonUrl) return "0.0";
  const response = await fetch(
    `${String(ACTIVE_NETWORK.horizonUrl).replace(/\/$/, '')}/accounts/${encodeURIComponent(address)}`,
  );
  if (!response.ok) return "0.0";
  const account = await response.json();
  const native = Array.isArray(account?.balances)
    ? account.balances.find((e) => e?.asset_type === 'native')
    : null;
  return native?.balance || "0.0";
}

async function fetchStellarPaymentBalance(address) {
  if (!address || !ACTIVE_NETWORK.horizonUrl) {
    return "0.0";
  }

  if (!ACTIVE_NETWORK.paymentAssetCode || !ACTIVE_NETWORK.paymentAssetIssuer) {
    return "0.0";
  }

  const response = await fetch(
    `${String(ACTIVE_NETWORK.horizonUrl).replace(/\/$/, '')}/accounts/${encodeURIComponent(address)}`,
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

async function ensureTokenApproval({
  tokenContract,
  ownerAddress,
  spenderAddress,
  amount,
  tokenSymbol,
  assetId,
  setStatus,
}) {
  if (ACTIVE_NETWORK.chainId === 420420421) {
    setStatus?.(`Approving ${tokenSymbol} via native asset approval...`);
    try {
      await substrateApproveTransfer(ownerAddress, assetId, spenderAddress, amount);
      setStatus?.(`${tokenSymbol} approved.`);
      return true;
    } catch (error) {
      console.warn(`[WalletContext] Native ${tokenSymbol} approval failed.`, error);
      const message = error?.message || `${tokenSymbol} approval failed on Westend.`;
      setStatus?.(message);
      throw new Error(message);
    }
  }

  let shouldApprove = true;

  try {
    const allowance = await tokenContract.allowance(
      ownerAddress,
      spenderAddress,
    );
    shouldApprove = allowance < amount;
  } catch (error) {
    console.warn(
      `[WalletContext] Unable to read ${tokenSymbol} allowance. Falling back to direct approval.`,
      error,
    );
  }

  if (!shouldApprove) {
    return false;
  }

  setStatus?.(`Approving ${tokenSymbol}...`);
  const approveTx = await tokenContract.approve(spenderAddress, amount, {
    gasLimit: TOKEN_APPROVAL_GAS_LIMIT,
  });
  await approveTx.wait();
  setStatus?.(`${tokenSymbol} approved.`);
  return true;
}

export function WalletProvider({ children }) {
  const toast = useToast();
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [walletAddress, setWalletAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [status, setStatus] = useState("Choose a wallet to connect");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [paymentBalance, setPaymentBalance] = useState("0.0");
  const [xlmBalance, setXlmBalance] = useState("0.0");
  const [availableWallets, setAvailableWallets] = useState([]);
  const [activeWallet, setActiveWallet] = useState(null);
  const [isWalletPickerOpen, setIsWalletPickerOpen] = useState(false);
  const [nativeAccountAddress, setNativeAccountAddress] = useState(null);
  const [substrateSession, setSubstrateSession] = useState(null);
  const [nativeApprovalState, setNativeApprovalState] = useState({
    checked: false,
    ready: false,
    message: '',
    mappedAccountAddress: '',
  });

  const activeWalletProviderRef = useRef(null);
  const substrateSessionRef = useRef(null);

  const [incomingStreams, setIncomingStreams] = useState([]);
  const [outgoingStreams, setOutgoingStreams] = useState([]);
  const [isLoadingStreams, setIsLoadingStreams] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const contractWithProvider = useMemo(() => {
    if (IS_STELLAR_RUNTIME) return null;
    if (!provider) return null;
    try {
      return new ethers.Contract(contractAddress, contractABI, provider);
    } catch {
      return null;
    }
  }, [provider]);

  const contractWithSigner = useMemo(() => {
    if (IS_STELLAR_RUNTIME) return null;
    if (!signer) return null;
    try {
      return new ethers.Contract(contractAddress, contractABI, signer);
    } catch {
      return null;
    }
  }, [signer]);

  const getNetworkName = useCallback((id) => {
    if (IS_STELLAR_RUNTIME) return ACTIVE_NETWORK.name;
    if (!id) return "...";
    if (id === ACTIVE_NETWORK.chainId) return ACTIVE_NETWORK.name;
    return `Chain ${id}`;
  }, []);

  const resetWalletState = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setWalletAddress(null);
    setChainId(null);
    setPaymentBalance("0.0");
    setNativeAccountAddress(null);
    setSubstrateSession(null);
    setIncomingStreams([]);
    setOutgoingStreams([]);
    setIsInitialLoad(true);
    setActiveWallet(null);
    setNativeApprovalState({
      checked: false,
      ready: false,
      message: '',
      mappedAccountAddress: '',
    });
  }, []);

  const refreshAvailableWallets = useCallback(async () => {
    try {
      const wallets = await getAvailableWallets();
      setAvailableWallets(wallets);
      return wallets;
    } catch (error) {
      console.error("Wallet discovery failed:", error);
      setAvailableWallets([]);
      return [];
    }
  }, []);

  const openWalletPicker = useCallback(async () => {
    await refreshAvailableWallets();
    setIsWalletPickerOpen(true);
  }, [refreshAvailableWallets]);

  const closeWalletPicker = useCallback(() => {
    setIsWalletPickerOpen(false);
  }, []);

  const ensureCorrectNetwork = useCallback(async (ethProvider) => {
    const currentChainIdHex = await ethProvider.request({
      method: "eth_chainId",
    });
    const currentChainId = parseInt(currentChainIdHex, 16);
    setChainId(currentChainId);

    if (currentChainIdHex !== TARGET_CHAIN_ID_HEX) {
      try {
        await ethProvider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: TARGET_CHAIN_ID_HEX }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          await ethProvider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: TARGET_CHAIN_ID_HEX,
                chainName: ACTIVE_NETWORK.name,
                nativeCurrency: ACTIVE_NETWORK.nativeCurrency,
                rpcUrls: [ACTIVE_NETWORK.rpcUrl],
                blockExplorerUrls: [ACTIVE_NETWORK.explorerUrl],
              },
            ],
          });
        } else {
          throw switchError;
        }
      }
    }
  }, []);

  const disconnectWallet = useCallback(
    async ({ silent = false } = {}) => {
      const currentSubstrateSession = substrateSessionRef.current;
      if (currentSubstrateSession) {
        try {
          await disconnectInjectedSubstrateWallet(currentSubstrateSession);
        } catch {
          // Ignore disconnect failures for extension-backed sessions.
        }
      }

      substrateSessionRef.current = null;
      activeWalletProviderRef.current = null;
      localStorage.removeItem('se_wallet');
      resetWalletState();
      setStatus("Choose a wallet to connect");

      if (!silent) {
        toast.info("Wallet disconnected", { title: "Wallet" });
      }
    },
    [activeWallet, resetWalletState, toast],
  );

  const connectWallet = useCallback(
    async (walletSelection) => {
      if (!walletSelection) {
        await openWalletPicker();
        return;
      }

      const wallets = availableWallets.length
        ? availableWallets
        : await refreshAvailableWallets();
      const walletOption = await resolveWalletSelection(
        walletSelection,
        wallets,
      );

      if (!walletOption) {
        toast.error("Selected wallet was not found in this browser.", {
          title: "Wallet Error",
        });
        return;
      }

      if (!walletOption.isAvailable) {
        toast.error(walletOption.description, {
          title: `${walletOption.name} unavailable`,
        });
        return;
      }

      try {
        setIsConnectingWallet(true);
        setStatus(`Connecting ${walletOption.name}...`);

        if (substrateSessionRef.current) {
          try {
            await disconnectInjectedSubstrateWallet(substrateSessionRef.current);
          } catch {
            // Ignore cleanup failures when switching wallet modes.
          }
          substrateSessionRef.current = null;
          setSubstrateSession(null);
        }

        if (walletOption.type === 'substrate') {
          const session = await connectInjectedSubstrateWallet(walletOption.source);
          const nextProvider = new ethers.JsonRpcProvider(ACTIVE_NETWORK.rpcUrl);

          activeWalletProviderRef.current = null;
          substrateSessionRef.current = session;
          setSubstrateSession(session);
          setProvider(nextProvider);
          setSigner(null);
          setWalletAddress(session.evmAddress);
          setNativeAccountAddress(session.substrateAddress);
          setChainId(ACTIVE_NETWORK.chainId);
          setActiveWallet({
            id: walletOption.id,
            name: walletOption.name,
            type: walletOption.type,
            description: walletOption.description,
            source: walletOption.source,
          });
          localStorage.setItem('se_wallet', JSON.stringify({ id: walletOption.id, source: walletOption.source }));
          setIsWalletPickerOpen(false);
          setNativeApprovalState({
            checked: true,
            ready: true,
            message: `Native approvals ready via ${walletOption.name}`,
            mappedAccountAddress: session.substrateAddress,
          });
          setStatus(`Connected via ${walletOption.name} · native substrate signer ready`);
          toast.success(
            `Connected to ${formatAddress(session.evmAddress)} via ${walletOption.name}`,
            { title: 'Wallet Connected' },
          );
          return;
        }

        if (walletOption.type === 'stellar') {
          const address = await walletOption.provider?.connect?.();
          const networkDetails = await getFreighterNetworkDetails();
          if (networkDetails?.error) {
            throw new Error(
              networkDetails.error.message || 'Unable to read the active Freighter network.',
            );
          }
          if (
            networkDetails?.networkPassphrase
            && networkDetails.networkPassphrase !== ACTIVE_NETWORK.passphrase
          ) {
            throw new Error(
              `Freighter is connected to ${networkDetails.network || 'a different Stellar network'}. Switch it to ${ACTIVE_NETWORK.name}.`,
            );
          }

          const stellarSigner = createFreighterSigner(address);
          activeWalletProviderRef.current = null;
          setNativeAccountAddress(null);
          setSubstrateSession(null);
          setProvider({
            kind: 'stellar',
            rpcUrl: ACTIVE_NETWORK.rpcUrl,
            horizonUrl: ACTIVE_NETWORK.horizonUrl,
            publicKey: address,
          });
          setSigner(stellarSigner);
          setWalletAddress(address);
          setChainId(ACTIVE_NETWORK.chainId);
          setActiveWallet({
            id: walletOption.id,
            name: walletOption.name,
            type: walletOption.type,
            description: walletOption.description,
          });
          localStorage.setItem('se_wallet', JSON.stringify({ id: walletOption.id }));
          setIsWalletPickerOpen(false);
          setNativeApprovalState({
            checked: true,
            ready: true,
            message: 'Stellar authorization signing ready via Freighter',
            mappedAccountAddress: '',
          });
          setStatus(`Connected via ${walletOption.name} · Stellar authorization signing ready`);
          toast.success(`Connected to ${formatAddress(address)} via ${walletOption.name}`, {
            title: 'Wallet Connected',
          });
          return;
        }

        const ethProvider = walletOption.provider;

        if (!ethProvider?.request) {
          throw new Error("Selected wallet does not expose an EVM provider.");
        }

        await ethProvider.request({ method: "eth_requestAccounts" });

        await ensureCorrectNetwork(ethProvider);

        const nextProvider = new ethers.BrowserProvider(ethProvider);
        const nextSigner = await nextProvider.getSigner();
        const address = await nextSigner.getAddress();
        const nextNetwork = await nextProvider.getNetwork();

      activeWalletProviderRef.current = ethProvider;
      setNativeAccountAddress(null);
      setSubstrateSession(null);
      setProvider(nextProvider);
      setSigner(nextSigner);
      setWalletAddress(address);
      setChainId(Number(nextNetwork.chainId));
      setActiveWallet({
        id: walletOption.id,
        name: walletOption.name,
        type: walletOption.type,
        description: walletOption.description,
      });
      localStorage.setItem('se_wallet', JSON.stringify({ id: walletOption.id }));
      setIsWalletPickerOpen(false);
      let nextStatus = `Connected via ${walletOption.name}`;
      if (Number(nextNetwork.chainId) === 420420421) {
        const approvalState = await inspectSubstrateApprovalAccount(address);
        if (approvalState.ready) {
          setNativeApprovalState({
            checked: true,
            ready: true,
            message: `Native approvals ready via ${approvalState.source || 'Substrate extension'}`,
            mappedAccountAddress: approvalState.mappedAccountAddress,
          });
          nextStatus = `${nextStatus} · native approvals ready`;
        } else {
          const message = approvalState.reason || 'Native approval setup is required on Westend.';
          setNativeApprovalState({
            checked: true,
            ready: false,
            message,
            mappedAccountAddress: approvalState.mappedAccountAddress || '',
          });
          nextStatus = `${nextStatus} · native approval setup needed`;
          toast.info(message, { title: 'Native Approval Setup' });
        }
      }
      setStatus(nextStatus);
      toast.success(`Connected to ${formatAddress(address)} via ${walletOption.name}`, { title: 'Wallet Connected' });
    } catch (error) {
      console.error('Connection failed:', error);
      activeWalletProviderRef.current = null;
      resetWalletState();
      setStatus('Wallet connection failed.');
      toast.error(error?.message || 'Failed to connect wallet', { title: 'Connection Failed' });
    } finally {
      setIsConnectingWallet(false);
    }
  }, [availableWallets, ensureCorrectNetwork, openWalletPicker, refreshAvailableWallets, resetWalletState, toast]);

  const fetchPaymentBalance = useCallback(async () => {
    const balanceAddress = nativeAccountAddress || walletAddress;
    if (!balanceAddress) return;
    try {
      if (IS_STELLAR_RUNTIME) {
        const balance = await fetchStellarPaymentBalance(balanceAddress);
        setPaymentBalance(balance);
        const xlm = await fetchStellarXlmBalance(balanceAddress);
        setXlmBalance(xlm);
        return;
      }

      let balance;
      if (activeWallet?.type === 'substrate' && substrateSession?.api && nativeAccountAddress) {
        const assetAccount = await substrateSession.api.query.assets.account(paymentAssetId, nativeAccountAddress);
        if (assetAccount?.isSome) {
          balance = BigInt(assetAccount.unwrap().balance.toString());
        } else {
          balance = BigInt(assetAccount?.balance?.toString?.() || 0);
        }
      } else {
        balance = await readNativeAssetBalance(balanceAddress, paymentAssetId);
      }
      setPaymentBalance(ethers.formatUnits(balance, paymentTokenDecimals));
    } catch (error) {
      console.error(`Failed to fetch ${paymentTokenSymbol} balance:`, error);
    }
  }, [activeWallet?.type, nativeAccountAddress, paymentAssetId, paymentTokenDecimals, paymentTokenSymbol, substrateSession, walletAddress]);

  const requestTestFunds = async () => {
    if (IS_STELLAR_RUNTIME) {
      toast.info(
        `${paymentTokenSymbol} funding happens off-app on Stellar testnet. Fund the connected wallet externally, then refresh the balance.`,
        { title: 'External Funding Required' },
      );
      setStatus(`Waiting for external ${paymentTokenSymbol} funding.`);
      return;
    }

    toast.info(
      `Circle ${paymentTokenSymbol} is not mintable in-app on Westend. Fund this account externally, then refresh the balance.`,
      { title: "External Funding Required" },
    );
    setStatus(`Waiting for external ${paymentTokenSymbol} funding.`);
  };

  const fetchStreamsFromEvents = useCallback(
    async (me) => {
      try {
        const normalizedAddress = me?.toLowerCase();

        if (IS_STELLAR_RUNTIME) {
          const sessions = await fetchPaymentSessions(me);
          const streamCards = sessions.map(mapSessionToStreamCard);
          return {
            incoming: streamCards.filter(
              (stream) => String(stream.recipient || '').toLowerCase() === normalizedAddress,
            ),
            outgoing: streamCards.filter(
              (stream) => String(stream.sender || '').toLowerCase() === normalizedAddress,
            ),
          };
        }

        if (!contractWithProvider || !provider) {
          return { incoming: [], outgoing: [] };
        }

        const readStreamById = async (streamId) => {
          if (activeWallet?.type === 'substrate' && substrateSession) {
            return substrateReadContract(substrateSession, {
              contractAddress,
              abi: contractABI,
              functionName: 'streams',
              args: [streamId],
            });
          }

          return contractWithProvider.streams(streamId);
        };

        if (ACTIVE_NETWORK.chainId === 420420421) {
          const streamCards = [];

          for (let streamId = 1; streamId <= STREAM_SCAN_LIMIT; streamId += 1) {
            const stream = await readStreamById(streamId);
            const sender = stream?.sender ?? stream?.[0];
            if (!sender || sender === ethers.ZeroAddress) {
              break;
            }

            const recipient = stream?.recipient ?? stream?.[1];
            const totalAmount = stream?.totalAmount ?? stream?.[2];
            const flowRate = stream?.flowRate ?? stream?.[3];
            const startTime = stream?.startTime ?? stream?.[4];
            const stopTime = stream?.stopTime ?? stream?.[5];
            const amountWithdrawn = stream?.amountWithdrawn ?? stream?.[6];
            const isActive = stream?.isActive ?? stream?.[7];
            const metadata = stream?.metadata ?? stream?.[8];
            const now = Math.floor(Date.now() / 1000);
            const elapsed = Math.max(0, Math.min(Number(stopTime), now) - Number(startTime));
            const streamedSoFar = BigInt(elapsed) * BigInt(flowRate);
            const claimable = isActive
              ? streamedSoFar > BigInt(amountWithdrawn)
                ? streamedSoFar - BigInt(amountWithdrawn)
                : 0n
              : 0n;

            streamCards.push({
              id: Number(streamId),
              sender,
              recipient,
              totalAmount: BigInt(totalAmount),
              flowRate: BigInt(flowRate),
              startTime: Number(startTime),
              stopTime: Number(stopTime),
              amountWithdrawn: BigInt(amountWithdrawn),
              isActive: Boolean(isActive),
              metadata,
              claimableInitial: claimable,
            });
          }

          return {
            incoming: streamCards.filter(
              (stream) => stream.recipient.toLowerCase() === normalizedAddress,
            ),
            outgoing: streamCards.filter(
              (stream) => stream.sender.toLowerCase() === normalizedAddress,
            ),
          };
        }

        const filter = contractWithProvider.filters.StreamCreated();
        const latestBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, latestBlock - 49000);
        const events = await contractWithProvider.queryFilter(
          filter,
          fromBlock,
          latestBlock,
        );
        const streamCards = await Promise.all(
          events.map(async (event) => {
            const streamId = event.args.streamId;
            const [
              sender,
              recipient,
              totalAmount,
              flowRate,
              startTime,
              stopTime,
              amountWithdrawn,
              isActive,
              metadata,
            ] = Object.values(await contractWithProvider.streams(streamId));
            const now = Math.floor(Date.now() / 1000);
            const elapsed = Math.max(
              0,
              Math.min(Number(stopTime), now) - Number(startTime),
            );
            const streamedSoFar = BigInt(elapsed) * BigInt(flowRate);
            const claimable = isActive
              ? streamedSoFar > BigInt(amountWithdrawn)
                ? streamedSoFar - BigInt(amountWithdrawn)
                : 0n
              : 0n;

            return {
              id: Number(streamId),
              sender,
              recipient,
              totalAmount: BigInt(totalAmount),
              flowRate: BigInt(flowRate),
              startTime: Number(startTime),
              stopTime: Number(stopTime),
              amountWithdrawn: BigInt(amountWithdrawn),
              isActive: Boolean(isActive),
              metadata,
              claimableInitial: claimable,
            };
          }),
        );
        const unique = Array.from(
          new Map(streamCards.map((stream) => [String(stream.id), stream])).values(),
        );
        return {
          incoming: unique.filter(s => s.recipient.toLowerCase() === normalizedAddress),
          outgoing: unique.filter(s => s.sender.toLowerCase() === normalizedAddress),
        };
      } catch (error) {
        console.error("Failed to fetch events:", error);
        return { incoming: [], outgoing: [] };
      }
    },
    [activeWallet?.type, contractWithProvider, provider, substrateSession],
  );

  const refreshStreams = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoadingStreams(true);
    const { incoming, outgoing } = await fetchStreamsFromEvents(walletAddress);
    setIncomingStreams(incoming);
    setOutgoingStreams(outgoing);
    setIsLoadingStreams(false);
    setIsInitialLoad(false);
    return { incoming, outgoing };
  }, [walletAddress, fetchStreamsFromEvents]);

  const withdraw = async (streamId) => {
    try {
      setStatus("Withdrawing...");
      setIsProcessing(true);
      const loadingToast = toast.transaction.pending(
        "Processing withdrawal...",
      );

      if (IS_STELLAR_RUNTIME) {
        await claimPaymentSession(streamId, { claimer: walletAddress || '' });
      } else if (activeWallet?.type === 'substrate') {
        if (!substrateSession) {
          throw new Error('Reconnect your Substrate wallet and try again.');
        }

        await substrateCallContract(substrateSession, {
          contractAddress,
          abi: contractABI,
          functionName: 'withdrawFromStream',
          args: [streamId],
        });
      } else {
        if (!contractWithSigner) return;
        const tx = await contractWithSigner.withdrawFromStream(streamId, {
          gasLimit: 300000n,
        });
        await tx.wait();
      }

      toast.dismiss(loadingToast);
      setStatus(IS_STELLAR_RUNTIME ? "Session balance claimed." : "Withdrawn.");
      toast.success(
        `${IS_STELLAR_RUNTIME ? "Claimed from Session" : "Withdrawn from Stream"} #${streamId}`,
        {
          title: IS_STELLAR_RUNTIME ? "Session Claim Complete" : "Withdrawal Complete",
        },
      );
      await refreshStreams();
      await fetchPaymentBalance();
    } catch (error) {
      console.error(error);
      setStatus(
        error?.shortMessage ||
          error?.message ||
          (IS_STELLAR_RUNTIME ? "Session claim failed." : "Withdraw failed."),
      );
      toast.error(
        error?.shortMessage ||
          error?.message ||
          (IS_STELLAR_RUNTIME ? "Session claim failed" : "Withdraw failed"),
        {
          title: IS_STELLAR_RUNTIME ? "Session Claim Failed" : "Withdrawal Failed",
        },
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const cancel = async (streamId) => {
    let loadingToast;
    try {
      setStatus(IS_STELLAR_RUNTIME ? "Ending session..." : "Cancelling stream...");
      setIsProcessing(true);
      loadingToast = toast.transaction.pending(
        IS_STELLAR_RUNTIME ? "Ending session..." : "Cancelling stream...",
      );

      if (IS_STELLAR_RUNTIME) {
        await cancelPaymentSession(streamId, { cancelledBy: walletAddress || '' });
      } else if (activeWallet?.type === 'substrate') {
        if (!substrateSession) {
          throw new Error('Reconnect your Substrate wallet and try again.');
        }

        await substrateCallContract(substrateSession, {
          contractAddress,
          abi: contractABI,
          functionName: 'cancelStream',
          args: [streamId],
        });
      } else {
        if (!contractWithSigner) {
          throw new Error('No signer available. Reconnect your wallet and try again.');
        }
        const tx = await contractWithSigner.cancelStream(streamId, {
          gasLimit: 300000n,
        });
        await tx.wait();
      }

      toast.dismiss(loadingToast);
      setStatus(IS_STELLAR_RUNTIME ? "Session ended." : "Stream cancelled.");
      if (IS_STELLAR_RUNTIME) {
        toast.info(`Session #${streamId} ended.`, {
          title: "Session Ended",
        });
      } else {
        toast.stream.cancelled(streamId);
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error(error);
      setStatus(
        error?.shortMessage ||
          error?.message ||
          (IS_STELLAR_RUNTIME ? "Session end failed." : "Cancel failed."),
      );
      toast.error(
        error?.shortMessage ||
          error?.message ||
          (IS_STELLAR_RUNTIME ? "Session end failed" : "Cancel failed"),
        {
          title: IS_STELLAR_RUNTIME ? "Session End Failed" : "Cancellation Failed",
        },
      );
    } finally {
      setIsProcessing(false);
      try {
        await refreshStreams();
        await fetchPaymentBalance();
      } catch {
        // Refresh failure should not mask the cancel result.
      }
    }
  };

  const createStream = async (recipient, duration, amount, metadata = "{}") => {
    if ((!provider && !IS_STELLAR_RUNTIME) || (!signer && activeWallet?.type !== 'substrate' && !IS_STELLAR_RUNTIME)) {
      setStatus("Please connect your wallet.");
      return null;
    }
    try {
      const normalizedRecipient = IS_STELLAR_RUNTIME
        ? String(recipient || '').trim()
        : normalizeContractAddressInput(recipient);
      let metadataString = metadata;
      try {
        const parsedMetadata = JSON.parse(metadata || "{}");
        metadataString = JSON.stringify({
          ...parsedMetadata,
          recipientInput: recipient,
          resolvedRecipient: normalizedRecipient,
        });
      } catch {
        metadataString = metadata;
      }
      const totalAmountWei = ethers.parseUnits(
        amount.toString(),
        paymentTokenDecimals,
      );
      const parsedDuration = parseInt(duration, 10);
      if (
        totalAmountWei <= 0n ||
        !Number.isFinite(parsedDuration) ||
        parsedDuration <= 0
      ) {
        setStatus("Enter a positive amount and duration.");
        return null;
      }
      if (ACTIVE_NETWORK.chainId === 420420421 && nativeApprovalState.checked && !nativeApprovalState.ready) {
        const message = nativeApprovalState.message || 'Native approval setup is required before creating a stream on Westend.';
        setStatus(message);
        toast.error(message, { title: 'Native Approval Setup Needed' });
        return null;
      }
      const existingOutgoingIds = new Set(outgoingStreams.map((stream) => stream.id));

      if (IS_STELLAR_RUNTIME) {
        if (!walletAddress) {
          throw new Error('Reconnect your Stellar wallet and try again.');
        }
        if (!StrKey.isValidEd25519PublicKey(normalizedRecipient)) {
          throw new Error('Enter a valid Stellar recipient address before opening a payment session.');
        }
      } else if (activeWallet?.type === 'substrate') {
        if (!substrateSession) {
          throw new Error('Reconnect your Substrate wallet and try again.');
        }

        setStatus(`Approving ${paymentTokenSymbol} via native asset approval...`);
        await substrateApproveTransferForSession(
          substrateSession,
          paymentAssetId,
          contractAddress,
          totalAmountWei,
        );
        setStatus(`${paymentTokenSymbol} approved.`);
      } else {
        const paymentTokenContract = new ethers.Contract(paymentTokenAddress, paymentTokenABI, signer);
        await ensureTokenApproval({
          tokenContract: paymentTokenContract,
          ownerAddress: await signer.getAddress(),
          spenderAddress: contractAddress,
          amount: totalAmountWei,
          tokenSymbol: paymentTokenSymbol,
          assetId: paymentAssetId,
          setStatus,
        });
      }

      setStatus(IS_STELLAR_RUNTIME ? "Opening session..." : "Creating stream...");
      setIsProcessing(true);
      let createdId = null;

      if (IS_STELLAR_RUNTIME) {
        const response = await openPaymentSession({
          sender: walletAddress,
          recipient: normalizedRecipient,
          duration: parsedDuration,
          amount: totalAmountWei.toString(),
          metadata: metadataString,
        });
        createdId = Number(response?.streamId);
      } else if (activeWallet?.type === 'substrate') {
        await substrateCallContract(substrateSession, {
          contractAddress,
          abi: contractABI,
          functionName: 'createStream',
          args: [normalizedRecipient, parsedDuration, totalAmountWei, metadataString],
        });
      } else {
        const tx = await contractWithSigner.createStream(
          normalizedRecipient,
          parsedDuration,
          totalAmountWei,
          metadataString,
          {
            gasLimit: STREAM_CREATION_GAS_LIMIT,
          },
        );
        const receipt = await tx.wait();
        try {
          const iface = contractWithSigner.interface;
          const topic = iface.getEventTopic("StreamCreated");
          for (const log of receipt.logs || []) {
            if (
              log.address?.toLowerCase() === contractAddress.toLowerCase() &&
              log.topics?.[0] === topic
            ) {
              const parsedLog = iface.parseLog({
                topics: Array.from(log.topics),
                data: log.data,
              });
              const streamId = parsedLog?.args?.streamId ?? parsedLog?.args?.[0];
              if (streamId !== undefined && streamId !== null) {
                createdId = Number(streamId);
                break;
              }
            }
          }
        } catch {
          // Ignore log parsing failures.
        }
      }
      const refreshedStreams = await refreshStreams();
      await fetchPaymentBalance();

      if (createdId === null) {
        const detectedStream = refreshedStreams?.outgoing?.find(
          (stream) => !existingOutgoingIds.has(stream.id),
        );
        if (detectedStream) {
          createdId = Number(detectedStream.id);
        }
      }

      if (createdId !== null) {
        setStatus(
          `${IS_STELLAR_RUNTIME ? "Session opened" : "Stream created"}. ID #${createdId}`,
        );
        if (IS_STELLAR_RUNTIME) {
          toast.success(`Session #${createdId} is ready to use.`, {
            title: "Session Opened",
          });
        } else {
          toast.stream.created(createdId);
        }
      } else {
        setStatus(IS_STELLAR_RUNTIME ? "Session opened." : "Stream created.");
        toast.success(
          IS_STELLAR_RUNTIME
            ? "Payment session opened successfully"
            : "Stream created successfully",
          {
            title: IS_STELLAR_RUNTIME ? "Session Opened" : "Stream Created",
          },
        );
      }
      return createdId;
    } catch (error) {
      console.error(
        `${IS_STELLAR_RUNTIME ? "Session" : "Stream"} creation failed:`,
        error,
      );
      setStatus(error?.shortMessage || error?.message || 'Transaction failed.');
      toast.error(error?.shortMessage || error?.message || 'Transaction failed', {
        title: IS_STELLAR_RUNTIME ? 'Session Setup Failed' : 'Stream Creation Failed',
      });
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  const getClaimableBalance = async (streamId) => {
    if (!provider && !IS_STELLAR_RUNTIME) return "0.0";
    try {
      let amount;
      if (IS_STELLAR_RUNTIME) {
        const session = await fetchPaymentSession(streamId);
        return ethers.formatUnits(
          BigInt(String(session?.claimableInitial || computeSessionClaimable(session))),
          paymentTokenDecimals,
        );
      }

      if (activeWallet?.type === 'substrate' && substrateSession) {
        amount = await substrateReadContract(substrateSession, {
          contractAddress,
          abi: contractABI,
          functionName: 'getClaimableBalance',
          args: [streamId],
        });
      } else {
        const readContract = new ethers.Contract(contractAddress, contractABI, provider);
        amount = await readContract.getClaimableBalance(streamId);
      }
      return ethers.formatUnits(amount, paymentTokenDecimals);
    } catch (err) {
      if (IS_STELLAR_RUNTIME) {
        const msg = err?.reason || err?.message || String(err);
        toast.error(msg, { title: 'Balance check failed' });
        return "0.0";
      }

      // getClaimableBalance reverts if stream.isActive is false.
      // Fall back to computing it from raw stream data so completed/expired
      // streams still show the correct withdrawable amount.
      try {
        let s;
        if (activeWallet?.type === 'substrate' && substrateSession) {
          s = await substrateReadContract(substrateSession, {
            contractAddress,
            abi: contractABI,
            functionName: 'streams',
            args: [streamId],
          });
        } else {
          const readContract = new ethers.Contract(contractAddress, contractABI, provider);
          s = await readContract.streams(streamId);
        }
        const totalAmount = BigInt(s.totalAmount ?? s[2]);
        const amountWithdrawn = BigInt(s.amountWithdrawn ?? s[6]);
        const remaining = totalAmount > amountWithdrawn ? totalAmount - amountWithdrawn : 0n;
        if (remaining > 0n) return ethers.formatUnits(remaining, paymentTokenDecimals);
      } catch {}
      const msg = err?.reason || err?.message || String(err);
      toast.error(msg, { title: 'Balance check failed' });
      return "0.0";
    }
  };

  const formatEth = (weiBigInt) => {
    try {
      return Number(
        ethers.formatUnits(weiBigInt, paymentTokenDecimals),
      ).toLocaleString(undefined, {
        maximumFractionDigits: 6,
      });
    } catch {
      return "0";
    }
  };

  const refreshStreamsRef = useRef(refreshStreams);
  const fetchPaymentBalanceRef = useRef(fetchPaymentBalance);
  useEffect(() => {
    substrateSessionRef.current = substrateSession;
  }, [substrateSession]);
  useEffect(() => {
    refreshStreamsRef.current = refreshStreams;
  }, [refreshStreams]);
  useEffect(() => {
    fetchPaymentBalanceRef.current = fetchPaymentBalance;
  }, [fetchPaymentBalance]);

  useEffect(() => {
    refreshAvailableWallets();
  }, [refreshAvailableWallets]);

  // Auto-reconnect on page load if a wallet was previously connected
  useEffect(() => {
    if (!availableWallets.length) return;
    const saved = localStorage.getItem('se_wallet');
    if (!saved || walletAddress) return;
    try {
      const { id } = JSON.parse(saved);
      connectWallet(id).catch(() => localStorage.removeItem('se_wallet'));
    } catch {
      localStorage.removeItem('se_wallet');
    }
  }, [availableWallets]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleFocus = () => {
      refreshAvailableWallets();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshAvailableWallets]);

  useEffect(() => {
    const activeProvider = activeWalletProviderRef.current;
    if (!activeProvider?.on) {
      return undefined;
    }

    const handleAccountsChanged = async (accounts) => {
      if (!accounts?.length) {
        await disconnectWallet({ silent: true });
        return;
      }

      const nextProvider = new ethers.BrowserProvider(activeProvider);
      const nextSigner = await nextProvider.getSigner();
      setProvider(nextProvider);
      setSigner(nextSigner);
      setWalletAddress(accounts[0]);
      if (chainId === 420420421) {
        const approvalState = await inspectSubstrateApprovalAccount(accounts[0]);
        if (approvalState.ready) {
          setNativeApprovalState({
            checked: true,
            ready: true,
            message: `Native approvals ready via ${approvalState.source || 'Substrate extension'}`,
            mappedAccountAddress: approvalState.mappedAccountAddress,
          });
          setStatus(`Connected via ${activeWallet?.name || 'wallet'} · native approvals ready`);
        } else {
          const message = approvalState.reason || 'Native approval setup is required on Westend.';
          setNativeApprovalState({
            checked: true,
            ready: false,
            message,
            mappedAccountAddress: approvalState.mappedAccountAddress || '',
          });
          setStatus(`Connected via ${activeWallet?.name || 'wallet'} · native approval setup needed`);
          toast.info(message, { title: 'Native Approval Setup' });
        }
      } else {
        setNativeApprovalState({
          checked: false,
          ready: false,
          message: '',
          mappedAccountAddress: '',
        });
        setStatus(`Connected via ${activeWallet?.name || 'wallet'}`);
      }
      toast.info(`Active account changed to ${formatAddress(accounts[0])}`, { title: 'Wallet Updated' });
    };

    const handleChainChanged = async (nextChainIdHex) => {
      const nextChainId = parseInt(nextChainIdHex, 16);
      setChainId(nextChainId);

      if (nextChainId !== TARGET_CHAIN_ID_DEC) {
        setNativeApprovalState({
          checked: false,
          ready: false,
          message: '',
          mappedAccountAddress: '',
        });
        setStatus(`Switch ${activeWallet?.name || 'wallet'} back to ${ACTIVE_NETWORK.name}.`);
        toast.warning(`Wrong network selected. Switch back to ${ACTIVE_NETWORK.name}.`, { title: 'Network Mismatch' });
        return;
      }

      const nextProvider = new ethers.BrowserProvider(activeProvider);
      setProvider(nextProvider);
      try {
        const nextSigner = await nextProvider.getSigner();
        setSigner(nextSigner);
        const nextAddress = await nextSigner.getAddress();
        if (nextChainId === 420420421) {
          const approvalState = await inspectSubstrateApprovalAccount(nextAddress);
          setNativeApprovalState({
            checked: true,
            ready: approvalState.ready,
            message: approvalState.ready
              ? `Native approvals ready via ${approvalState.source || 'Substrate extension'}`
              : (approvalState.reason || 'Native approval setup is required on Westend.'),
            mappedAccountAddress: approvalState.mappedAccountAddress || '',
          });
        }
      } catch {
        // Ignore signer refresh failures.
      }
      setStatus(`Connected via ${activeWallet?.name || "wallet"}`);
      refreshStreamsRef.current();
      fetchPaymentBalanceRef.current();
    };

    const handleDisconnect = async () => {
      await disconnectWallet({ silent: true });
    };

    activeProvider.on("accountsChanged", handleAccountsChanged);
    activeProvider.on("chainChanged", handleChainChanged);
    activeProvider.on("disconnect", handleDisconnect);

    return () => {
      activeProvider.removeListener?.("accountsChanged", handleAccountsChanged);
      activeProvider.removeListener?.("chainChanged", handleChainChanged);
      activeProvider.removeListener?.("disconnect", handleDisconnect);
    };
  }, [activeWallet?.name, disconnectWallet, toast]);

  useEffect(() => {
    if (!walletAddress) return;
    refreshStreamsRef.current();
    fetchPaymentBalanceRef.current();
    const interval = setInterval(() => {
      refreshStreamsRef.current();
      fetchPaymentBalanceRef.current();
    }, 15000);

    if (IS_STELLAR_RUNTIME || !contractWithProvider || ACTIVE_NETWORK.chainId === 420420421) {
      return () => {
        clearInterval(interval);
      };
    }

    const listener = () => {
      refreshStreamsRef.current();
      fetchPaymentBalanceRef.current();
    };
    contractWithProvider.on('StreamCreated', listener);
    contractWithProvider.on('StreamCancelled', listener);
    contractWithProvider.on('Withdrawn', listener);

    return () => {
      clearInterval(interval);
      try {
        contractWithProvider.off('StreamCreated', listener);
        contractWithProvider.off('StreamCancelled', listener);
        contractWithProvider.off('Withdrawn', listener);
      } catch {
        // Ignore listener cleanup failures.
      }
    };
  }, [walletAddress, contractWithProvider]);

  const value = {
    provider,
    signer,
    walletAddress,
    walletDisplayAddress: activeWallet?.type === 'substrate' && nativeAccountAddress
      ? nativeAccountAddress
      : walletAddress,
    chainId,
    status,
    setStatus,
    isProcessing,
    setIsProcessing,
    isConnectingWallet,
    paymentBalance,
    xlmBalance,
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
    nativeAccountAddress,
    substrateSession,
    nativeApprovalState,
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
  if (!context)
    throw new Error("useWallet must be used within a WalletProvider");
  return context;
};
