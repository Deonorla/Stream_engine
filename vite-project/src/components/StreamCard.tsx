import { useState, useEffect, useRef } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Coins } from 'lucide-react';
import { paymentTokenSymbol } from '../contactInfo';

// Animated Counter for real-time balance
const AnimatedBalance = ({ value, decimals = 6 }) => {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayValue(prev => {
        const diff = value - prev;
        if (Math.abs(diff) < 0.000001) return value;
        return prev + diff * 0.1;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [value]);

  return <span className="font-mono">{displayValue.toFixed(decimals)}</span>;
};

// SVG Progress Ring
const ProgressRing = ({ progress, size = 80, strokeWidth = 6, status = 'active' }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  const colors = {
    active: { stroke: 'url(#activeGradient)', glow: 'rgba(59, 130, 246, 0.3)' },
    low: { stroke: 'url(#warningGradient)', glow: 'rgba(245, 158, 11, 0.3)' },
    expired: { stroke: '#6b7280', glow: 'none' },
  };

  const color = colors[status] || colors.active;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <linearGradient id="activeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <linearGradient id="warningGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 0.5s ease',
            filter: color.glow !== 'none' ? `drop-shadow(0 0 6px ${color.glow})` : 'none'
          }}
        />
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-white">{Math.round(progress)}%</span>
        <span className="text-[10px] text-white/50">complete</span>
      </div>
    </div>
  );
};

// Status Badge
const StatusBadge = ({ status }) => {
  const badges = {
    active: { label: 'Active', Icon: CheckCircle, class: 'inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2.5 py-0.5', animate: true },
    low: { label: 'Low Balance', Icon: AlertTriangle, class: 'chip-warning', animate: false },
    expired: { label: 'Completed', Icon: CheckCircle, class: 'chip', animate: false },
    cancelled: { label: 'Cancelled', Icon: XCircle, class: 'chip-error', animate: false },
  };

  const badge = badges[status] || badges.active;
  const IconComponent = badge.Icon;

  return (
    <span className={badge.class}>
      <IconComponent className={`w-3 h-3 ${badge.animate ? 'animate-pulse' : ''}`} />
      {badge.label}
    </span>
  );
};

// Confirmation Modal
const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, variant = 'danger' }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl">
        <h3 className="text-lg font-headline font-black text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
        <div className="mt-6 flex gap-3">
          <button className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-colors" onClick={onCancel}>Cancel</button>
          <button
            className={`flex-1 px-4 py-2.5 font-semibold rounded-xl text-sm text-white transition-colors ${variant === 'danger' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}`}
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default function StreamCard({ stream, variant, formatEth, onWithdraw, onCancel }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showConfirm, setShowConfirm] = useState(null);
  const [liveClaimable, setLiveClaimable] = useState(0);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const nowSec = Math.floor(Date.now() / 1000);
  const elapsed = Math.max(0, Math.min(nowSec, stream.stopTime) - stream.startTime);
  const duration = Math.max(1, stream.stopTime - stream.startTime);
  const progressPct = Math.min(100, (elapsed / duration) * 100);

  const getStatus = () => {
    if (!stream.isActive) return progressPct >= 100 ? 'expired' : 'cancelled';
    const remainingPct = 100 - progressPct;
    if (remainingPct < 10) return 'low';
    return 'active';
  };

  const status = getStatus();

  useEffect(() => {
    if (status !== 'active') return;
    const flowRate = parseFloat(formatEth(stream.flowRate)) || 0;
    const withdrawn = parseFloat(formatEth(stream.amountWithdrawn ?? 0n)) || 0;
    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const streamed = Math.min(now - stream.startTime, duration) * flowRate;
      setLiveClaimable(Math.max(0, streamed - withdrawn));
    }, 100);
    return () => clearInterval(interval);
  }, [stream, status, formatEth, duration]);

  const handleAction = (action) => setShowConfirm(action);

  const confirmAction = async () => {
    const action = showConfirm;
    setShowConfirm(null);
    if (action === 'withdraw') {
      setIsWithdrawing(true);
      try { await onWithdraw?.(stream.id); } finally { setIsWithdrawing(false); }
    }
    if (action === 'cancel') onCancel?.(stream.id);
  };

  const timeRemaining = Math.max(0, duration - elapsed);
  const hoursLeft = Math.floor(timeRemaining / 3600);
  const minsLeft = Math.floor((timeRemaining % 3600) / 60);

  return (
    <>
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-label font-bold uppercase tracking-widest text-slate-400">
                {variant === 'incoming' ? 'Incoming' : 'Outgoing'}
              </span>
              <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 rounded-lg px-2 py-0.5">ID: {stream.id}</span>
              <StatusBadge status={status} />
            </div>
            <div className="text-sm text-slate-500 font-mono truncate max-w-[220px]">
              {variant === 'incoming'
                ? `From: ${stream.sender?.slice(0, 8)}…${stream.sender?.slice(-6)}`
                : `To: ${stream.recipient?.slice(0, 8)}…${stream.recipient?.slice(-6)}`}
            </div>
          </div>

          {/* Claimable (incoming only) */}
          {variant === 'incoming' && status === 'active' && (
            <div className="text-right shrink-0">
              <div className="text-[10px] font-label uppercase tracking-widest text-slate-400 mb-0.5">Claimable</div>
              <div className="text-xl font-headline font-black text-emerald-600">
                <AnimatedBalance value={liveClaimable} />
              </div>
              <div className="text-xs text-slate-400">{paymentTokenSymbol}</div>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-400 mb-1.5">
            <span>{Math.round(progressPct)}% streamed</span>
            <span>{hoursLeft}h {minsLeft}m left</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                status === 'active' ? 'bg-gradient-to-r from-blue-500 to-purple-500' :
                status === 'low' ? 'bg-amber-400' : 'bg-slate-300'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Amount + rate */}
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="text-2xl font-headline font-black text-slate-900">
              {formatEth(stream.totalAmount)}
              <span className="text-base font-body font-normal text-slate-400 ml-1">{paymentTokenSymbol}</span>
            </div>
            <div className="text-xs text-slate-400 font-mono mt-0.5">
              {formatEth(stream.flowRate)} {paymentTokenSymbol}/sec
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? '▲ Less details' : '▼ More details'}
          </button>
          <div className="flex gap-2">
            {variant === 'incoming' && status === 'active' && (
              <button
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
                onClick={() => handleAction('withdraw')}
                disabled={isWithdrawing}
              >
                {isWithdrawing
                  ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Claiming...</>
                  : <><Coins className="w-3.5 h-3.5" /> Withdraw</>}
              </button>
            )}
            {status === 'active' && (
              <button
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold rounded-xl transition-colors"
                onClick={() => handleAction('cancel')}
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[10px] font-label uppercase tracking-widest text-slate-400 mb-0.5">Start</div>
              <div className="font-mono text-slate-600 text-xs">{new Date(stream.startTime * 1000).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] font-label uppercase tracking-widest text-slate-400 mb-0.5">End</div>
              <div className="font-mono text-slate-600 text-xs">{new Date(stream.stopTime * 1000).toLocaleString()}</div>
            </div>
            {stream.amountWithdrawn > 0n && (
              <div className="col-span-2">
                <div className="text-[10px] font-label uppercase tracking-widest text-slate-400 mb-0.5">Already Claimed</div>
                <div className="font-mono text-slate-600 text-xs">{formatEth(stream.amountWithdrawn)} {paymentTokenSymbol}</div>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={showConfirm !== null}
        title={showConfirm === 'withdraw' ? 'Confirm Withdrawal' : 'Cancel Stream'}
        message={
          showConfirm === 'withdraw'
            ? `Withdraw all claimable funds from Stream #${stream.id}?`
            : `This will permanently cancel Stream #${stream.id}. Remaining funds will be returned.`
        }
        onConfirm={confirmAction}
        onCancel={() => setShowConfirm(null)}
        variant={showConfirm === 'cancel' ? 'danger' : 'primary'}
      />
    </>
  );
}
