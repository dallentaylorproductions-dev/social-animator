import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline — Studio SEP",
};

/**
 * Offline fallback. Precached by the service worker and shown ONLY when a
 * document navigation fails with no network (see the `fallbacks` config in
 * src/app/sw.ts). Intentionally static and dependency-free so it survives
 * with zero network. Public route — not in the middleware matcher — so it
 * renders pre-auth too.
 */
export default function Offline() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        background: "#0a0a0a",
        color: "#ededed",
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: "#5BF5C9",
          boxShadow: "0 0 12px #5BF5C9",
        }}
      />
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>You&rsquo;re offline</h1>
      <p style={{ margin: 0, color: "#a3a3a3", maxWidth: 360, lineHeight: 1.5 }}>
        Studio SEP needs a connection for this page. Reconnect and it&rsquo;ll
        pick up right where you left off.
      </p>
    </main>
  );
}
