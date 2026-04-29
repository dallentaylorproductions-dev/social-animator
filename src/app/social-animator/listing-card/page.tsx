"use client";

import { TemplateEditor } from "@/components/TemplateEditor";
import { listingCardTemplate } from "@/templates/listing-card";

export default function ListingCardEditorPage() {
  return <TemplateEditor template={listingCardTemplate} />;
}
