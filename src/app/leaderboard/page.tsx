'use client';

import { useState, useEffect, useRef } from 'react';
import AppShell from '@/components/AppShell';
import { useSSE } from '@/lib/hooks';
import { DRAFT_ORDER_2026 } from '@/lib/draft-order';

interface MockData {
  id: string;
  userId: string;
  entryId: string;
  displayName: string;
  entryName: string;
  picks: Record<string, string>;
  scores: Array<{ pickNumber: number; pointsEarned: number; matchType: string }>;
}

interface ActualPick {
  pickNumber: number;
  playerName: string;
  position: string;
  team: string;
  college: string;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  entryId: string | null;
  displayName: string;
  totalPoints: number;
  propPoints: number;
  mockPoints: number;
  correctPicks: number;
  exactMocks: number;
}

interface EntryDetail {
  id: string;
  userId: string;
  displayName: string;
  picks: Record<string, unknown>;
  scores: Array<{
    question_id: string;
    is_correct: number;
    points_earned: number;
    question_text: string;
    max_points: number;
  }>;
}

interface Question {
  id: string;
  questionText: string;
  correctAnswer: string | null;
  points: number;
}

// Split "Tom russell — Hail Mary" into { display: "Tom russell", entry: "Hail Mary" }.
// If there's no separator, entry is null.
function splitDisplayName(name: string): { display: string; entry: string | null } {
  const sep = ' — ';
  const idx = name.indexOf(sep);
  if (idx === -1) return { display: name, entry: null };
  return { display: name.slice(0, idx), entry: name.slice(idx + sep.length) };
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [entries, setEntries] = useState<EntryDetail[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [mocks, setMocks] = useState<MockData[]>([]);
  const [actualPicks, setActualPicks] = useState<ActualPick[]>([]);
  const [error, setError] = useState('');
  // Per-row view toggle: 'props' | 'mock'
  const [rowTab, setRowTab] = useState<Record<string, 'props' | 'mock'>>({});
  // Previous-rank lookup for the movement indicator (↑3, ↓2, —).
  // Keyed on rowKey so multi-entry users track per entry, not per user.
  const prevRanksRef = useRef<Map<string, number>>(new Map());
  const [rankDeltas, setRankDeltas] = useState<Map<string, number>>(new Map());
  const year = 2026;

  const sseEvent = useSSE('/api/sse/draft');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (sseEvent?.event === 'score_update') {
      const data = sseEvent.data as { leaderboard: LeaderboardEntry[] };
      applyLeaderboard(data.leaderboard);
      // Fresh pick came in — refresh mock scores & actual picks so the
      // expanded mock board updates live too.
      fetch(`/api/mock-scores?year=${year}`)
        .then(r => r.ok ? r.json() : [])
        .then(mk => { if (Array.isArray(mk)) setMocks(mk); })
        .catch(() => { /* silent */ });
      fetch(`/api/draft-picks?year=${year}`)
        .then(r => r.ok ? r.json() : [])
        .then(ap => { if (Array.isArray(ap)) setActualPicks(ap); })
        .catch(() => { /* silent */ });
    }
  }, [sseEvent]);

  // Compute rank deltas vs. the last snapshot, then remember the new ranks
  // as the baseline for the next update.
  function applyLeaderboard(next: LeaderboardEntry[]) {
    const deltas = new Map<string, number>();
    for (const row of next) {
      const key = row.entryId || `mock-only-${row.userId}`;
      const prev = prevRanksRef.current.get(key);
      if (prev !== undefined) {
        // Positive delta = moved up (rank went from 5 to 2 → delta +3)
        deltas.set(key, prev - row.rank);
      }
    }
    // Replace snapshot
    const fresh = new Map<string, number>();
    for (const row of next) {
      const key = row.entryId || `mock-only-${row.userId}`;
      fresh.set(key, row.rank);
    }
    prevRanksRef.current = fresh;
    setRankDeltas(deltas);
    setLeaderboard(next);
  }

  async function loadData() {
    try {
      const [lb, ent, q, mk, ap] = await Promise.all([
        fetch(`/api/leaderboard?year=${year}`).then(r => { if (!r.ok) throw new Error('Not available'); return r.json(); }),
        fetch(`/api/picks?year=${year}`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/questions?year=${year}`).then(r => r.json()),
        fetch(`/api/mock-scores?year=${year}`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/draft-picks?year=${year}`).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      applyLeaderboard(Array.isArray(lb) ? lb : []);
      setEntries(Array.isArray(ent) ? ent : []);
      setQuestions(Array.isArray(q) ? q : []);
      setMocks(Array.isArray(mk) ? mk : []);
      setActualPicks(Array.isArray(ap) ? ap : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <AppShell><div className="md:ml-48 flex justify-center py-12"><div className="text-muted animate-pulse">Loading leaderboard...</div></div></AppShell>;
  }

  if (error) {
    return (
      <AppShell>
        <div className="md:ml-48 text-center py-12">
          <h1 className="text-2xl font-bold mb-4">Leaderboard</h1>
          <p className="text-muted">The leaderboard will be available after entries lock.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="md:ml-48">
        <h1 className="text-2xl font-bold mb-6">Leaderboard</h1>

        <div className="space-y-2">
          {leaderboard.map((entry) => {
            // rowKey is unique per leaderboard row (entryId if present, else userId)
            const rowKey = entry.entryId || `mock-only-${entry.userId}`;
            const userEntry = entry.entryId
              ? entries.find(e => e.id === entry.entryId)
              : entries.find(e => e.userId === entry.userId);
            const isExpanded = expandedUser === rowKey;
            const delta = rankDeltas.get(rowKey);
            const { display: baseName, entry: entryLabel } = splitDisplayName(entry.displayName);

            return (
              <div key={rowKey} className="animate-slide-in">
                <button
                  onClick={() => setExpandedUser(isExpanded ? null : rowKey)}
                  className="w-full bg-card border border-card-border rounded-xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:border-primary/30 transition text-left"
                >
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-base sm:text-lg ${
                      entry.rank === 1 ? 'bg-amber-400/20 text-amber-500' :
                      entry.rank === 2 ? 'bg-gray-400/20 text-gray-300' :
                      entry.rank === 3 ? 'bg-amber-700/20 text-amber-600' :
                      'bg-card-border text-muted'
                    }`}>
                      {entry.rank}
                    </div>
                    <MovementIndicator delta={delta} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Name: stacks vertically on mobile, single line on sm+ */}
                    <div className="font-semibold leading-tight truncate">
                      {baseName}
                      {entryLabel && (
                        <span className="hidden sm:inline text-muted font-normal"> — {entryLabel}</span>
                      )}
                    </div>
                    {entryLabel && (
                      <div className="sm:hidden text-xs text-muted truncate">{entryLabel}</div>
                    )}
                    <div className="flex items-center gap-2 sm:gap-3 text-xs text-muted mt-0.5">
                      <span>{entry.correctPicks} correct</span>
                      {entry.exactMocks > 0 && <span>{entry.exactMocks} exact mock{entry.exactMocks !== 1 ? 's' : ''}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-bold text-primary tabular-nums">{entry.totalPoints}</div>
                    {(entry.propPoints > 0 || entry.mockPoints > 0) && (
                      <div className="flex items-center justify-end gap-1.5 text-[10px] text-muted">
                        {entry.propPoints > 0 && <span>Props: {entry.propPoints}</span>}
                        {entry.mockPoints > 0 && <span>Mock: {entry.mockPoints}</span>}
                      </div>
                    )}
                  </div>
                  <span className="text-muted text-xs shrink-0">{isExpanded ? '▲' : '▼'}</span>
                </button>

                {isExpanded && (
                  <div className="mt-1 bg-card/50 border border-card-border rounded-xl p-4">
                    <ExpandedView
                      entry={entry}
                      userEntry={userEntry}
                      questions={questions}
                      mock={mocks.find(m => m.entryId === entry.entryId) || null}
                      actualPicks={actualPicks}
                      activeTab={rowTab[rowKey] || 'props'}
                      onTabChange={(tab) => setRowTab({ ...rowTab, [rowKey]: tab })}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {leaderboard.length === 0 && (
            <div className="text-center py-8 text-muted">No entries yet</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// Tabbed view inside an expanded leaderboard row: Props answers vs Mock board.
function ExpandedView({
  entry,
  userEntry,
  questions,
  mock,
  actualPicks,
  activeTab,
  onTabChange,
}: {
  entry: LeaderboardEntry;
  userEntry: EntryDetail | undefined;
  questions: Question[];
  mock: MockData | null;
  actualPicks: ActualPick[];
  activeTab: 'props' | 'mock';
  onTabChange: (tab: 'props' | 'mock') => void;
}) {
  const hasProps = !!userEntry;
  const hasMock = !!mock;

  // If the active tab isn't available, fall back to whichever one is
  const tab = activeTab === 'mock' && !hasMock ? 'props' : activeTab === 'props' && !hasProps ? 'mock' : activeTab;

  if (!hasProps && !hasMock) {
    return <p className="text-muted text-sm text-center py-2">No detailed scores available</p>;
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-background border border-card-border rounded-lg p-1 w-fit">
        <button
          onClick={() => onTabChange('props')}
          disabled={!hasProps}
          className={`text-xs font-semibold px-3 py-1.5 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed ${
            tab === 'props' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
          }`}
        >
          Props ({entry.propPoints} pt{entry.propPoints === 1 ? '' : 's'})
        </button>
        <button
          onClick={() => onTabChange('mock')}
          disabled={!hasMock}
          className={`text-xs font-semibold px-3 py-1.5 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed ${
            tab === 'mock' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
          }`}
        >
          Mock ({entry.mockPoints} pt{entry.mockPoints === 1 ? '' : 's'})
        </button>
      </div>

      {tab === 'props' && userEntry && (
        <div className="space-y-1">
          {questions.map(q => {
            const score = userEntry.scores.find(s => s.question_id === q.id);
            const userPick = userEntry.picks[q.id];
            return (
              <div key={q.id} className="flex items-center justify-between text-sm py-1 border-b border-card-border/50 last:border-0">
                <div className="flex-1 min-w-0 pr-2">
                  <div className="text-muted text-xs truncate">{q.questionText}</div>
                  <div className="font-medium text-xs truncate">
                    {Array.isArray(userPick) ? (userPick as string[]).join(' → ') : String(userPick || '—')}
                  </div>
                </div>
                {score ? (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    score.is_correct ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
                  }`}>
                    {score.is_correct ? `+${score.points_earned}` : '0'}
                  </span>
                ) : (
                  <span className="text-xs text-muted px-2 py-0.5 rounded-full bg-card-border/30">Pending</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'mock' && mock && (
        <MockBoard mock={mock} actualPicks={actualPicks} />
      )}
    </div>
  );
}

// 32-slot view showing the user's mock pick, the actual pick, and scoring
// per slot. Colored by match_type so big hits jump out.
function MockBoard({ mock, actualPicks }: { mock: MockData; actualPicks: ActualPick[] }) {
  const actualByPick = new Map(actualPicks.map(p => [p.pickNumber, p]));
  const scoreByPick = new Map(mock.scores.map(s => [s.pickNumber, s]));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {DRAFT_ORDER_2026.map(slot => {
        const mockedPlayer = mock.picks[String(slot.pick)] || null;
        const actual = actualByPick.get(slot.pick);
        const score = scoreByPick.get(slot.pick);
        const matchTone =
          score?.matchType === 'exact'
            ? 'border-success bg-success/10'
            : score?.matchType === 'within1' || score?.matchType === 'within2'
              ? 'border-amber-300 bg-amber-50'
              : score?.matchType === 'late_round'
                ? 'border-primary bg-primary/5'
                : score?.matchType === 'duplicate'
                  ? 'border-card-border bg-gray-50 opacity-60'
                  : actual
                    ? 'border-card-border bg-white'
                    : 'border-dashed border-card-border bg-white';
        return (
          <div
            key={slot.pick}
            className={`flex items-center gap-2 rounded-lg border p-2 text-xs ${matchTone}`}
          >
            <div className="shrink-0 w-6 text-center font-bold text-primary">{slot.pick}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1">
                <span className="text-[10px] text-muted shrink-0 w-14">Mocked:</span>
                <span className="truncate font-medium">{mockedPlayer || '—'}</span>
              </div>
              {actual && (
                <div className="flex items-baseline gap-1">
                  <span className="text-[10px] text-muted shrink-0 w-14">Actual:</span>
                  <span className="truncate">{actual.playerName}</span>
                </div>
              )}
            </div>
            {score ? (
              <span
                className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  score.pointsEarned > 0
                    ? score.matchType === 'exact'
                      ? 'bg-success text-white'
                      : 'bg-amber-500 text-white'
                    : 'bg-card-border text-muted'
                }`}
              >
                {score.pointsEarned > 0 ? `+${score.pointsEarned}` : '0'}
              </span>
            ) : actual ? (
              <span className="shrink-0 text-[10px] text-muted">—</span>
            ) : (
              <span className="shrink-0 text-[10px] text-muted">⋯</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Shows ↑N / ↓N / — based on rank change from the previous update.
// Undefined delta (first render, or user is new to the board) → blank.
function MovementIndicator({ delta }: { delta: number | undefined }) {
  if (delta === undefined) {
    return <span className="h-3 w-6" aria-hidden />;
  }
  if (delta === 0) {
    return (
      <span className="text-[10px] text-muted leading-none" title="No change">
        —
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`text-[10px] leading-none font-semibold tabular-nums ${
        up ? 'text-success' : 'text-danger'
      }`}
      title={up ? `Up ${delta}` : `Down ${Math.abs(delta)}`}
    >
      {up ? '▲' : '▼'}{Math.abs(delta)}
    </span>
  );
}
