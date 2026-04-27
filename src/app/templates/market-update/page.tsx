"use client";

import { TemplateEditor } from "@/components/TemplateEditor";
import { marketUpdateTemplate } from "@/templates/market-update";

export default function MarketUpdateEditorPage() {
  return <TemplateEditor template={marketUpdateTemplate} />;
}
