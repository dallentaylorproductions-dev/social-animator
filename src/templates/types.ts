import type { Timeline } from "@/engine/timeline";

export type TemplateSize = "1080x1350" | "1080x1920" | "1080x1080";

export interface SizePreset {
  key: TemplateSize;
  width: number;
  height: number;
  label: string;
  shortLabel: string;
}

export const SIZE_PRESETS: SizePreset[] = [
  { key: "1080x1350", width: 1080, height: 1350, label: "Feed (1080 × 1350)", shortLabel: "Feed" },
  { key: "1080x1920", width: 1080, height: 1920, label: "Reel / Story (1080 × 1920)", shortLabel: "Reel" },
  { key: "1080x1080", width: 1080, height: 1080, label: "Square (1080 × 1080)", shortLabel: "Square" },
];

export type FieldType = "text" | "textarea" | "color";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  default: string;
}

export type TemplateState = Record<string, string>;

export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  /** Total animation duration in seconds (for export + hold-at-end). */
  duration: number;
  fields: FieldDef[];
  build: (
    state: TemplateState,
    size: { width: number; height: number }
  ) => Timeline;
}

export function getDefaultState(template: TemplateConfig): TemplateState {
  const state: TemplateState = {};
  for (const field of template.fields) {
    state[field.key] = field.default;
  }
  return state;
}
