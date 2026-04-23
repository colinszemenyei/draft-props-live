'use client';

import { useState } from 'react';
import { OnTheLineItem } from '@/lib/on-the-line';

// Displays every prop question that could be decided by the next draft
// pick, with entries bucketed by their answer so users can see who's
// cheering for what.

interface Props {
  items: OnTheLineItem[];
  nextPickNum: number | null;
}

export default function OnTheLine({ items, nextPickNum }: Props) {
  if (items.length === 0) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-5 text-center">
        <p className="text-sm text-muted">
          {nextPickNum === null
            ? 'Draft complete — all props resolved.'
            : 'No props on the line for this pick.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map(item => (
        <OnTheLineCard key={item.questionId} item={item} />
      ))}
    </div>
  );
}

function OnTheLineCard({ item }: { item: OnTheLineItem }) {
  const totalEntries = item.buckets.reduce((s, b) => s + b.entries.length, 0);
  const urgencyColor =
    item.urgency === 'This pick' || item.urgency === 'Next one clinches'
      ? 'bg-accent text-white'
      : item.urgency === 'In range' || item.urgency.startsWith('Next ')
        ? 'bg-amber-100 text-amber-800 border border-amber-200'
        : 'bg-primary/10 text-primary';

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-card-border">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-sm font-semibold flex-1">{item.questionText}</h3>
          <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${urgencyColor}`}>
            {item.urgency}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{item.points} pt{item.points === 1 ? '' : 's'}</span>
          <span>·</span>
          <span>{totalEntries} answered</span>
        </div>
        <p className="text-xs text-muted mt-1.5">{item.explainer}</p>
      </div>
      <div className="divide-y divide-card-border">
        {item.buckets.map(bucket => (
          <Bucket key={bucket.label} bucket={bucket} total={totalEntries} />
        ))}
      </div>
    </div>
  );
}

function Bucket({
  bucket,
  total,
}: {
  bucket: { label: string; entries: string[] };
  total: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = bucket.entries.length;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  if (count === 0) {
    return (
      <div className="px-4 py-2 flex items-center justify-between">
        <span className="text-sm text-muted">{bucket.label}</span>
        <span className="text-xs text-muted">—</span>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm font-semibold shrink-0">{bucket.label}</span>
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[40px]">
            <div
              className="h-full bg-primary/50 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-muted tabular-nums">
            {count} · {pct}%
          </span>
          <span className="text-muted text-xs">{expanded ? '▾' : '▸'}</span>
        </div>
      </button>
      {expanded && (
        <div className="mt-2 flex flex-wrap gap-1">
          {bucket.entries.map(name => (
            <span
              key={name}
              className="text-xs bg-white border border-card-border rounded-full px-2 py-0.5"
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
