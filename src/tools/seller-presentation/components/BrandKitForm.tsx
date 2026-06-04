"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrandEngine, type BrandHexes } from "@/lib/brand/color-engine";
import { MiniPage } from "./MiniPage";

/**
 * BrandKitForm — the ONE controlled component for Brand kit v2 (Phase E.1).
 * Recreated from docs/design/brand-unification/brand_kit_v2.html +
 * palette_strip.jsx (Claude Design references); ENGINEERING_CONTRACT.md is
 * authoritative. Visuals live in ./brand-kit.css under the `.bk-scope`
 * namespace.
 *
 * THE ONE COLOR. The agent picks a single **signature** color (the existing
 * `brandAccent` field — the rename is label-only, no migration) plus an
 * optional **secondary**. `BrandEngine.derive()` turns the signature into a
 * 7-role tonal ramp (OKLCh, every text-bearing step AA-clamped per role);
 * the derived shades are SHOWN read-only (the palette strip) and previewed
 * live (the MiniPage), never asked as extra pickers.
 *
 * Controlled — the PARENT owns `values` and persists (it maps `accent` →
 * `brandAccent` and `secondary` → `brandSecondary`, persisting secondary as
 * ABSENT when unset). This child renders and reports changes; it NEVER
 * writes on mount (E.0 cohort-safety contract).
 *
 * Pieces (left column, top → bottom): signature row, secondary row, the
 * read-only "Your palette" strip, a collapsed "Page surface" disclosure
 * (background + text), the default-layout select, the never-blocking
 * Readability panel, and the footer notes. Right column: a sticky phone
 * preview of the MiniPage. Save is NEVER gated by contrast.
 */

export interface BrandKitFormValues {
  /** Layout-owned page paper (demoted default, overridable). */
  background: string;
  /** Layout-owned ink (demoted default, overridable). */
  text: string;
  /** THE signature — wire-compatible with E.0 `brandAccent` (label rename). */
  accent: string;
  /** NEW optional secondary; "" = unset (a first-class state). */
  secondary: string;
  defaultThemeId: string;
}

export interface BrandKitFormProps {
  values: BrandKitFormValues;
  onChange: (next: BrandKitFormValues) => void;
  layout?: "page" | "drawer";
  showRepublishReminder?: boolean;
  defaults: { background: string; text: string; accent: string };
}

const THEME_OPTIONS = [
  { id: "editorial", label: "Editorial" },
  { id: "studio", label: "Studio" },
  { id: "warm", label: "Warm" },
];

/* ---- editable hex field with its own draft state ----------------- */
function HexField({
  value,
  onCommit,
  placeholder,
  testId,
  inputRef,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  testId: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const [draft, setDraft] = useState(value || "");
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  function commit(v: string) {
    const s = (v || "").trim();
    // Empty + has-placeholder (secondary) commits as unset.
    if (s === "" && placeholder) {
      setBad(false);
      onCommit("");
      return;
    }
    const n = BrandEngine.normHex(s);
    if (n) {
      setBad(false);
      onCommit(n);
    } else {
      setBad(true); // invalid: keep last good value (no commit)
    }
  }

  return (
    <input
      ref={inputRef}
      className={"hexin" + (bad ? " is-invalid" : "")}
      data-testid={testId}
      value={draft}
      placeholder={placeholder || ""}
      spellCheck={false}
      aria-label={testId}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

/* ---- one color row (swatch + hex + reset/clear/add) -------------- */
function ColorRow({
  kind,
  label,
  optLabel,
  color,
  empty,
  help,
  onCommit,
  onReset,
  resetLabel,
  testId,
  pickerTestId,
  inputRef,
}: {
  kind: "signature" | "secondary" | "surface";
  label: string;
  optLabel?: string;
  color: string;
  empty?: boolean;
  help?: string;
  onCommit: (v: string) => void;
  onReset: () => void;
  resetLabel: string;
  testId: string;
  pickerTestId: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  // The swatch is the native OS color-picker trigger (restored from E.0 —
  // hex-only entry is hostile to nontechnical agents). A visually-hidden
  // <input type="color"> fills the swatch; clicking anywhere on it opens the
  // picker. Picking commits through the SAME path as a hex commit (parent
  // set → autosave → derive re-run). For the empty secondary the picker
  // opens from black and the first pick sets it (Add → pick). Values are
  // normalized to the engine's #RRGGBB casing so picker + hex agree.
  const pickerValue = (BrandEngine.normHex(empty ? "#000000" : color) ||
    "#000000").toLowerCase();
  return (
    <div className={"crow" + (kind === "secondary" ? " is-secondary" : "")}>
      <label
        className={"swatch" + (empty ? " is-empty" : "")}
        style={empty ? undefined : { background: color }}
      >
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
          <HexField
            value={empty ? "" : color}
            placeholder={kind === "secondary" ? "Optional" : ""}
            onCommit={onCommit}
            testId={testId}
            inputRef={inputRef}
          />
          <button type="button" className="minibtn" onClick={onReset}>
            {resetLabel}
          </button>
        </div>
        {help ? <p className="crow__help">{help}</p> : null}
      </div>
    </div>
  );
}

/* ---- palette strip: the read-only derived ramp ------------------- */
// Order + copy is intentional (palette_strip.jsx): hero first, then
// deep/link, fills, line, on-fill. Labels describe REAL layout roles
// (truthful-copy rule — no aspirational claims).
const PALETTE_ROLES: Array<{
  key: keyof BrandHexes;
  name: string;
  label: string;
}> = [
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
          // The on-signature chip previews the pairing: the swatch is the
          // signature fill, the "Aa" glyph is the on-signature tone.
          const swatchBg = isOnSig ? hexes["signature"] : hex;
          return (
            <div
              key={role.key}
              className="pchip"
              data-testid={"brand-palette-chip-" + role.key}
            >
              <div
                className="pchip__swatch"
                style={{ background: swatchBg }}
                aria-hidden="true"
              >
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

/* ---- readability sample chip ------------------------------------- */
function Sample({
  label,
  ratio,
  target,
  sampleBg,
  txtColor,
  onFix,
}: {
  label: string;
  ratio: number;
  target: number;
  sampleBg: string;
  txtColor: string;
  onFix?: () => void;
}) {
  const pass = ratio >= target;
  return (
    <div
      className="sample"
      style={{ "--sample-bg": sampleBg } as React.CSSProperties}
    >
      <span className="sample__txt" style={{ color: txtColor }}>
        {label}
      </span>
      <span className="sample__right">
        <span
          className={"sample__ratio " + (pass ? "is-pass" : "is-warn")}
          data-testid="brand-readability-ratio"
        >
          {pass ? "Clear" : "Low"} {ratio.toFixed(1)}
        </span>
        {!pass && onFix ? (
          <button
            type="button"
            className="sample__fix"
            onClick={onFix}
            data-testid="brand-readability-fix"
          >
            Bump contrast
          </button>
        ) : null}
      </span>
    </div>
  );
}

/* ---- saved indicator (autosave; no Save button) ----------------- */
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

/* ---- the form --------------------------------------------------- */
export function BrandKitForm({
  values,
  onChange,
  layout = "page",
  showRepublishReminder = false,
  defaults,
}: BrandKitFormProps) {
  const DEF = defaults;
  const [adv, setAdv] = useState(false);
  const secondaryInputRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<BrandKitFormValues>) =>
    onChange({ ...values, ...patch });

  // Live derivation — keyed on the four inputs (contract §State). The full
  // ramp + readability report are DERIVED, never stored.
  const derived = useMemo(
    () =>
      BrandEngine.derive(values.accent, {
        surface: values.background,
        ink: values.text,
        secondary: values.secondary || null,
      }),
    [values.accent, values.secondary, values.background, values.text],
  );

  // ---- readability verdict (round 2: role-based standards) ----
  const r = derived.report;
  const raw = r.rawSignatureOnSurface; // the agent's pick, unclamped
  const pricesPass = raw >= 3.0; // large display roles → AA-large
  const linksPass = raw >= 4.5; // body-size links → AA
  const bodyPass = r.bodyOnSurface >= 4.5;
  const secHex = values.secondary ? BrandEngine.normHex(values.secondary) : null;
  const secRatio = secHex ? BrandEngine.contrast(secHex, values.background) : null;
  const secPass = secRatio == null ? true : secRatio >= 3.0;
  // Verdict tracks the load-bearing roles (body + prices + secondary-if-set);
  // the Links chip carries its own finer warning without flipping the verdict.
  const good = bodyPass && pricesPass && secPass;

  // "Bump contrast" sets the field to the engine's clamp result for that
  // chip's target. NEVER blocks save — it only advises.
  const bumpSignature = (target: number) =>
    set({
      accent: BrandEngine.clampContrast(
        BrandEngine.normHex(values.accent) || values.accent,
        values.background,
        target,
        "deepen",
      ),
    });
  const bumpSecondary = () => {
    if (!secHex) return;
    set({
      secondary: BrandEngine.clampContrast(
        secHex,
        values.background,
        3.0,
        "deepen",
      ),
    });
  };

  const hasSecondary = !!values.secondary;

  const controls = (
    <div className="bk-form">
      {/* SIGNATURE — the hero input. testid kept as brand-color-accent
          (production is truth; do NOT rename to brand-color-signature). */}
      <ColorRow
        kind="signature"
        label="Signature color"
        optLabel="The one color"
        color={values.accent}
        testId="brand-color-accent"
        pickerTestId="brand-color-picker-accent"
        help="Pick one color. We build your palette from it — prices, buttons, links, accents and dividers all derive from here."
        onCommit={(v) => set({ accent: v })}
        onReset={() => set({ accent: DEF.accent })}
        resetLabel="Reset"
      />

      {/* SECONDARY — optional, quieter. Unset persists as ABSENT, not "".
          "Add" reveals the field for the agent to enter THEIR own color (we
          never pick one for them — truthful-substrate); "Clear" unsets. */}
      <ColorRow
        kind="secondary"
        label="Secondary color"
        optLabel="Optional"
        color={values.secondary || "#000000"}
        empty={!hasSecondary}
        testId="brand-color-secondary"
        pickerTestId="brand-color-picker-secondary"
        help="Used for decorative moments — section numerals, end-marks — when set. Derived from your signature when not."
        onCommit={(v) => set({ secondary: v })}
        onReset={() =>
          hasSecondary
            ? set({ secondary: "" })
            : secondaryInputRef.current?.focus()
        }
        resetLabel={hasSecondary ? "Clear" : "Add"}
        inputRef={secondaryInputRef}
      />

      {/* YOUR PALETTE — read-only derived ramp */}
      <div className="palette-block">
        <div className="palette-block__head">
          <span className="palette-block__title">Your palette</span>
          <span className="palette-block__sub">Derived · read-only</span>
        </div>
        <PaletteStrip hexes={derived.hexes} />
      </div>

      {/* PAGE SURFACE — advanced disclosure, collapsed by default */}
      <div className={"adv" + (adv ? " is-open" : "")}>
        <button
          type="button"
          className="adv__toggle"
          onClick={() => setAdv((a) => !a)}
          aria-expanded={adv}
          data-testid="brand-surface-disclosure"
        >
          <span className="adv__caret" aria-hidden="true">
            ▶
          </span>
          <span className="adv__t">Page surface</span>
          <span className="adv__sub">Layout-owned defaults you can override</span>
        </button>
        <div className="adv__body">
          <ColorRow
            kind="surface"
            label="Background"
            color={values.background}
            testId="brand-color-background"
            pickerTestId="brand-color-picker-background"
            onCommit={(v) => set({ background: v })}
            onReset={() => set({ background: DEF.background })}
            resetLabel="Reset"
          />
          <ColorRow
            kind="surface"
            label="Text"
            color={values.text}
            testId="brand-color-text"
            pickerTestId="brand-color-picker-text"
            onCommit={(v) => set({ text: v })}
            onReset={() => set({ text: DEF.text })}
            resetLabel="Reset"
          />
        </div>
      </div>

      {/* DEFAULT LAYOUT */}
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
            <option key={o.id} value={o.id}>
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

      {/* READABILITY — never blocks save */}
      <div
        className={"read " + (good ? "is-good" : "is-warn")}
        data-testid="brand-readability"
        role="status"
      >
        <div className="read__verdict">
          <span className="read__pill" data-testid="brand-readability-verdict">
            <span className="read__dot" aria-hidden="true">
              {good ? "✓" : "!"}
            </span>
            {good ? "Easy to read" : "Worth a look"}
          </span>
        </div>
        <p className="read__desc">
          {good
            ? "Your signature has plenty of contrast against the page. Sellers will see it clearly on any screen."
            : "One role is faint against the page. It still saves — published pages auto-clamp to stay legible — but a small bump matches what sellers see."}
        </p>
        <div className="read__samples" data-testid="brand-readability-fixes">
          <Sample
            label="Body text"
            ratio={r.bodyOnSurface}
            target={4.5}
            sampleBg={values.background}
            txtColor={values.text}
          />
          <Sample
            label="Prices & big numbers"
            ratio={raw}
            target={3.0}
            sampleBg={values.background}
            txtColor={derived.hexes["signature"]}
            onFix={!pricesPass ? () => bumpSignature(3.0) : undefined}
          />
          <Sample
            label="Links"
            ratio={raw}
            target={4.5}
            sampleBg={values.background}
            txtColor={derived.hexes["signature-link"]}
            onFix={!linksPass ? () => bumpSignature(4.5) : undefined}
          />
          {hasSecondary && secRatio != null ? (
            <Sample
              label="Section numerals"
              ratio={secRatio}
              target={3.0}
              sampleBg={values.background}
              txtColor={secHex || values.secondary}
              onFix={!secPass ? bumpSecondary : undefined}
            />
          ) : null}
        </div>
      </div>

      {/* FOOTER NOTES */}
      <div className="notes">
        <SavedIndicator
          trigger={`${values.background}|${values.text}|${values.accent}|${values.secondary}|${values.defaultThemeId}`}
        />
        {showRepublishReminder && (
          <span className="note">
            <span className="note__i" aria-hidden="true">
              ⓘ
            </span>
            <span>
              Existing published pages keep their original colors. New publishes
              use your latest brand.
            </span>
          </span>
        )}
      </div>
    </div>
  );

  const preview = (
    <div className="preview">
      <div className="preview__head">
        <span className="preview__label">Preview</span>
        <span className="preview__live">Live</span>
      </div>
      <div className="phone">
        <div className="phone__screen">
          <MiniPage vars={derived.vars} themeId={values.defaultThemeId} />
        </div>
      </div>
      <p className="preview__caption">
        This is what your seller sees. It updates as you dial each color.
      </p>
    </div>
  );

  if (layout === "drawer") {
    return (
      <div className="bk-v2 bk-v2--drawer">
        {preview}
        {controls}
      </div>
    );
  }
  return (
    <div className="bk-v2 cols">
      {controls}
      {preview}
    </div>
  );
}
