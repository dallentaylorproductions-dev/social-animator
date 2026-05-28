import { test, expect } from '@playwright/test';
import React from 'react';

import {
  SellerPresentationPrepPdf,
} from '../src/tools/seller-presentation/output/prep-pdf';
import {
  toPublicPayload,
  type AgentBranding,
} from '../src/tools/seller-presentation/output/public-payload';
import type { SellerPresentationDraft } from '../src/tools/seller-presentation/engine/types';

/**
 * Seller Presentation — agent prep PDF spec (v1.47 / A7e).
 *
 * The prep PDF is the PRIVATE companion to the public seller page. It
 * deliberately surfaces fields the public payload drops. This spec
 * proves both directions of the boundary:
 *
 *   1) The React tree produced by SellerPresentationPrepPdf CONTAINS
 *      every representative private content sentinel (strategy detail,
 *      comp notes, private pitch points, pre-appointment notes,
 *      commitments, asks, rationale). Walks the React tree directly
 *      instead of rendering the PDF — Playwright's TS loader doesn't
 *      play nice with react-pdf's reconciler in Node (a known issue
 *      reproduces with every existing SEP PDF too), but the tree walk
 *      is what proves the wiring is correct anyway.
 *   2) The SAME draft, run through `toPublicPayload`, drops every one
 *      of those private sentinels — the standing allowlist guarantee
 *      isn't weakened by A7e's new agent-only read path.
 *
 * The renderer-runtime "generates without error" half is left to
 * Dallen's smoke (download from /seller-presentation on the preview
 * build) — same model as the other SEP PDFs in this repo.
 */

const S = {
  // Private content the PDF must include.
  preAppointmentNotes: 'PRIVATE_PREP_NOTES_SENTINEL',
  commitment: 'PRIVATE_COMMITMENT_SENTINEL',
  ask: 'PRIVATE_ASK_SENTINEL',
  privatePitchTitle: 'PRIVATE_PITCH_TITLE_SENTINEL',
  privatePitchSupport: 'PRIVATE_PITCH_SUPPORT_SENTINEL',
  compNotes: 'PRIVATE_COMP_NOTES_SENTINEL',
  compSource: 'screenshot-ai' as const,
  rationale: 'PRIVATE_RATIONALE_FULL_CONTEXT',

  // Public content for sanity (these appear in both surfaces).
  propertyAddress: '1234 Test Drive NE',
  recommendedPrice: '$685,000',
  publicPitchTitle: 'PUBLIC_PITCH_TITLE_SENTINEL',
};

function buildDraft(): SellerPresentationDraft {
  return {
    propertyId: 'property_test_id',
    propertyAddress: S.propertyAddress,
    propertyCity: 'Tacoma',
    propertyState: 'WA',
    propertyZip: '98404',
    recommendedPrice: S.recommendedPrice,
    priceRationale: S.rationale,
    pricingStrategyId: 'strategic-quick-sale',
    confidence: 'high',
    comps: [
      {
        address: '5678 Elm Ave NE',
        soldPrice: '$695,000',
        soldDate: '2026-04-15',
        squareFeet: '2,840',
        notes: S.compNotes,
        source: S.compSource,
        fieldConfidence: { address: 'high', soldPrice: 'medium' },
      },
    ],
    pitchPoints: [
      {
        id: 'pp_private',
        title: S.privatePitchTitle,
        support: S.privatePitchSupport,
        visibility: 'private',
      },
      {
        id: 'pp_public',
        title: S.publicPitchTitle,
        support: '',
        visibility: 'public',
      },
    ],
    preAppointmentNotes: S.preAppointmentNotes,
    commitments: [S.commitment],
    asks: [S.ask],
    preparedFor: 'the Halloran family',
  };
}

const FIXTURE_AGENT: AgentBranding = {
  name: 'Aaron Test',
  brokerage: 'Test Realty',
  phone: '2532028825',
  email: 'aaron@example.com',
  licenseNumber: 'WA-12345',
};

/**
 * Recursively render any React element tree (including arbitrarily
 * nested function components) into a single text-content string. The
 * react-pdf primitives <Document>, <Page>, <Text>, <View>, etc. are
 * just opaque host components from React's perspective — their string
 * children are what carry user-facing content. Calling a function
 * component with its props evaluates it and yields a tree we can walk.
 *
 * No react-pdf runtime is touched here, which is why this spec is
 * resilient to the Playwright/react-pdf reconciler issue described in
 * the module-level comment.
 */
function reactTreeToText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(reactTreeToText).join(' ');
  }
  if (typeof node === 'object' && 'props' in (node as object)) {
    const el = node as React.ReactElement<{ children?: unknown }>;
    const type = el.type;
    // Function component — invoke it to obtain its rendered tree.
    if (typeof type === 'function') {
      const rendered = (type as (props: unknown) => unknown)(el.props);
      return reactTreeToText(rendered);
    }
    // Host component (react-pdf primitive) — recurse into children.
    return reactTreeToText(el.props?.children);
  }
  return '';
}

test.describe('seller-presentation prep PDF (A7e)', () => {
  test('the rendered tree surfaces every private sentinel', () => {
    const draft = buildDraft();
    const tree = React.createElement(SellerPresentationPrepPdf, {
      draft,
      agentContact: FIXTURE_AGENT,
    });
    const text = reactTreeToText(tree);

    for (const sentinel of [
      S.preAppointmentNotes,
      S.commitment,
      S.ask,
      S.privatePitchTitle,
      S.privatePitchSupport,
      S.compNotes,
      S.compSource,
      S.rationale,
    ]) {
      expect(
        text.includes(sentinel),
        `rendered tree missing private sentinel "${sentinel}"`,
      ).toBe(true);
    }
  });

  test('the rendered tree also surfaces the public reference content', () => {
    const draft = buildDraft();
    const tree = React.createElement(SellerPresentationPrepPdf, {
      draft,
      agentContact: FIXTURE_AGENT,
    });
    const text = reactTreeToText(tree);

    // Public sanity — address, price, and public-pitch title belong on
    // BOTH surfaces (the seller page and the prep PDF).
    expect(text).toContain(S.propertyAddress);
    expect(text).toContain(S.recommendedPrice);
    expect(text).toContain(S.publicPitchTitle);
    // Agent identity flows through agentContact into the header.
    expect(text).toContain('Aaron Test');
    // The named pricing-strategy framework resolves from the catalog
    // (not just the opaque id).
    expect(text).toContain('Strategic Pricing for Quick Sale');
    expect(text).toContain('High confidence');
  });

  test('the SAME draft, run through toPublicPayload, drops every private sentinel (allowlist boundary holds)', () => {
    // The prep PDF reads private content directly off the draft (it
    // never calls toPublicPayload). This assertion locks in the
    // companion direction: a draft that legitimately contains private
    // sentinels (so the PDF can surface them) STILL emits a public
    // payload free of those sentinels. The publish-allowlist spec
    // covers this in more depth across the full sentinel set; here we
    // tie it directly to the A7e prep-PDF surface.
    const draft = buildDraft();
    const payload = toPublicPayload(draft, FIXTURE_AGENT);
    const serialized = JSON.stringify(payload);

    for (const sentinel of [
      S.preAppointmentNotes,
      S.commitment,
      S.ask,
      S.privatePitchTitle,
      S.privatePitchSupport,
      S.compNotes,
      S.compSource,
    ]) {
      expect(
        serialized.includes(sentinel),
        `public payload leaked private sentinel "${sentinel}"`,
      ).toBe(false);
    }

    // Public sentinels DO survive (sanity).
    expect(serialized).toContain(S.propertyAddress);
    expect(serialized).toContain(S.recommendedPrice);
    expect(serialized).toContain(S.publicPitchTitle);
  });

  test('renders cleanly when the draft has no private content', () => {
    // A minimal draft: only required fields, no private pitch points /
    // notes / commitments. The component must evaluate without error
    // and produce a non-empty tree (no crash on empty arrays / missing
    // optional blocks).
    const minimal: SellerPresentationDraft = {
      propertyAddress: 'Minimal Address',
      recommendedPrice: '$500,000',
      comps: [{ address: 'Min Comp', soldPrice: '$490,000' }],
      pitchPoints: [],
      commitments: [],
      asks: [],
    };
    const tree = React.createElement(SellerPresentationPrepPdf, {
      draft: minimal,
    });
    const text = reactTreeToText(tree);
    expect(text).toContain('Minimal Address');
    expect(text).toContain('$500,000');
    expect(text).toContain('Min Comp');
  });
});
