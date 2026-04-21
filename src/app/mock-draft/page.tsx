'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import AppShell from '@/components/AppShell';
import { DRAFT_ORDER_2026 } from '@/lib/draft-order';
import { findContradictions, Contradiction } from '@/lib/contradiction-checker';

interface Prospect {
  rank: number;
  name: string;
  position: string;
  college: string;
  conference: string;
}

interface Question {
  id: string;
  questionText: string;
  questionType: string;
  answerOptions: string[] | null;
  points: number;
  category: string;
  scoringRule: Record<string, unknown> | null;
}

const DRAFT_ORDER = DRAFT_ORDER_2026;

const POSITION_COLORS: Record<string, string> = {
  QB: 'bg-red-100 text-red-700 border-red-200',
  RB: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  WR: 'bg-amber-100 text-amber-700 border-amber-200',
  TE: 'bg-orange-100 text-orange-700 border-orange-200',
  OT: 'bg-green-100 text-green-700 border-green-200',
  IOL: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  EDGE: 'bg-purple-100 text-purple-700 border-purple-200',
  DT: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  LB: 'bg-blue-100 text-blue-700 border-blue-200',
  CB: 'bg-pink-100 text-pink-700 border-pink-200',
  S: 'bg-teal-100 text-teal-700 border-teal-200',
};

type SortMode = 'rank' | 'alpha' | 'position';

export default function MockDraftPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [picks, setPicks] = useState<Record<number, string>>({}); // pickNumber -> playerName
  const [activePick, setActivePick] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('rank');
  const [positionFilter, setPositionFilter] = useState<string>('All');
  const [searchText, setSearchText] = useState('');
  const saveTimeout = useRef<NodeJS.Timeout>(null);
  const playerListRef = useRef<HTMLDivElement>(null);
  const year = 2026;

  // Props/contradiction state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [propAnswers, setPropAnswers] = useState<Record<string, unknown>>({});
  const [contradictionModal, setContradictionModal] = useState<{
    contradictions: Contradiction[];
    pendingPick: { pickNum: number; playerName: string };
  } | null>(null);
  // Track dismissed contradictions so we don't nag repeatedly
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      fetch('/api/prospects').then(r => r.json()),
      fetch(`/api/mock-draft?year=${year}`).then(r => r.json()),
      fetch('/api/admin/year-settings').then(r => r.json()),
      fetch(`/api/questions?year=${year}`).then(r => r.json()),
      fetch(`/api/entries?year=${year}`).then(r => r.json()),
    ]).then(([p, mock, years, q, entry]) => {
      setProspects(p);
      if (mock?.picks) {
        setPicks(mock.picks);
      }
      if (mock?.submittedAt) setSubmitted(true);
      const currentYear = Array.isArray(years) ? years.find((y: { year: number }) => y.year === year) : null;
      if (currentYear) {
        const lt = new Date(currentYear.lockTime);
        if (new Date() >= lt || currentYear.status === 'locked' || currentYear.status === 'live' || currentYear.status === 'complete') {
          setLocked(true);
        }
      }
      setQuestions(q || []);
      if (entry?.picks) {
        const parsed = typeof entry.picks === 'string' ? JSON.parse(entry.picks) : entry.picks;
        setPropAnswers(parsed);
      }
      // Auto-select the first empty pick
      const firstEmpty = DRAFT_ORDER.find(d => !mock?.picks?.[d.pick]);
      if (firstEmpty) setActivePick(firstEmpty.pick);
      setLoading(false);
    });
  }, []);

  const saveMock = useCallback(async (newPicks: Record<number, string>, submit = false) => {
    if (locked) return;
    setSaving(true);
    try {
      await fetch('/api/mock-draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, picks: newPicks, submitted: submit }),
      });
      setSaved(true);
      if (submit) setSubmitted(true);
    } finally {
      setSaving(false);
    }
  }, [locked]);

  const doAssignPlayer = (pickNum: number, playerName: string, newPicks: Record<number, string>) => {
    setPicks(newPicks);
    setSaved(false);

    // Auto-advance to next empty pick
    const nextEmpty = DRAFT_ORDER.find(d => d.pick > pickNum && !newPicks[d.pick]);
    if (nextEmpty) {
      setActivePick(nextEmpty.pick);
    } else {
      const anyEmpty = DRAFT_ORDER.find(d => !newPicks[d.pick]);
      setActivePick(anyEmpty?.pick || null);
    }

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveMock(newPicks), 1500);
  };

  const assignPlayer = (playerName: string) => {
    if (!activePick || locked) return;

    // Check for duplicate usage — warn but allow
    const currentCount = playerUsageCount.get(playerName) || 0;
    if (currentCount > 0) {
      const slots = Object.entries(picks)
        .filter(([, name]) => name === playerName)
        .map(([slot]) => Number(slot));
      setDuplicateModal({ playerName, usageCount: currentCount, slots });
      return;
    }

    proceedWithAssignment(playerName);
  };

  const proceedWithAssignment = (playerName: string) => {
    if (!activePick || locked) return;
    const newPicks = { ...picks, [activePick]: playerName };

    // Check for contradictions (only if user has prop answers)
    if (Object.keys(propAnswers).length > 0 && questions.length > 0) {
      const contras = findContradictions(questions, propAnswers, newPicks, prospects);
      // Filter out already-dismissed contradictions
      const newContras = contras.filter(c => !dismissed.has(`${c.questionId}-${c.mockDetail}`));

      if (newContras.length > 0) {
        setContradictionModal({
          contradictions: newContras,
          pendingPick: { pickNum: activePick, playerName },
        });
        return;
      }
    }

    doAssignPlayer(activePick, playerName, newPicks);
  };

  const handleContradictionChoice = (choice: 'keep-mock' | 'change-mock' | 'change-prop') => {
    if (!contradictionModal) return;
    const { pendingPick, contradictions } = contradictionModal;

    if (choice === 'keep-mock') {
      // Dismiss these contradictions and proceed
      const newDismissed = new Set(dismissed);
      contradictions.forEach(c => newDismissed.add(`${c.questionId}-${c.mockDetail}`));
      setDismissed(newDismissed);

      const newPicks = { ...picks, [pendingPick.pickNum]: pendingPick.playerName };
      doAssignPlayer(pendingPick.pickNum, pendingPick.playerName, newPicks);
    } else if (choice === 'change-prop') {
      // Redirect to props page
      window.location.href = '/picks';
      return;
    }
    // 'change-mock' — just close the modal, don't make the pick
    setContradictionModal(null);
  };

  const clearPick = (pickNum: number) => {
    if (locked) return;
    const newPicks = { ...picks };
    delete newPicks[pickNum];
    setPicks(newPicks);
    setActivePick(pickNum);
    setSaved(false);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveMock(newPicks), 1500);
  };

  // Count how many times each player is used
  const playerUsageCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const name of Object.values(picks)) {
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return counts;
  }, [picks]);

  // Duplicate player warning modal
  const [duplicateModal, setDuplicateModal] = useState<{
    playerName: string;
    usageCount: number;
    slots: number[];
  } | null>(null);

  // Filtered and sorted prospects
  const displayProspects = useMemo(() => {
    let list = [...prospects];

    // Position filter
    if (positionFilter !== 'All') {
      list = list.filter(p => p.position === positionFilter);
    }

    // Search
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.college.toLowerCase().includes(q)
      );
    }

    // Sort
    if (sortMode === 'rank') list.sort((a, b) => a.rank - b.rank);
    else if (sortMode === 'alpha') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortMode === 'position') list.sort((a, b) => a.position.localeCompare(b.position) || a.rank - b.rank);

    return list;
  }, [prospects, positionFilter, searchText, sortMode]);

  const positions = useMemo(() => {
    const set = new Set(prospects.map(p => p.position));
    return ['All', ...Array.from(set).sort()];
  }, [prospects]);

  // Check all current contradictions for the warning banner
  const allContradictions = useMemo(() => {
    if (Object.keys(propAnswers).length === 0 || questions.length === 0) return [];
    return findContradictions(questions, propAnswers, picks, prospects);
  }, [questions, propAnswers, picks, prospects]);

  const filledCount = Object.keys(picks).length;

  if (loading) {
    return <AppShell><div className="md:ml-48 flex justify-center py-12"><div className="text-muted animate-pulse">Loading mock draft...</div></div></AppShell>;
  }

  return (
    <AppShell>
      <div className="md:ml-48">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Mock Draft</h1>
            <p className="text-muted text-sm">Select a player for each of the 32 picks</p>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-primary">{filledCount}/32</div>
            <div className="text-xs text-right">
              {saving ? (
                <span className="text-primary">Saving...</span>
              ) : saved ? (
                <span className="text-success">Saved</span>
              ) : (
                <span className="text-muted">Unsaved</span>
              )}
            </div>
          </div>
        </div>

        {/* Contradiction warning banner */}
        {allContradictions.length > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <span className="text-amber-500 text-lg leading-none mt-0.5">⚠️</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">
                  {allContradictions.length} contradiction{allContradictions.length > 1 ? 's' : ''} with your props
                </p>
                <ul className="mt-1 space-y-1">
                  {allContradictions.slice(0, 3).map((c, i) => (
                    <li key={i} className="text-xs text-amber-700">{c.message}</li>
                  ))}
                  {allContradictions.length > 3 && (
                    <li className="text-xs text-amber-600 italic">+{allContradictions.length - 3} more...</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Two-column layout: picks on left, player list on right */}
        <div className="flex flex-col lg:flex-row gap-4">

          {/* LEFT: Draft slots */}
          <div className="lg:w-1/2 space-y-1.5">
            {DRAFT_ORDER.map(slot => {
              const playerName = picks[slot.pick];
              const prospect = prospects.find(p => p.name === playerName);
              const isActive = activePick === slot.pick;
              const isDuplicate = playerName && (playerUsageCount.get(playerName) || 0) > 1;

              return (
                <button
                  key={slot.pick}
                  onClick={() => !locked && setActivePick(slot.pick)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition ${
                    isActive
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : isDuplicate
                        ? 'border-amber-200 bg-amber-50/50 hover:border-amber-300'
                        : playerName
                          ? 'border-card-border bg-card hover:border-muted'
                          : 'border-dashed border-card-border bg-white hover:border-muted'
                  }`}
                >
                  <div className="w-8 text-center">
                    <span className={`text-sm font-bold ${isActive ? 'text-primary' : 'text-muted'}`}>
                      {slot.pick}
                    </span>
                  </div>
                  <div className="w-12 text-xs font-semibold text-muted">{slot.abbr}</div>
                  {playerName ? (
                    <div className="flex-1 flex items-center gap-2">
                      {prospect && (
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${POSITION_COLORS[prospect.position] || 'bg-gray-100 text-gray-600'}`}>
                          {prospect.position}
                        </span>
                      )}
                      <span className="text-sm font-medium truncate">{playerName}</span>
                      {isDuplicate && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                          {playerUsageCount.get(playerName)}x
                        </span>
                      )}
                      {prospect && <span className="text-xs text-muted hidden sm:inline">{prospect.college}</span>}
                      {!locked && (
                        <span
                          onClick={(e) => { e.stopPropagation(); clearPick(slot.pick); }}
                          className="ml-auto text-xs text-muted hover:text-danger cursor-pointer px-1"
                        >
                          ✕
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className={`text-sm ${isActive ? 'text-primary font-medium' : 'text-muted'}`}>
                      {isActive ? 'Select a player...' : 'Empty'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* RIGHT: Player selector */}
          <div className="lg:w-1/2 lg:sticky lg:top-18 lg:self-start" ref={playerListRef}>
            <div className="bg-card border border-card-border rounded-xl p-4 shadow-sm">
              <h2 className="text-sm font-bold text-primary mb-3">
                {activePick
                  ? `Pick #${activePick} — ${DRAFT_ORDER.find(d => d.pick === activePick)?.team}`
                  : 'Select a pick slot first'}
              </h2>

              {/* Search */}
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full bg-white border border-card-border rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-primary transition"
                placeholder="Search by name or school..."
              />

              {/* Filters */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {/* Sort */}
                <div className="flex rounded-lg border border-card-border overflow-hidden text-xs">
                  {(['rank', 'alpha', 'position'] as SortMode[]).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setSortMode(mode)}
                      className={`px-2.5 py-1.5 transition ${
                        sortMode === mode ? 'bg-primary text-white' : 'bg-white text-muted hover:bg-gray-50'
                      }`}
                    >
                      {mode === 'rank' ? 'Rank' : mode === 'alpha' ? 'A-Z' : 'Pos'}
                    </button>
                  ))}
                </div>

                {/* Position filter */}
                <div className="flex flex-wrap gap-1">
                  {positions.map(pos => (
                    <button
                      key={pos}
                      onClick={() => setPositionFilter(pos)}
                      className={`text-xs px-2 py-1 rounded-full border transition ${
                        positionFilter === pos
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-muted border-card-border hover:border-muted'
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>

              {/* Player list */}
              <div className="max-h-[60vh] overflow-y-auto space-y-1">
                {!activePick ? (
                  <p className="text-muted text-sm text-center py-6">Tap a pick slot on the left to start</p>
                ) : displayProspects.length === 0 ? (
                  <p className="text-muted text-sm text-center py-6">No matching players</p>
                ) : (
                  displayProspects.map(p => {
                    const usageCount = playerUsageCount.get(p.name) || 0;
                    const isUsed = usageCount > 0;
                    return (
                      <button
                        key={p.name}
                        onClick={() => assignPlayer(p.name)}
                        disabled={locked}
                        className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition disabled:opacity-50 ${
                          isUsed
                            ? 'border-card-border bg-gray-50 opacity-60 hover:opacity-90 hover:border-amber-300'
                            : 'border-card-border bg-white hover:border-primary hover:bg-primary/5'
                        }`}
                      >
                        <span className="text-xs text-muted w-6 text-right font-mono">{p.rank}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${POSITION_COLORS[p.position] || 'bg-gray-100 text-gray-600'}`}>
                          {p.position}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-medium ${isUsed ? 'text-muted' : ''}`}>{p.name}</span>
                          <span className="text-xs text-muted ml-1.5">{p.college}</span>
                        </div>
                        {isUsed && (
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                            {usageCount}x
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        {!locked && (
          <div className="mt-6 mb-8">
            <button
              onClick={() => {
                if (filledCount < 32) {
                  if (!confirm(`You've only filled ${filledCount}/32 picks. Submit anyway?`)) return;
                }
                saveMock(picks, true);
              }}
              className="w-full bg-accent hover:bg-accent-light text-white font-bold py-3 rounded-lg transition shadow-sm"
            >
              {submitted ? 'Update Mock Draft' : 'Submit Mock Draft'}
            </button>
            {submitted && <p className="text-success text-xs text-center mt-2">Mock draft submitted!</p>}
          </div>
        )}
      </div>

      {/* Duplicate Player Modal */}
      {duplicateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDuplicateModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-slide-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">🔄</span>
              <h3 className="text-lg font-bold">Player Already Used</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              <strong>{duplicateModal.playerName}</strong> is already mocked at pick{duplicateModal.slots.length > 1 ? 's' : ''}{' '}
              <strong>{duplicateModal.slots.map(s => `#${s}`).join(', ')}</strong>.
            </p>
            <p className="text-xs text-muted mb-5">
              You can pick the same player in multiple slots, but <strong>points don&apos;t stack</strong> — only the slot closest to his actual pick will score. The other slots will be worth 0. This is a hedge to raise your floor, not your ceiling.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setDuplicateModal(null);
                  proceedWithAssignment(duplicateModal.playerName);
                }}
                className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-light transition"
              >
                Use Again at #{activePick}
              </button>
              <button
                onClick={() => setDuplicateModal(null)}
                className="w-full py-2.5 bg-white border border-card-border text-foreground rounded-lg text-sm font-semibold hover:bg-gray-50 transition"
              >
                Pick Someone Else
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contradiction Modal */}
      {contradictionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setContradictionModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-slide-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">⚠️</span>
              <h3 className="text-lg font-bold text-amber-800">Heads Up!</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Mocking <strong>{contradictionModal.pendingPick.playerName}</strong> at pick #{contradictionModal.pendingPick.pickNum} conflicts with your prop answers:
            </p>
            <div className="space-y-3 mb-6">
              {contradictionModal.contradictions.map((c, i) => (
                <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-1">{c.questionText}</p>
                  <p className="text-xs text-amber-700">
                    <span className="font-medium">Your prop:</span> {c.propAnswer}
                  </p>
                  <p className="text-xs text-amber-700">
                    <span className="font-medium">Your mock:</span> {c.mockDetail}
                  </p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <button
                onClick={() => handleContradictionChoice('keep-mock')}
                className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-light transition"
              >
                Keep This Pick (Leave Contradiction)
              </button>
              <button
                onClick={() => handleContradictionChoice('change-mock')}
                className="w-full py-2.5 bg-white border border-card-border text-foreground rounded-lg text-sm font-semibold hover:bg-gray-50 transition"
              >
                Pick a Different Player
              </button>
              <button
                onClick={() => handleContradictionChoice('change-prop')}
                className="w-full py-2.5 bg-white border border-amber-300 text-amber-700 rounded-lg text-sm font-semibold hover:bg-amber-50 transition"
              >
                Go Fix My Props →
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
