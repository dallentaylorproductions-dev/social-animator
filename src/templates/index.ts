import { qaCardTemplate } from "./qa-card";
import { listingCardTemplate } from "./listing-card";
import { numberedProcessTemplate } from "./numbered-process";
import { gridComparisonTemplate } from "./grid-comparison";
import { statHighlightTemplate } from "./stat-highlight";
import { testimonialCardTemplate } from "./testimonial-card";
import { marketUpdateTemplate } from "./market-update";
import { beforeAfterTemplate } from "./before-after";
import type { TemplateConfig } from "./types";

export const ALL_TEMPLATES: TemplateConfig[] = [
  qaCardTemplate,
  listingCardTemplate,
  beforeAfterTemplate,
  testimonialCardTemplate,
  numberedProcessTemplate,
  gridComparisonTemplate,
  statHighlightTemplate,
  marketUpdateTemplate,
];
