import { Timeline, type Track } from "@/engine/timeline";
import { easeOutCubic } from "@/engine/easing";
import { drawImageCover, wrapText } from "@/engine/draw";
import type { TemplateConfig } from "./types";

/**
 * Photo carousel with a coverflow-style transition: the current photo is
 * centered/sharp/full-size, while the previous and next photos peek in from
 * the sides — smaller, blurred, and slightly faded. Communicates "more is
 * queued up" so the viewer lingers.
 */
export const listingCarouselTemplate: TemplateConfig = {
  id: "listing-carousel",
  name: "Listing Carousel",
  description:
    "Animated photo tour with coverflow-style transitions — next and previous photos peek in from the sides, hinting at what's coming.",
  duration: 10,
  fields: [
    { key: "title", label: "Title (optional)", type: "text", default: "123 Maple Street" },
    { key: "titleColor", label: "Title color", type: "color", default: "#ffffff" },
    { key: "photo1", label: "Photo 1", type: "image", default: "" },
    { key: "photo2", label: "Photo 2", type: "image", default: "" },
    { key: "photo3", label: "Photo 3", type: "image", default: "" },
    { key: "photo4", label: "Photo 4", type: "image", default: "" },
    { key: "photo5", label: "Photo 5", type: "image", default: "" },
    { key: "photo6", label: "Photo 6", type: "image", default: "" },
    { key: "background", label: "Background", type: "color", default: "#000000" },
  ],
  build(state, size, assets) {
    const { width, height } = size;

    // Collect uploaded + loaded photos in order, skipping empty slots
    const photoKeys = ["photo1", "photo2", "photo3", "photo4", "photo5", "photo6"];
    const photos: HTMLImageElement[] = [];
    for (const key of photoKeys) {
      const img = assets?.[key];
      if (img && img.complete && img.naturalWidth > 0) {
        photos.push(img);
      }
    }
    const photoCount = photos.length;

    // Layout
    const titleFontSize = 60;
    const titleY = 180;

    const photoBaseWidth = 600;
    const photoBaseHeight = 450; // 4:3 display aspect — drawImageCover crops as needed
    const photoCornerRadius = 24;
    const sideOffset = 460; // px from canvas center for relativePosition = ±1
    const photoCenterY = height * 0.55;

    // Animation timing
    const titleEntryStart = 0.2;
    const titleEntryDuration = 0.5;
    const carouselStart = 0.6;
    const slotDuration = 1.5; // each photo gets 1.5s (1.05hold + 0.45s transition)
    const naturalCarouselDuration = Math.max(slotDuration, photoCount * slotDuration);

    const tracks: Track[] = [];

    // Title (optional — only renders if user provided one)
    if (state.title) {
      tracks.push({
        id: "title",
        start: titleEntryStart,
        duration: titleEntryDuration,
        easing: easeOutCubic,
        onUpdate: (p, ctx) => {
          ctx.globalAlpha = p;
          ctx.translate(0, (1 - p) * 16);
          ctx.fillStyle = state.titleColor;
          ctx.font = `bold ${titleFontSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          // Wrap long titles so they don't overflow the canvas. Vertically
          // center the wrapped block on titleY.
          const titleMaxWidth = width - 120;
          const titleLineHeight = titleFontSize * 1.15;
          const lines = wrapText(ctx, state.title, titleMaxWidth);
          const totalHeight = lines.length * titleLineHeight;
          const startY = titleY - totalHeight / 2 + titleLineHeight / 2;
          lines.forEach((line, i) => {
            ctx.fillText(line, width / 2, startY + i * titleLineHeight);
          });
        },
      });
    }

    // Helper: draw a single photo at a given relative carousel position
    // rel = 0 → centered/sharp/full-size
    // rel = ±1 → side, scaled down, blurred, faded
    // |rel| > ~1.8 → off-screen, skip
    const renderPhoto = (
      ctx: CanvasRenderingContext2D,
      photo: HTMLImageElement,
      rel: number,
      entryAlpha: number = 1
    ) => {
      const absRel = Math.abs(rel);
      const scale = Math.max(0.4, 1 - absRel * 0.3);
      const alpha = Math.max(0, 1 - absRel * 0.5) * entryAlpha;
      const blur = absRel * 6;
      const xOffset = rel * sideOffset;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(width / 2 + xOffset, photoCenterY);
      ctx.scale(scale, scale);
      if (blur > 0.1) {
        ctx.filter = `blur(${blur}px)`;
      }
      drawImageCover(
        ctx,
        photo,
        -photoBaseWidth / 2,
        -photoBaseHeight / 2,
        photoBaseWidth,
        photoBaseHeight,
        photoCornerRadius
      );
      ctx.restore();
    };

    // Carousel main animation OR placeholder if no photos
    if (photoCount === 0) {
      tracks.push({
        id: "placeholder",
        start: carouselStart,
        duration: naturalCarouselDuration,
        onUpdate: (p, ctx) => {
          ctx.globalAlpha = Math.min(1, p * 4);

          const x = width / 2 - photoBaseWidth / 2;
          const y = photoCenterY - photoBaseHeight / 2;

          ctx.fillStyle = "#1a1a1a";
          ctx.beginPath();
          ctx.roundRect(x, y, photoBaseWidth, photoBaseHeight, photoCornerRadius);
          ctx.fill();

          ctx.strokeStyle = "#333";
          ctx.lineWidth = 2;
          ctx.setLineDash([12, 8]);
          ctx.beginPath();
          ctx.roundRect(
            x + 4,
            y + 4,
            photoBaseWidth - 8,
            photoBaseHeight - 8,
            photoCornerRadius
          );
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = "#666";
          ctx.font = "30px Inter, system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            "Add photos to start the carousel →",
            width / 2,
            photoCenterY
          );
        },
      });
    } else {
      tracks.push({
        id: "carousel",
        start: carouselStart,
        duration: naturalCarouselDuration,
        onUpdate: (p, ctx) => {
          // Entry fade: ease the whole carousel in over the first 0.4s of the
          // track so photos don't pop in abruptly.
          const entrySeconds = 0.4;
          const entryFraction = Math.min(
            0.5,
            entrySeconds / naturalCarouselDuration
          );
          const entryAlpha =
            p < entryFraction ? easeOutCubic(p / entryFraction) : 1;

          // Single-photo case: just render it centered, no animation
          if (photoCount === 1) {
            renderPhoto(ctx, photos[0], 0, entryAlpha);
            return;
          }

          // Multi-photo: hold-then-transition pattern per slot
          const totalSlots = photoCount;
          const t = p * totalSlots; // 0 → photoCount over the track's duration

          const slotIndex = Math.min(photoCount - 1, Math.floor(t));
          const localT = t - slotIndex; // 0–1 within current slot

          const holdRatio = 0.7;
          let transitionProgress = 0;
          if (slotIndex < photoCount - 1 && localT >= holdRatio) {
            transitionProgress = (localT - holdRatio) / (1 - holdRatio);
            // ease the transition for a smoother slide
            transitionProgress = easeOutCubic(transitionProgress);
          }

          const carouselPos = slotIndex + transitionProgress;

          // Z-order: render farthest photos first so center renders on top
          const ordered = photos
            .map((photo, i) => {
              const rel = i - carouselPos;
              return { photo, rel, absRel: Math.abs(rel) };
            })
            .filter(({ absRel }) => absRel < 1.8)
            .sort((a, b) => b.absRel - a.absRel);

          for (const { photo, rel } of ordered) {
            renderPhoto(ctx, photo, rel, entryAlpha);
          }
        },
      });
    }

    return new Timeline(tracks);
  },
};
