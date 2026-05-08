import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Zap } from 'lucide-react';
import { MarathonReadyingEvent } from '../types';

interface MarathonReadyingPulseProps {
  event: MarathonReadyingEvent | null;
  onComplete: () => void;
}

export default function MarathonReadyingPulse({ event, onComplete }: MarathonReadyingPulseProps) {
  useEffect(() => {
    if (!event) return;

    const timer = window.setTimeout(onComplete, 2600);
    return () => window.clearTimeout(timer);
  }, [event, onComplete]);

  return (
    <AnimatePresence>
      {event && (
        <motion.div
          key={event.id}
          initial={{ opacity: 0, y: -24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.98 }}
          className="fixed left-4 right-4 top-5 z-[140] mx-auto max-w-md"
        >
          <div className="overflow-hidden rounded-3xl border border-yellow-400/30 bg-zinc-950/95 p-4 shadow-2xl shadow-yellow-950/40 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-zinc-950">
                <Zap size={22} fill="currentColor" />
                <motion.div
                  initial={{ scale: 0.8, opacity: 0.45 }}
                  animate={{ scale: 1.75, opacity: 0 }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  className="absolute inset-0 rounded-full border border-yellow-300"
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-yellow-200">
                  <Sparkles size={12} />
                  <span>{event.title}</span>
                </div>
                <p className="mt-1 truncate text-sm font-medium text-zinc-100">{event.message}</p>
              </div>

              <div className="shrink-0 rounded-full bg-yellow-400/10 px-3 py-2 text-sm font-bold text-yellow-100">
                +{event.points}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
