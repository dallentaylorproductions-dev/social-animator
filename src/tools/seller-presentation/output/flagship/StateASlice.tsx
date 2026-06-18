import type { CSSProperties, ReactNode } from "react";
import { type PublicPayload } from "../public-payload";
import { consumerRoleVars, deriveConsumerRoles } from "../consumer-roles";
import { formatAppointment } from "../../engine/appointment";
import { newsreader } from "./fonts";
import { StateAHero } from "./StateAHero";
import { StateAHello } from "./StateAHello";
import { AppointmentBrief } from "./AppointmentBrief";
import { CampaignSpread } from "./CampaignSpread";
import { AgentBand } from "./AgentBand";
import {
  ValuationPrepared,
  TrustStrip,
  MeetingClose,
} from "./StateAPage";
import "./flagship.css";
import "./state-a.css";

/**
 * Studio cockpit accent — the brighter site mint the dashboard (sep-studio.css)
 * and Your Pages cockpit (pages-library.css) both resolve `--accent` to, mirrored
 * here as the onboarding slice's UNSET-brand signature so the first-run reveal
 * harmonizes with the studio chrome (`--o2-accent` in welcome-v2.css) instead of
 * the brand-system default flagship blue (#037290).
 *
 * SCOPED TO ONBOARDING: this constant is fed to `deriveConsumerRoles` ONLY here,
 * and `StateASlice` is imported ONLY by the V2 onboarding flow (WelcomeFlowV2).
 * The live seller pages (FlagshipPage / StateAPage / PrelistingPage) call
 * `deriveConsumerRoles` themselves with the agent's real accent and are NOT
 * touched — an unset-brand published page still derives the #037290 default ramp,
 * so no already-published page changes color.
 */
const STUDIO_MINT = "#5BF5C9";

/**
 * StateASlice — render ONE real State A section, standalone, in the exact shell
 * StateAPage gives it (role vars + Newsreader + flagship/state-a CSS), so a
 * cropped slice looks byte-for-byte like that section does on the live page.
 *
 * Built for the onboarding first-run V2 flow (ONBOARDING_FIRST_RUN_V2), which
 * reveals the real page one section at a time as the agent fills it in. The
 * payload is the agent's in-progress draft+brand run through the SAME
 * `draftPreviewPayload` pipeline the wizard live-preview uses, so the slice is
 * exactly what the seller will receive — never a mock.
 *
 * This adds NO new rendering logic: each section is the real component (the four
 * StateAPage-local sections are now exported), wrapped in the same ancestor the
 * full page provides. The motion island (countups / view signal) is deliberately
 * omitted — a slice renders its true values at rest, which is the honest state.
 */
export type StateASection =
  | "hero"
  | "hello"
  | "brief"
  | "valuation"
  | "trust"
  | "campaign"
  | "meeting"
  | "agent";

export function StateASlice({
  payload,
  section,
  reviewSourceLogos = false,
  preparedAt,
}: {
  payload: PublicPayload;
  section: StateASection;
  reviewSourceLogos?: boolean;
  preparedAt?: string;
}) {
  // Unset brand → studio mint (not the brand-system #037290 default), so the
  // onboarding slice matches the studio chrome. A set brand still wins, so the
  // slice stays an honest preview of the agent's own page when they have one.
  const roles = deriveConsumerRoles(payload.brandColors?.accent || STUDIO_MINT);
  const roleVars = consumerRoleVars(roles) as CSSProperties;
  const appt = formatAppointment(payload.appointmentAt);

  let body: ReactNode = null;
  switch (section) {
    case "hero":
      body = <StateAHero payload={payload} appt={appt} />;
      break;
    case "hello":
      body = <StateAHello payload={payload} />;
      break;
    case "brief":
      // Onboarding reveals the found nearby sales before Street View resolves, so
      // relax the photo-forward gate (photographed comps still lead; text-only
      // comps render the designed placeholder, never a blank).
      body = (
        <AppointmentBrief
          payload={payload}
          preparedAt={preparedAt}
          requireCompPhoto={false}
        />
      );
      break;
    case "valuation":
      body = <ValuationPrepared payload={payload} appt={appt} />;
      break;
    case "trust":
      body = <TrustStrip payload={payload} sourceLogos={reviewSourceLogos} />;
      break;
    case "campaign":
      body = <CampaignSpread payload={payload} />;
      break;
    case "meeting":
      body = <MeetingClose payload={payload} appt={appt} />;
      break;
    case "agent":
      body = (
        <AgentBand
          payload={payload}
          showWordmark={payload.suppressWordmark !== true}
          showCtas={false}
        />
      );
      break;
  }

  return (
    <div
      className={`fs-page state-a ${newsreader.variable}`}
      style={roleVars}
      data-flagship-shell
      data-state-a-slice={section}
    >
      <div className="fs-frame">{body}</div>
    </div>
  );
}
