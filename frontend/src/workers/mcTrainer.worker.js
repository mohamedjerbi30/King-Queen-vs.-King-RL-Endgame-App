// Trains one tabular agent (MC mean / MC constant / SARSA / Expected SARSA /
// Q-learning) off the main thread, with the report's protocol, and streams
// progress to the page (~10 messages/s). Sparse Q-table snapshots are sent at
// 10%, 50% and the end of the run so the page can save the agent (IndexedDB).
import { epsilonAt, newAgent, randomStart, rng, sampledTest, sparseSnapshot, trainEpisode } from "../lib/engine.js";

const WINDOW = 500;          // moving window of training episodes for the live curve
const TEST_GAMES = 5000;     // games per sampled test (h = 40 starts)
const N_TESTS = 10;          // tests spread over the run, plus one at the end
const SLICE_MS = 80;         // work between two progress messages

let stopRequested = false;

function postSnapshot(agent) {
  const s = sparseSnapshot(agent);
  self.postMessage({ type: "snapshot", decisions_done: agent.decisions, episodes_done: agent.episodes, ...s },
    [s.idx.buffer, s.q.buffer, s.visits.buffer]);
}

async function train({ params, seed }) {
  const { method, decisions, alpha, q0 } = params;
  const agent = newAgent({ method, alpha, q0 });
  const lookup = (k) => agent.Q[k];
  stopRequested = false;
  const rand = rng(seed);
  const startRand = rng(20240901); // the same test positions at every checkpoint
  const starts = Array.from({ length: TEST_GAMES }, () => randomStart(startRand));
  const pointEvery = Math.max(2000, Math.floor(decisions / 400));
  const testEvery = Math.max(1, Math.floor(decisions / N_TESTS));
  const snapshotsAt = [Math.floor(decisions * 0.1), Math.floor(decisions * 0.5)];
  const returns = new Float64Array(WINDOW), mates = new Uint8Array(WINDOW);
  let filled = 0, sumRet = 0, sumMate = 0, nextPoint = pointEvery, nextTest = testEvery;
  let curve = [], evals = [];

  while (agent.decisions < decisions && !stopRequested) {
    const sliceEnd = performance.now() + SLICE_MS;
    while (agent.decisions < decisions && performance.now() < sliceEnd) {
      const st = trainEpisode(agent, rand);
      const slot = agent.episodes % WINDOW;
      if (filled === WINDOW) { sumRet -= returns[slot]; sumMate -= mates[slot]; } else filled++;
      returns[slot] = st.ret;
      mates[slot] = st.outcome === "checkmate" ? 1 : 0;
      sumRet += returns[slot];
      sumMate += mates[slot];
      if (agent.decisions >= nextPoint) {
        curve.push({ episode: agent.decisions, mean_return: sumRet / filled, mate_rate: sumMate / filled, epsilon: epsilonAt(agent.decisions) });
        nextPoint += pointEvery;
      }
      if (agent.decisions >= nextTest && agent.decisions < decisions) {
        evals.push({ ...sampledTest(lookup, starts), episodes: agent.decisions, sampled: true });
        nextTest += testEvery;
        if (snapshotsAt.length && agent.decisions >= snapshotsAt[0]) {
          snapshotsAt.shift();
          postSnapshot(agent);
        }
        break; // report right away
      }
    }
    self.postMessage({ type: "progress", decisions_done: agent.decisions, episodes_done: agent.episodes,
      epsilon: epsilonAt(agent.decisions), curve, evaluations: evals });
    curve = [];
    evals = [];
    await new Promise((r) => setTimeout(r, 0)); // let "stop" messages in
  }

  const final = { ...sampledTest(lookup, starts), episodes: agent.decisions, sampled: true };
  let visited = 0;
  for (let i = 0; i < agent.N.length; i++) if (agent.N[i]) visited++;
  self.postMessage({ type: "progress", decisions_done: agent.decisions, episodes_done: agent.episodes,
    epsilon: epsilonAt(agent.decisions), curve, evaluations: [{ ...final, coverage: visited / agent.N.length }] });
  postSnapshot(agent);
  self.postMessage({ type: "done", status: stopRequested ? "stopped" : "done" });
}

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "start") train(msg);
  else if (msg.type === "stop") stopRequested = true;
};
