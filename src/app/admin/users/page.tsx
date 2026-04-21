'use client';

import { useState, useEffect } from 'react';
import AppShell from '@/components/AppShell';

interface UserRow {
  id: string;
  displayName: string;
  isAdmin: boolean;
  contact: string | null;
  createdAt: string;
  entryCount: number;
  submittedCount: number;
  mockCount: number;
  mockSubmittedCount: number;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState<UserRow | null>(null);
  const [renameValue, setRenameValue] = useState('');

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/users');
    if (!res.ok) {
      setError('Not authorized or failed to load.');
      setLoading(false);
      return;
    }
    setUsers(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function deleteUser(user: UserRow) {
    const confirmation = window.prompt(
      `To permanently delete "${user.displayName}" and all their picks, mocks, and scores, type their display name exactly:`
    );
    if (confirmation === null) return;
    if (confirmation !== user.displayName) {
      alert('Name did not match. Nothing was deleted.');
      return;
    }
    const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      alert(`Failed: ${err.error}`);
      return;
    }
    await load();
  }

  async function saveRename() {
    if (!renaming) return;
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/admin/users/${renaming.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: trimmed }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      alert(`Failed: ${err.error}`);
      return;
    }
    setRenaming(null);
    setRenameValue('');
    await load();
  }

  if (loading) {
    return <AppShell><div className="md:ml-48 text-muted animate-pulse py-12 text-center">Loading users...</div></AppShell>;
  }
  if (error) {
    return <AppShell><div className="md:ml-48 text-center py-12 text-danger">{error}</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="md:ml-48">
        <h1 className="text-2xl font-bold mb-2">User Manager</h1>
        <p className="text-sm text-muted mb-6">
          Clean up duplicate accounts or rename users. Deleting a user removes
          their props, mocks, and scores permanently.
        </p>

        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="bg-card border border-card-border rounded-xl p-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold">{u.displayName}</span>
                  {u.isAdmin && (
                    <span className="text-xs bg-primary/30 text-primary-light px-2 py-0.5 rounded-full">admin</span>
                  )}
                </div>
                <div className="text-xs text-muted space-x-3">
                  <span>Props: {u.submittedCount}/{u.entryCount} submitted</span>
                  <span>Mocks: {u.mockSubmittedCount}/{u.mockCount} submitted</span>
                  <span>Joined: {new Date(u.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="text-xs mt-1">
                  {u.contact ? (
                    <span className="text-foreground font-mono">{u.contact}</span>
                  ) : (
                    <span className="text-amber-600">No contact info on file</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => { setRenaming(u); setRenameValue(u.displayName); }}
                  className="text-xs text-muted hover:text-primary px-2 py-1"
                >
                  Rename
                </button>
                <button
                  onClick={() => deleteUser(u)}
                  disabled={u.isAdmin}
                  className="text-xs text-muted hover:text-danger px-2 py-1 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={u.isAdmin ? "Can't delete admin users" : 'Delete user'}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {renaming && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setRenaming(null)}>
            <div className="bg-card border border-card-border rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-2">Rename user</h2>
              <p className="text-xs text-muted mb-4">Currently: <span className="font-mono">{renaming.displayName}</span></p>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm mb-4"
                placeholder="New display name"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setRenaming(null)}
                  className="text-sm px-3 py-1.5 text-muted hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={saveRename}
                  className="text-sm px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-light"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
