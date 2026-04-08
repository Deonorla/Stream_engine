import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Filter, Building2, MapPin } from 'lucide-react';
import { PORTFOLIO_ASSETS, mapApiAssetToUiAsset } from './rwa/rwaData';
import { AssetCard, AssetDetailPortal } from '../components/AssetCard';
import RentalSessionComposer from '../components/RentalSessionComposer.tsx';
import { fetchRwaAssets } from '../services/rwaApi.js';
import { useWallet } from '../context/WalletContext';

export default function RentPage() {
  const { toast } = useWallet();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [assets, setAssets] = useState(PORTFOLIO_ASSETS);
  const [isLoading, setIsLoading] = useState(false);

  const refreshAssets = useCallback(async () => {
    try {
      setIsLoading(true);
      const liveAssets = await fetchRwaAssets();
      setAssets(
        liveAssets.length
          ? liveAssets
              .map(mapApiAssetToUiAsset)
              .filter((asset) => ['real_estate', 'land'].includes(asset.type))
          : [],
      );
    } catch (error) {
      console.error('Failed to load live rental assets:', error);
      toast.warning(
        error?.message || 'Falling back to the local rental snapshot because the live marketplace could not be loaded.',
        { title: 'Marketplace Sync Issue' },
      );
      setAssets(PORTFOLIO_ASSETS);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refreshAssets();
  }, [refreshAssets]);

  useEffect(() => {
    if (!selected) {
      return;
    }
    const nextSelected = assets.find((asset) => asset.tokenId === selected.tokenId);
    if (nextSelected) {
      setSelected(nextSelected);
    }
  }, [assets, selected]);

  const filtered = useMemo(() => assets.filter((asset) => {
    const matchesSearch = !search
      || asset.name.toLowerCase().includes(search.toLowerCase())
      || asset.location.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || asset.type === filter;
    return matchesSearch && matchesFilter;
  }), [assets, filter, search]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-12 p-4 sm:p-8 lg:p-12">
      <header className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
        <div>
          <h2 className="text-4xl font-headline font-bold tracking-tight text-on-surface">Asset Marketplace</h2>
          <p className="mt-2 font-body text-on-surface-variant">
            Browse verified real estate and land twins and stream rent directly to owners.
          </p>
        </div>
        <div className="flex w-full items-center gap-3 md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-2xl border border-slate-100 bg-white py-3 pl-12 pr-4 shadow-sm focus:ring-2 focus:ring-blue-200"
              placeholder="Search assets..."
            />
          </div>
          <div className="flex items-center gap-1 rounded-2xl border border-slate-100 bg-white p-1 shadow-sm">
            {[
              { key: 'all', Icon: Filter },
              { key: 'real_estate', Icon: Building2 },
              { key: 'land', Icon: MapPin },
            ].map(({ key, Icon }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-xl p-2 transition-colors ${
                  filter === key ? 'bg-primary text-white' : 'text-slate-400 hover:text-primary'
                }`}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="rounded-[2.5rem] border border-slate-100 bg-slate-50 p-12 text-center text-slate-400">
          Loading live Stellar rental assets...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((asset) => (
            <AssetCard key={asset.id} asset={asset} onDetails={setSelected} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full py-24 text-center text-slate-400">
              No assets match your search.
            </div>
          )}
        </div>
      )}

      <AssetDetailPortal
        selected={selected}
        onClose={() => setSelected(null)}
        renderFooter={(asset) => (
          <RentalSessionComposer
            asset={asset}
          />
        )}
      />
    </div>
  );
}
