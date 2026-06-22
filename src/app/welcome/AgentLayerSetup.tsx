'use client';

/**
 * AgentLayerSetup — the Path A container (ONBOARDING_HYBRID_V3, Phase 3).
 *
 * THIN SCAFFOLD ONLY. Phase 4 fills this with the preview-led "sample home,
 * real you" experience (PreviewContext + payoff-gated Agent-Layer capture that
 * reads/writes the server brand record via `useBrandSettings`). This phase only
 * proves the ROUTING + STATE wiring: "Set up my page details" lands here, and
 * this surface is the **Preview/none** state — it MINTS NOTHING (no instance,
 * slug, publish state, or engagement record). That is G1, enforced
 * structurally: this module imports no draft-creation path.
 *
 * Guardrails for whoever extends this in Phase 4:
 *   - G7 — the ONLY new UI surfaces this rebuild allows are this Agent-Layer
 *     container + the V3 first screen. Do NOT add seller-page section
 *     components or a new preview renderer; reuse the existing wizard preview
 *     engine.
 *   - G2 — every Path A ask must be payoff-gated (it may be asked only if
 *     filling it visibly changes the live preview). So this is preview-LED,
 *     NOT a plain form — which is why this placeholder intentionally ships zero
 *     form fields or ghosted slots.
 */
export function AgentLayerSetup({ onBack }: { onBack: () => void }) {
  return (
    <div data-testid="onbv3-agent-layer">
      <div>
        <p className="onb__eyebrow">Your page details</p>
        <h1 className="onb__title">Let&rsquo;s set up your page details.</h1>
        <p className="onb__sub">
          We&rsquo;ll build a sample seller page with your details so you can see
          exactly what your sellers will — and shape it as you go.
        </p>
      </div>
      <div className="onb__actions">
        <button
          type="button"
          className="onb__btn onb__btn--ghost"
          data-testid="onbv3-agent-layer-back"
          onClick={onBack}
        >
          Back
        </button>
      </div>
    </div>
  );
}
