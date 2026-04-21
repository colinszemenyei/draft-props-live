'use client';

import { useState, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { useSSE } from '@/lib/hooks';

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

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [entries, setEntries] = useState<EntryDetail[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState('');
  const year = 2026;

  const sseEvent = useSSE('/api/sse/draft');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (sseEvent?.event === 'score_update') {
      const data = sseEvent.data as { leaderboard: LeaderboardEntry[] };
      setLeaderboard(data.leaderboard);
    }
  }, [sseEvent]);

  async function loadData() {
    try {
      const [lb, ent, q] = await Promise.all([
        fetch(`/api/leaderboard?year=${year}`).then(r => { if (!r.ok) throw new Error('Not available'); return r.json(); }),
        fetch(`/api/picks?year=${year}`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/questions?year=${year}`).then(r => r.json()),
      ]);
      setLeaderboard(lb);
      setEntries(ent);
      setQuestions(q);
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

            return (
              <div key={rowKey} className="animate-slide-in">
                <button
                  onClick={() => setExpandedUser(isExpanded ? null : rowKey)}
                  className="w-full bg-card border border-card-border rounded-xl p-4 flex items-center gap-4 hover:border-primary/30 transition text-left"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                    entry.rank === 1 ? 'bg-amber-400/20 text-amber-500' :
                    entry.rank === 2 ? 'bg-gray-400/20 text-gray-300' :
                    entry.rank === 3 ? 'bg-amber-700/20 text-amber-600' :
                    'bg-card-border text-muted'
                  }`}>
                    {entry.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{entry.displayName}</div>
                    <div className="flex items-center gap-3 text-xs text-muted">
                      <span>{entry.correctPicks} correct</span>
                      {entry.exactMocks > 0 && <span>{entry.exactMocks} exact mock{entry.exactMocks !== 1 ? 's' : ''}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">{entry.totalPoints}</div>
                    {(entry.propPoints > 0 || entry.mockPoints > 0) && (
                      <div className="flex items-center gap-2 text-[10px] text-muted">
                        {entry.propPoints > 0 && <span>Props: {entry.propPoints}</span>}
                        {entry.mockPoints > 0 && <span>Mock: {entry.mockPoints}</span>}
                      </div>
                    )}
                  </div>
                  <span className="text-muted text-xs">{isExpanded ? '▲' : '▼'}</span>
                </button>

                {isExpanded && (
                  <div className="mt-1 bg-card/50 border border-card-border rounded-xl p-4">
                    {/* Props Section */}
                    {userEntry && questions.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-xs font-bold text-primary uppercase tracking-wide mb-2">
                          Prop Questions ({entry.propPoints} pts)
                        </h4>
                        <div className="space-y-1">
                          {questions.map(q => {
                            const score = userEntry.scores.find(s => s.question_id === q.id);
                            const userPick = userEntry.picks[q.id];

                            return (
                              <div key={q.id} className="flex items-center justify-between text-sm py-1 border-b border-card-border/50 last:border-0">
                                <div className="flex-1 min-w-0">
                                  <div className="text-muted text-xs truncate">{q.questionText}</div>
                                  <div className="font-medium text-xs truncate">
                                    {Array.isArray(userPick) ? (userPick as string[]).join(' → ') : String(userPick || '—')}
                                  </div>
                                </div>
                                {score ? (
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ml-2 ${
                                    score.is_correct ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
                                  }`}>
                                    {score.is_correct ? `+${score.points_earned}` : '0'}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted px-2 py-0.5 rounded-full bg-card-border/30 ml-2">Pending</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Mock Score Summary */}
                    {entry.mockPoints > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-primary uppercase tracking-wide mb-2">
                          Mock Draft ({entry.mockPoints} pts)
                        </h4>
                        <div className="text-xs text-muted">
                          {entry.exactMocks > 0 && <span className="inline-block bg-success/10 text-success px-2 py-0.5 rounded-full mr-2">{entry.exactMocks} exact</span>}
                          <span>Total mock points: {entry.mockPoints}</span>
                        </div>
                      </div>
                    )}

                    {!userEntry && entry.mockPoints === 0 && (
                      <p className="text-muted text-sm text-center py-2">No detailed scores available</p>
                    )}
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
