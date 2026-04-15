'use client';

import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';

export default function Home() {
  const router = useRouter();

  return (
    <AppShell>
      <div className="text-center py-12 md:ml-48">
        <h1 className="text-4xl font-bold text-primary mb-4">Draft Props Live</h1>
        <p className="text-muted mb-8 max-w-md mx-auto">
          Make your picks for the 2026 NFL Draft. Compete against friends in real-time as the picks come in.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <button
            onClick={() => router.push('/picks')}
            className="bg-accent hover:bg-accent-light text-white font-bold px-6 py-3 rounded-lg transition shadow-sm"
          >
            Make My Picks
          </button>
          <button
            onClick={() => router.push('/leaderboard')}
            className="bg-white border border-card-border hover:border-primary text-foreground font-bold px-6 py-3 rounded-lg transition shadow-sm"
          >
            View Leaderboard
          </button>
        </div>
      </div>
    </AppShell>
  );
}
