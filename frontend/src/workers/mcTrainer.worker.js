// Trains a Monte Carlo agent off the main thread and streams progress to the
// page (~10 messages/s), so the learning curve stays smooth and the UI never
// freezes. Snapshots of the Q-table are sent at each test checkpoint and at
// the end, so the page can save them (IndexedDB) and use the agent elsewhere.
import { randomStart, rng, runEpisode, sampledTest } from "../lib/engine.js";

const WINDOW = 500;           // training-return moving window, like the server
const TEST_GAMES = 5000;      // games per sampled test
const N_TESTS = 10;           // tests spread over the run (+ one at the end)
const SLICE_MS = 80;          // work between two progress messages

let stopRequested = false;
let agent = null;

function snapshot() {
  const n = agent.Q.size;
  const keys = new Int32Array(n), values = new Float64Array(n), visits = new Uint32Array(n);
  let i = 0;
  for (const [k, v] of agent.Q) {
    keys[i] = k;
    values[i] = v;
    visits[i] = agent.visits.get(k) || 0;
    i++;
  }
  return { keys, values, visits };
}

function postSnapshot(done) {
  const snap = snapshot();
  self.postMessage({ type: "snapshot", episodes_done: done, ...snap }, [snap.keys.buffer, snap.values.buffer, snap.visits.buffer]);
}

function test(starts, budget, episodes) {
  const t = sampledTest(agent, starts, budget);
  return { ...t, episodes, sampled: true };
}

async function train({ params, seed }) {
  const { episodes, alpha, epsilon, q0, budget } = params;
  agent = { Q: new Map(), visits: new Map(), alpha, epsilon, q0 };
  stopRequested = false;
  const rand = rng(seed);
  const startRand = rng(20240901); // the same test positions at every checkpoint
  const starts = Array.from({ length: TEST_GAMES }, () => randomStart(startRand));
  const checkpointEvery = Math.max(25, Math.floor(episodes / 400));
  const testEvery = Math.max(1, Math.floor(episodes / N_TESTS));
  const returns = new Float64Array(WINDOW), mates = new Uint8Array(WINDOW);
  let filled = 0, sumRet = 0, sumMate = 0;
  let done = 0, curve = [], evals = [];

  while (done < episodes && !stopRequested) {
    const sliceEnd = performance.now() + SLICE_MS;
    while (done < episodes && performance.now() < sliceEnd) {
      const st = runEpisode(agent, budget, rand);
      const slot = done % WINDOW;
      if (filled === WINDOW) { sumRet -= returns[slot]; sumMate -= mates[slot]; } else filled++;
      returns[slot] = st.ret;
      mates[slot] = st.outcome === "checkmate" ? 1 : 0;
      sumRet += returns[slot];
      sumMate += mates[slot];
      done++;
      if (done % checkpointEvery === 0 || done === episodes) {
        curve.push({ episode: done, mean_return: sumRet / filled, mate_rate: sumMate / filled, qtable_size: agent.Q.size });
      }
      if (done % testEvery === 0 && done < episodes) {
        evals.push(test(starts, budget, done));
        postSnapshot(done);
        break; // report right away
      }
    }
    self.postMessage({ type: "progress", episodes_done: done, qtable_size: agent.Q.size, curve, evaluations: evals });
    curve = [];
    evals = [];
    await new Promise((r) => setTimeout(r, 0)); // let "stop" messages in
  }

  const final = test(starts, budget, done);
  self.postMessage({ type: "progress", episodes_done: done, qtable_size: agent.Q.size, curve, evaluations: [final] });
  postSnapshot(done);
  self.postMessage({ type: "done", status: stopRequested ? "stopped" : "done" });
}

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "start") train(msg);
  else if (msg.type === "stop") stopRequested = true;
};
