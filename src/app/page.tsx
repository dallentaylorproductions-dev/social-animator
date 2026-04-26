import Link from "next/link";
import { ALL_TEMPLATES } from "@/templates";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-12 lg:py-20">
        <header className="mb-12 flex items-start justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
              Social Animator
            </p>
            <h1 className="text-3xl font-bold mt-1">Aaron Thomas Home Team</h1>
            <p className="text-sm text-neutral-400 mt-3 max-w-lg">
              Pick a template, fill in your content, hit Export. Instagram-ready
              MP4s in three sizes.
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
          {ALL_TEMPLATES.map((template) => (
            <Link
              key={template.id}
              href={`/templates/${template.id}`}
              className="group block p-6 rounded-xl bg-neutral-900 hover:bg-neutral-800 transition border border-neutral-800 hover:border-[#4ef2d9]/50"
            >
              <h2 className="text-lg font-semibold">{template.name}</h2>
              <p className="text-sm text-neutral-400 mt-2 leading-relaxed">
                {template.description}
              </p>
              <p className="text-xs uppercase tracking-wider text-[#4ef2d9] mt-5 group-hover:translate-x-0.5 transition-transform">
                Open editor →
              </p>
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
