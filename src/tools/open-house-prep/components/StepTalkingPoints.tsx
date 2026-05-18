'use client';

import { useMemo, useState } from 'react';
import type { OpenHousePrepDraft } from '../engine/types';
import {
  TALKING_POINTS,
  type TalkingPoint,
} from '../content/talking-points';
import {
  COMMON_QUESTIONS,
  type CommonQuestion,
} from '../content/common-questions';
import {
  CONVERSION_PROMPTS,
  type ConversionPrompt,
} from '../content/conversion-prompts';

interface StepProps {
  draft: OpenHousePrepDraft;
  setDraft: (d: OpenHousePrepDraft) => void;
}

const overrideCls =
  'mt-2 w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-xs focus:outline-none focus:border-mint resize-y min-h-[60px]';

export function StepTalkingPoints({ draft, setDraft }: StepProps) {
  const selectedTalking = new Set(draft.selectedTalkingPointIds);
  const selectedQuestions = new Set(draft.selectedCommonQuestionIds);
  const selectedPrompts = new Set(draft.selectedConversionPromptIds);
  const talkingOverrides = draft.talkingPointOverrides ?? {};
  const questionOverrides = draft.commonQuestionOverrides ?? {};

  // Commit 7 collapse pattern: by default, render only pre-selected library
  // defaults plus any currently-selected non-default entries. Hidden entries
  // reveal via the per-section "Show all" affordance. Reduces first-time
  // visible items from 31 to ~10 without losing selected work.
  const [showAllTalking, setShowAllTalking] = useState(false);
  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [showAllPrompts, setShowAllPrompts] = useState(false);

  function isVisibleByDefault(
    entry: { id: string; isDefaultSelected?: boolean },
    selected: Set<string>,
  ): boolean {
    return Boolean(entry.isDefaultSelected) || selected.has(entry.id);
  }

  const visibleTalking = showAllTalking
    ? TALKING_POINTS
    : TALKING_POINTS.filter((tp) => isVisibleByDefault(tp, selectedTalking));
  const hiddenTalkingCount = TALKING_POINTS.length - visibleTalking.length;

  const visibleQuestions = showAllQuestions
    ? COMMON_QUESTIONS
    : COMMON_QUESTIONS.filter((q) => isVisibleByDefault(q, selectedQuestions));
  const hiddenQuestionsCount = COMMON_QUESTIONS.length - visibleQuestions.length;

  const visiblePrompts = showAllPrompts
    ? CONVERSION_PROMPTS
    : CONVERSION_PROMPTS.filter((p) => isVisibleByDefault(p, selectedPrompts));
  const hiddenPromptsCount = CONVERSION_PROMPTS.length - visiblePrompts.length;

  const questionsByCategory = useMemo(() => {
    const m = new Map<string, CommonQuestion[]>();
    for (const q of COMMON_QUESTIONS) {
      const arr = m.get(q.category) ?? [];
      arr.push(q);
      m.set(q.category, arr);
    }
    return Array.from(m.entries());
  }, []);

  const toggle = <T,>(
    set: Set<string>,
    id: string,
    key: keyof OpenHousePrepDraft,
    _typ?: T,
  ) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDraft({ ...draft, [key]: Array.from(next) });
  };

  const setTalkingOverride = (id: string, text: string) => {
    const next = { ...talkingOverrides };
    if (text.trim()) next[id] = text;
    else delete next[id];
    setDraft({
      ...draft,
      talkingPointOverrides: Object.keys(next).length ? next : undefined,
    });
  };

  const setQuestionOverride = (id: string, text: string) => {
    const next = { ...questionOverrides };
    if (text.trim()) next[id] = text;
    else delete next[id];
    setDraft({
      ...draft,
      commonQuestionOverrides: Object.keys(next).length ? next : undefined,
    });
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-lg font-medium">Talking points</h2>
        <p className="mt-1 text-xs text-gray-500">
          Pick what you want printed on your prep doc — talking points, common visitor questions, and conversion prompts. Universal defaults are pre-checked.
        </p>
      </header>

      <Section
        title="Talking points"
        counter={`${selectedTalking.size} of ${TALKING_POINTS.length} selected`}
      >
        <div className="space-y-2">
          {visibleTalking.map((tp) => (
            <TalkingPointRow
              key={tp.id}
              entry={tp}
              selected={selectedTalking.has(tp.id)}
              override={talkingOverrides[tp.id] ?? ''}
              onToggle={() =>
                toggle(selectedTalking, tp.id, 'selectedTalkingPointIds')
              }
              onOverrideChange={(text) => setTalkingOverride(tp.id, text)}
            />
          ))}
        </div>
        {hiddenTalkingCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAllTalking(true)}
            className="mt-2 text-sm text-mint hover:underline"
          >
            + Show all {TALKING_POINTS.length} talking points
          </button>
        )}
      </Section>

      <Section
        title="Common visitor questions"
        counter={`${selectedQuestions.size} of ${COMMON_QUESTIONS.length} selected`}
      >
        <div className="space-y-6">
          {questionsByCategory.map(([category, entries]) => {
            // When collapsed, drop categories whose entries are all hidden.
            const visibleEntries = entries.filter((q) =>
              visibleQuestions.includes(q),
            );
            if (visibleEntries.length === 0) return null;
            return (
              <div key={category} className="space-y-2">
                <h3 className="text-xs uppercase tracking-wider text-gray-500">
                  {category}
                </h3>
                {visibleEntries.map((q) => (
                  <QuestionRow
                    key={q.id}
                    entry={q}
                    selected={selectedQuestions.has(q.id)}
                    override={questionOverrides[q.id] ?? ''}
                    onToggle={() =>
                      toggle(
                        selectedQuestions,
                        q.id,
                        'selectedCommonQuestionIds',
                      )
                    }
                    onOverrideChange={(text) => setQuestionOverride(q.id, text)}
                  />
                ))}
              </div>
            );
          })}
        </div>
        {hiddenQuestionsCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAllQuestions(true)}
            className="mt-2 text-sm text-mint hover:underline"
          >
            + Show all {COMMON_QUESTIONS.length} questions
          </button>
        )}
      </Section>

      <Section
        title="Conversion prompts"
        counter={`${selectedPrompts.size} of ${CONVERSION_PROMPTS.length} selected`}
      >
        <div className="space-y-2">
          {visiblePrompts.map((p) => (
            <PromptRow
              key={p.id}
              entry={p}
              selected={selectedPrompts.has(p.id)}
              onToggle={() =>
                toggle(
                  selectedPrompts,
                  p.id,
                  'selectedConversionPromptIds',
                )
              }
            />
          ))}
        </div>
        {hiddenPromptsCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAllPrompts(true)}
            className="mt-2 text-sm text-mint hover:underline"
          >
            + Show all {CONVERSION_PROMPTS.length} prompts
          </button>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  counter,
  children,
}: {
  title: string;
  counter: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        <span className="text-[11px] text-mint">{counter}</span>
      </div>
      {children}
    </section>
  );
}

function TalkingPointRow({
  entry,
  selected,
  override,
  onToggle,
  onOverrideChange,
}: {
  entry: TalkingPoint;
  selected: boolean;
  override: string;
  onToggle: () => void;
  onOverrideChange: (text: string) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [showOverride, setShowOverride] = useState(Boolean(override));
  return (
    <div
      className={`p-3 rounded border ${
        selected ? 'border-mint/40 bg-mint/5' : 'border-neutral-800'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1"
          aria-label={`Toggle "${entry.trigger}"`}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm italic text-gray-300">{entry.trigger}</div>
          <div className="mt-1.5 flex gap-3 text-[11px]">
            <button
              type="button"
              onClick={() => setShowPreview((s) => !s)}
              className="text-mint hover:underline"
            >
              {showPreview ? 'Hide line' : 'Preview line'}
            </button>
            <button
              type="button"
              onClick={() => setShowOverride((s) => !s)}
              className="text-gray-400 hover:text-gray-300 hover:underline"
            >
              {showOverride ? 'Hide my version' : 'Edit my own version'}
            </button>
          </div>
          {showPreview && (
            <p className="mt-2 text-xs text-gray-300 leading-relaxed">{entry.text}</p>
          )}
          {showOverride && (
            <textarea
              className={overrideCls}
              value={override}
              onChange={(e) => onOverrideChange(e.target.value)}
              placeholder="Type your version of the line."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionRow({
  entry,
  selected,
  override,
  onToggle,
  onOverrideChange,
}: {
  entry: CommonQuestion;
  selected: boolean;
  override: string;
  onToggle: () => void;
  onOverrideChange: (text: string) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [showOverride, setShowOverride] = useState(Boolean(override));
  return (
    <div
      className={`p-3 rounded border ${
        selected ? 'border-mint/40 bg-mint/5' : 'border-neutral-800'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1"
          aria-label={`Toggle "${entry.trigger}"`}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm italic text-gray-300">{entry.trigger}</div>
          <div className="mt-1.5 flex gap-3 text-[11px]">
            <button
              type="button"
              onClick={() => setShowPreview((s) => !s)}
              className="text-mint hover:underline"
            >
              {showPreview ? 'Hide response' : 'Preview response'}
            </button>
            <button
              type="button"
              onClick={() => setShowOverride((s) => !s)}
              className="text-gray-400 hover:text-gray-300 hover:underline"
            >
              {showOverride ? 'Hide my version' : 'Edit my own version'}
            </button>
          </div>
          {showPreview && (
            <p className="mt-2 text-xs text-gray-300 leading-relaxed">{entry.response}</p>
          )}
          {showOverride && (
            <textarea
              className={overrideCls}
              value={override}
              onChange={(e) => onOverrideChange(e.target.value)}
              placeholder="Type your version of the response."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PromptRow({
  entry,
  selected,
  onToggle,
}: {
  entry: ConversionPrompt;
  selected: boolean;
  onToggle: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  return (
    <div
      className={`p-3 rounded border ${
        selected ? 'border-mint/40 bg-mint/5' : 'border-neutral-800'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1"
          aria-label={`Toggle "${entry.context}"`}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm italic text-gray-300">{entry.context}</div>
          <button
            type="button"
            onClick={() => setShowPreview((s) => !s)}
            className="mt-1.5 text-[11px] text-mint hover:underline"
          >
            {showPreview ? 'Hide prompt' : 'Preview prompt'}
          </button>
          {showPreview && (
            <p className="mt-2 text-xs text-gray-300 leading-relaxed">{entry.prompt}</p>
          )}
        </div>
      </div>
    </div>
  );
}
