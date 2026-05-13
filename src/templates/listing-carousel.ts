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
  // H-7.12 image-asset keys use the objectList synthesized convention:
  // `${fieldKey}.${index}.${innerFieldName}` → "images.0.imageUrl", etc.
  // The seed file paths populate the picker-preview cards on the
  // template list page.
  sampleAssets: {
    "images.0.imageUrl": "/sample-assets/exterior.webp",
    "images.1.imageUrl": "/sample-assets/kitchen.webp",
    "images.2.imageUrl": "/sample-assets/living-room.webp",
    "images.3.imageUrl": "/sample-assets/bedroom.webp",
    "images.4.imageUrl": "/sample-assets/bathroom.webp",
    "images.5.imageUrl": "/sample-assets/backyard.webp",
  },
  sampleState: {
    title: "Open House Saturday",
    subtitle: "1:00–4:00pm",
    // Picker-preview seed for the carousel needs 6 items in the JSON so
    // build() iterates the right indices. Captions stay empty in the
    // preview seed; H-7.12-3.5 renders captions per item when present.
    images: JSON.stringify(
      Array.from({ length: 6 }, () => ({ imageUrl: "", caption: "" }))
    ),
  },
  fields: [
    { key: "title", label: "Title (optional)", type: "text", default: "123 Maple Street" },
    { key: "subtitle", label: "Subtitle (optional)", type: "text", default: "Open House Sat 1–4pm" },
    // H-7.13: brand-slot color fields. Primary = title text, Accent =
    // subtitle + caption text. Empty defaults flow through the brand
    // profile at render time (resolveBrandColors in TemplateEditor).
    { key: "primary", label: "Primary", type: "color", default: "" },
    { key: "accent", label: "Accent", type: "color", default: "" },
    {
      // H-7.12: replaces the previous photo1..photo6 fixed-slot fields.
      // Up to 8 photos with optional captions. H-7.12-3.5 renders the
      // caption text below each photo as it foregrounds in the
      // coverflow (B.2 visual). Empty captions render nothing.
      key: "images",
      label: "Photos",
      type: "objectList",
      max: 8,
      default: "[]",
      schema: {
        imageUrl: { type: "image", label: "Photo" },
        caption: { type: "text", label: "Caption (optional)", max: 60 },
      },
    },
    { key: "background", label: "Background", type: "color", default: "#000000" },
  ],
  build(state, size, assets) {
    const { width, height } = size;

    // H-7.12: read photo count from the objectList JSON in state.images,
    // then look up each photo's HTMLImageElement at the synthesized
    // asset key `images.${i}.imageUrl`. Skip slots that haven't been
    // uploaded yet (img.complete + naturalWidth check matches the prior
    // photo1..photo6 logic). Captions ride alongside photos in a parallel
    // array so caption[i] always pairs with photos[i] even when some
    // items have no uploaded image (H-7.12-3.5).
    let imageItems: Array<{ imageUrl?: string; caption?: string }> = [];
    try {
      const parsed = JSON.parse(state.images || "[]");
      if (Array.isArray(parsed)) imageItems = parsed;
    } catch {
      // malformed JSON → render no photos (placeholder branch fires)
    }
    const photos: HTMLImageElement[] = [];
    const captions: string[] = [];
    imageItems.forEach((item, i) => {
      const img = assets?.[`images.${i}.imageUrl`];
      if (img && img.complete && img.naturalWidth > 0) {
        photos.push(img);
        captions.push((item?.caption ?? "").trim());
      }
    });
    const photoCount = photos.length;
    const hasAnyCaption = captions.some((c) => c.length > 0);

    // Layout
    const titleFontSize = 60;
    const titleY = 180;

    const photoBaseWidth = 600;
    const photoBaseHeight = 450; // 4:3 display aspect — drawImageCover crops as needed
    const photoCornerRadius = 24;
    const sideOffset = 460; // px from canvas center for relativePosition = ±1
    const photoCenterY = height * 0.55;

    // Caption layout (H-7.12-3.5). Side-photo peeks scale to ~0.7×, so
    // their bottoms sit at photoCenterY + ~157px — a 40px gap below the
    // foreground photo's bottom edge keeps captions clear of side peeks.
    const captionFontSize = 28;
    const captionGap = 40;
    const captionTopY = photoCenterY + photoBaseHeight / 2 + captionGap;
    const captionLineHeight = captionFontSize * 1.2;
    const captionMaxWidth = photoBaseWidth - 40;

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
          ctx.fillStyle = state.primary;
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

    // Subtitle (optional — only renders if user provided one). Stacks below
    // the title block, accounting for title wrap so it doesn't overlap.
    if (state.subtitle && state.subtitle.trim()) {
      tracks.push({
        id: "subtitle",
        start: 0.15,
        duration: 0.35,
        easing: easeOutCubic,
        onUpdate: (p, ctx) => {
          ctx.globalAlpha = p;
          ctx.translate(0, (1 - p) * 12);

          // Re-measure the title's wrapped line count so subtitle anchors
          // below the actual rendered title block.
          ctx.font = `bold ${titleFontSize}px Inter, system-ui, sans-serif`;
          const titleMaxWidth = width - 120;
          const titleLineHeight = titleFontSize * 1.15;
          const titleLines = wrapText(ctx, state.title ?? "", titleMaxWidth);

          const subtitleAnchorY =
            titleY + 90 + (titleLines.length - 1) * titleLineHeight;

          ctx.fillStyle = state.accent;
          ctx.font = `600 32px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const subtitleMaxWidth = width - 160;
          const subtitleLineHeight = 32 * 1.2;
          const subtitleLines = wrapText(
            ctx,
            state.subtitle,
            subtitleMaxWidth
          );
          const totalH = subtitleLines.length * subtitleLineHeight;
          const startY =
            subtitleAnchorY - totalH / 2 + subtitleLineHeight / 2;
          subtitleLines.forEach((line, i) => {
            ctx.fillText(line, width / 2, startY + i * subtitleLineHeight);
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
      // Captions track (H-7.12-3.5). Mirrors the carousel's slot/
      // transition state so each caption fades in/out in lockstep with
      // its photo's foreground state. Caption alpha falls off ~3× faster
      // than the photo's so only the centered caption reads clearly;
      // side-photo captions fade to invisible during transitions. Skipped
      // entirely when every caption is empty so the track adds no cost
      // for users who don't fill captions in.
      if (hasAnyCaption) {
        tracks.push({
          id: "captions",
          start: carouselStart,
          duration: naturalCarouselDuration,
          onUpdate: (p, ctx) => {
            const entrySeconds = 0.22;
            const entryFraction = Math.min(
              0.5,
              entrySeconds / naturalCarouselDuration
            );
            const entryAlpha =
              p < entryFraction ? easeOutCubic(p / entryFraction) : 1;

            const drawCaption = (caption: string, rel: number, alpha: number) => {
              if (!caption || alpha <= 0.01) return;
              ctx.save();
              ctx.globalAlpha = alpha;
              ctx.fillStyle = state.accent;
              ctx.font = `500 ${captionFontSize}px Inter, system-ui, sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              const lines = wrapText(ctx, caption, captionMaxWidth);
              lines.forEach((line, idx) => {
                ctx.fillText(
                  line,
                  width / 2 + rel * sideOffset,
                  captionTopY + idx * captionLineHeight
                );
              });
              ctx.restore();
            };

            if (photoCount === 1) {
              drawCaption(captions[0], 0, entryAlpha);
              return;
            }

            const totalSlots = photoCount;
            const t = p * totalSlots;
            const slotIndex = Math.min(photoCount - 1, Math.floor(t));
            const localT = t - slotIndex;

            const holdRatio = 0.7;
            let transitionProgress = 0;
            if (slotIndex < photoCount - 1 && localT >= holdRatio) {
              transitionProgress = (localT - holdRatio) / (1 - holdRatio);
              transitionProgress = easeOutCubic(transitionProgress);
            }
            const carouselPos = slotIndex + transitionProgress;

            captions.forEach((caption, i) => {
              if (!caption) return;
              const rel = i - carouselPos;
              const absRel = Math.abs(rel);
              const alpha = Math.max(0, 1 - absRel * 1.5) * entryAlpha;
              drawCaption(caption, rel, alpha);
            });
          },
        });
      }

      tracks.push({
        id: "carousel",
        start: carouselStart,
        duration: naturalCarouselDuration,
        onUpdate: (p, ctx) => {
          // Entry fade: ease the whole carousel in over the first 0.4s of the
          // track so photos don't pop in abruptly.
          const entrySeconds = 0.22;
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
