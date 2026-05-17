'use client';

import { useState } from 'react';
import type { ConfidenceLevel, SellerIntelligenceReportDraft } from '../engine/types';
import { PRICING_STRATEGIES, type PricingStrategy } from '../content/pricing-strategies';
import { FieldHelp } from './FieldHelp';

interface StepProps {
  draft: SellerIntelligenceReportDraft;
  setDraft: (d: SellerIntelligenceReportDraft) => void;
}

const inputCls =
  'w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-sm focus:outline-none focus:border-[#4ef2d9]';

export function StepProperty({ draft, setDraft }: StepProps) {
  const update = <K extends keyof SellerIntelligenceReportDraft>(
    key: K,
    value: SellerIntelligenceReportDraft[K],
  ) => setDraft({ ...draft, [key]: value });

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium">Property + pricing strategy</h2>
        <p className="mt-1 text-xs text-gray-500">
          Anchor the report to a specific property and recommended price. The pricing strategy
          drives the framing of your conversation.
        </p>
      </header>

      <FieldHelp
        label="Property address"
        required
        helpText="Street address as it'll appear on the listing."
      >
        <input
          type="text"
          className={inputCls}
          value={draft.propertyAddress}
          onChange={(e) => update('propertyAddress', e.target.value)}
          placeholder="1234 Maple Heights Dr"
        />
      </FieldHelp>

      <FieldHelp label="City, state, zip" helpText="City and state.">
        <input
          type="text"
          className={inputCls}
          value={draft.propertyCity ?? ''}
          onChange={(e) => update('propertyCity', e.target.value || undefined)}
          placeholder="Beaverton, OR 97005"
        />
      </FieldHelp>

      <FieldHelp label="Seller name" helpText="Used in your appointment greeting and notes.">
        <input
          type="text"
          className={inputCls}
          value={draft.ownerName ?? ''}
          onChange={(e) => update('ownerName', e.target.value || undefined)}
          placeholder="The Smiths"
        />
      </FieldHelp>

      <FieldHelp
        label="Recommended list price"
        required
        helpText="Format however you want — we'll show it as you type it."
      >
        <input
          type="text"
          className={inputCls}
          value={draft.recommendedListPrice}
          onChange={(e) => update('recommendedListPrice', e.target.value)}
          placeholder="$685,000"
        />
      </FieldHelp>

      <FieldHelp
        label="Pricing strategy"
        helpText="Pick the framework that best fits this seller and this market."
      >
        <div className="space-y-2">
          {PRICING_STRATEGIES.map((strategy) => (
            <StrategyOption
              key={strategy.id}
              strategy={strategy}
              selected={draft.pricingStrategyId === strategy.id}
              onSelect={() => update('pricingStrategyId', strategy.id)}
            />
          ))}
        </div>
      </FieldHelp>

      <FieldHelp
        label="Confidence in the comp set"
        helpText="How solid is your comp set? This widens or tightens the price range we print."
      >
        <div className="flex gap-2">
          {(['high', 'medium', 'low'] as ConfidenceLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => update('confidence', level)}
              className={`px-4 py-2 text-sm rounded border transition ${
                draft.confidence === level
                  ? 'bg-[#4ef2d9] text-black border-[#4ef2d9]'
                  : 'border-neutral-700 text-gray-300 hover:border-neutral-500'
              }`}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
      </FieldHelp>
    </div>
  );
}

function StrategyOption({
  strategy,
  selected,
  onSelect,
}: {
  strategy: PricingStrategy;
  selected: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={`p-3 rounded border ${
        selected ? 'border-[#4ef2d9] bg-[#4ef2d9]/5' : 'border-neutral-700'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="radio"
          name="pricingStrategy"
          checked={selected}
          onChange={onSelect}
          className="mt-1"
        />
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={onSelect}
            className="text-left w-full"
          >
            <div className="text-sm font-medium">{strategy.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">{strategy.oneLineDescription}</div>
          </button>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-[11px] text-[#4ef2d9] mt-2 hover:underline"
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>
          {expanded && (
            <div className="mt-2 space-y-2 text-xs text-gray-300">
              <p>{strategy.detailedDescription}</p>
              <p className="text-gray-400">
                <span className="font-medium text-gray-300">Best for:</span> {strategy.bestFor}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
