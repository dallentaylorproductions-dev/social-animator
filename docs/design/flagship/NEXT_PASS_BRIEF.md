# Next-pass brief — Flagship seller page (for Claude cowork)

> Optimized to **view → iterate → diagnose**. The page is one self-contained file
> (`flagship_template.html`) that runs as-is. Round 2 is current and verifier-clean. Don't
> rebuild — upgrade. Full rationale in `DESIGN_README.md`; element→role map in `TOKEN_MAP.md`.

## View it in 60 seconds
Open `flagship_template.html`. Drive the **Mock states** bar (review chrome — engineering
strips it): viewport · 6 signatures (3 real + 3 hostile) · tint Confident/Quiet · count
Beside/Inline · optional Video/Reviews/Comp-note · stats Ready/Pending/Off. Scroll slowly —
price counts up, chart strokes on. Then click **terracotta** and scroll to the dark agent
band: the primary CTA label must go **dark** (the contract's deterministic on-signature
result), proof the system isn't hardcoded to one colorway.

## Diagnose with eval, not screenshots (two known traps)
- **Chart line** is a stroked SVG path → screenshot tools render it BLANK. Verify live:
  `#chartPlot .cl-line` has `getBBox().width > 200`, a resolved `stroke` (oklch/rgb, never
  `none`/`var(...)`), and `strokeDashoffset === '0'` after it's in view. The dashed
  `.cl-ref` + `.cl-reflabel` ("Recommended · $687k") must resolve too.
- **Note headline** shows a FALSE overlap in captures during font-swap. Live geometry is
  clean (`.note .lead` top sits ~14px below `.note .headline` bottom). Verify by rect.
- **Color sanity:** a probe `span{color:var(--tint-12)}` inside `.frame` must compute a sky
  tint and `--signature-deep` a deep teal — if either is `rgb(26,22,18)` (ink), the OKLCh
  derivation broke (it's declared on `[data-signature]`, NOT `:root`, for a reason).

## Architecture you must preserve
- **Only brand input = `--signature`.** All other roles derive from it (OKLCh). The two
  clamped roles (`--signature-link`, `--on-signature`) are seeded per signature with the
  engine's resolved hex. Layout neutrals (`--surface/paper`, `--ink`, `--on-dark`,
  `--dark-band`, `--tint-base`) are labelled and constant. Swapping `data-signature` repaints.
- **`--on-dark` ≠ `--on-signature`.** Dark-band text uses the fixed layout cream `--on-dark`;
  `--on-signature` (resolved, dark for terracotta) is ONLY the signature-filled CTA label.
- **Responsive = `@container` + `cqi`** on `.frame`, never `vw`/media queries inside the frame.
- **Motion** commits its end-state synchronously and animates *from* hidden (so a throttled
  tab never strands the chart line invisible); `beforeprint` forces end-states.

## Current-state delta — your direct edit
The **price eyebrow** was simplified by hand to plain `RECOMMENDED LIST` (signature dot +
trailing rule removed). It now diverges from every other eyebrow (`index · label · rule`).
**Decide, don't drift:** either (a) propagate this quieter eyebrow system-wide, or (b) restore
the dot+rule here for consistency. Pick one and apply across all 6 eyebrows.

## Open questions blocking "perfect" (for Dallen / engineering)
1. **Tint surface** (`DESIGN_README §A`) — literal `12%→cream` computes muted olive; the
   confident sky tint needs a neutral base. The page tints into `--tint-base` and flags it.
   *Confirm production's tint surface;* if neutral, encode `--tint-base` in the engine.
2. **Pale-signature big numbers** (`§D`) — yellow's count digit / stat values can't hit 3:1 on
   cream by foreground clamp. Engine request: seat informational numbers on a tint chip
   (the A4 background-adjust path). Decorative numerals can stay unclamped.

## Upgrade backlog (ordered by leverage)
1. **Resolve the eyebrow inconsistency** above — cheap, visible, unblocks a clean system.
2. **Stress-audit the 3 hostile signatures** zone-by-zone; log failures as engine requests,
   never layout hacks. Yellow is the live failure to design around (or push back on).
3. **Desktop editorial depth** — the wide (`@container ≥820px`) layout is solid but conservative
   (2-col comps ledger, price composition). Push it further; audit long lead measures.
4. **Chart richness** — add a subtle "your home" point against the trend, only if truthful to
   template data and mobile-cheap.
5. **Print/PDF stylesheet** — sellers save these; add page breaks, hide the review bar.
6. **Port** — one component per section, roles as CSS vars on a wrapper, signature as a prop
   setting `data-signature`; keep the `@container`/`cqi` model and the synchronous-end-state motion.

## Don't
No new sections / reordering / invented content (ask when you lack context — the footer was a
case of that). On-photo text only on solid scrims. Motion motivated-only. No engine-math changes —
flag ramp limits as engine requests.
