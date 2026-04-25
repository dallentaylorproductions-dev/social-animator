"use client";

import { TemplateEditor } from "@/components/TemplateEditor";
import { qaCardTemplate } from "@/templates/qa-card";

export default function QACardEditorPage() {
  return <TemplateEditor template={qaCardTemplate} />;
}
