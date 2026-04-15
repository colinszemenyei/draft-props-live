'use client';

import { useState, useEffect } from 'react';
import AppShell from '@/components/AppShell';

interface DraftPick {
  id: string;
  pickNumber: number;
  team: string;
  playerName: string;
  position: string;
  college: string;
  conference: string;
}

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'DT', 'LB', 'CB', 'S'];

export default function AdminDraftPage() {
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraperStatus, setScraperStatus] = useState<{ isPolling: boolean; failureCount: number } | null>(null);
  const year = 2026;

  // Form
  const [pickNumber, setPickNumber] = useState(1);
  const [team, setTeam] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [position, setPosition] = useState('QB');
  const [college, setCollege] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [picksRes, statusRes] = await Promise.all([
      fetch(`/api/draft-picks?year=${year}`).then(r => r.json()),
      fetch('/api/admin/scraper').then(r => r.json()).catch(() => null),
    ]);
    setPicks(picksRes);
    setScraperStatus(statusRes);
    setPickNumber(picksRes.length > 0 ? Math.max(...picksRes.map((p: DraftPick) => p.pickNumber)) + 1 : 1);
    setLoading(false);
  }

  async function savePick() {
    if (!playerName || !team) return;

    if (editingId) {
      await fetch(`/api/draft-picks/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team, playerName, position, college }),
      });
    } else {
      await fetch('/api/draft-picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, pickNumber, team, playerName, position, college }),
      });
    }

    setEditingId(null);
    setTeam('');
    setPlayerName('');
    setCollege('');
    loadData();
  }

  function editPick(pick: DraftPick) {
    setEditingId(pick.id);
    setPickNumber(pick.pickNumber);
    setTeam(pick.team);
    setPlayerName(pick.playerName);
    setPosition(pick.position);
    setCollege(pick.college);
  }

  async function triggerRescore() {
    await fetch('/api/admin/rescore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year }),
    });
    alert('Rescore complete!');
  }

  async function scraperAction(action: string) {
    await fetch('/api/admin/scraper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, year }),
    });
    const status = await fetch('/api/admin/scraper').then(r => r.json());
    setScraperStatus(status);
    if (action === 'poll') loadData();
  }

  if (loading) {
    return <AppShell><div className="md:ml-48 text-muted animate-pulse py-12 text-center">Loading...</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="md:ml-48">
        <h1 className="text-2xl font-bold mb-6">Draft Manager</h1>

        {/* Scraper Controls */}
        <div className="bg-card border border-card-border rounded-xl p-4 mb-6">
          <h2 className="text-sm font-bold text-primary mb-3">Live Scraper</h2>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`text-xs px-2 py-1 rounded-full ${
              scraperStatus?.isPolling ? 'bg-success/20 text-success' : 'bg-muted/20 text-muted'
            }`}>
              {scraperStatus?.isPolling ? 'Active' : 'Stopped'}
            </span>
            {scraperStatus && scraperStatus.failureCount > 0 && (
              <span className="text-xs text-danger">{scraperStatus.failureCount} failures</span>
            )}
            <button onClick={() => scraperAction('poll')} className="text-xs bg-primary hover:bg-primary-light text-white px-3 py-1.5 rounded-lg transition">
              Poll Now
            </button>
            <button onClick={() => scraperAction('start')} className="text-xs bg-success/20 text-success hover:bg-success/30 px-3 py-1.5 rounded-lg transition">
              Start Polling
            </button>
            <button onClick={() => scraperAction('stop')} className="text-xs bg-danger/20 text-danger hover:bg-danger/30 px-3 py-1.5 rounded-lg transition">
              Stop Polling
            </button>
            <button onClick={triggerRescore} className="text-xs bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg transition">
              Re-Score All
            </button>
          </div>
        </div>

        {/* Manual Pick Entry */}
        <div className="bg-card border border-card-border rounded-xl p-4 mb-6">
          <h2 className="text-sm font-bold text-primary mb-3">{editingId ? 'Edit Pick' : 'Enter Pick Manually'}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted">Pick #</label>
              <input
                type="number"
                value={pickNumber}
                onChange={(e) => setPickNumber(parseInt(e.target.value) || 1)}
                disabled={!!editingId}
                className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
                min={1} max={32}
              />
            </div>
            <div>
              <label className="text-xs text-muted">Team</label>
              <input
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                placeholder="e.g. Las Vegas Raiders"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Player Name</label>
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                placeholder="e.g. Fernando Mendoza"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Position</label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted">College</label>
              <input
                value={college}
                onChange={(e) => setCollege(e.target.value)}
                className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                placeholder="e.g. Indiana"
              />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={savePick} className="bg-accent hover:bg-accent-light text-white text-sm font-bold px-4 py-2 rounded-lg transition">
                {editingId ? 'Update' : 'Add Pick'}
              </button>
              {editingId && (
                <button onClick={() => { setEditingId(null); setTeam(''); setPlayerName(''); setCollege(''); }} className="text-muted text-sm hover:text-foreground">
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Picks List */}
        <div className="space-y-2">
          {picks.map(pick => (
            <div key={pick.id} className="bg-card border border-card-border rounded-lg p-3 flex items-center gap-3">
              <span className="text-primary font-bold w-8">#{pick.pickNumber}</span>
              <div className="flex-1">
                <span className="font-semibold text-sm">{pick.playerName}</span>
                <span className="text-xs text-muted ml-2">{pick.position} — {pick.college} ({pick.conference})</span>
              </div>
              <span className="text-xs text-muted">{pick.team}</span>
              <button onClick={() => editPick(pick)} className="text-xs text-muted hover:text-primary">Edit</button>
            </div>
          ))}
          {picks.length === 0 && <p className="text-muted text-center py-8">No picks recorded yet</p>}
        </div>
      </div>
    </AppShell>
  );
}
