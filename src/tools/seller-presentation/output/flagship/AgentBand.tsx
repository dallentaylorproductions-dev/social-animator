import type { AgentBranding, PublicPayload } from "../public-payload";
import { Eyebrow } from "./Eyebrow";

/**
 * §06 · Agent band — the dark chapter. All reading text uses the fixed
 * layout cream --on-dark (NOT --on-signature, which would render dark-on-dark
 * for a terracotta page). The ONE place --on-signature is correct is the
 * PRIMARY CTA label, on the --signature fill (contract §2/§4 — terracotta
 * resolves DARK, blue/green/etc. resolve cream). The ghost CTA is on the dark
 * band, so border + label = --on-dark. Avatar status dot = --signature.
 *
 * B0c — two additive, backward-compatible props (defaults preserve the seller
 * page byte-identically): `eyebrowIndex` overrides the "06" index (pass `""` to
 * drop it on the un-numbered standalone page — the Eyebrow omits a falsy
 * index), and `showCtas={false}` suppresses the dual CTA so the standalone page
 * can present a single intentional close instead of a menu of options.
 */
export function AgentBand({
  payload,
  eyebrowIndex = "06",
  showCtas = true,
}: {
  payload: PublicPayload;
  eyebrowIndex?: string;
  showCtas?: boolean;
}) {
  const a = payload.agent;
  if (!a.name?.trim()) return null;

  const monogram = a.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const role = [a.brokerage, a.areasServed].filter((v) => v?.trim()).join(" · ");

  const fields: Array<{ k: string; v: string }> = [];
  if (a.phone) fields.push({ k: "Direct", v: formatPhone(a.phone) });
  if (a.email) fields.push({ k: "Email", v: a.email });
  if (a.licenseNumber) fields.push({ k: "License", v: a.licenseNumber });
  if (a.yearsInArea) fields.push({ k: "Years of experience", v: a.yearsInArea });

  return (
    <section className="fs-agent fs-block" data-testid="fs-agent">
      <div className="fs-wrap">
        <Eyebrow index={eyebrowIndex} label="Your agent" onDark />
        <h2 className="fs-agent__name reveal">{a.name}.</h2>
        {/* B0b — optional agent-constant tagline, surfaced next to the agent
            identity. Absent → unchanged (no empty line). */}
        {payload.agentTagline && (
          <p className="fs-agent__tagline reveal" data-testid="fs-agent-tagline">
            {payload.agentTagline}
          </p>
        )}

        <div className="fs-agent__card reveal">
          <AgentAvatar agent={a} monogram={monogram} />
          <div>
            <div className="fs-agent__cardname">{a.name}</div>
            {role && <div className="fs-agent__role">{role}</div>}
          </div>
        </div>

        {a.bioShort && (
          <p className="fs-agent__bio reveal">{a.bioShort}</p>
        )}

        {fields.length > 0 && (
          <div className="fs-agent__contact">
            {fields.map((f, i) => (
              <div className="fs-agent__field reveal" key={i}>
                <div className="fs-agent__fk">{f.k}</div>
                <div className="fs-agent__fv">{f.v}</div>
              </div>
            ))}
          </div>
        )}

        {showCtas && <AgentCtas agent={a} />}
      </div>
    </section>
  );
}

/**
 * UX-2b — the agent-band avatar. Two rendering paths, chosen so the common
 * case never changes:
 *
 *   • DEFAULT (no photo, OR a photo with no reposition) — renders the exact
 *     pre-UX-2b markup: a single `.fs-agent__avatar` div whose background is
 *     the photo (centered `cover`) or, with no photo, the monogram fallback.
 *     Every already-published page and every agent who never opened the
 *     reposition control hits THIS path, so their output is byte-identical.
 *
 *   • REPOSITIONED (photo + off-center focal OR zoom) — adds an inner clip +
 *     image layer. The focal point maps to `background-position`; zoom maps to
 *     `transform: scale()` anchored at the focal point. The photo rides the
 *     inner layer (clipped to the rounded frame) so a zoom magnifies WITHOUT
 *     spilling past the frame, while the avatar itself keeps `overflow:
 *     visible` so the signature status dot (the `::after`, outset -3px) is
 *     never clipped. Still a pure DISPLAY transform — the image bytes are
 *     untouched.
 */
function AgentAvatar({
  agent,
  monogram,
}: {
  agent: AgentBranding;
  monogram: string;
}) {
  const photoUrl = agent.photoUrl;
  const fx = typeof agent.photoFocalX === "number" ? agent.photoFocalX : 50;
  const fy = typeof agent.photoFocalY === "number" ? agent.photoFocalY : 50;
  const scale = typeof agent.photoScale === "number" ? agent.photoScale : 1;
  // Only diverge from the byte-identical default when the agent actually moved
  // the focal point or zoomed in. Centered + no zoom === today's markup.
  const repositioned = !!photoUrl && (fx !== 50 || fy !== 50 || scale > 1);

  if (repositioned) {
    const bg = `url("${photoUrl!.replace(/"/g, '\\"')}")`;
    return (
      <div
        className="fs-agent__avatar fs-agent__avatar--photo fs-agent__avatar--adj"
        data-monogram={monogram}
        data-testid="fs-agent-avatar"
      >
        <span className="fs-agent__avatar-clip">
          <span
            className="fs-agent__avatar-img"
            data-testid="fs-agent-avatar-img"
            style={{
              backgroundImage: bg,
              backgroundPosition: `${fx}% ${fy}%`,
              ...(scale > 1
                ? {
                    transform: `scale(${scale})`,
                    transformOrigin: `${fx}% ${fy}%`,
                  }
                : null),
            }}
          />
        </span>
      </div>
    );
  }

  // NOTE: the default path is intentionally the EXACT pre-UX-2b markup (no
  // data-testid, no extra class) so existing pages stay byte-identical.
  return (
    <div
      className={`fs-agent__avatar${photoUrl ? " fs-agent__avatar--photo" : ""}`}
      data-monogram={monogram}
      style={
        photoUrl
          ? { backgroundImage: `url("${photoUrl.replace(/"/g, '\\"')}")` }
          : undefined
      }
    />
  );
}

function AgentCtas({ agent }: { agent: AgentBranding }) {
  const phone = agent.phone?.replace(/[^0-9+]/g, "");
  const email = agent.email;
  if (!phone && !email) return null;
  const first = agent.name?.split(/\s+/)[0] ?? "the agent";

  return (
    <div className="fs-agent__cta">
      {email && (
        <a
          className="fs-btn-primary reveal"
          href={`mailto:${email}?subject=${encodeURIComponent("Listing call")}`}
          data-testid="fs-cta-primary"
        >
          Schedule a listing call
          <span className="fs-btn__ic" aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </span>
        </a>
      )}
      {agent.ctaReassurance && (
        <div className="fs-btn-reassure">{agent.ctaReassurance}</div>
      )}
      {phone && (
        <a className="fs-btn-ghost reveal" href={`tel:${phone}`} data-testid="fs-cta-ghost">
          Call {first} directly
          <span className="fs-btn__ic" aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3.5 3h3l1 3.5L6 8a8 8 0 003.5 3.5L11 10l3.5 1v3a1 1 0 01-1 1A11 11 0 013 4.5 1 1 0 013.5 3z" />
            </svg>
          </span>
        </a>
      )}
    </div>
  );
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}
