'use client';

import { useState, useEffect } from 'react';
import AppShell from '@/components/AppShell';

interface Question {
  id: string;
  questionText: string;
  questionType: string;
  answerOptions: string[] | null;
  correctAnswer: string | null;
  points: number;
  category: string;
  sortOrder: number;
  scoringRule: Record<string, unknown> | null;
}

const QUESTION_TYPES = [
  'multiple_choice', 'player_name', 'over_under', 'numeric', 'ordering', 'yes_no', 'pick_range'
];

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editing, setEditing] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const year = 2026;

  // Form state
  const [formText, setFormText] = useState('');
  const [formType, setFormType] = useState('multiple_choice');
  const [formOptions, setFormOptions] = useState('');
  const [formPoints, setFormPoints] = useState(1);
  const [formCategory, setFormCategory] = useState('');
  const [formCorrectAnswer, setFormCorrectAnswer] = useState('');

  useEffect(() => { loadQuestions(); }, []);

  async function loadQuestions() {
    const res = await fetch(`/api/questions?year=${year}`);
    setQuestions(await res.json());
    setLoading(false);
  }

  function openEdit(q: Question) {
    setEditing(q);
    setFormText(q.questionText);
    setFormType(q.questionType);
    setFormOptions(q.answerOptions?.join('\n') || '');
    setFormPoints(q.points);
    setFormCategory(q.category || '');
    setFormCorrectAnswer(q.correctAnswer || '');
    setShowForm(true);
  }

  function openNew() {
    setEditing(null);
    setFormText('');
    setFormType('multiple_choice');
    setFormOptions('');
    setFormPoints(1);
    setFormCategory('');
    setFormCorrectAnswer('');
    setShowForm(true);
  }

  async function saveQuestion() {
    const opts = formOptions.split('\n').map(o => o.trim()).filter(Boolean);
    const body = {
      year,
      questionText: formText,
      questionType: formType,
      answerOptions: opts.length > 0 ? opts : null,
      points: formPoints,
      category: formCategory,
      correctAnswer: formCorrectAnswer || null,
      sortOrder: editing?.sortOrder || questions.length + 1,
      scoringRule: editing?.scoringRule || { type: 'manual' },
    };

    if (editing) {
      await fetch(`/api/questions/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else {
      await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    setShowForm(false);
    loadQuestions();
  }

  async function deleteQuestion(id: string) {
    if (!confirm('Delete this question?')) return;
    await fetch(`/api/questions/${id}`, { method: 'DELETE' });
    loadQuestions();
  }

  async function moveQuestion(id: string, direction: 'up' | 'down') {
    const idx = questions.findIndex(q => q.id === id);
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === questions.length - 1) return;

    const newQuestions = [...questions];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newQuestions[idx], newQuestions[swapIdx]] = [newQuestions[swapIdx], newQuestions[idx]];

    const order = newQuestions.map((q, i) => ({ id: q.id, sortOrder: i + 1 }));
    await fetch('/api/questions/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    loadQuestions();
  }

  if (loading) {
    return <AppShell><div className="md:ml-48 text-muted animate-pulse py-12 text-center">Loading questions...</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="md:ml-48">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Question Manager</h1>
          <button onClick={openNew} className="bg-accent hover:bg-accent-light text-white text-sm font-bold px-4 py-2 rounded-lg transition">
            + Add Question
          </button>
        </div>

        {/* Question List */}
        <div className="space-y-2">
          {questions.map((q, idx) => (
            <div key={q.id} className="bg-card border border-card-border rounded-xl p-4 flex items-start gap-3">
              <div className="flex flex-col gap-1 mt-1">
                <button onClick={() => moveQuestion(q.id, 'up')} disabled={idx === 0} className="text-muted hover:text-foreground disabled:opacity-30 text-xs">▲</button>
                <button onClick={() => moveQuestion(q.id, 'down')} disabled={idx === questions.length - 1} className="text-muted hover:text-foreground disabled:opacity-30 text-xs">▼</button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-primary">Q{idx + 1}</span>
                  <span className="text-xs bg-primary/30 text-primary-light px-2 py-0.5 rounded-full">{q.questionType}</span>
                  <span className="text-xs text-muted">{q.points} pts</span>
                  {q.category && <span className="text-xs text-muted">| {q.category}</span>}
                </div>
                <p className="text-sm">{q.questionText}</p>
                {q.answerOptions && (
                  <p className="text-xs text-muted mt-1">{q.answerOptions.join(' | ')}</p>
                )}
                {q.correctAnswer && (
                  <p className="text-xs text-success mt-1">Answer: {q.correctAnswer}</p>
                )}
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(q)} className="text-xs text-muted hover:text-primary px-2 py-1">Edit</button>
                <button onClick={() => deleteQuestion(q.id)} className="text-xs text-muted hover:text-danger px-2 py-1">Del</button>
              </div>
            </div>
          ))}
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-card-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold mb-4">{editing ? 'Edit Question' : 'New Question'}</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-muted mb-1">Question Text</label>
                  <textarea
                    value={formText}
                    onChange={(e) => setFormText(e.target.value)}
                    className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-muted mb-1">Type</label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                      className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    >
                      {QUESTION_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-muted mb-1">Points</label>
                    <input
                      type="number"
                      value={formPoints}
                      onChange={(e) => setFormPoints(parseInt(e.target.value) || 1)}
                      className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                      min={1}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-muted mb-1">Category</label>
                  <input
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    placeholder="e.g. Position, Over/Under"
                  />
                </div>

                <div>
                  <label className="block text-sm text-muted mb-1">Answer Options (one per line)</label>
                  <textarea
                    value={formOptions}
                    onChange={(e) => setFormOptions(e.target.value)}
                    className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    rows={4}
                    placeholder="Option 1&#10;Option 2&#10;Option 3"
                  />
                </div>

                <div>
                  <label className="block text-sm text-muted mb-1">Correct Answer (for manual resolution)</label>
                  <input
                    value={formCorrectAnswer}
                    onChange={(e) => setFormCorrectAnswer(e.target.value)}
                    className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    placeholder="Set during/after draft"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={saveQuestion} className="flex-1 bg-accent hover:bg-accent-light text-white font-bold py-2 rounded-lg transition">
                  {editing ? 'Update' : 'Create'}
                </button>
                <button onClick={() => setShowForm(false)} className="flex-1 bg-card-border text-foreground font-bold py-2 rounded-lg transition hover:bg-muted">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
