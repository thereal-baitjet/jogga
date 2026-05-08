import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Activity, TrendingUp, TrendingDown, Minus, Heart, Moon, Wind, Weight, RefreshCw, Link as LinkIcon } from 'lucide-react';
import { HealthMetric, UserProfile } from '../types';
import { cn } from '../lib/utils';

interface HealthMetricsViewProps {
  metrics: HealthMetric[];
  profile: UserProfile;
  onBack: () => void;
  onConnectGoogleHealth: () => Promise<unknown>;
  onSync: () => Promise<void>;
}

const iconMap: Record<string, React.ReactNode> = {
  hr: <Heart size={20} className="text-red-500" />,
  sleep: <Moon size={20} className="text-indigo-500" />,
  vo2max: <Wind size={20} className="text-blue-500" />,
  weight: <Weight size={20} className="text-zinc-400" />,
};

export default function HealthMetricsView({ metrics, profile, onBack, onConnectGoogleHealth, onSync }: HealthMetricsViewProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [connectionConfirmed, setConnectionConfirmed] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const isConnected = profile.isHealthConnected || connectionConfirmed;

  const handleConnectGoogle = async () => {
    setConnectError(null);
    setIsConnecting(true);

    try {
      await onConnectGoogleHealth();
      setConnectionConfirmed(true);
    } catch (error) {
      console.error('Error connecting Google Health:', error);
      setConnectError(error instanceof Error ? error.message : 'Unable to connect Google Health.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSync = async () => {
    setConnectError(null);
    setIsSyncing(true);
    try {
      await onSync();
    } catch (error) {
      console.error('Health sync error:', error);
      setConnectError(error instanceof Error ? error.message : 'Unable to sync Google Health.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col max-w-md mx-auto w-full">
      {/* Header */}
      <header className="p-6 flex items-center gap-4 border-b border-zinc-900">
        <button 
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800 hover:bg-zinc-800 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-light tracking-tight">Health Metrics</h1>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">
            {isConnected ? `Connected to ${profile.healthProvider || 'google'}` : 'Not Connected'}
          </p>
        </div>
        <div className="flex gap-2">
          {isConnected && (
            <button 
              onClick={handleSync}
              disabled={isSyncing}
              className={cn(
                "w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800 hover:bg-zinc-800 transition-colors",
                isSyncing && "animate-spin"
              )}
            >
              <RefreshCw size={18} className="text-zinc-400" />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800">
            <Activity size={20} className="text-zinc-400" />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24">
        {/* Connection Banner */}
        {!isConnected && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20">
                <LinkIcon size={24} className="text-yellow-500" />
              </div>
              <div>
                <h3 className="text-sm font-medium">Connect Health Data</h3>
                <p className="text-xs text-zinc-500">Sync supported Google Health metrics</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={handleConnectGoogle}
                disabled={isConnecting}
                className="py-3 rounded-2xl bg-zinc-800 text-xs font-bold hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait"
              >
                {isConnecting ? (
                  <div className="w-4 h-4 border-2 border-zinc-100 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" referrerPolicy="no-referrer" />
                )}
                {isConnecting ? 'Connecting...' : 'Google Health'}
              </button>
            </div>
            {connectError && (
              <p role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                {connectError}
              </p>
            )}
          </motion.div>
        )}
        {isConnected && connectError && (
          <p role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-200">
            {connectError}
          </p>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 gap-4">
          {metrics.map((metric, i) => (
            <motion.div
              key={metric.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-zinc-950 flex items-center justify-center border border-zinc-800">
                    {iconMap[metric.type] || <Activity size={20} />}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">{metric.label}</h3>
                    <p className="text-[8px] uppercase tracking-widest text-zinc-600 font-bold">
                      Updated {new Date(metric.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <div className={cn(
                  "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1",
                  metric.trend === 'up' ? "bg-green-500/10 text-green-500" : 
                  metric.trend === 'down' ? "bg-red-500/10 text-red-500" : 
                  "bg-zinc-800 text-zinc-400"
                )}>
                  {metric.trend === 'up' && <TrendingUp size={12} />}
                  {metric.trend === 'down' && <TrendingDown size={12} />}
                  {metric.trend === 'stable' && <Minus size={12} />}
                  {metric.trend}
                </div>
              </div>

              <div className="flex items-baseline gap-2">
                <div className="text-4xl font-light tracking-tighter">{metric.value}</div>
                <div className="text-xs text-zinc-500 font-medium">{metric.unit}</div>
              </div>

              {/* Simple Sparkline (Mock) */}
              <div className="h-12 flex items-end gap-1 pt-2">
                {metric.history.map((h, idx) => {
                  const max = Math.max(...metric.history.map(d => d.value));
                  const min = Math.min(...metric.history.map(d => d.value));
                  const height = max === min ? 50 : ((h.value - min) / (max - min)) * 100;
                  return (
                    <div 
                      key={idx}
                      className="flex-1 bg-zinc-800 rounded-t-sm hover:bg-zinc-700 transition-colors relative group"
                      style={{ height: `${Math.max(10, height)}%` }}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-zinc-800 text-[8px] px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                        {h.value}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Sync Info */}
        <div className="p-4 bg-zinc-900/30 rounded-2xl border border-zinc-800/50 text-center">
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">
            Last synced: Today, 9:30 AM
          </p>
        </div>
      </div>
    </div>
  );
}
