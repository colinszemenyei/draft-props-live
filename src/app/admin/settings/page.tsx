'use client';

import { useState, useEffect, useMemo } from 'react';
import AppShell from '@/components/AppShell';

interface MockScoringTier {
  label: string;
  pickStart: number;
  pickEnd: number;
  exactPick: number;
  within1: number;
  within2: number;
}

interface MockScoringConfig {
  tiers: MockScoringTier[];
  lateRoundBonus: { enabled: boolean; threshold: number; points: number };
}

interface DraftYear {
  year: number;
  lockTime: string;
  status: string;
  mockScoringConfig: MockScoringConfig;
}

const STATUSES = ['setup', 'open', 'locked', 'live', 'complete'];

const DEFAULT_MOCK_CONFIG: MockScoringConfig = {
  tiers: [
    { label: 'Picks 1-5', pickStart: 1, pickEnd: 5, exactPick: 3, within1: 1, within2: 0 },
    { label: 'Picks 6-15', pickStart: 6, pickEnd: 15, exactPick: 5, within1: 2, within2: 1 },
    { label: 'Picks 16-25', pickStart: 16, pickEnd: 25, exactPick: 7, within1: 3, within2: 1 },
    { label: 'Picks 26-32', pickStart: 26, pickEnd: 32, exactPick: 10, within1: 5, within2: 2 },
  ],
  lateRoundBonus: { enabled: true, threshold: 20, points: 2 },
};

export default function AdminSettingsPage() {
  const [years, setYears] = useState<DraftYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [newYear, setNewYear] = useState(2027);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => { loadYears(); }, []);

  async function loadYears() {
    const res = await fetch('/api/admin/year-settings');
    const data = await res.json();
    const parsed = (Array.isArray(data) ? data : []).map((y: Record<string, unknown>) => {
      let config: MockScoringConfig;
      try {
        const raw = y.mockScoringConfig
          ? (typeof y.mockScoringConfig === 'string' ? JSON.parse(y.mockScoringConfig as string) : y.mockScoringConfig)
          : null;
        // Migrate old flat config to tiered if needed
        if (raw && raw.tiers && Array.isArray(raw.tiers)) {
          config = raw;
        } else if (raw && typeof raw.exactPick === 'number') {
          // Old flat format — convert to single tier
          config = {
            tiers: [
              { label: 'All Picks', pickStart: 1, pickEnd: 32, exactPick: raw.exactPick, within1: raw.within1 || 0, within2: raw.within2 || 0 },
            ],
            lateRoundBonus: { enabled: true, threshold: raw.lateRoundBonus?.threshold || 20, points: raw.lateRoundBonus?.points || 2 },
          };
        } else {
          config = DEFAULT_MOCK_CONFIG;
        }
      } catch {
        config = DEFAULT_MOCK_CONFIG;
      }
      return { ...y, mockScoringConfig: config } as DraftYear;
    });
    setYears(parsed);
    setLoading(false);
  }

  async function updateYear(year: DraftYear) {
    await fetch('/api/admin/year-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year: year.year,
        lockTime: year.lockTime,
        status: year.status,
        mockScoringConfig: year.mockScoringConfig,
      }),
    });
    setSaveMsg('Saved!');
    setTimeout(() => setSaveMsg(''), 2000);
    loadYears();
  }

  async function createYear() {
    await fetch('/api/admin/year-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: newYear }),
    });
    loadYears();
  }

  function updateTier(yearNum: number, tierIndex: number, field: keyof MockScoringTier, value: string | number) {
    setYears(prev => prev.map(y => {
      if (y.year !== yearNum) return y;
      const tiers = [...y.mockScoringConfig.tiers];
      tiers[tierIndex] = { ...tiers[tierIndex], [field]: value };
      // Auto-update label
      if (field === 'pickStart' || field === 'pickEnd') {
        tiers[tierIndex].label = `Picks ${tiers[tierIndex].pickStart}-${tiers[tierIndex].pickEnd}`;
      }
      return { ...y, mockScoringConfig: { ...y.mockScoringConfig, tiers } };
    }));
  }

  function addTier(yearNum: number) {
    setYears(prev => prev.map(y => {
      if (y.year !== yearNum) return y;
      const tiers = [...y.mockScoringConfig.tiers];
      const lastEnd = tiers.length > 0 ? tiers[tiers.length - 1].pickEnd : 0;
      const newStart = lastEnd + 1;
      const newEnd = Math.min(newStart + 5, 32);
      tiers.push({
        label: `Picks ${newStart}-${newEnd}`,
        pickStart: newStart,
        pickEnd: newEnd,
        exactPick: 5,
        within1: 2,
        within2: 1,
      });
      return { ...y, mockScoringConfig: { ...y.mockScoringConfig, tiers } };
    }));
  }

  function removeTier(yearNum: number, tierIndex: number) {
    setYears(prev => prev.map(y => {
      if (y.year !== yearNum) return y;
      const tiers = y.mockScoringConfig.tiers.filter((_, i) => i !== tierIndex);
      return { ...y, mockScoringConfig: { ...y.mockScoringConfig, tiers } };
    }));
  }

  function updateLateBonus(yearNum: number, field: string, value: number | boolean) {
    setYears(prev => prev.map(y => {
      if (y.year !== yearNum) return y;
      return {
        ...y,
        mockScoringConfig: {
          ...y.mockScoringConfig,
          lateRoundBonus: { ...y.mockScoringConfig.lateRoundBonus, [field]: value },
        },
      };
    }));
  }

  function usePreset(yearNum: number, preset: 'flat' | 'progressive' | 'steep') {
    const configs: Record<string, MockScoringConfig> = {
      flat: {
        tiers: [
          { label: 'All Picks', pickStart: 1, pickEnd: 32, exactPick: 10, within1: 5, within2: 3 },
        ],
        lateRoundBonus: { enabled: true, threshold: 20, points: 2 },
      },
      progressive: {
        tiers: [
          { label: 'Picks 1-5', pickStart: 1, pickEnd: 5, exactPick: 3, within1: 1, within2: 0 },
          { label: 'Picks 6-15', pickStart: 6, pickEnd: 15, exactPick: 5, within1: 2, within2: 1 },
          { label: 'Picks 16-25', pickStart: 16, pickEnd: 25, exactPick: 7, within1: 3, within2: 1 },
          { label: 'Picks 26-32', pickStart: 26, pickEnd: 32, exactPick: 10, within1: 5, within2: 2 },
        ],
        lateRoundBonus: { enabled: true, threshold: 20, points: 2 },
      },
      steep: {
        tiers: [
          { label: 'Picks 1-3', pickStart: 1, pickEnd: 3, exactPick: 2, within1: 1, within2: 0 },
          { label: 'Picks 4-10', pickStart: 4, pickEnd: 10, exactPick: 5, within1: 2, within2: 0 },
          { label: 'Picks 11-20', pickStart: 11, pickEnd: 20, exactPick: 8, within1: 4, within2: 2 },
          { label: 'Picks 21-32', pickStart: 21, pickEnd: 32, exactPick: 12, within1: 6, within2: 3 },
        ],
        lateRoundBonus: { enabled: true, threshold: 25, points: 3 },
      },
    };

    setYears(prev => prev.map(y => {
      if (y.year !== yearNum) return y;
      return { ...y, mockScoringConfig: configs[preset] };
    }));
  }

  if (loading) {
    return <AppShell><div className="md:ml-48 text-muted animate-pulse py-12 text-center">Loading...</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="md:ml-48">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Settings</h1>
          {saveMsg && <span className="text-success text-sm font-semibold animate-slide-in">{saveMsg}</span>}
        </div>

        <div className="space-y-6">
          {years.map(year => (
            <YearSettings
              key={year.year}
              year={year}
              onSave={() => updateYear(year)}
              onUpdateTier={(i, f, v) => updateTier(year.year, i, f, v)}
              onAddTier={() => addTier(year.year)}
              onRemoveTier={(i) => removeTier(year.year, i)}
              onUpdateLateBonus={(f, v) => updateLateBonus(year.year, f, v)}
              onUsePreset={(p) => usePreset(year.year, p)}
              onUpdateField={(field, value) => {
                setYears(prev => prev.map(y => y.year === year.year ? { ...y, [field]: value } : y));
              }}
            />
          ))}
        </div>

        {/* Create New Year */}
        <div className="mt-8 bg-card border border-card-border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-bold text-primary mb-3">Create New Draft Year</h2>
          <div className="flex gap-3">
            <input
              type="number"
              value={newYear}
              onChange={(e) => setNewYear(parseInt(e.target.value))}
              className="bg-background border border-card-border rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:border-primary"
            />
            <button onClick={createYear} className="bg-primary hover:bg-primary-light text-white text-sm font-bold px-4 py-2 rounded-lg transition">
              Create
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function YearSettings({
  year,
  onSave,
  onUpdateTier,
  onAddTier,
  onRemoveTier,
  onUpdateLateBonus,
  onUsePreset,
  onUpdateField,
}: {
  year: DraftYear;
  onSave: () => void;
  onUpdateTier: (index: number, field: keyof MockScoringTier, value: string | number) => void;
  onAddTier: () => void;
  onRemoveTier: (index: number) => void;
  onUpdateLateBonus: (field: string, value: number | boolean) => void;
  onUsePreset: (preset: 'flat' | 'progressive' | 'steep') => void;
  onUpdateField: (field: string, value: string) => void;
}) {
  const config = year.mockScoringConfig;

  // Calculate max possible points
  const maxPoints = useMemo(() => {
    let total = 0;
    for (const tier of config.tiers) {
      const picksInTier = tier.pickEnd - tier.pickStart + 1;
      total += picksInTier * tier.exactPick;
    }
    return total;
  }, [config.tiers]);

  return (
    <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-primary">{year.year} NFL Draft</h2>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
          year.status === 'live' ? 'bg-success/20 text-success' :
          year.status === 'complete' ? 'bg-primary/10 text-primary' :
          year.status === 'locked' ? 'bg-amber-100 text-amber-700' :
          'bg-gray-100 text-muted'
        }`}>
          {year.status.toUpperCase()}
        </span>
      </div>

      {/* Draft Settings */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          ⚙️ Draft Settings
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted block mb-1">Lock Time</label>
            <input
              type="datetime-local"
              value={year.lockTime ? new Date(year.lockTime).toISOString().slice(0, 16) : ''}
              onChange={(e) => onUpdateField('lockTime', new Date(e.target.value).toISOString())}
              className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Status</label>
            <select
              value={year.status}
              onChange={(e) => onUpdateField('status', e.target.value)}
              className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Mock Draft Scoring */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            📝 Mock Draft Scoring
          </h3>
          <div className="flex gap-1.5">
            <button
              onClick={() => onUsePreset('flat')}
              className="text-[10px] px-2 py-1 rounded border border-card-border text-muted hover:border-primary hover:text-primary transition"
            >
              Flat
            </button>
            <button
              onClick={() => onUsePreset('progressive')}
              className="text-[10px] px-2 py-1 rounded border border-card-border text-muted hover:border-primary hover:text-primary transition"
            >
              Progressive
            </button>
            <button
              onClick={() => onUsePreset('steep')}
              className="text-[10px] px-2 py-1 rounded border border-card-border text-muted hover:border-primary hover:text-primary transition"
            >
              Steep
            </button>
          </div>
        </div>
        <p className="text-xs text-muted mb-4">
          Define point tiers by pick range. Later picks are harder to predict, so you can reward them more.
        </p>

        {/* Tiers */}
        <div className="space-y-3 mb-4">
          {config.tiers.map((tier, i) => (
            <div key={i} className="bg-background border border-card-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-primary">Tier {i + 1}</span>
                  <span className="text-xs text-muted">—</span>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-muted">Picks</span>
                    <input
                      type="number"
                      min="1"
                      max="32"
                      value={tier.pickStart}
                      onChange={(e) => onUpdateTier(i, 'pickStart', parseInt(e.target.value) || 1)}
                      className="w-12 bg-white border border-card-border rounded px-1.5 py-0.5 text-center text-xs focus:outline-none focus:border-primary"
                    />
                    <span className="text-muted">to</span>
                    <input
                      type="number"
                      min="1"
                      max="32"
                      value={tier.pickEnd}
                      onChange={(e) => onUpdateTier(i, 'pickEnd', parseInt(e.target.value) || 32)}
                      className="w-12 bg-white border border-card-border rounded px-1.5 py-0.5 text-center text-xs focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
                {config.tiers.length > 1 && (
                  <button
                    onClick={() => onRemoveTier(i)}
                    className="text-xs text-muted hover:text-danger transition px-1"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-muted block mb-0.5">Exact</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      value={tier.exactPick}
                      onChange={(e) => onUpdateTier(i, 'exactPick', parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-card-border rounded px-2 py-1 text-sm font-bold text-center focus:outline-none focus:border-primary"
                    />
                    <span className="text-[10px] text-muted">pts</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted block mb-0.5">±1 Slot</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      value={tier.within1}
                      onChange={(e) => onUpdateTier(i, 'within1', parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-card-border rounded px-2 py-1 text-sm font-bold text-center focus:outline-none focus:border-primary"
                    />
                    <span className="text-[10px] text-muted">pts</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted block mb-0.5">±2 Slots</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      value={tier.within2}
                      onChange={(e) => onUpdateTier(i, 'within2', parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-card-border rounded px-2 py-1 text-sm font-bold text-center focus:outline-none focus:border-primary"
                    />
                    <span className="text-[10px] text-muted">pts</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onAddTier}
          className="text-xs text-primary hover:text-primary-light font-semibold transition flex items-center gap-1"
        >
          <span>+</span> Add Tier
        </button>

        {/* Late Round Bonus */}
        <div className="mt-4 bg-background border border-card-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
              🎯 Late-Round Bonus
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.lateRoundBonus.enabled}
                onChange={(e) => onUpdateLateBonus('enabled', e.target.checked)}
                className="accent-primary"
              />
              <span className="text-xs text-muted">Enabled</span>
            </label>
          </div>
          {config.lateRoundBonus.enabled && (
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  value={config.lateRoundBonus.points}
                  onChange={(e) => onUpdateLateBonus('points', parseInt(e.target.value) || 0)}
                  className="w-14 bg-white border border-card-border rounded px-2 py-1 text-center font-bold focus:outline-none focus:border-primary"
                />
                <span className="text-muted">pts</span>
              </div>
              <span className="text-muted">for any player mocked &amp; picked at</span>
              <div className="flex items-center gap-1">
                <span className="text-muted">#</span>
                <input
                  type="number"
                  min="1"
                  max="32"
                  value={config.lateRoundBonus.threshold}
                  onChange={(e) => onUpdateLateBonus('threshold', parseInt(e.target.value) || 20)}
                  className="w-14 bg-white border border-card-border rounded px-2 py-1 text-center focus:outline-none focus:border-primary"
                />
                <span className="text-muted">or later</span>
              </div>
            </div>
          )}
        </div>

        {/* Scoring Preview */}
        <div className="mt-4 bg-primary/5 border border-primary/10 rounded-lg p-3">
          <p className="text-xs font-semibold text-primary mb-2">Scoring Preview</p>
          <div className="text-xs text-muted space-y-1">
            {config.tiers.map((tier, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="font-semibold text-foreground w-20 shrink-0">#{tier.pickStart}-{tier.pickEnd}:</span>
                <span>
                  {tier.exactPick > 0 && <span className="font-bold text-foreground">{tier.exactPick}</span>}
                  {tier.exactPick > 0 && ' exact'}
                  {tier.within1 > 0 && <>, <span className="font-bold text-foreground">{tier.within1}</span> ±1</>}
                  {tier.within2 > 0 && <>, <span className="font-bold text-foreground">{tier.within2}</span> ±2</>}
                </span>
              </div>
            ))}
            {config.lateRoundBonus.enabled && (
              <div className="flex items-start gap-2">
                <span className="font-semibold text-foreground w-20 shrink-0">Bonus:</span>
                <span><span className="font-bold text-foreground">{config.lateRoundBonus.points}</span> pts for player mocked &amp; picked #{config.lateRoundBonus.threshold}+</span>
              </div>
            )}
            <div className="mt-1.5 pt-1.5 border-t border-primary/10 italic">
              Max possible: {maxPoints} pts (all exact matches)
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={onSave}
        className="w-full sm:w-auto bg-accent hover:bg-accent-light text-white text-sm font-bold px-6 py-2.5 rounded-lg transition"
      >
        Save Changes
      </button>
    </div>
  );
}
