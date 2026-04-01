import { useState, useMemo } from 'react';
import StreamCard from './StreamCard.tsx';
import { Calendar, Coins, Zap, Search, Inbox, Pause, CheckCircle, Ban, Plus, Loader2 } from 'lucide-react';

// Filter Tab Component
const FilterTab = ({ label, count, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-2xl text-sm font-semibold transition-all ${
      active
        ? 'bg-blue-600 text-white shadow-sm'
        : 'bg-white text-slate-500 hover:text-slate-700 border border-slate-200'
    }`}
  >
    {label}
    {count > 0 && (
      <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs font-bold ${
        active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
      }`}>
        {count}
      </span>
    )}
  </button>
);

// Sort Dropdown
const SortDropdown = ({ value, onChange }) => {
  const options = [
    { value: 'date-desc', label: 'Newest First', Icon: Calendar },
    { value: 'date-asc', label: 'Oldest First', Icon: Calendar },
    { value: 'amount-desc', label: 'Highest Amount', Icon: Coins },
    { value: 'amount-asc', label: 'Lowest Amount', Icon: Coins },
    { value: 'rate-desc', label: 'Highest Rate', Icon: Zap },
  ];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-white border border-slate-200 rounded-2xl px-4 py-2 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value} className="bg-surface-800">
          {opt.label}
        </option>
      ))}
    </select>
  );
};

// Search Input
const SearchInput = ({ value, onChange }) => (
  <div className="relative">
    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
    <input
      type="text"
      placeholder="Search by ID or address..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-white border-none rounded-2xl pl-12 pr-6 py-4 focus:ring-2 focus:ring-blue-200 focus:outline-none text-sm text-slate-700 placeholder:text-slate-400"
    />
  </div>
);

// Empty State Component
const EmptyState = ({ filter }) => {
  const messages = {
    all: { Icon: Inbox, title: 'No Streams Yet', subtitle: 'Create your first stream to get started' },
    active: { Icon: Pause, title: 'No Active Streams', subtitle: 'All streams are paused or completed' },
    completed: { Icon: CheckCircle, title: 'No Completed Streams', subtitle: 'Completed streams will appear here' },
    cancelled: { Icon: Ban, title: 'No Cancelled Streams', subtitle: 'Cancelled streams will appear here' },
  };

  const msg = messages[filter] || messages.all;
  const IconComponent = msg.Icon;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <IconComponent className="w-16 h-16 text-white/40 mb-4" />
      <h3 className="text-lg font-semibold text-white/80">{msg.title}</h3>
      <p className="text-sm text-white/50 mt-1">{msg.subtitle}</p>
      {filter === 'all' && (
        <button className="btn-primary mt-6 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Create Stream
        </button>
      )}
    </div>
  );
};

// Pagination Component
const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="btn-ghost px-3 py-1.5 disabled:opacity-30"
      >
        ← Prev
      </button>

      {[...Array(totalPages)].map((_, i) => (
        <button
          key={i}
          onClick={() => onPageChange(i + 1)}
          className={`
            w-8 h-8 rounded-lg text-sm font-medium transition-all
            ${currentPage === i + 1
              ? 'bg-flowpay-500 text-white'
              : 'text-white/60 hover:bg-white/10'}
          `}
        >
          {i + 1}
        </button>
      ))}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="btn-ghost px-3 py-1.5 disabled:opacity-30"
      >
        Next →
      </button>
    </div>
  );
};

export default function StreamList({
  title,
  emptyText = 'No streams found.',
  isLoading,
  streams,
  variant,
  formatEth,
  onWithdraw,
  onCancel
}) {
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date-desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 3;

  // Filter streams
  const filteredStreams = useMemo(() => {
    return streams.filter(s => {
      // Status filter
      const now = Math.floor(Date.now() / 1000);
      const isExpired = now >= Number(s.stopTime);
      const isCompleted = isExpired; // past stopTime = completed regardless of isActive flag
      const isActive = s.isActive && !isExpired;
      const isCancelled = !s.isActive && !isExpired;

      if (filter === 'active' && !isActive) return false;
      if (filter === 'completed' && !isCompleted) return false;
      if (filter === 'cancelled' && !isCancelled) return false;

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesId = s.id?.toString().includes(query);
        const matchesRecipient = s.recipient?.toLowerCase().includes(query);
        const matchesSender = s.sender?.toLowerCase().includes(query);
        if (!matchesId && !matchesRecipient && !matchesSender) return false;
      }

      return true;
    });
  }, [streams, filter, searchQuery]);

  // Sort streams
  const sortedStreams = useMemo(() => {
    return [...filteredStreams].sort((a, b) => {
      switch (sortBy) {
        case 'date-desc': return b.startTime - a.startTime;
        case 'date-asc': return a.startTime - b.startTime;
        case 'amount-desc': return Number(b.totalAmount - a.totalAmount);
        case 'amount-asc': return Number(a.totalAmount - b.totalAmount);
        case 'rate-desc': return Number(b.flowRate - a.flowRate);
        default: return 0;
      }
    });
  }, [filteredStreams, sortBy]);

  // Pagination
  const totalPages = Math.ceil(sortedStreams.length / itemsPerPage);
  const paginatedStreams = sortedStreams.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Count by status for filter tabs
  const counts = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return {
      all: streams.length,
      active: streams.filter(s => s.isActive && now < Number(s.stopTime)).length,
      completed: streams.filter(s => now >= Number(s.stopTime)).length,
      cancelled: streams.filter(s => !s.isActive && now < Number(s.stopTime)).length,
    };
  }, [streams]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-white/90">{title}</h3>
          {isLoading && (
            <div className="flex items-center gap-1 text-xs text-white/50">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading...
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <SortDropdown value={sortBy} onChange={setSortBy} />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        <FilterTab label="All" count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterTab label="Active" count={counts.active} active={filter === 'active'} onClick={() => setFilter('active')} />
        <FilterTab label="Completed" count={counts.completed} active={filter === 'completed'} onClick={() => setFilter('completed')} />
        <FilterTab label="Cancelled" count={counts.cancelled} active={filter === 'cancelled'} onClick={() => setFilter('cancelled')} />
      </div>

      {/* Search */}
      <SearchInput value={searchQuery} onChange={setSearchQuery} />

      {/* Stream Grid */}
      {!isLoading && paginatedStreams.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="grid gap-4">
          {paginatedStreams.map((s) => (
            <StreamCard
              key={`${variant}-${s.id}`}
              stream={s}
              variant={variant}
              formatEth={formatEth}
              onWithdraw={onWithdraw}
              onCancel={onCancel}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
