import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, User, Save, Target, Calendar, Activity, LogOut, Sparkles, Zap, CreditCard } from 'lucide-react';
import { MarathonReadyingProfile, UserProfile } from '../types';
import { cn } from '../lib/utils';
import { formatMonthYear, todayISO } from '../lib/date';

interface ProfileViewProps {
  profile: UserProfile;
  onBack: () => void;
  onSave: (updatedProfile: UserProfile) => void;
  onRegeneratePlan: () => void;
  onLogout: () => void;
  onInstall?: () => void;
  onManageSubscription?: () => Promise<void>;
  marathonReadying?: MarathonReadyingProfile;
}

export default function ProfileView({ profile, onBack, onSave, onRegeneratePlan, onLogout, onInstall, onManageSubscription, marathonReadying }: ProfileViewProps) {
  const [editedProfile, setEditedProfile] = useState<UserProfile>({ ...profile });
  const [isSaving, setIsSaving] = useState(false);
  const [isManagingBilling, setIsManagingBilling] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const memberSince = formatMonthYear(profile.createdAt || profile.subscriptionVerifiedAt || todayISO());
  const canManageBilling = Boolean(onManageSubscription && (profile.isUnlocked || profile.stripeCustomerId));
  const subscriptionStatus = profile.subscriptionStatus ? profile.subscriptionStatus.replace(/_/g, ' ') : 'active';

  const handleSave = () => {
    setIsSaving(true);
    // Simulate a brief delay for UX
    setTimeout(() => {
      onSave(editedProfile);
      setIsSaving(false);
    }, 500);
  };

  const handleManageBilling = async () => {
    if (!onManageSubscription || isManagingBilling) return;

    setBillingError(null);
    setIsManagingBilling(true);
    try {
      await onManageSubscription();
    } catch (error) {
      console.error('Billing portal error:', error);
      setBillingError(error instanceof Error ? error.message : 'Unable to open billing settings.');
      setIsManagingBilling(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col max-w-md mx-auto w-full relative">
      {/* Header */}
      <div className="p-6 flex items-center justify-between border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-10">
        <button onClick={onBack} className="p-2 hover:bg-zinc-900 rounded-full transition-colors">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Your Profile</h1>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="p-2 text-zinc-100 hover:text-white transition-colors disabled:opacity-50"
        >
          {isSaving ? (
            <div className="w-5 h-5 border-2 border-zinc-100 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save size={24} />
          )}
        </button>
      </div>

      <div className="flex-1 p-6 space-y-8 pb-32">
        {/* Avatar Section */}
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-24 h-24 rounded-full bg-zinc-900 border-2 border-zinc-800 flex items-center justify-center relative group overflow-hidden">
            <User size={48} className="text-zinc-700" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer">
              <span className="text-[10px] font-bold uppercase tracking-widest">Change</span>
            </div>
          </div>
          <div className="text-center">
            <input 
              type="text"
              value={editedProfile.name}
              onChange={(e) => setEditedProfile({ ...editedProfile, name: e.target.value })}
              className="bg-transparent text-2xl font-light text-center focus:outline-none focus:border-b border-zinc-800 w-full"
            />
          </div>
        </div>

        {marathonReadying && (
          <section className="rounded-3xl border border-yellow-400/20 bg-zinc-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-400">
                <Sparkles size={16} className="text-yellow-400" />
                <h2 className="text-[10px] font-bold uppercase tracking-normal">Marathon Readying</h2>
              </div>
              <span className="rounded-full bg-yellow-400/10 px-3 py-1 text-xs font-bold text-yellow-200">
                Level {marathonReadying.level}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-yellow-400 transition-all duration-500"
                style={{ width: `${marathonReadying.progressPercent}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-sm font-medium">{marathonReadying.totalPoints}</div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Total</div>
              </div>
              <div>
                <div className="text-sm font-medium">{marathonReadying.usagePoints}</div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Usage</div>
              </div>
              <div>
                <div className="text-sm font-medium">{marathonReadying.readinessPoints}</div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Readying</div>
              </div>
            </div>
          </section>
        )}

        {/* Training Goals */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-zinc-500">
            <Target size={14} />
            <h2 className="text-[10px] font-bold uppercase tracking-widest">Training Goals</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['5k', '10k', 'half-marathon', 'marathon', 'fitness'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setEditedProfile({ ...editedProfile, goalType: type })}
                className={cn(
                  "py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all",
                  editedProfile.goalType === type
                    ? "bg-zinc-100 text-zinc-900 border-zinc-100"
                    : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700"
                )}
              >
                {type.replace('-', ' ')}
              </button>
            ))}
          </div>
          <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800/50 space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500">Goal Date</label>
            <input 
              type="date"
              value={editedProfile.goalDate}
              min={todayISO()}
              onChange={(e) => setEditedProfile({ ...editedProfile, goalDate: e.target.value })}
              className="w-full bg-transparent text-lg font-medium outline-none"
            />
          </div>
        </section>

        {/* Preferences */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-zinc-500">
            <Activity size={14} />
            <h2 className="text-[10px] font-bold uppercase tracking-widest">Preferences</h2>
          </div>
          <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800/50 space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500">Weekly Mileage Preference (km)</label>
            <input 
              type="number"
              value={editedProfile.weeklyMileagePreference}
              onChange={(e) => setEditedProfile({ ...editedProfile, weeklyMileagePreference: parseInt(e.target.value) })}
              className="w-full bg-transparent text-lg font-medium outline-none"
            />
          </div>
        </section>

        {/* Training Days */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-zinc-500">
            <Calendar size={14} />
            <h2 className="text-[10px] font-bold uppercase tracking-widest">Preferred Training Days</h2>
          </div>
          <div className="flex justify-between gap-2">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => {
              const dayIndex = (i + 1) % 7; // Convert to 0-6 (Sun is 0)
              const isSelected = editedProfile.preferredDays.includes(dayIndex);
              return (
                <button
                  key={i}
                  onClick={() => {
                    const newDays = isSelected
                      ? editedProfile.preferredDays.filter(d => d !== dayIndex)
                      : [...editedProfile.preferredDays, dayIndex].sort();
                    setEditedProfile({ ...editedProfile, preferredDays: newDays });
                  }}
                  className={cn(
                    "w-10 h-10 rounded-full text-xs font-bold transition-all border",
                    isSelected 
                      ? "bg-zinc-100 text-zinc-900 border-zinc-100" 
                      : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700"
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </section>

        {/* Experience */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-zinc-500">
            <Activity size={14} />
            <h2 className="text-[10px] font-bold uppercase tracking-widest">Experience Level</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['beginner', 'intermediate', 'advanced'] as const).map((level) => (
              <button
                key={level}
                onClick={() => setEditedProfile({ ...editedProfile, experienceLevel: level })}
                className={cn(
                  "py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all",
                  editedProfile.experienceLevel === level
                    ? "bg-zinc-100 text-zinc-900 border-zinc-100"
                    : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700"
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </section>

        {/* Plan Management */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-zinc-500">
            <Calendar size={14} />
            <h2 className="text-[10px] font-bold uppercase tracking-widest">Plan Management</h2>
          </div>
          <button 
            onClick={onRegeneratePlan}
            className="w-full bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4 flex items-center justify-between group hover:bg-zinc-900/50 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover:text-zinc-100 transition-colors">
                <Sparkles size={20} />
              </div>
              <div className="text-left">
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-100">Regenerate Plan</div>
                <div className="text-[8px] text-zinc-500 uppercase tracking-widest">Update schedule based on new goals</div>
              </div>
            </div>
            <ChevronRight size={16} className="text-zinc-700 group-hover:text-zinc-500 transition-colors" />
          </button>

          {canManageBilling && (
            <button
              onClick={handleManageBilling}
              disabled={isManagingBilling}
              className="w-full bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4 flex items-center justify-between group hover:bg-zinc-900/50 transition-all disabled:opacity-60 disabled:cursor-wait"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover:text-zinc-100 transition-colors shrink-0">
                  {isManagingBilling ? (
                    <div className="w-5 h-5 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <CreditCard size={20} />
                  )}
                </div>
                <div className="text-left min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-100">Manage Subscription</div>
                  <div className="text-[8px] text-zinc-500 uppercase tracking-widest truncate">Cancel trial or plan</div>
                </div>
              </div>
              <ChevronRight size={16} className="text-zinc-700 group-hover:text-zinc-500 transition-colors shrink-0" />
            </button>
          )}

          {billingError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-[10px] leading-relaxed text-red-300">
              {billingError}
            </div>
          )}

          {onInstall && (
            <button 
              onClick={onInstall}
              className="w-full bg-zinc-100 text-zinc-900 rounded-2xl p-4 flex items-center justify-between group hover:bg-white transition-all shadow-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-100">
                  <Zap size={20} fill="currentColor" />
                </div>
                <div className="text-left">
                  <div className="text-[10px] font-bold uppercase tracking-widest">Install Jogga App</div>
                  <div className="text-[8px] text-zinc-500 uppercase tracking-widest">Add to your home screen for instant access</div>
                </div>
              </div>
              <ChevronRight size={16} className="text-zinc-400" />
            </button>
          )}
        </section>

        {/* Logout Section */}
        <section className="pt-4 space-y-4">
          {/* Logout Button */}
          <button 
            onClick={onLogout}
            className="w-full py-4 rounded-2xl bg-red-500/10 text-red-500 text-[10px] font-bold uppercase tracking-widest border border-red-500/20 hover:bg-red-500/20 transition-all flex items-center justify-center gap-2"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </section>
      </div>

      {/* Footer Info */}
      <div className="p-8 text-center space-y-2">
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Member since {memberSince}</p>
        <p className="text-[10px] text-zinc-700">Jogga Subscriber - {subscriptionStatus}</p>
      </div>
    </div>
  );
}
