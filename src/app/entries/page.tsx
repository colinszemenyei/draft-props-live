'use client';

import { useState, useEffect } from 'react';
import AppShell from '@/components/AppShell';

interface Question {
  id: string;
  questionText: string;
  questionType: string;
  correctAnswer: string | null;
  points: number;
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

export default function EntriesPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [entries, setEntries] = useState<EntryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const year = 2026;

  useEffect(() => {
    Promise.all([
      fetch(`/api/questions?year=${year}`).then(r => r.json()),
      fetch(`/api/entries/all?year=${year}`).then(r => { if (!r.ok) throw new Error('Not available yet'); return r.json(); }),
    ]).then(([q, e]) => {
      setQuestions(q);
      setEntries(e);
      setLoading(false);
    }).catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <AppShell><div className="md:ml-48 flex justify-center py-12"><div className="text-muted animate-pulse">Loading entries...</div></div></AppShell>;
  }

  if (error) {
    return (
      <AppShell>
        <div className="md:ml-48 text-center py-12">
          <h1 className="text-2xl font-bold mb-4">All Entries</h1>
          <p className="text-muted">Entries will be visible after the lock time.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="md:ml-48">
        <h1 className="text-2xl font-bold mb-6">All Entries</h1>

        {/* Mobile: card view */}
        <div className="md:hidden space-y-4">
          {questions.map(q => (
            <div key={q.id} className="bg-card border border-card-border rounded-xl p-4">
              <div className="text-sm font-medium mb-3">{q.questionText}</div>
              <div className="space-y-1">
                {entries.map(entry => {
                  const pick = entry.picks[q.id];
                  const score = entry.scores.find(s => s.question_id === q.id);
                  return (
                    <div key={entry.id} className="flex items-center justify-between text-sm py-1">
                      <span className="text-muted">{entry.displayName}</span>
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-32">
                          {Array.isArray(pick) ? (pick as string[]).join(', ') : String(pick || '—')}
                        </span>
                        {score && (
                          <span className={`w-2 h-2 rounded-full ${score.is_correct ? 'bg-success' : 'bg-danger'}`} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: table view */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border">
                <th className="text-left py-2 px-3 text-muted font-medium sticky left-0 bg-background">Question</th>
                {entries.map(e => (
                  <th key={e.id} className="text-center py-2 px-3 text-muted font-medium min-w-28">{e.displayName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {questions.map(q => (
                <tr key={q.id} className="border-b border-card-border/50 hover:bg-card/30">
                  <td className="py-2 px-3 text-xs text-muted sticky left-0 bg-background max-w-48 truncate">
                    {q.questionText}
                  </td>
                  {entries.map(entry => {
                    const pick = entry.picks[q.id];
                    const score = entry.scores.find(s => s.question_id === q.id);
                    return (
                      <td key={entry.id} className={`py-2 px-3 text-center text-xs ${
                        score ? (score.is_correct ? 'text-success bg-success/5' : 'text-danger bg-danger/5') : ''
                      }`}>
                        {Array.isArray(pick) ? (pick as string[]).join(', ') : String(pick || '—')}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
