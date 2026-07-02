/**
 * Buyer Tour Brief V1 — the GreatSchools "School context for this tour" card
 * (GREATSCHOOLS_ENABLED). Built to the LOCKED mock
 * `buyer-tour-brief-v1-context-hub-mock-2h-editorial.html` ("School context for
 * this tour" section): a visible, contained card — one nearest school per home,
 * school info on the LEFT in Studio's cream design language, the real 97×95
 * GreatSchools band SVG in a quiet right-side source dock, middle/high as a link-out,
 * and full attribution in the footer.
 *
 * SERVER COMPONENT (no "use client"): rendered by the `/tour/[slug]` server page
 * from a LIVE, render-time GreatSchools fetch and passed into the client
 * `BuyerTourPage` as a prerendered node. So GreatSchools data is server-rendered to
 * HTML and NEVER shipped as client props, written to KV, cached, or persisted
 * anywhere (ToS 3.2.2 / 3.2.8). The page computes `rows`; this component only paints.
 *
 * ATTRIBUTION (all enforced here): band SVG ≥97×95 unmodified + linked to profile;
 * exact band wording (verbatim, no paraphrase) in the badge aria-label; school NAME
 * links to its GreatSchools profile; footer GreatSchools logo (≥95px) + copyright +
 * ratings-explainer link; ALL GreatSchools links `rel="nofollow"`. No-rating → a
 * quiet text row, never an invented badge.
 *
 * FAIR HOUSING: Studio authors NO quality/neighborhood language. The only words are
 * sourced facts (school name, distance, grades, district) + GreatSchools' own band.
 */

import type { SchoolRow } from "./school-context";
import {
  bandToIconSlug,
  cityDirectoryUrl,
  schoolSubline,
} from "./school-context";

const SERIF =
  '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif';

/** 1-based stop → tour letter (1→A, 2→B …), matching the mock's A/B/C anchors. */
function stopLetter(stop: number): string {
  return stop >= 1 && stop <= 26 ? String.fromCharCode(64 + stop) : String(stop);
}

/** GreatSchools links must all be nofollow; centralize the attrs. */
const GS_LINK = { rel: "nofollow", target: "_blank" as const };

export function SchoolContext({
  rows,
  accent = "#2F6FB0",
}: {
  rows: SchoolRow[];
  /** The tour-thread accent (brand accent) for the A/B/C chip — matches the map pins. */
  accent?: string;
}) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const year = new Date().getFullYear();

  return (
    <section className="pt-6" data-testid="btb-school-section">
      <div className="mb-3.5 px-6">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#7C8A86]">
          Sourced school lens
        </div>
        <h2
          className="mt-1.5 text-[20px] font-semibold"
          style={{ fontFamily: SERIF }}
        >
          School context for this tour
        </h2>
        <p className="mt-1 text-[13px] text-[#7C8A86]">
          The nearest school for each home, with its GreatSchools rating. Shown the
          same way for every home. Not a recommendation.
        </p>
      </div>

      <div className="px-4">
        <div className="overflow-hidden rounded-[18px] border border-[#EAE3D8] bg-white shadow-[0_1px_2px_rgba(22,33,31,.04),0_6px_20px_rgba(22,33,31,.06)]">
          {rows.map(({ stop, school }) => {
            const letter = stopLetter(stop);
            const slug = bandToIconSlug(school.ratingBand);
            const dir = cityDirectoryUrl(school.profileUrl);
            return (
              <div
                key={stop}
                className="flex items-stretch border-b border-[#F0EBE1] last:border-b-0"
                data-testid={`btb-school-row-${letter}`}
              >
                <div className="min-w-0 flex-1 py-[17px] pl-4 pr-3.5">
                  {/* Caption on its OWN line (block-level flex, not inline-flex) so the
                      school-name link below never runs onto the same line as it. */}
                  <div className="mb-[5px] flex w-fit items-center gap-1.5 text-[10.5px] font-bold text-[#42514E]">
                    <span
                      className="flex h-[17px] w-[17px] flex-none items-center justify-center rounded-[5px] text-[10.5px] font-extrabold text-white"
                      style={{ background: accent }}
                    >
                      {letter}
                    </span>
                    Nearest school
                  </div>

                  {/* The school name is its own distinct, tappable line. Inline anchor so
                      long names wrap cleanly with the underline following each line. */}
                  {school.profileUrl ? (
                    <a
                      href={school.profileUrl}
                      {...GS_LINK}
                      className="text-[15px] font-bold leading-[1.3] text-[#16211F] no-underline [border-bottom:1px_solid_rgba(15,23,42,.22)] hover:[border-bottom-color:#16211F]"
                    >
                      {school.name}
                    </a>
                  ) : (
                    <span className="text-[15px] font-bold leading-[1.3] text-[#16211F]">
                      {school.name}
                    </span>
                  )}

                  <div className="mt-[5px] text-[11.5px] leading-[1.45] text-[#7C8A86]">
                    {schoolSubline(school)}
                  </div>

                  {dir && (
                    <a
                      href={dir}
                      {...GS_LINK}
                      className="mt-[9px] inline-block text-[12px] font-bold text-[#234F80] no-underline hover:underline"
                    >
                      See middle &amp; high schools &rsaquo;
                    </a>
                  )}
                </div>

                {slug ? (
                  <a
                    href={school.profileUrl ?? "https://www.greatschools.org"}
                    {...GS_LINK}
                    aria-label={`${school.name} GreatSchools School Rating Band: ${school.ratingBand}`}
                    className="flex w-[122px] flex-none items-center justify-center border-l border-[#F0EBE1] p-2.5 no-underline"
                    data-testid={`btb-school-badge-${letter}`}
                  >
                    {/* GreatSchools required minimum 97×95, unmodified (no stretch/recolor). */}
                    <img
                      src={`/greatschools/rating-band-${slug}.svg`}
                      alt={`${school.name} GreatSchools School Rating Band`}
                      width={97}
                      height={95}
                      className="block h-auto w-[97px]"
                    />
                  </a>
                ) : (
                  <div
                    className="flex w-[122px] flex-none items-center justify-center border-l border-[#F0EBE1] px-3.5 py-2.5 text-center text-[11px] font-semibold leading-[1.35] text-[#7C8A86]"
                    data-testid={`btb-school-norating-${letter}`}
                  >
                    Rating not available from GreatSchools
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex flex-wrap items-center gap-2.5 border-t border-[#F0EBE1] bg-[#F7F3EA] px-4 py-[13px] text-[10px] leading-[1.6] text-[#7C8A86]">
            <a
              href="https://www.greatschools.org"
              {...GS_LINK}
              className="inline-flex flex-none items-center no-underline"
              aria-label="GreatSchools"
            >
              {/* Attribution: the real GreatSchools logo, ≥95px, unmodified. */}
              <img
                src="/greatschools/GreatSchools-logo-medium.png"
                alt="GreatSchools"
                width={112}
                className="block h-auto w-[112px]"
              />
            </a>
            <span className="min-w-[150px] flex-1">
              School data provided by{" "}
              <a
                href="https://www.greatschools.org"
                {...GS_LINK}
                className="font-bold text-[#1A73B8] no-underline hover:underline"
              >
                GreatSchools.org
              </a>{" "}
              &copy; {year}. All rights reserved.{" "}
              <a
                href="https://www.greatschools.org/gk/ratings/"
                {...GS_LINK}
                className="font-bold text-[#1A73B8] no-underline hover:underline"
              >
                What the ratings mean
              </a>
              .
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
