import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  ChevronLeft,
  Clock,
  Database,
  ExternalLink,
  Gauge,
  Link as LinkIcon,
  Mountain,
  RefreshCw,
  Route,
} from 'lucide-react';
import { UserProfile } from '../types';
import { cn } from '../lib/utils';
import {
  buildStravaHealthMetricCards,
  getStravaHealthSummary,
} from '../services/stravaHealthMetricsService';

interface HealthMetricsViewProps {
  profile: UserProfile;
  onBack: () => void;
  onConnectStrava: () => Promise<unknown>;
  onSyncStrava: () => Promise<void>;
  onOpenStrava: () => void;
}

const stravaIconMap: Record<string, React.ReactNode> = {
  data_source: <Database size={20} className="text-orange-300" />,
  runs_28_days: <Activity size={20} className="text-orange-300" />,
  distance_28_days: <Route size={20} className="text-blue-300" />,
  time_running: <Clock size={20} className="text-emerald-300" />,
  elevation_gain: <Mountain size={20} className="text-yellow-300" />,
  training_load: <Gauge size={20} className="text-violet-300" />,
  last_sync: <RefreshCw size={20} className="text-zinc-300" />,
};

function getSafeErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function HealthMetricsView({
  profile,
  onBack,
  onConnectStrava,
  onSyncStrava,
  onOpenStrava,
}: HealthMetricsViewProps) {
  const [isConnectingStrava, setIsConnectingStrava] = useState(false);
  const [isSyncingStrava, setIsSyncingStrava] = useState(false);
  const [stravaError, setStravaError] = useState<string | null>(null);

  const stravaSummary = useMemo(() => getStravaHealthSummary(profile), [profile]);
  const stravaCards = useMemo(() => buildStravaHealthMetricCards(profile), [profile]);

  const handleConnectStrava = async () => {
    setStravaError(null);
    setIsConnectingStrava(true);

    try {
      await onConnectStrava();
    } catch (error) {
      console.error('Strava health metrics connection error:', error);
      setStravaError(getSafeErrorMessage(error, 'Strava connection unavailable'));
    } finally {
      setIsConnectingStrava(false);
    }
  };

  const handleSyncStrava = async () => {
    setStravaError(null);
    setIsSyncingStrava(true);

    try {
      await onSyncStrava();
    } catch (error) {
      console.error('Strava health metrics sync error:', error);
      const message = getSafeErrorMessage(error, 'Unable to sync Strava.');
      setStravaError(/401|Reconnect Strava|STRAVA_RECONNECT_REQUIRED/i.test(message) ? 'Reconnect Strava' : message);
    } finally {
      setIsSyncingStrava(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col max-w-md mx-auto w-full">
      <header className="p-6 flex items-center gap-4 border-b border-zinc-900">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800 hover:bg-zinc-800 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-light tracking-tight">Health Metrics</h1>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">
            {stravaSummary.isConnected ? 'Strava active source' : 'Strava not connected'}
          </p>
        </div>
        {stravaSummary.isConnected ? (
          <button
            type="button"
            onClick={handleSyncStrava}
            disabled={isSyncingStrava}
            aria-label="Sync Strava"
            className={cn(
              "w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800 hover:bg-zinc-800 transition-colors disabled:opacity-60 disabled:cursor-wait",
              isSyncingStrava && "animate-spin"
            )}
          >
            <RefreshCw size={18} className="text-zinc-400" />
          </button>
        ) : (
          <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800">
            <Activity size={20} className="text-zinc-400" />
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24">
        {!stravaSummary.isConnected ? (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900 rounded-3xl p-6 border border-orange-400/20 space-y-5"
          >
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-orange-400/10 flex items-center justify-center border border-orange-400/20">
                <LinkIcon size={24} className="text-orange-300" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-light">Connect Strava for Health Metrics</h2>
                <p className="text-xs leading-relaxed text-zinc-400">
                  Jogga uses your Strava runs to calculate readiness, volume, consistency, and training load.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleConnectStrava}
              disabled={isConnectingStrava}
              className="w-full py-4 rounded-2xl bg-zinc-100 text-zinc-950 text-xs font-bold hover:bg-white transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait"
            >
              {isConnectingStrava ? (
                <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <LinkIcon size={16} />
              )}
              {isConnectingStrava ? 'Opening Strava...' : 'Connect Strava'}
            </button>

            {stravaError && (
              <p role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                {stravaError}
              </p>
            )}
          </motion.section>
        ) : (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 space-y-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-orange-300 font-bold">Primary Source</p>
                <h2 className="text-lg font-light">Strava run data</h2>
                <p className="text-xs leading-relaxed text-zinc-500">
                  Track your run in Strava. Come back to Jogga for readiness, volume, and training-load coaching.
                </p>
              </div>
              <div className="px-3 py-1 rounded-full bg-orange-400/10 text-orange-300 text-[10px] font-bold uppercase tracking-widest">
                Active
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onOpenStrava}
                className="py-3 rounded-2xl bg-zinc-800 text-xs font-bold hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
              >
                <ExternalLink size={16} />
                Open Strava
              </button>
              <button
                type="button"
                onClick={handleSyncStrava}
                disabled={isSyncingStrava}
                className="py-3 rounded-2xl bg-zinc-100 text-zinc-950 text-xs font-bold hover:bg-white transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait"
              >
                {isSyncingStrava ? (
                  <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                Sync Strava
              </button>
            </div>

            {!stravaSummary.hasRecentRuns && (
              <p role="status" className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-xs leading-relaxed text-yellow-100">
                No recent runs found. Track your next run in Strava, then sync.
              </p>
            )}

            {stravaError && (
              <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200 space-y-3">
                <p>{stravaError}</p>
                {stravaError === 'Reconnect Strava' && (
                  <button
                    type="button"
                    onClick={handleConnectStrava}
                    disabled={isConnectingStrava}
                    className="w-full py-3 rounded-2xl bg-red-100 text-red-950 font-bold disabled:opacity-60 disabled:cursor-wait"
                  >
                    Reconnect Strava
                  </button>
                )}
              </div>
            )}
          </motion.section>
        )}

        {stravaSummary.isConnected && (
          <div className="grid grid-cols-1 gap-4">
            {stravaCards.map((card, index) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-zinc-950 flex items-center justify-center border border-zinc-800">
                    {stravaIconMap[card.id] || <Activity size={20} />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium">{card.title}</h3>
                    <p className="text-[8px] uppercase tracking-widest text-zinc-600 font-bold">
                      Strava · {card.updatedAt ? `Updated ${new Date(card.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not synced'}
                    </p>
                  </div>
                </div>

                <div className="flex items-baseline gap-2">
                  <div className="text-4xl font-light tracking-tighter">{card.value}</div>
                  {card.unit && <div className="text-xs text-zinc-500 font-medium">{card.unit}</div>}
                </div>
                <p className="text-xs leading-relaxed text-zinc-500">{card.detail}</p>
              </motion.div>
            ))}
          </div>
        )}

        <div className="p-4 bg-zinc-900/30 rounded-2xl border border-zinc-800/50 text-center">
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">
            Strava read-only · no posting · no social feed
          </p>
        </div>
      </div>
    </div>
  );
}
