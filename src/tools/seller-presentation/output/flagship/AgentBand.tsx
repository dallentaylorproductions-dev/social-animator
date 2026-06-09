import type { AgentBranding, PublicPayload } from "../public-payload";

/**
 * §06 · Your agent (footer) — DARK beat, ported from the prototype's
 * `AgentFooter` DOM. Name / tagline / eyebrow are stacked in `.agent__top` with
 * the locked spacing (no overlap). The Studio SEP wordmark is a conditional
 * white-label slot (`showWordmark`, default true); the legal disclaimer is
 * ALWAYS present, verbatim with the prepared-for name interpolated.
 */
export function AgentBand({
  payload,
  showWordmark = true,
  eyebrowIndex = "06",
  showCtas = true,
  showFoot = true,
}: {
  payload: PublicPayload;
  showWordmark?: boolean;
  /** B0c — override the "06" index (pass "" to drop it on the standalone page). */
  eyebrowIndex?: string;
  /** B0c — suppress the dual CTA so the standalone page has one decided close. */
  showCtas?: boolean;
  /** B0c — suppress the folded foot (the standalone page renders its own Footer). */
  showFoot?: boolean;
}) {
  const a = payload.agent;
  if (!a.name?.trim()) return null;

  const monogram = a.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const role = [a.brokerage, a.areasServed]
    .filter((v) => v?.trim())
    .join(" · ")
    .toUpperCase();
  const first = a.name.split(/\s+/)[0] ?? "the agent";

  const fields: Array<{ k: string; v: string }> = [];
  if (a.phone) fields.push({ k: "Phone", v: formatPhone(a.phone) });
  if (a.email) fields.push({ k: "Email", v: a.email });
  if (a.licenseNumber) fields.push({ k: "License", v: a.licenseNumber });
  if (a.yearsInArea) fields.push({ k: "Years Here", v: a.yearsInArea });

  const preparedFor = payload.preparedFor?.trim();
  const disclaimer = preparedFor
    ? `Prepared privately for ${preparedFor}. The information above is drawn from public record. This page is not an advertisement and does not constitute an offer.`
    : "The information above is drawn from public record. This page is not an advertisement and does not constitute an offer.";

  return (
    <section className="section agent" data-testid="fs-agent">
      <div className="agent__top">
        <div className="reveal">
          <div className="eyebrow on-dark">
            {eyebrowIndex && (
              <>
                <span className="num">{eyebrowIndex}</span> ·{" "}
              </>
            )}
            Your Agent
          </div>
          <h2 className="agent__name">{a.name}.</h2>
          {payload.agentTagline && (
            <div className="agent__tag" data-testid="fs-agent-tagline">
              {payload.agentTagline}
            </div>
          )}
        </div>
        <div className="reveal">
          <div className="agent__card">
            <Avatar agent={a} monogram={monogram} />
            <div className="agent__who">
              <div className="n">{a.name}</div>
              {role && <div className="r">{role}</div>}
            </div>
          </div>
        </div>
      </div>

      {a.bioShort && <div className="agent__bio reveal">{a.bioShort}</div>}

      {fields.length > 0 && (
        <div className="agent__meta reveal">
          {fields.map((f, i) => (
            <div className="agent__field" key={i}>
              <div className="k">{f.k}</div>
              <div className="v">{f.v}</div>
            </div>
          ))}
        </div>
      )}

      {showCtas && <AgentCtas agent={a} first={first} />}
      {showCtas &&
        (a.ctaReassurance ? (
          <div className="agent__note">{a.ctaReassurance}</div>
        ) : (
          (a.email || a.phone) && (
            <div className="agent__note">No pressure, reach out anytime.</div>
          )
        ))}

      {showFoot && (
        <div className="agent__foot" data-testid="fs-foot">
          <div className="agent__lower">
            {showWordmark && (
              <div className="agent__brand" data-testid="fs-wordmark">
                Studio <em>SEP</em>
              </div>
            )}
            <div className="agent__disc">{disclaimer}</div>
          </div>
        </div>
      )}
    </section>
  );
}

function Avatar({
  agent,
  monogram,
}: {
  agent: AgentBranding;
  monogram: string;
}) {
  if (agent.photoUrl) {
    return (
      <div
        className="agent__avatar"
        data-testid="fs-agent-avatar"
        style={{
          backgroundImage: `url("${agent.photoUrl.replace(/"/g, '\\"')}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        aria-hidden="true"
      />
    );
  }
  return (
    <div className="agent__avatar" data-monogram={monogram}>
      {monogram}
    </div>
  );
}

function AgentCtas({ agent, first }: { agent: AgentBranding; first: string }) {
  const phone = agent.phone?.replace(/[^0-9+]/g, "");
  const email = agent.email;
  if (!phone && !email) return null;
  return (
    <div className="agent__cta reveal">
      {email && (
        <a
          className="btn btn--primary"
          href={`mailto:${email}?subject=${encodeURIComponent("Listing call")}`}
          data-testid="fs-cta-primary"
        >
          <span className="btn__lbl">Schedule a listing call</span>{" "}
          <span className="ar" aria-hidden="true">
            →
          </span>
        </a>
      )}
      {phone && (
        <a className="btn btn--ghost" href={`tel:${phone}`} data-testid="fs-cta-ghost">
          <span className="btn__lbl">Call {first} directly</span>{" "}
          <span className="ar" aria-hidden="true">
            ☏
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
