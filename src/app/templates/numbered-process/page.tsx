"use client";

import { TemplateEditor } from "@/components/TemplateEditor";
import { numberedProcessTemplate } from "@/templates/numbered-process";

export default function NumberedProcessEditorPage() {
  return <TemplateEditor template={numberedProcessTemplate} />;
}
