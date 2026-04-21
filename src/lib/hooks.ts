'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface User {
  userId: string;
  displayName: string;
  isAdmin: boolean;
  contact: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        setUser(await res.json());
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = async (displayName: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, password }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Login failed');
    }
    await checkAuth();
  };

  const register = async (displayName: string, password: string, contact: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, password, contact }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Registration failed');
    }
    await checkAuth();
  };

  const updateContact = async (contact: string) => {
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to update contact');
    }
    await checkAuth();
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  const updateDisplayName = async (newName: string) => {
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: newName }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to update name');
    }
    await checkAuth();
  };

  return { user, loading, login, register, logout, updateDisplayName, updateContact };
}

export function useSSE(url: string) {
  const [lastEvent, setLastEvent] = useState<{ event: string; data: unknown } | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const source = new EventSource(url);
    sourceRef.current = source;

    source.addEventListener('new_pick', (e) => {
      setLastEvent({ event: 'new_pick', data: JSON.parse(e.data) });
    });

    source.addEventListener('score_update', (e) => {
      setLastEvent({ event: 'score_update', data: JSON.parse(e.data) });
    });

    source.addEventListener('status_change', (e) => {
      setLastEvent({ event: 'status_change', data: JSON.parse(e.data) });
    });

    return () => source.close();
  }, [url]);

  return lastEvent;
}

export function useDraftYear() {
  return parseInt(process.env.NEXT_PUBLIC_DRAFT_YEAR || '2026');
}
