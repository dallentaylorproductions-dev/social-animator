import type { PublicPayload } from "../public-payload";
import { effectivePosterUrl } from "../../engine/types";

/**
 * Seller State A · Signature B - "How I'll get your home seen" (campaign spread).
 *
 * The one net-new visual: a premium, editorial composition of the PRODUCED
 * assets that go in front of buyers, photo-forward, matching the State B DNA.
 * Shows OUTPUT, not strategy, and never an abstract dot field / node graph /
 * logo row / tech-stack map. A slim reach line beneath says WHERE the home is
 * seen without a utilitarian lane wall.
 *
 * Honest by construction: frames are built ONLY from assets the payload actually
 * carries - the listing photo (`heroPhotoUrl`), the walkthrough video (its
 * poster when one exists), and the agent's authored marketing-plan items
 * (`whyUs.marketingApproach`). Nothing is fabricated; the whole section flexes
 * out when no produced asset backs it.
 */
type Frame = {
  key: string;
  label: string;
  sub?: string;
  image?: string;
  kind: "photo" | "asset";
};

export function CampaignSpread({ payload }: { payload: PublicPayload }) {
  const frames: Frame[] = [];

  const listing = payload.property.heroPhotoUrl?.trim();
  if (listing) {
    frames.push({
      key: "listing",
      label: "The listing",
      sub: "Magazine-grade photography",
      image: listing,
      kind: "photo",
    });
  }

  const v = payload.video;
  if (v?.videoUrl) {
    const poster = effectivePosterUrl(v);
    frames.push({
      key: "video",
      label: "Video tour",
      sub: v.runtime?.trim() || "A walk through the home",
      image: poster,
      kind: poster ? "photo" : "asset",
    });
  }

  const marketing = payload.whyUs?.marketingApproach ?? [];
  marketing.slice(0, 3).forEach((m, i) => {
    if (!m.title?.trim()) return;
    frames.push({
      key: `mkt-${i}`,
      label: m.title,
      sub: m.detail?.trim() || undefined,
      kind: "asset",
    });
  });

  if (frames.length === 0) return null;

  const [lead, ...rest] = frames;

  return (
    <section className="section sa-spread z-offwhite" data-testid="fs-sa-spread">
      <div className="reveal">
        <div className="eyebrow">
          How I&apos;ll Get Your Home Seen{" "}
          <span className="rule" aria-hidden="true" />
        </div>
        <h2 className="head">
          Produced, and <em>put in front of buyers</em>.
        </h2>
      </div>

      <div className="sa-spread__grid reveal">
        <SpreadFrame frame={lead} lead />
        {rest.length > 0 && (
          <div className="sa-spread__rest">
            {rest.map((f) => (
              <SpreadFrame key={f.key} frame={f} />
            ))}
          </div>
        )}
      </div>

      <p className="sa-spread__reach reveal" data-testid="fs-sa-spread-reach">
        Seen across search portals, a local buyer network, and social discovery.
      </p>
    </section>
  );
}

function SpreadFrame({ frame, lead = false }: { frame: Frame; lead?: boolean }) {
  return (
    <div
      className={`sa-frame${lead ? " sa-frame--lead" : ""}${
        frame.image ? " has-photo" : ""
      }`}
      data-testid={`fs-sa-spread-${frame.key}`}
    >
      {frame.image && (
        <span
          className="sa-frame__photo"
          aria-hidden="true"
          style={{
            backgroundImage: `url("${frame.image.replace(/"/g, '\\"')}")`,
          }}
        />
      )}
      <div className="sa-frame__cap">
        <span className="sa-frame__label">{frame.label}</span>
        {frame.sub && <span className="sa-frame__sub">{frame.sub}</span>}
      </div>
    </div>
  );
}
