"use client";

import { Component, type ReactNode } from "react";

/**
 * Step-level React error boundary used by the wizard shells
 * (currently Seller Presentation; portable to SIR / OH Prep when their
 * shells adopt the same pattern).
 *
 * Why a class component: React doesn't expose a hooks-based error
 * boundary. `getDerivedStateFromError` + `componentDidCatch` are the
 * supported surface for catching render errors in a subtree.
 *
 * Why scope to the STEP (not the whole page): a thrown field in one
 * step must not freeze the surrounding wizard nav (Next / Previous /
 * Dashboard / Start new). A page-level `error.tsx` replaces the
 * entire route — too coarse. A step-level boundary degrades only the
 * step body and keeps the rest of the wizard interactive so the
 * agent can navigate away without reloading.
 *
 * Lineage: introduced by v1.47 / A7c.4.1 in response to Dallen's
 * phone smoke — a blank second comp was crashing the comps step
 * render, and because nothing caught the throw, React halted event
 * delegation for the whole page and every button went dead. With
 * this boundary, even an unforeseen future field crash would
 * surface the fallback inline while leaving the nav clickable.
 *
 * Error handlers don't catch async errors or errors thrown inside
 * event handlers — those are React's documented limits and they
 * don't apply here (the freeze pattern is a render crash).
 */

interface StepErrorBoundaryProps {
  /** The step body. */
  children: ReactNode;
  /**
   * Stable key per active step. Resetting it (e.g., the wizard's
   * currentStep string) clears the error state when the agent
   * navigates away from a broken step so they can re-enter cleanly
   * after a code fix or storage clear.
   */
  resetKey?: string;
  /**
   * Display label for the fallback ("Comparable sales", "Pricing &
   * strategy"…). Falls back to a generic "this step" when omitted.
   */
  stepLabel?: string;
}

interface StepErrorBoundaryState {
  error: Error | null;
}

export class StepErrorBoundary extends Component<
  StepErrorBoundaryProps,
  StepErrorBoundaryState
> {
  state: StepErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): StepErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Surface the throw to the browser console so a developer
    // tailing devtools sees the same trace they'd get without the
    // boundary. Intentionally not wired to an analytics sink — the
    // surrounding skill system has no reporter yet (substrate
    // observability story is deferred).
    // eslint-disable-next-line no-console
    console.error(
      "[StepErrorBoundary] step render threw — falling back",
      error,
      info?.componentStack,
    );
  }

  componentDidUpdate(prev: StepErrorBoundaryProps) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      const label = this.props.stepLabel ?? "this step";
      return (
        <div
          className="rounded border border-red-700/40 bg-red-950/20 p-4 text-sm text-red-200"
          data-testid="step-error-boundary"
          role="alert"
        >
          <p className="font-medium">Something went wrong loading {label}.</p>
          <p className="mt-2 text-red-300/80">
            Use the wizard navigation below to step away and back, or refresh
            the page. Your draft is auto-saved.
          </p>
          <details className="mt-3 text-xs text-red-300/60">
            <summary className="cursor-pointer">Technical details</summary>
            <pre className="mt-1 overflow-auto whitespace-pre-wrap break-words">
              {this.state.error.message || String(this.state.error)}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
