'use client';

import { useState, useEffect, useMemo } from 'react';
import AppShell from '@/components/AppShell';
import { useSSE } from '@/lib/hooks';
import { DRAFT_ORDER_2026 } from '@/lib/draft-order';
import ScoringSidebar from '@/components/ScoringSidebar';
import OnTheLine from '@/components/OnTheLine';
import { computeOnTheLine } from '@/lib/on-the-line';
import type { MockScoringConfig } from '@/lib/db/schema';

const DRAFT_ORDER = DRAFT_ORDER_2026;

const DEFAULT_SCORING_CONFIG: MockScoringConfig = {
  tiers: [
    { label: 'Picks 1-5', pickStart: 1, pickEnd: 5, exactPick: 3, within1: 1, within2: 0 },
    { label: 'Picks 6-15', pickStart: 6, pickEnd: 15, exactPick: 5, within1: 2, within2: 1 },
    { label: 'Picks 16-25', pickStart: 16, pickEnd: 25, exactPick: 7, within1: 3, within2: 1 },
    { label: 'Picks 26-32', pickStart: 26, pickEnd: 32, exactPick: 10, within1: 5, within2: 2 },
  ],
  lateRoundBonus: { enabled: true, threshold: 20, points: 2 },
};

interface DraftPick {
  id: string;
  pickNumber: number;
  team: string;
  playerName: string;
  position: string;
  college: string;
  conference: string;
  isTrade?: boolean;
}

interface MockDraftEntry {
  userId: string;
  displayName: string;
  picks: Record<string, string>;
}

interface PropQuestion {
  id: string;
  questionText: string;
  questionType: string;
  answerOptions: string[] | null;
  points: number;
  category: string | null;
  scoringRule: Record<string, unknown> | null;
}

interface PropEntry {
  id: string;
  userId: string;
  displayName: string;
  entryName?: string;
  picks: Record<string, unknown>;
  submittedAt: string | null;
}

const POSITION_COLORS: Record<string, string> = {
  QB: 'bg-red-500/20 text-red-400',
  RB: 'bg-cyan-500/20 text-cyan-400',
  WR: 'bg-yellow-500/20 text-yellow-400',
  TE: 'bg-orange-500/20 text-orange-400',
  OT: 'bg-green-500/20 text-green-400',
  IOL: 'bg-green-500/20 text-green-400',
  EDGE: 'bg-purple-500/20 text-purple-400',
  DT: 'bg-indigo-500/20 text-indigo-400',
  LB: 'bg-blue-500/20 text-blue-400',
  CB: 'bg-pink-500/20 text-pink-400',
  S: 'bg-teal-500/20 text-teal-400',
};

export default function DraftBoardPage() {
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPickNum, setNewPickNum] = useState<number | null>(null);
  const [mockDrafts, setMockDrafts] = useState<MockDraftEntry[]>([]);
  const [mocksLoaded, setMocksLoaded] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [questions, setQuestions] = useState<PropQuestion[]>([]);
  const [propEntries, setPropEntries] = useState<PropEntry[]>([]);
  const [scoringConfig, setScoringConfig] = useState<MockScoringConfig>(DEFAULT_SCORING_CONFIG);
  const year = 2026;

  const sseEvent = useSSE('/api/sse/draft');

  useEffect(() => {
    fetch(`/api/draft-picks?year=${year}`)
      .then(r => r.json())
      .then(data => { setPicks(data); setLoading(false); });
  }, []);

  // Load all mock drafts (only works after lock)
  useEffect(() => {
    fetch('/api/mock-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year }),
    })
      .then(r => {
        if (r.ok) return r.json();
        return [];
      })
      .then(data => {
        if (Array.isArray(data)) {
          setMockDrafts(data);
          setMocksLoaded(true);
        }
      })
      .catch(() => setMocksLoaded(false));
  }, []);

  // Load prop questions + entries for the "On the Line" card.
  // /api/picks gates post-lock for non-admins, which is exactly when
  // the draft board matters anyway.
  useEffect(() => {
    fetch(`/api/questions?year=${year}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setQuestions(data); })
      .catch(() => { /* silent */ });

    fetch(`/api/picks?year=${year}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (!Array.isArray(data)) return;
        // Disambiguate users with multiple entries by appending the entry name
        const countByUser = new Map<string, number>();
        for (const e of data) countByUser.set(e.userId, (countByUser.get(e.userId) || 0) + 1);
        const mapped: PropEntry[] = data.map((e: PropEntry) => ({
          ...e,
          displayName:
            (countByUser.get(e.userId) || 0) > 1 && e.entryName
              ? `${e.displayName} — ${e.entryName}`
              : e.displayName,
        }));
        setPropEntries(mapped.filter(e => e.submittedAt));
      })
      .catch(() => { /* silent */ });

    fetch('/api/admin/year-settings')
      .then(r => r.ok ? r.json() : null)
      .then(rows => {
        if (!Array.isArray(rows)) return;
        const current = rows.find((y: { year: number }) => y.year === year);
        if (!current) return;
        const cfg = current.mockScoringConfig;
        const parsed: MockScoringConfig | null = typeof cfg === 'string'
          ? (() => { try { return JSON.parse(cfg); } catch { return null; } })()
          : cfg;
        if (parsed?.tiers?.length) setScoringConfig(parsed);
      })
      .catch(() => { /* silent */ });
  }, []);

  useEffect(() => {
    if (sseEvent?.event === 'new_pick') {
      const pick = sseEvent.data as DraftPick;
      setPicks(prev => {
        if (prev.find(p => p.pickNumber === pick.pickNumber)) return prev;
        return [...prev, pick as DraftPick].sort((a, b) => a.pickNumber - b.pickNumber);
      });
      setNewPickNum(pick.pickNumber);
      setTimeout(() => setNewPickNum(null), 3000);
    }
  }, [sseEvent]);

  // Next pick = smallest pick number not yet in the actual picks list.
  // More robust than Math.max+1 when picks arrive out of order.
  const nextPickNum = useMemo(() => {
    const taken = new Set(picks.map(p => p.pickNumber));
    const next = DRAFT_ORDER.find(d => !taken.has(d.pick));
    return next ? next.pick : null;
  }, [picks]);
  // Legacy alias used by the existing grid rendering below
  const currentPick = nextPickNum ?? 33;

  // Compute which props are on the line right now
  const onTheLineItems = useMemo(() => {
    if (questions.length === 0 || propEntries.length === 0) return [];
    return computeOnTheLine(questions, propEntries, picks, nextPickNum);
  }, [questions, propEntries, picks, nextPickNum]);

  // Build mock picks for the selected slot
  const slotMockPicks = useMemo(() => {
    if (selectedSlot === null || mockDrafts.length === 0) return [];

    return mockDrafts
      .map(m => ({
        displayName: m.displayName,
        playerName: m.picks[String(selectedSlot)] || null,
      }))
      .filter(m => m.playerName)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [selectedSlot, mockDrafts]);

  // For the popup: who got it right?
  const actualPick = useMemo(() => {
    if (selectedSlot === null) return null;
    return picks.find(p => p.pickNumber === selectedSlot) || null;
  }, [selectedSlot, picks]);

  const handleSlotClick = (pickNumber: number) => {
    if (mocksLoaded && mockDrafts.length > 0) {
      setSelectedSlot(pickNumber);
    }
  };

  if (loading) {
    return <AppShell><div className="md:ml-48 flex justify-center py-12"><div className="text-muted animate-pulse">Loading draft board...</div></div></AppShell>;
  }

  return (
    <AppShell>
      <div className="md:ml-48">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Draft Board</h1>
          <span className="text-sm text-muted">{picks.length}/32 picks</span>
        </div>

        {/* Layout: scoring sidebar + main content.
            On lg+ it's side-by-side; on mobile the sidebar stacks on top. */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          <aside className="lg:sticky lg:top-18 lg:self-start">
            <ScoringSidebar config={scoringConfig} nextPickNum={nextPickNum} />
          </aside>

          <div className="space-y-5 min-w-0">
            {/* On the line */}
            {propEntries.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-primary">
                    On the Line
                  </h2>
                  {nextPickNum !== null && (
                    <span className="text-xs text-muted">
                      {onTheLineItems.length} prop{onTheLineItems.length === 1 ? '' : 's'} live
                    </span>
                  )}
                </div>
                <OnTheLine items={onTheLineItems} nextPickNum={nextPickNum} />
              </section>
            )}

            <section>
              <h2 className="text-sm font-bold uppercase tracking-wide text-primary mb-2">
                Picks
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DRAFT_ORDER.map(slot => {
            const pick = picks.find(p => p.pickNumber === slot.pick);
            const isOnClock = slot.pick === currentPick && picks.length < 32;
            const isNew = slot.pick === newPickNum;
            const isClickable = mocksLoaded && mockDrafts.length > 0;

            return (
              <div
                key={slot.pick}
                onClick={() => handleSlotClick(slot.pick)}
                className={`bg-card border rounded-lg p-3 transition ${
                  isOnClock ? 'border-primary animate-pulse-clock' :
                  pick ? `border-card-border ${isNew ? 'flash-new' : ''}` :
                  'border-card-border/50 opacity-60'
                } ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-primary/20' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-primary">#{slot.pick}</span>
                  <span className="text-xs text-muted truncate ml-2">{pick?.team || slot.team}</span>
                </div>
                {pick ? (
                  <div>
                    <div className="font-semibold text-sm truncate">{pick.playerName}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${POSITION_COLORS[pick.position] || 'bg-card-border text-muted'}`}>
                        {pick.position}
                      </span>
                      <span className="text-xs text-muted truncate">{pick.college}</span>
                    </div>
                  </div>
                ) : isOnClock ? (
                  <div className="text-accent text-sm font-semibold animate-pulse">On the Clock</div>
                ) : (
                  <div className="text-muted text-xs py-2">—</div>
                )}
              </div>
            );
          })}
              </div>
            </section>

            {!mocksLoaded && picks.length > 0 && (
              <p className="text-center text-muted text-xs mt-2">Click on any pick to see pool predictions once entries are locked.</p>
            )}
          </div>
        </div>
      </div>

      {/* Pool Picks Modal */}
      {selectedSlot !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedSlot(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden animate-slide-in" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-primary text-white px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg">Pick #{selectedSlot}</h3>
                  <p className="text-white/70 text-sm">
                    {DRAFT_ORDER.find(d => d.pick === selectedSlot)?.team}
                  </p>
                </div>
                <button onClick={() => setSelectedSlot(null)} className="text-white/70 hover:text-white text-2xl leading-none">
                  &times;
                </button>
              </div>
              {actualPick && (
                <div className="mt-3 bg-white/15 rounded-lg px-3 py-2">
                  <p className="text-xs text-white/60 uppercase tracking-wide">Actual Pick</p>
                  <p className="font-bold">{actualPick.playerName}</p>
                  <p className="text-sm text-white/70">{actualPick.position} — {actualPick.college}</p>
                </div>
              )}
            </div>

            {/* Mock picks list */}
            <div className="px-5 py-4 overflow-y-auto max-h-[50vh]">
              <p className="text-xs text-muted uppercase tracking-wide font-semibold mb-3">
                Pool Predictions ({slotMockPicks.length})
              </p>
              {slotMockPicks.length === 0 ? (
                <p className="text-muted text-sm text-center py-6">No mock drafts submitted yet</p>
              ) : (
                <div className="space-y-2">
                  {slotMockPicks.map((m, i) => {
                    const isCorrect = actualPick && m.playerName === actualPick.playerName;
                    return (
                      <div
                        key={i}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${
                          isCorrect
                            ? 'border-success bg-success/5'
                            : actualPick
                              ? 'border-card-border bg-white'
                              : 'border-card-border bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isCorrect && <span className="text-success text-sm">✓</span>}
                          <span className="text-sm font-medium">{m.displayName}</span>
                        </div>
                        <span className={`text-sm ${isCorrect ? 'text-success font-semibold' : 'text-muted'}`}>
                          {m.playerName}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Summary: who picked what */}
              {slotMockPicks.length > 0 && (
                <div className="mt-4 pt-4 border-t border-card-border">
                  <p className="text-xs text-muted uppercase tracking-wide font-semibold mb-2">
                    Pick Distribution
                  </p>
                  <PickDistribution picks={slotMockPicks} actualPlayerName={actualPick?.playerName} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function PickDistribution({ picks, actualPlayerName }: {
  picks: { displayName: string; playerName: string | null }[];
  actualPlayerName?: string;
}) {
  const distribution = useMemo(() => {
    const counts: Record<string, number> = {};
    picks.forEach(p => {
      if (p.playerName) {
        counts[p.playerName] = (counts[p.playerName] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name,
        count,
        pct: Math.round((count / picks.length) * 100),
        isCorrect: name === actualPlayerName,
      }));
  }, [picks, actualPlayerName]);

  return (
    <div className="space-y-1.5">
      {distribution.map(d => (
        <div key={d.name} className="flex items-center gap-2">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-0.5">
              <span className={`text-xs font-medium ${d.isCorrect ? 'text-success' : 'text-foreground'}`}>
                {d.name} {d.isCorrect && '✓'}
              </span>
              <span className="text-xs text-muted">{d.count} ({d.pct}%)</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${d.isCorrect ? 'bg-success' : 'bg-primary/40'}`}
                style={{ width: `${d.pct}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
