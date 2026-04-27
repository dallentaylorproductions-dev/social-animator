import Link from "next/link";
import { ALL_TEMPLATES } from "@/templates";
import { TemplatePreview } from "@/components/TemplatePreview";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-12 lg:py-20">
        <header className="mb-12 flex items-start justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
              Social Animator
            </p>
            <h1 className="text-3xl font-bold mt-1">
              Animated Instagram posts for real estate.
            </h1>
            <p className="text-sm text-neutral-400 mt-3 max-w-lg">
              Pick a template, fill in your content, hit Export. MP4s render
              right in your browser — no design skills needed, nothing uploaded
              to a server.
            </p>
          </div>
          <Link
            href="/brand"
            className="text-xs uppercase tracking-[0.15em] text-neutral-400 hover:text-[#4ef2d9] transition whitespace-nowrap"
          >
            Brand →
          </Link>
        </header>

        <div className="grid md:grid-cols-2 gap-4">
          {ALL_TEMPLATES.map((template, index) => (
            <Link
              key={template.id}
              href={`/templates/${template.id}`}
              className="group flex items-start gap-4 p-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 transition border border-neutral-800 hover:border-[#4ef2d9]/50"
            >
              <div className="flex-shrink-0 w-28 md:w-36 rounded-md overflow-hidden">
                <TemplatePreview
                  templateId={template.id}
                  startOffsetMs={index * 250}
                />
              </div>
              <div className="flex-1 min-w-0 py-1">
                <h2 className="text-base md:text-lg font-semibold">{template.name}</h2>
                <p className="text-xs md:text-sm text-neutral-400 mt-1.5 leading-relaxed line-clamp-3">
                  {template.description}
                </p>
                <p className="text-xs uppercase tracking-wider text-[#4ef2d9] mt-3 group-hover:translate-x-0.5 transition-transform">
                  Open editor →
                </p>
              </div>
            </Link>
          ))}
        </div>

        <footer className="mt-16 pt-8 border-t border-neutral-900 text-[11px] text-neutral-600 leading-relaxed">
          <p>
            Animations render in your browser. Export converts to MP4 via
            ffmpeg.wasm — no server, no upload.
          </p>
        </footer>
      </div>
    </main>
  );
}
