const SUPPORTED_WALLETS = [];

const SUPPORTED_SUBSTRATE_WALLETS = [
  {
    name: 'Polkadot.js',
    source: 'polkadot-js',
    matches(source) {
      return String(source || '').toLowerCase() === 'polkadot-js';
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

function getSupportedSubstrateWallet(source) {
  return SUPPORTED_SUBSTRATE_WALLETS.find((wallet) => wallet.matches(source)) || null;
}

function normalizeSubstrateWallet(source, extension) {
  const supportedWallet = getSupportedSubstrateWallet(source);
  if (!supportedWallet || !extension?.enable) {
    return null;
  }

  return {
    id: `substrate:${supportedWallet.source}`,
    type: 'substrate',
    name: supportedWallet.name,
    icon: '',
    rdns: source,
    source,
    provider: extension,
    description: 'Injected Substrate wallet',
    isAvailable: true,
  };
}

function appendProvider(walletMap, info, provider) {
  if (!provider?.request) {
    return;
  }

  const wallet = normalizeInjectedWallet(info, provider);
  if (!wallet) return;

  // Deduplicate by rdns — prefer entry with an icon (EIP-6963 over legacy)
  const existing = [...walletMap.values()].find(w => w.rdns === wallet.rdns);
  if (!existing) {
    walletMap.set(wallet.id, wallet);
  } else if (!existing.icon && wallet.icon) {
    walletMap.delete(existing.id);
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

function appendSubstrateProviders(walletMap) {
  if (typeof window === 'undefined') {
    return;
  }

  const injectedWeb3 = window.injectedWeb3 || {};
  Object.entries(injectedWeb3).forEach(([source, extension]) => {
    const wallet = normalizeSubstrateWallet(source, extension);
    if (!wallet) {
      return;
    }

    walletMap.set(wallet.id, wallet);
  });
}

function sortWallets(wallets) {
  const priority = ['Polkadot.js'];
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

  await new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', handleAnnouncement);
      // Add legacy providers after EIP-6963 so icons from EIP-6963 take priority
      appendLegacyProviders(walletMap);
      appendSubstrateProviders(walletMap);
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
      appendLegacyProviders(walletMap);
      appendSubstrateProviders(walletMap);
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

  if (typeof selection === 'object' && (selection.provider || selection.source)) {
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

  if (String(selection).includes('substrate:polkadot-js') && window.injectedWeb3?.['polkadot-js']) {
    return normalizeSubstrateWallet('polkadot-js', window.injectedWeb3['polkadot-js']);
  }

  return null;
}
