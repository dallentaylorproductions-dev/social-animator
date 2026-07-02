"use client";

/**
 * Buyer Tour Brief — agent-facing manual-input builder (BUYER_TOUR_BRIEF, v0).
 *
 * The agent enters everything by hand: buyer name, tour date, an optional meeting
 * point, a single commute anchor, an authored note, and 3–6 ordered homes (address
 * + specs + photo + the one-line "why it's on the list" + one-line "watch for").
 * Proximity is auto-derived ("Pull proximity") then AGENT-EDITABLE; a re-pull never
 * clobbers an edited chip (mergeEnrichedProximity). Publish projects through the
 * allow-list serializer (server) and returns a canonical /tour/<slug> link.
 *
 * No MLS, no scraping, no listing import, no AI generation — manual input only (v0).
 * Photos go through the shared Blob upload field (hosted URL, never base64).
 */

import { useCallback, useRef, useState } from "react";
import { ImageUploadField } from "@/components/ImageUploadField";
import { loadBrandSettings } from "@/lib/brand";
import { tourPageUrl } from "@/lib/public-url";
import {
  EMPTY_BUYER_TOUR_DRAFT,
  MAX_HOMES,
  MIN_HOMES,
  PROXIMITY_CATEGORIES,
  type BuyerTourAgent,
  type BuyerTourDraft,
  type Home,
  type ProximityCategory,
  type ProximityChip,
} from "../engine/types";
import { mergeEnrichedProximity } from "../engine/proximity-merge";
import { LAYER_LABELS } from "../output/copy";
import { EngagementReadout } from "./EngagementReadout";

let homeSeq = 0;
function newHome(): Home {
  homeSeq += 1;
  return {
    id: `h${homeSeq}-${Date.now().toString(36)}`,
    address: "",
    whyOnList: "",
    watchFor: "",
    proximity: [],
  };
}

function agentFromBrand(): BuyerTourAgent {
  const b = loadBrandSettings();
  return {
    name: b.agentName || undefined,
    brokerage: b.brokerage || undefined,
    phone: b.contactPhone || undefined,
    email: b.contactEmail || undefined,
    photoUrl: b.agentPhotoUrl || undefined,
    schedulingUrl: b.schedulingUrl || undefined,
  };
}

const field =
  "w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm text-neutral-100 focus:outline-none focus:border-teal-400";
const labelCls =
  "block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-1.5";

export interface BuyerTourBuilderProps {
  /**
   * Whether the GreatSchools "School context" toggle is offered (GREATSCHOOLS_ENABLED,
   * resolved SERVER-SIDE in the /buyer-tour route and passed down). Default false so the
   * toggle stays dark when the flag is off; the client never reads the server-only flag
   * itself. This only decides whether the AUTHORING control renders; the live school
   * fetch happens at render on /tour/[slug], never here.
   */
  schoolLayerAvailable?: boolean;
  /**
   * Whether the per-tour engagement readout is offered (BUYER_TOUR_ANALYTICS, resolved
   * SERVER-SIDE in the /buyer-tour route and passed down). Default false so the readout
   * stays dark when the flag is off; the client never reads the server-only flag itself.
   * When true, a calm "How your buyer engaged" block appears once the tour is published.
   */
  analyticsAvailable?: boolean;
}

export function BuyerTourBuilder({
  schoolLayerAvailable = false,
  analyticsAvailable = false,
}: BuyerTourBuilderProps = {}) {
  const [draft, setDraft] = useState<BuyerTourDraft>(() => ({
    ...EMPTY_BUYER_TOUR_DRAFT,
    // Priority defaults pre-checked (often zero clicks); agent can toggle.
    priorities: ["schools", "commute", "parks"],
    homes: [newHome(), newHome(), newHome()],
  }));
  const [copied, setCopied] = useState(false);
  const [anchorLabel, setAnchorLabel] = useState("");
  const [anchorAddress, setAnchorAddress] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pullNote, setPullNote] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const slugRef = useRef<string | null>(null);

  const patch = useCallback((p: Partial<BuyerTourDraft>) => {
    setDraft((d) => ({ ...d, ...p }));
  }, []);

  const patchHome = useCallback((id: string, p: Partial<Home>) => {
    setDraft((d) => ({
      ...d,
      homes: d.homes.map((h) => (h.id === id ? { ...h, ...p } : h)),
    }));
  }, []);

  const addHome = () =>
    setDraft((d) =>
      d.homes.length >= MAX_HOMES ? d : { ...d, homes: [...d.homes, newHome()] },
    );

  const removeHome = (id: string) =>
    setDraft((d) => ({ ...d, homes: d.homes.filter((h) => h.id !== id) }));

  const moveHome = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const i = d.homes.findIndex((h) => h.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.homes.length) return d;
      const homes = [...d.homes];
      [homes[i], homes[j]] = [homes[j], homes[i]];
      return { ...d, homes };
    });

  const toggleLayer = (cat: ProximityCategory) =>
    setDraft((d) => ({
      ...d,
      priorities: d.priorities.includes(cat)
        ? d.priorities.filter((c) => c !== cat)
        : [...d.priorities, cat],
    }));

  const setChip = (homeId: string, idx: number, p: Partial<ProximityChip>) =>
    setDraft((d) => ({
      ...d,
      homes: d.homes.map((h) =>
        h.id === homeId
          ? {
              ...h,
              proximity: h.proximity.map((c, i) =>
                i === idx ? { ...c, ...p, editedByAgent: true } : c,
              ),
            }
          : h,
      ),
    }));

  const addChip = (homeId: string, category: ProximityCategory) =>
    setDraft((d) => ({
      ...d,
      homes: d.homes.map((h) =>
        h.id === homeId
          ? {
              ...h,
              proximity: [
                ...h.proximity,
                { category, label: "", value: "", editedByAgent: true },
              ],
            }
          : h,
      ),
    }));

  const removeChip = (homeId: string, idx: number) =>
    setDraft((d) => ({
      ...d,
      homes: d.homes.map((h) =>
        h.id === homeId
          ? { ...h, proximity: h.proximity.filter((_, i) => i !== idx) }
          : h,
      ),
    }));

  /** Pull factual proximity from the server (key-missing → manual fallback). */
  const pullProximity = async () => {
    setPulling(true);
    setPullNote(null);
    setError(null);
    try {
      const res = await fetch("/api/buyer-tour/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homes: draft.homes
            .filter((h) => h.address.trim())
            .map((h) => ({ id: h.id, address: h.address })),
          commuteAnchor: { label: anchorLabel, address: anchorAddress },
          categories: draft.priorities,
        }),
      });
      const json = (await res.json()) as
        | {
            ok: true;
            homes: Array<{
              id: string;
              lat?: number;
              lng?: number;
              chips: ProximityChip[];
            }>;
            anchor?: { lat: number; lng: number };
          }
        | { ok: false; code: string; message: string };

      if (!json.ok) {
        // key-missing / invalid-input → keep manual entry; surface the message.
        setPullNote(json.message);
        return;
      }

      setDraft((d) => {
        const byId = new Map(json.homes.map((h) => [h.id, h]));
        return {
          ...d,
          commuteAnchor:
            anchorLabel || anchorAddress
              ? {
                  label: anchorLabel,
                  address: anchorAddress,
                  ...(json.anchor
                    ? { lat: json.anchor.lat, lng: json.anchor.lng }
                    : {}),
                }
              : d.commuteAnchor,
          homes: d.homes.map((h) => {
            const got = byId.get(h.id);
            if (!got) return h;
            return {
              ...h,
              ...(got.lat !== undefined && got.lng !== undefined
                ? { lat: got.lat, lng: got.lng }
                : {}),
              // Merge so any chip the agent already edited survives the pull.
              proximity: mergeEnrichedProximity(h.proximity, got.chips),
            };
          }),
        };
      });
      setPullNote("Pulled the latest. Edited chips were kept.");
    } catch {
      setPullNote("Couldn't reach the proximity service. Add layers by hand.");
    } finally {
      setPulling(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const outgoing: BuyerTourDraft = {
        ...draft,
        commuteAnchor:
          anchorLabel || anchorAddress
            ? {
                label: anchorLabel,
                address: anchorAddress,
                ...(draft.commuteAnchor?.lat !== undefined &&
                draft.commuteAnchor?.lng !== undefined
                  ? {
                      lat: draft.commuteAnchor.lat,
                      lng: draft.commuteAnchor.lng,
                    }
                  : {}),
              }
            : undefined,
      };
      const res = await fetch("/api/buyer-tour/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: outgoing,
          agentContact: agentFromBrand(),
          // Agent-constant brand accent from Studio Profile (owns the tour thread).
          brandAccent: loadBrandSettings().brandAccent,
          slug: slugRef.current ?? undefined,
        }),
      });
      const json = (await res.json()) as
        | { ok: true; slug: string }
        | { ok: false; error: string };
      if (!json.ok) {
        setError(json.error);
        return;
      }
      slugRef.current = json.slug;
      setPublishedSlug(json.slug);
    } catch {
      setError("Could not publish. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  const enoughHomes = draft.homes.filter((h) => h.address.trim()).length;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Buyer Tour Brief</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Build a prepared, narrated showing-day page for one buyer. Manual input
          only. Proximity is pulled from Google and stays editable.
        </p>

        {/* ---- The day ---- */}
        <section className="mt-8 space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            The day
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="btb-buyer">
                Buyer name
              </label>
              <input
                id="btb-buyer"
                className={field}
                value={draft.buyerName}
                onChange={(e) => patch({ buyerName: e.target.value })}
                data-testid="btb-input-buyer"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="btb-date">
                Tour date
              </label>
              <input
                id="btb-date"
                className={field}
                placeholder="Saturday, July 12"
                value={draft.tourDate}
                onChange={(e) => patch({ tourDate: e.target.value })}
                data-testid="btb-input-date"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="btb-start">
                Start time (optional)
              </label>
              <input
                id="btb-start"
                className={field}
                placeholder="9:30 AM"
                value={draft.startTime ?? ""}
                onChange={(e) => patch({ startTime: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="btb-length">
                Length (optional)
              </label>
              <input
                id="btb-length"
                className={field}
                placeholder="About 2.5 hrs (auto if blank)"
                value={draft.length ?? ""}
                onChange={(e) => patch({ length: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="btb-meet">
                Meeting point (optional)
              </label>
              <input
                id="btb-meet"
                className={field}
                value={draft.meetingPoint ?? ""}
                onChange={(e) => patch({ meetingPoint: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="btb-buyer-priorities">
              Planned around (what your buyer cares about)
            </label>
            <input
              id="btb-buyer-priorities"
              className={field}
              placeholder="Short commute, Home office, Parks & coffee"
              value={draft.buyerPriorities.join(", ")}
              onChange={(e) =>
                patch({
                  buyerPriorities: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
            <p className="mt-1 text-[11px] text-neutral-500">
              Comma separated. These are the buyer&apos;s priorities, separate from
              the factual map layers below.
            </p>
          </div>
          <div>
            <label className={labelCls} htmlFor="btb-note">
              A note to your buyer (optional)
            </label>
            <textarea
              id="btb-note"
              className={`${field} min-h-[72px]`}
              value={draft.agentNote ?? ""}
              onChange={(e) => patch({ agentNote: e.target.value })}
            />
          </div>
        </section>

        {/* ---- Commute anchor + layers ---- */}
        <section className="mt-6 space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Proximity layers
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="btb-anchor-label">
                Commute anchor label
              </label>
              <input
                id="btb-anchor-label"
                className={field}
                placeholder="Work, gate, campus, airport…"
                value={anchorLabel}
                onChange={(e) => setAnchorLabel(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="btb-anchor-addr">
                Commute anchor address
              </label>
              <input
                id="btb-anchor-addr"
                className={field}
                placeholder="Street, City, ST"
                value={anchorAddress}
                onChange={(e) => setAnchorAddress(e.target.value)}
              />
            </div>
          </div>
          <div>
            <p className={labelCls}>Layers to show</p>
            <div className="flex flex-wrap gap-2">
              {PROXIMITY_CATEGORIES.map((cat) => {
                const on = draft.priorities.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleLayer(cat)}
                    className={`min-h-[40px] rounded-full border px-4 text-sm ${
                      on
                        ? "border-teal-400/70 bg-teal-400/15 text-teal-100"
                        : "border-neutral-700 bg-neutral-900 text-neutral-400"
                    }`}
                  >
                    {LAYER_LABELS[cat]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={pullProximity}
              disabled={pulling || enoughHomes === 0}
              className="rounded-md border border-teal-400/60 bg-teal-400/10 px-4 py-2 text-sm font-medium text-teal-100 disabled:opacity-50"
              data-testid="btb-pull"
            >
              {pulling ? "Pulling…" : "Pull proximity"}
            </button>
            {pullNote && (
              <span className="text-xs text-neutral-400">{pullNote}</span>
            )}
          </div>
        </section>

        {/* ---- School context (GREATSCHOOLS_ENABLED, dark when off) ---- */}
        {schoolLayerAvailable && (
          <section
            className="mt-6 space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5"
            data-testid="btb-school-context"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              School context
            </h2>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <label
                  htmlFor="btb-school-layer"
                  className="block text-sm font-medium text-neutral-100"
                >
                  Show nearby school-ratings
                </label>
                <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
                  Adds a GreatSchools school-ratings section to this tour, the
                  nearest school for each home, shown the same way for every home.
                  Sourced from GreatSchools, not your or Studio&apos;s opinion.
                </p>
                <p className="mt-1 text-[11px] text-neutral-600">
                  The section appears once the tour is published.
                </p>
              </div>
              <button
                id="btb-school-layer"
                type="button"
                role="switch"
                aria-checked={draft.schoolLayer === true}
                onClick={() => patch({ schoolLayer: !draft.schoolLayer })}
                data-testid="btb-school-layer-toggle"
                className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                  draft.schoolLayer === true
                    ? "border-teal-400/70 bg-teal-400/30"
                    : "border-neutral-700 bg-neutral-800"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-neutral-100 transition-transform ${
                    draft.schoolLayer === true
                      ? "translate-x-5"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </section>
        )}

        {/* ---- Homes ---- */}
        <section className="mt-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              Homes ({draft.homes.length})
            </h2>
            <button
              type="button"
              onClick={addHome}
              disabled={draft.homes.length >= MAX_HOMES}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 disabled:opacity-50"
            >
              + Add home
            </button>
          </div>

          {draft.homes.map((home, i) => (
            <div
              key={home.id}
              className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5"
              data-testid={`btb-home-editor-${i + 1}`}
            >
              <div className="flex items-center justify-between">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-400 text-sm font-bold text-neutral-950">
                  {i + 1}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => moveHome(home.id, -1)}
                    disabled={i === 0}
                    className="rounded border border-neutral-700 px-2 py-1 text-xs disabled:opacity-40"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveHome(home.id, 1)}
                    disabled={i === draft.homes.length - 1}
                    className="rounded border border-neutral-700 px-2 py-1 text-xs disabled:opacity-40"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeHome(home.id)}
                    disabled={draft.homes.length <= MIN_HOMES}
                    className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:text-red-400 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div>
                <label className={labelCls}>Address</label>
                <input
                  className={field}
                  value={home.address}
                  onChange={(e) => patchHome(home.id, { address: e.target.value })}
                  data-testid={`btb-home-${i + 1}-address`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(["price", "beds", "baths", "sqft"] as const).map((k) => (
                  <div key={k}>
                    <label className={labelCls}>{k}</label>
                    <input
                      type="number"
                      min={0}
                      className={field}
                      value={home[k] ?? ""}
                      onChange={(e) =>
                        patchHome(home.id, {
                          [k]:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        } as Partial<Home>)
                      }
                    />
                  </div>
                ))}
              </div>

              <ImageUploadField
                label="Home photo"
                value={home.photoUrl ?? ""}
                onChange={(url) =>
                  patchHome(home.id, { photoUrl: url || undefined })
                }
                folder="buyer-tour"
                previewAspect="aspect-[4/3]"
                testIdPrefix={`btb-home-${i + 1}-photo`}
                emptyTitle="Add a photo of this home"
                emptySubtext="From your camera roll, or paste a link"
              />

              <div>
                <label className={labelCls}>Why it&apos;s on the list</label>
                <textarea
                  className={`${field} min-h-[60px]`}
                  placeholder="Single level like you wanted, and the kitchen was redone last year."
                  value={home.whyOnList}
                  onChange={(e) =>
                    patchHome(home.id, { whyOnList: e.target.value })
                  }
                  data-testid={`btb-home-${i + 1}-why`}
                />
              </div>
              <div>
                <label className={labelCls}>What to watch for</label>
                <textarea
                  className={`${field} min-h-[60px]`}
                  placeholder="The driveway is steep. Check how the garage feels backing out."
                  value={home.watchFor}
                  onChange={(e) =>
                    patchHome(home.id, { watchFor: e.target.value })
                  }
                />
              </div>

              {/* Proximity chips — auto-pulled, agent-editable */}
              <div>
                <label className={labelCls}>Proximity (factual)</label>
                <div className="space-y-2">
                  {home.proximity.map((chip, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2">
                      <select
                        className={`${field} max-w-[10rem]`}
                        value={chip.category}
                        onChange={(e) =>
                          setChip(home.id, idx, {
                            category: e.target.value as ProximityCategory,
                          })
                        }
                      >
                        {PROXIMITY_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {LAYER_LABELS[c]}
                          </option>
                        ))}
                      </select>
                      <input
                        className={`${field} flex-1 min-w-[8rem]`}
                        placeholder="Place / label"
                        value={chip.label}
                        onChange={(e) =>
                          setChip(home.id, idx, { label: e.target.value })
                        }
                      />
                      <input
                        className={`${field} max-w-[7rem]`}
                        placeholder="0.4 mi"
                        value={chip.value}
                        onChange={(e) =>
                          setChip(home.id, idx, { value: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => removeChip(home.id, idx)}
                        className="px-2 text-xs text-neutral-500 hover:text-red-400"
                        aria-label="Remove chip"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addChip(home.id, draft.priorities[0] ?? "commute")}
                    className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300"
                  >
                    + Add chip
                  </button>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* ---- Publish ---- */}
        <section className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
          <button
            type="button"
            onClick={publish}
            disabled={publishing}
            className="rounded-md bg-teal-400 px-5 py-2.5 text-sm font-semibold text-neutral-950 disabled:opacity-50"
            data-testid="btb-publish"
          >
            {publishing
              ? "Publishing…"
              : publishedSlug
                ? "Update live page"
                : "Publish tour"}
          </button>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          {publishedSlug && (
            <div className="mt-4 rounded-md border border-teal-400/40 bg-teal-400/5 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-400">
                Live tour link
              </p>
              <a
                href={`/tour/${publishedSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block break-all text-sm font-medium text-teal-200"
                data-testid="btb-live-link"
              >
                {tourPageUrl(publishedSlug)}
              </a>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      tourPageUrl(publishedSlug),
                    );
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    /* clipboard blocked — the link above is selectable */
                  }
                }}
                className="mt-3 rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
                data-testid="btb-copy-link"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          )}
          {analyticsAvailable && publishedSlug && (
            <EngagementReadout slug={publishedSlug} />
          )}
        </section>
      </div>
    </main>
  );
}
