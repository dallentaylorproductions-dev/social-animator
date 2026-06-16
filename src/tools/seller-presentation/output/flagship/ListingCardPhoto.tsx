"use client";

import { useEffect, useRef, useState } from "react";
import { CompPhotoPlaceholder } from "./CompPhotoPlaceholder";

/**
 * Coverflow card photo with a graceful broken-URL fallback (Zone 5 smoke fix).
 *
 * A card's photo can be a hosted upload or a Street View pano. The server picks
 * the first candidate at render time, but a non-empty URL that 404s only reveals
 * itself on load — the old background-image span had no way to detect that and
 * left a blank white photo area. This client island walks the SAME priority
 * order (`sources`) on each `error`, and when every candidate fails it lands on
 * the neutral house-glyph placeholder rather than a blank.
 *
 * `sources` is the ordered candidate list (hosted photo, then Street View),
 * already filtered to present values by the caller. It is only mounted when at
 * least one candidate exists, so reaching the placeholder always means a real
 * URL was tried and failed — the empty-photo-no-coverage case stays photo-less
 * (cream card), byte-identical to before.
 */
export function ListingCardPhoto({
  sources,
  testId,
}: {
  sources: string[];
  testId?: string;
}) {
  const [idx, setIdx] = useState(0);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Pre-hydration safety net: an SSR'd <img> can finish loading and FAIL before
  // React attaches the onError handler (a 404 that resolved during first paint).
  // `complete && naturalWidth === 0` detects that on mount so we still advance to
  // the next candidate instead of stranding on the broken source. A fresh, not-
  // yet-loaded img reports complete=false, so this never double-advances.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setIdx((i) => i + 1);
    }
  }, [idx]);

  const src = sources[idx];
  if (!src) {
    return <CompPhotoPlaceholder testId={testId} />;
  }

  // `key={src}` forces a clean remount per candidate, so the ref + the mount-
  // check above re-run against each new src.
  //
  // A plain <img> (not next/image) is deliberate: it is what gives us the raw
  // onError fallback, and the card photo is an agent upload or a Street View
  // pano fetched fresh in the buyer's browser (never proxied/stored) — so
  // next/image's optimizer would need every hosted/blob host allowlisted.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={src}
      ref={imgRef}
      className="sa-cf__photo"
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      onError={() => setIdx((i) => i + 1)}
      data-testid={testId}
    />
  );
}
