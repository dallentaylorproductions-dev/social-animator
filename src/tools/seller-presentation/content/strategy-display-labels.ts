/**
 * Phase B6 — SP-specific strategy display labels.
 *
 * Maps the shared SIR PRICING_STRATEGIES catalog's canonical IDs to the
 * SP-facing display labels (Create Urgency / Market-aligned / Premium
 * Positioning / Test then adjust) the agent sees on Step 3 (Strategy)
 * and Step 6 (Review). Extracted from StepStrategy.tsx (where the map
 * was local in B3) so Step 6's Review summary can show the same label
 * the agent picked on Step 3.
 *
 * The prep PDF (output/prep-pdf.tsx) intentionally renders the FORMAL
 * SIR catalog name (`getPricingStrategyById(...)?.name`) — formal
 * documents use formal labels. This map is for UI surfaces only.
 */
export const SP_STRATEGY_DISPLAY_LABELS: Record<string, string> = {
  "strategic-quick-sale": "Create Urgency",
  "market-aligned": "Market-aligned",
  "premium-positioning": "Premium Positioning",
  "test-then-adjust": "Test then adjust",
};

export const spStrategyDisplayLabel = (id: string | undefined): string =>
  (id && SP_STRATEGY_DISPLAY_LABELS[id]) || "—";
