'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import AppShell from '@/components/AppShell';
import { inferPropsFromMock } from '@/lib/mock-to-props';
import { findContradictions } from '@/lib/contradiction-checker';

interface Question {
  id: string;
  questionText: string;
  questionType: string;
  answerOptions: string[] | null;
  points: number;
  category: string;
  scoringRule: Record<string, unknown> | null;
}

interface Prospect {
  rank: number;
  name: string;
  position: string;
  college: string;
  conference: string;
}

interface Entry {
  id: string;
  name: string;
  picks: Record<string, unknown>;
  submittedAt: string | null;
}

export default function PicksPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [picks, setPicks] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [lockTime, setLockTime] = useState<Date | null>(null);
  const [locked, setLocked] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const saveTimeout = useRef<NodeJS.Timeout>(null);
  const year = 2026;

  // Multi-entry state
  const [entries, setEntries] = useState<Entry[]>([]);
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);
  const [renamingEntry, setRenamingEntry] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // Mock draft state for inference + contradiction warnings
  const [mockPicks, setMockPicks] = useState<Record<number, string>>({});
  const [inferred, setInferred] = useState<Record<string, { value: unknown; reason: string }>>({});
  const [inferredApplied, setInferredApplied] = useState<Set<string>>(new Set()); // track which were auto-filled
  const [contradictionModal, setContradictionModal] = useState<{
    questionId: string;
    questionText: string;
    newValue: unknown;
    mockDetail: string;
    inferredValue: unknown;
  } | null>(null);

  // Shown when user clicks Submit but some questions are unanswered
  const [missingModal, setMissingModal] = useState<Question[] | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/questions?year=${year}`).then(r => r.json()),
      fetch(`/api/entries?year=${year}&list=1`).then(r => r.json()),
      fetch('/api/admin/year-settings').then(r => r.json()),
      fetch('/api/prospects').then(r => r.json()),
      fetch(`/api/mock-draft?year=${year}`).then(r => r.json()),
    ]).then(([q, entryList, years, p, mock]) => {
      setQuestions(q);
      setProspects(p);

      const currentYear = Array.isArray(years) ? years.find((y: { year: number }) => y.year === year) : null;
      if (currentYear) {
        const lt = new Date(currentYear.lockTime);
        setLockTime(lt);
        if (new Date() >= lt || currentYear.status === 'locked' || currentYear.status === 'live' || currentYear.status === 'complete') {
          setLocked(true);
        }
      }

      // Normalize entry list
      const list: Entry[] = Array.isArray(entryList)
        ? entryList.map((e: { id: string; name: string; picks: unknown; submittedAt: string | null }) => ({
            id: e.id,
            name: e.name || 'Entry 1',
            picks: (typeof e.picks === 'string' ? JSON.parse(e.picks) : e.picks || {}) as Record<string, unknown>,
            submittedAt: e.submittedAt,
          }))
        : [];
      setEntries(list);

      // Pick the first entry (or stay with null if none yet — one will be created on first save)
      const first = list[0];
      let existingPicks: Record<string, unknown> = {};
      if (first) {
        setCurrentEntryId(first.id);
        existingPicks = first.picks;
        if (first.submittedAt) setSubmitted(true);
      }

      // Load mock draft and infer answers
      const mockData = mock?.picks || {};
      setMockPicks(mockData);

      if (Object.keys(mockData).length > 0) {
        const inferredAnswers = inferPropsFromMock(q, mockData, p);
        setInferred(inferredAnswers);

        // Auto-fill unanswered questions with inferred values
        const merged = { ...existingPicks };
        const applied = new Set<string>();

        for (const [qId, inf] of Object.entries(inferredAnswers)) {
          if (merged[qId] === undefined || merged[qId] === null || merged[qId] === '') {
            merged[qId] = inf.value;
            applied.add(qId);
          }
        }

        setInferredApplied(applied);
        setPicks(merged);

        // If we auto-filled anything, save it
        if (applied.size > 0) {
          const targetEntryId = first?.id ?? null;
          setTimeout(async () => {
            const res = await fetch('/api/entries', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ year, entryId: targetEntryId, picks: merged, submitted: false }),
            });
            // Capture newly-created entry id so subsequent saves target the same row
            if (res.ok && !targetEntryId) {
              const created = await res.json();
              if (created?.id) {
                setCurrentEntryId(created.id);
                setEntries(prev => [
                  {
                    id: created.id,
                    name: created.name || 'Entry 1',
                    picks: merged,
                    submittedAt: null,
                  },
                  ...prev,
                ]);
              }
            }
          }, 500);
        }
      } else {
        setPicks(existingPicks);
      }

      setLoading(false);
    });
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!lockTime) return;
    const interval = setInterval(() => {
      const diff = lockTime.getTime() - Date.now();
      if (diff <= 0) {
        setLocked(true);
        setTimeLeft('Locked');
        clearInterval(interval);
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      if (days > 0) setTimeLeft(`${days}d ${hours}h ${mins}m`);
      else if (hours > 0) setTimeLeft(`${hours}h ${mins}m ${secs}s`);
      else setTimeLeft(`${mins}m ${secs}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [lockTime]);

  const savePicks = useCallback(async (newPicks: Record<string, unknown>, submit = false) => {
    if (locked) return;
    setSaving(true);
    try {
      const res = await fetch('/api/entries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, entryId: currentEntryId, picks: newPicks, submitted: submit }),
      });
      if (res.ok) {
        const saved = await res.json();
        // First save for this session — capture the id so later saves target it
        if (!currentEntryId && saved?.id) {
          setCurrentEntryId(saved.id);
          setEntries(prev => [
            {
              id: saved.id,
              name: saved.name || 'Entry 1',
              picks: newPicks,
              submittedAt: saved.submittedAt || null,
            },
            ...prev,
          ]);
        } else {
          // Keep the in-memory entry list in sync (picks + submittedAt)
          setEntries(prev => prev.map(e =>
            e.id === (saved?.id || currentEntryId)
              ? { ...e, picks: newPicks, submittedAt: saved?.submittedAt ?? e.submittedAt }
              : e
          ));
        }
      }
      setSaved(true);
      if (submit) setSubmitted(true);
    } finally {
      setSaving(false);
    }
  }, [locked, currentEntryId]);

  // Switch to a different entry — load its picks into state
  const switchEntry = (entryId: string) => {
    if (entryId === currentEntryId) return;
    // Flush any pending save before switching
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
      saveTimeout.current = null;
    }
    const target = entries.find(e => e.id === entryId);
    if (!target) return;
    setCurrentEntryId(entryId);
    setPicks(target.picks);
    setSubmitted(!!target.submittedAt);
    setInferredApplied(new Set()); // inferred highlights don't apply across entries
    setSaved(true);
    setRenamingEntry(false);
  };

  const createNewEntry = async () => {
    if (locked) return;
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
      saveTimeout.current = null;
    }
    const res = await fetch('/api/entries', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, picks: {}, submitted: false }),
    });
    if (!res.ok) return;
    const created = await res.json();
    const newEntry: Entry = {
      id: created.id,
      name: created.name || `Entry ${entries.length + 1}`,
      picks: {},
      submittedAt: null,
    };
    setEntries(prev => [...prev, newEntry]);
    setCurrentEntryId(created.id);
    setPicks({});
    setSubmitted(false);
    setInferredApplied(new Set());
  };

  const renameCurrentEntry = async () => {
    if (!currentEntryId) return;
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenamingEntry(false); return; }
    const res = await fetch('/api/entries', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, entryId: currentEntryId, name: trimmed }),
    });
    if (res.ok) {
      setEntries(prev => prev.map(e => e.id === currentEntryId ? { ...e, name: trimmed } : e));
    }
    setRenamingEntry(false);
  };

  const deleteCurrentEntry = async () => {
    if (!currentEntryId) return;
    if (entries.length <= 1) {
      alert("Can't delete your only entry. Create another first if you want to start over.");
      return;
    }
    const current = entries.find(e => e.id === currentEntryId);
    if (!confirm(`Delete "${current?.name}"? This can't be undone.`)) return;
    const res = await fetch(`/api/entries?entryId=${currentEntryId}`, { method: 'DELETE' });
    if (!res.ok) { alert('Failed to delete.'); return; }
    const remaining = entries.filter(e => e.id !== currentEntryId);
    setEntries(remaining);
    const next = remaining[0];
    setCurrentEntryId(next.id);
    setPicks(next.picks);
    setSubmitted(!!next.submittedAt);
  };

  const updatePick = (questionId: string, value: unknown) => {
    // Check if changing away from an inferred value
    if (inferred[questionId] && Object.keys(mockPicks).length > 0) {
      const inferredVal = inferred[questionId].value;
      const currentVal = picks[questionId];

      // If the new value differs from what the mock implies, warn
      if (value !== inferredVal && JSON.stringify(value) !== JSON.stringify(inferredVal)) {
        const q = questions.find(q => q.id === questionId);
        if (q) {
          setContradictionModal({
            questionId,
            questionText: q.questionText,
            newValue: value,
            mockDetail: inferred[questionId].reason,
            inferredValue: inferredVal,
          });
          return;
        }
      }
    }

    doUpdatePick(questionId, value);
  };

  const doUpdatePick = (questionId: string, value: unknown) => {
    const newPicks = { ...picks, [questionId]: value };
    setPicks(newPicks);
    setSaved(false);
    // Remove from inferred-applied if user manually changes it
    if (inferredApplied.has(questionId)) {
      const next = new Set(inferredApplied);
      next.delete(questionId);
      setInferredApplied(next);
    }
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => savePicks(newPicks), 1000);
  };

  const handleContradictionChoice = (choice: 'keep-change' | 'keep-mock' | 'go-mock') => {
    if (!contradictionModal) return;

    if (choice === 'keep-change') {
      doUpdatePick(contradictionModal.questionId, contradictionModal.newValue);
    } else if (choice === 'go-mock') {
      window.location.href = '/mock-draft';
      return;
    }
    // 'keep-mock' — just close, don't change the answer
    setContradictionModal(null);
  };

  // Count how many were auto-filled from mock
  const autoFilledCount = inferredApplied.size;

  if (loading) {
    return (
      <AppShell>
        <div className="flex justify-center py-12">
          <div className="text-muted animate-pulse">Loading questions...</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="md:ml-48">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">My Picks</h1>
            <p className="text-muted text-sm">{questions.length} questions</p>
          </div>
          <div className="text-right">
            {locked ? (
              <span className="bg-danger/20 text-danger text-sm px-3 py-1 rounded-full">Locked</span>
            ) : (
              <div>
                <div className="text-xs text-muted">Lock in</div>
                <div className="text-accent font-mono font-bold">{timeLeft}</div>
              </div>
            )}
          </div>
        </div>

        {/* Entry tabs */}
        <div className="mb-4 bg-card border border-card-border rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted font-semibold uppercase tracking-wide">Your Entries</p>
            {currentEntryId && !locked && (
              <div className="flex items-center gap-2">
                {entries.length > 1 && (
                  <button
                    onClick={deleteCurrentEntry}
                    className="text-xs text-muted hover:text-danger"
                    title="Delete this entry"
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={() => {
                    const cur = entries.find(e => e.id === currentEntryId);
                    setRenameValue(cur?.name || '');
                    setRenamingEntry(true);
                  }}
                  className="text-xs text-muted hover:text-primary"
                >
                  Rename
                </button>
              </div>
            )}
          </div>
          {renamingEntry ? (
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameCurrentEntry();
                  if (e.key === 'Escape') setRenamingEntry(false);
                }}
                className="flex-1 px-3 py-1.5 bg-background border border-card-border rounded-lg text-sm"
                placeholder="Entry name"
                maxLength={40}
              />
              <button
                onClick={renameCurrentEntry}
                className="text-sm px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-light"
              >
                Save
              </button>
              <button
                onClick={() => setRenamingEntry(false)}
                className="text-sm px-2 py-1.5 text-muted hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              {entries.map(e => (
                <button
                  key={e.id}
                  onClick={() => switchEntry(e.id)}
                  className={`shrink-0 text-sm px-3 py-1.5 rounded-lg whitespace-nowrap border transition ${
                    e.id === currentEntryId
                      ? 'bg-primary text-white border-primary'
                      : 'bg-background text-foreground border-card-border hover:bg-card'
                  }`}
                >
                  {e.name}
                  {e.submittedAt && <span className="ml-1.5 text-xs">✓</span>}
                </button>
              ))}
              {!locked && (
                <button
                  onClick={createNewEntry}
                  className="shrink-0 text-sm px-3 py-1.5 rounded-lg whitespace-nowrap border border-dashed border-card-border text-muted hover:text-primary hover:border-primary transition"
                >
                  + New Entry
                </button>
              )}
            </div>
          )}
          {entries.length > 1 && (
            <p className="text-xs text-muted mt-2">
              Each entry scores separately on the leaderboard.
            </p>
          )}
        </div>

        {/* Auto-filled banner */}
        {autoFilledCount > 0 && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <span className="text-blue-500 text-lg leading-none mt-0.5">🔗</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-800">
                  {autoFilledCount} answer{autoFilledCount > 1 ? 's' : ''} auto-filled from your mock draft
                </p>
                <p className="text-xs text-blue-600 mt-0.5">
                  These were pre-populated based on your mock. You can change them, but you&apos;ll see a warning if it creates a conflict.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Save indicator */}
        {!locked && (
          <div className="text-xs text-right mb-2">
            {saving ? (
              <span className="text-primary">Saving...</span>
            ) : saved ? (
              <span className="text-success">Saved</span>
            ) : (
              <span className="text-muted">Unsaved changes</span>
            )}
          </div>
        )}

        {/* Questions */}
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={idx + 1}
              value={picks[q.id]}
              onChange={(val) => updatePick(q.id, val)}
              disabled={locked}
              prospects={prospects}
              inferredFrom={inferred[q.id]?.reason}
              isAutoFilled={inferredApplied.has(q.id)}
            />
          ))}
        </div>

        {/* Submit */}
        {!locked && (
          <div className="mt-6 mb-8 space-y-3">
            <button
              onClick={() => {
                const unanswered = questions.filter(q => {
                  const v = picks[q.id];
                  if (v === undefined || v === null || v === '') return true;
                  if (Array.isArray(v) && v.length === 0) return true;
                  return false;
                });
                if (unanswered.length > 0) {
                  setMissingModal(unanswered);
                  return;
                }
                if (confirm('Submit your entry? You can still edit until lock time.')) {
                  savePicks(picks, true);
                }
              }}
              className="w-full bg-accent hover:bg-accent-light text-white font-bold py-3 rounded-lg transition shadow-sm"
            >
              {submitted ? 'Update Entry' : 'Submit Entry'}
            </button>
            {submitted && <p className="text-success text-xs text-center mt-2">Entry submitted!</p>}
            <a
              href="/mock-draft"
              className="block w-full text-center bg-primary hover:bg-primary-light text-white font-bold py-3 rounded-lg transition shadow-sm"
            >
              Next: Complete Your Mock Draft &rarr;
            </a>
          </div>
        )}
      </div>

      {/* Contradiction Modal */}
      {contradictionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setContradictionModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-slide-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">⚠️</span>
              <h3 className="text-lg font-bold text-amber-800">Heads Up!</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Changing this answer conflicts with your mock draft:
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
              <p className="text-xs font-semibold text-amber-800 mb-1">{contradictionModal.questionText}</p>
              <p className="text-xs text-amber-700">
                <span className="font-medium">Your mock says:</span> {contradictionModal.mockDetail}
              </p>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => handleContradictionChoice('keep-change')}
                className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-light transition"
              >
                Change Anyway (Leave Contradiction)
              </button>
              <button
                onClick={() => handleContradictionChoice('keep-mock')}
                className="w-full py-2.5 bg-white border border-card-border text-foreground rounded-lg text-sm font-semibold hover:bg-gray-50 transition"
              >
                Keep Current Answer
              </button>
              <button
                onClick={() => handleContradictionChoice('go-mock')}
                className="w-full py-2.5 bg-white border border-amber-300 text-amber-700 rounded-lg text-sm font-semibold hover:bg-amber-50 transition"
              >
                Go Fix My Mock Draft →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Missing answers modal */}
      {missingModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setMissingModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-slide-in max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">⚠️</span>
              <h3 className="text-lg font-bold text-amber-800">
                {missingModal.length} question{missingModal.length === 1 ? '' : 's'} unanswered
              </h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              You&apos;ll score 0 on anything you leave blank. Review the list, then submit.
            </p>
            <div className="flex-1 overflow-y-auto bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 space-y-2">
              {missingModal.map((q, idx) => (
                <button
                  key={q.id}
                  onClick={() => {
                    setMissingModal(null);
                    const el = document.getElementById(`question-${q.id}`);
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      el.classList.add('ring-2', 'ring-amber-400');
                      setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400'), 2000);
                    }
                  }}
                  className="block w-full text-left text-xs text-amber-900 hover:text-amber-700 hover:underline"
                >
                  {idx + 1}. {q.questionText}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <button
                onClick={() => setMissingModal(null)}
                className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-light transition"
              >
                Go Back & Fill Them In
              </button>
              <button
                onClick={() => {
                  setMissingModal(null);
                  savePicks(picks, true);
                }}
                className="w-full py-2.5 bg-white border border-card-border text-foreground rounded-lg text-sm font-semibold hover:bg-gray-50 transition"
              >
                Submit Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function QuestionCard({
  question,
  index,
  value,
  onChange,
  disabled,
  prospects,
  inferredFrom,
  isAutoFilled,
}: {
  question: Question;
  index: number;
  value: unknown;
  onChange: (val: unknown) => void;
  disabled: boolean;
  prospects: Prospect[];
  inferredFrom?: string;
  isAutoFilled?: boolean;
}) {
  return (
    <div
      id={`question-${question.id}`}
      className={`bg-card border rounded-xl p-4 shadow-sm animate-slide-in transition-all ${
        isAutoFilled ? 'border-blue-200 bg-blue-50/30' : 'border-card-border'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-muted">Q{index}</span>
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{question.category}</span>
            <span className="text-xs text-accent font-semibold">{question.points} pt{question.points > 1 ? 's' : ''}</span>
            {isAutoFilled && (
              <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">From Mock</span>
            )}
          </div>
          <p className="text-sm font-medium">{question.questionText}</p>
        </div>
      </div>

      {/* Inference hint */}
      {inferredFrom && value !== undefined && value !== null && value !== '' && (
        <div className="mb-2 text-xs text-blue-600 bg-blue-50 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
          <span>🔗</span>
          <span>{inferredFrom}</span>
        </div>
      )}

      <div className="mt-3">
        {question.questionType === 'multiple_choice' && (
          <MultipleChoice options={question.answerOptions || []} value={value as string} onChange={onChange} disabled={disabled} />
        )}
        {question.questionType === 'over_under' && (
          <ToggleButtons options={question.answerOptions || ['Over', 'Under']} value={value as string} onChange={onChange} disabled={disabled} />
        )}
        {question.questionType === 'yes_no' && (
          <ToggleButtons options={question.answerOptions || ['Yes', 'No']} value={value as string} onChange={onChange} disabled={disabled} />
        )}
        {question.questionType === 'player_name' && (
          <PlayerNameInput value={value as string || ''} onChange={onChange} disabled={disabled} prospects={prospects} />
        )}
        {question.questionType === 'pick_range' && (
          <MultipleChoice options={question.answerOptions || []} value={value as string} onChange={onChange} disabled={disabled} />
        )}
        {question.questionType === 'numeric' && (
          <NumericInput value={value as number} onChange={onChange} disabled={disabled} />
        )}
        {question.questionType === 'ordering' && (
          <OrderingInput items={question.answerOptions || []} value={value as string[] | undefined} onChange={onChange} disabled={disabled} />
        )}
      </div>
    </div>
  );
}

function MultipleChoice({ options, value, onChange, disabled }: {
  options: string[]; value: string; onChange: (v: string) => void; disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => !disabled && onChange(opt)}
          disabled={disabled}
          className={`text-left px-3 py-2.5 rounded-lg text-sm border transition ${
            value === opt
              ? 'border-primary bg-primary/10 text-primary font-semibold'
              : 'border-card-border bg-white text-foreground hover:border-muted'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function ToggleButtons({ options, value, onChange, disabled }: {
  options: string[]; value: string; onChange: (v: string) => void; disabled: boolean;
}) {
  return (
    <div className="flex gap-2">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => !disabled && onChange(opt)}
          disabled={disabled}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition ${
            value === opt
              ? opt === 'Over' || opt === 'Yes' ? 'border-success bg-success/10 text-success' : 'border-danger bg-danger/10 text-danger'
              : 'border-card-border bg-background text-foreground hover:border-muted'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function PlayerNameInput({ value, onChange, disabled, prospects }: {
  value: string; onChange: (v: string) => void; disabled: boolean; prospects: Prospect[];
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const filtered = value.length >= 2
    ? prospects.filter(p => p.name.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : [];

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setShowSuggestions(true); }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        disabled={disabled}
        className="w-full bg-background border border-card-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition disabled:opacity-60"
        placeholder="Type a player name..."
      />
      {showSuggestions && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-card border border-card-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(p => (
            <button
              key={p.name}
              onMouseDown={() => { onChange(p.name); setShowSuggestions(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-primary/20 transition"
            >
              <span className="text-foreground">{p.name}</span>
              <span className="text-muted ml-2 text-xs">{p.position} - {p.college}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NumericInput({ value, onChange, disabled }: {
  value: number; onChange: (v: number) => void; disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => !disabled && onChange(Math.max(0, (value || 0) - 1))}
        disabled={disabled}
        className="w-10 h-10 rounded-lg bg-background border border-card-border text-lg font-bold hover:border-muted transition disabled:opacity-60"
      >
        -
      </button>
      <span className="text-2xl font-bold text-primary w-12 text-center">{value || 0}</span>
      <button
        onClick={() => !disabled && onChange((value || 0) + 1)}
        disabled={disabled}
        className="w-10 h-10 rounded-lg bg-background border border-card-border text-lg font-bold hover:border-muted transition disabled:opacity-60"
      >
        +
      </button>
    </div>
  );
}

function OrderingInput({ items, value, onChange, disabled }: {
  items: string[]; value: string[] | undefined; onChange: (v: string[]) => void; disabled: boolean;
}) {
  const order = value || items;

  const moveUp = (idx: number) => {
    if (idx === 0 || disabled) return;
    const newOrder = [...order];
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    onChange(newOrder);
  };

  const moveDown = (idx: number) => {
    if (idx === order.length - 1 || disabled) return;
    const newOrder = [...order];
    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    onChange(newOrder);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted mb-2">Drag or use arrows to reorder (earliest pick first)</p>
      {order.map((item, idx) => (
        <div
          key={item}
          className="flex items-center gap-2 bg-background border border-card-border rounded-lg px-3 py-2"
        >
          <span className="text-primary font-bold text-sm w-6">{idx + 1}.</span>
          <span className="flex-1 text-sm">{item}</span>
          <div className="flex gap-1">
            <button
              onClick={() => moveUp(idx)}
              disabled={disabled || idx === 0}
              className="text-muted hover:text-foreground disabled:opacity-30 text-xs px-1"
            >
              ▲
            </button>
            <button
              onClick={() => moveDown(idx)}
              disabled={disabled || idx === order.length - 1}
              className="text-muted hover:text-foreground disabled:opacity-30 text-xs px-1"
            >
              ▼
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
