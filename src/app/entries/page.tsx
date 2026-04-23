'use client';

import { useState, useEffect, useMemo } from 'react';
import AppShell from '@/components/AppShell';

interface Question {
  id: string;
  questionText: string;
  questionType: string;
  correctAnswer: string | null;
  points: number;
  category?: string | null;
}

interface EntryData {
  id: string;
  displayName: string;
  picks: Record<string, unknown>;
  scores: Array<{
    question_id: string;
    is_correct: number;
    points_earned: number;
  }>;
}

function formatPick(pick: unknown): string {
  if (pick === undefined || pick === null || pick === '') return '—';
  if (Array.isArray(pick)) return (pick as string[]).join(', ');
  return String(pick);
}

export default function EntriesPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [entries, setEntries] = useState<EntryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [highlightQ, setHighlightQ] = useState<string | null>(null);
  const year = 2026;

  useEffect(() => {
    Promise.all([
      fetch(`/api/questions?year=${year}`).then(r => r.json()),
      fetch(`/api/entries/all?year=${year}`).then(r => {
        if (!r.ok) throw new Error('Not available yet');
        return r.json();
      }),
    ])
      .then(([q, e]) => {
        setQuestions(Array.isArray(q) ? q : []);
        setEntries(Array.isArray(e) ? e : []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Per-entry totals (points earned + correct count) for the header
  const entryTotals = useMemo(() => {
    const map = new Map<string, { points: number; correct: number }>();
    for (const entry of entries) {
      const points = entry.scores.reduce((s, sc) => s + sc.points_earned, 0);
      const correct = entry.scores.filter(s => s.is_correct).length;
      map.set(entry.id, { points, correct });
    }
    return map;
  }, [entries]);

  if (loading) {
    return (
      <AppShell fullWidth>
        <div className="md:ml-48 flex justify-center py-12">
          <div className="text-muted animate-pulse">Loading entries...</div>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell fullWidth>
        <div className="md:ml-48 text-center py-12">
          <h1 className="text-2xl font-bold mb-4">All Entries</h1>
          <p className="text-muted">Entries will be visible after the lock time.</p>
        </div>
      </AppShell>
    );
  }

  const scored = questions.filter(q => entries.some(e => e.scores.find(s => s.question_id === q.id)));

  return (
    <AppShell fullWidth>
      <div className="md:ml-48">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold">All Entries</h1>
            <p className="text-sm text-muted">
              {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} ·
              {' '}{questions.length} question{questions.length === 1 ? '' : 's'}
              {scored.length > 0 && ` · ${scored.length} resolved`}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-success/20 border border-success/40" />
              <span>Correct</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-danger/20 border border-danger/40" />
              <span>Wrong</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-card border border-card-border" />
              <span>Pending</span>
            </div>
          </div>
        </div>

        {/* Mobile: card view */}
        <div className="md:hidden space-y-3">
          {questions.map(q => (
            <div key={q.id} className="bg-card border border-card-border rounded-xl p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="text-sm font-medium flex-1">{q.questionText}</div>
                <span className="text-[10px] text-muted shrink-0 bg-white border border-card-border rounded-full px-2 py-0.5">
                  {q.points}pt
                </span>
              </div>
              <div className="divide-y divide-card-border/60">
                {entries.map(entry => {
                  const pick = entry.picks[q.id];
                  const score = entry.scores.find(s => s.question_id === q.id);
                  return (
                    <div key={entry.id} className="flex items-center justify-between text-sm py-1.5 gap-2">
                      <span className="text-muted truncate flex-1">{entry.displayName}</span>
                      <span
                        className={`text-xs text-right truncate max-w-[55%] ${
                          score
                            ? score.is_correct
                              ? 'text-success font-semibold'
                              : 'text-danger'
                            : 'text-foreground'
                        }`}
                      >
                        {formatPick(pick)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: table. The outer div scrolls horizontally, and the first
            column is sticky so the question stays in view while you scan
            across entries. */}
        <div className="hidden md:block">
          <p className="text-xs text-muted mb-2">
            Scroll sideways to see all entries. Question column stays put.
          </p>
          <div className="border border-card-border rounded-xl overflow-x-auto overflow-y-visible bg-white">
            <table className="text-sm border-collapse">
              <thead>
                <tr className="bg-card border-b border-card-border">
                  <th className="sticky left-0 z-20 bg-card border-r border-card-border text-left py-2.5 px-3 font-semibold text-muted text-xs uppercase tracking-wide w-[280px] min-w-[280px]">
                    Question
                  </th>
                  {entries.map(entry => {
                    const totals = entryTotals.get(entry.id);
                    return (
                      <th
                        key={entry.id}
                        className="py-2 px-3 font-semibold text-center border-r border-card-border/50 last:border-r-0 min-w-[140px] max-w-[180px]"
                      >
                        <div className="text-foreground text-xs truncate" title={entry.displayName}>
                          {entry.displayName}
                        </div>
                        {totals && (
                          <div className="text-[10px] text-muted font-normal mt-0.5">
                            {totals.points} pt{totals.points === 1 ? '' : 's'} ·{' '}
                            {totals.correct} correct
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {questions.map(q => {
                  const isHighlighted = highlightQ === q.id;
                  return (
                    <tr
                      key={q.id}
                      className={`border-b border-card-border/50 ${isHighlighted ? 'bg-primary/5' : 'hover:bg-card/40'}`}
                    >
                      <td
                        onMouseEnter={() => setHighlightQ(q.id)}
                        onMouseLeave={() => setHighlightQ(null)}
                        className={`sticky left-0 z-10 border-r border-card-border py-2 px-3 w-[280px] min-w-[280px] ${
                          isHighlighted ? 'bg-primary/5' : 'bg-white'
                        }`}
                      >
                        <div className="text-xs font-medium leading-snug line-clamp-2" title={q.questionText}>
                          {q.questionText}
                        </div>
                        <div className="text-[10px] text-muted mt-0.5">
                          {q.points} pt{q.points === 1 ? '' : 's'}
                          {q.correctAnswer && (
                            <>
                              {' · '}
                              <span className="text-success">✓ {q.correctAnswer}</span>
                            </>
                          )}
                        </div>
                      </td>
                      {entries.map(entry => {
                        const pick = entry.picks[q.id];
                        const score = entry.scores.find(s => s.question_id === q.id);
                        const text = formatPick(pick);
                        const isEmpty = text === '—';
                        const cellTone = score
                          ? score.is_correct
                            ? 'bg-success/10 text-success font-semibold'
                            : 'bg-danger/10 text-danger'
                          : isEmpty
                            ? 'text-muted/60'
                            : 'text-foreground';
                        return (
                          <td
                            key={entry.id}
                            className={`py-2 px-3 text-center text-xs border-r border-card-border/50 last:border-r-0 min-w-[140px] max-w-[180px] ${cellTone}`}
                            title={text}
                          >
                            <div className="truncate">{text}</div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
