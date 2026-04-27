import type { Timeline } from "@/engine/timeline";

export type TemplateSize = "1080x1350" | "1080x1080";

export interface SizePreset {
  key: TemplateSize;
  width: number;
  height: number;
  label: string;
  shortLabel: string;
}

export const SIZE_PRESETS: SizePreset[] = [
  { key: "1080x1350", width: 1080, height: 1350, label: "Feed (1080 × 1350)", shortLabel: "Feed" },
  { key: "1080x1080", width: 1080, height: 1080, label: "Square (1080 × 1080)", shortLabel: "Square" },
];

export type FieldType = "text" | "textarea" | "color" | "image" | "select";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  default: string;
  /** For type: "select" — the available choices. */
  options?: { value: string; label: string }[];
  /** Optional conditional render rule — field only shows when state[key] === value. */
  showWhen?: { key: string; value: string };
}

export type TemplateState = Record<string, string>;
export type TemplateAssets = Record<string, HTMLImageElement | null>;

export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  duration: number;
  fields: FieldDef[];
  build: (
    state: TemplateState,
    size: { width: number; height: number },
    assets?: TemplateAssets
  ) => Timeline;
}

export function getDefaultState(template: TemplateConfig): TemplateState {
  const state: TemplateState = {};
  for (const field of template.fields) {
    state[field.key] = field.default;
  }
  return state;
}

/**
 * Extra background-style fields injected into every template's form by
 * TemplateEditor. Templates don't need to declare these — TemplateEditor
 * adds them next to the existing "background" color field at render time.
 */
export const EXTRA_BACKGROUND_FIELDS: FieldDef[] = [
  {
    key: "backgroundStyle",
    label: "Background style",
    type: "select",
    default: "solid",
    options: [
      { value: "solid", label: "Solid color" },
      { value: "gradient", label: "Gradient" },
    ],
  },
  {
    key: "backgroundColor2",
    label: "Gradient end color",
    type: "color",
    default: "#1a1a2e",
    showWhen: { key: "backgroundStyle", value: "gradient" },
  },
];
