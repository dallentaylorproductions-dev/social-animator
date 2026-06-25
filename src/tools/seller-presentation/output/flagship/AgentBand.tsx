import {
  schedulingLinkHref,
  type AgentBranding,
  type PublicPayload,
} from "../public-payload";

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
  showGuarantee = false,
}: {
  payload: PublicPayload;
  showWordmark?: boolean;
  /** B0c — override the "06" index (pass "" to drop it on the standalone page). */
  eyebrowIndex?: string;
  /** B0c — suppress the dual CTA so the standalone page has one decided close. */
  showCtas?: boolean;
  /** B0c — suppress the folded foot (the standalone page renders its own Footer). */
  showFoot?: boolean;
  /**
   * D1-CLEANUP — render the agent's guarantee as a quiet line by the CTAs. The
   * v2 SELLER page sets this (the guarantee moved here off the removed why-us
   * differentiators wall); the prelisting page leaves it false (its why-us
   * variant still folds the guarantee into the differentiators section).
   */
  showGuarantee?: boolean;
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
  if (a.yearsInArea) fields.push({ k: "Years of experience", v: a.yearsInArea });

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
          (a.email || a.phone || a.schedulingUrl?.trim()) && (
            <div className="agent__note">No pressure, reach out anytime.</div>
          )
        ))}
      {/* D1-CLEANUP — the agent's guarantee, relocated here from the removed
          "Why work with us" section (seller page only; see showGuarantee). One
          quiet, understated reassurance line by the CTAs; flexes out cleanly
          when no guarantee is set. */}
      {showGuarantee && payload.whyUs?.guarantee?.trim() && (
        <div className="agent__guarantee" data-testid="fs-agent-guarantee">
          {payload.whyUs.guarantee}
        </div>
      )}

      {showFoot && (
        <div className="agent__foot" data-testid="fs-foot">
          <div className="agent__lower">
            {showWordmark &&
              (payload.brandLogoUrl ? (
                // The "global logo slot": the agent's logo at a true-dimension,
                // UNCROPPED frame (height-bounded, object-fit: contain) that fits
                // virtually any professionally-made logo. Absent → the wordmark,
                // byte-identical to today.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="agent__brand-logo"
                  data-testid="fs-wordmark-logo"
                  src={payload.brandLogoUrl}
                  alt={a.name ? `${a.name} logo` : "Agent logo"}
                  style={{
                    height: "40px",
                    width: "auto",
                    maxWidth: "220px",
                    objectFit: "contain",
                    display: "block",
                  }}
                />
              ) : (
                <div className="agent__brand" data-testid="fs-wordmark">
                  Studio <em>SEP</em>
                </div>
              ))}
            <div className="agent__disc">{disclaimer}</div>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * UX-2b — the agent-band avatar. Default = a plain centered `cover` photo (or the
 * monogram). REPOSITIONED (off-center focal OR zoom) = an inner clip + image
 * layer so the focal point maps to background-position and zoom maps to a scale
 * anchored at the focal point — a pure DISPLAY transform (image bytes untouched).
 */
function Avatar({
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
  const repositioned = !!photoUrl && (fx !== 50 || fy !== 50 || scale > 1);

  if (repositioned) {
    const bg = `url("${photoUrl!.replace(/"/g, '\\"')}")`;
    return (
      <div
        className="agent__avatar agent__avatar--adj"
        data-testid="fs-agent-avatar"
      >
        <span className="agent__avatar-clip">
          <span
            className="agent__avatar-img"
            data-testid="fs-agent-avatar-img"
            style={{
              backgroundImage: bg,
              backgroundPosition: `${fx}% ${fy}%`,
              ...(scale > 1
                ? { transform: `scale(${scale})`, transformOrigin: `${fx}% ${fy}%` }
                : null),
            }}
          />
        </span>
      </div>
    );
  }

  if (photoUrl) {
    return (
      <div
        className="agent__avatar"
        data-testid="fs-agent-avatar"
        style={{
          backgroundImage: `url("${photoUrl.replace(/"/g, '\\"')}")`,
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
  // Studio Profile — when the agent set a scheduling link, "Schedule a listing
  // call" points at it (a Calendly/Cal.com link IS the way to schedule), and
  // email/phone fall in behind it as additional reach. Without a link the primary
  // stays the mailto labeled "Schedule a listing call" — byte-identical to before.
  const schedule = schedulingLinkHref(agent.schedulingUrl);
  if (!phone && !email && !schedule) return null;
  return (
    <div className="agent__cta reveal">
      {schedule ? (
        <a
          className="btn btn--primary"
          href={schedule}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="fs-cta-schedule"
        >
          <span className="btn__lbl">Schedule a listing call</span>{" "}
          <span className="ar" aria-hidden="true">
            →
          </span>
        </a>
      ) : (
        email && (
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
        )
      )}
      {/* With a scheduling link present, email becomes a quiet additional action
          ("Email {first}") so the schedule button owns the primary "Schedule"
          slot without a duplicate label. */}
      {schedule && email && (
        <a
          className="btn btn--ghost"
          href={`mailto:${email}?subject=${encodeURIComponent("Listing call")}`}
          data-testid="fs-cta-email"
        >
          <span className="btn__lbl">Email {first}</span>{" "}
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
