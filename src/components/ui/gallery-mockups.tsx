"use client";

/**
 * Programmatic illustrations for the marketing-page rotating gallery. Each
 * mockup is a self-contained React component that fills its parent slot
 * (max-w / max-h 100%) at its own intrinsic aspect ratio. No external
 * images, no Unsplash, no asset files — every visual is Tailwind, inline
 * SVG, or text.
 *
 * Five components, exported individually. The marketing page composes them
 * into the gallery's galleryItems array.
 */

const MINT = "#4ef2d9";

/* ────────────────────────────────────────────────────────────────────── */

/** US Letter portrait — print-ready PDF mockup. */
export function ListingFlyerPdfMockup() {
  return (
    <div
      className="bg-white text-neutral-900 rounded-md overflow-hidden shadow-2xl flex flex-col"
      style={{ aspectRatio: "8.5 / 11", maxHeight: "100%", maxWidth: "100%" }}
    >
      {/* Header band */}
      <div
        className="px-3 py-2 flex items-center gap-2 text-white flex-shrink-0"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        <div
          className="w-6 h-6 rounded flex items-center justify-center text-[7px] font-bold text-black flex-shrink-0"
          style={{ backgroundColor: MINT }}
        >
          AT
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[8px] font-bold leading-tight">
            Aaron Thomas Home Team
          </p>
          <p className="text-[6px] text-neutral-400 leading-tight">
            Real Broker LLC
          </p>
        </div>
        <div className="text-right text-[6px] text-neutral-300 leading-tight">
          <p>(253) 202-8825</p>
          <p>aaron@example.com</p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-3 pt-2.5 pb-3 flex flex-col gap-2 min-h-0">
        <span
          className="self-start text-[6px] font-bold uppercase tracking-[0.15em] text-black px-2 py-0.5 rounded-full"
          style={{ backgroundColor: MINT }}
        >
          Just Listed
        </span>
        <HouseHeroBlock />
        <div className="flex justify-between items-end gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold leading-tight">
              1247 Maple Heights Dr
            </p>
            <p className="text-[6px] text-neutral-600">Olympia, WA 98501</p>
          </div>
          <p
            className="text-[14px] font-extrabold leading-none"
            style={{ color: MINT }}
          >
            $685,000
          </p>
        </div>
        <p className="text-[7px] font-bold uppercase tracking-wider text-neutral-700">
          4 BEDS · 3 BATHS · 2,548 SQ FT
        </p>
        {/* Photo grid */}
        <div className="grid grid-cols-2 gap-1 mt-auto">
          <PhotoTile gradient="from-amber-200 to-amber-400" />
          <PhotoTile gradient="from-emerald-200 to-emerald-400" />
          <PhotoTile gradient="from-sky-200 to-sky-400" />
          <PhotoTile gradient="from-rose-200 to-rose-400" />
        </div>
      </div>

      {/* Footer band */}
      <div
        className="px-3 py-1.5 text-[6px] text-white flex justify-between flex-shrink-0"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        <span>Aaron Thomas · License #114577</span>
        <span className="opacity-70">simplyeditpro.com</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

/** 9:16 vertical — Instagram Reel / Story style animated MP4 frame. */
export function ListingFlyerMp4Mockup() {
  return (
    <div
      className="rounded-xl overflow-hidden shadow-2xl flex flex-col text-white relative"
      style={{
        aspectRatio: "9 / 16",
        maxHeight: "100%",
        maxWidth: "100%",
        background:
          "linear-gradient(180deg, #0c1f1c 0%, #061110 60%, #020807 100%)",
      }}
    >
      {/* Hero photo top half */}
      <div className="h-[48%] relative overflow-hidden">
        <HouseHeroBlock />
        <span
          className="absolute top-3 left-3 text-[7px] font-bold uppercase tracking-[0.15em] text-black px-2 py-1 rounded-full"
          style={{ backgroundColor: MINT }}
        >
          Just Sold
        </span>
      </div>

      {/* Info block */}
      <div className="flex-1 px-4 pt-3 flex flex-col gap-1.5">
        <p className="text-[9px] font-bold leading-tight">
          1247 Maple Heights Dr
        </p>
        <p className="text-[7px] text-neutral-400 leading-tight">
          Olympia, WA 98501
        </p>
        <p
          className="text-[24px] font-extrabold leading-none mt-1"
          style={{ color: MINT }}
        >
          $697,370
        </p>
        <p className="text-[7px] font-bold uppercase tracking-wider text-neutral-300">
          4 BEDS · 3 BATHS · 2,500 SQ FT
        </p>

        {/* Bottom row: features left + agent right */}
        <div className="flex justify-between gap-3 mt-auto pb-3">
          <div className="space-y-1">
            <Mp4Bullet text="Chef's kitchen" />
            <Mp4Bullet text="Open Bar" />
            <Mp4Bullet text="Indoor Pool" />
          </div>
          <div className="text-right">
            <div
              className="w-7 h-7 rounded ml-auto flex items-center justify-center text-[7px] font-bold text-black mb-1"
              style={{ backgroundColor: MINT }}
            >
              AT
            </div>
            <p className="text-[7px] font-bold leading-tight">Aaron Thomas</p>
            <p className="text-[6px] text-neutral-400">Real Broker LLC</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Mp4Bullet({ text }: { text: string }) {
  return (
    <p className="text-[7px] flex items-center gap-1">
      <span
        className="inline-block w-1 h-1 rounded-full"
        style={{ backgroundColor: MINT }}
      />
      {text}
    </p>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

/** 1:1 — Q&A card for Social Animator. */
export function SocialAnimatorQACardMockup() {
  return (
    <div
      className="rounded-xl overflow-hidden shadow-2xl relative flex flex-col text-white"
      style={{
        aspectRatio: "1 / 1",
        maxHeight: "100%",
        maxWidth: "100%",
        background:
          "radial-gradient(circle at 30% 20%, #1c2a35 0%, #0a0f15 60%, #030608 100%)",
      }}
    >
      {/* Decorative accent line */}
      <div
        className="absolute top-6 left-5 w-10 h-[2px] rounded-full"
        style={{ backgroundColor: MINT }}
      />

      <div className="flex-1 px-5 pt-12 pb-5 flex flex-col justify-center">
        <p className="text-[7px] uppercase tracking-[0.2em] text-neutral-500 mb-3">
          Q&amp;A &middot; April 2026
        </p>
        <p className="text-[14px] font-bold leading-tight text-white">
          What&apos;s the #1 thing buyers want in 2026?
        </p>
        <p
          className="text-[11px] font-semibold leading-snug mt-3"
          style={{ color: MINT }}
        >
          A turnkey home with no surprises.
        </p>
      </div>

      {/* Brand watermark */}
      <div className="px-5 pb-4 flex items-center gap-2">
        <div
          className="w-5 h-5 rounded flex items-center justify-center text-[6px] font-bold text-black"
          style={{ backgroundColor: MINT }}
        >
          AT
        </div>
        <p className="text-[7px] font-semibold">Aaron Thomas Home Team</p>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

/** 1:1 — Market Update card for Social Animator. */
export function SocialAnimatorMarketUpdateMockup() {
  return (
    <div
      className="rounded-xl overflow-hidden shadow-2xl flex flex-col text-white"
      style={{
        aspectRatio: "1 / 1",
        maxHeight: "100%",
        maxWidth: "100%",
        background:
          "linear-gradient(135deg, #0a1820 0%, #0a0a0a 70%, #050505 100%)",
      }}
    >
      <div className="flex-1 px-5 pt-5 pb-4 flex flex-col">
        <p
          className="text-[8px] uppercase tracking-[0.2em] font-bold"
          style={{ color: MINT }}
        >
          Market Update
        </p>
        <div className="flex items-baseline gap-2 mt-3">
          <p className="text-[40px] font-extrabold leading-none text-white tabular-nums">
            +8.2%
          </p>
          <p
            className="text-[10px] font-bold"
            style={{ color: MINT }}
          >
            YoY
          </p>
        </div>
        <p className="text-[8px] text-neutral-400 mt-1">
          Olympia, WA · April 2026
        </p>

        {/* Tiny chart suggestion */}
        <svg
          viewBox="0 0 100 30"
          preserveAspectRatio="none"
          className="w-full h-8 mt-3 opacity-90"
        >
          <polyline
            fill="none"
            stroke={MINT}
            strokeWidth="1.5"
            points="0,24 12,20 24,22 36,15 48,17 60,11 72,9 84,7 100,3"
          />
        </svg>

        {/* Stat blocks */}
        <div className="grid grid-cols-3 gap-1.5 mt-auto">
          <StatBlock label="Median" value="$685K" />
          <StatBlock label="Days on Mkt" value="12" />
          <StatBlock label="Sale to List" value="102%" />
        </div>
      </div>

      {/* Brand watermark */}
      <div className="px-5 pb-4 flex items-center gap-2 border-t border-neutral-900 pt-3">
        <div
          className="w-5 h-5 rounded flex items-center justify-center text-[6px] font-bold text-black"
          style={{ backgroundColor: MINT }}
        >
          AT
        </div>
        <p className="text-[7px] font-semibold">Aaron Thomas Home Team</p>
      </div>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-900/80 border border-neutral-800 rounded p-1.5">
      <p className="text-[6px] uppercase tracking-[0.1em] text-neutral-500">
        {label}
      </p>
      <p className="text-[10px] font-bold mt-0.5">{value}</p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

/** US Letter portrait — coming-soon listing presentation one-pager. */
export function ListingPresentationComingSoonMockup() {
  return (
    <div
      className="bg-white text-neutral-900 rounded-md overflow-hidden shadow-2xl flex flex-col relative"
      style={{ aspectRatio: "8.5 / 11", maxHeight: "100%", maxWidth: "100%" }}
    >
      {/* Letterhead band */}
      <div
        className="px-3 py-2 flex items-center justify-between text-white flex-shrink-0"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        <p className="text-[7px] uppercase tracking-[0.2em]" style={{ color: MINT }}>
          Listing Presentation
        </p>
        <p className="text-[6px] text-neutral-400">Aaron Thomas Home Team</p>
      </div>

      {/* Content (subtly blurred so it reads as "polished doc, in progress") */}
      <div
        className="flex-1 px-4 py-4 space-y-2.5 min-h-0"
        style={{ filter: "blur(1.5px)", opacity: 0.6 }}
      >
        <div className="space-y-1">
          <div className="h-2 w-3/4 bg-neutral-300 rounded" />
          <div className="h-1.5 w-1/2 bg-neutral-200 rounded" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="h-10 bg-neutral-200 rounded" />
          <div className="h-10 bg-neutral-200 rounded" />
          <div className="h-10 bg-neutral-200 rounded" />
        </div>
        <div className="space-y-1">
          <div className="h-1.5 bg-neutral-200 rounded" />
          <div className="h-1.5 bg-neutral-200 rounded" />
          <div className="h-1.5 w-5/6 bg-neutral-200 rounded" />
        </div>
        <div className="h-12 bg-neutral-200 rounded" />
        <div className="space-y-1">
          <div className="h-1.5 w-2/3 bg-neutral-200 rounded" />
          <div className="h-1.5 w-1/2 bg-neutral-200 rounded" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="h-8 bg-neutral-200 rounded" />
          <div className="h-8 bg-neutral-200 rounded" />
        </div>
      </div>

      {/* Coming-soon overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="px-5 py-3 rounded-md backdrop-blur-md text-center"
          style={{
            backgroundColor: "rgba(10, 10, 10, 0.85)",
            border: `1px solid ${MINT}66`,
          }}
        >
          <p
            className="text-[10px] font-extrabold uppercase tracking-[0.25em]"
            style={{ color: MINT }}
          >
            Coming Soon
          </p>
          <p className="text-[7px] text-neutral-400 mt-1.5">
            Polished pre-listing presentation
          </p>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

/** Stylized "house photo" placeholder — pure SVG, mint-tinted dusk palette. */
function HouseHeroBlock() {
  return (
    <div className="relative w-full h-full overflow-hidden">
      <svg
        viewBox="0 0 100 60"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
      >
        <defs>
          <linearGradient id="heroSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1f3a44" />
            <stop offset="100%" stopColor="#3e6b78" />
          </linearGradient>
          <linearGradient id="heroBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#525252" />
            <stop offset="100%" stopColor="#262626" />
          </linearGradient>
        </defs>
        <rect width="100" height="60" fill="url(#heroSky)" />
        {/* Distant hills */}
        <path d="M 0 42 Q 20 35 40 40 T 80 38 L 100 42 L 100 60 L 0 60 Z" fill="#16242b" />
        {/* Lawn */}
        <rect x="0" y="48" width="100" height="12" fill="#1a2922" />
        {/* House */}
        <polygon points="20,30 50,16 80,30" fill="#171717" />
        <rect x="25" y="30" width="50" height="20" fill="url(#heroBody)" />
        {/* Door */}
        <rect x="46" y="38" width="8" height="12" fill="#0a0a0a" />
        {/* Windows w/ warm glow */}
        <rect x="32" y="35" width="7" height="6" fill="#fde68a" opacity="0.9" />
        <rect x="61" y="35" width="7" height="6" fill="#fde68a" opacity="0.9" />
        {/* Chimney */}
        <rect x="62" y="20" width="4" height="11" fill="#0a0a0a" />
        {/* Walkway */}
        <polygon points="46,50 54,50 60,60 40,60" fill="#3f4a4a" opacity="0.7" />
      </svg>
    </div>
  );
}

function PhotoTile({ gradient }: { gradient: string }) {
  return (
    <div
      className={`w-full aspect-[4/3] rounded-sm bg-gradient-to-br ${gradient}`}
    />
  );
}
