"use client";

import { TemplateEditor } from "@/components/TemplateEditor";
import { beforeAfterTemplate } from "@/templates/before-after";

export default function BeforeAfterEditorPage() {
  return <TemplateEditor template={beforeAfterTemplate} />;
}
