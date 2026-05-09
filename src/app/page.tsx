import Link from "next/link";
import {
  Briefcase,
  Check,
  ChevronDown,
  Home,
  Lock,
  Palette,
  PencilLine,
  Share2,
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
  ListingPresentationLiveMockup,
  OpenHousePromoMockup,
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
    mockup: <ListingPresentationLiveMockup />,
    toolName: "Listing Presentation One-Pager",
    feature: "Print-ready PDF",
    tagline:
      "Polished pre-listing pitch document that wins the listing. Track record, marketing strategy, comparable sales, branded automatically.",
  },
  {
    mockup: <OpenHousePromoMockup />,
    toolName: "Open House Promo Generator",
    feature: "PDF + Reel + Square + QR",
    tagline:
      "Complete promo bundle for any open house. Vertical reel, square post, printable flyer, QR code — all from one form.",
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

      {/* How it works — typography-driven vertical layout. Replaces
          the previous 3-card grid that visually echoed the bridge
          section's pillar cards. Each step is a row split into a
          large numeric accent (left, 3 cols on desktop) and content
          (right, 9 cols). Horizontal dividers between rows do the
          structural work — no card containers, no fills, no borders
          per row. Step numbers are large + mint + slightly transparent
          so they read as visual rhythm rather than literal labels. */}
      <section
        id="how-it-works"
        className="px-6 py-20 border-t border-neutral-900 scroll-mt-16"
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
              How it works
            </p>
            <h2 className="text-3xl md:text-5xl font-bold mt-3 tracking-tight">
              Three steps. Five minutes.
            </h2>
          </div>

          <div className="max-w-4xl mx-auto">
            <StepRow
              number="01"
              icon={<PencilLine size={24} className="text-[#4ef2d9]" />}
              headline="Fill in your listing."
              body="Address, price, beds/baths, photos, features. The form fields are short and the live preview updates as you type."
            />
            <StepRow
              number="02"
              icon={<Palette size={24} className="text-[#4ef2d9]" />}
              headline="Brand it your way."
              body="Your logo, colors, contact info, license number — applied automatically. Override the colors per-flyer if a listing calls for something different."
            />
            <StepRow
              number="03"
              icon={<Share2 size={24} className="text-[#4ef2d9]" />}
              headline="Export everywhere."
              body="Print-ready PDF for handouts. JPEG for Instagram. Animated MP4 for Reels and Stories. All from the same fields, in seconds."
              isLast
            />
          </div>
        </div>
      </section>

      {/* What's inside — rotating gallery */}
      <section
        id="tools"
        className="px-6 py-20 border-t border-neutral-900 scroll-mt-16"
      >
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

      {/* What's included — value breakdown sandwiched between the
          gallery (outputs) and pricing. Reading flow: see outputs →
          see what you get → see the price. Item order is intentional:
          1-3 are the tools (headline value), 4-7 are capabilities,
          8-10 are commercial reassurance. */}
      <section className="px-6 py-20 border-t border-neutral-900">
        <div className="max-w-3xl mx-auto">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
              What&apos;s included
            </p>
            <h2 className="text-3xl md:text-5xl font-bold mt-3 tracking-tight">
              Everything in your subscription.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-x-12 gap-y-5 mt-12">
            <IncludedItem text="Listing Flyer Generator" sub="PDF, JPEG, and animated MP4" />
            <IncludedItem text="Social Animator" sub="10 ready-made post templates" />
            <IncludedItem text="Listing Presentation One-Pager" sub="Coming soon — free when it ships" />
            <IncludedItem text="Unlimited exports" />
            <IncludedItem text="Mobile, tablet, desktop" />
            <IncludedItem text="Your branding on every output" />
            <IncludedItem text="Per-flyer color override" />
            <IncludedItem text="All future tools included" />
            <IncludedItem text="Cancel anytime" />
            <IncludedItem text="Stripe-secured billing" />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section
        id="pricing"
        className="px-6 py-20 border-t border-neutral-900 scroll-mt-16"
      >
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

      {/* FAQ — last objection-handling beat before the close. Native
          <details>/<summary> for zero-JS accordion; chevron rotation
          via group-open variant. Each card is a self-contained dark
          panel matching the rest of the page. */}
      <section
        id="faq"
        className="px-6 py-20 border-t border-neutral-900 scroll-mt-16"
      >
        <div className="max-w-3xl mx-auto">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
              Questions
            </p>
            <h2 className="text-3xl md:text-5xl font-bold mt-3 tracking-tight">
              Frequently asked.
            </h2>
          </div>

          <div className="mt-12 space-y-3">
            <FaqItem
              q="How is this different from Canva?"
              a="Canva is a creator tool with thousands of generic templates. Simply Edit Pro is built for realtors only — every template is property marketing, not Instagram dance graphics. The workflows are designed for the way agents actually work: on a phone, between showings, in five minutes."
            />
            <FaqItem
              q="Do I need design skills?"
              a="No. The tool makes design choices for you. You fill in a form, you get professional outputs. If you want to adjust colors per-flyer, you can — but the defaults are good."
            />
            <FaqItem
              q="What devices work?"
              a="Any modern browser. iPhone, Android, iPad, Mac, PC. The listing flyer generator was built mobile-first because most realtors do their marketing between appointments."
            />
            <FaqItem
              q="What about my photos and data?"
              a="Your photos stay on your device. Drafts are saved in your browser's local storage — never uploaded to our servers. Stripe handles billing securely. You own your work."
            />
            <FaqItem
              q="Can I cancel anytime?"
              a="Yes. Month-to-month, no contracts, no setup fees. Cancel from your dashboard. Billing stops at the end of the current cycle."
            />
            <FaqItem
              q="What's coming next?"
              a="Listing Presentation One-Pager (the third tool, in development). More Social Animator templates. Advanced flyer customization. Everything we ship is included in your subscription — no per-tool charges, ever."
            />
          </div>
        </div>
      </section>

      {/* Founder note — humanizing close between the FAQ and footer.
          Single column, three sentences, signed first-name. */}
      <section className="px-6 py-16 border-t border-neutral-900">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
            Why this exists
          </p>
          <p className="mt-6 text-neutral-300 leading-relaxed">
            I make video content for realtors. After watching too many
            agents lose hours each week to generic design tools that
            weren&apos;t built for property marketing, I started Simply
            Edit Pro. The goal is simple: fast, branded, professional
            outputs that don&apos;t require design skills — built for
            the way you actually work.
          </p>
          <p className="mt-6 text-neutral-500 text-sm">— Dallen, Founder</p>
        </div>
      </section>

      {/* Footer — 3-column on desktop, stacked on mobile. Brand column
          carries identity + trust marker; product column jump-links
          back into the page; support column has contact + legal stubs.
          Bottom row spans full width with copyright + outbound link. */}
      <footer className="px-6 pt-16 pb-10 border-t border-neutral-900">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-10 md:gap-12">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
                Simply Edit Pro Studio
              </p>
              <p className="text-sm text-neutral-400 mt-4 leading-relaxed max-w-xs">
                Tools that help realtors make client-ready content
                faster.
              </p>
              <p className="text-[11px] text-neutral-600 mt-6">
                Stripe-secured billing
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                Product
              </p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <a
                    href="#pricing"
                    className="text-neutral-400 hover:text-[#4ef2d9] transition"
                  >
                    Pricing
                  </a>
                </li>
                <li>
                  <a
                    href="#how-it-works"
                    className="text-neutral-400 hover:text-[#4ef2d9] transition"
                  >
                    How it works
                  </a>
                </li>
                <li>
                  <a
                    href="#tools"
                    className="text-neutral-400 hover:text-[#4ef2d9] transition"
                  >
                    Tools
                  </a>
                </li>
                <li>
                  <a
                    href="#faq"
                    className="text-neutral-400 hover:text-[#4ef2d9] transition"
                  >
                    FAQ
                  </a>
                </li>
                <li>
                  <Link
                    href="/login"
                    className="text-neutral-400 hover:text-[#4ef2d9] transition"
                  >
                    Sign in
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                Support
              </p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <a
                    href="mailto:hello@simplyeditpro.com"
                    className="text-neutral-400 hover:text-[#4ef2d9] transition"
                  >
                    Contact
                  </a>
                </li>
                <li>
                  <Link
                    href="/privacy"
                    className="text-neutral-400 hover:text-[#4ef2d9] transition"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="text-neutral-400 hover:text-[#4ef2d9] transition"
                  >
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-neutral-900 flex flex-col sm:flex-row justify-between items-center gap-4 text-[11px] text-neutral-600">
            <p>© 2026 Simply Edit Pro Studio. All rights reserved.</p>
            <a
              href="https://simplyeditpro.com"
              className="hover:text-[#4ef2d9] transition"
            >
              simplyeditpro.com →
            </a>
          </div>
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

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-xl bg-neutral-900/50 border border-neutral-800 hover:border-[#4ef2d9]/40 transition-colors open:bg-neutral-900/80 [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-4 px-5 py-4 text-white text-base font-medium">
        <span>{q}</span>
        <ChevronDown
          size={18}
          className="text-neutral-500 shrink-0 transition-transform duration-200 group-open:rotate-180 group-open:text-[#4ef2d9]"
        />
      </summary>
      <div className="px-5 pb-5 text-sm text-neutral-400 leading-relaxed">
        {a}
      </div>
    </details>
  );
}

function IncludedItem({
  text,
  sub,
}: {
  text: string;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Check
        size={18}
        className="text-[#4ef2d9] mt-0.5 shrink-0"
        strokeWidth={2.5}
      />
      <div>
        <p className="text-base text-white leading-snug">{text}</p>
        {sub ? (
          <p className="text-xs text-neutral-500 mt-0.5">{sub}</p>
        ) : null}
      </div>
    </div>
  );
}

function StepRow({
  number,
  icon,
  headline,
  body,
  isLast,
}: {
  number: string;
  icon: React.ReactNode;
  headline: string;
  body: string;
  isLast?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-12 gap-y-4 md:gap-x-8 py-10 md:py-12 ${
        isLast ? "" : "border-b border-neutral-900"
      }`}
    >
      <div className="md:col-span-3">
        <p className="font-mono text-6xl md:text-7xl leading-none tracking-tight text-[#4ef2d9] opacity-80">
          {number}
        </p>
      </div>
      <div className="md:col-span-9">
        <div className="mb-4">{icon}</div>
        <h3 className="text-xl md:text-2xl font-bold text-white">
          {headline}
        </h3>
        <p className="text-base text-neutral-400 mt-3 leading-relaxed max-w-2xl">
          {body}
        </p>
      </div>
    </div>
  );
}
