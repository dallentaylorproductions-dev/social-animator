import Link from "next/link";
import {
  Briefcase,
  Home,
  Lock,
  Palette,
  Shield,
  Smartphone,
} from "lucide-react";
import { PRICING } from "@/lib/pricing";
import IphoneScrollShowcase from "@/components/ui/iphone-scroll-showcase";
import ListingFlyerMockup from "@/components/ui/listing-flyer-mockup";
import RotatingProductGallery from "@/components/ui/rotating-product-gallery";
import {
  ListingFlyerPdfMockup,
  ListingFlyerMp4Mockup,
  SocialAnimatorQACardMockup,
  SocialAnimatorMarketUpdateMockup,
  ListingPresentationComingSoonMockup,
} from "@/components/ui/gallery-mockups";

const GALLERY_ITEMS = [
  {
    mockup: <ListingFlyerPdfMockup />,
    toolName: "Listing Flyer Generator",
    feature: "Print-ready PDF",
    tagline:
      "Branded property flyers from a single form. Photo grid, agent block, all five photos, ready to print or text.",
  },
  {
    mockup: <ListingFlyerMp4Mockup />,
    toolName: "Listing Flyer Generator",
    feature: "Animated MP4 for social",
    tagline:
      "Instagram-ready vertical and square videos with smooth animations, agent branding, and your color palette.",
  },
  {
    mockup: <SocialAnimatorQACardMockup />,
    toolName: "Social Animator",
    feature: "10 ready templates",
    tagline:
      "Animated Instagram posts for real estate. Q&A cards, market updates, listing carousels — pick a template, fill in your content, export.",
  },
  {
    mockup: <SocialAnimatorMarketUpdateMockup />,
    toolName: "Social Animator",
    feature: "Market data templates",
    tagline:
      "Show clients you know your market. Animated charts and stats branded to your team.",
  },
  {
    mockup: <ListingPresentationComingSoonMockup />,
    toolName: "Listing Presentation One-Pager",
    feature: "Coming soon",
    tagline:
      "Polished pre-listing presentation page that makes you look like the obvious choice when a homeowner is interviewing agents.",
  },
];

export default function StudioLandingPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <header className="absolute top-0 inset-x-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
            Simply Edit Pro Studio
          </p>
          <Link
            href="/login"
            className="text-xs uppercase tracking-[0.15em] text-neutral-400 hover:text-[#4ef2d9] transition"
          >
            Sign in →
          </Link>
        </div>
      </header>

      {/* Hero — credibility chips above headline, compressed vertical
          rhythm so the iPhone showcase comes into view sooner. */}
      <section className="px-6 pt-28 pb-6 lg:pt-32 lg:pb-8">
        <div className="max-w-3xl mx-auto text-center">
          <div className="mx-auto max-w-[520px] flex flex-wrap items-center justify-center gap-2 mb-7">
            <CredibilityChip icon={<Home size={14} />} label="Built for realtors" />
            <CredibilityChip icon={<Lock size={14} />} label="Privacy-first" />
            <CredibilityChip icon={<Shield size={14} />} label="Stripe-secured billing" />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Tools that help realtors produce client-ready content in minutes,
            not hours.
          </h1>
          <p className="text-base md:text-lg text-neutral-400 mt-5 max-w-xl mx-auto leading-relaxed">
            One subscription. Every tool we ship. No design skills required.
            Your photos stay on your device. No clutter.
          </p>
        </div>
      </section>

      {/* iPhone scroll showcase. Compressed window from h-50/60rem → 40/50rem
          since the animation still reads at typical scroll speeds and the
          extra 10rem of padding was eating budget the bridge section needs. */}
      <IphoneScrollShowcase>
        <ListingFlyerMockup />
      </IphoneScrollShowcase>

      <section className="px-6 pb-16 mt-12">
        <div className="max-w-3xl mx-auto text-center">
          <Link
            href="/login"
            className="inline-flex items-center bg-[#4ef2d9] hover:bg-[#3ad9c0] text-black rounded-md px-7 py-3.5 text-sm font-semibold transition"
          >
            Get started
          </Link>
        </div>
      </section>

      {/* Bridge — establishes positioning before showing tool outputs.
          Subtle radial accent at the top hints "this section is its own
          beat" without dropping into a different visual world. */}
      <section className="relative px-6 py-20 border-t border-neutral-900 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, #4ef2d9 50%, transparent 100%)",
            opacity: 0.35,
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 50% -10%, rgba(78, 242, 217, 0.06) 0%, transparent 60%)",
          }}
        />
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center max-w-3xl mx-auto">
            <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
              Why Simply Edit Pro
            </p>
            <h2 className="text-3xl md:text-5xl font-bold mt-3 tracking-tight">
              Made for realtors. Not creators.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <PillarCard
              icon={<Smartphone size={32} className="text-[#4ef2d9]" />}
              headline="Mobile-first."
              body="Built for realtors who work between showings, not at a desk. Every tool runs on the phone in your pocket."
            />
            <PillarCard
              icon={<Briefcase size={32} className="text-[#4ef2d9]" />}
              headline="Real estate templates."
              body="Property flyers, listing carousels, market updates, just-sold posts. Every template is purpose-built for property marketing — not Instagram dance videos."
            />
            <PillarCard
              icon={<Palette size={32} className="text-[#4ef2d9]" />}
              headline="Branded automatically."
              body="Your logo, your colors, your contact info, your license number — applied to every flyer, post, and presentation. Set it once."
            />
          </div>
        </div>
      </section>

      {/* What's inside — rotating gallery */}
      <section className="px-6 py-20 border-t border-neutral-900">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9] text-center">
            What&apos;s inside
          </p>
          <h2 className="text-2xl md:text-3xl font-bold mt-2 text-center">
            Every tool included.
          </h2>
          <div className="mt-14">
            <RotatingProductGallery galleryItems={GALLERY_ITEMS} />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 py-20 border-t border-neutral-900">
        <div className="max-w-md mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
            Pricing
          </p>
          <h2 className="text-2xl md:text-3xl font-bold mt-2">
            One plan. Unlimited use.
          </h2>
          <div className="mt-8 flex items-baseline justify-center gap-2">
            <span className="text-6xl font-bold tracking-tight">
              ${PRICING.monthlyPriceUSD}
            </span>
            <span className="text-neutral-400">/month</span>
          </div>
          <p className="text-sm text-neutral-400 mt-4">
            All current and upcoming tools, unlimited use. Cancel anytime.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center mt-8 bg-[#4ef2d9] hover:bg-[#3ad9c0] text-black rounded-md px-7 py-3.5 text-sm font-semibold transition"
          >
            Get started
          </Link>
          <p className="mt-6 text-[11px] text-neutral-600">
            Billing handled securely by Stripe.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-neutral-900">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-[11px] text-neutral-600">
          <p>© Simply Edit Pro Studio</p>
          <a
            href="https://simplyeditpro.com"
            className="hover:text-[#4ef2d9] transition"
          >
            simplyeditpro.com →
          </a>
        </div>
      </footer>
    </main>
  );
}

function CredibilityChip({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border border-neutral-800 bg-neutral-900/50 backdrop-blur-sm text-neutral-300">
      <span className="text-[#4ef2d9]">{icon}</span>
      {label}
    </span>
  );
}

function PillarCard({
  icon,
  headline,
  body,
}: {
  icon: React.ReactNode;
  headline: string;
  body: string;
}) {
  return (
    <div className="group p-8 rounded-xl bg-neutral-900/50 border border-neutral-800 hover:border-[#4ef2d9]/40 hover:bg-neutral-900/80 hover:scale-[1.02] transition-all duration-300">
      <div className="mb-5">{icon}</div>
      <h3 className="text-xl font-bold text-white">{headline}</h3>
      <p className="text-sm text-neutral-400 mt-3 leading-relaxed">{body}</p>
    </div>
  );
}
