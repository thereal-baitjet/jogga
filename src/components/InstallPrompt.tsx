import React from 'react';
import { Zap, X } from 'lucide-react';

interface InstallPromptProps {
  onInstall: () => void;
  onDismiss: () => void;
}

export default function InstallPrompt({ onInstall, onDismiss }: InstallPromptProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
        <div className="flex justify-between items-start">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-100">
            <Zap size={24} fill="currentColor" />
          </div>
          <button onClick={onDismiss} className="text-zinc-500 hover:text-zinc-300">
            <X size={20} />
          </button>
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Install Jogga</h2>
          <p className="text-zinc-400 text-sm mt-1">Add Jogga to your home screen for a faster, app-like experience.</p>
        </div>
        <button 
          onClick={onInstall}
          className="w-full bg-zinc-100 text-zinc-900 font-bold py-3 rounded-xl hover:bg-white transition-all"
        >
          Install App
        </button>
      </div>
    </div>
  );
}
