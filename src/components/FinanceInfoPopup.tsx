'use client';

import { useEffect, useState } from 'react';

interface FinanceInfo {
  entryFee: string;
  payoutDescription: string;
  paymentInstructions: string;
}

// Shows a pool-info popup once per browser session. Dismissal is stored
// in sessionStorage so signing out and back in makes it reappear, but
// navigating between pages in the same session does not.
export default function FinanceInfoPopup({ userId }: { userId: string }) {
  const [info, setInfo] = useState<FinanceInfo | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const key = `finance-seen-${userId}`;
    if (sessionStorage.getItem(key)) return;

    fetch('/api/finance-info?year=2026')
      .then(r => (r.ok ? r.json() : null))
      .then((data: FinanceInfo | null) => {
        if (!data) return;
        // Only show if at least one field has content
        if (!data.entryFee && !data.payoutDescription && !data.paymentInstructions) return;
        setInfo(data);
        setVisible(true);
      })
      .catch(() => { /* silent */ });
  }, [userId]);

  const dismiss = () => {
    setVisible(false);
    try {
      sessionStorage.setItem(`finance-seen-${userId}`, '1');
    } catch {
      // private-browsing or storage-disabled — just close for this page
    }
  };

  if (!visible || !info) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={dismiss}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">💰</span>
          <h3 className="text-lg font-bold">Pool Info</h3>
        </div>

        {info.entryFee && (
          <div className="mb-3">
            <div className="text-xs text-muted uppercase tracking-wide">Entry Fee</div>
            <div className="text-xl font-semibold">{info.entryFee}</div>
          </div>
        )}

        {info.payoutDescription && (
          <div className="mb-3">
            <div className="text-xs text-muted uppercase tracking-wide">Payout</div>
            <div className="text-sm whitespace-pre-line text-gray-700">
              {info.payoutDescription}
            </div>
          </div>
        )}

        {info.paymentInstructions && (
          <div className="mb-5">
            <div className="text-xs text-muted uppercase tracking-wide">How to Pay</div>
            <div className="text-sm whitespace-pre-line text-gray-700">
              {info.paymentInstructions}
            </div>
          </div>
        )}

        <button
          onClick={dismiss}
          className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-light transition"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
