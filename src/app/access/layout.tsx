import type { Metadata, Viewport } from "next";

/**
 * /access is a private beta-cohort surface — shared via direct URL only,
 * never linked from the marketing page or dashboard. noindex prevents
 * search engines from discovering it. The route remains publicly
 * reachable for the human-shared URL distribution model.
 */
export const metadata: Metadata = {
  title: "Beta access · Simply Edit Pro Studio",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function AccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
