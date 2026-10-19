// The user's own results, kept in localStorage so the Results page can show
// what happened in *this* browser session history (games played, agents trained).
import { readStored, usePersistentState, writeStored } from "./storage.js";

const GAMES = "results.games";
const RUNS = "results.runs";
const MAX_GAMES = 300;

/** Called by Play when a game ends. who: "you" | "dp" | "mc". */
export function recordGame({ who, outcome, moves, ret }) {
  const games = readStored(GAMES, []);
  writeStored(GAMES, [...games, { who, outcome, moves, ret, at: Date.now() }].slice(-MAX_GAMES));
}

/** Called by Live Training whenever a run gets an exact test result. */
export function recordRun(job, evaluation) {
  const runs = readStored(RUNS, {});
  writeStored(RUNS, {
    ...runs,
    [job.job_id]: { job_id: job.job_id, params: job.params, started_at: job.started_at, evaluation },
  });
}

export function useGameHistory() {
  return usePersistentState(GAMES, []);
}

export function useRunHistory() {
  return usePersistentState(RUNS, {});
}
