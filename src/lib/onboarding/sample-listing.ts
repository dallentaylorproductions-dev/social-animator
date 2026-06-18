/**
 * Onboarding sample listing (Onboarding redesign, Pass 2) - PURE FIXTURE.
 *
 * The SAMPLE path renders from this baked-in listing, NOT a live property
 * lookup, so the wow is guaranteed and fully decoupled from the property
 * prepare spike. It is curated to be impressive-but-not-unrealistic: a tasteful
 * North-Tacoma home, a tight price range, four nearby sales, a real local
 * exterior photo already committed under public/sample-assets.
 *
 * It is clearly a SAMPLE: `isSample: true` drives a persistent "Sample" marker
 * on every preview surface, and the flow never publishes it - the sample path
 * ends on the convert CTA ("make one for your listing"), which routes into the
 * real path. We deliberately surface only the LISTING (address, photo, price,
 * comps): no fabricated agent identity, reviews, stats, or video, because the
 * sample sits on a publish-looking surface and identity is captured at convert.
 *
 * Values mirror the existing FULL_PAYLOAD smoke fixture so the sample matches
 * what Dallen already eyeballs, without coupling onboarding to the renderer's
 * public-payload shape.
 */
import type { PreviewModel } from "./preview-model";

export const SAMPLE_PREVIEW: PreviewModel = {
  isSample: true,
  addressLine: "1742 Kenilworth Avenue",
  cityLine: "Tacoma, WA 98406",
  heroPhotoUrl: "/sample-assets/exterior.webp",
  priceLow: "$619,000",
  priceHigh: "$642,000",
  subjectBeds: "4",
  subjectBaths: "2",
  subjectSqft: "2,480",
  comps: [
    { addressLine: "4210 N 14th St", soldLine: "Sold $592,000", sqft: "2,740" },
    { addressLine: "1705 N Anderson St", soldLine: "Sold $580,000", sqft: "2,020" },
    { addressLine: "1722 N Oakes St", soldLine: "Sold $605,000", sqft: "2,010" },
    { addressLine: "1008 N Steele St", soldLine: "Sold $700,000", sqft: "2,715" },
  ],
  hasPhoto: true,
  hasPrice: true,
  hasComps: true,
  hasSubjectFacts: true,
};
