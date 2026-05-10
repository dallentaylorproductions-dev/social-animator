"use client";

import { useEffect, useState } from "react";

interface LiveThumbnailProps {
  /** Object URL of the most recent frame preview, or null/undefined
   *  if no preview is available yet (preparing stage, or iOS path). */
  url: string | null | undefined;
  /** Aspect ratio of the source video — drives card sizing. */
  aspect: "reel" | "square";
  /** Hex color for the soft glow border (matches brand primary). */
  glowColor: string;
  /** When true, motion is suppressed (prefers-reduced-motion). */
  reducedMotion: boolean;
}

/**
 * Live preview of the video being assembled. The frame-render
 * engine emits a JPEG object URL every ~1s; this component holds
 * the previous thumbnail visible until the new one's <img> has
 * actually loaded (via onLoad), at which point the new one fades
 * in over the old. The previous blob URL is revoked by the engine
 * 500ms later, which gives us comfortable headroom for the
 * crossfade.
 *
 * H-7.2.2b rewrote the swap logic. The earlier crossfade-on-prop
 * approach (key={url} inside AnimatePresence) caused visible
 * strobing because the engine revoked URLs faster than the
 * animation could fade out — the <img> would try to render an
 * already-freed blob and show a broken-image fallback for a
 * frame. The onLoad-driven swap keeps the previous frame on
 * screen until the new one is ready to display.
 *
 * Falls back to a stenciled placeholder when no thumbnail is
 * available yet (preparing stage, or iOS path which doesn't
 * emit thumbnails).
 */
export function LiveThumbnail({
  url,
  aspect,
  glowColor,
  reducedMotion,
}: LiveThumbnailProps) {
  // displayedUrl = currently shown image; pendingUrl = next image
  // being preloaded. Once pending's onLoad fires we promote it to
  // displayed and clear pending.
  const [displayedUrl, setDisplayedUrl] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    if (url === displayedUrl) return;
    setPendingUrl(url);
  }, [url, displayedUrl]);

  const dims =
    aspect === "reel"
      ? { width: 90, height: 160 }
      : { width: 140, height: 140 };

  return (
    <div className="flex justify-center mb-5">
      <div
        className="rounded-lg overflow-hidden relative"
        style={{
          width: dims.width,
          height: dims.height,
          boxShadow: `0 0 0 1px ${glowColor}55, 0 0 24px 4px ${glowColor}22`,
          backgroundColor: "#0a0a0a",
        }}
      >
        {displayedUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayedUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {pendingUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pendingUrl}
            alt=""
            aria-hidden
            onLoad={() => {
              setDisplayedUrl(pendingUrl);
              setPendingUrl(null);
            }}
            onError={() => {
              // Old blob revoked too early or other load failure.
              // Drop the pending URL; current displayed frame
              // stays on screen until the next emit arrives.
              setPendingUrl(null);
            }}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
            style={{
              opacity: reducedMotion ? 1 : 0.999, // ensure transition triggers
            }}
          />
        )}
        {!displayedUrl && !pendingUrl && (
          <Placeholder glowColor={glowColor} reducedMotion={reducedMotion} />
        )}
      </div>
    </div>
  );
}

function Placeholder({
  glowColor,
  reducedMotion,
}: {
  glowColor: string;
  reducedMotion: boolean;
}) {
  return (
    <div
      className={`w-full h-full flex items-center justify-center ${
        reducedMotion ? "" : "animate-pulse"
      }`}
      style={{ color: glowColor + "AA" }}
    >
      <span className="text-[10px] uppercase tracking-[0.2em]">Preview</span>
    </div>
  );
}
