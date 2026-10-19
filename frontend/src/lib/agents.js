// One list of trained Monte Carlo agents, wherever they were trained:
//   "b:<id>"  trained in this browser (Web Worker, saved in IndexedDB)
//   "s:<id>"  trained on a long-running backend (only when one is available)
// Pages ask for moves / values through this module and don't care which.
import { api } from "../api.js";
import { useBrowserAgents, browserAgentMove, browserQValues } from "./browserAgents.js";
import { useLiveJobs } from "./live.js";
import { useServerInfo } from "./server.js";
import { METHODS } from "./engine.js";

export function parseAgentId(sel) {
  if (!sel) return null;
  if (sel.startsWith("b:")) return { kind: "browser", id: sel.slice(2) };
  if (sel.startsWith("s:")) return { kind: "server", id: sel.slice(2) };
  return { kind: "server", id: sel }; // ids saved before agents had a prefix
}

const STATUS = { running: "training…", done: "done", stopped: "stopped", error: "error" };

/** Selectable agents, newest first: [{ value, label, kind, ready }]. */
export function useAgentOptions() {
  const { agents, loaded: bLoaded, live } = useBrowserAgents();
  const server = useServerInfo();
  const serverUsable = !!server?.reachable && !!server.serverTraining;
  const { jobs, loaded: sLoaded, transport } = useLiveJobs();

  const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : `${Math.round(n / 1000)}k`);
  const browser = agents.map((a) => {
    const l = live[a.id];
    return {
      value: `b:${a.id}`,
      kind: "browser",
      ready: !!(l?.has_qtable || a.has_qtable),
      started: a.started_at,
      label: `${METHODS[a.params.method] || a.params.method} · ${fmt((l || a).decisions_done)} decisions · ${STATUS[(l || a).status] || a.status}`,
    };
  });
  const remote = serverUsable
    ? jobs.map((j) => ({
        value: `s:${j.job_id}`,
        kind: "server",
        ready: true,
        started: j.started_at,
        label: `${METHODS[j.method] || "server"} · server · ${fmt(j.decisions_done ?? 0)} decisions · ${STATUS[j.status] || j.status}`,
      }))
    : [];
  const options = [...browser, ...remote].sort((a, b) => b.started - a.started);
  return { options, loaded: bLoaded && (sLoaded || !serverUsable), transport: serverUsable ? transport : "browser" };
}

/** Greedy move of the selected agent; the remaining budget h is part of the state. */
export function agentMove(sel, pos) {
  const a = parseAgentId(sel);
  if (a.kind === "browser") return browserAgentMove(a.id, pos.wk, pos.wq, pos.bk, pos.moves_left);
  return api.agentMove(pos.wk, pos.wq, pos.bk, pos.moves_left, "mc", a.id);
}

/** Learned value of every legal move at remaining budget h. */
export function agentQValues(sel, wk, wq, bk, h) {
  const a = parseAgentId(sel);
  if (a.kind === "browser") return browserQValues(a.id, wk, wq, bk, h);
  return api.trainQtable(a.id, wk, wq, bk, h);
}
