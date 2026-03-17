const SUPPORTED_WALLETS = [
  {
    name: 'Talisman',
    rdns: 'xyz.talisman',
    matches(info, provider) {
      return provider?.isTalisman || String(info?.name || '').toLowerCase().includes('talisman') || String(info?.rdns || '').includes('talisman');
    },
  },
  {
    name: 'MetaMask',
    rdns: 'io.metamask',
    matches(info, provider) {
      return provider?.isMetaMask || String(info?.name || '').toLowerCase().includes('metamask') || String(info?.rdns || '').includes('metamask');
    },
  },
  {
    name: 'Rabby',
    rdns: 'io.rabby',
    matches(info, provider) {
      return provider?.isRabby || String(info?.name || '').toLowerCase().includes('rabby') || String(info?.rdns || '').includes('rabby');
    },
  },
];

function getSupportedWallet(info = {}, provider) {
  return SUPPORTED_WALLETS.find((wallet) => wallet.matches(info, provider)) || null;
}

function detectInjectedName(provider) {
  return getSupportedWallet({}, provider)?.name || '';
}

function detectInjectedRdns(provider) {
  return getSupportedWallet({}, provider)?.rdns || '';
}

function normalizeInjectedWallet(info = {}, provider) {
  const supportedWallet = getSupportedWallet(info, provider);
  if (!supportedWallet) {
    return null;
  }

  const name = supportedWallet.name;
  const rdns = supportedWallet.rdns;
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
  if (wallet && !walletMap.has(wallet.id)) {
    walletMap.set(wallet.id, wallet);
  }
}

function appendLegacyProviders(walletMap) {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.talismanEth) {
    appendProvider(walletMap, {
      name: 'Talisman',
      rdns: 'xyz.talisman',
      uuid: 'talisman-global',
    }, window.talismanEth);
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
  const priority = ['Talisman', 'MetaMask', 'Rabby'];
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

export async function getAvailableWallets() {
  return discoverInjectedWallets();
}

export async function resolveWalletSelection(selection, wallets = []) {
  if (!selection) {
    return null;
  }

  if (typeof selection === 'object' && selection.provider) {
    return selection;
  }

  const refreshedWallets = wallets.length ? wallets : await getAvailableWallets();
  const matchedWallet = refreshedWallets.find((wallet) => wallet.id === selection);
  if (matchedWallet) {
    return matchedWallet;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  if (String(selection).includes('talisman') && window.talismanEth?.request) {
    return normalizeInjectedWallet({
      name: 'Talisman',
      rdns: 'xyz.talisman',
      uuid: 'talisman-global',
    }, window.talismanEth);
  }

  if (String(selection).includes('metamask') && window.ethereum?.request) {
    const provider = Array.isArray(window.ethereum.providers)
      ? window.ethereum.providers.find((item) => item?.isMetaMask) || window.ethereum
      : window.ethereum;
    return normalizeInjectedWallet({
      name: 'MetaMask',
      rdns: 'io.metamask',
      uuid: 'metamask-fallback',
    }, provider);
  }

  return null;
}
