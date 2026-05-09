"use client";

/**
 * Programmatic illustrations for the marketing-page rotating gallery. Each
 * mockup is a self-contained React component that fills its parent slot
 * (max-w / max-h 100%) at its own intrinsic aspect ratio.
 *
 * H-3.5b: The two property-themed mockups (PDF flyer, MP4 flyer) now use
 * Unsplash photography for the hero photo + photo grid — abstract SVG
 * houses read as low-budget at the gallery scale. The other three mockups
 * (Q&A, Market Update, Coming Soon) don't depend on house imagery and
 * stay pure Tailwind/SVG.
 *
 * Plain <img> tags rather than Next/Image so the gallery's framer-motion
 * transforms (3D rotateY, scale) play nicely without wrapping container
 * quirks. No Unsplash domain registration in next.config needed.
 */

const MINT = "#4ef2d9";

// Unsplash photo IDs. License doesn't require attribution but encourages
// it; keeping these comments so credits can be added later if policy changes.
//   exterior  https://unsplash.com/photos/Pc4iz8h5JJo (modern home)
//   kitchen   https://unsplash.com/photos/ll0iuvVtTGg (modern kitchen)
//   living    https://unsplash.com/photos/I_LgQ8JZFGE (modern living room)
//   bedroom   https://unsplash.com/photos/SYTO3xs06fU (modern bedroom)
//   bathroom  https://unsplash.com/photos/qeF8FzaA5YE (modern bathroom)
const UNSPLASH = (id: string, w: number, q = 80) =>
  `https://images.unsplash.com/photo-${id}?w=${w}&q=${q}&auto=format&fit=crop`;

const PHOTOS = {
  exterior: UNSPLASH("1568605114967-8130f3a36994", 800),
  kitchen: UNSPLASH("1556909114-f6e7ad7d3136", 400),
  living: UNSPLASH("1493663284031-b7e3aefcae8e", 400),
  bedroom: UNSPLASH("1540518614846-7eded433c457", 400),
  bathroom: UNSPLASH("1552321554-5fefe8c9ef14", 400),
};

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
        <PropertyHero src={PHOTOS.exterior} alt="Modern home exterior" />
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
        {/* Photo grid — kitchen, living, bedroom, bathroom from one
            visually-coherent property set. */}
        <div className="grid grid-cols-2 gap-1 mt-auto">
          <PhotoTile src={PHOTOS.kitchen} alt="" gradient="from-amber-200 to-amber-400" />
          <PhotoTile src={PHOTOS.living} alt="" gradient="from-emerald-200 to-emerald-400" />
          <PhotoTile src={PHOTOS.bedroom} alt="" gradient="from-sky-200 to-sky-400" />
          <PhotoTile src={PHOTOS.bathroom} alt="" gradient="from-rose-200 to-rose-400" />
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
        <PropertyHero src={PHOTOS.exterior} alt="Modern home exterior" />
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
/**
 * Stylized one-pager mirroring the actual PresentationDocument layout:
 * dark header band, property block, agent block (headshot + bio
 * lines), 4-tile track record, marketing-strategy bullets, 3-column
 * comp grid, dark footer band. Replaces the H-0 "Coming Soon" mockup
 * now that the tool ships in v1.25.
 */
export function ListingPresentationLiveMockup() {
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
          className="h-5 w-5 rounded-sm flex items-center justify-center text-[6px] font-bold text-black"
          style={{ backgroundColor: MINT }}
        >
          AT
        </div>
        <div className="flex-1 min-w-0 leading-tight">
          <p className="text-[7px] font-semibold">Aaron Thomas</p>
          <p className="text-[5.5px] opacity-75">Aaron Thomas Home Team</p>
        </div>
        <div className="text-right text-[5.5px] opacity-85 leading-tight">
          <div>(360) 555-0142</div>
          <div>aaron@athomes.com</div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-3 py-3 min-h-0 overflow-hidden flex flex-col gap-3">
        {/* Property */}
        <div>
          <p
            className="text-[5px] font-bold uppercase tracking-[0.18em]"
            style={{ color: MINT }}
          >
            Presentation for
          </p>
          <p className="text-[11px] font-bold leading-tight mt-0.5">
            1247 Maple Heights Dr
          </p>
          <p className="text-[6px] text-neutral-500 mt-0.5">
            Olympia, WA 98501
          </p>
          <p className="text-[5.5px] italic text-neutral-500 mt-1">
            Prepared for John & Jane Smith
          </p>
        </div>

        {/* Agent */}
        <div>
          <p
            className="text-[5px] font-bold uppercase tracking-[0.18em]"
            style={{ color: MINT }}
          >
            Meet your agent
          </p>
          <div className="flex items-start gap-2 mt-1.5">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-bold text-black"
              style={{ backgroundColor: MINT }}
            >
              A
            </div>
            <div className="flex-1 space-y-0.5 pt-0.5">
              <div className="h-[3px] w-full bg-neutral-300 rounded" />
              <div className="h-[3px] w-[92%] bg-neutral-300 rounded" />
              <div className="h-[3px] w-[88%] bg-neutral-300 rounded" />
              <div className="h-[3px] w-[60%] bg-neutral-300 rounded" />
            </div>
          </div>
        </div>

        {/* Track record */}
        <div>
          <p
            className="text-[5px] font-bold uppercase tracking-[0.18em]"
            style={{ color: MINT }}
          >
            Track record
          </p>
          <div className="grid grid-cols-4 gap-1 mt-1.5">
            {[
              { n: "47", l: "Sold" },
              { n: "12", l: "Avg DOM" },
              { n: "102%", l: "S/L" },
              { n: "8", l: "Years" },
            ].map((s, i) => (
              <div key={i} className="bg-neutral-100 rounded px-1 py-1.5">
                <p
                  className="text-[10px] font-bold leading-none"
                  style={{ color: MINT }}
                >
                  {s.n}
                </p>
                <p className="text-[4.5px] font-bold uppercase tracking-wider mt-0.5 text-neutral-500">
                  {s.l}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Marketing strategy */}
        <div>
          <p
            className="text-[5px] font-bold uppercase tracking-[0.18em]"
            style={{ color: MINT }}
          >
            Marketing strategy
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {[88, 76, 92].map((w, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span
                  className="w-1 h-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: MINT }}
                />
                <span
                  className="block h-[2.5px] bg-neutral-300 rounded"
                  style={{ width: `${w}%` }}
                />
              </li>
            ))}
          </ul>
        </div>

        {/* Comparable sales */}
        <div>
          <p
            className="text-[5px] font-bold uppercase tracking-[0.18em]"
            style={{ color: MINT }}
          >
            Recent comps
          </p>
          <div className="grid grid-cols-3 gap-1 mt-1.5">
            {[
              { p: "$675K", m: "8 DOM · 104%" },
              { p: "$695K", m: "12 DOM · 101%" },
              { p: "$682K", m: "9 DOM · 103%" },
            ].map((c, i) => (
              <div
                key={i}
                className="bg-neutral-100 rounded p-1 border border-neutral-200"
              >
                <div className="space-y-0.5">
                  <div className="h-[2.5px] w-full bg-neutral-300 rounded" />
                  <div className="h-[2.5px] w-3/4 bg-neutral-300 rounded" />
                </div>
                <p
                  className="text-[8px] font-bold mt-1"
                  style={{ color: MINT }}
                >
                  {c.p}
                </p>
                <p className="text-[4.5px] text-neutral-500 mt-0.5">{c.m}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer band */}
      <div
        className="px-3 py-1.5 flex items-center justify-between text-white text-[5.5px] flex-shrink-0"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        <span>Aaron Thomas · License #1234</span>
        <span className="opacity-85">athomes.com</span>
      </div>
    </div>
  );
}

/**
 * Stylized open-house flyer matching the actual PromoDocument:
 * mint-bg header band ("OPEN HOUSE" + date + time), hero photo,
 * property block (address + price), highlights bullets, agent
 * info + QR code row, mint-bg footer band. Same Aaron Thomas
 * placeholder content as the other gallery mockups for
 * consistency. The QR code is rendered as a static stylized SVG
 * pattern (not a real scannable code) — it's a marketing
 * illustration, not a working QR.
 */
export function OpenHousePromoMockup() {
  return (
    <div
      className="bg-white text-neutral-900 rounded-md overflow-hidden shadow-2xl flex flex-col"
      style={{ aspectRatio: "8.5 / 11", maxHeight: "100%", maxWidth: "100%" }}
    >
      {/* Header band */}
      <div
        className="px-3 py-2 flex flex-col items-center justify-center text-center text-black flex-shrink-0"
        style={{ backgroundColor: MINT }}
      >
        <p
          className="font-extrabold uppercase"
          style={{ fontSize: 11, letterSpacing: 3 }}
        >
          Open House
        </p>
        <p
          className="font-bold mt-0.5"
          style={{ fontSize: 6, letterSpacing: 0.5 }}
        >
          Saturday, May 15
        </p>
        <p className="text-[5px] opacity-85">12 PM – 3 PM</p>
      </div>

      {/* Hero photo */}
      <div className="relative w-full overflow-hidden flex-shrink-0" style={{ height: "32%" }}>
        <PropertyHero src={PHOTOS.exterior} alt="Open house property" />
      </div>

      {/* Body */}
      <div className="flex-1 px-3 py-2.5 flex flex-col gap-2 min-h-0">
        {/* Property */}
        <div>
          <p
            className="text-[5px] font-bold uppercase tracking-[0.18em]"
            style={{ color: MINT }}
          >
            Presenting
          </p>
          <div className="flex items-end justify-between gap-2 mt-0.5">
            <p className="text-[9px] font-bold leading-tight">
              1247 Maple Heights Dr
            </p>
            <p
              className="text-[9px] font-bold whitespace-nowrap"
              style={{ color: MINT }}
            >
              $685,000
            </p>
          </div>
          <p className="text-[5.5px] text-neutral-500">Olympia, WA 98501</p>
        </div>

        {/* Features */}
        <div>
          <p
            className="text-[5px] font-bold uppercase tracking-[0.18em]"
            style={{ color: MINT }}
          >
            Features
          </p>
          <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
            {["4BR / 3BA", "0.25 acres", "Renovated kitchen", "Mountain views"].map(
              (h, i) => (
                <li
                  key={i}
                  className="flex items-center gap-1 text-[6px]"
                >
                  <span
                    className="w-[3px] h-[3px] rounded-full flex-shrink-0"
                    style={{ backgroundColor: MINT }}
                  />
                  <span>{h}</span>
                </li>
              )
            )}
          </ul>
        </div>

        {/* Agent + QR row */}
        <div className="mt-auto flex items-stretch gap-2">
          <div className="flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-1.5">
              <div
                className="h-5 w-5 rounded-sm flex items-center justify-center text-[6px] font-bold text-black flex-shrink-0"
                style={{ backgroundColor: MINT }}
              >
                AT
              </div>
              <div className="leading-tight min-w-0">
                <p className="text-[7px] font-bold truncate">Aaron Thomas</p>
                <p className="text-[5.5px] text-neutral-500 truncate">
                  Aaron Thomas Home Team
                </p>
              </div>
            </div>
            <p className="text-[5.5px] mt-1">(360) 555-0142</p>
            <p className="text-[5.5px] truncate">aaron@athomes.com</p>
          </div>
          {/* Stylized QR — 6×6 grid of squares with two larger
              finder-style corners. Not a real scannable code; this
              is a marketing illustration. */}
          <div className="w-12 flex flex-col items-center flex-shrink-0">
            <StylizedQr />
            <p
              className="text-[5px] font-bold uppercase tracking-[0.15em] mt-1 text-center"
              style={{ color: MINT }}
            >
              Scan
            </p>
          </div>
        </div>
      </div>

      {/* Footer band */}
      <div
        className="px-3 py-1 flex items-center justify-between text-black text-[5px] font-bold flex-shrink-0"
        style={{ backgroundColor: MINT }}
      >
        <span className="flex-1 text-center">athomes.com/open-house</span>
        <span className="opacity-85">License #1234</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

/** Property hero photo. Plain <img> with object-cover; gradient
 *  fallback shows behind during load (and as a graceful fallback if
 *  Unsplash CDN ever fails to serve the image). */
function PropertyHero({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="w-full h-full object-cover"
      />
    </div>
  );
}

/** Photo tile inside the PDF mockup's 2x2 grid. Image overlay on a
 *  gradient fallback so loading state and any Unsplash CDN failure
 *  still render a tasteful tile. */
function PhotoTile({
  src,
  alt,
  gradient,
}: {
  src: string;
  alt: string;
  gradient: string;
}) {
  return (
    <div
      className={`relative w-full aspect-[4/3] rounded-sm overflow-hidden bg-gradient-to-br ${gradient} ring-1 ring-black/10`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover"
      />
    </div>
  );
}

/** Stylized QR illustration — 7×7 grid with three finder-pattern
 *  corners. Not a real scannable code; this lives only inside the
 *  marketing mockup. Pattern is hard-coded so it stays visually
 *  consistent across renders. */
function StylizedQr() {
  // Finder-pattern positions (TL/TR/BL) and a sparse data grid.
  // 1 = filled, 0 = empty. 7×7 module grid.
  const grid: number[][] = [
    [1, 1, 1, 0, 1, 1, 1],
    [1, 0, 1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0, 1, 1],
    [0, 0, 1, 0, 1, 0, 0],
    [1, 1, 0, 1, 0, 0, 1],
    [1, 0, 0, 0, 0, 1, 0],
    [1, 1, 1, 0, 1, 0, 1],
  ];
  return (
    <div
      className="grid bg-black p-[2px] rounded-sm"
      style={{
        gridTemplateColumns: "repeat(7, 1fr)",
        gridTemplateRows: "repeat(7, 1fr)",
        width: 40,
        height: 40,
        gap: 1,
      }}
    >
      {grid.flat().map((cell, i) => (
        <div
          key={i}
          style={{
            backgroundColor: cell ? "#ffffff" : "#000000",
          }}
        />
      ))}
    </div>
  );
}
