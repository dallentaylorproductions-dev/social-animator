"use client";

import { TemplateEditor } from "@/components/TemplateEditor";
import { statHighlightTemplate } from "@/templates/stat-highlight";

export default function StatHighlightEditorPage() {
  return <TemplateEditor template={statHighlightTemplate} />;
}
