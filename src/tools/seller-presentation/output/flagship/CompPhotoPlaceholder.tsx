/**
 * Seller Presentation - the neutral comp-photo placeholder (COMP_PHOTOS).
 *
 * A calm house glyph on the brand tint, shown in a comp photo slot when no
 * photo resolved (no Street View coverage and no agent upload). It exists so a
 * comp slot is NEVER a blank box - an empty frame reads as broken / unfinished,
 * the exact feeling the prepared invitation is built to avoid.
 *
 * The published brief renders only PHOTOGRAPHED comps (see AppointmentBrief), so
 * in practice this is the review-step safety net + a render-time guard against a
 * comp whose pano resolved but whose Static image URL can't be built (e.g. a
 * missing browser key). Purely presentational + SSR-safe, so it drops into both
 * the server-rendered brief and the client review step.
 */
export function CompPhotoPlaceholder({
  testId,
}: {
  testId?: string;
}) {
  return (
    <span className="sa-photo-ph" aria-hidden="true" data-testid={testId}>
      <svg viewBox="0 0 32 32" focusable="false" role="presentation">
        {/* a simple roofline + door: reads as "home" at thumbnail size */}
        <path
          className="sa-photo-ph__glyph"
          d="M16 6 4 15.5h2.4V26h7v-6.2h5.2V26h7V15.5H28L16 6Z"
        />
      </svg>
    </span>
  );
}
