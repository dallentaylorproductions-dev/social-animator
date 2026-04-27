"use client";

import { TemplateEditor } from "@/components/TemplateEditor";
import { listingCarouselTemplate } from "@/templates/listing-carousel";

export default function ListingCarouselEditorPage() {
  return <TemplateEditor template={listingCarouselTemplate} />;
}
