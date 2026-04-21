'use client';

import { useState, useEffect } from 'react';
import AppShell from '@/components/AppShell';

interface FinanceConfig {
  entryFee: string;
  payoutDescription: string;
  paymentInstructions: string;
}

const DEFAULT_CONFIG: FinanceConfig = {
  entryFee: '',
  payoutDescription: '',
  paymentInstructions: '',
};

export default function AdminFinancesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<FinanceConfig>(DEFAULT_CONFIG);
  const [message, setMessage] = useState('');
  const year = 2026;

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/year-settings');
      if (!res.ok) { setLoading(false); return; }
      const years = await res.json();
      const current = Array.isArray(years) ? years.find((y: { year: number }) => y.year === year) : null;
      if (current?.financeConfig) {
        const cfg = typeof current.financeConfig === 'string'
          ? JSON.parse(current.financeConfig)
          : current.financeConfig;
        setConfig({
          entryFee: cfg.entryFee || '',
          payoutDescription: cfg.payoutDescription || '',
          paymentInstructions: cfg.paymentInstructions || '',
        });
      }
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    setMessage('');
    const res = await fetch('/api/admin/year-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, financeConfig: config }),
    });
    setSaving(false);
    if (res.ok) {
      setMessage('Saved. Players will see the updated info on their next login.');
      setTimeout(() => setMessage(''), 4000);
    } else {
      const err = await res.json().catch(() => ({ error: 'Save failed' }));
      setMessage(`Error: ${err.error}`);
    }
  }

  if (loading) {
    return <AppShell><div className="md:ml-48 text-muted animate-pulse py-12 text-center">Loading…</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="md:ml-48 max-w-2xl">
        <h1 className="text-2xl font-bold mb-2">Finances</h1>
        <p className="text-sm text-muted mb-6">
          Set the entry fee, payout structure, and where players should send
          money. This shows up in a popup when players log in.
        </p>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-1">Entry Fee</label>
            <input
              type="text"
              value={config.entryFee}
              onChange={(e) => setConfig({ ...config, entryFee: e.target.value })}
              placeholder="e.g. $20"
              className="w-full px-3 py-2 bg-white border border-card-border rounded-lg text-sm"
              maxLength={60}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Payout Structure</label>
            <textarea
              value={config.payoutDescription}
              onChange={(e) => setConfig({ ...config, payoutDescription: e.target.value })}
              placeholder={
                '75/25 winner & 2nd if we get 10+ entries.\n' +
                '100% winner if fewer.\n' +
                '60/30/10 if 20+ entries.'
              }
              rows={5}
              className="w-full px-3 py-2 bg-white border border-card-border rounded-lg text-sm font-mono"
              maxLength={1000}
            />
            <p className="text-xs text-muted mt-1">
              Free-form. Line breaks are preserved. Tell players exactly how the pot gets split.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Payment Instructions</label>
            <textarea
              value={config.paymentInstructions}
              onChange={(e) => setConfig({ ...config, paymentInstructions: e.target.value })}
              placeholder={'Venmo @zach-handle\nZelle 555-555-5555'}
              rows={3}
              className="w-full px-3 py-2 bg-white border border-card-border rounded-lg text-sm font-mono"
              maxLength={500}
            />
            <p className="text-xs text-muted mt-1">
              Where should people send the entry fee? Venmo, Zelle, PayPal, cash — whatever you prefer.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-accent text-white font-semibold rounded-lg hover:bg-accent-light transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            {message && <span className="text-sm text-success">{message}</span>}
          </div>
        </div>

        {/* Preview */}
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
            Popup Preview
          </h2>
          <div className="bg-card border border-card-border rounded-xl p-5">
            <h3 className="text-lg font-bold mb-3">💰 Pool Info</h3>
            {config.entryFee && (
              <div className="mb-3">
                <div className="text-xs text-muted uppercase tracking-wide">Entry Fee</div>
                <div className="text-lg font-semibold">{config.entryFee}</div>
              </div>
            )}
            {config.payoutDescription && (
              <div className="mb-3">
                <div className="text-xs text-muted uppercase tracking-wide">Payout</div>
                <div className="text-sm whitespace-pre-line">{config.payoutDescription}</div>
              </div>
            )}
            {config.paymentInstructions && (
              <div>
                <div className="text-xs text-muted uppercase tracking-wide">How to Pay</div>
                <div className="text-sm whitespace-pre-line">{config.paymentInstructions}</div>
              </div>
            )}
            {!config.entryFee && !config.payoutDescription && !config.paymentInstructions && (
              <p className="text-sm text-muted italic">
                Fill in the fields above to see the popup preview.
              </p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
