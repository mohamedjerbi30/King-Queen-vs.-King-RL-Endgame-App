// Backend location. Empty = same origin (local dev via the Vite proxy, or the
// Flask server serving the built app). For a frontend hosted separately (e.g.
// Vercel) set VITE_API_BASE to the backend URL, e.g. https://kqk-api.onrender.com
const API_ORIGIN = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
const BASE = `${API_ORIGIN}/api`;

/** ws:// or wss:// URL of a backend WebSocket path such as "/ws/jobs". */
export function wsUrl(path) {
  const origin = API_ORIGIN || window.location.origin;
  return `${origin.replace(/^http/, "ws")}/api${path}`;
}

async function req(path, opts) {
  const res = await fetch(BASE + path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  health: () => req("/health"),
  constants: () => req("/constants"),

  newGame: (budget = 40, seed) =>
    req(`/new_game?budget=${budget}${seed !== undefined ? `&seed=${seed}` : ""}`),
  legalMoves: (wk, wq, bk) => req(`/legal_moves?wk=${wk}&wq=${wq}&bk=${bk}`),
  step: (position, piece, dest, seed) =>
    req("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...position, piece, dest, seed }),
    }),
  agentMove: (wk, wq, bk, movesLeft, source = "dp", jobId) =>
    req(
      `/agent_move?wk=${wk}&wq=${wq}&bk=${bk}&moves_left=${movesLeft}&source=${source}` +
        (jobId ? `&job_id=${jobId}` : "")
    ),

  dpStatus: () => req("/dp/status"),
  dpSolve: (budget = 40) =>
    req("/dp/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budget }),
    }),
  dpQuery: (wk, wq, bk, movesLeft) =>
    req(`/dp/query?wk=${wk}&wq=${wq}&bk=${bk}&moves_left=${movesLeft}`),

  trainStart: (params) =>
    req("/train/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),
  trainStatus: (jobId) => req(`/train/status/${jobId}`),
  trainStop: (jobId) => req(`/train/stop/${jobId}`, { method: "POST" }),
  trainQtable: (jobId, wk, wq, bk) =>
    req(`/train/qtable/${jobId}?wk=${wk}&wq=${wq}&bk=${bk}`),
  trainJobs: () => req("/train/jobs"),
  trainEvaluate: (jobId) => req(`/train/evaluate/${jobId}`, { method: "POST" }),

  results: () => req("/results"),
  baselines: () => req("/baselines"),
  baselinesVerify: () => req("/baselines/verify", { method: "POST" }),
};
