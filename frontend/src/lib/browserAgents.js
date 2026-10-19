// Monte Carlo agents trained in the visitor's browser (Web Worker), saved in
// IndexedDB and usable by Play / Explore / Results without any server — so
// training works on a serverless host such as Vercel.
import { useEffect, useState } from "react";
import { idb } from "./idb.js";
import { canonical, canonicalSquares, greedy, qKey, rng, sampledTest, randomStart, whiteMoves } from "./engine.js";
import { sqName } from "./chess.js";

const V_STAR = 0.927126;

const store = {
  agents: [],          // metadata of every saved agent, newest first
  loaded: false,
  live: {},            // id -> live job object while training in this tab
  workers: {},         // id -> Worker
  subscribers: new Set(),
};
const qCache = new Map(); // id -> { Q, visits, q0, episodes }

function emit() {
  const state = { agents: store.agents, loaded: store.loaded, live: { ...store.live } };
  store.subscribers.forEach((fn) => fn(state));
}

async function loadList() {
  try {
    const list = await idb.getAll("agents");
    store.agents = list.sort((a, b) => b.started_at - a.started_at);
  } catch {
    store.agents = [];
  }
  // Runs interrupted by closing the tab are kept as "stopped" with their last snapshot.
  for (const a of store.agents) {
    if (a.status === "running" && !store.workers[a.id]) {
      a.status = "stopped";
      idb.put("agents", a).catch(() => {});
    }
  }
  store.loaded = true;
  emit();
}

async function saveMeta(meta) {
  const i = store.agents.findIndex((a) => a.id === meta.id);
  if (i >= 0) store.agents[i] = meta; else store.agents.unshift(meta);
  emit();
  await idb.put("agents", meta).catch(() => {});
}

const withDerived = (e) => ({ ...e, v_star: V_STAR, pct_of_optimal: (100 * e.mean_return) / V_STAR });

/** Start training in a Web Worker; returns the new agent id. */
export function startBrowserTraining(params) {
  const id = `b${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const meta = {
    id, kind: "browser", params, status: "running", started_at: Date.now() / 1000,
    episodes_done: 0, episodes_target: params.episodes, qtable_size: 0, curve: [], evaluations: [], has_qtable: false,
  };
  store.live[id] = { ...meta, job_id: id, eval_status: "idle" };
  saveMeta(meta);

  const worker = new Worker(new URL("../workers/mcTrainer.worker.js", import.meta.url), { type: "module" });
  store.workers[id] = worker;
  // Handle messages strictly in order (saving a snapshot is asynchronous).
  let queue = Promise.resolve();
  worker.onmessage = (e) => {
    queue = queue.then(() => handle(e.data)).catch(() => {});
  };
  const handle = async (msg) => {
    const live = store.live[id];
    if (!live) return;
    if (msg.type === "progress") {
      live.episodes_done = msg.episodes_done;
      live.qtable_size = msg.qtable_size;
      if (msg.curve.length) live.curve = live.curve.concat(msg.curve);
      if (msg.evaluations.length) live.evaluations = live.evaluations.concat(msg.evaluations.map(withDerived));
      store.live[id] = { ...live };
      emit();
    } else if (msg.type === "snapshot") {
      await idb.put("qtables", { keys: msg.keys, values: msg.values, visits: msg.visits }, id).catch(() => {});
      qCache.delete(id);
      const { job_id: _j, eval_status: _e, ...m } = store.live[id];
      await saveMeta({ ...m, has_qtable: true, snapshot_episodes: msg.episodes_done });
      store.live[id] = { ...store.live[id], has_qtable: true };
    } else if (msg.type === "done") {
      const { job_id: _j, eval_status: _e, ...m } = store.live[id];
      await saveMeta({ ...m, status: msg.status, has_qtable: true, finished_at: Date.now() / 1000 });
      worker.terminate();
      delete store.workers[id];
      delete store.live[id];
      emit();
    }
  };
  worker.postMessage({ type: "start", params, seed: Math.floor(Math.random() * 2 ** 31) });
  return id;
}

export function stopBrowserTraining(id) {
  store.workers[id]?.postMessage({ type: "stop" });
}

export async function deleteBrowserAgent(id) {
  stopBrowserTraining(id);
  store.agents = store.agents.filter((a) => a.id !== id);
  qCache.delete(id);
  emit();
  await idb.delete("agents", id).catch(() => {});
  await idb.delete("qtables", id).catch(() => {});
}

export async function clearBrowserAgents() {
  Object.keys(store.workers).forEach(stopBrowserTraining);
  store.agents = [];
  qCache.clear();
  emit();
  await idb.clear("agents").catch(() => {});
  await idb.clear("qtables").catch(() => {});
}

/** Load (and cache) an agent's Q-table as Maps. */
export async function loadAgent(id) {
  const meta = store.agents.find((a) => a.id === id);
  const cached = qCache.get(id);
  if (cached && cached.episodes === meta?.snapshot_episodes) return cached;
  const t = await idb.get("qtables", id);
  if (!t) throw new Error("This agent has no saved Q-table yet — wait for its first checkpoint.");
  const Q = new Map(), visits = new Map();
  for (let i = 0; i < t.keys.length; i++) {
    Q.set(t.keys[i], t.values[i]);
    visits.set(t.keys[i], t.visits[i]);
  }
  const agent = { Q, visits, q0: meta?.params.q0 ?? 1, episodes: meta?.snapshot_episodes };
  qCache.set(id, agent);
  return agent;
}

/** The agent's greedy move, in the same shape as the server's /agent_move. */
export async function browserAgentMove(id, wk, wq, bk) {
  const agent = await loadAgent(id);
  const { move, value } = greedy(agent.Q, agent.q0, wk, wq, bk, Math.random);
  return { piece: move[0] === 0 ? "K" : "Q", dest: move[1], dest_name: sqName(move[1]), value, source: "mc" };
}

/** Learned value of every legal move, in the same shape as /train/qtable. */
export async function browserQValues(id, wk, wq, bk) {
  const agent = await loadAgent(id);
  const canon = canonical(wk, wq, bk);
  const rows = whiteMoves(wk, wq, bk).map(([p, d]) => {
    const key = qKey(canon, p, d);
    return { piece: p === 0 ? "K" : "Q", dest: d, dest_name: sqName(d), q: agent.Q.get(key) ?? agent.q0, visits: agent.visits.get(key) || 0 };
  });
  rows.sort((a, b) => b.q - a.q);
  const c = canonicalSquares(wk, wq, bk);
  return { qvalues: rows, canonical: { wk: sqName(c.wk), wq: sqName(c.wq), bk: sqName(c.bk), symmetry: c.symmetry } };
}

/** Sampled test (5,000 games) of a saved agent, run in the page. */
export async function testBrowserAgent(id) {
  const agent = await loadAgent(id);
  const meta = store.agents.find((a) => a.id === id);
  const r = rng(20240901);
  const starts = Array.from({ length: 5000 }, () => randomStart(r));
  const res = withDerived({ ...sampledTest(agent, starts, meta.params.budget), episodes: meta.snapshot_episodes ?? meta.episodes_done, sampled: true });
  await saveMeta({ ...meta, evaluations: [...meta.evaluations, res] });
  return res;
}

/** { agents, loaded, live } — every saved browser agent plus live training state. */
export function useBrowserAgents() {
  const [state, setState] = useState({ agents: store.agents, loaded: store.loaded, live: store.live });
  useEffect(() => {
    store.subscribers.add(setState);
    if (!store.loaded) loadList();
    return () => store.subscribers.delete(setState);
  }, []);
  return state;
}

/** A job-shaped object for one browser agent (live while training, saved otherwise). */
export function useBrowserJob(id) {
  const { agents, live } = useBrowserAgents();
  if (!id) return null;
  if (live[id]) return live[id];
  const meta = agents.find((a) => a.id === id);
  return meta ? { ...meta, job_id: meta.id, eval_status: "idle" } : null;
}
