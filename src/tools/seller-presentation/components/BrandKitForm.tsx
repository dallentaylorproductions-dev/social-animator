"use client";

import { useEffect, useRef, useState } from "react";
import { MiniPage } from "./MiniPage";

/**
 * BrandKitForm — the ONE controlled component for the Brand Kit System
 * (Phase E.0). Recreated from docs/design/brand-kit-system/brand_kit_form.jsx
 * (Claude Design source-of-truth). Visuals live in ./brand-kit.css under
 * the `.bk-scope` namespace.
 *
 * Controlled — the PARENT owns `values` and persists; this child renders.
 * `layout="page"` puts controls left + sticky preview right (Settings).
 * `layout="drawer"` stacks preview-on-top then controls (E.0.1's wizard
 * drawer; not used in E.0 but kept so the same component serves all three
 * surfaces unchanged).
 *
 * Contains: three color rows (native <input type="color"> + editable hex
 * + per-row Reset), accent contract microcopy, the Default-layout
 * dropdown, the always-on Readability panel (plain verdict + live sample
 * chips + one-tap suggested-color fixes), the MiniPage preview, a
 * "Saved automatically." autosave indicator, and an optional republish
 * note. Non-blocking — save is never gated by contrast.
 */

export interface BrandKitFormValues {
  background: string;
  text: string;
  accent: string;
  defaultThemeId: string;
}

export interface BrandKitFormProps {
  values: BrandKitFormValues;
  onChange: (next: BrandKitFormValues) => void;
  layout?: "page" | "drawer";
  showRepublishReminder?: boolean;
  defaults: { background: string; text: string; accent: string };
}

/* ---- WCAG helpers ------------------------------------------------ */
function hexToRgb(hex: string): [number, number, number] | null {
  let h = (hex || "").replace("#", "").trim();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}
function relLum([r, g, b]: [number, number, number]): number {
  const a = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function contrast(hexA: string, hexB: string): number | null {
  const a = hexToRgb(hexA),
    b = hexToRgb(hexB);
  if (!a || !b) return null;
  const la = relLum(a),
    lb = relLum(b);
  const hi = Math.max(la, lb),
    lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/* ---- color suggestion: nudge ONLY lightness (keep hue + saturation,
   so it stays the agent's color) until contrast clears the target ---- */
function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}
function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100,
    lN = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) =>
    Math.round(255 * (lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  const to2 = (v: number) => v.toString(16).padStart(2, "0");
  return "#" + to2(f(0)) + to2(f(8)) + to2(f(4));
}
// smallest lightness change (either direction) that clears `target` vs bg
function suggestForeground(color: string, bg: string, target: number): string | null {
  const hsl = hexToHsl(color);
  if (!hsl) return null;
  for (let d = 1; d <= 100; d++) {
    for (const nl of [hsl.l - d, hsl.l + d]) {
      if (nl < 0 || nl > 100) continue;
      const cand = hslToHex(hsl.h, hsl.s, nl);
      const c = contrast(cand, bg);
      if (c != null && c >= target + 0.1) return cand;
    }
  }
  return null;
}
function dirWord(orig: string, sug: string): string {
  const a = hexToHsl(orig),
    b = hexToHsl(sug);
  if (!a || !b) return "different";
  return b.l < a.l ? "darker" : "lighter";
}
// smallest lightness change to the BACKGROUND that clears every needed pair
function suggestBackground(
  bg: string,
  text: string,
  accent: string,
  needText: boolean,
  needAccent: boolean,
): string | null {
  const hsl = hexToHsl(bg);
  if (!hsl) return null;
  for (let d = 1; d <= 100; d++) {
    for (const nl of [hsl.l - d, hsl.l + d]) {
      if (nl < 0 || nl > 100) continue;
      const cand = hslToHex(hsl.h, hsl.s, nl);
      const ct = contrast(text, cand);
      const ca = contrast(accent, cand);
      const okT = !needText || (ct != null && ct >= 4.5 + 0.1);
      const okA = !needAccent || (ca != null && ca >= 3 + 0.1);
      if (okT && okA) return cand;
    }
  }
  return null;
}

const THEME_OPTIONS = [
  { id: "editorial", label: "Editorial", soon: false },
  { id: "studio", label: "Studio · Coming soon", soon: true },
  { id: "warm", label: "Warm · Coming soon", soon: true },
];

/* ---- icons ------------------------------------------------------- */
function IconWarn() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
function IconInfo({ s = 14 }: { s?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}
function IconCheckCircle() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.2l2.4 2.4 4.6-5" />
    </svg>
  );
}
function IconArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

/* ---- readability: a verdict you can see + a fix you can take ----- */
function ReadSample({
  bg,
  fg,
  label,
  ok,
  ratio,
}: {
  bg: string;
  fg: string;
  label: string;
  ok: boolean;
  ratio: number | null;
}) {
  return (
    <div className="bk-read-sample" style={{ background: bg }}>
      <span className="bk-read-sample-txt" style={{ color: fg }}>
        {label}
      </span>
      <span className={"bk-read-sample-tag " + (ok ? "ok" : "low")}>
        {ok ? "Clear" : "Low"}
        <em>{ratio == null ? "" : ratio.toFixed(1)}</em>
      </span>
    </div>
  );
}

interface FixOption {
  key: string;
  sw: string[];
  label: string;
  sub: string;
  apply: () => void;
  hero?: boolean;
}

function ReadabilityPanel({
  values,
  onPick,
}: {
  values: BrandKitFormValues;
  onPick: (patch: Partial<BrandKitFormValues>) => void;
}) {
  const { background, text, accent } = values;
  const tR = contrast(text, background);
  const aR = contrast(accent, background);
  const textOk = tR != null && tR >= 4.5;
  const accentOk = aR != null && aR >= 3;
  const good = textOk && accentOk;
  const failText = !textOk,
    failAccent = !accentOk;

  // Every option FULLY resolves the issue; the agent chooses which color
  // to keep. The background is always a candidate, so all three colors
  // are reachable, not just text + accent.
  const bgHex = suggestBackground(background, text, accent, failText, failAccent);
  const textHex = failText ? suggestForeground(text, background, 4.5) : null;
  const accentHex = failAccent ? suggestForeground(accent, background, 3) : null;
  const withHex = (sub: string, h: string | null) =>
    h ? sub + " · " + h.toUpperCase() : sub;

  const opts: FixOption[] = [];
  if (failText && failAccent) {
    if (bgHex)
      opts.push({
        key: "bg",
        sw: [bgHex],
        label: "Use a " + dirWord(background, bgHex) + " background",
        sub: withHex("Fixes your text and accent in one tap", bgHex),
        apply: () => onPick({ background: bgHex }),
      });
    if (textHex && accentHex)
      opts.push({
        key: "fg",
        sw: [textHex, accentHex],
        label: "Adjust your text & accent",
        sub: "Keeps your background color",
        apply: () => onPick({ text: textHex, accent: accentHex }),
      });
  } else if (failText) {
    if (textHex)
      opts.push({
        key: "text",
        sw: [textHex],
        label: "Use a " + dirWord(text, textHex) + " text color",
        sub: withHex("Keeps your background", textHex),
        apply: () => onPick({ text: textHex }),
      });
    if (bgHex)
      opts.push({
        key: "bg",
        sw: [bgHex],
        label: "Use a " + dirWord(background, bgHex) + " background",
        sub: withHex("Keeps your text color", bgHex),
        apply: () => onPick({ background: bgHex }),
      });
  } else if (failAccent) {
    if (accentHex)
      opts.push({
        key: "accent",
        sw: [accentHex],
        label: "Use a " + dirWord(accent, accentHex) + " accent color",
        sub: withHex("Keeps your background", accentHex),
        apply: () => onPick({ accent: accentHex }),
      });
    if (bgHex)
      opts.push({
        key: "bg",
        sw: [bgHex],
        label: "Use a " + dirWord(background, bgHex) + " background",
        sub: withHex("Keeps your accent color", bgHex),
        apply: () => onPick({ background: bgHex }),
      });
  }
  if (opts.length) opts[0].hero = true;

  return (
    <div className={"bk-read " + (good ? "is-good" : "is-warn")} role="status">
      <div className="bk-read-head">
        <span className="bk-read-pill" data-testid="brand-readability-verdict">
          {good ? <IconCheckCircle /> : <IconWarn />}
          {good ? "Easy to read" : "Could be hard to read"}
        </span>
        <span className="bk-read-sub">
          {good
            ? "Your colors have plenty of contrast. Sellers will see your page clearly on any screen."
            : "A small tweak makes this easy to read on any screen. Pick whichever color you'd like to keep, you can still save either way."}
        </span>
      </div>

      <div className="bk-read-samples">
        <ReadSample bg={background} fg={text} label="Body text" ok={textOk} ratio={tR} />
        <ReadSample
          bg={background}
          fg={accent}
          label="Links & prices"
          ok={accentOk}
          ratio={aR}
        />
      </div>

      {opts.length > 0 && (
        <div className="bk-read-fixes" data-testid="brand-readability-fixes">
          <span className="bk-read-fixlabel">
            {opts.length > 1 ? "Two easy ways to fix it" : "One-tap fix"}
          </span>
          {opts.map((o) => (
            <button
              key={o.key}
              type="button"
              className={"bk-read-fix" + (o.hero ? " hero" : "")}
              onClick={o.apply}
            >
              <span className="bk-read-fix-sws">
                {o.sw.map((c, i) => (
                  <span
                    key={i}
                    className="bk-read-fix-sw"
                    style={{ background: c }}
                  />
                ))}
              </span>
              <span className="bk-read-fix-txt">
                <span className="bk-read-fix-title">
                  {o.label}
                  {o.hero && <span className="bk-read-fix-rec">Recommended</span>}
                </span>
                <i>{o.sub}</i>
              </span>
              <span className="bk-read-fix-go">
                Apply <IconArrow />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- one color row ---------------------------------------------- */
function ColorRow({
  label,
  value,
  defaultValue,
  onChange,
  micro,
  testId,
}: {
  label: string;
  value: string;
  defaultValue: string;
  onChange: (v: string) => void;
  micro?: string;
  testId: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  function commitHex(v: string) {
    let h = v.trim();
    if (h && h[0] !== "#") h = "#" + h;
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) onChange(h.toLowerCase());
    else setDraft(value); // revert invalid
  }

  return (
    <div className="bk-row">
      <div className="bk-row-main">
        <label className="bk-swatch">
          <input
            type="color"
            aria-label={label + " color"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            data-testid={testId}
          />
        </label>
        <div className="bk-row-body">
          <div className="bk-row-top">
            <span className="bk-label">{label}</span>
            <button
              type="button"
              className="bk-reset"
              onClick={() => onChange(defaultValue)}
              disabled={value.toLowerCase() === defaultValue.toLowerCase()}
            >
              Reset to default
            </button>
          </div>
          <span className="bk-hex">
            <input
              value={(draft || "").toUpperCase()}
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={(e) => commitHex(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              aria-label={label + " hex value"}
            />
          </span>
        </div>
      </div>
      {micro && <p className="bk-micro bk-micro--spaced">{micro}</p>}
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
      className={"bk-saved" + (saving ? " saving" : "")}
      data-testid="brand-autosave-indicator"
    >
      <span className="dot" />
      <span className="label">{saving ? "Saving…" : "Saved automatically."}</span>
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
  const set = (patch: Partial<BrandKitFormValues>) =>
    onChange({ ...values, ...patch });

  const previewScale = layout === "drawer" ? 0.78 : 0.74;
  const previewThemeId =
    values.defaultThemeId === "studio" || values.defaultThemeId === "warm"
      ? "editorial"
      : values.defaultThemeId;

  const controls = (
    <div className="bk-controls">
      <div className="bk-rows">
        <ColorRow
          label="Background"
          value={values.background}
          defaultValue={DEF.background}
          onChange={(v) => set({ background: v })}
          testId="brand-color-background"
        />
        <ColorRow
          label="Text"
          value={values.text}
          defaultValue={DEF.text}
          onChange={(v) => set({ text: v })}
          testId="brand-color-text"
        />
        <ColorRow
          label="Accent"
          value={values.accent}
          defaultValue={DEF.accent}
          onChange={(v) => set({ accent: v })}
          micro="Used for links, prices, CTA buttons, section accents, and dividers. Pick a color that draws the eye."
          testId="brand-color-accent"
        />
      </div>

      {/* default layout */}
      <div className="bk-field">
        <label className="bk-field-label" htmlFor="bk-theme">
          Default layout
        </label>
        <div className="bk-select-wrap">
          <select
            id="bk-theme"
            className="bk-select"
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
        </div>
        <span className="bk-field-hint">
          The layout new presentations start with. You can switch any single
          presentation later.
        </span>
      </div>

      {/* readability: verdict + live samples + one-tap fix */}
      <ReadabilityPanel values={values} onPick={(patch) => set(patch)} />

      {/* status */}
      <div className="bk-status">
        <SavedIndicator
          trigger={`${values.background}|${values.text}|${values.accent}|${values.defaultThemeId}`}
        />
        {showRepublishReminder && (
          <span className="bk-republish-note">
            <IconInfo s={14} />
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
    <div className="bk-preview">
      <div className="bk-preview-label">
        <span className="pl">Preview</span>
        <span className="live">
          <i />
          Live
        </span>
      </div>
      <div className="bk-device">
        <div className="bk-device-screen">
          <MiniPage
            bg={values.background}
            text={values.text}
            accent={values.accent}
            themeId={previewThemeId}
            scale={previewScale}
          />
        </div>
      </div>
      <span className="bk-preview-cap">
        This is what your seller sees. It updates as you dial each color.
      </span>
    </div>
  );

  if (layout === "drawer") {
    return (
      <div className="bk bk--drawer">
        {preview}
        <div style={{ height: 22 }} />
        {controls}
      </div>
    );
  }
  return (
    <div className="bk bk--page">
      {controls}
      {preview}
    </div>
  );
}
