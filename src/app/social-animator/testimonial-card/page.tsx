"use client";

import { TemplateEditor } from "@/components/TemplateEditor";
import { testimonialCardTemplate } from "@/templates/testimonial-card";

export default function TestimonialCardEditorPage() {
  return <TemplateEditor template={testimonialCardTemplate} />;
}
