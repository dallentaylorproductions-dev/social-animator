"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrandEngine, type BrandHexes } from "@/lib/brand/color-engine";
import { extractLogoColors } from "@/lib/brand/logo-colors";
import {
  consumerRoleVars,
  deriveConsumerRoles,
} from "../output/consumer-roles";

/**
 * BrandKitForm — Brand kit v3 (first-time-success optimization + real-template
 * preview). Recreated from docs/design/brand-kit-v3/ (mock + ENGINEERING_NOTES);
 * the README's NON-NORMATIVE deltas are binding. Visuals live in ./brand-kit.css
 * under the `.bk-scope` namespace.
 *
 * THE ONE COLOR. The agent picks a single **signature**; BrandEngine.derive()
 * turns it into the 7-role ramp (shown read-only), and a live **real-template**
 * preview — the actual seller page embedded in an iframe — repaints instantly as
 * they dial (same-origin postMessage bridge; debounced param-reload fallback).
 *
 * v3 deltas from v2:
 *  - Secondary color ROW removed (Item 1). The `secondary` data field + engine
 *    support stay; if a saved secondary exists, one quiet line renders.
 *  - "Suggested from your logo" row (Item 2) — up to 3 colors extracted from the
 *    Profile logo; one tap applies to Signature. Visible-but-empty with no logo.
 *  - "Open full sample page" (Item 3) — new tab, full page, current unsaved colors.
 *  - Readability collapses on a clean pass; body-text "adjusted" copy only when
 *    the render clamp actually moved a value (Item 4).
 *  - "Brand ready" closure state (Item 5); advisory contrast never downgrades it.
 *  - Real-template embedded preview replaces the MiniPage (Item 6).
 *
 * Controlled — the PARENT owns `values` + persists (mapping accent→brandAccent,
 * secondary→brandSecondary). NEVER writes on mount; autosave on change;
 * readability NEVER blocks save.
 */

export interface BrandKitFormValues {
  background: string;
  text: string;
  /** THE signature — wire-compatible with brandAccent (label rename). */
  accent: string;
  /** Optional secondary (data field kept; no UI row in v3). "" = unset. */
  secondary: string;
  defaultThemeId: string;
}

export interface BrandKitFormProps {
  values: BrandKitFormValues;
  onChange: (next: BrandKitFormValues) => void;
  defaults: { background: string; text: string; accent: string };
  /** Profile logo (data URL) — drives logo suggestions + Brand ready. */
  logoDataUrl?: string | null;
  /** Profile agent name — drives Brand ready completeness. */
  agentName?: string;
}

// Editorial is the only LIVE layout; Studio/Warm are disabled "Coming soon"
// (Phase E truthful state — both fall back to Editorial at render regardless).
const THEME_OPTIONS = [
  { id: "editorial", label: "Editorial", soon: false },
  { id: "studio", label: "Studio · Coming soon", soon: true },
  { id: "warm", label: "Warm · Coming soon", soon: true },
];

const PREVIEW_BASE = "/seller-presentation-preview";

/** Build the preview query string for the current (possibly unsaved) values. */
function previewParams(v: BrandKitFormValues, embed: boolean): string {
  const p = new URLSearchParams();
  p.set("fixture", "full");
  if (embed) p.set("embed", "1");
  // F3 — new publishes are flagship (v2), so the live preview renders the
  // FLAGSHIP template (the read-time override the preview route exposes).
  // Agents now dial colors against the look they actually publish, and the
  // preview shares ONE color path with the real page (deriveConsumerRoles).
  p.set("template", "flagship");
  p.set("brandAccent", v.accent);
  p.set("brandBg", v.background);
  p.set("brandText", v.text);
  if (v.secondary) p.set("brandSecondary", v.secondary);
  return p.toString();
}

/* ---- editable hex field (commit on blur/Enter; invalid reverts) -------- */
function HexField({
  value,
  onCommit,
  testId,
  inputRef,
}: {
  value: string;
  onCommit: (v: string) => void;
  testId: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const [draft, setDraft] = useState(value || "");
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  function commit(v: string) {
    const n = BrandEngine.normHex((v || "").trim());
    if (n) {
      setBad(false);
      onCommit(n);
    } else {
      setBad(true);
    }
  }

  return (
    <span className="hexfield">
      <input
        ref={inputRef}
        className={"hexin" + (bad ? " is-invalid" : "")}
        data-testid={testId}
        value={draft}
        spellCheck={false}
        aria-label={testId}
        aria-invalid={bad || undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {/* F4 — quiet inline hint on a failed parse (e.g. a 5-char hex). No toast,
          no blocking; clears on the next valid commit. The old value is kept
          (commit() didn't call onCommit), so the form never silently "saves"
          a bad hex while the agent thinks it did. */}
      {bad && (
        <span className="hexin-hint" data-testid={testId + "-hint"} role="alert">
          Not a valid hex. Use 6 digits, like #037290.
        </span>
      )}
    </span>
  );
}

/* ---- one color row: swatch IS the native picker trigger ---------------- */
function ColorRow({
  label,
  optLabel,
  color,
  onCommit,
  onReset,
  resetLabel,
  help,
  testId,
  pickerTestId,
}: {
  label: string;
  optLabel?: string;
  color: string;
  onCommit: (v: string) => void;
  onReset: () => void;
  resetLabel: string;
  help?: string;
  testId: string;
  pickerTestId: string;
}) {
  const pickerValue = (BrandEngine.normHex(color) || "#000000").toLowerCase();
  return (
    <div className="crow">
      <label className="swatch" style={{ background: color }}>
        <input
          type="color"
          className="swatch__native"
          value={pickerValue}
          aria-label={label + " color picker"}
          data-testid={pickerTestId}
          onChange={(e) =>
            onCommit(BrandEngine.normHex(e.target.value) || e.target.value)
          }
        />
      </label>
      <div className="crow__body">
        <div className="crow__head">
          <span className="crow__label">{label}</span>
          {optLabel ? <span className="crow__opt">{optLabel}</span> : null}
        </div>
        <div className="crow__field">
          <HexField value={color} onCommit={onCommit} testId={testId} />
          <button type="button" className="minibtn" onClick={onReset}>
            {resetLabel}
          </button>
        </div>
        {help ? <p className="crow__help">{help}</p> : null}
      </div>
    </div>
  );
}

/* ---- palette strip: the read-only 7-role derived ramp ------------------ */
const PALETTE_ROLES: Array<{ key: keyof BrandHexes; name: string; label: string }> = [
  { key: "signature", name: "signature", label: "prices & big numbers" },
  { key: "signature-deep", name: "deep", label: "price numerals" },
  { key: "signature-link", name: "link", label: "body links" },
  { key: "tint-12", name: "panel tint", label: "panel fills" },
  { key: "tint-6", name: "card tint", label: "stat-card fills" },
  { key: "line-30", name: "line", label: "dividers" },
  { key: "on-signature", name: "on-signature", label: "text on fills" },
];

function PaletteStrip({ hexes }: { hexes: BrandHexes }) {
  return (
    <div
      className="palette-strip"
      data-testid="brand-palette-strip"
      role="group"
      aria-label="Your derived palette"
    >
      <div className="palette-strip__chips">
        {PALETTE_ROLES.map((role) => {
          const hex = hexes[role.key];
          const isOnSig = role.key === "on-signature";
          const swatchBg = isOnSig ? hexes["signature"] : hex;
          return (
            <div
              key={role.key}
              className="pchip"
              data-testid={"brand-palette-chip-" + role.key}
              title="Derived automatically from your signature"
            >
              <div className="pchip__swatch" style={{ background: swatchBg }} aria-hidden="true">
                {isOnSig ? (
                  <span className="pchip__aa" style={{ color: hex }}>
                    Aa
                  </span>
                ) : null}
              </div>
              <div className="pchip__meta">
                <div className="pchip__role">{role.name}</div>
                <div className="pchip__label">{role.label}</div>
                <div className="pchip__hex">{hex}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- readability sample chip ------------------------------------------- */
// A fix renders only when it produces a REAL change (reachability honesty).
interface SampleFix {
  label: string;
  apply: () => void;
}

function Sample({
  label,
  ratio,
  target,
  roleColor,
  adjusted,
  fixes,
  note,
}: {
  label: string;
  ratio: number;
  target: number;
  roleColor: string;
  adjusted?: boolean;
  fixes?: SampleFix[];
  note?: string;
}) {
  const pass = ratio >= target;
  // The instrument renders on the FIXED panel surface (the live preview beside
  // the panel is the honest sample). A small swatch keeps the role-color hint
  // while the label stays neutral and legible at any user colors.
  return (
    <div className="sample">
      <div className="sample__row">
        <span className="sample__txt">
          <span
            className="sample__dot"
            style={{ background: roleColor }}
            aria-hidden="true"
          />
          {label}
          {adjusted ? (
            <span className="sample__adjusted">adjusted to stay readable</span>
          ) : null}
        </span>
        <span className="sample__right">
          <span
            className={"sample__ratio " + (pass ? "is-pass" : "is-warn")}
            data-testid="brand-readability-ratio"
          >
            {pass ? "Clear" : "Low"} {ratio.toFixed(1)}
          </span>
          {!pass &&
            fixes?.map((f) => (
              <button
                key={f.label}
                type="button"
                className="sample__fix"
                onClick={f.apply}
                data-testid="brand-readability-fix"
              >
                {f.label}
              </button>
            ))}
        </span>
      </div>
      {!pass && note ? <p className="sample__note">{note}</p> : null}
    </div>
  );
}

/* ---- saved indicator (autosave; no Save button) ----------------------- */
function SavedIndicator({ trigger }: { trigger: string }) {
  const [saving, setSaving] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaving(true);
    const t = setTimeout(() => setSaving(false), 650);
    return () => clearTimeout(t);
  }, [trigger]);
  return (
    <span
      className={"note note--saved" + (saving ? " is-saving" : "")}
      data-testid="brand-autosave-indicator"
    >
      <span className="note__dot" />
      <span>{saving ? "Saving…" : "Saved automatically."}</span>
    </span>
  );
}

/* ---- the form ---------------------------------------------------------- */
export function BrandKitForm({
  values,
  onChange,
  defaults,
  logoDataUrl,
  agentName,
}: BrandKitFormProps) {
  const DEF = defaults;
  const [readOpen, setReadOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  // initial iframe src — captured once; live updates flow over the bridge.
  const initialSrc = useRef(`${PREVIEW_BASE}?${previewParams(values, true)}`);
  const [iframeSrc, setIframeSrc] = useState(initialSrc.current);

  const set = (patch: Partial<BrandKitFormValues>) =>
    onChange({ ...values, ...patch });

  const derived = useMemo(
    () =>
      BrandEngine.derive(values.accent, {
        surface: values.background,
        ink: values.text,
        secondary: values.secondary || null,
      }),
    [values.accent, values.secondary, values.background, values.text],
  );

  // F3 — the flagship preview consumes ONLY the signature ramp (paper/ink are
  // layout-locked), resolved through the SAME deriveConsumerRoles the real v2
  // page uses. These are the vars pushed over the live bridge so dialing the
  // signature repaints the flagship root without a reload.
  const previewRoleVars = useMemo(
    () => consumerRoleVars(deriveConsumerRoles(values.accent)),
    [values.accent],
  );

  // ---- logo color suggestions (extraction, never AI) ----
  const logoPresent = !!logoDataUrl;
  useEffect(() => {
    let alive = true;
    if (!logoDataUrl) {
      setSuggestions([]);
      return;
    }
    extractLogoColors(logoDataUrl).then((cols) => {
      if (alive) setSuggestions(cols);
    });
    return () => {
      alive = false;
    };
  }, [logoDataUrl]);

  // ---- live preview bridge ----
  // Listen for the embed's ready handshake (same-origin only).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string };
      if (d && d.type === "sep-embed-ready") setBridgeReady(true);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // When the bridge is live, push the flagship role vars on every change (no
  // reload). Pushes the deriveConsumerRoles set (not derived.vars) so the
  // tokens match exactly what the flagship root consumes.
  useEffect(() => {
    if (!bridgeReady) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      { type: "sep-brand-vars", vars: previewRoleVars },
      window.location.origin,
    );
  }, [previewRoleVars, bridgeReady]);

  // Fallback: until the bridge is confirmed, reflect changes via a debounced
  // param reload of the iframe (covers a blocked/absent bridge).
  useEffect(() => {
    if (bridgeReady) return;
    const t = setTimeout(() => {
      setIframeSrc(`${PREVIEW_BASE}?${previewParams(values, true)}`);
    }, 400);
    return () => clearTimeout(t);
  }, [values, bridgeReady]);

  // ---- readability (v3: collapse on clean pass; honest "adjusted") ----
  const r = derived.report;
  const raw = r.rawSignatureOnSurface;
  const pricesPass = raw >= 3.0;
  const linksPass = raw >= 4.5;
  // Body text is no longer user-editable (v2 locks paper+ink — the body row
  // is always the locked ink on paper and can't fail), so it's dropped from
  // the readability verdict and panel. Prices/Links/Section-numerals remain.
  const secHex = values.secondary ? BrandEngine.normHex(values.secondary) : null;
  const secRatio = secHex ? BrandEngine.contrast(secHex, values.background) : null;
  const secPass = secRatio == null ? true : secRatio >= 3.0;
  const good = pricesPass && secPass;
  // The accordion is open iff `readOpen`. A warn force-OPENS it (effect below),
  // and applying a one-tap fix re-runs derivation + updates the chips IN PLACE
  // with the panel still open — it collapses ONLY when the user clicks "Hide
  // details". (The verdict pill may flip to all-clear while expanded — fine.)
  const expanded = readOpen;
  // A warn force-opens the details; once open it stays open (this only sets,
  // never unsets — "Hide details" is the sole collapse), so applying a fix that
  // clears the warn keeps the remaining suggestions visible.
  useEffect(() => {
    if (!good) setReadOpen(true);
  }, [good]);

  // ---- reachability-aware fixes (no dead buttons, ever) ----------------
  // For a failing role we build only fixes that produce a REAL change. A
  // foreground fix is offered when the role can reach its target by lightness
  // alone; otherwise we fall back to softening the BACKGROUND (the honest
  // alternative) and say so. Body offers both paths, smallest change first.
  const sigHex = BrandEngine.normHex(values.accent) || values.accent;
  const bg = values.background;

  // signature roles (prices 3.0 / links 4.5) — the foreground IS the signature
  function signatureFixes(target: number): {
    fixes: SampleFix[];
    note?: string;
  } {
    const fg = BrandEngine.clampContrastEx(sigHex, bg, target);
    if (fg.reached) {
      return { fixes: [{ label: "Bump contrast", apply: () => set({ accent: fg.hex }) }] };
    }
    const soft = BrandEngine.softenSurfaceFor(bg, sigHex, target);
    return {
      fixes: [{ label: "Soften the background", apply: () => set({ background: soft.hex }) }],
      note:
        target >= 4.5
          ? "Your background is too strong for readable links at any shade. Soften the background instead."
          : "Your background is too strong for a readable signature at any shade. Soften the background instead.",
    };
  }

  // secondary (section numerals 3.0) — bump the secondary or soften the bg
  function secondaryFixes(): { fixes: SampleFix[]; note?: string } {
    if (!secHex) return { fixes: [] };
    const fg = BrandEngine.clampContrastEx(secHex, bg, 3.0);
    if (fg.reached) {
      return { fixes: [{ label: "Bump contrast", apply: () => set({ secondary: fg.hex }) }] };
    }
    const soft = BrandEngine.softenSurfaceFor(bg, secHex, 3.0);
    return {
      fixes: [{ label: "Soften the background", apply: () => set({ background: soft.hex }) }],
      note: "Your background is too strong for readable section numerals at any shade. Soften the background instead.",
    };
  }

  const pricesFix = pricesPass ? null : signatureFixes(3.0);
  const linksFix = linksPass ? null : signatureFixes(4.5);
  const secFix = secHex && !secPass ? secondaryFixes() : null;

  // ---- brand ready (advisory contrast never downgrades it) ----
  const complete = logoPresent && !!(agentName && agentName.trim());

  const samplePageHref = `${PREVIEW_BASE}?${previewParams(values, false)}`;

  return (
    <div className="bk-v3 cols">
      <div className="bk-form">
        {/* SIGNATURE */}
        <ColorRow
          label="Signature color"
          optLabel="The one color"
          color={values.accent}
          onCommit={(v) => set({ accent: v })}
          onReset={() => set({ accent: DEF.accent })}
          resetLabel="Default"
          help="Your one brand color. Everything else (prices, buttons, links, accents and dividers) is derived from it."
          testId="brand-color-accent"
          pickerTestId="brand-color-picker-accent"
        />

        {/* a saved secondary from an earlier template (data kept; no row) */}
        {values.secondary ? (
          <p className="secondary-saved" data-testid="brand-secondary-saved-note">
            Secondary color saved for future templates.
          </p>
        ) : null}

        {/* SUGGESTED FROM YOUR LOGO */}
        <div className="suggest" data-testid="brand-logo-suggestions">
          {logoPresent && suggestions.length > 0 ? (
            <>
              <div className="suggest__copy">
                {suggestions.length === 1
                  ? "We found this color in your logo."
                  : "Suggested from your logo."}
              </div>
              <div className="suggest__row">
                {suggestions.map((hex, i) => {
                  const active =
                    BrandEngine.normHex(hex) === BrandEngine.normHex(values.accent);
                  return (
                    <button
                      key={hex}
                      type="button"
                      className={"suggest__chip" + (active ? " is-active" : "")}
                      style={{ background: hex }}
                      data-testid={"brand-logo-suggestion-" + i}
                      onClick={() => set({ accent: hex })}
                      title={`Apply ${hex}`}
                      aria-label={`Apply ${hex} as your signature color`}
                    >
                      {active ? <span className="suggest__tick">✓</span> : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="suggest__empty" data-testid="brand-logo-suggestions-empty">
              Upload a logo and we&apos;ll suggest colors from it.{" "}
              <a className="link" href="/settings">
                Go to Profile
              </a>
            </div>
          )}
        </div>

        {/* DERIVED PALETTE */}
        <div className="palette-block">
          <div className="palette-block__head">
            <span className="palette-block__title">Your palette</span>
            <span className="palette-block__sub">Derived · read-only</span>
          </div>
          <PaletteStrip hexes={derived.hexes} />
        </div>

        {/* PAGE SURFACE controls removed (v2 locks paper+ink — the flagship
            template consumes only the signature ramp, so Background / Body-text
            overrides no longer affect any new page). The brandBackground /
            brandText schema fields are RETAINED (see src/lib/brand.ts) so
            already-published frozen v1 pages still render their stored values;
            they're simply no longer editable here. */}

        {/* DEFAULT LAYOUT — production dropdown (card picker is a future concept) */}
        <div className="field-block">
          <label className="field-block__label" htmlFor="bk-theme">
            Default layout
          </label>
          <select
            id="bk-theme"
            className="select"
            value={values.defaultThemeId}
            onChange={(e) => set({ defaultThemeId: e.target.value })}
            data-testid="brand-default-theme"
          >
            {THEME_OPTIONS.map((o) => (
              <option key={o.id} value={o.id} disabled={o.soon}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="field-block__help">
            The layout new presentations start with. Studio and Warm fall back to
            the Editorial layout for now. You can switch any single presentation
            later.
          </p>
        </div>

        {/* READABILITY v3 — collapses on a clean pass; never blocks save */}
        <div
          className={"read " + (good ? "is-good" : "is-warn")}
          data-testid="brand-readability"
          role="status"
        >
          <button
            type="button"
            className="read__head"
            data-testid="brand-readability-verdict"
            aria-expanded={expanded}
            onClick={() => {
              if (good) setReadOpen((o) => !o);
            }}
          >
            <span className="read__dot" aria-hidden="true">
              {good ? "✓" : "!"}
            </span>
            <span className="read__verdict">
              <strong>{good ? "Readability all clear" : "Readability needs a look"}</strong>
              <span>
                {good
                  ? "Your page text passes contrast checks."
                  : "Some page text may be hard to read."}
              </span>
            </span>
            {good ? (
              <span className="read__toggle">
                {readOpen ? "Hide details" : "View details"}
              </span>
            ) : null}
          </button>

          {expanded ? (
            <div className="read__samples" data-testid="brand-readability-fixes">
              <Sample
                label="Prices & big numbers"
                ratio={raw}
                target={3.0}
                roleColor={derived.hexes["signature"]}
                fixes={pricesFix?.fixes}
                note={pricesFix?.note}
              />
              <Sample
                label="Links"
                ratio={raw}
                target={4.5}
                roleColor={derived.hexes["signature-link"]}
                fixes={linksFix?.fixes}
                note={linksFix?.note}
              />
              {secHex && secRatio != null ? (
                <Sample
                  label="Section numerals"
                  ratio={secRatio}
                  target={3.0}
                  roleColor={secHex}
                  fixes={secFix?.fixes}
                  note={secFix?.note}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        {/* SAVE + SCOPE (scope sits directly under autosave) */}
        <div className="notes">
          <SavedIndicator
            trigger={`${values.background}|${values.text}|${values.accent}|${values.secondary}|${values.defaultThemeId}`}
          />
          <p className="scope-note">
            Existing published pages keep their original colors. New publishes use
            your latest brand.
          </p>
        </div>

        {/* BRAND READY — closure state (advisory contrast never downgrades it) */}
        <div
          className={"ready " + (complete ? "is-complete" : "is-incomplete")}
          data-testid="brand-ready-state"
        >
          <span className="ready__mark" aria-hidden="true">
            {complete ? "✓" : ""}
          </span>
          <div className="ready__body">
            {complete ? (
              <>
                <strong>Brand ready</strong>
                <span>
                  Your color, logo, and page contrast are set for seller pages.
                </span>
              </>
            ) : (
              <>
                <strong>Almost ready</strong>
                <span>
                  Add your agent name and logo so seller pages feel complete.{" "}
                  <a className="link" href="/settings">
                    Go to Profile
                  </a>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* PREVIEW — the REAL seller template, embedded live */}
      <div className="preview">
        <div className="preview__head">
          <span className="preview__label">Preview</span>
          <span className="preview__live">Live</span>
        </div>
        <div className="phone">
          <div className="phone__screen">
            <iframe
              ref={iframeRef}
              className="phone__frame"
              src={iframeSrc}
              title="Live seller-page preview"
              data-testid="brand-minipage-preview"
            />
          </div>
        </div>
        <a
          className="sample-page-btn"
          href={samplePageHref}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="brand-open-sample-page"
        >
          Open full sample page
        </a>
        <p className="preview__caption">
          Opens a full-length sample page in your current colors.
        </p>
      </div>
    </div>
  );
}
