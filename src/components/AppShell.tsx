'use client';

import { useAuth, useSSE } from '@/lib/hooks';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/picks', label: 'Props', icon: '📋' },
  { href: '/mock-draft', label: 'Mock', icon: '📝' },
  { href: '/leaderboard', label: 'Board', icon: '🏆' },
  { href: '/draft-board', label: 'Draft', icon: '🏈' },
  { href: '/entries', label: 'Entries', icon: '👥' },
];

const ADMIN_NAV = [
  { href: '/admin/questions', label: 'Questions' },
  { href: '/admin/draft', label: 'Draft Mgr' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/settings', label: 'Settings' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, login, register, logout, updateDisplayName, updateContact } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [contact, setContact] = useState('');
  const [error, setError] = useState('');
  const [draftStatus, setDraftStatus] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState('');
  const [contactValue, setContactValue] = useState('');
  const [contactError, setContactError] = useState('');
  const pathname = usePathname();

  const sseEvent = useSSE('/api/sse/draft');

  useEffect(() => {
    if (sseEvent?.event === 'new_pick') {
      const pick = sseEvent.data as { pickNumber: number; playerName: string; team: string; position: string };
      setDraftStatus(`Pick ${pick.pickNumber} is in — ${pick.playerName} (${pick.position}) to ${pick.team}`);
    }
    if (sseEvent?.event === 'status_change') {
      const data = sseEvent.data as { status: string };
      setDraftStatus(`Draft status: ${data.status}`);
    }
  }, [sseEvent]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-primary text-xl font-bold animate-pulse">Draft Props Live</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-primary mb-2">Draft Props Live</h1>
            <p className="text-muted text-sm">NFL Draft Prop Pool 2026</p>
          </div>

          <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
            <div className="flex mb-6">
              <button
                onClick={() => { setAuthMode('login'); setError(''); }}
                className={`flex-1 py-2 text-center text-sm font-semibold rounded-l-lg transition ${
                  authMode === 'login' ? 'bg-primary text-white' : 'bg-card-border text-muted'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setAuthMode('register'); setError(''); }}
                className={`flex-1 py-2 text-center text-sm font-semibold rounded-r-lg transition ${
                  authMode === 'register' ? 'bg-primary text-white' : 'bg-card-border text-muted'
                }`}
              >
                Join the Pool
              </button>
            </div>

            {error && (
              <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg p-3 mb-4">
                {error}
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError('');
                try {
                  if (authMode === 'login') {
                    await login(displayName, password);
                  } else {
                    await register(displayName, password, contact);
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Something went wrong');
                }
              }}
            >
              <div className="mb-4">
                <label className="block text-sm text-muted mb-1">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-white border border-card-border rounded-lg px-3 py-2.5 text-foreground focus:outline-none focus:border-primary transition"
                  placeholder="Your name"
                  required
                />
              </div>
              <div className={authMode === 'register' ? 'mb-4' : 'mb-6'}>
                <label className="block text-sm text-muted mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white border border-card-border rounded-lg px-3 py-2.5 text-foreground focus:outline-none focus:border-primary transition"
                  placeholder="Password"
                  required
                />
              </div>
              {authMode === 'register' && (
                <div className="mb-6">
                  <label className="block text-sm text-muted mb-1">Email or Phone</label>
                  <input
                    type="text"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    className="w-full bg-white border border-card-border rounded-lg px-3 py-2.5 text-foreground focus:outline-none focus:border-primary transition"
                    placeholder="you@example.com or 555-555-5555"
                    required
                    maxLength={120}
                  />
                  <p className="text-xs text-muted mt-1">
                    So the commissioner can reach you for payment. Not shown publicly.
                  </p>
                </div>
              )}
              <button
                type="submit"
                className="w-full bg-accent hover:bg-accent-light text-white font-bold py-2.5 rounded-lg transition"
              >
                {authMode === 'login' ? 'Sign In' : 'Join the Pool'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Force existing users to fill in contact info before using the app.
  // Blocks the whole UI with a modal that has no dismiss button.
  if (!user.contact) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm bg-card border border-card-border rounded-xl p-6 shadow-sm">
          <h1 className="text-xl font-bold mb-2">One quick thing</h1>
          <p className="text-sm text-muted mb-4">
            We need a way for the commissioner to reach you for payment. Please
            add an email or phone number to continue.
          </p>
          {contactError && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg p-3 mb-3">
              {contactError}
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setContactError('');
              const v = contactValue.trim();
              if (!v) {
                setContactError('Please enter an email or phone number');
                return;
              }
              try {
                await updateContact(v);
              } catch (err) {
                setContactError(err instanceof Error ? err.message : 'Failed to save');
              }
            }}
          >
            <input
              type="text"
              value={contactValue}
              onChange={(e) => setContactValue(e.target.value)}
              className="w-full bg-white border border-card-border rounded-lg px-3 py-2.5 text-foreground focus:outline-none focus:border-primary transition mb-2"
              placeholder="you@example.com or 555-555-5555"
              maxLength={120}
              autoFocus
            />
            <p className="text-xs text-muted mb-4">
              Visible to the commissioner only. Not shown to other players.
            </p>
            <button
              type="submit"
              className="w-full bg-accent hover:bg-accent-light text-white font-bold py-2.5 rounded-lg transition"
            >
              Save & Continue
            </button>
            <button
              type="button"
              onClick={logout}
              className="w-full mt-2 text-xs text-muted hover:text-foreground"
            >
              Sign out instead
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pb-16 md:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-primary text-white shadow-md">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/picks" className="font-bold text-white text-lg">Draft Props Live</Link>
          <div className="flex items-center gap-3">
            {draftStatus && (
              <span className="hidden md:block text-xs text-white/80 bg-white/10 px-2 py-1 rounded-full max-w-xs truncate">
                {draftStatus}
              </span>
            )}
            {editingName ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setNameError('');
                  try {
                    await updateDisplayName(newName);
                    setEditingName(false);
                  } catch (err) {
                    setNameError(err instanceof Error ? err.message : 'Failed');
                  }
                }}
                className="flex items-center gap-1"
              >
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="bg-white/20 text-white text-sm rounded px-2 py-0.5 w-28 focus:outline-none focus:bg-white/30 placeholder-white/50"
                  placeholder="New name"
                  autoFocus
                  maxLength={30}
                />
                <button type="submit" className="text-xs text-white/90 hover:text-white">✓</button>
                <button type="button" onClick={() => { setEditingName(false); setNameError(''); }} className="text-xs text-white/60 hover:text-white">✕</button>
                {nameError && <span className="text-xs text-red-300">{nameError}</span>}
              </form>
            ) : (
              <button
                onClick={() => { setNewName(user.displayName); setEditingName(true); setNameError(''); }}
                className="text-sm text-white/80 hover:text-white transition flex items-center gap-1"
                title="Edit display name"
              >
                {user.displayName}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 opacity-50"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.05 10.476a.75.75 0 0 0-.188.343l-.816 2.858a.75.75 0 0 0 .926.926l2.858-.816a.75.75 0 0 0 .343-.188l7.963-7.963a1.75 1.75 0 0 0 0-2.475l-.648-.648Zm-1.414 1.06a.25.25 0 0 1 .354 0l.648.649a.25.25 0 0 1 0 .354L5.3 12.352l-1.663.475.475-1.663 7.962-7.962Z"/></svg>
              </button>
            )}
            {user.isAdmin && (
              <span className="text-xs bg-accent text-white px-2 py-0.5 rounded-full">Admin</span>
            )}
            <button onClick={logout} className="text-xs text-white/70 hover:text-white transition">
              Logout
            </button>
          </div>
        </div>
        {draftStatus && (
          <div className="md:hidden bg-accent text-white text-xs text-center py-1.5 px-4 truncate">
            {draftStatus}
          </div>
        )}
        {/* Admin nav */}
        {user.isAdmin && pathname.startsWith('/admin') && (
          <div className="bg-primary-light border-t border-white/10">
            <div className="max-w-5xl mx-auto px-4 flex gap-1">
              {ADMIN_NAV.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 text-xs font-medium transition ${
                    pathname === item.href ? 'text-white border-b-2 border-white' : 'text-white/60 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Main */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-4">
        {children}
      </main>

      {/* Bottom Nav (mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-card-border md:hidden z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] pb-safe">
        <div className="flex justify-around">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center py-2 px-3 text-xs transition ${
                pathname === item.href ? 'text-primary font-semibold' : 'text-muted'
              }`}
            >
              <span className="text-lg mb-0.5">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
          {user.isAdmin && (
            <Link
              href="/admin/questions"
              className={`flex flex-col items-center py-2 px-3 text-xs transition ${
                pathname.startsWith('/admin') ? 'text-primary font-semibold' : 'text-muted'
              }`}
            >
              <span className="text-lg mb-0.5">⚙️</span>
              <span>Admin</span>
            </Link>
          )}
        </div>
      </nav>

      {/* Desktop sidebar nav */}
      <nav className={`hidden md:block fixed left-0 w-48 bg-card border-r border-card-border p-4 overflow-y-auto ${
        user.isAdmin && pathname.startsWith('/admin')
          ? 'top-[90px] h-[calc(100vh-90px)]'
          : 'top-14 h-[calc(100vh-56px)]'
      }`}>
        <div className="flex flex-col gap-1">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                pathname === item.href ? 'bg-primary/10 text-primary font-semibold' : 'text-muted hover:text-foreground hover:bg-card-border/50'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
          <Link
            href="/history"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
              pathname === '/history' ? 'bg-primary/10 text-primary font-semibold' : 'text-muted hover:text-foreground hover:bg-card-border/50'
            }`}
          >
            <span>📚</span>
            <span>History</span>
          </Link>
          {user.isAdmin && (
            <>
              <div className="border-t border-card-border my-2" />
              <Link
                href="/admin/questions"
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                  pathname.startsWith('/admin') ? 'bg-primary/10 text-primary font-semibold' : 'text-muted hover:text-foreground hover:bg-card-border/50'
                }`}
              >
                <span>⚙️</span>
                <span>Admin Panel</span>
              </Link>
            </>
          )}
        </div>
      </nav>
    </div>
  );
}
