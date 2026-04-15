'use client';

import { useState, useEffect } from 'react';
import AppShell from '@/components/AppShell';

interface DraftYear {
  year: number;
  status: string;
}

interface LeaderboardEntry {
  rank: number;
  displayName: string;
  totalPoints: number;
  correctPicks: number;
}

export default function HistoryPage() {
  const [years, setYears] = useState<DraftYear[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/year-settings')
      .then(r => r.json())
      .then(data => {
        const yrs = Array.isArray(data) ? data.filter((y: DraftYear) => y.status === 'complete') : [];
        setYears(yrs);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (selectedYear) {
      fetch(`/api/leaderboard?year=${selectedYear}`)
        .then(r => r.ok ? r.json() : [])
        .then(setLeaderboard);
    }
  }, [selectedYear]);

  return (
    <AppShell>
      <div className="md:ml-48">
        <h1 className="text-2xl font-bold mb-6">Historical Results</h1>

        {loading ? (
          <div className="text-muted animate-pulse">Loading...</div>
        ) : years.length === 0 ? (
          <p className="text-muted">No completed draft years yet. Check back after draft night!</p>
        ) : (
          <>
            <div className="flex gap-2 mb-6">
              {years.map(y => (
                <button
                  key={y.year}
                  onClick={() => setSelectedYear(y.year)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                    selectedYear === y.year ? 'bg-primary text-white' : 'bg-card border border-card-border text-muted hover:text-foreground'
                  }`}
                >
                  {y.year}
                </button>
              ))}
            </div>

            {selectedYear && (
              <div className="space-y-2">
                {leaderboard.map(entry => (
                  <div key={entry.displayName} className="bg-card border border-card-border rounded-xl p-4 flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                      entry.rank === 1 ? 'bg-amber-400/20 text-amber-500' :
                      entry.rank === 2 ? 'bg-gray-400/20 text-gray-300' :
                      entry.rank === 3 ? 'bg-amber-700/20 text-amber-600' :
                      'bg-card-border text-muted'
                    }`}>
                      {entry.rank}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">{entry.displayName}</div>
                      <div className="text-xs text-muted">{entry.correctPicks} correct</div>
                    </div>
                    <div className="text-2xl font-bold text-primary">{entry.totalPoints}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
