import { createContext, useContext, useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
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
import { readNativeAssetBalance, substrateApproveTransfer } from '../lib/substrateAssets.js';

const WalletContext = createContext(null);

const TARGET_CHAIN_ID_DEC = ACTIVE_NETWORK.chainId;
const TARGET_CHAIN_ID_HEX = ACTIVE_NETWORK.chainIdHex;
const TOKEN_APPROVAL_GAS_LIMIT = 500000n;
const STREAM_CREATION_GAS_LIMIT = 1200000n;

function formatAddress(address) {
  if (!address) {
    return 'Unavailable';
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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
    try {
      setStatus?.(`Approving ${tokenSymbol} via native asset approval...`);
      await substrateApproveTransfer(ownerAddress, assetId, spenderAddress, amount);
      setStatus?.(`${tokenSymbol} approved.`);
      return true;
    } catch (error) {
      console.warn(`[WalletContext] Native ${tokenSymbol} approval failed. Falling back to EVM approval.`, error);
    }
  }

  let shouldApprove = true;

  try {
    const allowance = await tokenContract.allowance(ownerAddress, spenderAddress);
    shouldApprove = allowance < amount;
  } catch (error) {
    console.warn(`[WalletContext] Unable to read ${tokenSymbol} allowance. Falling back to direct approval.`, error);
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
  const [status, setStatus] = useState('Choose a wallet to connect');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [paymentBalance, setPaymentBalance] = useState('0.0');
  const [availableWallets, setAvailableWallets] = useState([]);
  const [activeWallet, setActiveWallet] = useState(null);
  const [isWalletPickerOpen, setIsWalletPickerOpen] = useState(false);

  const activeWalletProviderRef = useRef(null);

  const [incomingStreams, setIncomingStreams] = useState([]);
  const [outgoingStreams, setOutgoingStreams] = useState([]);
  const [isLoadingStreams, setIsLoadingStreams] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const contractWithProvider = useMemo(() => {
    if (!provider) return null;
    try {
      return new ethers.Contract(contractAddress, contractABI, provider);
    } catch {
      return null;
    }
  }, [provider]);

  const contractWithSigner = useMemo(() => {
    if (!signer) return null;
    try {
      return new ethers.Contract(contractAddress, contractABI, signer);
    } catch {
      return null;
    }
  }, [signer]);

  const getNetworkName = useCallback((id) => {
    if (!id) return '...';
    if (id === ACTIVE_NETWORK.chainId) return ACTIVE_NETWORK.name;
    return `Chain ${id}`;
  }, []);

  const resetWalletState = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setWalletAddress(null);
    setChainId(null);
    setPaymentBalance('0.0');
    setIncomingStreams([]);
    setOutgoingStreams([]);
    setIsInitialLoad(true);
    setActiveWallet(null);
  }, []);

  const refreshAvailableWallets = useCallback(async () => {
    try {
      const wallets = await getAvailableWallets();
      setAvailableWallets(wallets);
      return wallets;
    } catch (error) {
      console.error('Wallet discovery failed:', error);
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
    const currentChainIdHex = await ethProvider.request({ method: 'eth_chainId' });
    const currentChainId = parseInt(currentChainIdHex, 16);
    setChainId(currentChainId);

    if (currentChainIdHex !== TARGET_CHAIN_ID_HEX) {
      try {
        await ethProvider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: TARGET_CHAIN_ID_HEX }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          await ethProvider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: TARGET_CHAIN_ID_HEX,
              chainName: ACTIVE_NETWORK.name,
              nativeCurrency: ACTIVE_NETWORK.nativeCurrency,
              rpcUrls: [ACTIVE_NETWORK.rpcUrl],
              blockExplorerUrls: [ACTIVE_NETWORK.explorerUrl],
            }],
          });
        } else {
          throw switchError;
        }
      }
    }
  }, []);

  const disconnectWallet = useCallback(async ({ silent = false } = {}) => {
    activeWalletProviderRef.current = null;
    resetWalletState();
    setStatus('Choose a wallet to connect');

    if (!silent) {
      toast.info('Wallet disconnected', { title: 'Wallet' });
    }
  }, [activeWallet, resetWalletState, toast]);

  const connectWallet = useCallback(async (walletSelection) => {
    if (!walletSelection) {
      await openWalletPicker();
      return;
    }

    const wallets = availableWallets.length ? availableWallets : await refreshAvailableWallets();
    const walletOption = await resolveWalletSelection(walletSelection, wallets);

    if (!walletOption) {
      toast.error('Selected wallet was not found in this browser.', { title: 'Wallet Error' });
      return;
    }

    if (!walletOption.isAvailable) {
      toast.error(walletOption.description, { title: `${walletOption.name} unavailable` });
      return;
    }

    try {
      setIsConnectingWallet(true);
      setStatus(`Connecting ${walletOption.name}...`);
      const ethProvider = walletOption.provider;

      if (!ethProvider?.request) {
        throw new Error('Selected wallet does not expose an EVM provider.');
      }

      await ethProvider.request({ method: 'eth_requestAccounts' });

      await ensureCorrectNetwork(ethProvider);

      const nextProvider = new ethers.BrowserProvider(ethProvider);
      const nextSigner = await nextProvider.getSigner();
      const address = await nextSigner.getAddress();
      const nextNetwork = await nextProvider.getNetwork();

      activeWalletProviderRef.current = ethProvider;
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
      setIsWalletPickerOpen(false);
      setStatus(`Connected via ${walletOption.name}`);
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
    if (!provider || !walletAddress) return;
    try {
      const paymentTokenContract = new ethers.Contract(paymentTokenAddress, paymentTokenABI, provider);
      const balance = await paymentTokenContract.balanceOf(walletAddress);
      setPaymentBalance(ethers.formatUnits(balance, paymentTokenDecimals));
    } catch (error) {
      console.error(`Failed to fetch ${paymentTokenSymbol} balance:`, error);
      try {
        const nativeAssetBalance = await readNativeAssetBalance(walletAddress, paymentAssetId);
        setPaymentBalance(ethers.formatUnits(nativeAssetBalance, paymentTokenDecimals));
      } catch (fallbackError) {
        console.error(`Failed to fetch ${paymentTokenSymbol} balance via EVM fallback:`, fallbackError);
      }
    }
  }, [paymentAssetId, paymentTokenDecimals, paymentTokenSymbol, provider, walletAddress]);

  const requestTestFunds = async () => {
    toast.info(
      `Circle ${paymentTokenSymbol} is not mintable in-app on Westend. Fund this account externally, then refresh the balance.`,
      { title: 'External Funding Required' }
    );
    setStatus(`Waiting for external ${paymentTokenSymbol} funding.`);
  };

  const fetchStreamsFromEvents = useCallback(async (me) => {
    if (!contractWithProvider || !provider) return { incoming: [], outgoing: [] };
    try {
      const filter = contractWithProvider.filters.StreamCreated();
      const latestBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - 49000);
      const events = await contractWithProvider.queryFilter(filter, fromBlock, latestBlock);
      const streamCards = await Promise.all(events.map(async (event) => {
        const streamId = event.args.streamId;
        const [sender, recipient, totalAmount, flowRate, startTime, stopTime, amountWithdrawn, isActive, metadata] =
          Object.values(await contractWithProvider.streams(streamId));
        const now = Math.floor(Date.now() / 1000);
        const elapsed = Math.max(0, Math.min(Number(stopTime), now) - Number(startTime));
        const streamedSoFar = BigInt(elapsed) * BigInt(flowRate);
        const claimable = isActive
          ? (streamedSoFar > BigInt(amountWithdrawn) ? streamedSoFar - BigInt(amountWithdrawn) : 0n)
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
      }));
      const normalizedAddress = me?.toLowerCase();
      return {
        incoming: streamCards.filter((stream) => stream.recipient.toLowerCase() === normalizedAddress),
        outgoing: streamCards.filter((stream) => stream.sender.toLowerCase() === normalizedAddress),
      };
    } catch (error) {
      console.error('Failed to fetch events:', error);
      return { incoming: [], outgoing: [] };
    }
  }, [contractWithProvider, provider]);

  const refreshStreams = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoadingStreams(true);
    const { incoming, outgoing } = await fetchStreamsFromEvents(walletAddress);
    setIncomingStreams(incoming);
    setOutgoingStreams(outgoing);
    setIsLoadingStreams(false);
    setIsInitialLoad(false);
  }, [walletAddress, fetchStreamsFromEvents]);

  const withdraw = async (streamId) => {
    if (!contractWithSigner) return;
    try {
      setStatus('Withdrawing...');
      setIsProcessing(true);
      const loadingToast = toast.transaction.pending('Processing withdrawal...');
      const tx = await contractWithSigner.withdrawFromStream(streamId, { gasLimit: 300000n });
      await tx.wait();
      toast.dismiss(loadingToast);
      setStatus('Withdrawn.');
      toast.success(`Withdrawn from Stream #${streamId}`, { title: 'Withdrawal Complete' });
      await refreshStreams();
    } catch (error) {
      console.error(error);
      setStatus(error?.shortMessage || error?.message || 'Withdraw failed.');
      toast.error(error?.shortMessage || error?.message || 'Withdraw failed', { title: 'Withdrawal Failed' });
    } finally {
      setIsProcessing(false);
    }
  };

  const cancel = async (streamId) => {
    if (!contractWithSigner) return;
    try {
      setStatus('Cancelling stream...');
      setIsProcessing(true);
      const loadingToast = toast.transaction.pending('Cancelling stream...');
      const tx = await contractWithSigner.cancelStream(streamId, { gasLimit: 300000n });
      await tx.wait();
      toast.dismiss(loadingToast);
      setStatus('Stream cancelled.');
      toast.stream.cancelled(streamId);
      await refreshStreams();
    } catch (error) {
      console.error(error);
      setStatus(error?.shortMessage || error?.message || 'Cancel failed.');
      toast.error(error?.shortMessage || error?.message || 'Cancel failed', { title: 'Cancellation Failed' });
    } finally {
      setIsProcessing(false);
    }
  };

  const createStream = async (recipient, duration, amount, metadata = '{}') => {
    if (!contractWithSigner || !provider || !signer) {
      setStatus('Please connect your wallet.');
      return null;
    }
    try {
      if (!ethers.isAddress(recipient)) {
        setStatus('Invalid recipient address.');
        return null;
      }
      const totalAmountWei = ethers.parseUnits(amount.toString(), paymentTokenDecimals);
      const parsedDuration = parseInt(duration, 10);
      if (totalAmountWei <= 0n || !Number.isFinite(parsedDuration) || parsedDuration <= 0) {
        setStatus('Enter a positive amount and duration.');
        return null;
      }
      const paymentTokenContract = new ethers.Contract(paymentTokenAddress, paymentTokenABI, signer);
<<<<<<< HEAD
      const approveTx = await paymentTokenContract.approve(contractAddress, totalAmountWei, { gasLimit: 100000n });
      await approveTx.wait();
      setStatus(`${paymentTokenSymbol} approved.`);
      setStatus('Creating stream...');
      setIsProcessing(true);
      const tx = await contractWithSigner.createStream(recipient, parsedDuration, totalAmountWei, metadata, { gasLimit: 500000n });
=======
      await ensureTokenApproval({
        tokenContract: paymentTokenContract,
        ownerAddress: await signer.getAddress(),
        spenderAddress: contractAddress,
        amount: totalAmountWei,
        tokenSymbol: paymentTokenSymbol,
        assetId: paymentAssetId,
        setStatus,
      });
      setStatus('Creating stream...');
      setIsProcessing(true);
      const tx = await contractWithSigner.createStream(recipient, parsedDuration, totalAmountWei, metadata, {
        gasLimit: STREAM_CREATION_GAS_LIMIT,
      });
>>>>>>> 8de4d14f011996ed01d926234bea94a565c04021
      const receipt = await tx.wait();
      let createdId = null;
      try {
        const iface = contractWithSigner.interface;
        const topic = iface.getEventTopic('StreamCreated');
        for (const log of receipt.logs || []) {
          if (log.address?.toLowerCase() === contractAddress.toLowerCase() && log.topics?.[0] === topic) {
            const parsedLog = iface.parseLog({ topics: Array.from(log.topics), data: log.data });
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
      if (createdId !== null) {
        setStatus(`Stream created. ID #${createdId}`);
        toast.stream.created(createdId);
      } else {
        setStatus('Stream created.');
        toast.success('Stream created successfully', { title: 'Stream Created' });
      }
      await refreshStreams();
      return createdId;
    } catch (error) {
      console.error('Stream creation failed:', error);
      setStatus(error?.shortMessage || error?.message || 'Transaction failed.');
      toast.error(error?.shortMessage || error?.message || 'Transaction failed', { title: 'Stream Creation Failed' });
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  const getClaimableBalance = async (streamId) => {
    if (!provider) return '0.0';
    try {
      const readContract = new ethers.Contract(contractAddress, contractABI, provider);
      const amount = await readContract.getClaimableBalance(streamId);
      return ethers.formatUnits(amount, paymentTokenDecimals);
    } catch {
      return '0.0';
    }
  };

  const formatEth = (weiBigInt) => {
    try {
      return Number(ethers.formatUnits(weiBigInt, paymentTokenDecimals)).toLocaleString(undefined, {
        maximumFractionDigits: 6,
      });
    } catch {
      return '0';
    }
  };

  const refreshStreamsRef = useRef(refreshStreams);
  const fetchPaymentBalanceRef = useRef(fetchPaymentBalance);
  useEffect(() => { refreshStreamsRef.current = refreshStreams; }, [refreshStreams]);
  useEffect(() => { fetchPaymentBalanceRef.current = fetchPaymentBalance; }, [fetchPaymentBalance]);

  useEffect(() => {
    refreshAvailableWallets();
  }, [refreshAvailableWallets]);

  useEffect(() => {
    const handleFocus = () => {
      refreshAvailableWallets();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
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
      setStatus(`Connected via ${activeWallet?.name || 'wallet'}`);
      toast.info(`Active account changed to ${formatAddress(accounts[0])}`, { title: 'Wallet Updated' });
    };

    const handleChainChanged = async (nextChainIdHex) => {
      const nextChainId = parseInt(nextChainIdHex, 16);
      setChainId(nextChainId);

      if (nextChainId !== TARGET_CHAIN_ID_DEC) {
        setStatus(`Switch ${activeWallet?.name || 'wallet'} back to ${ACTIVE_NETWORK.name}.`);
        toast.warning(`Wrong network selected. Switch back to ${ACTIVE_NETWORK.name}.`, { title: 'Network Mismatch' });
        return;
      }

      const nextProvider = new ethers.BrowserProvider(activeProvider);
      setProvider(nextProvider);
      try {
        const nextSigner = await nextProvider.getSigner();
        setSigner(nextSigner);
      } catch {
        // Ignore signer refresh failures.
      }
      setStatus(`Connected via ${activeWallet?.name || 'wallet'}`);
      refreshStreamsRef.current();
      fetchPaymentBalanceRef.current();
    };

    const handleDisconnect = async () => {
      await disconnectWallet({ silent: true });
    };

    activeProvider.on('accountsChanged', handleAccountsChanged);
    activeProvider.on('chainChanged', handleChainChanged);
    activeProvider.on('disconnect', handleDisconnect);

    return () => {
      activeProvider.removeListener?.('accountsChanged', handleAccountsChanged);
      activeProvider.removeListener?.('chainChanged', handleChainChanged);
      activeProvider.removeListener?.('disconnect', handleDisconnect);
    };
  }, [activeWallet?.name, disconnectWallet, toast]);

  useEffect(() => {
    if (!walletAddress || !contractWithProvider) return;
    refreshStreamsRef.current();
    fetchPaymentBalanceRef.current();
    const listener = () => refreshStreamsRef.current();
    contractWithProvider.on('StreamCreated', listener);
    contractWithProvider.on('StreamCancelled', listener);
    contractWithProvider.on('Withdrawn', listener);
    return () => {
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

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used within a WalletProvider');
  return context;
};
