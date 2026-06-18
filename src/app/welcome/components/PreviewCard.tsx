'use client';

import type { PreviewModel } from '@/lib/onboarding/preview-model';

/**
 * The cropped "magic moment" preview (Onboarding redesign, Pass 2).
 *
 * Renders a PreviewModel - the same view-model both paths produce. The whole
 * point is the TRUTHFUL frame: a section the prepare didn't fill is shown as
 * "prepared, awaiting your review", NEVER faked and NEVER labelled an error. A
 * thin real result and the curated sample share this exact component, so an
 * agent's real (possibly sparse) page reads as intentionally-incomplete rather
 * than broken next to the sample.
 *
 * No fabricated content on this publish-looking surface: no invented reviews,
 * stats, or video. The sample carries a persistent "Sample" badge.
 */
export function PreviewCard({ model }: { model: PreviewModel }) {
  return (
    <div className="onb__preview" data-testid="onb-preview" data-sample={model.isSample}>
      {model.hasPhoto ? (
        <div
          className="onb__preview-hero"
          style={{ backgroundImage: `url(${model.heroPhotoUrl})` }}
          role="img"
          aria-label={`Front of ${model.addressLine}`}
        >
          {model.isSample && (
            <span className="onb__sample-badge" data-testid="onb-sample-badge">
              Sample
            </span>
          )}
        </div>
      ) : (
        <div className="onb__preview-hero onb__preview-hero--ghost">
          {model.isSample && (
            <span className="onb__sample-badge" data-testid="onb-sample-badge">
              Sample
            </span>
          )}
          A cover photo lands here once you add one.
        </div>
      )}

      <div className="onb__preview-body">
        <div>
          <p className="onb__preview-addr">{model.addressLine}</p>
          {model.cityLine && <p className="onb__preview-city">{model.cityLine}</p>}
        </div>

        {model.hasPrice ? (
          <p className="onb__preview-price" data-testid="onb-preview-price">
            {model.priceLow} to {model.priceHigh}
          </p>
        ) : (
          <div className="onb__await" data-testid="onb-await-price">
            <strong>Your price range, awaiting your review.</strong> Add it when
            you have seen the home, and it slots in here.
          </div>
        )}

        {model.hasSubjectFacts && (
          <div className="onb__facts">
            {model.subjectBeds && (
              <span>
                <strong>{model.subjectBeds}</strong> bd
              </span>
            )}
            {model.subjectBaths && (
              <span>
                <strong>{model.subjectBaths}</strong> ba
              </span>
            )}
            {model.subjectSqft && (
              <span>
                <strong>{model.subjectSqft}</strong> sqft
              </span>
            )}
          </div>
        )}

        <div>
          <p className="onb__section-label">Nearby sales</p>
          {model.hasComps ? (
            <div className="onb__comps" data-testid="onb-comps">
              {model.comps.slice(0, 4).map((c, i) => (
                <div className="onb__comp" key={`${c.addressLine}-${i}`}>
                  <span>
                    {c.addressLine}
                    {c.sqft ? ` · ${c.sqft} sqft` : ''}
                  </span>
                  {c.soldLine && <span className="onb__comp-sold">{c.soldLine}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="onb__await" data-testid="onb-await-comps">
              <strong>Nearby sales, awaiting your review.</strong> The recent
              sales that anchor your price will gather here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
