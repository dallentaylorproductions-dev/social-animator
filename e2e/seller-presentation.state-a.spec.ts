import { test, expect } from "@playwright/test";

/**
 * Seller State A — the valuation-status state machine (pure-Node, no browser).
 *
 * Proves the data-layer contract of the prepared invitation:
 *   1. State-machine DEFAULTING is byte-identical: a draft / payload with no
 *      status resolves to `revealed` and emits NO new keys.
 *   2. The `sellerStateA` projector flag gates the new keys: OFF (or a revealed
 *      status) emits nothing; ON + an invitation status emits valuationStatus +
 *      appointmentAt and nothing else.
 *   3. The read clamp coerces an absent / tampered status to `revealed`, and
 *      drops a stray appointment on a revealed record.
 *   4. The publish gate relaxes in an invitation status (address + appointment
 *      only, no price/comps) and is UNCHANGED for the full presentation.
 *   5. The SSR-safe appointment formatter is deterministic + range-validating.
 */

import {
  toPublicPayload,
  clampPublicPayload,
} from "../src/tools/seller-presentation/output/public-payload";
import {
  clampDraft,
  getMissingRequiredInputs,
  isInvitationStatus,
  type SellerPresentationDraft,
} from "../src/tools/seller-presentation/engine/types";
import {
  formatAppointment,
  isValidAppointmentAt,
  clampAppointmentAt,
} from "../src/tools/seller-presentation/engine/appointment";

const AGENT = { name: "Aaron Test", email: "aaron@example.com" };

function invitationDraft(
  over: Partial<SellerPresentationDraft> = {},
): SellerPresentationDraft {
  return {
    propertyAddress: "1234 Test Drive NE",
    comps: [],
    pitchPoints: [],
    commitments: [],
    asks: [],
    valuationStatus: "preparing_for_walkthrough",
    appointmentAt: "2026-06-20T14:00",
    ...over,
  };
}

// Project with the State A flag on. The flag is the 8th positional arg, so the
// preceding defaults must be passed through.
function projectStateA(
  draft: SellerPresentationDraft,
  sellerStateA: boolean,
) {
  return toPublicPayload(draft, AGENT, {}, {}, false, {}, false, sellerStateA);
}

test.describe("State A — projection flag gates the new keys", () => {
  test("flag OFF → no valuationStatus / appointmentAt (byte-identical publish)", () => {
    const payload = projectStateA(invitationDraft(), false);
    const serialized = JSON.stringify(payload);
    expect(payload.valuationStatus).toBeUndefined();
    expect(payload.appointmentAt).toBeUndefined();
    expect(serialized).not.toContain('"valuationStatus":');
    expect(serialized).not.toContain('"appointmentAt":');
  });

  test("flag ON + invitation status → emits valuationStatus + appointmentAt", () => {
    const payload = projectStateA(invitationDraft(), true);
    expect(payload.valuationStatus).toBe("preparing_for_walkthrough");
    expect(payload.appointmentAt).toBe("2026-06-20T14:00");
  });

  test("flag ON + revealed status → no keys (full presentation is byte-identical)", () => {
    const payload = projectStateA(
      invitationDraft({ valuationStatus: "revealed" }),
      true,
    );
    const serialized = JSON.stringify(payload);
    expect(payload.valuationStatus).toBeUndefined();
    expect(serialized).not.toContain('"valuationStatus":');
    expect(serialized).not.toContain('"appointmentAt":');
  });

  test("flag ON + invitation but a garbage appointment → status emits, appointment drops", () => {
    const payload = projectStateA(
      invitationDraft({ appointmentAt: "not-a-date" }),
      true,
    );
    expect(payload.valuationStatus).toBe("preparing_for_walkthrough");
    expect(payload.appointmentAt).toBeUndefined();
  });

  test("no new top-level keys leak on a normal (revealed) publish", () => {
    // A standard publish (no sellerStateA arg at all) must carry neither key —
    // the existing top-level allowlist stays intact.
    const payload = toPublicPayload(invitationDraft(), AGENT);
    const json = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    expect("valuationStatus" in json).toBe(false);
    expect("appointmentAt" in json).toBe(false);
  });
});

test.describe("State A — read clamp coerces to a single state", () => {
  test("absent status → revealed (every pre-State-A slug)", () => {
    const clamped = clampPublicPayload({ propertyAddress: "x" });
    expect(clamped.valuationStatus).toBe("revealed");
    expect(clamped.appointmentAt).toBeUndefined();
  });

  test("invitation status + appointment round-trips through the clamp", () => {
    const clamped = clampPublicPayload({
      propertyAddress: "x",
      valuationStatus: "preparing_for_walkthrough",
      appointmentAt: "2026-06-20T14:00",
    });
    expect(clamped.valuationStatus).toBe("preparing_for_walkthrough");
    expect(clamped.appointmentAt).toBe("2026-06-20T14:00");
  });

  test("tampered status → revealed; ready_to_review is honored", () => {
    expect(
      clampPublicPayload({ valuationStatus: "garbage" }).valuationStatus,
    ).toBe("revealed");
    expect(
      clampPublicPayload({ valuationStatus: "ready_to_review" })
        .valuationStatus,
    ).toBe("ready_to_review");
  });

  test("a stray appointment on a REVEALED record is dropped (never rendered)", () => {
    const clamped = clampPublicPayload({
      valuationStatus: "revealed",
      appointmentAt: "2026-06-20T14:00",
    });
    expect(clamped.appointmentAt).toBeUndefined();
  });

  test("an empty / non-object record resolves to revealed", () => {
    expect(clampPublicPayload(null).valuationStatus).toBe("revealed");
    expect(clampPublicPayload(undefined).valuationStatus).toBe("revealed");
  });
});

test.describe("State A — clampDraft validates the status + appointment", () => {
  test("unknown status drops to undefined; valid one survives", () => {
    expect(
      clampDraft({ valuationStatus: "nope" } as unknown as SellerPresentationDraft)
        .valuationStatus,
    ).toBeUndefined();
    expect(
      clampDraft({
        valuationStatus: "preparing_for_walkthrough",
      } as SellerPresentationDraft).valuationStatus,
    ).toBe("preparing_for_walkthrough");
  });

  test("malformed appointment drops; a valid datetime-local survives", () => {
    expect(
      clampDraft({
        appointmentAt: "2026-13-40T99:99",
      } as SellerPresentationDraft).appointmentAt,
    ).toBeUndefined();
    expect(
      clampDraft({
        appointmentAt: "2026-06-20T14:00",
      } as SellerPresentationDraft).appointmentAt,
    ).toBe("2026-06-20T14:00");
  });
});

test.describe("State A — publish gate relaxes for the invitation, unchanged for revealed", () => {
  test("invitation: address + appointment required, NOT price/comps", () => {
    // Full invitation draft (no price, no comps) → publishable.
    expect(getMissingRequiredInputs(invitationDraft())).toEqual([]);
    // Missing the appointment → blocked on appointmentAt only (never price/comps).
    expect(
      getMissingRequiredInputs(invitationDraft({ appointmentAt: undefined })),
    ).toEqual(["appointmentAt"]);
    // Missing the address too → both named, still no price/comps.
    expect(
      getMissingRequiredInputs(
        invitationDraft({ propertyAddress: undefined, appointmentAt: undefined }),
      ),
    ).toEqual(["propertyAddress", "appointmentAt"]);
  });

  test("revealed (default): the existing price + comp gate is unchanged", () => {
    const revealed: SellerPresentationDraft = {
      propertyAddress: "1234 Test Drive NE",
      comps: [],
      pitchPoints: [],
      commitments: [],
      asks: [],
    };
    // No status → revealed → price + comps still required (today's behavior).
    expect(getMissingRequiredInputs(revealed)).toEqual([
      "recommendedPrice",
      "comps",
    ]);
  });

  test("isInvitationStatus predicate", () => {
    expect(isInvitationStatus("preparing_for_walkthrough")).toBe(true);
    expect(isInvitationStatus("ready_to_review")).toBe(true);
    expect(isInvitationStatus("revealed")).toBe(false);
    expect(isInvitationStatus(undefined)).toBe(false);
  });
});

test.describe("State A — SSR-safe appointment formatter", () => {
  test("formats the named, dated moment deterministically", () => {
    const f = formatAppointment("2026-06-20T14:00");
    expect(f).not.toBeNull();
    expect(f!.weekday).toBe("Saturday");
    expect(f!.date).toBe("June 20");
    expect(f!.time).toBe("2:00 PM");
    expect(f!.full).toBe("Saturday, June 20 at 2:00 PM");
  });

  test("midnight + noon read 12 (not 0), AM/PM correct", () => {
    expect(formatAppointment("2026-06-20T00:00")!.time).toBe("12:00 AM");
    expect(formatAppointment("2026-06-20T12:05")!.time).toBe("12:05 PM");
    expect(formatAppointment("2026-06-20T09:30")!.time).toBe("9:30 AM");
  });

  test("invalid / impossible values return null + fail validation", () => {
    for (const bad of [
      "",
      "2026-06-20",
      "2026-13-01T10:00",
      "2026-02-30T10:00",
      "2026-06-20T24:00",
      "garbage",
      undefined,
    ]) {
      expect(formatAppointment(bad as string), String(bad)).toBeNull();
      expect(isValidAppointmentAt(bad as string), String(bad)).toBe(false);
    }
    expect(isValidAppointmentAt("2026-06-20T14:00")).toBe(true);
    expect(clampAppointmentAt("  2026-06-20T14:00  ")).toBe("2026-06-20T14:00");
    expect(clampAppointmentAt(42)).toBeUndefined();
  });
});
