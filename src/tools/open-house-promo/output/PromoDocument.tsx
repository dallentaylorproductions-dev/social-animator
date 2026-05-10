"use client";

import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import {
  type PromoDraft,
  formatTimeRange,
  formatEventDate,
} from "../engine/types";
import {
  type BrandSettings,
  formatPhone,
  effectiveBrandAccent,
} from "@/lib/brand";
import {
  pickContrastText,
  pickContrastMuted,
} from "@/tools/listing-flyer/engine/contrast";

interface PromoDocumentProps {
  draft: PromoDraft;
  brand: BrandSettings;
  /** Pre-generated QR code data URL (PNG) sized for embedding —
   *  caller passes null when qrTargetUrl is empty so the document
   *  knows to hide the QR block and expand the agent block. Generated
   *  outside the document so the qrcode async API doesn't need to
   *  participate in react-pdf's render lifecycle. */
  qrDataUrl: string | null;
  /** Pre-cropped hero photo data URL (cropped to the hero region's
   *  aspect on its focal point). Null when draft.photos is empty —
   *  the document then shows the stencil placeholder. Pre-cropped
   *  externally so the document doesn't need to do canvas work
   *  during react-pdf's render lifecycle (and so the same crop
   *  appears in PDF + JPEG). */
  heroSrc: string | null;
  /** Pre-cropped thumbnail data URLs for photos[1..5] (up to 4
   *  entries). Empty array → no strip rendered. */
  thumbSrcs: string[];
  /** True iff a thumb strip should render — controls hero region
   *  height (220pt with strip, 250pt without) so the freed
   *  vertical space goes back to the hero on single-photo drafts. */
  hasThumbs: boolean;
}

/**
 * Letter-portrait open-house promo flyer. Eight stacked blocks:
 *
 *   Header band   (~80pt)  primary-bg, centered "OPEN HOUSE" + date + time
 *   Hero photo    (~240pt) cover-cropped first photo, or stencil placeholder
 *   Property      (~95pt)  "Presenting" label + address + city + price
 *   Highlights    (~80pt)  bullet list, hidden if all empty
 *   Description   (~60pt)  paragraph, hidden if empty
 *   Agent + QR    (~120pt) two-column row; QR right side hidden if no URL
 *   Notes         (varies) optional block above footer if eventNotes present
 *   Footer band   (~36pt)  primary-bg, centered URL or notes echo
 *
 * Vertical totals: header 80 + hero 240 + property 95 + highlights 80
 * + description 60 + agent+QR 120 + footer 36 = 711pt at full bleed,
 * comfortably under Letter's 792pt. Compression mitigations from the
 * H-7b brief (hero 280→240, description 80→60, agent row 120→100) give
 * ~80pt slack so a maximally-filled draft still fits one page.
 *
 * Footer is absolute-positioned at page-bottom; body paddingBottom
 * clears it.
 */

const PT_PER_INCH = 72;
const MARGIN = PT_PER_INCH * 0.5;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#0a0a0a",
  },

  // Header band — H-7p tightened to ~56pt total to free vertical
  // budget for the body content.
  header: {
    paddingHorizontal: MARGIN,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 4,
    textTransform: "uppercase",
  },
  headerDate: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 2,
    letterSpacing: 0.6,
  },
  headerTime: {
    fontSize: 10,
    opacity: 0.92,
  },

  // Hero photo. H-7p hard-caps the height at 270pt regardless of
  // how many photos the draft has — predictable layout, no flex.
  // The blur-fill composition (H-7o) handles aspect mismatches
  // gracefully so a fixed box height isn't a quality compromise.
  heroWrap: {
    width: "100%",
    height: 270,
    overflow: "hidden",
    backgroundColor: "#1f2937",
  },
  hero: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  heroPlaceholder: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  heroStencil: {
    fontSize: 44,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 8,
    textTransform: "uppercase",
    opacity: 0.55,
  },

  // Body wrapper — H-7p reduced paddings to claw back vertical
  // space (top 16→8, bottom 50→24). Bottom is now just enough to
  // clear the absolute footer with a few pt of breathing room.
  body: {
    paddingHorizontal: MARGIN,
    paddingTop: 8,
    paddingBottom: 24,
  },

  // Thumb strip (between hero and property block). H-7p reduced
  // cell height 87→80 to absorb hero/header trims without losing
  // 3:2 aspect (cell width ~132pt; height 88pt is exact 3:2 but
  // 80pt reads close enough at this scale).
  thumbStrip: {
    flexDirection: "row",
    paddingHorizontal: MARGIN,
    paddingTop: 6,
    gap: 4,
  },
  thumbCell: {
    flex: 1,
    height: 80,
    overflow: "hidden",
  },
  thumb: {
    width: "100%",
    height: 80,
    objectFit: "cover",
  },

  // Property block
  propertyKicker: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  propertyRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  propertyLeft: {
    flex: 1,
    paddingRight: 16,
  },
  propertyAddress: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.15,
  },
  propertyCity: {
    fontSize: 12,
    marginTop: 3,
  },
  propertyPrice: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
  },

  // Section labels (FEATURES, etc.) — H-7p reduced marginTop
  // 16→10 to compress inter-block gaps.
  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 4,
    marginTop: 10,
  },

  // Highlights
  highlightsList: {
    flexDirection: "row",
  },
  highlightCol: {
    flex: 1,
  },
  highlightColGap: {
    width: 24,
  },
  highlightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  highlightBullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 4,
    marginRight: 8,
  },
  highlightText: {
    fontSize: 11,
    lineHeight: 1.4,
    flex: 1,
  },

  // Description — H-7p tightened lineHeight 1.55→1.35 and
  // pre-truncates to ~140 chars in the render path so a long
  // description doesn't push other blocks to page 2.
  descriptionText: {
    fontSize: 10,
    lineHeight: 1.35,
  },

  // Agent + QR row
  agentQrRow: {
    flexDirection: "row",
    marginTop: 12,
    alignItems: "stretch",
  },
  agentBlock: {
    flex: 1,
    paddingRight: 16,
    justifyContent: "center",
  },
  agentTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  agentLogo: {
    height: 36,
    width: 36,
    objectFit: "contain",
    marginRight: 10,
  },
  agentLogoFallback: {
    height: 36,
    width: 36,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingTop: 14,
    marginRight: 10,
  },
  agentName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.2,
  },
  agentBrokerage: {
    fontSize: 11,
    marginTop: 1,
  },
  agentContactLine: {
    fontSize: 10,
    lineHeight: 1.45,
  },

  qrBlock: {
    width: 110,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  qrImage: {
    width: 100,
    height: 100,
    objectFit: "contain",
  },
  qrLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 6,
    textAlign: "center",
  },

  // Footer band
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: MARGIN,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerCenter: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    flex: 1,
    textAlign: "center",
  },
  footerLicense: {
    fontSize: 8,
    opacity: 0.85,
  },
});

export function PromoDocument({
  draft,
  brand,
  qrDataUrl,
  heroSrc,
  thumbSrcs,
  hasThumbs,
}: PromoDocumentProps) {
  const primary = brand.primaryColor || "#4ef2d9";
  // H-7i: accent drives only the small secondary labels —
  // "PRESENTING" above the address and "SCAN FOR DETAILS" under
  // the QR. Bullets reverted back to primary in H-7i so the
  // FEATURES label and its bullets read as one unit.
  // effectiveBrandAccent auto-derives a darker shade from primary
  // when the user hasn't explicitly chosen an accent (legacy
  // default was #ffffff, which is invisible on white pages).
  const accent = effectiveBrandAccent(brand);
  const background = brand.backgroundColor || "#ffffff";

  // Auto-flip text colors so the page stays readable on any
  // background luminance — same formula PromoPreview uses.
  const textPrimary = pickContrastText(background);
  const textMuted = pickContrastMuted(background);
  const onPrimary = pickContrastText(primary);

  // Section visibility
  const highlights = draft.propertyHighlights.filter(
    (h) => h.trim().length > 0
  );
  const showHighlights = highlights.length > 0;
  const showDescription = draft.description.trim().length > 0;
  const showQr = !!qrDataUrl;
  const useTwoColHighlights = highlights.length >= 4;
  const splitAt = useTwoColHighlights
    ? Math.ceil(highlights.length / 2)
    : highlights.length;
  const leftHighlights = highlights.slice(0, splitAt);
  const rightHighlights = highlights.slice(splitAt);

  const hasHero = !!heroSrc;
  // hasThumbs only affects whether the strip renders — hero
  // height is fixed 270pt regardless (set in the heroWrap style).
  void hasThumbs;

  const dateLabel = draft.eventDate ? formatEventDate(draft.eventDate) : "";
  const timeLabel = formatTimeRange(draft.eventStartTime, draft.eventEndTime);

  // Footer center text. eventNotes wins (the "Light refreshments
  // served" / "RSVP appreciated" copy belongs at the bottom of the
  // flyer where the eye lands last); falls back to a address +
  // city compose so an empty notes field still anchors the footer
  // with something orienting. Never reaches into propertyHighlights
  // — that array is for the FEATURES bullet list and only the
  // bullet list.
  const footerCenter = (() => {
    const notes = draft.eventNotes.trim();
    if (notes) return notes;
    const addressPart = draft.propertyAddress.trim();
    const cityPart = draft.propertyCity.trim();
    if (addressPart && cityPart) return `${addressPart}, ${cityPart}`;
    return addressPart || "Open House";
  })();

  return (
    <Document
      title={`Open House — ${draft.propertyAddress || "Untitled"}`}
      author={brand.agentName || undefined}
    >
      <Page
        size="LETTER"
        style={[
          styles.page,
          { backgroundColor: background, color: textPrimary },
        ]}
      >
        {/* ── Header band ──────────────────────────────────── */}
        <View
          style={[
            styles.header,
            { backgroundColor: primary, color: onPrimary },
          ]}
        >
          <Text style={[styles.headerTitle, { color: onPrimary }]}>
            Open House
          </Text>
          {dateLabel ? (
            <Text style={[styles.headerDate, { color: onPrimary }]}>
              {dateLabel}
            </Text>
          ) : null}
          <Text style={[styles.headerTime, { color: onPrimary }]}>
            {timeLabel}
          </Text>
        </View>

        {/* ── Hero photo ──────────────────────────────────── */}
        {hasHero ? (
          <View style={styles.heroWrap}>
            <Image src={heroSrc!} style={styles.hero} />
          </View>
        ) : (
          <View
            style={[
              styles.heroPlaceholder,
              { backgroundColor: "#1f2937", height: 270 },
            ]}
          >
            <Text
              style={[
                styles.heroStencil,
                { color: primary },
              ]}
            >
              Open House
            </Text>
          </View>
        )}

        {/* ── Thumb strip — up to 4 supplemental photos. Hidden
            when there's only a hero (or no photos at all). ── */}
        {hasThumbs ? (
          <View style={styles.thumbStrip}>
            {thumbSrcs.map((src, i) => (
              <View key={i} style={styles.thumbCell}>
                <Image src={src} style={styles.thumb} />
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Body ──────────────────────────────────────── */}
        <View style={styles.body}>
          {/* Property */}
          <Text style={[styles.propertyKicker, { color: accent }]}>
            Presenting
          </Text>
          <View style={styles.propertyRow}>
            <View style={styles.propertyLeft}>
              <Text
                style={[styles.propertyAddress, { color: textPrimary }]}
              >
                {draft.propertyAddress || "Property address"}
              </Text>
              {draft.propertyCity ? (
                <Text style={[styles.propertyCity, { color: textMuted }]}>
                  {draft.propertyCity}
                </Text>
              ) : null}
            </View>
            {draft.listingPrice ? (
              <Text style={[styles.propertyPrice, { color: primary }]}>
                {draft.listingPrice}
              </Text>
            ) : null}
          </View>

          {/* Highlights — H-7l extracted FeatureBullet so both
              columns route through one component. The previous
              dual-render-path let H-7i's bullet-color fix update
              column 1 but miss column 2 (which kept showing the
              earlier H-7h accent-colored bullets). */}
          {showHighlights ? (
            <>
              <Text style={[styles.sectionLabel, { color: primary }]}>
                Features
              </Text>
              <View style={styles.highlightsList}>
                <View style={styles.highlightCol}>
                  {leftHighlights.map((h, i) => (
                    <FeatureBullet
                      key={`l-${i}`}
                      text={h}
                      bulletColor={primary}
                      textColor={textPrimary}
                    />
                  ))}
                </View>
                {useTwoColHighlights ? (
                  <>
                    <View style={styles.highlightColGap} />
                    <View style={styles.highlightCol}>
                      {rightHighlights.map((h, i) => (
                        <FeatureBullet
                          key={`r-${i}`}
                          text={h}
                          bulletColor={primary}
                          textColor={textPrimary}
                        />
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
            </>
          ) : null}

          {/* Description — H-7p pre-truncates at 140 chars with
              an ellipsis so a long pitch doesn't push other
              blocks to page 2. The form's helper text already
              hints "1-2 sentence pitch", so most users stay
              under the cap; truncation only fires on outliers. */}
          {showDescription ? (
            <Text
              style={[
                styles.descriptionText,
                { color: textPrimary, marginTop: 8 },
              ]}
            >
              {truncate(draft.description, 140)}
            </Text>
          ) : null}

          {/* Agent + QR row */}
          <View style={styles.agentQrRow}>
            <View
              style={[
                styles.agentBlock,
                { paddingRight: showQr ? 16 : 0 },
              ]}
            >
              <View style={styles.agentTopRow}>
                {brand.logoDataUrl ? (
                  <Image src={brand.logoDataUrl} style={styles.agentLogo} />
                ) : (
                  <Text
                    style={[
                      styles.agentLogoFallback,
                      { backgroundColor: primary, color: onPrimary },
                    ]}
                  >
                    LOGO
                  </Text>
                )}
                <View>
                  <Text
                    style={[styles.agentName, { color: textPrimary }]}
                  >
                    {brand.agentName || "Your name"}
                  </Text>
                  {brand.brokerage ? (
                    <Text
                      style={[styles.agentBrokerage, { color: textMuted }]}
                    >
                      {brand.brokerage}
                    </Text>
                  ) : null}
                </View>
              </View>
              {brand.contactPhone ? (
                <Text
                  style={[styles.agentContactLine, { color: textPrimary }]}
                >
                  {formatPhone(brand.contactPhone)}
                </Text>
              ) : null}
              {brand.contactEmail ? (
                <Text
                  style={[styles.agentContactLine, { color: textPrimary }]}
                >
                  {brand.contactEmail}
                </Text>
              ) : null}
            </View>

            {showQr ? (
              <View style={styles.qrBlock}>
                <Image src={qrDataUrl!} style={styles.qrImage} />
                {/* H-7h: SCAN FOR DETAILS uses accent so it pairs
                    with the highlights bullets and PRESENTING
                    label as the secondary-brand color group. */}
                <Text style={[styles.qrLabel, { color: accent }]}>
                  Scan for details
                </Text>
              </View>
            ) : null}
          </View>

          {/* H-7j: event-notes block removed from the body. Notes
              now live exclusively in the footer center text — that
              avoids a redundant render and frees ~40pt of vertical
              budget that the body was over-spending on tall drafts. */}
        </View>

        {/* ── Footer band ─────────────────────────────────── */}
        <View
          style={[
            styles.footer,
            { backgroundColor: primary, color: onPrimary },
          ]}
        >
          <Text style={[styles.footerCenter, { color: onPrimary }]}>
            {footerCenter}
          </Text>
          {brand.licenseNumber ? (
            <Text style={[styles.footerLicense, { color: onPrimary }]}>
              License #{brand.licenseNumber.replace(/^#/, "")}
            </Text>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}

/** Truncate to maxChars with an ellipsis suffix. Trims trailing
 *  whitespace before appending the ellipsis so the result never
 *  has " …" with a stray space. Called only on the description
 *  field — long descriptions push the page-2 risk on multi-photo
 *  drafts. */
function truncate(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars).trimEnd() + "…";
}

/**
 * Single source of truth for a feature-list bullet (dot + text).
 * Both columns of the two-column highlights layout route through
 * this component, eliminating the dual render paths that let
 * H-7i's bullet-color fix update column 1 but miss column 2.
 */
function FeatureBullet({
  text,
  bulletColor,
  textColor,
}: {
  text: string;
  bulletColor: string;
  textColor: string;
}) {
  return (
    <View style={styles.highlightRow}>
      <View
        style={[
          styles.highlightBullet,
          { backgroundColor: bulletColor },
        ]}
      />
      <Text style={[styles.highlightText, { color: textColor }]}>
        {text}
      </Text>
    </View>
  );
}
