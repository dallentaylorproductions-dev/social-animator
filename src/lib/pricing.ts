/**
 * Centralized pricing config. All copy referencing the price should pull from
 * here so we can change the launch price without grep-replacing the codebase.
 */
export const PRICING = {
  monthlyPriceUSD: 39,
  priceId: process.env.STRIPE_PRICE_ID,
  currency: "USD" as const,
} as const;

export function formatMonthlyPrice(): string {
  return `$${PRICING.monthlyPriceUSD}/month`;
}
