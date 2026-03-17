import { ACTIVE_NETWORK } from '../networkConfig';

const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

function detectInjectedName(provider) {
  if (provider?.isTalisman) {
    return 'Talisman';
  }
  if (provider?.isMetaMask) {
    return 'MetaMask';
  }
  if (provider?.isRabby) {
    return 'Rabby';
  }
  return 'Browser Wallet';
}

function detectInjectedRdns(provider) {
  if (provider?.isTalisman) {
    return 'xyz.talisman';
  }
  if (provider?.isMetaMask) {
    return 'io.metamask';
  }
  if (provider?.isRabby) {
    return 'io.rabby';
  }
  return 'injected.wallet';
}

function normalizeInjectedWallet(info = {}, provider) {
  const name = info.name || detectInjectedName(provider);
  const rdns = info.rdns || detectInjectedRdns(provider);
  const uuid = info.uuid || `${rdns}:${name}`.toLowerCase();

  return {
    id: `injected:${uuid}`,
    type: 'injected',
    name,
    icon: info.icon || '',
    rdns,
    description: provider?.isTalisman
      ? 'Injected Polkadot EVM wallet'
      : 'Injected EVM wallet',
    provider,
    isAvailable: true,
  };
}

function appendProvider(walletMap, info, provider) {
  if (!provider?.request) {
    return;
  }

  const wallet = normalizeInjectedWallet(info, provider);
  if (!walletMap.has(wallet.id)) {
    walletMap.set(wallet.id, wallet);
  }
}

function appendLegacyProviders(walletMap) {
  if (typeof window === 'undefined') {
    return;
  }

  const providers = [];
  if (Array.isArray(window.ethereum?.providers)) {
    providers.push(...window.ethereum.providers);
  } else if (window.ethereum) {
    providers.push(window.ethereum);
  }

  providers.forEach((provider) => appendProvider(walletMap, {}, provider));
}

function sortWallets(wallets) {
  const priority = ['Talisman', 'MetaMask', 'Rabby', 'Nova Wallet'];
  return [...wallets].sort((left, right) => {
    const leftIndex = priority.indexOf(left.name);
    const rightIndex = priority.indexOf(right.name);
    const normalizedLeft = leftIndex === -1 ? priority.length : leftIndex;
    const normalizedRight = rightIndex === -1 ? priority.length : rightIndex;

    if (normalizedLeft !== normalizedRight) {
      return normalizedLeft - normalizedRight;
    }

    return left.name.localeCompare(right.name);
  });
}

export async function discoverInjectedWallets(timeout = 250) {
  if (typeof window === 'undefined') {
    return [];
  }

  const walletMap = new Map();
  appendLegacyProviders(walletMap);

  await new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', handleAnnouncement);
      resolve();
    }, timeout);

    function handleAnnouncement(event) {
      const detail = event.detail || {};
      appendProvider(walletMap, detail.info, detail.provider);
    }

    window.addEventListener('eip6963:announceProvider', handleAnnouncement);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    if (!window.ethereum) {
      window.clearTimeout(timer);
      window.removeEventListener('eip6963:announceProvider', handleAnnouncement);
      resolve();
    }
  });

  return sortWallets(Array.from(walletMap.values()));
}

export function getWalletConnectOption() {
  return {
    id: 'walletconnect:nova',
    type: 'walletconnect',
    name: 'Nova Wallet',
    icon: '',
    description: WALLETCONNECT_PROJECT_ID
      ? 'Connect from Nova mobile through WalletConnect'
      : 'Add VITE_WALLETCONNECT_PROJECT_ID to enable Nova via WalletConnect',
    isAvailable: Boolean(WALLETCONNECT_PROJECT_ID),
  };
}

export async function getAvailableWallets() {
  const injectedWallets = await discoverInjectedWallets();
  return [...injectedWallets, getWalletConnectOption()];
}

export async function createWalletConnectProvider() {
  if (!WALLETCONNECT_PROJECT_ID) {
    throw new Error('WalletConnect is not configured. Add VITE_WALLETCONNECT_PROJECT_ID.');
  }

  const walletConnectModule = await import('@walletconnect/ethereum-provider');
  const EthereumProvider =
    walletConnectModule.EthereumProvider
    || walletConnectModule.default?.EthereumProvider
    || walletConnectModule.default;

  const provider = await EthereumProvider.init({
    projectId: WALLETCONNECT_PROJECT_ID,
    chains: [ACTIVE_NETWORK.chainId],
    optionalChains: [ACTIVE_NETWORK.chainId],
    rpcMap: {
      [ACTIVE_NETWORK.chainId]: ACTIVE_NETWORK.rpcUrl,
    },
    showQrModal: true,
    methods: [
      'eth_sendTransaction',
      'eth_signTransaction',
      'personal_sign',
      'eth_sign',
      'eth_signTypedData',
      'eth_signTypedData_v4',
      'wallet_switchEthereumChain',
      'wallet_addEthereumChain',
    ],
    optionalMethods: [
      'eth_accounts',
      'eth_requestAccounts',
      'eth_chainId',
      'wallet_watchAsset',
    ],
    optionalEvents: ['accountsChanged', 'chainChanged', 'disconnect'],
    metadata: {
      name: 'Stream Engine',
      description: 'Agent payments and rental RWAs on Westend Asset Hub',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://streamengine.app',
      icons: [],
    },
  });

  await provider.enable();
  return provider;
}
