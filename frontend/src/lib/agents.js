// One list of trained Monte Carlo agents, wherever they were trained:
//   "b:<id>"  trained in this browser (Web Worker, saved in IndexedDB)
//   "s:<id>"  trained on a long-running backend (only when one is available)
// Pages ask for moves / values through this module and don't care which.
import { api } from "../api.js";
import { useBrowserAgents, browserAgentMove, browserQValues } from "./browserAgents.js";
import { useLiveJobs } from "./live.js";
import { useServerInfo } from "./server.js";

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
  const serverUsable = !!server?.reachable && !server.serverless;
  const { jobs, loaded: sLoaded, transport } = useLiveJobs();

  const browser = agents.map((a) => {
    const l = live[a.id];
    const episodes = (l || a).episodes_done;
    return {
      value: `b:${a.id}`,
      kind: "browser",
      ready: !!(l?.has_qtable || a.has_qtable),
      started: a.started_at,
      label: `${a.id.slice(1, 7)} · browser · ${episodes.toLocaleString()} ep · ${STATUS[(l || a).status] || a.status}`,
    };
  });
  const remote = serverUsable
    ? jobs.map((j) => ({
        value: `s:${j.job_id}`,
        kind: "server",
        ready: true,
        started: j.started_at,
        label: `${j.job_id.slice(0, 6)} · server · ${j.episodes_done.toLocaleString()} ep · ${STATUS[j.status] || j.status}`,
      }))
    : [];
  const options = [...browser, ...remote].sort((a, b) => b.started - a.started);
  return { options, loaded: bLoaded && (sLoaded || !serverUsable), transport: serverUsable ? transport : "browser" };
}

export function agentMove(sel, pos) {
  const a = parseAgentId(sel);
  if (a.kind === "browser") return browserAgentMove(a.id, pos.wk, pos.wq, pos.bk);
  return api.agentMove(pos.wk, pos.wq, pos.bk, pos.moves_left, "mc", a.id);
}

export function agentQValues(sel, wk, wq, bk) {
  const a = parseAgentId(sel);
  if (a.kind === "browser") return browserQValues(a.id, wk, wq, bk);
  return api.trainQtable(a.id, wk, wq, bk);
}
