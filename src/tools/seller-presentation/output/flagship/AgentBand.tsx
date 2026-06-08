import type { AgentBranding, PublicPayload } from "../public-payload";
import { Eyebrow } from "./Eyebrow";

/**
 * §06 · Agent band — the dark chapter. All reading text uses the fixed
 * layout cream --on-dark (NOT --on-signature, which would render dark-on-dark
 * for a terracotta page). The ONE place --on-signature is correct is the
 * PRIMARY CTA label, on the --signature fill (contract §2/§4 — terracotta
 * resolves DARK, blue/green/etc. resolve cream). The ghost CTA is on the dark
 * band, so border + label = --on-dark. Avatar status dot = --signature.
 */
export function AgentBand({ payload }: { payload: PublicPayload }) {
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
  if (a.yearsInArea) fields.push({ k: "Years here", v: a.yearsInArea });

  return (
    <section className="fs-agent fs-block" data-testid="fs-agent">
      <div className="fs-wrap">
        <Eyebrow index="06" label="Your agent" onDark />
        <h2 className="fs-agent__name reveal">{a.name}.</h2>
        {/* B0b — optional agent-constant tagline, surfaced next to the agent
            identity. Absent → unchanged (no empty line). */}
        {payload.agentTagline && (
          <p className="fs-agent__tagline reveal" data-testid="fs-agent-tagline">
            {payload.agentTagline}
          </p>
        )}

        <div className="fs-agent__card reveal">
          <div
            className={`fs-agent__avatar${a.photoUrl ? " fs-agent__avatar--photo" : ""}`}
            data-monogram={monogram}
            style={
              a.photoUrl
                ? {
                    backgroundImage: `url("${a.photoUrl.replace(/"/g, '\\"')}")`,
                  }
                : undefined
            }
          />
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

        <AgentCtas agent={a} />
      </div>
    </section>
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
