'use client';

import { useMemo, useState } from 'react';
import {
  DEFAULT_SELECTED_OBJECTION_IDS,
  OBJECTION_LIBRARY,
  type ObjectionEntry,
} from '../content/objections';
import type { SellerIntelligenceReportDraft } from '../engine/types';

interface StepProps {
  draft: SellerIntelligenceReportDraft;
  setDraft: (d: SellerIntelligenceReportDraft) => void;
}

export function StepObjections({ draft, setDraft }: StepProps) {
  const selected = new Set(draft.selectedObjectionIds);
  const overrides = draft.objectionOverrides ?? {};

  const grouped = useMemo(() => {
    const map = new Map<string, ObjectionEntry[]>();
    for (const entry of OBJECTION_LIBRARY) {
      const arr = map.get(entry.category) ?? [];
      arr.push(entry);
      map.set(entry.category, arr);
    }
    return Array.from(map.entries());
  }, []);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDraft({ ...draft, selectedObjectionIds: Array.from(next) });
  };

  const setOverride = (id: string, text: string) => {
    const nextOverrides = { ...overrides };
    if (text.trim()) {
      nextOverrides[id] = text;
    } else {
      delete nextOverrides[id];
    }
    setDraft({
      ...draft,
      objectionOverrides: Object.keys(nextOverrides).length ? nextOverrides : undefined,
    });
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium">Talking points</h2>
        <p className="mt-1 text-xs text-gray-500">
          We&apos;ve pre-checked {DEFAULT_SELECTED_OBJECTION_IDS.length} universal talking points
          you&apos;ll almost always need. Add or remove based on this specific seller.
        </p>
        <p className="mt-2 text-xs text-[#4ef2d9]">
          {selected.size} of {OBJECTION_LIBRARY.length} selected
        </p>
      </header>

      <div className="space-y-6">
        {grouped.map(([category, entries]) => (
          <section key={category} className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-gray-500">{category}</h3>
            <div className="space-y-2">
              {entries.map((entry) => (
                <ObjectionRow
                  key={entry.id}
                  entry={entry}
                  selected={selected.has(entry.id)}
                  override={overrides[entry.id] ?? ''}
                  onToggle={() => toggle(entry.id)}
                  onOverrideChange={(text) => setOverride(entry.id, text)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ObjectionRow({
  entry,
  selected,
  override,
  onToggle,
  onOverrideChange,
}: {
  entry: ObjectionEntry;
  selected: boolean;
  override: string;
  onToggle: () => void;
  onOverrideChange: (text: string) => void;
}) {
  const [showResponse, setShowResponse] = useState(false);
  const [showOverride, setShowOverride] = useState(Boolean(override));

  return (
    <div
      className={`p-3 rounded border ${
        selected ? 'border-[#4ef2d9]/40 bg-[#4ef2d9]/5' : 'border-neutral-800'
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
              onClick={() => setShowResponse((s) => !s)}
              className="text-[#4ef2d9] hover:underline"
            >
              {showResponse ? 'Hide response' : 'Preview response'}
            </button>
            <button
              type="button"
              onClick={() => setShowOverride((s) => !s)}
              className="text-gray-400 hover:text-gray-300 hover:underline"
            >
              {showOverride ? 'Hide my version' : 'Edit my own version'}
            </button>
          </div>
          {showResponse && (
            <p className="mt-2 text-xs text-gray-300 leading-relaxed">{entry.response}</p>
          )}
          {showOverride && (
            <textarea
              className="mt-2 w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-xs focus:outline-none focus:border-[#4ef2d9] resize-y min-h-[60px]"
              value={override}
              onChange={(e) => onOverrideChange(e.target.value)}
              placeholder="Type your version of the response — it will replace the library text in the printed PDF."
            />
          )}
        </div>
      </div>
    </div>
  );
}
