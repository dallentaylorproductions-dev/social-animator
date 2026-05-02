"use client";

import { TemplateEditor } from "@/components/TemplateEditor";
import { listingShowcaseTemplate } from "@/templates/listing-showcase";

export default function ListingShowcaseEditorPage() {
  return <TemplateEditor template={listingShowcaseTemplate} />;
}
