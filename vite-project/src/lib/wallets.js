import {
  isConnected as freighterIsConnected,
  requestAccess as freighterRequestAccess,
} from '@stellar/freighter-api';

function sortWallets(wallets) {
  return [...wallets].sort((left, right) => left.name.localeCompare(right.name));
}

async function detectFreighterWallet() {
  try {
    const connection = await freighterIsConnected();
    const isAvailable = Boolean(connection?.isConnected || connection?.isAllowed);

    return {
      id: 'stellar:freighter',
      type: 'stellar',
      name: 'Freighter',
      icon: '/images/freighter-icon.png',
      rdns: 'org.stellar.freighter',
      source: 'freighter',
      provider: {
        async connect() {
          const response = await freighterRequestAccess();
          if (response?.error) {
            throw new Error(response.error.message || 'Freighter access was denied.');
          }
          return response.address;
        },
      },
      description: 'Injected Stellar wallet for Soroban and payment session signing',
      isAvailable,
    };
  } catch {
    return {
      id: 'stellar:freighter',
      type: 'stellar',
      name: 'Freighter',
      icon: '/images/freighter-icon.png',
      rdns: 'org.stellar.freighter',
      source: 'freighter',
      provider: null,
      description: 'Install Freighter to use the Stellar payment flow',
      isAvailable: false,
    };
  }
}

export async function discoverInjectedWallets() {
  return sortWallets([await detectFreighterWallet()]);
}

export async function getAvailableWallets() {
  return discoverInjectedWallets();
}

export async function resolveWalletSelection(selection, wallets = []) {
  if (!selection) {
    return null;
  }

  if (typeof selection === 'object' && selection.id) {
    return selection;
  }

  const availableWallets = wallets.length ? wallets : await getAvailableWallets();
  return availableWallets.find((wallet) => wallet.id === selection || wallet.source === selection) || null;
}
