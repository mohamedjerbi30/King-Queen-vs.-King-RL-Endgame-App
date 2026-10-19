import { useEffect, useState } from "react";
import { api, API_ORIGIN } from "../api.js";
import { useServerInfo } from "../lib/server.js";

/**
 * Footer that shows exactly which backend this page talks to and its state,
 * so anyone can check that the hosted site uses the intended server.
 */
export default function BackendStatus() {
  const server = useServerInfo();
  const [dp, setDp] = useState(null);

  useEffect(() => {
    if (!server?.reachable) return;
    api.dpStatus().then((s) => setDp(s.status)).catch(() => setDp(null));
  }, [server?.reachable]);

  const origin = API_ORIGIN || window.location.origin;
  const host = new URL(origin).host;
  const state = !server ? "checking" : server.reachable ? "connected" : server.waking ? "waking" : "unreachable";
  const mode = !server?.reachable ? null
    : server.serverless ? "serverless (limited)"
    : server.lowMemory ? "low-memory (training in browser)"
    : "full";

  return (
    <footer className="backend-status" data-tour="backend-status">
      <span className="live-label">
        <i className={`live-dot live-${state === "connected" ? "live" : state === "waking" ? "polling" : state === "checking" ? "" : "offline"}`} />
        Backend <strong>{host}</strong>{!API_ORIGIN && " (same origin)"} · {state}
      </span>
      {mode && <span>mode: {mode}</span>}
      {server?.reachable && <span>exact DP: {dp ?? "…"}</span>}
      {server?.instance && <span>instance {server.instance}</span>}
      <a href={`${origin}/api/health`} target="_blank" rel="noreferrer">open /api/health ↗</a>
    </footer>
  );
}
