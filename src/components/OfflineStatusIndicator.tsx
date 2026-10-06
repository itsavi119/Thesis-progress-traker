import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { offlineStorage, type SyncState } from '../services/offlineStorage.js';
import { api } from '../services/api.js';

export const OfflineStatusIndicator: React.FC = () => {
  const [syncState, setSyncState] = useState<SyncState>('synced');
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isFlushing, setIsFlushing] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = offlineStorage.subscribe((state, count) => {
      setSyncState(state);
      setPendingCount(count);
    });

    // Auto-flush queue when coming back online
    const handleOnline = async () => {
      setIsFlushing(true);
      await offlineStorage.flushSyncQueue(api);
      setIsFlushing(false);
    };

    window.addEventListener('online', handleOnline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const handleManualSync = async () => {
    if (isFlushing) return;
    setIsFlushing(true);
    await offlineStorage.flushSyncQueue(api);
    setIsFlushing(false);
  };

  if (syncState === 'offline') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">
        <CloudOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <span>Offline — changes will sync when you&apos;re online</span>
        {pendingCount > 0 && (
          <span className="px-1.5 py-0.2 bg-amber-200 text-amber-900 rounded-full text-[10px] font-bold">
            {pendingCount}
          </span>
        )}
      </div>
    );
  }

  if (syncState === 'syncing' || isFlushing) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-semibold">
        <RefreshCw className="w-3.5 h-3.5 text-blue-600 shrink-0 animate-spin" />
        <span>Syncing changes...</span>
      </div>
    );
  }

  if (syncState === 'all_synced') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>All changes synced</span>
      </div>
    );
  }

  // Default Synced (or manual trigger if pending items exist)
  if (pendingCount > 0) {
    return (
      <button
        onClick={handleManualSync}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-semibold cursor-pointer transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        <span>Sync {pendingCount} pending</span>
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200 text-[11px] font-medium">
      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
      <span>Synced</span>
    </div>
  );
};
